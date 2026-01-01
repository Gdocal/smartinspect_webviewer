/**
 * TracesView - Main container for full-screen trace visualization
 * Layout:
 *   - Top: Global timeline showing all traces on time axis
 *   - Bottom left: Trace list
 *   - Bottom center: Waterfall for selected trace
 *   - Bottom right: Logs panel for selected span
 */

import { useState, useCallback } from 'react';
import {
    useTraceStore,
    fetchTrace,
    fetchTraceTree,
    TraceSummary
} from '../../store/traceStore';
import { TraceList } from './TraceList';
import { TraceWaterfall } from './TraceWaterfall';
import { TraceFlamegraph } from './TraceFlamegraph';
import { TraceLogsPanel } from './TraceLogsPanel';
import { TraceTimeline } from './TraceTimeline';
import { TraceFilterPanel } from './TraceFilterPanel';

export function TracesView() {
    const {
        selectedTraceId,
        selectedSpanId,
        setSelectedTraceId,
        setSelectedTrace,
        setTraceTree,
        setLoadingTrace,
        setLoadingTree,
        setError
    } = useTraceStore();

    const [timelineCollapsed, setTimelineCollapsed] = useState(false);
    const [viewMode, setViewMode] = useState<'waterfall' | 'flamegraph'>('waterfall');

    // Handle trace selection from timeline
    const handleTimelineSelect = useCallback(async (trace: TraceSummary) => {
        if (selectedTraceId === trace.traceId) {
            return; // Already selected
        }

        setSelectedTraceId(trace.traceId);
        setLoadingTrace(true);
        setLoadingTree(true);

        try {
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
    }, [selectedTraceId, setSelectedTraceId, setSelectedTrace, setTraceTree, setLoadingTrace, setLoadingTree, setError]);

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
            {/* Top: Global Timeline - dynamic height based on trace count */}
            <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-200 overflow-hidden">
                {/* Timeline Header */}
                <div className="h-10 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                        </svg>
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Trace Timeline
                        </h3>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                            (click bar to select, scroll/drag to pan, wheel to zoom)
                        </span>
                    </div>
                    <button
                        onClick={() => setTimelineCollapsed(!timelineCollapsed)}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                        title={timelineCollapsed ? 'Expand' : 'Collapse'}
                    >
                        <svg
                            className={`w-4 h-4 transition-transform ${timelineCollapsed ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                </div>

                {/* Timeline Chart - dynamic height with scrollbar */}
                {!timelineCollapsed && (
                    <TraceTimeline
                        onSelectTrace={handleTimelineSelect}
                        minHeight={100}
                        maxHeight={250}
                    />
                )}
            </div>

            {/* Filter Panel */}
            <TraceFilterPanel compact />

            {/* Bottom: Trace List + Waterfall + Logs */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
                {/* Left: Trace list */}
                <div className="w-80 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                    <TraceList />
                </div>

                {/* Center: Waterfall/Flamegraph view with toggle */}
                <div className="flex-1 min-w-0 bg-white dark:bg-slate-800 overflow-hidden flex flex-col">
                    {/* View toggle */}
                    <div className="flex-shrink-0 px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50">
                        <span className="text-xs text-slate-500 dark:text-slate-400">View:</span>
                        <div className="flex items-center gap-0.5 bg-slate-200 dark:bg-slate-700 rounded p-0.5">
                            <button
                                onClick={() => setViewMode('waterfall')}
                                className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
                                    viewMode === 'waterfall'
                                        ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-200 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                                }`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                                </svg>
                                Waterfall
                            </button>
                            <button
                                onClick={() => setViewMode('flamegraph')}
                                className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
                                    viewMode === 'flamegraph'
                                        ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-200 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                                }`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                Flamegraph
                            </button>
                        </div>
                    </div>

                    {/* View content */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        {viewMode === 'waterfall' ? <TraceWaterfall /> : <TraceFlamegraph />}
                    </div>
                </div>

                {/* Right: Logs panel (shown when span is selected) */}
                {selectedTraceId && selectedSpanId && (
                    <div className="w-96 flex-shrink-0 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                        <TraceLogsPanel />
                    </div>
                )}
            </div>
        </div>
    );
}
