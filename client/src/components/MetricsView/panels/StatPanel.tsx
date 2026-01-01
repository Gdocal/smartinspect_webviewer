/**
 * StatPanel - Big number display with optional sparkline
 */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { MetricsPanel, SERIES_COLORS } from '../../../store/metricsStore';
import { useLogStore } from '../../../store/logStore';
import { evaluateExpression, TransformContext } from '../hooks/useTransformEngine';

interface HistoryPoint {
    timestamp: number;
    value: number;
}

interface StatPanelProps {
    panel: MetricsPanel;
    width: number;
    height: number;
}

export function StatPanel({ panel, width, height }: StatPanelProps) {
    const { watches, currentRoom } = useLogStore();
    const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);

    // Get the first query's watch value
    const query = panel.queries[0];
    const watch = query ? watches[query.watchName] : null;

    // Fetch history data for sparkline
    const fetchHistoryData = useCallback(async () => {
        if (!query?.watchName || !panel.options.showSparkline) return;

        try {
            // Fetch last 5 minutes of data
            const now = Date.now();
            const from = now - 5 * 60 * 1000;

            const params = new URLSearchParams({
                from: from.toString(),
                to: now.toString(),
                resolution: 'auto',
            });

            const response = await fetch(
                `/api/watches/${encodeURIComponent(query.watchName)}/history?${params}`,
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
                setHistoryData(points);
            }
        } catch (err) {
            console.error(`Failed to fetch sparkline history:`, err);
        }
    }, [query?.watchName, panel.options.showSparkline, currentRoom]);

    // Fetch data on mount and refresh periodically
    useEffect(() => {
        fetchHistoryData();

        // Refresh every 30 seconds for full history sync
        if (panel.options.showSparkline) {
            const interval = setInterval(fetchHistoryData, 30000);
            return () => clearInterval(interval);
        }
    }, [fetchHistoryData, panel.options.showSparkline]);

    // Track last appended timestamp to avoid duplicates
    const lastAppendedTimeRef = useRef(0);

    // React to watch changes in real-time - append new data points as they arrive
    useEffect(() => {
        if (!panel.options.showSparkline || !query?.watchName || !watch) return;

        const watchTime = new Date(watch.timestamp).getTime();
        if (watchTime <= lastAppendedTimeRef.current) return;

        const value = parseFloat(String(watch.value));
        if (!isFinite(value)) return;

        lastAppendedTimeRef.current = watchTime;
        const now = Date.now();

        setHistoryData(prev => {
            const newPoints = [...prev, { timestamp: watchTime, value }];
            // Keep last 5 minutes
            const cutoff = now - 5 * 60 * 1000;
            return newPoints.filter(p => p.timestamp >= cutoff);
        });
    }, [panel.options.showSparkline, query?.watchName, watch]); // React to watch changes directly

    // Parse value and apply expression if defined
    const value = useMemo(() => {
        if (!watch) return null;
        const num = parseFloat(String(watch.value));
        if (isNaN(num)) return null;

        // Apply expression transform if defined
        if (query?.expression) {
            const ctx: TransformContext = {
                currentValue: num,
                history: historyData,
            };
            try {
                return evaluateExpression(query.expression, ctx);
            } catch {
                return num;
            }
        }

        return num;
    }, [watch, query?.expression, historyData]);

    // Format value with unit
    const formattedValue = useMemo(() => {
        if (value === null) return '—';

        const decimals = panel.options.decimals ?? 2;
        const unit = panel.options.unit || '';

        let formatted = value.toFixed(decimals);

        // Add unit suffix
        if (unit) {
            switch (unit) {
                case 'percent':
                    formatted += '%';
                    break;
                case 'ms':
                    formatted += ' ms';
                    break;
                case 'bytes':
                    if (value >= 1e9) formatted = (value / 1e9).toFixed(1) + ' GB';
                    else if (value >= 1e6) formatted = (value / 1e6).toFixed(1) + ' MB';
                    else if (value >= 1e3) formatted = (value / 1e3).toFixed(1) + ' KB';
                    else formatted += ' B';
                    break;
                case 'req/s':
                    formatted += ' req/s';
                    break;
                default:
                    formatted += ` ${unit}`;
            }
        }

        return formatted;
    }, [value, panel.options.decimals, panel.options.unit]);

    // Determine color based on thresholds
    const color = useMemo(() => {
        if (value === null || !panel.thresholds?.length) {
            return query?.color || SERIES_COLORS[0];
        }

        // Sort thresholds by value descending
        const sorted = [...panel.thresholds].sort((a, b) => b.value - a.value);

        for (const threshold of sorted) {
            if (value >= threshold.value) {
                return threshold.color;
            }
        }

        return query?.color || SERIES_COLORS[0];
    }, [value, panel.thresholds, query]);

    // Generate sparkline path from real history data only (no demo)
    const sparklinePath = useMemo(() => {
        if (!panel.options.showSparkline) return null;
        if (historyData.length < 2) return null; // Need at least 2 points for a line

        const sparkWidth = width - 32;
        const sparkHeight = height * 0.4;

        const values = historyData.map(p => p.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;

        const pathPoints = values.map((v, i) => {
            const x = (i / (values.length - 1)) * sparkWidth;
            const y = sparkHeight - ((v - min) / range) * sparkHeight;
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        });

        return pathPoints.join(' ');
    }, [historyData, width, height, panel.options.showSparkline]);

    // Calculate font size based on panel size
    const fontSize = useMemo(() => {
        if (panel.options.fontSize && panel.options.fontSize !== 'auto') {
            return {
                small: 'text-2xl',
                medium: 'text-4xl',
                large: 'text-6xl'
            }[panel.options.fontSize];
        }

        // Auto-size based on panel dimensions
        const minDim = Math.min(width, height);
        if (minDim < 100) return 'text-xl';
        if (minDim < 150) return 'text-2xl';
        if (minDim < 200) return 'text-3xl';
        if (minDim < 300) return 'text-4xl';
        return 'text-5xl';
    }, [width, height, panel.options.fontSize]);

    if (!query) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p>No query configured</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center relative overflow-hidden">
            {/* Sparkline background */}
            {sparklinePath && (
                <svg
                    className="absolute bottom-0 left-4 right-4 opacity-30"
                    style={{ height: height * 0.4 }}
                    preserveAspectRatio="none"
                >
                    <path
                        d={sparklinePath}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                    />
                </svg>
            )}

            {/* Main value */}
            <div
                className={`${fontSize} font-bold z-10`}
                style={{ color }}
            >
                {formattedValue}
            </div>

            {/* Label */}
            <div className="text-sm text-slate-400 mt-1 z-10">
                {query.alias || query.watchName}
            </div>
        </div>
    );
}
