/**
 * ThreadLinesPanel - Vertical swimlanes showing context lifecycle
 *
 * Displays colored vertical lines for each active context value,
 * helping visualize parallel operations and their lifecycle.
 *
 * Features:
 * - User-configurable context keys as columns
 * - Shows only values active in current viewport
 * - Expandable to show all values vs viewport only
 * - Click to fade/filter by context value
 * - Synced scrolling with VirtualLogGrid
 */

import { memo, useMemo, useCallback, useState, useRef } from 'react';
import { LogEntry, useLogStore } from '../../store/logStore';
import { VirtualItem } from '@tanstack/react-virtual';

// Generate consistent color from string
function getHueFromString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash % 360);
}

// Get color for a context value
function getContextColor(value: string, saturation = 70, lightness = 50): string {
    const hue = getHueFromString(value);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export interface ThreadLineColumn {
    key: string;        // Context key (e.g., "requestId", "userId")
    label?: string;     // Display label (defaults to key)
    width?: number;     // Column width in pixels (default 16)
}

export interface ThreadLinesPanelProps {
    /** Log entries (same as grid) */
    entries: LogEntry[];
    /** Virtual items from the grid's virtualizer */
    virtualItems: VirtualItem[];
    /** Row height (must match grid) */
    rowHeight: number;
    /** Header height (must match grid) */
    headerHeight: number;
    /** Total virtual height */
    totalHeight: number;
    /** Scroll top position (synced with grid) */
    scrollTop: number;
    /** Callback when scroll position changes */
    onScroll?: (scrollTop: number) => void;
    /** Theme */
    theme?: 'light' | 'dark';
    /** Available context keys (from data) */
    availableKeys?: string[];
}

interface ContextValueInfo {
    value: string;
    color: string;
    count: number;
    firstIndex: number;
    lastIndex: number;
}

export const ThreadLinesPanel = memo(function ThreadLinesPanel({
    entries,
    virtualItems,
    rowHeight: _rowHeight,
    headerHeight,
    totalHeight: _totalHeight,
    scrollTop,
    onScroll,
    theme = 'dark',
    availableKeys = [],
}: ThreadLinesPanelProps) {
    void _rowHeight; // Row height passed for future use
    void _totalHeight; // Total height passed but using transform instead
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [showAllValues, setShowAllValues] = useState(false);

    // Get store state
    const {
        contextFadeFilter,
        setContextFadeFilter,
        threadLineColumns,
        setThreadLineColumns,
    } = useLogStore();

    // We use scrollTop to offset the rendered items (no independent scrolling)
    void onScroll; // Not needed since we don't scroll independently

    // Compute active context values in viewport
    const viewportContexts = useMemo(() => {
        const result: Map<string, Map<string, ContextValueInfo>> = new Map();

        // Initialize maps for each configured column
        for (const col of threadLineColumns) {
            result.set(col.key, new Map());
        }

        // Scan viewport entries
        for (const virtualRow of virtualItems) {
            const entry = entries[virtualRow.index];
            if (!entry?.ctx) continue;

            for (const col of threadLineColumns) {
                const value = entry.ctx[col.key];
                if (!value) continue;

                const keyMap = result.get(col.key)!;
                const existing = keyMap.get(value);

                if (existing) {
                    existing.count++;
                    existing.lastIndex = virtualRow.index;
                } else {
                    keyMap.set(value, {
                        value,
                        color: getContextColor(value),
                        count: 1,
                        firstIndex: virtualRow.index,
                        lastIndex: virtualRow.index,
                    });
                }
            }
        }

        return result;
    }, [virtualItems, entries, threadLineColumns]);

    // Compute all context values (for expanded mode)
    const allContexts = useMemo(() => {
        if (!showAllValues) return viewportContexts;

        const result: Map<string, Map<string, ContextValueInfo>> = new Map();

        for (const col of threadLineColumns) {
            result.set(col.key, new Map());
        }

        // Scan ALL entries
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (!entry?.ctx) continue;

            for (const col of threadLineColumns) {
                const value = entry.ctx[col.key];
                if (!value) continue;

                const keyMap = result.get(col.key)!;
                const existing = keyMap.get(value);

                if (existing) {
                    existing.count++;
                    existing.lastIndex = i;
                } else {
                    keyMap.set(value, {
                        value,
                        color: getContextColor(value),
                        count: 1,
                        firstIndex: i,
                        lastIndex: i,
                    });
                }
            }
        }

        return result;
    }, [showAllValues, viewportContexts, entries, threadLineColumns]);

    // Handle clicking on a context value - toggle fade
    const handleValueClick = useCallback((key: string, value: string) => {
        if (contextFadeFilter?.key === key && contextFadeFilter?.value === value) {
            setContextFadeFilter(null);
        } else {
            setContextFadeFilter({ key, value });
        }
    }, [contextFadeFilter, setContextFadeFilter]);

    // Add a new column
    const handleAddColumn = useCallback((key: string) => {
        if (!threadLineColumns.find(c => c.key === key)) {
            setThreadLineColumns([...threadLineColumns, { key, width: 16 }]);
        }
    }, [threadLineColumns, setThreadLineColumns]);

    // Remove a column
    const handleRemoveColumn = useCallback((key: string) => {
        setThreadLineColumns(threadLineColumns.filter(c => c.key !== key));
    }, [threadLineColumns, setThreadLineColumns]);

    // Get keys not yet added as columns
    const unusedKeys = useMemo(() => {
        const usedKeys = new Set(threadLineColumns.map(c => c.key));
        return availableKeys.filter(k => !usedKeys.has(k));
    }, [availableKeys, threadLineColumns]);

    // Total width of all columns
    const totalColumnsWidth = useMemo(() => {
        return threadLineColumns.reduce((sum, col) => sum + (col.width || 16), 0);
    }, [threadLineColumns]);

    if (!isExpanded) {
        // Collapsed state - just show expand button
        return (
            <div className={`thread-lines-panel collapsed ${theme}`}>
                <button
                    className="thread-lines-expand-btn"
                    onClick={() => setIsExpanded(true)}
                    title="Expand Thread Lines"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        );
    }

    return (
        <div className={`thread-lines-panel ${theme}`} style={{ width: Math.max(totalColumnsWidth + 40, 80) }}>
            {/* Header */}
            <div className="thread-lines-header" style={{ height: headerHeight }}>
                <div className="thread-lines-header-controls">
                    <button
                        className="thread-lines-collapse-btn"
                        onClick={() => setIsExpanded(false)}
                        title="Collapse"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>

                    {/* Column headers */}
                    <div className="thread-lines-column-headers">
                        {threadLineColumns.map(col => (
                            <div
                                key={col.key}
                                className="thread-lines-column-header"
                                style={{ width: col.width || 16 }}
                                title={col.key}
                            >
                                <span className="thread-lines-column-label">
                                    {(col.label || col.key).charAt(0).toUpperCase()}
                                </span>
                                <button
                                    className="thread-lines-column-remove"
                                    onClick={() => handleRemoveColumn(col.key)}
                                    title={`Remove ${col.key}`}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Add column dropdown */}
                    {unusedKeys.length > 0 && (
                        <div className="thread-lines-add-dropdown">
                            <select
                                onChange={(e) => {
                                    if (e.target.value) {
                                        handleAddColumn(e.target.value);
                                        e.target.value = '';
                                    }
                                }}
                                value=""
                                title="Add context column"
                            >
                                <option value="">+</option>
                                {unusedKeys.map(key => (
                                    <option key={key} value={key}>{key}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Toggle viewport/all */}
                <button
                    className={`thread-lines-toggle-all ${showAllValues ? 'active' : ''}`}
                    onClick={() => setShowAllValues(!showAllValues)}
                    title={showAllValues ? 'Show viewport only' : 'Show all values'}
                >
                    {showAllValues ? 'All' : 'View'}
                </button>
            </div>

            {/* Display area - no independent scroll, uses transform to sync with grid */}
            <div
                ref={scrollContainerRef}
                className="thread-lines-scroll"
                style={{ height: `calc(100% - ${headerHeight}px)`, overflow: 'hidden' }}
            >
                <div
                    className="thread-lines-inner"
                    style={{
                        position: 'relative',
                        transform: `translateY(-${scrollTop}px)`,
                        willChange: 'transform',
                    }}
                >
                    {/* Render lines for each row */}
                    {virtualItems.map((virtualRow) => {
                        const entry = entries[virtualRow.index];
                        if (!entry) return null;

                        return (
                            <div
                                key={virtualRow.key}
                                className="thread-lines-row"
                                style={{
                                    position: 'absolute',
                                    top: virtualRow.start,
                                    height: virtualRow.size,
                                    width: '100%',
                                }}
                            >
                                {threadLineColumns.map(col => {
                                    const value = entry.ctx?.[col.key];
                                    const isActive = contextFadeFilter?.key === col.key &&
                                        contextFadeFilter?.value === value;

                                    return (
                                        <div
                                            key={col.key}
                                            className={`thread-line-cell ${value ? 'has-value' : ''} ${isActive ? 'active' : ''}`}
                                            style={{
                                                width: col.width || 16,
                                                backgroundColor: value ? getContextColor(value) : 'transparent',
                                            }}
                                            onClick={() => value && handleValueClick(col.key, value)}
                                            title={value ? `${col.key}: ${value}` : undefined}
                                        />
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Legend - shows active values */}
            {threadLineColumns.length > 0 && (
                <div className="thread-lines-legend">
                    {threadLineColumns.map(col => {
                        const values = (showAllValues ? allContexts : viewportContexts).get(col.key);
                        if (!values || values.size === 0) return null;

                        return (
                            <div key={col.key} className="thread-lines-legend-group">
                                <div className="thread-lines-legend-key">{col.key}</div>
                                <div className="thread-lines-legend-values">
                                    {Array.from(values.values())
                                        .sort((a, b) => b.count - a.count)
                                        .slice(0, 5)
                                        .map(info => {
                                            const isActive = contextFadeFilter?.key === col.key &&
                                                contextFadeFilter?.value === info.value;
                                            return (
                                                <button
                                                    key={info.value}
                                                    className={`thread-lines-legend-value ${isActive ? 'active' : ''}`}
                                                    style={{ '--value-color': info.color } as React.CSSProperties}
                                                    onClick={() => handleValueClick(col.key, info.value)}
                                                    title={`${info.value} (${info.count} entries)`}
                                                >
                                                    <span className="thread-lines-legend-color" />
                                                    <span className="thread-lines-legend-text">
                                                        {info.value.length > 8 ? info.value.slice(0, 8) + '...' : info.value}
                                                    </span>
                                                    <span className="thread-lines-legend-count">{info.count}</span>
                                                </button>
                                            );
                                        })}
                                    {values.size > 5 && (
                                        <span className="thread-lines-legend-more">
                                            +{values.size - 5} more
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});

export default ThreadLinesPanel;
