/**
 * WatchPanel - Table-based watch values display with filtering
 * Features flash animation when values change
 * Supports grouping and filtering by group
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useLogStore } from '../store/logStore';
import { format } from 'date-fns';
import { ColumnChooserMenu, type ColumnDef } from './ColumnChooserMenu';

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
        filterButtonSize: 'w-2.5 h-2.5',
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
        filterButtonSize: 'w-3 h-3',
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
        filterButtonSize: 'w-3.5 h-3.5',
    },
};

// Track which watches recently changed
interface FlashState {
    [name: string]: {
        timestamp: string;
        flashUntil: number;
    };
}

// Column definitions for WatchPanel
const WATCH_COLUMNS: { id: string; label: string; field: 'name' | 'group' | 'value' | 'timestamp' }[] = [
    { id: 'name', label: 'Name', field: 'name' },
    { id: 'group', label: 'Group', field: 'group' },
    { id: 'value', label: 'Value', field: 'value' },
    { id: 'updated', label: 'Updated', field: 'timestamp' },
];

export function WatchPanel() {
    const { watches, clearWatches, setShowWatchPanel, rowDensity, backlogged, watchPanelColumnWidths, setWatchPanelColumnWidths, watchPanelHiddenColumns, setWatchPanelHiddenColumns } = useLogStore();
    const density = DENSITY_CONFIG[rowDensity];
    const [filterText, setFilterText] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'group' | 'value' | 'timestamp'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    // Column chooser menu state
    const [columnMenuState, setColumnMenuState] = useState<{
        isOpen: boolean;
        position: { x: number; y: number };
    }>({ isOpen: false, position: { x: 0, y: 0 } });

    // Group filter state (similar to StreamsView)
    const [showGroupFilter, setShowGroupFilter] = useState(false);
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());  // Empty = all selected
    const [groupFilterText, setGroupFilterText] = useState('');
    const groupFilterRef = useRef<HTMLDivElement>(null);

    // Column widths from store (percentages that sum to 100)
    // [name, group, value, updated]
    const columnWidths = watchPanelColumnWidths;
    const resizingColRef = useRef<number | null>(null);
    const startXRef = useRef(0);
    const startWidthsRef = useRef<[number, number, number, number]>([30, 15, 40, 15]);
    const tableRef = useRef<HTMLTableElement>(null);

    // Column resize handler
    const startColumnResize = useCallback((colIndex: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingColRef.current = colIndex;
        startXRef.current = e.clientX;
        startWidthsRef.current = [...columnWidths] as [number, number, number, number];

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (resizingColRef.current === null || !tableRef.current) return;

            const tableWidth = tableRef.current.offsetWidth;
            const deltaX = moveEvent.clientX - startXRef.current;
            const deltaPercent = (deltaX / tableWidth) * 100;

            const newWidths = [...startWidthsRef.current] as [number, number, number, number];
            const idx = resizingColRef.current;

            // Adjust current column and next column
            const minWidth = 8; // Minimum 8% width
            const newCurrentWidth = Math.max(minWidth, startWidthsRef.current[idx] + deltaPercent);
            const newNextWidth = Math.max(minWidth, startWidthsRef.current[idx + 1] - deltaPercent);

            // Only apply if both columns stay above minimum
            if (newCurrentWidth >= minWidth && newNextWidth >= minWidth) {
                newWidths[idx] = newCurrentWidth;
                newWidths[idx + 1] = newNextWidth;
                setWatchPanelColumnWidths(newWidths);
            }
        };

        const handleMouseUp = () => {
            resizingColRef.current = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [columnWidths, setWatchPanelColumnWidths]);

    // Track flashing state for each watch
    const [flashingWatches, setFlashingWatches] = useState<Set<string>>(new Set());
    const prevTimestampsRef = useRef<FlashState>({});
    const flashDuration = 500; // ms

    // Detect changes and trigger flash (skip when backlogged for performance)
    useEffect(() => {
        // Skip flash animations when system is backlogged
        if (backlogged) {
            // Still update timestamps ref to track changes, but don't animate
            Object.entries(watches).forEach(([name, watch]) => {
                prevTimestampsRef.current[name] = {
                    timestamp: watch.timestamp,
                    flashUntil: 0
                };
            });
            setFlashingWatches(new Set());
            return;
        }

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
    }, [watches, backlogged]);

    // Extract unique groups from all watches
    const uniqueGroups = useMemo(() => {
        const groups = new Set<string>();
        for (const watch of Object.values(watches)) {
            groups.add(watch.group || '');
        }
        return Array.from(groups).sort();
    }, [watches]);

    // Filter groups by search text
    const filteredGroups = useMemo(() => {
        if (!groupFilterText) return uniqueGroups;
        const lower = groupFilterText.toLowerCase();
        return uniqueGroups.filter(g => (g || '(no group)').toLowerCase().includes(lower));
    }, [uniqueGroups, groupFilterText]);

    // Group filter handlers
    // selectedGroups stores HIDDEN groups (inverse logic for simpler checkbox UX)
    // Empty set = nothing hidden = all visible
    // Non-empty set = these groups are hidden
    const toggleGroup = useCallback((group: string) => {
        setSelectedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) {
                // Currently hidden, make it visible
                next.delete(group);
            } else {
                // Currently visible, hide it
                next.add(group);
            }
            return next;
        });
    }, []);

    const selectAllGroups = useCallback(() => {
        setSelectedGroups(new Set());  // Empty = nothing hidden = all visible
    }, []);

    const unselectAllGroups = useCallback(() => {
        // Hide all groups
        setSelectedGroups(new Set(uniqueGroups));
    }, [uniqueGroups]);

    // Click-outside handler for group filter dropdown
    useEffect(() => {
        if (!showGroupFilter) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (groupFilterRef.current && !groupFilterRef.current.contains(e.target as Node)) {
                setShowGroupFilter(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showGroupFilter]);

    const watchEntries = useMemo(() => {
        let entries = Object.entries(watches).map(([name, watch]) => ({
            name,
            group: watch.group || '',
            ...watch
        }));

        // Apply group filter (selectedGroups contains HIDDEN groups)
        if (selectedGroups.size > 0) {
            entries = entries.filter(w => !selectedGroups.has(w.group));
        }

        // Apply text filter
        if (filterText) {
            const lower = filterText.toLowerCase();
            entries = entries.filter(w =>
                w.name.toLowerCase().includes(lower) ||
                w.value.toLowerCase().includes(lower) ||
                w.group.toLowerCase().includes(lower)
            );
        }

        // Apply sort
        entries.sort((a, b) => {
            let cmp = 0;
            switch (sortBy) {
                case 'name':
                    cmp = a.name.localeCompare(b.name);
                    break;
                case 'group':
                    cmp = a.group.localeCompare(b.group);
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
    }, [watches, filterText, sortBy, sortDir, selectedGroups]);

    const handleSort = (field: 'name' | 'group' | 'value' | 'timestamp') => {
        if (sortBy === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ field }: { field: 'name' | 'group' | 'value' | 'timestamp' }) => {
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

    // Column chooser handlers
    const handleHeaderContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setColumnMenuState({
            isOpen: true,
            position: { x: e.clientX, y: e.clientY },
        });
    }, []);

    const handleToggleColumn = useCallback((columnId: string) => {
        const newHidden = watchPanelHiddenColumns.includes(columnId)
            ? watchPanelHiddenColumns.filter(id => id !== columnId)
            : [...watchPanelHiddenColumns, columnId];
        setWatchPanelHiddenColumns(newHidden);
    }, [watchPanelHiddenColumns, setWatchPanelHiddenColumns]);

    const columnDefs: ColumnDef[] = useMemo(() =>
        WATCH_COLUMNS.map(col => ({
            id: col.id,
            label: col.label,
            hidden: watchPanelHiddenColumns.includes(col.id),
        })),
        [watchPanelHiddenColumns]
    );

    // Get visible columns in order
    const visibleColumns = useMemo(() =>
        WATCH_COLUMNS.filter(col => !watchPanelHiddenColumns.includes(col.id)),
        [watchPanelHiddenColumns]
    );

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
            <div className={`${density.filterBarHeight} ${density.filterPx} border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-shrink-0`}>
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

            {/* Content - table headers always visible */}
            <div className="flex-1 overflow-auto flex flex-col">
                <table ref={tableRef} className={`w-full ${density.tableText}`} style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                        {visibleColumns.map((col) => (
                            <col key={col.id} style={{ width: `${columnWidths[WATCH_COLUMNS.findIndex(c => c.id === col.id)]}%` }} />
                        ))}
                    </colgroup>
                    <thead className="bg-slate-100 dark:bg-slate-700 sticky top-0 z-10" onContextMenu={handleHeaderContextMenu}>
                        <tr>
                            {visibleColumns.map((col, idx) => {
                                const isGroup = col.id === 'group';
                                const isLast = idx === visibleColumns.length - 1;
                                const originalIdx = WATCH_COLUMNS.findIndex(c => c.id === col.id);

                                return (
                                    <th
                                        key={col.id}
                                        onClick={() => !isGroup && handleSort(col.field)}
                                        className={`${density.cellPx} ${density.cellPy} text-left font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide text-[11px] border-b border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 relative`}
                                    >
                                        {isGroup ? (
                                            <div className="flex items-center justify-between pr-2">
                                                <span
                                                    className="truncate cursor-pointer"
                                                    onClick={() => handleSort('group')}
                                                >
                                                    Group <SortIcon field="group" />
                                                </span>
                                                {/* Filter button - right side */}
                                                <div className="relative" ref={groupFilterRef}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); if (uniqueGroups.length > 0) setShowGroupFilter(!showGroupFilter); }}
                                                        disabled={uniqueGroups.length === 0}
                                                        className={`p-0.5 rounded transition-colors ${
                                                            uniqueGroups.length === 0
                                                                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                                                : selectedGroups.size > 0
                                                                    ? 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30'
                                                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                        }`}
                                                        title={uniqueGroups.length === 0 ? "No groups to filter" : "Filter by group"}
                                                    >
                                                        <svg className={density.filterButtonSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                                        </svg>
                                                    </button>

                                                    {/* Group filter dropdown */}
                                                    {showGroupFilter && uniqueGroups.length > 0 && (
                                                        <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50">
                                                            {/* Search input */}
                                                            <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                                                                <input
                                                                    type="text"
                                                                    value={groupFilterText}
                                                                    onChange={(e) => setGroupFilterText(e.target.value)}
                                                                    placeholder="Filter groups..."
                                                                    className="w-full px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                                                    autoFocus
                                                                />
                                                            </div>

                                                            {/* Select All / Unselect All */}
                                                            <div className="flex gap-2 p-2 border-b border-slate-200 dark:border-slate-700 text-xs">
                                                                <button onClick={selectAllGroups} className="text-blue-600 dark:text-blue-400 hover:underline">Select All</button>
                                                                <span className="text-slate-300 dark:text-slate-600">|</span>
                                                                <button onClick={unselectAllGroups} className="text-blue-600 dark:text-blue-400 hover:underline">Unselect All</button>
                                                            </div>

                                                            {/* Checkbox list */}
                                                            <div className="max-h-48 overflow-y-auto p-2">
                                                                {filteredGroups.map(group => (
                                                                    <label key={group || '__empty__'} className="flex items-center gap-2 py-1 px-1 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                                                                        <input type="checkbox" checked={!selectedGroups.has(group)} onChange={() => toggleGroup(group)} className="rounded border-slate-300 dark:border-slate-600" />
                                                                        <span className="text-slate-700 dark:text-slate-300 truncate">{group || '(no group)'}</span>
                                                                    </label>
                                                                ))}
                                                                {filteredGroups.length === 0 && <div className="text-xs text-slate-400 dark:text-slate-500 py-2 text-center">No groups found</div>}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="truncate block">{col.label} <SortIcon field={col.field} /></span>
                                        )}
                                        {/* Resize handle (not on last column) */}
                                        {!isLast && (
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 group"
                                                onMouseDown={(e) => startColumnResize(originalIdx, e)}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-slate-400 dark:bg-slate-500 group-hover:bg-blue-500 rounded" />
                                            </div>
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    {watchEntries.length > 0 && (
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {watchEntries.map((watch) => {
                                const isFlashing = flashingWatches.has(watch.name);
                                return (
                                    <tr
                                        key={watch.name}
                                        className="hover:bg-blue-50/50 dark:hover:bg-slate-700/50"
                                    >
                                        {visibleColumns.map(col => {
                                            switch (col.id) {
                                                case 'name':
                                                    return (
                                                        <td key={col.id} className={`${density.cellPx} ${density.cellPy} overflow-hidden`}>
                                                            <span className="font-mono text-blue-600 dark:text-blue-400 font-medium truncate block" title={watch.name}>{watch.name}</span>
                                                        </td>
                                                    );
                                                case 'group':
                                                    return (
                                                        <td key={col.id} className={`${density.cellPx} ${density.cellPy} text-slate-500 dark:text-slate-400 overflow-hidden`}>
                                                            <span className="truncate block" title={watch.group || '(no group)'}>{watch.group || '-'}</span>
                                                        </td>
                                                    );
                                                case 'value':
                                                    return (
                                                        <td key={col.id} className={`${density.cellPx} ${density.cellPy} overflow-hidden`}>
                                                            <span
                                                                className={`font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded truncate inline-block max-w-full ${isFlashing ? 'value-flash' : ''}`}
                                                                key={watch.timestamp}
                                                                title={watch.value}
                                                            >
                                                                {watch.value}
                                                            </span>
                                                        </td>
                                                    );
                                                case 'updated':
                                                    return (
                                                        <td key={col.id} className={`${density.cellPx} ${density.cellPy} text-slate-400 tabular-nums overflow-hidden whitespace-nowrap`}>
                                                            {format(new Date(watch.timestamp), 'HH:mm:ss.SSS')}
                                                        </td>
                                                    );
                                                default:
                                                    return null;
                                            }
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    )}
                </table>
                {/* Nice empty state below headers */}
                {watchEntries.length === 0 && (
                    <div className="flex-1 flex items-center justify-center p-6">
                        <div className="text-center">
                            <svg className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                {Object.keys(watches).length === 0 ? 'No watches' : 'No matches found'}
                            </p>
                            {Object.keys(watches).length === 0 && (
                                <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                                    Use <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">log.watch()</code>
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>

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

            {/* Column chooser menu */}
            {columnMenuState.isOpen && (
                <ColumnChooserMenu
                    columns={columnDefs}
                    position={columnMenuState.position}
                    onClose={() => setColumnMenuState({ isOpen: false, position: { x: 0, y: 0 } })}
                    onToggleColumn={handleToggleColumn}
                />
            )}
        </div>
    );
}
