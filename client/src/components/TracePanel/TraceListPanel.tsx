/**
 * TraceListPanel - Shows list of traces with filtering
 * Displays trace summaries and allows selection for detailed view
 * NOTE: This is a legacy panel - the main trace UI is in TracesView/TraceList.tsx
 */

import { useCallback, useEffect } from 'react';
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

export function TraceListPanel() {
    const {
        traces,
        totalTraces,
        selectedTraceId,
        loadingTraces,
        filter,
        stats,
        error,
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
        clearSelection
    } = useTraceStore();

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

    // Initial load
    useEffect(() => {
        loadTraces();
        loadStats();
    }, [loadTraces, loadStats]);

    // Select a trace
    const handleSelectTrace = useCallback(async (trace: TraceSummary) => {
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
    }, [selectedTraceId, clearSelection, setSelectedTraceId, setSelectedTrace, setTraceTree, setLoadingTrace, setLoadingTree, setError]);

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800">
            {/* Header with filters */}
            <div className="flex-shrink-0 p-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Traces
                    </h3>
                    {stats && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            ({stats.activeTraces} active, {stats.completedTraces} completed)
                        </span>
                    )}
                    <button
                        onClick={() => { loadTraces(); loadStats(); }}
                        disabled={loadingTraces}
                        className="ml-auto p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
                        title="Refresh"
                    >
                        <svg className={`w-4 h-4 ${loadingTraces ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* Filter controls */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Search */}
                    <input
                        type="text"
                        placeholder="Search traces..."
                        value={filter.search}
                        onChange={(e) => setFilter({ search: e.target.value })}
                        className="flex-1 min-w-32 px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400"
                    />

                    {/* Status filter */}
                    <select
                        value={filter.status}
                        onChange={(e) => setFilter({ status: e.target.value as 'all' | 'ok' | 'error' })}
                        className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    >
                        <option value="all">All</option>
                        <option value="ok">Ok</option>
                        <option value="error">Errors</option>
                    </select>

                    {/* Sort */}
                    <select
                        value={filter.sort}
                        onChange={(e) => setFilter({ sort: e.target.value as 'recent' | 'duration' | 'spans' })}
                        className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    >
                        <option value="recent">Recent</option>
                        <option value="duration">Duration</option>
                        <option value="spans">Span Count</option>
                    </select>
                </div>
            </div>

            {/* Error message */}
            {error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs">
                    {error}
                </div>
            )}

            {/* Trace list */}
            <div className="flex-1 overflow-auto">
                {loadingTraces && traces.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </div>
                ) : traces.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm">
                        <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>No traces found</span>
                        <span className="text-xs mt-1">Traces appear when log entries include _traceId context</span>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {traces.map((trace) => (
                            <TraceRow
                                key={trace.traceId}
                                trace={trace}
                                isSelected={selectedTraceId === trace.traceId}
                                onClick={() => handleSelectTrace(trace)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Footer with count */}
            <div className="flex-shrink-0 p-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                {traces.length} of {totalTraces} traces
            </div>
        </div>
    );
}

// Individual trace row
interface TraceRowProps {
    trace: TraceSummary;
    isSelected: boolean;
    onClick: () => void;
}

function TraceRow({ trace, isSelected, onClick }: TraceRowProps) {
    return (
        <div
            className={`p-2 cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border-l-2 border-transparent'
            }`}
            onClick={onClick}
        >
            <div className="flex items-center gap-2">
                {/* Status indicator */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    trace.hasError ? 'bg-red-500' : 'bg-green-500'
                }`} />

                {/* Trace name */}
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {trace.rootSpanName || 'Unknown'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{formatTraceTime(trace.startTime)}</span>
                        <span className="text-slate-300 dark:text-slate-600">|</span>
                        <span>{trace.spanCount} spans</span>
                        {trace.serviceNames && trace.serviceNames.length > 0 && (
                            <>
                                <span className="text-slate-300 dark:text-slate-600">|</span>
                                <span className="truncate">{trace.serviceNames.join(', ')}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Duration */}
                <div className={`text-xs font-mono flex-shrink-0 ${
                    trace.hasError
                        ? 'text-red-500'
                        : trace.duration && trace.duration > 1000
                        ? 'text-amber-500'
                        : 'text-slate-600 dark:text-slate-400'
                }`}>
                    {formatDuration(trace.duration)}
                </div>
            </div>

            {/* Trace ID (truncated) */}
            <div className="mt-1 text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">
                {trace.traceId}
            </div>
        </div>
    );
}
