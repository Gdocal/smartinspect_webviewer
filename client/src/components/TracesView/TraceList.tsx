/**
 * TraceList - Virtualized list of traces with live updates
 *
 * Features:
 * - TanStack Virtual for efficient rendering of large trace lists
 * - Simple debounced scroll-to-bottom (lightweight, no RAF loops)
 * - No pagination - continuous virtualized list
 * - Pause auto-scroll when user selects trace or scrolls up
 * - Resume button with paused count indicator
 * - Compact row design with row density support
 */

import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    useTraceStore,
    fetchTraces,
    fetchTrace,
    fetchTraceTree,
    fetchTraceStats,
    formatDuration,
    formatTraceTime,
    TraceSummary
} from '../../store/traceStore';
import { useLogStore } from '../../store/logStore';
import { getTraceRowHeight, RowDensity } from '../VirtualLogGrid/constants';

// Overscan values for smooth scrolling
const OVERSCAN = 20;

export function TraceList() {
    const {
        traces,
        totalTraces,
        selectedTraceId,
        loadingTraces,
        filter,
        stats,
        error,
        autoScroll,
        pausedNewCount,
        setTraces,
        setSelectedTraceId,
        setSelectedTrace,
        setTraceTree,
        setStats,
        setLoadingTraces,
        setLoadingTrace,
        setLoadingTree,
        setFilter,
        setError,
        setAutoScroll,
        resetPausedCount,
        clearSelection
    } = useTraceStore();

    // Get row density setting from log store
    const { rowDensity } = useLogStore();
    const rowHeight = getTraceRowHeight(rowDensity);

    // Refs
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Filter traces based on current filter settings (client-side filtering)
    const filteredTraces = useMemo(() => {
        let result = traces;

        // Status filter
        if (filter.status === 'ok') {
            result = result.filter(t => !t.hasError);
        } else if (filter.status === 'error') {
            result = result.filter(t => t.hasError);
        }

        // Service filter
        if (filter.services && filter.services.length > 0) {
            result = result.filter(t =>
                t.serviceNames?.some(s => filter.services!.includes(s))
            );
        }

        // Operation filter
        if (filter.operations && filter.operations.length > 0) {
            result = result.filter(t => {
                // Match operation against root span name (first word or full name)
                if (!t.rootSpanName) return false;
                const op = t.rootSpanName.split(' ')[0];
                return filter.operations!.includes(op) || filter.operations!.includes(t.rootSpanName);
            });
        }

        // Duration filter
        if (filter.minDuration !== undefined) {
            result = result.filter(t => (t.duration ?? 0) >= filter.minDuration!);
        }
        if (filter.maxDuration !== undefined) {
            result = result.filter(t => (t.duration ?? Infinity) <= filter.maxDuration!);
        }

        // Tag filter - Note: TraceSummary doesn't have tags, would need server-side filtering
        // For now, we'll do what we can with the data available

        // Search filter
        if (filter.search) {
            const search = filter.search.toLowerCase();
            result = result.filter(t =>
                t.rootSpanName?.toLowerCase().includes(search) ||
                t.traceId.toLowerCase().includes(search) ||
                t.serviceNames?.some(s => s.toLowerCase().includes(search))
            );
        }

        // Sort
        if (filter.sort === 'duration') {
            result = [...result].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
        } else if (filter.sort === 'spans') {
            result = [...result].sort((a, b) => b.spanCount - a.spanCount);
        }
        // 'recent' is default order (oldest first, newest last)

        return result;
    }, [traces, filter]);

    // Simple auto-scroll without the complex hook to reduce CPU usage
    // Use a basic scroll-to-bottom approach instead
    const scrollToBottomRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-scroll to bottom when new traces arrive
    useEffect(() => {
        if (autoScroll && scrollContainerRef.current && filteredTraces.length > 0) {
            // Debounce to prevent too many scroll operations
            if (scrollToBottomRef.current) {
                clearTimeout(scrollToBottomRef.current);
            }
            scrollToBottomRef.current = setTimeout(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
                }
            }, 100);
        }
        return () => {
            if (scrollToBottomRef.current) {
                clearTimeout(scrollToBottomRef.current);
            }
        };
    }, [autoScroll, filteredTraces.length]);

    // Handle user scroll - disable auto-scroll when user scrolls up
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
        if (!isAtBottom && autoScroll) {
            setAutoScroll(false);
        }
    }, [autoScroll, setAutoScroll]);

    // Virtual list
    const virtualizer = useVirtualizer({
        count: filteredTraces.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => rowHeight,
        overscan: OVERSCAN,
        getItemKey: (index) => filteredTraces[index].traceId
    });

    // Load traces
    const loadTraces = useCallback(async () => {
        setLoadingTraces(true);
        setError(null);
        try {
            const result = await fetchTraces(filter);
            setTraces(result.traces, result.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load traces');
        } finally {
            setLoadingTraces(false);
        }
    }, [filter, setTraces, setLoadingTraces, setError]);

    // Load stats
    const loadStats = useCallback(async () => {
        try {
            const statsData = await fetchTraceStats();
            setStats(statsData);
        } catch (err) {
            console.error('Failed to load trace stats:', err);
        }
    }, [setStats]);

    // Initial load only - live updates come via WebSocket
    useEffect(() => {
        loadTraces();
        loadStats();
    }, [loadTraces, loadStats]);

    // Resume auto-scroll
    const handleResumeAutoScroll = useCallback(() => {
        setAutoScroll(true);
        resetPausedCount();
        // Scroll to bottom
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [setAutoScroll, resetPausedCount]);

    // Select a trace - pause auto-scroll when selecting
    const handleSelectTrace = useCallback(async (trace: TraceSummary) => {
        // Pause auto-scroll when user clicks on a trace
        setAutoScroll(false);

        if (selectedTraceId === trace.traceId) {
            clearSelection();
            return;
        }

        setSelectedTraceId(trace.traceId);
        setLoadingTrace(true);
        setLoadingTree(true);

        try {
            // Load full trace and tree in parallel
            const [fullTrace, tree] = await Promise.all([
                fetchTrace(trace.traceId),
                fetchTraceTree(trace.traceId)
            ]);
            setSelectedTrace(fullTrace);
            setTraceTree(tree);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load trace');
        } finally {
            setLoadingTrace(false);
            setLoadingTree(false);
        }
    }, [selectedTraceId, clearSelection, setSelectedTraceId, setSelectedTrace, setTraceTree, setLoadingTrace, setLoadingTree, setError, setAutoScroll]);

    const virtualItems = virtualizer.getVirtualItems();

    return (
        <div className="h-full flex flex-col">
            {/* Header with filters */}
            <div className="flex-shrink-0 p-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Traces
                    </h3>
                    {stats && (
                        <div className="flex items-center gap-1 text-[10px]">
                            {stats.activeTraces > 0 && (
                                <span className="flex items-center gap-0.5 px-1 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                                    <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                                    {stats.activeTraces}
                                </span>
                            )}
                            <span className="text-slate-400 dark:text-slate-500">
                                {filteredTraces.length}{filteredTraces.length !== totalTraces ? ` / ${totalTraces}` : ''} traces
                            </span>
                        </div>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                        {/* Resume auto-scroll button with count */}
                        {!autoScroll && (
                            <button
                                onClick={handleResumeAutoScroll}
                                className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1"
                                title="Resume auto-scroll"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                </svg>
                                Resume
                                {pausedNewCount > 0 && (
                                    <span className="ml-0.5 px-1 py-0 bg-blue-600 rounded text-[9px]">
                                        +{pausedNewCount}
                                    </span>
                                )}
                            </button>
                        )}
                        {/* Live indicator */}
                        {autoScroll && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                Live
                            </span>
                        )}
                        <button
                            onClick={() => { loadTraces(); loadStats(); }}
                            disabled={loadingTraces}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                            title="Refresh"
                        >
                            <svg className={`w-3.5 h-3.5 ${loadingTraces ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Compact filter controls */}
                <div className="flex items-center gap-1.5">
                    <input
                        type="text"
                        placeholder="Search..."
                        value={filter.search}
                        onChange={(e) => setFilter({ search: e.target.value })}
                        className="flex-1 min-w-20 px-1.5 py-1 text-[10px] border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <select
                        value={filter.status}
                        onChange={(e) => setFilter({ status: e.target.value as 'all' | 'ok' | 'error' })}
                        className="px-1 py-1 text-[10px] border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value="all">All</option>
                        <option value="ok">Ok</option>
                        <option value="error">Err</option>
                    </select>
                    <select
                        value={filter.sort}
                        onChange={(e) => setFilter({ sort: e.target.value as 'recent' | 'duration' | 'spans' })}
                        className="px-1 py-1 text-[10px] border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value="recent">Time</option>
                        <option value="duration">Dur</option>
                        <option value="spans">Spans</option>
                    </select>
                </div>
            </div>

            {/* Error message */}
            {error && (
                <div className="flex-shrink-0 px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px]">
                    {error}
                </div>
            )}

            {/* Virtualized trace list */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-auto"
                onScroll={handleScroll}
            >
                {loadingTraces && filteredTraces.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </div>
                ) : filteredTraces.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs p-4">
                        <svg className="w-8 h-8 mb-2 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="font-medium text-[11px]">No traces</span>
                        <span className="text-[10px] mt-0.5 text-center text-slate-500">
                            Add _traceId to logs
                        </span>
                    </div>
                ) : (
                    <div
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative'
                        }}
                    >
                        {virtualItems.map((virtualItem) => {
                            const trace = filteredTraces[virtualItem.index];
                            return (
                                <div
                                    key={virtualItem.key}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualItem.size}px`,
                                        transform: `translateY(${virtualItem.start}px)`
                                    }}
                                >
                                    <TraceRow
                                        trace={trace}
                                        isSelected={selectedTraceId === trace.traceId}
                                        onClick={() => handleSelectTrace(trace)}
                                        rowDensity={rowDensity}
                                        rowHeight={virtualItem.size}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer with count */}
            <div className="flex-shrink-0 px-2 py-1 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                <span>{filteredTraces.length} traces</span>
                {!autoScroll && pausedNewCount > 0 && (
                    <span className="text-blue-500">+{pausedNewCount} new</span>
                )}
            </div>
        </div>
    );
}

// Individual trace row - compact design
interface TraceRowProps {
    trace: TraceSummary;
    isSelected: boolean;
    onClick: () => void;
    rowDensity: RowDensity;
    rowHeight: number;
}

function TraceRow({ trace, isSelected, onClick, rowDensity }: TraceRowProps) {
    // Use isActive from API if available, otherwise fallback to time-based check
    const isActive = trace.isActive ?? (!trace.endTime ||
        (new Date().getTime() - new Date(trace.endTime).getTime() < 5000));

    // Compact row styling based on density
    const paddingClass = rowDensity === 'compact' ? 'px-2 py-1' : rowDensity === 'comfortable' ? 'px-3 py-2' : 'px-2 py-1.5';
    const statusDotSize = rowDensity === 'compact' ? 'w-1.5 h-1.5' : 'w-2 h-2';

    return (
        <div
            className={`${paddingClass} cursor-pointer transition-colors h-full flex flex-col justify-center ${
                isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border-l-2 border-transparent'
            }`}
            onClick={onClick}
        >
            {/* Single line: status dot + name + duration */}
            <div className="flex items-center gap-1.5">
                {/* Status indicator */}
                <div className={`${statusDotSize} rounded-full flex-shrink-0 ${
                    trace.hasError
                        ? 'bg-red-500'
                        : isActive
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-green-500'
                }`} />

                {/* Trace name - truncated */}
                <div className="flex-1 min-w-0 text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">
                    {trace.rootSpanName || 'Unknown'}
                </div>

                {/* Duration badge */}
                <div className={`text-[10px] font-mono flex-shrink-0 ${
                    trace.hasError
                        ? 'text-red-600 dark:text-red-400'
                        : isActive
                        ? 'text-amber-600 dark:text-amber-400'
                        : trace.duration && trace.duration > 1000
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                }`}>
                    {isActive && !trace.duration ? '...' : formatDuration(trace.duration)}
                </div>
            </div>

            {/* Second line: time + span count + services */}
            <div className="flex items-center gap-2 mt-0.5 text-[9px] text-slate-400 dark:text-slate-500">
                <span>{formatTraceTime(trace.startTime)}</span>
                <span>{trace.spanCount} spans</span>
                {trace.serviceNames && trace.serviceNames.length > 0 && (
                    <span className="truncate max-w-[80px]" title={trace.serviceNames.join(', ')}>
                        {trace.serviceNames[0]}{trace.serviceNames.length > 1 ? ` +${trace.serviceNames.length - 1}` : ''}
                    </span>
                )}
            </div>
        </div>
    );
}
