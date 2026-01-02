/**
 * StateTimelinePanel - Displays discrete states over time as colored bars
 * Grafana-style State Timeline visualization
 *
 * Key features:
 * - Shared value mappings across all series (panel-level)
 * - Series names on left, time axis at bottom
 * - Legend showing value-color mappings
 * - Configurable row height, fill opacity, line width
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { MetricsPanel, StateMapping, STATE_COLORS, useCursorSync } from '../../../store/metricsStore';
import { useLogStore } from '../../../store/logStore';

interface StateTimelinePanelProps {
    panel: MetricsPanel;
    width: number;
    height: number;
}

interface HistoryPoint {
    timestamp: number;
    value: string | number;
}

interface StateSegment {
    startTime: number;
    endTime: number;
    value: string | number;
    color: string;
    text: string;
}

// Get color and text for a value based on mappings
function getStateInfo(value: string | number, mappings: StateMapping[]): { color: string; text: string } {
    const stringValue = String(value).toLowerCase();

    // Find matching mapping (case-insensitive)
    const mapping = mappings.find(m => String(m.value).toLowerCase() === stringValue);

    if (mapping) {
        return { color: mapping.color, text: mapping.text };
    }

    // Default: use hash of value for color, value as text
    const hash = stringValue.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
        color: STATE_COLORS[hash % STATE_COLORS.length],
        text: String(value)
    };
}

// Build segments from history points
function buildSegments(
    history: HistoryPoint[],
    mappings: StateMapping[],
    mergeAdjacent: boolean,
    timeRange: { from: number; to: number }
): StateSegment[] {
    if (history.length === 0) return [];

    const segments: StateSegment[] = [];
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);

    // Filter to time range
    const inRange = sorted.filter(p => p.timestamp >= timeRange.from && p.timestamp <= timeRange.to);
    if (inRange.length === 0) return [];

    let currentSegment: StateSegment | null = null;

    for (let i = 0; i < inRange.length; i++) {
        const point = inRange[i];
        const { color, text } = getStateInfo(point.value, mappings);
        const nextPoint = inRange[i + 1];
        const endTime = nextPoint ? nextPoint.timestamp : timeRange.to;

        if (mergeAdjacent && currentSegment && String(currentSegment.value).toLowerCase() === String(point.value).toLowerCase()) {
            currentSegment.endTime = endTime;
        } else {
            if (currentSegment) {
                segments.push(currentSegment);
            }
            currentSegment = {
                startTime: point.timestamp,
                endTime,
                value: point.value,
                color,
                text
            };
        }
    }

    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}

// Format time for axis
function formatAxisTime(timestamp: number): string {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// Format time for tooltip
function formatTime(timestamp: number): string {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// Format duration
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
}

export function StateTimelinePanel({ panel, width, height }: StateTimelinePanelProps) {
    const { watches, currentRoom } = useLogStore();
    const containerRef = useRef<HTMLDivElement>(null);

    // Cursor sync - subscribe to shared cursor time for cross-panel sync
    const { cursorTime, setCursorTime, clearCursor } = useCursorSync();

    // Tooltip state
    const [tooltip, setTooltip] = useState<{
        show: boolean;
        x: number;
        y: number;
        segment: StateSegment | null;
        seriesName: string;
    }>({ show: false, x: 0, y: 0, segment: null, seriesName: '' });

    // History data for each query
    const [historyData, setHistoryData] = useState<Map<string, HistoryPoint[]>>(new Map());

    // Calculate time range
    const getTimeRange = useCallback(() => {
        const now = Date.now();
        if (panel.timeRange.mode === 'absolute' && panel.timeRange.from && panel.timeRange.to) {
            return { from: panel.timeRange.from, to: panel.timeRange.to };
        }
        const ranges: Record<string, number> = {
            'last5m': 5 * 60 * 1000,
            'last15m': 15 * 60 * 1000,
            'last30m': 30 * 60 * 1000,
            'last1h': 60 * 60 * 1000,
            'last3h': 3 * 60 * 60 * 1000,
        };
        const duration = ranges[panel.timeRange.relative || 'last5m'] || 5 * 60 * 1000;
        return { from: now - duration, to: now };
    }, [panel.timeRange]);

    const [displayTimeRange, setDisplayTimeRange] = useState(() => getTimeRange());

    // Live time ticker
    useEffect(() => {
        if (!panel.liveMode) return;
        const ticker = setInterval(() => {
            setDisplayTimeRange(getTimeRange());
        }, 1000);
        return () => clearInterval(ticker);
    }, [panel.liveMode, getTimeRange]);

    // Fetch history data
    const fetchHistoryData = useCallback(async () => {
        const timeRange = getTimeRange();
        setDisplayTimeRange(timeRange);

        const watchNames = panel.queries.map(q => q.watchName).filter(Boolean);
        if (watchNames.length === 0) return;

        const newData = new Map<string, HistoryPoint[]>();

        await Promise.all(
            watchNames.map(async (watchName) => {
                try {
                    const params = new URLSearchParams({
                        from: timeRange.from.toString(),
                        to: timeRange.to.toString(),
                        resolution: 'raw',
                    });

                    const response = await fetch(
                        `/api/watches/${encodeURIComponent(watchName)}/history?${params}`,
                        { headers: { 'X-Room': currentRoom } }
                    );

                    if (response.ok) {
                        const result = await response.json();
                        const points: HistoryPoint[] = (result.data || []).map((p: any) => ({
                            timestamp: typeof p.timestamp === 'string'
                                ? new Date(p.timestamp).getTime()
                                : (p.timestamp || p.t),
                            // For non-numeric values, the actual string is stored in 'label'
                            // The 'value' field contains a count for non-numeric data
                            value: p.label ?? p.value ?? p.v ?? '',
                        }));
                        newData.set(watchName, points);
                    }
                } catch (err) {
                    console.error(`Failed to fetch history for ${watchName}:`, err);
                }
            })
        );

        setHistoryData(newData);
    }, [panel.queries, getTimeRange, currentRoom]);

    // Fetch on mount and periodically
    useEffect(() => {
        fetchHistoryData();
        if (panel.liveMode) {
            const interval = setInterval(fetchHistoryData, 10000);
            return () => clearInterval(interval);
        }
    }, [fetchHistoryData, panel.liveMode]);

    // Append live updates
    const lastAppendedRef = useRef(new Map<string, number>());

    useEffect(() => {
        if (!panel.liveMode) return;

        panel.queries.forEach(query => {
            const watchName = query.watchName;
            if (!watchName) return;

            const watch = watches[watchName];
            if (!watch) return;

            const watchTime = new Date(watch.timestamp).getTime();
            const lastTime = lastAppendedRef.current.get(watchName) || 0;

            if (watchTime > lastTime) {
                lastAppendedRef.current.set(watchName, watchTime);

                setHistoryData(prev => {
                    const newData = new Map(prev);
                    const existing = newData.get(watchName) || [];
                    const newPoints = [...existing, { timestamp: watchTime, value: watch.value }];

                    const cutoff = Date.now() - 10 * 60 * 1000;
                    const trimmed = newPoints.filter(p => p.timestamp >= cutoff);

                    newData.set(watchName, trimmed);
                    return newData;
                });
            }
        });
    }, [panel.liveMode, panel.queries, watches]);

    // Get options with defaults
    const mappings = panel.options.stateMappings || [];
    const rowHeightPercent = panel.options.rowHeight || 0.9; // 0-1, 1 = no gap
    const showValue = panel.options.showValue ?? true;
    const mergeAdjacent = panel.options.mergeAdjacentStates ?? true;
    const lineWidth = panel.options.lineWidth || 0;
    const fillOpacity = panel.options.fillOpacity ?? 0.9;

    // Build segments for each query
    const seriesSegments = useMemo(() => {
        return panel.queries.map(query => {
            const history = query.watchName ? historyData.get(query.watchName) : null;
            const displayName = query.alias || query.watchName || 'Series';

            if (!history) return { name: displayName, segments: [] };

            return {
                name: displayName,
                segments: buildSegments(history, mappings, mergeAdjacent, displayTimeRange)
            };
        });
    }, [panel.queries, historyData, mappings, mergeAdjacent, displayTimeRange]);

    // Get unique values from all segments for legend
    const legendItems = useMemo(() => {
        const valueSet = new Set<string>();
        seriesSegments.forEach(s => s.segments.forEach(seg => valueSet.add(String(seg.value).toLowerCase())));

        // Also include all mapped values
        mappings.forEach(m => valueSet.add(String(m.value).toLowerCase()));

        return Array.from(valueSet).map(val => {
            const info = getStateInfo(val, mappings);
            return { value: val, ...info };
        });
    }, [seriesSegments, mappings]);

    // Layout calculations
    const leftPadding = 80; // Space for series names
    const rightPadding = 12;
    const topPadding = 8;
    const bottomPadding = 50; // Space for time axis + legend
    const legendHeight = 24;

    const chartWidth = width - leftPadding - rightPadding;
    const chartHeight = height - topPadding - bottomPadding;
    const numSeries = seriesSegments.length || 1;
    const rowTotalHeight = chartHeight / numSeries;
    const rowHeight = rowTotalHeight * rowHeightPercent;
    const rowGap = (rowTotalHeight - rowHeight) / 2;

    const timeRange = displayTimeRange;
    const timeDuration = timeRange.to - timeRange.from;

    // Convert timestamp to x position
    const timeToX = (timestamp: number) => {
        const ratio = (timestamp - timeRange.from) / timeDuration;
        return leftPadding + ratio * chartWidth;
    };

    // Generate time axis ticks
    const timeAxisTicks = useMemo(() => {
        const ticks: { x: number; label: string }[] = [];
        const tickCount = Math.min(Math.floor(chartWidth / 100), 8);
        const tickInterval = timeDuration / tickCount;

        for (let i = 0; i <= tickCount; i++) {
            const timestamp = timeRange.from + i * tickInterval;
            ticks.push({
                x: timeToX(timestamp),
                label: formatAxisTime(timestamp)
            });
        }

        return ticks;
    }, [chartWidth, timeDuration, timeRange.from]);

    // Convert x position to timestamp
    const xToTime = useCallback((x: number) => {
        const ratio = (x - leftPadding) / chartWidth;
        return timeRange.from + ratio * timeDuration;
    }, [leftPadding, chartWidth, timeRange.from, timeDuration]);

    // Handle mouse move on chart area - emit cursor time for cross-panel sync
    const handleChartMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        // Only emit if mouse is in the chart area
        if (x >= leftPadding && x <= leftPadding + chartWidth) {
            const time = xToTime(x);
            setCursorTime(time, panel.id);
        }
    }, [leftPadding, chartWidth, xToTime, setCursorTime, panel.id]);

    // Handle mouse events
    const handleSegmentHover = (e: React.MouseEvent, segment: StateSegment, seriesName: string) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        setTooltip({
            show: true,
            x: e.clientX - rect.left + 10,
            y: e.clientY - rect.top - 60,
            segment,
            seriesName
        });
    };

    const handleMouseLeave = () => {
        setTooltip(prev => ({ ...prev, show: false }));
        clearCursor();
    };

    if (panel.queries.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <p>No queries configured</p>
                    <p className="text-xs mt-1 text-slate-600">Click Edit to add watches</p>
                </div>
            </div>
        );
    }

    // Calculate cursor X position if cursor time is in range
    const cursorX = useMemo(() => {
        if (cursorTime === null) return null;
        if (cursorTime < timeRange.from || cursorTime > timeRange.to) return null;
        return timeToX(cursorTime);
    }, [cursorTime, timeRange.from, timeRange.to, timeToX]);

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden" onMouseLeave={handleMouseLeave}>
            <svg
                width={width}
                height={height - legendHeight}
                className="overflow-visible"
                onMouseMove={handleChartMouseMove}
            >
                {/* Timeline rows */}
                {seriesSegments.map((series, seriesIdx) => {
                    const rowY = topPadding + seriesIdx * rowTotalHeight + rowGap;

                    return (
                        <g key={seriesIdx}>
                            {/* Series name */}
                            <text
                                x={leftPadding - 8}
                                y={rowY + rowHeight / 2 + 4}
                                textAnchor="end"
                                className="fill-slate-300 text-xs font-medium"
                            >
                                {series.name.length > 10 ? series.name.slice(0, 10) + '...' : series.name}
                            </text>

                            {/* Background bar */}
                            <rect
                                x={leftPadding}
                                y={rowY}
                                width={chartWidth}
                                height={rowHeight}
                                fill="#1e293b"
                                rx={2}
                            />

                            {/* State segments */}
                            {series.segments.map((segment, segIdx) => {
                                const x1 = timeToX(segment.startTime);
                                const x2 = timeToX(segment.endTime);
                                const segmentWidth = Math.max(x2 - x1, 2);

                                return (
                                    <g key={segIdx}>
                                        <rect
                                            x={x1}
                                            y={rowY}
                                            width={segmentWidth}
                                            height={rowHeight}
                                            fill={segment.color}
                                            fillOpacity={fillOpacity}
                                            stroke={lineWidth > 0 ? segment.color : 'none'}
                                            strokeWidth={lineWidth}
                                            rx={2}
                                            className="cursor-pointer transition-opacity hover:opacity-100"
                                            style={{ opacity: fillOpacity }}
                                            onMouseEnter={(e) => handleSegmentHover(e, segment, series.name)}
                                            onMouseMove={(e) => handleSegmentHover(e, segment, series.name)}
                                        />
                                        {/* Value text - only if segment is wide enough */}
                                        {showValue && segmentWidth > 40 && (
                                            <text
                                                x={x1 + segmentWidth / 2}
                                                y={rowY + rowHeight / 2 + 4}
                                                textAnchor="middle"
                                                className="fill-white text-xs font-medium pointer-events-none"
                                                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                                            >
                                                {segment.text.length > Math.floor(segmentWidth / 8)
                                                    ? segment.text.slice(0, Math.floor(segmentWidth / 8)) + '...'
                                                    : segment.text}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </g>
                    );
                })}

                {/* Time axis at bottom */}
                <g className="time-axis">
                    <line
                        x1={leftPadding}
                        y1={topPadding + chartHeight + 4}
                        x2={leftPadding + chartWidth}
                        y2={topPadding + chartHeight + 4}
                        stroke="#475569"
                        strokeWidth={1}
                    />
                    {timeAxisTicks.map((tick, i) => (
                        <g key={i}>
                            <line
                                x1={tick.x}
                                y1={topPadding + chartHeight + 4}
                                x2={tick.x}
                                y2={topPadding + chartHeight + 8}
                                stroke="#475569"
                                strokeWidth={1}
                            />
                            <text
                                x={tick.x}
                                y={topPadding + chartHeight + 20}
                                textAnchor="middle"
                                className="fill-slate-400 text-[10px]"
                            >
                                {tick.label}
                            </text>
                        </g>
                    ))}
                </g>

                {/* Synced cursor line - vertical line showing cursor position from other panels */}
                {cursorX !== null && (
                    <line
                        x1={cursorX}
                        y1={topPadding}
                        x2={cursorX}
                        y2={topPadding + chartHeight}
                        stroke="#f8fafc"
                        strokeWidth={1}
                        strokeDasharray="4 2"
                        className="pointer-events-none"
                        style={{ opacity: 0.6 }}
                    />
                )}
            </svg>

            {/* Legend at bottom */}
            <div
                className="absolute left-0 right-0 flex items-center justify-center gap-4 px-4"
                style={{ bottom: 4, height: legendHeight }}
            >
                {legendItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                        <div
                            className="w-3 h-3 rounded-sm"
                            style={{ backgroundColor: item.color, opacity: fillOpacity }}
                        />
                        <span className="text-xs text-slate-400">{item.text}</span>
                    </div>
                ))}
            </div>

            {/* Tooltip */}
            {tooltip.show && tooltip.segment && (
                <div
                    className="absolute z-50 pointer-events-none bg-slate-900/95 border border-slate-600 rounded-lg shadow-xl px-3 py-2 text-xs"
                    style={{
                        left: Math.min(Math.max(tooltip.x, 10), width - 180),
                        top: Math.max(tooltip.y, 10),
                        minWidth: 160
                    }}
                >
                    <div className="text-slate-300 font-medium mb-1.5 pb-1 border-b border-slate-600">
                        {tooltip.seriesName}
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-sm"
                                style={{ backgroundColor: tooltip.segment.color }}
                            />
                            <span className="text-white font-medium">{tooltip.segment.text}</span>
                        </div>
                        <div className="text-slate-400">
                            {formatTime(tooltip.segment.startTime)} - {formatTime(tooltip.segment.endTime)}
                        </div>
                        <div className="text-slate-400">
                            Duration: {formatDuration(tooltip.segment.endTime - tooltip.segment.startTime)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
