/**
 * WatchPanel - Table-based watch values display with filtering
 * Features flash animation when values change
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useLogStore } from '../store/logStore';
import { format } from 'date-fns';

// Density-based sizing configuration
// Filter settings match FilterBar for consistency
const DENSITY_CONFIG = {
    compact: {
        headerPx: 'px-2',
        headerPy: 'py-1',
        headerText: 'text-[10px]',
        headerIconSize: 'w-3 h-3',
        // Filter bar - matches FilterBar exactly
        filterBarHeight: 'h-[32px]',
        filterPx: 'px-2',
        filterInputHeight: 'h-[22px]',
        filterInputText: 'text-xs',
        filterInputPl: 'pl-7',
        filterIconSize: 'w-3.5 h-3.5',
        filterIconLeft: 'left-2',
        tableText: 'text-[10px]',
        cellPx: 'px-2',
        cellPy: 'py-1',
        footerPx: 'px-2',
        footerPy: 'py-1',
        footerText: 'text-[10px]',
        footerIconSize: 'w-3 h-3',
        sortIconSize: 'w-2.5 h-2.5',
    },
    default: {
        headerPx: 'px-3',
        headerPy: 'py-1.5',
        headerText: 'text-xs',
        headerIconSize: 'w-3.5 h-3.5',
        // Filter bar - matches FilterBar exactly
        filterBarHeight: 'h-[36px]',
        filterPx: 'px-2',
        filterInputHeight: 'h-[24px]',
        filterInputText: 'text-xs',
        filterInputPl: 'pl-7',
        filterIconSize: 'w-3.5 h-3.5',
        filterIconLeft: 'left-2',
        tableText: 'text-xs',
        cellPx: 'px-2',
        cellPy: 'py-1.5',
        footerPx: 'px-2',
        footerPy: 'py-1.5',
        footerText: 'text-xs',
        footerIconSize: 'w-3 h-3',
        sortIconSize: 'w-3 h-3',
    },
    comfortable: {
        headerPx: 'px-4',
        headerPy: 'py-2',
        headerText: 'text-xs',
        headerIconSize: 'w-3.5 h-3.5',
        // Filter bar - matches FilterBar exactly
        filterBarHeight: 'h-[42px]',
        filterPx: 'px-3',
        filterInputHeight: 'h-[28px]',
        filterInputText: 'text-sm',
        filterInputPl: 'pl-8',
        filterIconSize: 'w-4 h-4',
        filterIconLeft: 'left-2.5',
        tableText: 'text-xs',
        cellPx: 'px-3',
        cellPy: 'py-2',
        footerPx: 'px-3',
        footerPy: 'py-2',
        footerText: 'text-xs',
        footerIconSize: 'w-3.5 h-3.5',
        sortIconSize: 'w-3 h-3',
    },
};

// Track which watches recently changed
interface FlashState {
    [name: string]: {
        timestamp: string;
        flashUntil: number;
    };
}

export function WatchPanel() {
    const { watches, clearWatches, setShowWatchPanel, rowDensity } = useLogStore();
    const density = DENSITY_CONFIG[rowDensity];
    const [filterText, setFilterText] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'value' | 'timestamp'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    // Track flashing state for each watch
    const [flashingWatches, setFlashingWatches] = useState<Set<string>>(new Set());
    const prevTimestampsRef = useRef<FlashState>({});
    const flashDuration = 500; // ms

    // Detect changes and trigger flash
    useEffect(() => {
        const now = Date.now();
        const newFlashing = new Set<string>();
        const prevTimestamps = prevTimestampsRef.current;

        Object.entries(watches).forEach(([name, watch]) => {
            const prev = prevTimestamps[name];
            // Flash if timestamp changed (new value received)
            if (!prev || prev.timestamp !== watch.timestamp) {
                newFlashing.add(name);
                prevTimestamps[name] = {
                    timestamp: watch.timestamp,
                    flashUntil: now + flashDuration
                };
            } else if (prev.flashUntil > now) {
                // Keep flashing if within duration
                newFlashing.add(name);
            }
        });

        // Clean up old entries
        Object.keys(prevTimestamps).forEach(name => {
            if (!(name in watches)) {
                delete prevTimestamps[name];
            }
        });

        if (newFlashing.size > 0 || flashingWatches.size > 0) {
            setFlashingWatches(newFlashing);
        }

        // Schedule cleanup of flash state
        if (newFlashing.size > 0) {
            const timer = setTimeout(() => {
                setFlashingWatches(prev => {
                    const next = new Set<string>();
                    prev.forEach(name => {
                        const entry = prevTimestampsRef.current[name];
                        if (entry && entry.flashUntil > Date.now()) {
                            next.add(name);
                        }
                    });
                    return next;
                });
            }, flashDuration);
            return () => clearTimeout(timer);
        }
    }, [watches]);

    const watchEntries = useMemo(() => {
        let entries = Object.entries(watches).map(([name, watch]) => ({
            name,
            ...watch
        }));

        // Apply filter
        if (filterText) {
            const lower = filterText.toLowerCase();
            entries = entries.filter(w =>
                w.name.toLowerCase().includes(lower) ||
                w.value.toLowerCase().includes(lower)
            );
        }

        // Apply sort
        entries.sort((a, b) => {
            let cmp = 0;
            switch (sortBy) {
                case 'name':
                    cmp = a.name.localeCompare(b.name);
                    break;
                case 'value':
                    cmp = a.value.localeCompare(b.value);
                    break;
                case 'timestamp':
                    cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return entries;
    }, [watches, filterText, sortBy, sortDir]);

    const handleSort = (field: 'name' | 'value' | 'timestamp') => {
        if (sortBy === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ field }: { field: 'name' | 'value' | 'timestamp' }) => {
        if (sortBy !== field) return null;
        return (
            <svg className={`${density.sortIconSize} inline-block ml-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {sortDir === 'asc' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                )}
            </svg>
        );
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800">
            {/* Flash animation styles - only value cell flashes */}
            <style>{`
                @keyframes value-flash {
                    0% { background-color: rgba(34, 197, 94, 0.5); }
                    100% { background-color: rgb(241, 245, 249); }
                }
                .dark .value-flash {
                    animation: value-flash-dark 0.4s ease-out;
                }
                @keyframes value-flash-dark {
                    0% { background-color: rgba(34, 197, 94, 0.5); }
                    100% { background-color: rgb(51, 65, 85); }
                }
                .value-flash {
                    animation: value-flash 0.4s ease-out;
                }
            `}</style>

            {/* Header */}
            <div className={`bg-slate-50 dark:bg-slate-800 ${density.headerPx} ${density.headerPy} border-b border-slate-200 dark:border-slate-700 flex items-center justify-between`}>
                <span className={`font-medium ${density.headerText} text-slate-600 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide`}>
                    <svg className={`${density.headerIconSize} text-slate-400 dark:text-slate-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Watches
                    <span className="text-slate-400 dark:text-slate-500 font-normal">({Object.keys(watches).length})</span>
                </span>
                <button
                    onClick={() => setShowWatchPanel(false)}
                    className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                    title="Close watch panel"
                >
                    <svg className={density.headerIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Filter - matches FilterBar structure exactly */}
            <div className={`${density.filterBarHeight} ${density.filterPx} border-b border-slate-100 dark:border-slate-700 flex items-center flex-shrink-0`}>
                <div className="relative flex-1 flex items-center">
                    <input
                        type="text"
                        placeholder="Filter watches..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className={`w-full ${density.filterInputText} border border-slate-200 dark:border-slate-600 rounded ${density.filterInputPl} pr-2 py-0.5 ${density.filterInputHeight} bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none`}
                    />
                    <svg className={`${density.filterIconSize} text-slate-400 absolute ${density.filterIconLeft} top-1/2 -translate-y-1/2`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Content */}
            {watchEntries.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <svg className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                            {filterText ? 'No matches found' : 'No watches'}
                        </p>
                        {!filterText && (
                            <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                                Use <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">log.watch()</code>
                            </p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-auto">
                    <table className={`w-full ${density.tableText}`}>
                        <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0 z-10">
                            <tr>
                                <th
                                    onClick={() => handleSort('name')}
                                    className={`${density.cellPx} ${density.cellPy} text-left font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600`}
                                >
                                    Name <SortIcon field="name" />
                                </th>
                                <th
                                    onClick={() => handleSort('value')}
                                    className={`${density.cellPx} ${density.cellPy} text-left font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600`}
                                >
                                    Value <SortIcon field="value" />
                                </th>
                                <th
                                    onClick={() => handleSort('timestamp')}
                                    className={`${density.cellPx} ${density.cellPy} text-left font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600`}
                                >
                                    Updated <SortIcon field="timestamp" />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {watchEntries.map((watch) => {
                                const isFlashing = flashingWatches.has(watch.name);
                                return (
                                    <tr
                                        key={watch.name}
                                        className="hover:bg-blue-50/50 dark:hover:bg-slate-700/50"
                                    >
                                        <td className={`${density.cellPx} ${density.cellPy}`}>
                                            <span className="font-mono text-blue-600 dark:text-blue-400 font-medium">{watch.name}</span>
                                        </td>
                                        <td className={`${density.cellPx} ${density.cellPy}`}>
                                            <span
                                                className={`font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded ${isFlashing ? 'value-flash' : ''}`}
                                                key={watch.timestamp} // Force re-render to restart animation
                                            >
                                                {watch.value}
                                            </span>
                                        </td>
                                        <td className={`${density.cellPx} ${density.cellPy} text-slate-400 tabular-nums`}>
                                            {format(new Date(watch.timestamp), 'HH:mm:ss.SSS')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Footer */}
            <div className={`border-t border-slate-200 dark:border-slate-600 ${density.footerPx} ${density.footerPy} bg-slate-50 dark:bg-slate-700 flex items-center justify-between`}>
                <span className={`${density.footerText} text-slate-500 dark:text-slate-400`}>
                    {watchEntries.length} of {Object.keys(watches).length} watch{Object.keys(watches).length !== 1 ? 'es' : ''}
                </span>
                <button
                    onClick={() => clearWatches()}
                    className={`${density.footerText} text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1`}
                    title="Clear all watches"
                >
                    <svg className={density.footerIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear
                </button>
            </div>
        </div>
    );
}
