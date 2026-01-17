/**
 * BarPanel - Bar chart comparing multiple watches
 */

import { useMemo } from 'react';
import { MetricsPanel, SERIES_COLORS } from '../../../store/metricsStore';
import { useWatchesForQueries } from '../../../store/logStore';

interface BarPanelProps {
    panel: MetricsPanel;
    width: number;
    height: number;
}

export function BarPanel({ panel, width, height }: BarPanelProps) {
    // Use selector - only re-renders when the specific watches in queries change
    const watchesMap = useWatchesForQueries(panel.queries);

    // Get values for all queries
    const bars = useMemo(() => {
        return panel.queries.map((query, i) => {
            const watch = watchesMap[query.watchName];
            const value = watch ? parseFloat(String(watch.value)) : null;

            return {
                label: query.alias || query.watchName || `Bar ${i + 1}`,
                value: isNaN(value as number) ? 0 : (value || 0),
                color: query.color || SERIES_COLORS[i % SERIES_COLORS.length]
            };
        }).filter(b => b.label);
    }, [panel.queries, watchesMap]);

    // Sort if needed
    const sortedBars = useMemo(() => {
        if (panel.options.sortBy === 'value') {
            return [...bars].sort((a, b) => b.value - a.value);
        }
        if (panel.options.sortBy === 'name') {
            return [...bars].sort((a, b) => a.label.localeCompare(b.label));
        }
        return bars;
    }, [bars, panel.options.sortBy]);

    // Calculate max value for scaling
    const maxValue = useMemo(() => {
        const max = Math.max(...sortedBars.map(b => b.value), 0);
        return max || 100;
    }, [sortedBars]);

    const isHorizontal = panel.options.orientation === 'horizontal';
    const barSpacing = 8;
    const labelSpace = 60;

    if (panel.queries.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2" />
                    </svg>
                    <p>No queries configured</p>
                </div>
            </div>
        );
    }

    if (isHorizontal) {
        const availableHeight = height - 20;
        const barHeight = Math.min(30, (availableHeight - (sortedBars.length - 1) * barSpacing) / sortedBars.length);

        return (
            <div className="h-full flex flex-col justify-center px-2">
                {sortedBars.map((bar, i) => (
                    <div key={i} className="flex items-center gap-2" style={{ marginBottom: i < sortedBars.length - 1 ? barSpacing : 0 }}>
                        <div
                            className="text-xs text-slate-600 dark:text-slate-400 truncate text-right"
                            style={{ width: labelSpace }}
                            title={bar.label}
                        >
                            {bar.label}
                        </div>
                        <div className="flex-1 h-full flex items-center">
                            <div
                                className="rounded transition-all duration-300"
                                style={{
                                    width: `${(bar.value / maxValue) * 100}%`,
                                    height: barHeight,
                                    backgroundColor: bar.color,
                                    minWidth: bar.value > 0 ? 4 : 0
                                }}
                            />
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 w-10 text-right">
                            {bar.value.toFixed(panel.options.decimals ?? 0)}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // Vertical bars
    const availableWidth = width - 20;
    const barWidth = Math.min(40, (availableWidth - (sortedBars.length - 1) * barSpacing) / sortedBars.length);
    const availableHeight = height - 50;

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 flex items-end justify-center gap-2 px-2">
                {sortedBars.map((bar, i) => (
                    <div key={i} className="flex flex-col items-center">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                            {bar.value.toFixed(panel.options.decimals ?? 0)}
                        </div>
                        <div
                            className="rounded-t transition-all duration-300"
                            style={{
                                width: barWidth,
                                height: `${(bar.value / maxValue) * availableHeight}px`,
                                backgroundColor: bar.color,
                                minHeight: bar.value > 0 ? 4 : 0
                            }}
                        />
                    </div>
                ))}
            </div>
            <div className="flex justify-center gap-2 px-2 py-1">
                {sortedBars.map((bar, i) => (
                    <div
                        key={i}
                        className="text-xs text-slate-600 dark:text-slate-400 truncate text-center"
                        style={{ width: barWidth }}
                        title={bar.label}
                    >
                        {bar.label}
                    </div>
                ))}
            </div>
        </div>
    );
}
