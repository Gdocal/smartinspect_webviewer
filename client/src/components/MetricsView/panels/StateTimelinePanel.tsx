/**
 * StateTimelinePanel - Displays discrete states over time as colored bars
 * Similar to Grafana's State Timeline visualization
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { MetricsPanel, StateMapping, STATE_COLORS } from '../../../store/metricsStore';
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
    // Find matching mapping
    const stringValue = String(value);
    const mapping = mappings.find(m => String(m.value) === stringValue);

    if (mapping) {
        return { color: mapping.color, text: mapping.text };
    }

    // Default: use hash of value for color, value as text
    const hash = stringValue.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
        color: STATE_COLORS[hash % STATE_COLORS.length],
        text: stringValue
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

        if (mergeAdjacent && currentSegment && String(currentSegment.value) === String(point.value)) {
            // Extend current segment
            currentSegment.endTime = endTime;
        } else {
            // Start new segment
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
        }, 500);
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
                        resolution: 'raw', // Get raw data for state timeline
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
                            value: p.value ?? p.v ?? '',
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
            const interval = setInterval(fetchHistoryData, 30000);
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

                    // Trim old points
                    const cutoff = Date.now() - 10 * 60 * 1000;
                    const trimmed = newPoints.filter(p => p.timestamp >= cutoff);

                    newData.set(watchName, trimmed);
                    return newData;
                });
            }
        });
    }, [panel.liveMode, panel.queries, watches]);

    // Get mappings with defaults
    const mappings = panel.options.stateMappings || [];
    const rowHeight = panel.options.rowHeight || 24;
    const showValue = panel.options.showValue ?? true;
    const mergeAdjacent = panel.options.mergeAdjacentStates ?? true;

    // Build segments for each query
    const seriesSegments = useMemo(() => {
        return panel.queries.map(query => {
            const history = query.watchName ? historyData.get(query.watchName) : null;
            if (!history) return { name: query.alias || query.watchName || 'Series', segments: [] };

            return {
                name: query.alias || query.watchName || 'Series',
                segments: buildSegments(history, mappings, mergeAdjacent, displayTimeRange)
            };
        });
    }, [panel.queries, historyData, mappings, mergeAdjacent, displayTimeRange]);

    // Calculate layout
    const leftPadding = 100; // Space for series names
    const rightPadding = 16;
    const topPadding = 20; // Space for time axis
    const bottomPadding = 4;

    const chartWidth = width - leftPadding - rightPadding;
    const _chartHeight = height - topPadding - bottomPadding; // Used for layout calculations
    void _chartHeight; // Suppress unused warning - kept for future use
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
        const tickCount = Math.min(Math.floor(chartWidth / 80), 10);
        const tickInterval = timeDuration / tickCount;

        for (let i = 0; i <= tickCount; i++) {
            const timestamp = timeRange.from + i * tickInterval;
            ticks.push({
                x: timeToX(timestamp),
                label: formatTime(timestamp)
            });
        }

        return ticks;
    }, [chartWidth, timeDuration, timeRange.from]);

    // Handle mouse events
    const handleSegmentHover = (e: React.MouseEvent, segment: StateSegment, seriesName: string) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        setTooltip({
            show: true,
            x: e.clientX - rect.left + 10,
            y: e.clientY - rect.top - 40,
            segment,
            seriesName
        });
    };

    const handleMouseLeave = () => {
        setTooltip(prev => ({ ...prev, show: false }));
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

    return (
        <div ref={containerRef} className="w-full h-full relative" onMouseLeave={handleMouseLeave}>
            <svg width={width} height={height} className="overflow-visible">
                {/* Time axis */}
                <g className="time-axis">
                    <line
                        x1={leftPadding}
                        y1={topPadding - 4}
                        x2={leftPadding + chartWidth}
                        y2={topPadding - 4}
                        stroke="#4b5563"
                        strokeWidth={1}
                    />
                    {timeAxisTicks.map((tick, i) => (
                        <g key={i}>
                            <line
                                x1={tick.x}
                                y1={topPadding - 8}
                                x2={tick.x}
                                y2={topPadding - 4}
                                stroke="#4b5563"
                                strokeWidth={1}
                            />
                            <text
                                x={tick.x}
                                y={topPadding - 10}
                                textAnchor="middle"
                                className="fill-slate-400 text-[10px]"
                            >
                                {tick.label}
                            </text>
                        </g>
                    ))}
                </g>

                {/* Timeline rows */}
                {seriesSegments.map((series, seriesIdx) => {
                    const rowY = topPadding + seriesIdx * (rowHeight + 4);

                    return (
                        <g key={seriesIdx}>
                            {/* Series name */}
                            <text
                                x={leftPadding - 8}
                                y={rowY + rowHeight / 2 + 4}
                                textAnchor="end"
                                className="fill-slate-300 text-xs"
                            >
                                {series.name.length > 12 ? series.name.slice(0, 12) + '...' : series.name}
                            </text>

                            {/* Background bar */}
                            <rect
                                x={leftPadding}
                                y={rowY}
                                width={chartWidth}
                                height={rowHeight}
                                fill="#374151"
                                rx={2}
                            />

                            {/* State segments */}
                            {series.segments.map((segment, segIdx) => {
                                const x1 = timeToX(segment.startTime);
                                const x2 = timeToX(segment.endTime);
                                const segmentWidth = Math.max(x2 - x1, 2); // Minimum 2px

                                return (
                                    <g key={segIdx}>
                                        <rect
                                            x={x1}
                                            y={rowY + 1}
                                            width={segmentWidth}
                                            height={rowHeight - 2}
                                            fill={segment.color}
                                            rx={2}
                                            className="cursor-pointer hover:brightness-110 transition-all"
                                            onMouseEnter={(e) => handleSegmentHover(e, segment, series.name)}
                                            onMouseMove={(e) => handleSegmentHover(e, segment, series.name)}
                                        />
                                        {/* Value text - only if segment is wide enough */}
                                        {showValue && segmentWidth > 30 && (
                                            <text
                                                x={x1 + segmentWidth / 2}
                                                y={rowY + rowHeight / 2 + 4}
                                                textAnchor="middle"
                                                className="fill-white text-[10px] font-medium pointer-events-none"
                                                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                                            >
                                                {segment.text.length > 8 ? segment.text.slice(0, 8) + '...' : segment.text}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </g>
                    );
                })}

                {/* Current time indicator (live mode) */}
                {panel.liveMode && (
                    <line
                        x1={leftPadding + chartWidth}
                        y1={topPadding}
                        x2={leftPadding + chartWidth}
                        y2={topPadding + seriesSegments.length * (rowHeight + 4)}
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                    />
                )}
            </svg>

            {/* Tooltip */}
            {tooltip.show && tooltip.segment && (
                <div
                    className="absolute z-50 pointer-events-none bg-slate-900/95 border border-slate-600 rounded-lg shadow-xl px-3 py-2 text-xs"
                    style={{
                        left: Math.min(tooltip.x, width - 180),
                        top: Math.max(tooltip.y, 0),
                        minWidth: 160
                    }}
                >
                    <div className="text-slate-300 font-medium mb-1.5 pb-1 border-b border-slate-600">
                        {tooltip.seriesName}
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded"
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

            {/* Legend */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 py-0.5 text-xs pointer-events-none">
                {mappings.map((mapping, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-slate-900/70 px-1.5 rounded">
                        <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: mapping.color }}
                        />
                        <span className="text-slate-400">{mapping.text}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
