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
import { format } from 'date-fns';
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
    const { streams, clearAllStreams, clearStream, theme } = useLogStore();
    const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
    const [filterTextByChannel, setFilterTextByChannel] = useState<Record<string, string>>({});
    const [paused, setPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [showHighlightRules, setShowHighlightRules] = useState(false);

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
    const entries = selectedChannel ? (streams[selectedChannel] || []) : [];

    // Auto-select first channel
    if (!selectedChannel && channels.length > 0) {
        setSelectedChannel(channels[0]);
    }

    // Get filter text for current channel
    const filterText = selectedChannel ? (filterTextByChannel[selectedChannel] || '') : '';

    // Filter entries
    const filteredEntries = useMemo(() => {
        if (!filterText) return entries;
        const lower = filterText.toLowerCase();
        return entries.filter(e => e.data.toLowerCase().includes(lower));
    }, [entries, filterText]);

    // Store paused entries separately
    const [pausedEntries, setPausedEntries] = useState<StreamEntry[]>([]);

    // Update paused entries when pause state changes
    useEffect(() => {
        if (paused) {
            setPausedEntries(filteredEntries);
        }
    }, [paused, filteredEntries]);

    const displayedEntries = paused ? pausedEntries : filteredEntries;

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

    // Scroll detection hook
    useScrollDetection({
        scrollElement: parentRef.current,
        onUserScrollUp: useCallback(() => {
            markUserScroll();
            setStuckToBottom(false);
        }, [markUserScroll]),
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

    // Handle row click
    const handleRowClick = useCallback((entry: StreamEntry) => {
        onSelectEntry(entry);
    }, [onSelectEntry]);

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
                            const isSelected = selectedChannel === channel;
                            return (
                                <button
                                    key={channel}
                                    onClick={() => setSelectedChannel(channel)}
                                    className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors ${
                                        isSelected
                                            ? 'bg-purple-500 text-white'
                                            : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <svg className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-purple-200' : 'text-slate-400 dark:text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        <span className="text-sm font-medium truncate">{channel}</span>
                                    </div>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                        isSelected
                                            ? 'bg-purple-600 text-purple-100'
                                            : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                                    }`}>
                                        {count}
                                    </span>
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
                            onClick={() => setAutoScroll(!autoScroll)}
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

                                    return (
                                        <div
                                            key={entry.id}
                                            className={`vlg-row ${isOdd ? 'odd' : ''} ${isSelected ? 'row-selected' : ''}`}
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
                                            onClick={() => handleRowClick(entry)}
                                        >
                                            {/* Content cell */}
                                            <div
                                                className="vlg-cell"
                                                style={{ flex: 1, minWidth: 200, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                title={entry.data}
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
                            {filterText && ` (filtered from ${entries.length})`}
                        </div>

                        {/* Floating "Jump to Bottom" button - shows when autoscroll is enabled but user scrolled up */}
                        {autoScroll && !stuckToBottom && (
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
function StreamContentCell({ data }: { data: string }) {
    if (!data) return <span className="vlg-empty-data">-</span>;

    // Try to detect JSON and show preview
    const trimmed = data.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            const preview = JSON.stringify(parsed).substring(0, 100);
            return (
                <span className="font-mono text-xs">
                    {preview}{preview.length >= 100 ? '...' : ''}
                </span>
            );
        } catch {
            // Not valid JSON
        }
    }

    return (
        <span className="text-xs">
            {data.length > 100 ? data.substring(0, 100) + '...' : data}
        </span>
    );
}
