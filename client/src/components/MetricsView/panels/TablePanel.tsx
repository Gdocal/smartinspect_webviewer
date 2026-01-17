/**
 * TablePanel - Tabular view of watches with drill-down
 */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { MetricsPanel, SERIES_COLORS } from '../../../store/metricsStore';
import { useLogStore, useWatchesForQueries } from '../../../store/logStore';

interface HistoryPoint {
    timestamp: number;
    value: number;
}

interface RowStats {
    min: number | null;
    max: number | null;
    avg: number | null;
    history: HistoryPoint[];
}

interface TablePanelProps {
    panel: MetricsPanel;
    width: number;
    height: number;
}

export function TablePanel({ panel }: TablePanelProps) {
    const currentRoom = useLogStore(state => state.currentRoom);
    // Use selector - only re-renders when specific watches in queries change
    const watchesMap = useWatchesForQueries(panel.queries);
    const [selectedRow, setSelectedRow] = useState<string | null>(null);
    const [statsData, setStatsData] = useState<Map<string, RowStats>>(new Map());

    // Fetch history data for all watches to calculate real min/max/avg
    const fetchStatsData = useCallback(async () => {
        const watchNames = panel.queries
            .map(q => q.watchName)
            .filter(Boolean);

        if (watchNames.length === 0) return;

        const now = Date.now();
        const from = now - 5 * 60 * 1000; // Last 5 minutes

        const newStats = new Map<string, RowStats>();

        await Promise.all(
            watchNames.map(async (watchName) => {
                try {
                    const params = new URLSearchParams({
                        from: from.toString(),
                        to: now.toString(),
                        resolution: 'auto',
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
                            value: p.value ?? p.avg ?? p.v ?? 0,
                        }));

                        if (points.length > 0) {
                            const values = points.map(p => p.value);
                            newStats.set(watchName, {
                                min: Math.min(...values),
                                max: Math.max(...values),
                                avg: values.reduce((a, b) => a + b, 0) / values.length,
                                history: points,
                            });
                        }
                    }
                } catch (err) {
                    console.error(`Failed to fetch stats for ${watchName}:`, err);
                }
            })
        );

        setStatsData(newStats);
    }, [panel.queries, currentRoom]);

    // Fetch data on mount and refresh periodically
    useEffect(() => {
        fetchStatsData();
        const interval = setInterval(fetchStatsData, 30000);
        return () => clearInterval(interval);
    }, [fetchStatsData]);

    // Track last appended timestamps to avoid duplicates
    const lastAppendedRef = useRef(new Map<string, number>());

    // React to watch changes in real-time - append new data points as they arrive
    useEffect(() => {
        const now = Date.now();

        panel.queries.forEach(query => {
            const watchName = query.watchName;
            if (!watchName) return;

            const watch = watchesMap[watchName];
            if (!watch) return;

            const watchTime = new Date(watch.timestamp).getTime();
            const lastTime = lastAppendedRef.current.get(watchName) || 0;

            // Only append if this is a new value
            if (watchTime <= lastTime) return;

            const value = parseFloat(String(watch.value));
            if (!isFinite(value)) return;

            lastAppendedRef.current.set(watchName, watchTime);

            setStatsData(prev => {
                const newData = new Map(prev);
                const existing = newData.get(watchName);

                if (existing) {
                    // Append new point to history
                    const newHistory = [...existing.history, { timestamp: watchTime, value }];
                    const cutoff = now - 5 * 60 * 1000;
                    const trimmed = newHistory.filter(p => p.timestamp >= cutoff);

                    if (trimmed.length > 0) {
                        const values = trimmed.map(p => p.value);
                        newData.set(watchName, {
                            min: Math.min(...values),
                            max: Math.max(...values),
                            avg: values.reduce((a, b) => a + b, 0) / values.length,
                            history: trimmed,
                        });
                    }
                }

                return newData;
            });
        });
    }, [panel.queries, watchesMap]); // React to watchesMap changes

    // Build table rows from queries with real stats
    const rows = useMemo(() => {
        return panel.queries.map((query, i) => {
            const watch = watchesMap[query.watchName];
            const value = watch ? parseFloat(String(watch.value)) : null;
            const numValue = isNaN(value as number) ? null : value;

            // Get real stats from history data
            const stats = statsData.get(query.watchName);

            return {
                name: query.alias || query.watchName || `Row ${i + 1}`,
                watchName: query.watchName,
                current: numValue,
                min: stats?.min ?? null,
                max: stats?.max ?? null,
                avg: stats?.avg ?? null,
                history: stats?.history ?? [],
                lastUpdate: watch?.timestamp || null,
                color: query.color || SERIES_COLORS[i % SERIES_COLORS.length]
            };
        }).filter(r => r.watchName);
    }, [panel.queries, watchesMap, statsData]);

    // Format value
    const formatValue = (val: number | null) => {
        if (val === null) return '—';
        return val.toFixed(panel.options.decimals ?? 2);
    };

    // Format timestamp
    const formatTime = (ts: string | null) => {
        if (!ts) return '—';
        const date = new Date(ts);
        return date.toLocaleTimeString();
    };

    if (panel.queries.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p>No queries configured</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto">
            <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-700">
                    <tr>
                        <th className="text-left px-2 py-1 font-medium text-slate-600 dark:text-slate-300">Name</th>
                        <th className="text-right px-2 py-1 font-medium text-slate-600 dark:text-slate-300">Current</th>
                        <th className="text-right px-2 py-1 font-medium text-slate-600 dark:text-slate-300">Min</th>
                        <th className="text-right px-2 py-1 font-medium text-slate-600 dark:text-slate-300">Max</th>
                        <th className="text-right px-2 py-1 font-medium text-slate-600 dark:text-slate-300">Avg</th>
                        <th className="text-right px-2 py-1 font-medium text-slate-600 dark:text-slate-300">Updated</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr
                            key={i}
                            onClick={() => setSelectedRow(selectedRow === row.watchName ? null : row.watchName)}
                            className={`cursor-pointer transition-colors ${
                                selectedRow === row.watchName
                                    ? 'bg-blue-50 dark:bg-blue-900/30'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                        >
                            <td className="px-2 py-1.5">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: row.color }}
                                    />
                                    <span className="text-slate-700 dark:text-slate-300 truncate">
                                        {row.name}
                                    </span>
                                </div>
                            </td>
                            <td className="text-right px-2 py-1.5 font-mono text-slate-600 dark:text-slate-400">
                                {formatValue(row.current)}
                            </td>
                            <td className="text-right px-2 py-1.5 font-mono text-slate-500 dark:text-slate-500">
                                {formatValue(row.min)}
                            </td>
                            <td className="text-right px-2 py-1.5 font-mono text-slate-500 dark:text-slate-500">
                                {formatValue(row.max)}
                            </td>
                            <td className="text-right px-2 py-1.5 font-mono text-slate-500 dark:text-slate-500">
                                {formatValue(row.avg)}
                            </td>
                            <td className="text-right px-2 py-1.5 text-slate-400 dark:text-slate-500">
                                {formatTime(row.lastUpdate)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Mini chart popup for selected row */}
            {selectedRow && (() => {
                const row = rows.find(r => r.watchName === selectedRow);
                const history = row?.history || [];

                // Generate sparkline path
                let sparklinePath = '';
                if (history.length > 1) {
                    const values = history.map(p => p.value);
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    const range = max - min || 1;
                    const chartWidth = 220;
                    const chartHeight = 60;

                    sparklinePath = values.map((v, i) => {
                        const x = (i / (values.length - 1)) * chartWidth;
                        const y = chartHeight - ((v - min) / range) * chartHeight;
                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ');
                }

                return (
                    <div className="absolute bottom-2 right-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 p-3 w-64">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {row?.name}
                            </span>
                            <button
                                onClick={() => setSelectedRow(null)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="h-20 bg-slate-50 dark:bg-slate-700/50 rounded overflow-hidden">
                            {sparklinePath ? (
                                <svg width="220" height="60" className="w-full h-full p-2">
                                    <path
                                        d={sparklinePath}
                                        fill="none"
                                        stroke={row?.color || '#5794f2'}
                                        strokeWidth={2}
                                    />
                                </svg>
                            ) : (
                                <div className="flex items-center justify-center h-full text-xs text-slate-400">
                                    No history data
                                </div>
                            )}
                        </div>
                        {row && (row.min !== null || row.max !== null || row.avg !== null) && (
                            <div className="flex justify-between mt-2 text-xs text-slate-500">
                                <span>Min: {row.min !== null ? row.min.toFixed(2) : '—'}</span>
                                <span>Avg: {row.avg !== null ? row.avg.toFixed(2) : '—'}</span>
                                <span>Max: {row.max !== null ? row.max.toFixed(2) : '—'}</span>
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}
