/**
 * TraceWaterfall - Waterfall/Gantt chart visualization for trace spans
 * Shows hierarchical span timing with parent-child relationships
 *
 * Features:
 * - Collapse/expand span groups
 * - Keyboard navigation
 * - Span search with highlighting
 * - Error highlighting
 */

import { useMemo, useCallback, useState, useEffect } from 'react';
import {
    useTraceStore,
    SpanNode,
    formatDuration
} from '../../store/traceStore';
import { useLogStore } from '../../store/logStore';
import { getFontSize, getWaterfallRowHeight, RowDensity } from '../VirtualLogGrid/constants';

// FlatSpan includes collapse state info
interface FlatSpan extends SpanNode {
    isCollapsed: boolean;
    hasChildren: boolean;
}

// Colors for different span kinds
const SPAN_KIND_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    Server: { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-blue-700 dark:text-blue-300' },
    Client: { bg: 'bg-green-500', border: 'border-green-600', text: 'text-green-700 dark:text-green-300' },
    Producer: { bg: 'bg-purple-500', border: 'border-purple-600', text: 'text-purple-700 dark:text-purple-300' },
    Consumer: { bg: 'bg-orange-500', border: 'border-orange-600', text: 'text-orange-700 dark:text-orange-300' },
    Internal: { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-slate-700 dark:text-slate-300' }
};

const DEFAULT_SPAN_COLOR = { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-slate-700 dark:text-slate-300' };

export function TraceWaterfall() {
    const {
        traceTree,
        selectedSpanId,
        loadingTree,
        setSelectedSpanId
    } = useTraceStore();

    // Get row density setting
    const { rowDensity } = useLogStore();
    const fontSize = getFontSize(rowDensity);
    const rowHeight = getWaterfallRowHeight(rowDensity);

    // Collapsed span IDs
    const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Set<string>>(new Set());

    // Reset collapsed state when trace changes
    useEffect(() => {
        setCollapsedSpans(new Set());
        setSearchQuery('');
        setSearchResults(new Set());
    }, [traceTree?.traceId]);

    // Toggle collapse/expand
    const toggleCollapse = useCallback((spanId: string) => {
        setCollapsedSpans(prev => {
            const next = new Set(prev);
            if (next.has(spanId)) {
                next.delete(spanId);
            } else {
                next.add(spanId);
            }
            return next;
        });
    }, []);

    // Expand all spans
    const expandAll = useCallback(() => {
        setCollapsedSpans(new Set());
    }, []);

    // Collapse all spans with children
    const collapseAll = useCallback(() => {
        if (!traceTree) return;

        const toCollapse = new Set<string>();
        const collectParents = (nodes: SpanNode[]) => {
            for (const node of nodes) {
                if (node.children.length > 0) {
                    toCollapse.add(node.spanId);
                    collectParents(node.children);
                }
            }
        };
        collectParents(traceTree.roots);
        setCollapsedSpans(toCollapse);
    }, [traceTree]);

    // Handle search
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        if (!query.trim() || !traceTree) {
            setSearchResults(new Set());
            return;
        }

        const q = query.toLowerCase();
        const matches = new Set<string>();
        const searchNodes = (nodes: SpanNode[]) => {
            for (const node of nodes) {
                if (node.name.toLowerCase().includes(q) ||
                    node.spanId.toLowerCase().includes(q) ||
                    node.kind?.toLowerCase().includes(q)) {
                    matches.add(node.spanId);
                }
                if (node.children.length > 0) {
                    searchNodes(node.children);
                }
            }
        };
        searchNodes(traceTree.roots);
        setSearchResults(matches);
    }, [traceTree]);

    // Flatten the tree for rendering while preserving depth AND collapse state
    const flattenedSpans = useMemo<FlatSpan[]>(() => {
        if (!traceTree) return [];

        const result: FlatSpan[] = [];
        const flatten = (nodes: SpanNode[], parentCollapsed: boolean) => {
            for (const node of nodes) {
                if (!parentCollapsed) {
                    result.push({
                        ...node,
                        isCollapsed: collapsedSpans.has(node.spanId),
                        hasChildren: node.children.length > 0
                    });
                }
                if (node.children.length > 0) {
                    flatten(node.children, parentCollapsed || collapsedSpans.has(node.spanId));
                }
            }
        };
        flatten(traceTree.roots, false);
        return result;
    }, [traceTree, collapsedSpans]);

    // Calculate time scale (use all spans from tree, not just visible ones)
    const timeScale = useMemo(() => {
        if (!traceTree) {
            return { startTime: 0, endTime: 1000, duration: 1000 };
        }

        let minTime = Infinity;
        let maxTime = -Infinity;

        // Traverse full tree to get accurate time scale
        const collectTimes = (nodes: SpanNode[]) => {
            for (const span of nodes) {
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
                if (span.children.length > 0) {
                    collectTimes(span.children);
                }
            }
        };
        collectTimes(traceTree.roots);

        if (minTime === Infinity) minTime = 0;
        if (maxTime === -Infinity) maxTime = 1000;

        const duration = maxTime - minTime || 1; // Prevent division by zero
        return { startTime: minTime, endTime: maxTime, duration };
    }, [traceTree]);

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
                <div className="flex flex-col items-center gap-3">
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-sm">Loading trace...</span>
                </div>
            </div>
        );
    }

    if (!traceTree) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                <div className="flex flex-col items-center gap-3">
                    <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Select a trace to view waterfall</span>
                </div>
            </div>
        );
    }

    // Count collapsed child spans
    const collapsedCount = useMemo(() => {
        if (!traceTree) return 0;
        let total = 0;
        const count = (nodes: SpanNode[], inCollapsed: boolean) => {
            for (const node of nodes) {
                if (inCollapsed) total++;
                if (node.children.length > 0) {
                    count(node.children, inCollapsed || collapsedSpans.has(node.spanId));
                }
            }
        };
        count(traceTree.roots, false);
        return total;
    }, [traceTree, collapsedSpans]);

    // Error count
    const errorCount = useMemo(() => {
        if (!traceTree) return 0;
        let count = 0;
        const countErrors = (nodes: SpanNode[]) => {
            for (const node of nodes) {
                if (node.hasError || node.status === 'Error') count++;
                if (node.children.length > 0) countErrors(node.children);
            }
        };
        countErrors(traceTree.roots);
        return count;
    }, [traceTree]);

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Waterfall
                    </h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                        {flattenedSpans.length}/{traceTree.spanCount} spans
                        {collapsedCount > 0 && ` (${collapsedCount} hidden)`}
                    </span>
                    {errorCount > 0 && (
                        <span className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            {errorCount} error{errorCount > 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Search input */}
                    <div className="relative">
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search spans..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="w-32 pl-6 pr-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400"
                        />
                        {searchResults.size > 0 && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-500">
                                {searchResults.size}
                            </span>
                        )}
                    </div>

                    {/* Expand/Collapse buttons */}
                    <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700 rounded p-0.5">
                        <button
                            onClick={expandAll}
                            className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded hover:bg-white dark:hover:bg-slate-600"
                            title="Expand all"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        </button>
                        <button
                            onClick={collapseAll}
                            className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded hover:bg-white dark:hover:bg-slate-600"
                            title="Collapse all"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                            </svg>
                        </button>
                    </div>

                    {/* Duration */}
                    <div className="text-sm font-mono text-slate-600 dark:text-slate-400">
                        <span className="font-semibold">{formatDuration(traceTree.duration)}</span>
                    </div>
                </div>
            </div>

            {/* Time ruler */}
            <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex h-7">
                    {/* Name column header */}
                    <div className="w-56 flex-shrink-0 px-3 flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">
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
                        isSearchMatch={searchResults.has(span.spanId)}
                        onClick={() => handleSpanClick(span.spanId)}
                        onToggleCollapse={() => toggleCollapse(span.spanId)}
                        rowHeight={rowHeight}
                        fontSize={fontSize}
                        rowDensity={rowDensity}
                    />
                ))}
            </div>

            {/* Legend */}
            <div className="flex-shrink-0 px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-500 dark:text-slate-400">Span kind:</span>
                {Object.entries(SPAN_KIND_COLORS).map(([kind, colors]) => (
                    <div key={kind} className="flex items-center gap-1.5">
                        <div className={`w-3 h-2.5 rounded-sm ${colors.bg}`} />
                        <span className="text-slate-600 dark:text-slate-400">{kind}</span>
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
        <div className="h-full flex items-center relative px-3">
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
    span: FlatSpan;
    barStyle: { left: string; width: string };
    isSelected: boolean;
    isSearchMatch: boolean;
    onClick: () => void;
    onToggleCollapse: () => void;
    rowHeight: number;
    fontSize: number;
    rowDensity: RowDensity;
}

function SpanRow({ span, barStyle, isSelected, isSearchMatch, onClick, onToggleCollapse, rowHeight, fontSize, rowDensity }: SpanRowProps) {
    const colors = SPAN_KIND_COLORS[span.kind || 'Internal'] || DEFAULT_SPAN_COLOR;
    const indentMultiplier = rowDensity === 'compact' ? 12 : rowDensity === 'comfortable' ? 20 : 16;
    const indentPx = span.depth * indentMultiplier;
    const isActive = !span.endTime;

    // Density-based bar height
    const barHeight = rowDensity === 'compact' ? 'h-4' : rowDensity === 'comfortable' ? 'h-6' : 'h-5';
    const statusDotSize = rowDensity === 'compact' ? 'w-1 h-1' : rowDensity === 'comfortable' ? 'w-2 h-2' : 'w-1.5 h-1.5';
    const durationFontSize = rowDensity === 'compact' ? 'text-[8px]' : rowDensity === 'comfortable' ? 'text-[11px]' : 'text-[10px]';

    // Handle collapse toggle click
    const handleCollapseClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleCollapse();
    }, [onToggleCollapse]);

    return (
        <div
            className={`flex border-b border-slate-100 dark:border-slate-700/50 cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : isSearchMatch
                    ? 'bg-yellow-50 dark:bg-yellow-900/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
            }`}
            style={{ height: rowHeight }}
            onClick={onClick}
        >
            {/* Name column */}
            <div
                className="w-56 flex-shrink-0 flex items-center px-2 border-r border-slate-200 dark:border-slate-700 overflow-hidden"
                style={{ paddingLeft: `${8 + indentPx}px` }}
            >
                {/* Collapse/expand toggle for nodes with children */}
                {span.hasChildren ? (
                    <button
                        className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 mr-1"
                        onClick={handleCollapseClick}
                        title={span.isCollapsed ? 'Expand' : 'Collapse'}
                    >
                        <svg
                            className={`w-3 h-3 transition-transform ${span.isCollapsed ? '' : 'rotate-90'}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                ) : (
                    <div className="w-4 flex-shrink-0 mr-1" /> // Spacer for alignment
                )}

                {/* Status indicator */}
                <div className={`${statusDotSize} rounded-full flex-shrink-0 mr-1.5 ${
                    span.hasError || span.status === 'Error'
                        ? 'bg-red-500'
                        : isActive
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-green-500'
                }`} />

                {/* Span name */}
                <span
                    className={`truncate ${colors.text} ${isSearchMatch ? 'font-semibold' : ''}`}
                    style={{ fontSize: fontSize - 1 }}
                    title={span.name}
                >
                    {span.name}
                </span>

                {/* Collapsed children count badge */}
                {span.isCollapsed && span.children.length > 0 && (
                    <span className="ml-1 px-1 py-0.5 text-[9px] bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded">
                        +{span.children.length}
                    </span>
                )}
            </div>

            {/* Timeline column */}
            <div className="flex-1 relative flex items-center px-3">
                {/* Span bar */}
                <div
                    className={`absolute ${barHeight} rounded ${
                        span.hasError || span.status === 'Error'
                            ? 'bg-red-500'
                            : isActive
                            ? `${colors.bg} opacity-60`
                            : colors.bg
                    } ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-slate-800' : ''} ${
                        isSearchMatch ? 'ring-2 ring-yellow-400' : ''
                    } ${
                        isActive ? 'animate-pulse' : ''
                    }`}
                    style={barStyle}
                >
                    {/* Duration label inside bar if it fits */}
                    <span className={`absolute inset-0 flex items-center justify-center ${durationFontSize} text-white font-medium truncate px-1`}>
                        {isActive ? '...' : formatDuration(span.duration)}
                    </span>
                </div>
            </div>
        </div>
    );
}
