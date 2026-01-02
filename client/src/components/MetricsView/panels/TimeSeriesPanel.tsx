/**
 * TimeSeriesPanel - Line/area chart using uPlot
 * High-performance time series visualization with Grafana-like styling
 */

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import './uplot-dark.css';
import { MetricsPanel, useCursorSync } from '../../../store/metricsStore';
import { useLogStore } from '../../../store/logStore';
import { evaluateExpression, TransformContext } from '../hooks/useTransformEngine';
import { decimateSeriesData } from '../utils/decimation';

interface TimeSeriesPanelProps {
    panel: MetricsPanel;
    width: number;
    height: number;
}

interface HistoryPoint {
    timestamp: number;
    value: number;
}

// Grafana-inspired colors with better contrast
const GRAFANA_COLORS = [
    '#73bf69', // green
    '#f2cc0c', // yellow
    '#ff6b6b', // red
    '#5794f2', // blue
    '#b877d9', // purple
    '#ff9830', // orange
    '#73bfb8', // teal
    '#f28bff', // pink
];

// Tooltip data structure
interface TooltipData {
    show: boolean;
    x: number;
    y: number;
    time: string;
    values: Array<{ label: string; value: string; color: string }>;
}

export function TimeSeriesPanel({ panel, width, height }: TimeSeriesPanelProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<uPlot | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const { watches, currentRoom } = useLogStore();

    // Cursor sync - emit cursor time to shared store for cross-panel sync
    const { setCursorTime, clearCursor } = useCursorSync();

    // State for fetched history data
    const [historyData, setHistoryData] = useState<Map<string, HistoryPoint[]>>(new Map());

    // Tooltip state
    const [tooltip, setTooltip] = useState<TooltipData>({ show: false, x: 0, y: 0, time: '', values: [] });

    // Track focused series (updated by uPlot's setSeries hook)
    const focusedSeriesRef = useRef<number | null>(null);

    // Detect dark mode
    const isDark = document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Calculate time range based on panel settings
    const getTimeRange = useCallback(() => {
        const now = Date.now();
        if (panel.timeRange.mode === 'absolute' && panel.timeRange.from && panel.timeRange.to) {
            return { from: panel.timeRange.from, to: panel.timeRange.to };
        }
        // Relative time ranges
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

    // For chart display, we need a stable reference that updates with data
    const [displayTimeRange, setDisplayTimeRange] = useState(() => getTimeRange());

    // Live time ticker - continuously move time axis forward like Grafana
    useEffect(() => {
        if (!panel.liveMode) return;

        // Update time range every 500ms for smooth scrolling effect
        // (100ms would be smoother but causes too many re-renders)
        const ticker = setInterval(() => {
            setDisplayTimeRange(getTimeRange());
        }, 500);

        return () => clearInterval(ticker);
    }, [panel.liveMode, getTimeRange]);

    // Fetch history data for all queries
    const fetchHistoryData = useCallback(async () => {
        const timeRange = getTimeRange(); // Get fresh time range on each fetch
        setDisplayTimeRange(timeRange); // Update display range
        const watchNames = panel.queries
            .map(q => q.watchName)
            .filter(Boolean);

        if (watchNames.length === 0) return;

        const newData = new Map<string, HistoryPoint[]>();

        await Promise.all(
            watchNames.map(async (watchName) => {
                try {
                    const params = new URLSearchParams({
                        from: timeRange.from.toString(),
                        to: timeRange.to.toString(),
                        resolution: 'auto',
                    });

                    const response = await fetch(
                        `/api/watches/${encodeURIComponent(watchName)}/history?${params}`,
                        { headers: { 'X-Room': currentRoom } }
                    );

                    if (response.ok) {
                        const result = await response.json();
                        const points: HistoryPoint[] = (result.data || []).map((p: any) => ({
                            // Convert ISO string or number to ms timestamp
                            timestamp: typeof p.timestamp === 'string'
                                ? new Date(p.timestamp).getTime()
                                : (p.timestamp || p.t),
                            value: p.value ?? p.avg ?? p.v ?? 0,
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

    // Fetch data on mount and when dependencies change
    useEffect(() => {
        fetchHistoryData();

        // Refresh every 30 seconds for full history sync (reduced frequency since we append live)
        if (panel.liveMode) {
            const interval = setInterval(fetchHistoryData, 30000);
            return () => clearInterval(interval);
        }
    }, [fetchHistoryData, panel.liveMode]);

    // Track last appended timestamps to avoid duplicates
    const lastAppendedRef = useRef(new Map<string, number>());

    // React to watch changes in real-time - append new data points as they arrive
    useEffect(() => {
        if (!panel.liveMode) return;

        const now = Date.now();

        panel.queries.forEach(query => {
            const watchName = query.watchName;
            if (!watchName) return;

            const watch = watches[watchName];
            if (!watch) return;

            const watchTime = new Date(watch.timestamp).getTime();
            const lastTime = lastAppendedRef.current.get(watchName) || 0;

            // Only append if this is a new value (different timestamp)
            if (watchTime > lastTime) {
                const value = parseFloat(String(watch.value));
                if (!isFinite(value)) return;

                lastAppendedRef.current.set(watchName, watchTime);

                setHistoryData(prev => {
                    const newData = new Map(prev);
                    const existing = newData.get(watchName) || [];

                    // Append new point
                    const newPoints = [...existing, { timestamp: watchTime, value }];

                    // Trim old points outside time range (keep last 10 minutes max)
                    const cutoff = now - 10 * 60 * 1000;
                    const trimmed = newPoints.filter(p => p.timestamp >= cutoff);

                    newData.set(watchName, trimmed);
                    return newData;
                });
            }
        });
    }, [panel.liveMode, panel.queries, watches]); // React to watches changes directly

    // Build uPlot options with Grafana-like dark theme
    const options = useMemo((): uPlot.Options => {
        const colors = panel.queries.map((query, i) =>
            query.color || GRAFANA_COLORS[i % GRAFANA_COLORS.length]
        );

        const series: uPlot.Series[] = [
            { }, // X-axis (time) - no config needed
            ...panel.queries.map((query, i) => {
                const color = colors[i];
                return {
                    label: query.alias || query.watchName || `Series ${i + 1}`,
                    stroke: color,
                    width: 2,
                    fill: color + '20', // Simple semi-transparent fill
                    points: { show: false },
                    spanGaps: true,
                };
            })
        ];

        // Theme colors
        const gridColor = isDark ? '#ffffff15' : '#00000015';
        const axisColor = isDark ? '#9ca3af' : '#6b7280';
        const tickColor = isDark ? '#374151' : '#e5e7eb';

        // Ensure valid dimensions
        const chartWidth = Math.max(width, 200);
        const chartHeight = Math.max(height, 100);

        return {
            width: chartWidth,
            height: chartHeight,
            padding: [8, 8, 0, 0],  // [top, right, bottom, left] - minimal bottom padding
            series,
            scales: {
                x: { time: true },
                y: {
                    auto: true,
                    range: (_u: uPlot, dataMin: number | null, dataMax: number | null) => {
                        // Handle null/undefined/NaN
                        const min = typeof dataMin === 'number' && isFinite(dataMin) ? dataMin : 0;
                        const max = typeof dataMax === 'number' && isFinite(dataMax) ? dataMax : 100;

                        // If min equals max, create a range
                        if (min === max) {
                            return [min - 10, max + 10];
                        }

                        // Add 10% padding to y-axis
                        const pad = (max - min) * 0.1;
                        return [min - pad, max + pad];
                    }
                }
            },
            axes: [
                {
                    // X-axis (time)
                    stroke: axisColor,
                    grid: { stroke: gridColor, width: 1 },
                    ticks: { stroke: tickColor, width: 1, size: 4 },
                    font: '10px system-ui, sans-serif',
                    gap: 4,
                    space: 60,
                    values: (_u: uPlot, vals: number[]) => vals.map(v => {
                        const d = new Date(v * 1000);
                        // Include seconds for better granularity
                        return d.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        });
                    }),
                },
                {
                    // Y-axis (values)
                    stroke: axisColor,
                    grid: { stroke: gridColor, width: 1 },
                    ticks: { stroke: tickColor, width: 1, size: 4 },
                    font: '10px system-ui, sans-serif',
                    size: 45,
                    gap: 4,
                    values: (_u: uPlot, vals: number[]) => vals.map(v => {
                        if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
                        if (Math.abs(v) >= 100) return v.toFixed(0);
                        if (Math.abs(v) >= 10) return v.toFixed(1);
                        if (Math.abs(v) >= 1) return v.toFixed(2);
                        if (Math.abs(v) >= 0.01) return v.toFixed(3);
                        if (v === 0) return '0';
                        return v.toExponential(1);
                    }),
                }
            ],
            legend: {
                show: false, // We'll use custom legend or hide to save space
            },
            cursor: {
                sync: { key: 'metrics' },
                focus: { prox: 16 },
                points: {
                    size: 6,
                    fill: isDark ? '#1e293b' : '#ffffff',
                    stroke: (u: uPlot, seriesIdx: number) => (u.series[seriesIdx].stroke as string) || colors[0],
                    width: 2,
                },
            },
            hooks: {
                setSeries: [
                    (_u: uPlot, seriesIdx: number | null) => {
                        // Track which series is focused/highlighted by uPlot
                        focusedSeriesRef.current = seriesIdx;
                    }
                ],
                setCursor: [
                    (u: uPlot) => {
                        const { idx } = u.cursor;

                        if (idx === null || idx === undefined) {
                            setTooltip(prev => ({ ...prev, show: false }));
                            clearCursor();
                            return;
                        }

                        const time = u.data[0][idx];
                        if (time === undefined) {
                            setTooltip(prev => ({ ...prev, show: false }));
                            clearCursor();
                            return;
                        }

                        // Emit cursor time to shared store (convert from seconds to ms)
                        setCursorTime(time * 1000, panel.id);

                        // Use the focused series tracked by setSeries hook
                        let focusedSeriesIdx = focusedSeriesRef.current;

                        // Fallback: find closest series to cursor Y position if no focus
                        if (focusedSeriesIdx === null || focusedSeriesIdx < 1) {
                            const cursorTop = u.cursor.top ?? 0;
                            let closestDistance = Infinity;
                            focusedSeriesIdx = -1;

                            for (let i = 1; i < u.series.length; i++) {
                                const seriesData = u.data[i];
                                const val = seriesData?.[idx];
                                if (val !== null && val !== undefined) {
                                    const yPos = u.valToPos(val, 'y', true);
                                    const distance = Math.abs(yPos - cursorTop);
                                    if (distance < closestDistance) {
                                        closestDistance = distance;
                                        focusedSeriesIdx = i;
                                    }
                                }
                            }
                        }

                        if (focusedSeriesIdx === null || focusedSeriesIdx < 1) {
                            setTooltip(prev => ({ ...prev, show: false }));
                            return;
                        }

                        // Get data for the focused series only
                        const val = u.data[focusedSeriesIdx]?.[idx];
                        if (val === null || val === undefined) {
                            setTooltip(prev => ({ ...prev, show: false }));
                            return;
                        }

                        const closestSeriesIdx = focusedSeriesIdx;

                        // Format time with full precision
                        const date = new Date(time * 1000);
                        const timeStr = date.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        }) + '.' + date.getMilliseconds().toString().padStart(3, '0');

                        // Get label and color from panel query
                        const queryIdx = closestSeriesIdx - 1;
                        const query = panel.queries[queryIdx];
                        const seriesLabel = query?.alias || query?.watchName || `Series ${closestSeriesIdx}`;
                        const colorVal = query?.color ?? GRAFANA_COLORS[queryIdx % GRAFANA_COLORS.length];

                        // Format value with appropriate precision
                        let formattedVal: string;
                        if (Math.abs(val) >= 1000) formattedVal = val.toFixed(1);
                        else if (Math.abs(val) >= 1) formattedVal = val.toFixed(2);
                        else formattedVal = val.toFixed(4);

                        const values = [{
                            label: seriesLabel,
                            value: formattedVal,
                            color: colorVal
                        }];

                        // Get the actual data point position (not mouse position)
                        // This ensures tooltip is near the highlighted point
                        const pointX = u.valToPos(time, 'x', true);
                        const pointY = u.valToPos(val, 'y', true);

                        // Tooltip positioning - diagonal offset (right-below by default)
                        const tooltipWidth = 150;
                        const tooltipHeight = 52;
                        const gap = 16;  // Gap from data point
                        const chartWidth = u.width;
                        const chartHeight = u.height;

                        // Horizontal: prefer right side, flip to left if not enough space
                        let tooltipX: number;
                        if (pointX + gap + tooltipWidth < chartWidth) {
                            // Show on right side of point
                            tooltipX = pointX + gap;
                        } else {
                            // Show on left side of point
                            tooltipX = pointX - gap - tooltipWidth;
                        }
                        // Clamp to chart bounds
                        tooltipX = Math.max(4, Math.min(tooltipX, chartWidth - tooltipWidth - 4));

                        // Vertical: prefer below point, flip to above if not enough space
                        let tooltipY: number;
                        if (pointY + gap + tooltipHeight < chartHeight) {
                            // Show below point
                            tooltipY = pointY + gap;
                        } else {
                            // Show above point
                            tooltipY = pointY - gap - tooltipHeight;
                        }
                        // Clamp to chart bounds
                        tooltipY = Math.max(4, Math.min(tooltipY, chartHeight - tooltipHeight - 4));

                        setTooltip({
                            show: true,
                            x: tooltipX,
                            y: tooltipY,
                            time: timeStr,
                            values
                        });
                    }
                ],
                setSelect: [
                    () => {
                        // Hide tooltip when selecting
                        setTooltip(prev => ({ ...prev, show: false }));
                    }
                ]
            },
        };
    }, [width, height, panel.queries, panel.options, panel.id, isDark, setTooltip, setCursorTime, clearCursor]); // Note: displayTimeRange handled separately via setScale

    // Build chart data from history data only (no demo data)
    const data = useMemo((): uPlot.AlignedData => {
        // If no queries, return minimal valid structure
        if (panel.queries.length === 0) {
            const now = Date.now() / 1000;
            return [[now - 60, now]];
        }

        // Collect all timestamps and align series from history data
        const allTimestamps = new Set<number>();

        // Always include time range boundaries for proper scaling (Grafana-like live scrolling)
        allTimestamps.add(displayTimeRange.from);
        allTimestamps.add(displayTimeRange.to);

        panel.queries.forEach(query => {
            const history = query.watchName ? historyData.get(query.watchName) : null;
            if (history) {
                history.forEach(p => {
                    // Only include points within the time range
                    if (p.timestamp >= displayTimeRange.from && p.timestamp <= displayTimeRange.to) {
                        allTimestamps.add(p.timestamp);
                    }
                });
            }
        });

        // Sort timestamps
        const sortedTimes = Array.from(allTimestamps).sort((a, b) => a - b);

        // Convert to seconds for uPlot
        const times = sortedTimes.map(t => t / 1000);

        // Build series data aligned to timestamps, applying expressions
        const seriesData: (number | null)[][] = panel.queries.map(query => {
            const history = query.watchName ? historyData.get(query.watchName) : null;
            if (!history || history.length === 0) {
                return sortedTimes.map(() => null);
            }

            // Create a map for quick lookup
            const valueMap = new Map(history.map(p => [p.timestamp, p.value]));

            // If there's an expression, apply it to each point
            if (query.expression) {
                return sortedTimes.map((t) => {
                    const rawValue = valueMap.get(t);
                    if (rawValue === undefined) return null;

                    // Build context with history up to this point
                    const historyUpToNow = history.filter(p => p.timestamp <= t);
                    const ctx: TransformContext = {
                        currentValue: rawValue,
                        history: historyUpToNow,
                    };

                    try {
                        return evaluateExpression(query.expression!, ctx);
                    } catch {
                        return rawValue;
                    }
                });
            }

            return sortedTimes.map(t => valueMap.get(t) ?? null);
        });

        // Apply LTTB decimation for performance with large datasets
        const decimated = decimateSeriesData(times, seriesData, width);
        return [decimated.times, ...decimated.seriesData];
    }, [panel.queries, historyData, displayTimeRange, width]); // Note: watches removed - we react to historyData changes

    // Initialize chart (only when options/queries change, not data)
    useEffect(() => {
        if (!containerRef.current) return;
        if (panel.queries.length === 0) return;

        // Destroy existing chart
        if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
        }

        // Get actual container dimensions
        const rect = containerRef.current.getBoundingClientRect();
        const actualWidth = Math.max(rect.width, 100);
        const actualHeight = Math.max(rect.height, 50);

        // Create new chart with actual dimensions
        if (actualWidth > 0 && actualHeight > 0) {
            const chartOptions = {
                ...options,
                width: actualWidth,
                height: actualHeight,
            };
            chartRef.current = new uPlot(chartOptions, data, containerRef.current);
        }

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }
        };
    }, [options, panel.queries.length]); // Note: data removed from deps

    // Update chart data without recreating (for live updates)
    useEffect(() => {
        if (chartRef.current && data[0]?.length > 0) {
            chartRef.current.setData(data);
        }
    }, [data]);

    // Handle resize using ResizeObserver
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (chartRef.current) {
                    const { width: w, height: h } = entry.contentRect;
                    if (w > 0 && h > 0) {
                        chartRef.current.setSize({ width: w, height: h });
                    }
                }
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Get colors for legend
    const colors = panel.queries.map((query, i) =>
        query.color || GRAFANA_COLORS[i % GRAFANA_COLORS.length]
    );

    if (panel.queries.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M3 3v18h18" />
                    </svg>
                    <p>No queries configured</p>
                    <p className="text-xs mt-1 text-slate-600">Click Edit to add watches</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full relative">
            {/* Chart container - fills entire space */}
            <div ref={containerRef} className="absolute inset-0" />

            {/* Tooltip */}
            {tooltip.show && tooltip.values.length > 0 && (
                <div
                    ref={tooltipRef}
                    className="absolute z-50 pointer-events-none bg-slate-900/95 dark:bg-slate-800/95 border border-slate-600 rounded-lg shadow-xl px-3 py-2 text-xs whitespace-nowrap"
                    style={{
                        left: tooltip.x,
                        top: tooltip.y,
                        minWidth: 140,
                        maxWidth: 200,
                    }}
                >
                    {/* Time header */}
                    <div className="text-slate-300 font-medium mb-1.5 pb-1 border-b border-slate-600">
                        {tooltip.time}
                    </div>
                    {/* Values */}
                    <div className="space-y-1">
                        {tooltip.values.map((v, i) => (
                            <div key={i} className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-1.5">
                                    <div
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: v.color }}
                                    />
                                    <span className="text-slate-400 truncate max-w-[100px]">{v.label}</span>
                                </div>
                                <span className="text-white font-mono">{v.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Legend overlaid at bottom - transparent background */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 py-0.5 text-xs pointer-events-none">
                {panel.queries.map((query, i) => (
                    <div key={query.id || i} className="flex items-center gap-1.5 bg-slate-900/70 px-1.5 rounded">
                        <div
                            className="w-3 h-0.5 rounded-full"
                            style={{ backgroundColor: colors[i] }}
                        />
                        <span className="text-slate-400">
                            {query.alias || query.watchName || `Series ${i + 1}`}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
