/**
 * WaterfallView - Waterfall/Gantt chart visualization for trace spans
 * Shows hierarchical span timing with parent-child relationships
 */

import { useMemo, useCallback } from 'react';
import {
    useTraceStore,
    SpanNode,
    formatDuration
} from '../../store/traceStore';

// Colors for different span kinds
const SPAN_KIND_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    Server: { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-blue-700 dark:text-blue-300' },
    Client: { bg: 'bg-green-500', border: 'border-green-600', text: 'text-green-700 dark:text-green-300' },
    Producer: { bg: 'bg-purple-500', border: 'border-purple-600', text: 'text-purple-700 dark:text-purple-300' },
    Consumer: { bg: 'bg-orange-500', border: 'border-orange-600', text: 'text-orange-700 dark:text-orange-300' },
    Internal: { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-slate-700 dark:text-slate-300' }
};

const DEFAULT_SPAN_COLOR = { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-slate-700 dark:text-slate-300' };

export function WaterfallView() {
    const {
        traceTree,
        selectedSpanId,
        loadingTree,
        setSelectedSpanId
    } = useTraceStore();

    // Flatten the tree for rendering while preserving depth
    const flattenedSpans = useMemo(() => {
        if (!traceTree) return [];

        const result: SpanNode[] = [];
        const flatten = (nodes: SpanNode[]) => {
            for (const node of nodes) {
                result.push(node);
                if (node.children.length > 0) {
                    flatten(node.children);
                }
            }
        };
        flatten(traceTree.roots);
        return result;
    }, [traceTree]);

    // Calculate time scale
    const timeScale = useMemo(() => {
        if (!traceTree || flattenedSpans.length === 0) {
            return { startTime: 0, endTime: 1000, duration: 1000 };
        }

        let minTime = Infinity;
        let maxTime = -Infinity;

        for (const span of flattenedSpans) {
            const startTime = new Date(span.startTime).getTime();
            if (startTime < minTime) minTime = startTime;
            if (span.endTime) {
                const endTime = new Date(span.endTime).getTime();
                if (endTime > maxTime) maxTime = endTime;
            } else {
                // If no end time, estimate from duration or use start + 1ms
                const endTime = span.duration ? startTime + span.duration : startTime + 1;
                if (endTime > maxTime) maxTime = endTime;
            }
        }

        const duration = maxTime - minTime || 1; // Prevent division by zero
        return { startTime: minTime, endTime: maxTime, duration };
    }, [traceTree, flattenedSpans]);

    // Calculate position and width for a span bar
    const getSpanBarStyle = useCallback((span: SpanNode) => {
        const startTime = new Date(span.startTime).getTime();
        const spanDuration = span.duration || 1;

        const leftPercent = ((startTime - timeScale.startTime) / timeScale.duration) * 100;
        const widthPercent = (spanDuration / timeScale.duration) * 100;

        return {
            left: `${Math.max(0, leftPercent)}%`,
            width: `${Math.max(0.5, Math.min(100 - leftPercent, widthPercent))}%`
        };
    }, [timeScale]);

    const handleSpanClick = useCallback((spanId: string) => {
        setSelectedSpanId(selectedSpanId === spanId ? null : spanId);
    }, [selectedSpanId, setSelectedSpanId]);

    if (loadingTree) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
            </div>
        );
    }

    if (!traceTree) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Select a trace to view waterfall
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800">
            {/* Header */}
            <div className="flex-shrink-0 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Waterfall
                    </h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {traceTree.spanCount} spans
                    </span>
                </div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                    Total: {formatDuration(traceTree.duration)}
                </div>
            </div>

            {/* Time ruler */}
            <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700">
                <div className="flex h-6">
                    {/* Name column header */}
                    <div className="w-48 flex-shrink-0 px-2 flex items-center text-xs text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">
                        Operation
                    </div>
                    {/* Timeline header with time markers */}
                    <div className="flex-1 relative">
                        <TimeRuler duration={timeScale.duration} />
                    </div>
                </div>
            </div>

            {/* Span rows */}
            <div className="flex-1 overflow-auto">
                {flattenedSpans.map((span) => (
                    <SpanRow
                        key={span.spanId}
                        span={span}
                        barStyle={getSpanBarStyle(span)}
                        isSelected={selectedSpanId === span.spanId}
                        onClick={() => handleSpanClick(span.spanId)}
                    />
                ))}
            </div>

            {/* Legend */}
            <div className="flex-shrink-0 px-3 py-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs">
                {Object.entries(SPAN_KIND_COLORS).map(([kind, colors]) => (
                    <div key={kind} className="flex items-center gap-1">
                        <div className={`w-3 h-2 rounded-sm ${colors.bg}`} />
                        <span className="text-slate-500 dark:text-slate-400">{kind}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Time ruler component
function TimeRuler({ duration }: { duration: number }) {
    // Generate time markers
    const markers = useMemo(() => {
        const count = 5;
        const step = duration / count;
        return Array.from({ length: count + 1 }, (_, i) => ({
            position: (i / count) * 100,
            label: formatDuration(i * step)
        }));
    }, [duration]);

    return (
        <div className="h-full flex items-center relative px-2">
            {markers.map((marker, i) => (
                <div
                    key={i}
                    className="absolute text-[10px] text-slate-400 transform -translate-x-1/2"
                    style={{ left: `${marker.position}%` }}
                >
                    {marker.label}
                </div>
            ))}
        </div>
    );
}

// Individual span row
interface SpanRowProps {
    span: SpanNode;
    barStyle: { left: string; width: string };
    isSelected: boolean;
    onClick: () => void;
}

function SpanRow({ span, barStyle, isSelected, onClick }: SpanRowProps) {
    const colors = SPAN_KIND_COLORS[span.kind || 'Internal'] || DEFAULT_SPAN_COLOR;
    const indentPx = span.depth * 16;

    return (
        <div
            className={`flex h-7 border-b border-slate-100 dark:border-slate-700/50 cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
            }`}
            onClick={onClick}
        >
            {/* Name column */}
            <div
                className="w-48 flex-shrink-0 flex items-center px-2 border-r border-slate-200 dark:border-slate-700 overflow-hidden"
                style={{ paddingLeft: `${8 + indentPx}px` }}
            >
                {/* Tree connector lines */}
                {span.depth > 0 && (
                    <div className="w-2 h-full flex items-center mr-1">
                        <div className="w-2 h-px bg-slate-300 dark:bg-slate-600" />
                    </div>
                )}

                {/* Status indicator */}
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mr-1.5 ${
                    span.hasError || span.status === 'Error'
                        ? 'bg-red-500'
                        : 'bg-green-500'
                }`} />

                {/* Span name */}
                <span className={`text-xs truncate ${colors.text}`} title={span.name}>
                    {span.name}
                </span>
            </div>

            {/* Timeline column */}
            <div className="flex-1 relative flex items-center px-2">
                {/* Span bar */}
                <div
                    className={`absolute h-4 rounded-sm ${colors.bg} ${
                        span.hasError || span.status === 'Error' ? 'bg-red-500' : ''
                    } ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                    style={barStyle}
                >
                    {/* Duration label inside bar if it fits */}
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-medium truncate px-1">
                        {formatDuration(span.duration)}
                    </span>
                </div>
            </div>
        </div>
    );
}
