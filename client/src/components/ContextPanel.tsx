/**
 * ContextPanel - Side panel for exploring and filtering by context tags
 *
 * Features:
 * - Lists all context keys with statistics (unique values, total entries)
 * - Expandable keys to show values with counts
 * - Click to filter entries by context value
 * - Search/filter within values
 * - Responsive to density settings
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLogStore } from '../store/logStore';

// Types for context API responses
interface ContextKeySummary {
    uniqueValues: number;
    totalEntries: number;
    lastSeen: string | null;
}

interface ContextKeysResponse {
    keys: string[];
    summary: Record<string, ContextKeySummary>;
    room: string;
}

interface ContextValue {
    value: string;
    count: number;
    lastSeen: string | null;
}

interface ContextValuesResponse {
    key: string;
    values: ContextValue[];
    total: number;
    room: string;
}

// Density configuration matching other panels
const DENSITY_CONFIG = {
    compact: {
        headerHeight: 'h-[32px]',
        headerPx: 'px-2',
        headerText: 'text-[10px]',
        headerIconSize: 'w-3 h-3',
        filterBarHeight: 'h-[32px]',
        filterPx: 'px-2',
        filterInputHeight: 'h-[22px]',
        filterInputText: 'text-xs',
        filterInputPl: 'pl-7',
        filterIconSize: 'w-3.5 h-3.5',
        filterIconLeft: 'left-2',
        itemPy: 'py-1',
        itemPx: 'px-2',
        itemText: 'text-[11px]',
        countBadge: 'text-[9px] px-1.5',
        footerPx: 'px-2',
        footerPy: 'py-1',
        footerText: 'text-[10px]',
    },
    default: {
        headerHeight: 'h-[36px]',
        headerPx: 'px-3',
        headerText: 'text-xs',
        headerIconSize: 'w-3.5 h-3.5',
        filterBarHeight: 'h-[36px]',
        filterPx: 'px-2',
        filterInputHeight: 'h-[24px]',
        filterInputText: 'text-xs',
        filterInputPl: 'pl-7',
        filterIconSize: 'w-3.5 h-3.5',
        filterIconLeft: 'left-2',
        itemPy: 'py-1.5',
        itemPx: 'px-2',
        itemText: 'text-xs',
        countBadge: 'text-[10px] px-1.5',
        footerPx: 'px-2',
        footerPy: 'py-1.5',
        footerText: 'text-xs',
    },
    comfortable: {
        headerHeight: 'h-[42px]',
        headerPx: 'px-4',
        headerText: 'text-xs',
        headerIconSize: 'w-3.5 h-3.5',
        filterBarHeight: 'h-[42px]',
        filterPx: 'px-3',
        filterInputHeight: 'h-[28px]',
        filterInputText: 'text-sm',
        filterInputPl: 'pl-8',
        filterIconSize: 'w-4 h-4',
        filterIconLeft: 'left-2.5',
        itemPy: 'py-2',
        itemPx: 'px-3',
        itemText: 'text-sm',
        countBadge: 'text-xs px-2',
        footerPx: 'px-3',
        footerPy: 'py-2',
        footerText: 'text-xs',
    },
};

export function ContextPanel() {
    const { currentRoom, rowDensity, setShowContextPanel, contextFadeFilter, setContextFadeFilter, contextRibbonKey, setContextRibbonKey, threadLineColumns, toggleThreadLineColumn } = useLogStore();
    const density = DENSITY_CONFIG[rowDensity];

    // State
    const [contextKeys, setContextKeys] = useState<ContextKeysResponse | null>(null);
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [keyValues, setKeyValues] = useState<Record<string, ContextValuesResponse>>({});
    const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
    const [filterText, setFilterText] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch context keys on mount and when room changes
    const fetchContextKeys = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/contexts?room=${encodeURIComponent(currentRoom)}`);
            if (!response.ok) throw new Error(`Failed to fetch contexts: ${response.status}`);
            const data: ContextKeysResponse = await response.json();
            setContextKeys(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load contexts');
        } finally {
            setLoading(false);
        }
    }, [currentRoom]);

    useEffect(() => {
        fetchContextKeys();
        // Refresh every 5 seconds
        const interval = setInterval(fetchContextKeys, 5000);
        return () => clearInterval(interval);
    }, [fetchContextKeys]);

    // Fetch values for a specific key
    const fetchKeyValues = useCallback(async (key: string) => {
        setLoadingKeys(prev => new Set(prev).add(key));
        try {
            const response = await fetch(
                `/api/contexts/${encodeURIComponent(key)}?room=${encodeURIComponent(currentRoom)}&limit=100`
            );
            if (!response.ok) throw new Error(`Failed to fetch values for ${key}`);
            const data: ContextValuesResponse = await response.json();
            setKeyValues(prev => ({ ...prev, [key]: data }));
        } catch (err) {
            console.error(`Error fetching values for ${key}:`, err);
        } finally {
            setLoadingKeys(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    }, [currentRoom]);

    // Toggle key expansion
    const toggleKeyExpansion = useCallback((key: string) => {
        setExpandedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
                // Fetch values if not already loaded
                if (!keyValues[key]) {
                    fetchKeyValues(key);
                }
            }
            return next;
        });
    }, [keyValues, fetchKeyValues]);

    // Filter keys and values based on search
    const filteredKeys = useMemo(() => {
        if (!contextKeys) return [];
        if (!filterText.trim()) return contextKeys.keys;

        const search = filterText.toLowerCase();
        return contextKeys.keys.filter(key => {
            // Match key name
            if (key.toLowerCase().includes(search)) return true;
            // Match any value in expanded key
            const values = keyValues[key];
            if (values) {
                return values.values.some(v => v.value.toLowerCase().includes(search));
            }
            return false;
        });
    }, [contextKeys, filterText, keyValues]);

    // Filter values for a key
    const getFilteredValues = useCallback((key: string): ContextValue[] => {
        const values = keyValues[key];
        if (!values) return [];
        if (!filterText.trim()) return values.values;

        const search = filterText.toLowerCase();
        return values.values.filter(v => v.value.toLowerCase().includes(search));
    }, [keyValues, filterText]);

    // Handle clicking on a context value - toggle fade filter
    const handleValueClick = useCallback((key: string, value: string) => {
        // Toggle fade filter - if same filter is active, clear it
        if (contextFadeFilter && contextFadeFilter.key === key && contextFadeFilter.value === value) {
            setContextFadeFilter(null);
        } else {
            setContextFadeFilter({ key, value });
        }
    }, [contextFadeFilter, setContextFadeFilter]);

    // Handle toggling ribbon for a context key
    const handleRibbonToggle = useCallback((key: string) => {
        // Toggle ribbon - if same key is active, clear it
        if (contextRibbonKey === key) {
            setContextRibbonKey(null);
        } else {
            setContextRibbonKey(key);
        }
    }, [contextRibbonKey, setContextRibbonKey]);

    // Handle toggling thread line column for a context key
    const handleThreadLineToggle = useCallback((key: string) => {
        toggleThreadLineColumn(key);
    }, [toggleThreadLineColumn]);

    // Copy value to clipboard
    const handleCopyValue = useCallback((value: string) => {
        navigator.clipboard?.writeText(value);
    }, []);

    if (loading && !contextKeys) {
        return (
            <div className="h-full flex flex-col bg-white dark:bg-slate-800">
                <Header density={density} onClose={() => setShowContextPanel(false)} />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-slate-400 dark:text-slate-500 text-sm">Loading contexts...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex flex-col bg-white dark:bg-slate-800">
                <Header density={density} onClose={() => setShowContextPanel(false)} />
                <div className="flex-1 flex items-center justify-center p-4">
                    <div className="text-red-500 dark:text-red-400 text-sm text-center">
                        {error}
                        <button
                            onClick={fetchContextKeys}
                            className="mt-2 block mx-auto text-blue-500 hover:text-blue-600"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const hasContexts = contextKeys && contextKeys.keys.length > 0;

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800">
            <Header density={density} onClose={() => setShowContextPanel(false)} />

            {/* Search bar */}
            {hasContexts && (
                <div className={`bg-slate-50 dark:bg-slate-700/50 ${density.filterPx} ${density.filterBarHeight} border-b border-slate-200 dark:border-slate-600 flex items-center`}>
                    <div className="relative flex-1">
                        <svg
                            className={`absolute ${density.filterIconLeft} top-1/2 -translate-y-1/2 ${density.filterIconSize} text-slate-400`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            placeholder="Search contexts..."
                            className={`w-full ${density.filterInputHeight} ${density.filterInputPl} pr-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded ${density.filterInputText} text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
                        />
                        {filterText && (
                            <button
                                onClick={() => setFilterText('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Context list */}
            <div className="flex-1 overflow-y-auto">
                {!hasContexts ? (
                    <div className="flex items-center justify-center h-full p-4">
                        <div className="text-center">
                            <svg className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">No context tags found</p>
                            <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                                Send logs with context tags to see them here
                            </p>
                        </div>
                    </div>
                ) : filteredKeys.length === 0 ? (
                    <div className="flex items-center justify-center h-32">
                        <p className="text-slate-400 dark:text-slate-500 text-sm">No matches found</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {filteredKeys.map(key => (
                            <ContextKeyItem
                                key={key}
                                contextKey={key}
                                summary={contextKeys!.summary[key]}
                                isExpanded={expandedKeys.has(key)}
                                isLoading={loadingKeys.has(key)}
                                values={getFilteredValues(key)}
                                onToggle={() => toggleKeyExpansion(key)}
                                onValueClick={handleValueClick}
                                onCopyValue={handleCopyValue}
                                onRibbonToggle={handleRibbonToggle}
                                onThreadLineToggle={handleThreadLineToggle}
                                density={density}
                                activeFilter={contextFadeFilter}
                                ribbonKey={contextRibbonKey}
                                hasThreadLine={threadLineColumns.some(c => c.key === key)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Footer with stats */}
            {hasContexts && (
                <div className={`bg-slate-50 dark:bg-slate-700/50 ${density.footerPx} ${density.footerPy} border-t border-slate-200 dark:border-slate-600 flex items-center justify-between ${density.footerText} text-slate-500 dark:text-slate-400`}>
                    <span>{contextKeys!.keys.length} context keys</span>
                    <button
                        onClick={fetchContextKeys}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        title="Refresh"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}

// Header component
function Header({ density, onClose }: { density: typeof DENSITY_CONFIG['default']; onClose: () => void }) {
    return (
        <div className={`bg-slate-50 dark:bg-slate-800 ${density.headerPx} ${density.headerHeight} border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0`}>
            <span className={`font-medium ${density.headerText} text-slate-600 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide`}>
                <svg className={`${density.headerIconSize} text-slate-400 dark:text-slate-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Context
            </span>
            <button
                onClick={onClose}
                className={`text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700`}
                title="Close context panel"
            >
                <svg className={density.headerIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

// Context key item with expandable values
interface ContextKeyItemProps {
    contextKey: string;
    summary: ContextKeySummary;
    isExpanded: boolean;
    isLoading: boolean;
    values: ContextValue[];
    onToggle: () => void;
    onValueClick: (key: string, value: string) => void;
    onCopyValue: (value: string) => void;
    onRibbonToggle: (key: string) => void;
    onThreadLineToggle: (key: string) => void;
    density: typeof DENSITY_CONFIG['default'];
    activeFilter: { key: string; value: string } | null;
    ribbonKey: string | null;
    hasThreadLine: boolean;
}

function ContextKeyItem({
    contextKey,
    summary,
    isExpanded,
    isLoading,
    values,
    onToggle,
    onValueClick,
    onCopyValue,
    onRibbonToggle,
    onThreadLineToggle,
    density,
    activeFilter,
    ribbonKey,
    hasThreadLine,
}: ContextKeyItemProps) {
    // Check if this key has the active filter
    const hasActiveFilter = activeFilter && activeFilter.key === contextKey;
    const hasRibbon = ribbonKey === contextKey;
    return (
        <div>
            {/* Key header */}
            <div className={`w-full ${density.itemPx} ${density.itemPy} flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors`}>
                {/* Expand toggle */}
                <button
                    onClick={onToggle}
                    className="flex items-center gap-2 flex-1 text-left"
                >
                    {/* Expand icon */}
                    <svg
                        className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>

                    {/* Key name */}
                    <span className={`${density.itemText} font-medium text-slate-700 dark:text-slate-200 flex-1`}>
                        {contextKey}
                    </span>
                </button>

                {/* Thread Line toggle button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onThreadLineToggle(contextKey); }}
                    className={`p-1 rounded transition-colors ${
                        hasThreadLine
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    title={hasThreadLine ? 'Remove from thread lines' : 'Add to thread lines'}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 4v16M12 4v16M16 4v16" />
                    </svg>
                </button>

                {/* Ribbon toggle button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onRibbonToggle(contextKey); }}
                    className={`p-1 rounded transition-colors ${
                        hasRibbon
                            ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    title={hasRibbon ? 'Disable color ribbon' : 'Enable color ribbon'}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>

                {/* Stats badges */}
                <span className={`${density.countBadge} py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium`}>
                    {summary.uniqueValues} values
                </span>
                <span className={`${density.countBadge} py-0.5 rounded-full bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300`}>
                    {summary.totalEntries} entries
                </span>
            </div>

            {/* Expanded values */}
            {isExpanded && (
                <div className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
                    {isLoading ? (
                        <div className={`${density.itemPx} ${density.itemPy} text-slate-400 dark:text-slate-500 ${density.itemText}`}>
                            Loading values...
                        </div>
                    ) : values.length === 0 ? (
                        <div className={`${density.itemPx} ${density.itemPy} text-slate-400 dark:text-slate-500 ${density.itemText}`}>
                            No values found
                        </div>
                    ) : (
                        <div className="max-h-60 overflow-y-auto">
                            {values.map(v => {
                                const isActive = hasActiveFilter && activeFilter!.value === v.value;
                                return (
                                    <div
                                        key={v.value}
                                        className={`${density.itemPx} ${density.itemPy} pl-8 flex items-center gap-2 cursor-pointer group transition-colors ${
                                            isActive
                                                ? 'bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900/70'
                                                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                        onClick={() => onValueClick(contextKey, v.value)}
                                    >
                                        {/* Active indicator */}
                                        {isActive && (
                                            <svg className="w-3 h-3 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                        <span className={`${density.itemText} flex-1 truncate font-mono ${
                                            isActive
                                                ? 'text-blue-700 dark:text-blue-200 font-medium'
                                                : 'text-slate-600 dark:text-slate-300'
                                        }`} title={v.value}>
                                            {v.value}
                                        </span>
                                        <span className={`${density.countBadge} py-0.5 rounded-full ${
                                            isActive
                                                ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200'
                                                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                        }`}>
                                            {v.count}
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCopyValue(v.value); }}
                                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-opacity"
                                            title="Copy value"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
