/**
 * StreamsView - Dedicated view for streams
 * Left: Stream channel list (30%)
 * Right: Entries table for selected stream (70%)
 * Uses shared DetailPanel for entry details
 * Uses VirtualLogGrid for consistent look with All Logs view
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useLogStore, StreamEntry } from '../store/logStore';
import { HighlightRulesPanel } from './HighlightRulesPanel';
import { format, formatDistanceToNow } from 'date-fns';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAutoScroll } from './VirtualLogGrid/useAutoScroll';
import { useScrollDetection } from './VirtualLogGrid/useScrollDetection';

// Format timestamp for display
function formatTime(timestamp: string): string {
    try {
        return format(new Date(timestamp), 'HH:mm:ss.SSS');
    } catch {
        return timestamp;
    }
}

interface StreamsViewProps {
    onSelectEntry: (entry: StreamEntry | null) => void;
    selectedEntryId: number | null;
}

export function StreamsView({ onSelectEntry, selectedEntryId }: StreamsViewProps) {
    const { streams, streamTotalReceived, clearAllStreams, clearStream, theme } = useLogStore();
    const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
    const [filterTextByChannel, setFilterTextByChannel] = useState<Record<string, string>>({});
    const [paused, setPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [showHighlightRules, setShowHighlightRules] = useState(false);

    // Snapshot mode state - per channel
    const [snapshotMode, setSnapshotMode] = useState<Record<string, boolean>>({});
    const [snapshots, setSnapshots] = useState<Record<string, {
        entries: StreamEntry[];
        capturedAt: Date;
        frozenSelectedId: number | null;
        totalAtCapture: number; // Total received at time of snapshot (for badge calculation)
    }>>({});

    // Slow mode playback control - absolute rate (entries/sec)
    const [isSlowMode, setIsSlowMode] = useState(false);
    const [displayRate, setDisplayRate] = useState(10); // 1-30 entries/sec when in slow mode
    const [playbackBuffer, setPlaybackBuffer] = useState<StreamEntry[]>([]);
    const [slowModeDisplayEntries, setSlowModeDisplayEntries] = useState<StreamEntry[]>([]);
    const lastProcessedRef = useRef(0); // Track last processed entry from live stream
    const [bufferFull, setBufferFull] = useState(false); // Track when buffer reaches capacity
    const [newestEntryId, setNewestEntryId] = useState<string | null>(null); // Track newest entry for animation

    // Speedometer - track events per second per channel (for display only, not for playback)
    const [streamSpeed, setStreamSpeed] = useState<Record<string, number>>({});

    // Grid container ref for virtualization
    const parentRef = useRef<HTMLDivElement>(null);

    // Internal state for smooth auto-scroll
    const [stuckToBottom, setStuckToBottom] = useState(true);

    // Resizable panel width
    const [listWidth, setListWidth] = useState(280);
    const resizingRef = useRef(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const startResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        resizingRef.current = true;
        startXRef.current = e.clientX;
        startWidthRef.current = listWidth;

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingRef.current) return;
            const delta = e.clientX - startXRef.current;
            const newWidth = Math.max(150, Math.min(500, startWidthRef.current + delta));
            setListWidth(newWidth);
        };

        const handleMouseUp = () => {
            resizingRef.current = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }, [listWidth]);

    // Snapshot mode handlers
    const isInSnapshotMode = selectedChannel ? (snapshotMode[selectedChannel] || false) : false;
    const currentSnapshot = selectedChannel ? snapshots[selectedChannel] : undefined;

    const enterSnapshotMode = useCallback(() => {
        if (!selectedChannel) return;

        // Clear any buffering state first
        setPlaybackBuffer([]);
        setBufferFull(false);
        lastProcessedRef.current = 0;

        // Snapshot current displayed entries (use slow mode display if active, otherwise live)
        const entriesToSnapshot = isSlowMode
            ? slowModeDisplayEntries
            : (streams[selectedChannel] || []);

        setSnapshotMode(prev => ({ ...prev, [selectedChannel]: true }));
        setSnapshots(prev => ({
            ...prev,
            [selectedChannel]: {
                entries: [...entriesToSnapshot], // Shallow copy for stability
                capturedAt: new Date(),
                frozenSelectedId: selectedEntryId,
                totalAtCapture: streamTotalReceived[selectedChannel] || 0
            }
        }));
    }, [selectedChannel, streams, selectedEntryId, isSlowMode, slowModeDisplayEntries, streamTotalReceived]);

    const exitSnapshotMode = useCallback(() => {
        if (!selectedChannel) return;

        // Clean exit: reset all playback state
        setPlaybackBuffer([]);
        setBufferFull(false);
        const liveEntries = streams[selectedChannel] || [];
        lastProcessedRef.current = liveEntries.length;
        setSlowModeDisplayEntries(liveEntries);

        setSnapshotMode(prev => ({ ...prev, [selectedChannel]: false }));
        setSnapshots(prev => {
            const newSnapshots = { ...prev };
            delete newSnapshots[selectedChannel];
            return newSnapshots;
        });
        // Re-enable auto-scroll when exiting snapshot
        setAutoScroll(true);
        setStuckToBottom(true);
    }, [selectedChannel, streams]);

    // Playback buffer constant
    const PLAYBACK_BUFFER_MAX = 1000;

    // Clear selected stream only
    const handleClearSelected = useCallback(() => {
        if (selectedChannel) {
            clearStream(selectedChannel);
        }
    }, [selectedChannel, clearStream]);

    // Clear all streams (for footer button)
    const handleClearAll = useCallback(async () => {
        try {
            await fetch('/api/streams', { method: 'DELETE' });
            clearAllStreams();
            setSelectedChannel(null);
        } catch (err) {
            console.error('Failed to clear streams:', err);
        }
    }, [clearAllStreams]);

    const channels = Object.keys(streams);

    // Track previous total for speed calculation
    const prevTotalRef = useRef<Record<string, number>>({});
    const isFirstTickRef = useRef<Record<string, boolean>>({});
    // Use ref to access latest totals without recreating interval
    const totalReceivedRef = useRef(streamTotalReceived);
    totalReceivedRef.current = streamTotalReceived;
    const channelsRef = useRef(channels);
    channelsRef.current = channels;

    // Speedometer effect - calculates rate based on store's total received counter
    useEffect(() => {
        const interval = setInterval(() => {
            const newSpeeds: Record<string, number> = {};
            const currentTotals = totalReceivedRef.current;

            for (const channel of channelsRef.current) {
                const currentTotal = currentTotals[channel] || 0;

                // First tick for this channel: initialize ref, show 0/s
                if (!isFirstTickRef.current[channel]) {
                    isFirstTickRef.current[channel] = true;
                    prevTotalRef.current[channel] = currentTotal;
                    newSpeeds[channel] = 0;
                    continue;
                }

                const prevTotal = prevTotalRef.current[channel] || 0;
                const diff = currentTotal - prevTotal;

                // Calculate events per second (we measure every 500ms, so multiply by 2)
                newSpeeds[channel] = Math.max(0, diff * 2);
                prevTotalRef.current[channel] = currentTotal;
            }

            setStreamSpeed(newSpeeds);
        }, 500); // Update every 500ms for smoother display

        return () => clearInterval(interval);
    }, []); // Empty deps - interval runs continuously using refs for fresh data

    // Get source entries - either from snapshot, slow mode display, or live stream
    const sourceEntries = useMemo(() => {
        if (!selectedChannel) return [];

        // Snapshot mode takes priority
        if (isInSnapshotMode && currentSnapshot) {
            return currentSnapshot.entries;
        }

        // Slow mode: use buffered display entries
        if (isSlowMode) {
            return slowModeDisplayEntries;
        }

        // Live mode: direct pass-through from live stream
        return streams[selectedChannel] || [];
    }, [selectedChannel, isInSnapshotMode, currentSnapshot, isSlowMode, slowModeDisplayEntries, streams]);

    // Auto-select first channel - use useEffect to avoid setState during render
    useEffect(() => {
        if (!selectedChannel && channels.length > 0) {
            setSelectedChannel(channels[0]);
        }
    }, [selectedChannel, channels]);

    // Get filter text for current channel
    const filterText = selectedChannel ? (filterTextByChannel[selectedChannel] || '') : '';

    // Filter entries
    const filteredEntries = useMemo(() => {
        if (!filterText) return sourceEntries;
        const lower = filterText.toLowerCase();
        return sourceEntries.filter(e => e.data.toLowerCase().includes(lower));
    }, [sourceEntries, filterText]);

    // Store paused entries separately
    const [pausedEntries, setPausedEntries] = useState<StreamEntry[]>([]);
    const wasPausedRef = useRef(false);

    // Update paused entries ONLY when transitioning from unpaused to paused
    useEffect(() => {
        if (paused && !wasPausedRef.current) {
            // Just paused - capture current entries
            setPausedEntries(filteredEntries);
        }
        wasPausedRef.current = paused;
    }, [paused]); // Only depend on paused, not filteredEntries

    const displayedEntries = paused ? pausedEntries : filteredEntries;

    // Calculate how many new entries arrived since snapshot
    // Use streamTotalReceived and snapshot's totalAtCapture (not capped by ring buffer)
    const newEntriesSinceSnapshot = useMemo(() => {
        if (!isInSnapshotMode || !currentSnapshot || !selectedChannel) return 0;
        const currentTotal = streamTotalReceived[selectedChannel] || 0;
        const snapshotTotal = currentSnapshot.totalAtCapture || 0;
        return Math.max(0, currentTotal - snapshotTotal);
    }, [isInSnapshotMode, currentSnapshot, selectedChannel, streamTotalReceived]);

    // Auto-cleanup stale snapshots after 5 minutes
    useEffect(() => {
        if (!isInSnapshotMode || !currentSnapshot) return;

        const cleanupTimer = setTimeout(() => {
            console.log('[StreamsView] Auto-cleaning stale snapshot (5 min timeout)');
            exitSnapshotMode();
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearTimeout(cleanupTimer);
    }, [isInSnapshotMode, currentSnapshot, exitSnapshotMode]);

    // Ref to track previous slow mode state for transitions
    const wasSlowModeRef = useRef(false);
    // Use ref to access streams without adding to effect deps
    const streamsRef = useRef(streams);
    streamsRef.current = streams;

    // Track the total received count at time of entering slow mode
    const slowModeStartTotalRef = useRef(0);

    // Combined effect for slow mode - handles both transitions and buffering
    useEffect(() => {
        if (!selectedChannel) return;
        if (isInSnapshotMode) return;

        const liveEntries = streams[selectedChannel] || [];
        const currentTotal = streamTotalReceived[selectedChannel] || 0;

        if (!isSlowMode) {
            // Exiting slow mode - reset state
            if (wasSlowModeRef.current) {
                setPlaybackBuffer([]);
                setBufferFull(false);
                lastProcessedRef.current = 0;
                slowModeStartTotalRef.current = 0;
            }
            wasSlowModeRef.current = false;
            return;
        }

        // Just entered slow mode - capture current state and mark position
        if (!wasSlowModeRef.current) {
            wasSlowModeRef.current = true;
            slowModeStartTotalRef.current = currentTotal;
            lastProcessedRef.current = currentTotal;
            setPlaybackBuffer([]);
            setBufferFull(false);
            setSlowModeDisplayEntries([...liveEntries]);
            return;
        }

        // Already in slow mode: buffer new entries based on total received counter
        const newCount = currentTotal - lastProcessedRef.current;
        if (newCount > 0) {
            // Get the last N entries from the live stream (they're the newest)
            const newEntries = liveEntries.slice(-Math.min(newCount, liveEntries.length));
            setPlaybackBuffer(prev => {
                const remaining = PLAYBACK_BUFFER_MAX - prev.length;

                if (remaining <= 0) {
                    // Buffer is already full - reject all new entries
                    setBufferFull(true);
                    return prev;
                }

                if (newEntries.length <= remaining) {
                    // All entries fit - add them all
                    const updated = [...prev, ...newEntries];
                    if (updated.length >= PLAYBACK_BUFFER_MAX) {
                        setBufferFull(true);
                    }
                    return updated;
                } else {
                    // Only some entries fit - add what we can, then stop
                    const entriesToAdd = newEntries.slice(0, remaining);
                    setBufferFull(true);
                    return [...prev, ...entriesToAdd];
                }
            });
            lastProcessedRef.current = currentTotal;
        }
    }, [selectedChannel, streams, streamTotalReceived, isSlowMode, isInSnapshotMode, PLAYBACK_BUFFER_MAX]);

    // Simple consumption timer - displays entries at fixed rate (displayRate entries/sec)
    // Use ref-based approach to ensure exactly one entry per tick, avoiding React batching issues
    const playbackBufferRef = useRef<StreamEntry[]>([]);
    playbackBufferRef.current = playbackBuffer;

    useEffect(() => {
        if (!isSlowMode) return; // Only consume in slow mode
        if (isInSnapshotMode) return; // Don't consume in snapshot mode

        const msPerEntry = 1000 / displayRate; // e.g., 5/sec = 200ms per entry

        const timer = setInterval(() => {
            // Read from ref to get latest buffer state without React batching delays
            const currentBuffer = playbackBufferRef.current;
            if (currentBuffer.length === 0) return;

            // Take exactly one entry
            const entry = currentBuffer[0];
            const rest = currentBuffer.slice(1);

            // Update buffer state
            setPlaybackBuffer(rest);

            // Clear buffer full warning when buffer drains below 90%
            if (rest.length < PLAYBACK_BUFFER_MAX * 0.9) {
                setBufferFull(false);
            }

            // Add entry to display - smooth scroll handles visual effect
            setNewestEntryId(entry.id); // Track for animation
            setSlowModeDisplayEntries(current => {
                const updated = [...current, entry];
                return updated.length > PLAYBACK_BUFFER_MAX
                    ? updated.slice(-PLAYBACK_BUFFER_MAX)
                    : updated;
            });
        }, msPerEntry);

        return () => clearInterval(timer);
    }, [isSlowMode, displayRate, isInSnapshotMode, PLAYBACK_BUFFER_MAX]);

    // Reset playback state when channel changes (only on channel change, not stream updates)
    const prevChannelRef = useRef<string | null>(null);
    useEffect(() => {
        if (selectedChannel !== prevChannelRef.current) {
            lastProcessedRef.current = 0;
            setPlaybackBuffer([]);
            setBufferFull(false);
            setSlowModeDisplayEntries(selectedChannel ? (streams[selectedChannel] || []) : []);
            prevChannelRef.current = selectedChannel;
        }
    }, [selectedChannel]); // Only depend on selectedChannel, access streams via closure

    // Row height for virtualization
    const ROW_HEIGHT = 32;

    // Virtualization
    const rowVirtualizer = useVirtualizer({
        count: displayedEntries.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 20,
    });

    // Effective autoscroll = user wants it AND scrollbar is at bottom
    const effectiveAutoScroll = autoScroll && stuckToBottom && !paused;

    // Smooth auto-scroll hook
    const {
        markUserScroll,
        markStuckToBottom,
        isProgrammaticScroll,
        instantScrollToBottom,
    } = useAutoScroll({
        scrollElement: parentRef.current,
        entriesCount: displayedEntries.length,
        autoScrollEnabled: effectiveAutoScroll,
        onUserScrollUp: () => {
            setStuckToBottom(false);
        },
    });

    // Scroll detection hook - now with snapshot trigger
    useScrollDetection({
        scrollElement: parentRef.current,
        onUserScrollUp: useCallback(() => {
            markUserScroll();
            setStuckToBottom(false);
            // AUTO-TRIGGER: Enter snapshot when scrolling up (unless already in snapshot or paused)
            if (!isInSnapshotMode && !paused) {
                enterSnapshotMode();
            }
        }, [markUserScroll, isInSnapshotMode, paused, enterSnapshotMode]),
        onScrollToBottom: useCallback(() => {
            markStuckToBottom();
            setStuckToBottom(true);
        }, [markStuckToBottom]),
        isProgrammaticScroll,
    });

    // Handler for "Jump to bottom" button
    const handleJumpToBottom = useCallback(() => {
        setStuckToBottom(true);
        markStuckToBottom();
        instantScrollToBottom();
    }, [markStuckToBottom, instantScrollToBottom]);

    // Handler for "Jump to Live" button - exits snapshot mode
    const handleJumpToLive = useCallback(() => {
        exitSnapshotMode();
        setStuckToBottom(true);
        markStuckToBottom();
        instantScrollToBottom();
    }, [exitSnapshotMode, markStuckToBottom, instantScrollToBottom]);

    // Handle row click - using useCallback with ref to avoid closure issues during rapid updates
    const handleRowClickRef = useRef<(entry: StreamEntry) => void>();
    handleRowClickRef.current = (entry: StreamEntry) => {
        // Select the entry for detail panel
        onSelectEntry(entry);

        // Enter snapshot mode if not already in it (prevents stream from moving)
        if (!isInSnapshotMode && !paused) {
            enterSnapshotMode();
        }
    };

    const handleRowClick = useCallback((entry: StreamEntry) => {
        handleRowClickRef.current?.(entry);
    }, []);

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const currentIndex = displayedEntries.findIndex(entry => entry.id === selectedEntryId);
            let newIndex: number;

            if (e.key === 'ArrowDown') {
                newIndex = currentIndex < displayedEntries.length - 1 ? currentIndex + 1 : currentIndex;
            } else {
                newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
            }

            if (newIndex >= 0 && newIndex < displayedEntries.length) {
                const entry = displayedEntries[newIndex];
                onSelectEntry(entry);
                rowVirtualizer.scrollToIndex(newIndex, { align: 'auto' });
            }
        }
    }, [displayedEntries, selectedEntryId, onSelectEntry, rowVirtualizer]);

    const totalCount = channels.reduce((sum, ch) => sum + (streams[ch]?.length || 0), 0);

    const virtualItems = rowVirtualizer.getVirtualItems();

    return (
        <div className="h-full flex">
            {/* Left: Stream channel list (resizable) */}
            <div
                className="flex flex-col bg-slate-50 dark:bg-slate-800 flex-shrink-0"
                style={{ width: listWidth }}
            >
                {/* Header - same height as right side toolbar */}
                <div className="h-[42px] px-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
                    <span className="font-medium text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wide">
                        <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Streams
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">{channels.length} channels</span>
                </div>

                {/* Channel list */}
                <div className="flex-1 overflow-auto">
                    {channels.length === 0 ? (
                        <div className="p-4 text-center">
                            <svg className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <p className="text-sm text-slate-400 dark:text-slate-500">No streams yet</p>
                            <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Use logStream() to send data</p>
                        </div>
                    ) : (
                        channels.map(channel => {
                            const count = streams[channel]?.length || 0;
                            const speed = streamSpeed[channel] ?? 0;
                            const isSelected = selectedChannel === channel;
                            return (
                                <button
                                    key={channel}
                                    onClick={() => setSelectedChannel(channel)}
                                    className={`w-full px-3 py-2 text-left flex items-center transition-colors ${
                                        isSelected
                                            ? 'bg-purple-500 text-white'
                                            : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                    {/* Channel name - flexible width */}
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <svg className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-purple-200' : 'text-slate-400 dark:text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        <span className="text-sm font-medium truncate">{channel}</span>
                                    </div>
                                    {/* Speed column - fixed width for alignment */}
                                    <span className={`text-[10px] font-mono tabular-nums w-12 text-right flex-shrink-0 ${
                                        isSelected
                                            ? 'text-purple-200'
                                            : speed > 0
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-slate-400 dark:text-slate-500'
                                    }`}>
                                        {speed}/s
                                    </span>
                                    {/* Entry count badge - fixed width container, center-aligned content */}
                                    <div className="w-14 flex-shrink-0 flex justify-end">
                                        <span className={`text-xs px-1.5 py-0.5 rounded text-center min-w-[2.5rem] ${
                                            isSelected
                                                ? 'bg-purple-600 text-purple-100'
                                                : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                                        }`}>
                                            {count}
                                        </span>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer stats with Clear All button */}
                <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Total: {totalCount} entries
                    </span>
                    <button
                        onClick={handleClearAll}
                        className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
                        title="Clear all streams"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Clear
                    </button>
                </div>
            </div>

            {/* Resize handle - same style as detail panel splitter */}
            <div
                className="w-1.5 bg-slate-200 dark:bg-slate-700 cursor-ew-resize flex-shrink-0 flex items-center justify-center group"
                onMouseDown={startResize}
            >
                <div className="h-8 w-0.5 bg-slate-400 dark:bg-slate-500 group-hover:bg-blue-600 rounded" />
            </div>

            {/* Right: Entries table */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Toolbar - filter, exclude, spacer, pause, autoscroll, clear (right-aligned) */}
                <div className="h-[42px] px-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center gap-2">
                    {/* Filter input - per stream */}
                    <div className="relative max-w-xs">
                        <input
                            type="text"
                            value={filterText}
                            onChange={(e) => {
                                if (selectedChannel) {
                                    setFilterTextByChannel(prev => ({
                                        ...prev,
                                        [selectedChannel]: e.target.value
                                    }));
                                }
                            }}
                            placeholder={selectedChannel ? `Filter ${selectedChannel}...` : 'Filter entries...'}
                            className="w-48 text-sm border border-slate-200 dark:border-slate-600 rounded pl-8 pr-3 py-1 h-[28px] bg-white dark:bg-slate-700 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* Live/Slow mode toggle and rate control */}
                    <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 dark:bg-slate-700/50 rounded border border-slate-200 dark:border-slate-600">
                        {/* Slowdown toggle button */}
                        <button
                            onClick={() => setIsSlowMode(!isSlowMode)}
                            className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                                isSlowMode
                                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                                    : 'bg-slate-400 text-white hover:bg-slate-500'
                            }`}
                            title={isSlowMode
                                ? 'Resume normal speed - display entries as they arrive'
                                : 'Slow down - buffer incoming entries and display at controlled rate'}
                        >
                            {isSlowMode ? 'Normal' : 'Slowdown'}
                        </button>

                        {/* Rate slider (only when in slow mode) */}
                        {isSlowMode && (
                            <>
                                <input
                                    type="range"
                                    min="1"
                                    max="30"
                                    value={displayRate}
                                    onChange={(e) => setDisplayRate(Number(e.target.value))}
                                    className="w-20 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                    title="Display rate (entries per second)"
                                />
                                <span className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums min-w-[28px]">
                                    {displayRate}/s
                                </span>
                                <span className={`text-xs whitespace-nowrap font-mono tabular-nums ${
                                    bufferFull
                                        ? 'text-red-600 dark:text-red-400 font-semibold animate-pulse'
                                        : 'text-amber-600 dark:text-amber-400'
                                }`}>
                                    {bufferFull ? 'FULL ' : 'Buf: '}{playbackBuffer.length}/{PLAYBACK_BUFFER_MAX}
                                </span>
                            </>
                        )}

                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Control buttons - icon only */}
                    <div className="flex items-center gap-1">
                        {/* Pause button */}
                        <button
                            onClick={() => setPaused(!paused)}
                            className={`p-1.5 rounded transition-colors ${
                                paused
                                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                            title={paused ? 'Resume' : 'Pause'}
                        >
                            {paused ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}
                        </button>

                        {/* AutoScroll button - 3 states: disabled (gray), active (blue), paused (amber) */}
                        <button
                            onClick={() => {
                                const newAutoScroll = !autoScroll;
                                setAutoScroll(newAutoScroll);

                                // If disabling autoscroll, exit snapshot mode
                                if (!newAutoScroll && isInSnapshotMode) {
                                    exitSnapshotMode();
                                }
                            }}
                            className={`p-1.5 rounded transition-colors ${
                                !autoScroll
                                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                                    : stuckToBottom
                                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/60'
                                        : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                            }`}
                            title={
                                !autoScroll
                                    ? 'Enable auto-scroll'
                                    : stuckToBottom
                                        ? 'Auto-scroll active (click to disable)'
                                        : 'Auto-scroll paused - scroll to bottom to resume'
                            }
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                        </button>

                        {/* Clear button - clears selected stream only */}
                        <button
                            onClick={handleClearSelected}
                            className="p-1.5 rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                            title={selectedChannel ? `Clear ${selectedChannel} stream` : 'Clear selected stream'}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>

                    {/* Settings button - separated */}
                    <div className="ml-2 pl-2 border-l border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => setShowHighlightRules(true)}
                            className="p-1.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                            title="Highlight rules"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Entries grid */}
                {selectedChannel ? (
                    <div
                        className={`flex-1 streams-grid-container virtual-log-grid ${theme === 'dark' ? 'dark' : 'light'}`}
                        tabIndex={0}
                        onKeyDown={handleKeyDown}
                    >
                        {/* Header row */}
                        <div className="vlg-header" style={{ display: 'flex', height: 32, borderBottom: '1px solid var(--vlg-border)' }}>
                            <div className="vlg-header-cell" style={{ flex: 1, minWidth: 200, padding: '0 8px', display: 'flex', alignItems: 'center' }}>
                                Content
                            </div>
                            <div className="vlg-header-cell" style={{ width: 100, padding: '0 8px', display: 'flex', alignItems: 'center' }}>
                                Type
                            </div>
                            <div className="vlg-header-cell" style={{ width: 110, padding: '0 8px', display: 'flex', alignItems: 'center' }}>
                                Time
                            </div>
                        </div>

                        {/* Virtualized body */}
                        <div
                            ref={parentRef}
                            className="vlg-body"
                            style={{
                                height: 'calc(100% - 32px)',
                                overflow: 'auto',
                                contain: 'strict'
                            }}
                        >
                            <div
                                style={{
                                    height: `${rowVirtualizer.getTotalSize()}px`,
                                    width: '100%',
                                    position: 'relative',
                                }}
                            >
                                {virtualItems.map((virtualRow) => {
                                    const entry = displayedEntries[virtualRow.index];
                                    const isSelected = entry.id === selectedEntryId;
                                    const isOdd = virtualRow.index % 2 === 1;
                                    const isNewest = entry.id === newestEntryId;

                                    return (
                                        <div
                                            key={`${entry.id}-${entry.timestamp}-${virtualRow.index}`}
                                            className={`vlg-row ${isOdd ? 'odd' : ''} ${isSelected ? 'row-selected' : ''} ${isNewest ? 'new-entry' : ''}`}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: `${virtualRow.size}px`,
                                                transform: `translateY(${virtualRow.start}px)`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                            }}
                                            onMouseDownCapture={(e) => {
                                                // Use mousedown with capture phase for maximum reliability during rapid updates
                                                // Capture phase fires before target phase, ensuring we get the event first
                                                if (e.button === 0) { // Only left mouse button
                                                    // Prevent text selection on double-click
                                                    if (e.detail > 1) e.preventDefault();
                                                    // Immediately handle the click
                                                    handleRowClick(entry);
                                                    // Stop propagation to prevent any interference
                                                    e.stopPropagation();
                                                }
                                            }}
                                        >
                                            {/* Content cell */}
                                            <div
                                                className="vlg-cell"
                                                style={{ flex: 1, minWidth: 200, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                            >
                                                <StreamContentCell data={entry.data} />
                                            </div>
                                            {/* Type cell */}
                                            <div
                                                className="vlg-cell"
                                                style={{ width: 100, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--vlg-text-muted)' }}
                                            >
                                                {entry.streamType}
                                            </div>
                                            {/* Time cell */}
                                            <div
                                                className="vlg-cell"
                                                style={{ width: 110, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                            >
                                                {formatTime(entry.timestamp)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Status bar */}
                        <div className="vlg-status-bar" style={{
                            height: 24,
                            borderTop: '1px solid var(--vlg-border)',
                            padding: '0 8px',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '11px',
                            color: 'var(--vlg-text-muted)'
                        }}>
                            {displayedEntries.length} entries
                            {filterText && ` (filtered from ${sourceEntries.length})`}
                        </div>

                        {/* Snapshot indicator - shows when in snapshot mode */}
                        {isInSnapshotMode && currentSnapshot && (
                            <div className="vlg-snapshot-indicator" style={{
                                position: 'absolute',
                                top: 52,  // Moved down to avoid overlapping toolbar (42px height + 10px margin)
                                left: '50%',
                                transform: 'translateX(-50%)',
                                padding: '6px 12px',
                                background: 'rgba(139, 92, 246, 0.9)',
                                color: 'white',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                zIndex: 1001,
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                            }}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>Snapshot from {formatDistanceToNow(currentSnapshot.capturedAt, {
                                    addSuffix: true,
                                    includeSeconds: true
                                })}</span>
                            </div>
                        )}

                        {/* Floating "Jump to Live" button - shows when in snapshot mode */}
                        {isInSnapshotMode && (
                            <button
                                onClick={handleJumpToLive}
                                className="vlg-jump-to-live"
                                title="Exit snapshot and jump to live stream"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Jump to Live</span>
                                {newEntriesSinceSnapshot > 0 && (
                                    <span className="vlg-new-entries-badge" style={{
                                        marginLeft: '4px',
                                        padding: '2px 6px',
                                        background: 'rgba(255, 255, 255, 0.25)',
                                        borderRadius: '10px',
                                        fontSize: '11px',
                                        fontWeight: 600
                                    }}>
                                        +{newEntriesSinceSnapshot}
                                    </span>
                                )}
                            </button>
                        )}

                        {/* Floating "Jump to Bottom" button - shows when autoscroll is enabled but user scrolled up (only when NOT in snapshot) */}
                        {!isInSnapshotMode && autoScroll && !stuckToBottom && (
                            <button
                                onClick={handleJumpToBottom}
                                className="vlg-jump-to-bottom"
                                title="Resume auto-scroll"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                </svg>
                                <span>Resume</span>
                            </button>
                        )}

                        {/* Buffer Full Warning - prominent floating banner */}
                        {isSlowMode && bufferFull && (
                            <div
                                className="absolute top-14 right-4 px-3 py-1.5 bg-red-500/95 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-lg animate-pulse"
                                style={{ zIndex: 1002 }}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>Buffer Full - Data being dropped</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-800">
                        <div className="text-center">
                            <svg className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                            </svg>
                            <p className="text-slate-400 dark:text-slate-500 text-sm">Select a stream channel</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Highlight rules modal */}
            {showHighlightRules && (
                <HighlightRulesPanel onClose={() => setShowHighlightRules(false)} />
            )}
        </div>
    );
}

// Content cell renderer - detects JSON and shows preview
// CSS textOverflow: ellipsis handles truncation based on available width
function StreamContentCell({ data }: { data: string }) {
    if (!data) return <span className="vlg-empty-data">-</span>;

    // Try to detect JSON and show preview
    const trimmed = data.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            const preview = JSON.stringify(parsed);
            return (
                <span className="font-mono text-xs">
                    {preview}
                </span>
            );
        } catch {
            // Not valid JSON, fall through to render as text
        }
    }

    return (
        <span className="text-xs">
            {data}
        </span>
    );
}
