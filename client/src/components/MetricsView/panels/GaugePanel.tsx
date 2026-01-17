/**
 * GaugePanel - Circular gauge with threshold colors
 */

import { useMemo } from 'react';
import { MetricsPanel, SERIES_COLORS } from '../../../store/metricsStore';
import { useWatch } from '../../../store/logStore';

interface GaugePanelProps {
    panel: MetricsPanel;
    width: number;
    height: number;
}

export function GaugePanel({ panel, width, height }: GaugePanelProps) {
    const query = panel.queries[0];
    // Use selector - only re-renders when this specific watch changes
    const watch = useWatch(query?.watchName ?? '');

    const min = panel.options.min ?? 0;
    const max = panel.options.max ?? 100;

    // Parse value
    const value = useMemo(() => {
        if (!watch) return null;
        const num = parseFloat(String(watch.value));
        return isNaN(num) ? null : num;
    }, [watch]);

    // Calculate percentage (clamped)
    const percentage = useMemo(() => {
        if (value === null) return 0;
        const range = max - min;
        if (range === 0) return 0;
        return Math.max(0, Math.min(100, ((value - min) / range) * 100));
    }, [value, min, max]);

    // Determine color based on thresholds
    const color = useMemo(() => {
        if (value === null || !panel.thresholds?.length) {
            return query?.color || SERIES_COLORS[0];
        }

        const sorted = [...panel.thresholds].sort((a, b) => b.value - a.value);

        for (const threshold of sorted) {
            if (value >= threshold.value) {
                return threshold.color;
            }
        }

        return query?.color || SERIES_COLORS[0];
    }, [value, panel.thresholds, query]);

    // Format value
    const formattedValue = useMemo(() => {
        if (value === null) return '—';
        const decimals = panel.options.decimals ?? 0;
        return value.toFixed(decimals);
    }, [value, panel.options.decimals]);

    // SVG dimensions
    const size = Math.min(width - 32, height - 60);
    const cx = size / 2;
    const cy = size / 2;
    const radius = (size / 2) - 10;
    const strokeWidth = 12;

    // Arc calculations (180 degree arc from left to right)
    const startAngle = 135; // degrees
    const endAngle = 405; // degrees (135 + 270)
    const arcAngle = 270; // total arc

    const polarToCartesian = (angle: number) => {
        const rad = (angle - 90) * Math.PI / 180;
        return {
            x: cx + radius * Math.cos(rad),
            y: cy + radius * Math.sin(rad)
        };
    };

    const start = polarToCartesian(startAngle);
    const end = polarToCartesian(endAngle);
    const valueAngle = startAngle + (percentage / 100) * arcAngle;
    const valueEnd = polarToCartesian(valueAngle);

    // Background arc path
    const bgPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;

    // Value arc path
    const largeArc = percentage > 50 ? 1 : 0;
    const valuePath = percentage > 0
        ? `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${valueEnd.x} ${valueEnd.y}`
        : '';

    if (!query) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>No query configured</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center">
            <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`}>
                {/* Background arc */}
                <path
                    d={bgPath}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />

                {/* Value arc */}
                {valuePath && (
                    <path
                        d={valuePath}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                )}

                {/* Center value */}
                <text
                    x={cx}
                    y={cy - 5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-2xl font-bold"
                    fill={color}
                >
                    {formattedValue}
                </text>

                {/* Min/Max labels */}
                {panel.options.showMinMax !== false && (
                    <>
                        <text
                            x={start.x - 5}
                            y={start.y + 15}
                            textAnchor="start"
                            className="text-xs"
                            fill="#94a3b8"
                        >
                            {min}
                        </text>
                        <text
                            x={end.x + 5}
                            y={end.y + 15}
                            textAnchor="end"
                            className="text-xs"
                            fill="#94a3b8"
                        >
                            {max}
                        </text>
                    </>
                )}
            </svg>

            {/* Label */}
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {query.alias || query.watchName}
            </div>
        </div>
    );
}
