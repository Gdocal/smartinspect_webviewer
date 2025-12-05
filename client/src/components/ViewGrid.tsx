/**
 * ViewGrid - Per-view grid wrapper using VirtualLogGrid
 *
 * Each view gets its own ViewGrid component that:
 * - Applies the view's filter to entries before passing to VirtualLogGrid
 * - Maintains its own column state
 * - Preserves scroll position when switching tabs
 * - Stays mounted but hidden when not active (CSS visibility)
 */

import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { useLogStore, LogEntry, View, Filter, ListTextFilter, TextFilter, VlgColumnConfig } from '../store/logStore';
import { VirtualLogGrid, CellRange } from './VirtualLogGrid/VirtualLogGrid';
import { ColumnConfig, DEFAULT_COLUMNS } from './VirtualLogGrid/types';

// Track stuckToBottom per view

// Type compatibility - VlgColumnConfig is structurally compatible with ColumnConfig
const toColumnConfig = (cfg: VlgColumnConfig): ColumnConfig => cfg as ColumnConfig;
const toVlgColumnConfig = (cfg: ColumnConfig): VlgColumnConfig => cfg as VlgColumnConfig;

// Helper to match a string value against a ListTextFilter
function matchesListTextFilter(value: string | undefined, filter: ListTextFilter | undefined): boolean {
    if (!filter) return true;

    const hasListValues = filter.mode === 'list' && filter.values.length > 0;
    const hasTextValue = filter.mode === 'text' && filter.textValue;

    if (!hasListValues && !hasTextValue) return true;

    const val = value || '';
    let matches = false;

    if (filter.mode === 'list') {
        matches = filter.values.includes(val);
    } else {
        const textVal = filter.textValue.toLowerCase();
        const valLower = val.toLowerCase();

        if (filter.textOperator === 'contains') {
            matches = valLower.includes(textVal);
        } else if (filter.textOperator === 'equals') {
            matches = valLower === textVal;
        } else if (filter.textOperator === 'regex') {
            try {
                const regex = new RegExp(filter.textValue, 'i');
                matches = regex.test(val);
            } catch {
                matches = false;
            }
        }
    }

    return filter.inverse ? !matches : matches;
}

// Helper to match a string value against a TextFilter
function matchesTextFilter(value: string | undefined, filter: TextFilter | undefined): boolean {
    if (!filter || !filter.value) return true;

    const val = value || '';
    let matches = false;

    const compareVal = filter.caseSensitive ? val : val.toLowerCase();
    const filterVal = filter.caseSensitive ? filter.value : filter.value.toLowerCase();

    if (filter.operator === 'contains') {
        matches = compareVal.includes(filterVal);
    } else if (filter.operator === 'equals') {
        matches = compareVal === filterVal;
    } else if (filter.operator === 'regex') {
        try {
            const flags = filter.caseSensitive ? '' : 'i';
            const regex = new RegExp(filter.value, flags);
            matches = regex.test(val);
        } catch {
            matches = false;
        }
    }

    return filter.inverse ? !matches : matches;
}

// Apply view filter to entries
function filterEntriesForView(entries: LogEntry[], filter: Filter): LogEntry[] {
    const hasExtendedSessionFilter = filter.sessionFilter && (
        (filter.sessionFilter.mode === 'list' && filter.sessionFilter.values.length > 0) ||
        (filter.sessionFilter.mode === 'text' && filter.sessionFilter.textValue)
    );
    const hasExtendedAppNameFilter = filter.appNameFilter && (
        (filter.appNameFilter.mode === 'list' && filter.appNameFilter.values.length > 0) ||
        (filter.appNameFilter.mode === 'text' && filter.appNameFilter.textValue)
    );
    const hasExtendedHostNameFilter = filter.hostNameFilter && (
        (filter.hostNameFilter.mode === 'list' && filter.hostNameFilter.values.length > 0) ||
        (filter.hostNameFilter.mode === 'text' && filter.hostNameFilter.textValue)
    );
    const hasExtendedTitleFilter = filter.titleFilter && filter.titleFilter.value;

    const hasSessionFilter = hasExtendedSessionFilter || filter.sessions.length > 0;
    const hasLevelFilter = filter.levels.length > 0;
    const hasTitleFilter = hasExtendedTitleFilter || !!filter.titlePattern;
    const hasMessageFilter = !!filter.messagePattern;
    const hasAppNameFilter = hasExtendedAppNameFilter || filter.appNames.length > 0;
    const hasHostNameFilter = hasExtendedHostNameFilter || filter.hostNames.length > 0;
    const hasEntryTypeFilter = filter.entryTypes.length > 0;

    // Fast path: no filters active
    if (!hasSessionFilter && !hasLevelFilter && !hasTitleFilter && !hasMessageFilter &&
        !hasAppNameFilter && !hasHostNameFilter && !hasEntryTypeFilter) {
        return entries;
    }

    // Pre-compile regex patterns for legacy filters
    let titleRegex: RegExp | null = null;
    let messageRegex: RegExp | null = null;

    if (filter.titlePattern && !hasExtendedTitleFilter) {
        try {
            titleRegex = new RegExp(filter.titlePattern, 'i');
        } catch {
            // Invalid regex
        }
    }

    if (hasMessageFilter) {
        try {
            messageRegex = new RegExp(filter.messagePattern, 'i');
        } catch {
            // Invalid regex
        }
    }

    // Pre-create Sets for O(1) lookup (legacy filters)
    const sessionSet = (!hasExtendedSessionFilter && filter.sessions.length > 0) ? new Set(filter.sessions) : null;
    const levelSet = hasLevelFilter ? new Set(filter.levels) : null;
    const appNameSet = (!hasExtendedAppNameFilter && filter.appNames.length > 0) ? new Set(filter.appNames) : null;
    const hostNameSet = (!hasExtendedHostNameFilter && filter.hostNames.length > 0) ? new Set(filter.hostNames) : null;
    const entryTypeSet = hasEntryTypeFilter ? new Set(filter.entryTypes) : null;

    return entries.filter(e => {
        // Session filter
        if (hasExtendedSessionFilter) {
            if (!matchesListTextFilter(e.sessionName, filter.sessionFilter)) {
                return false;
            }
        } else if (sessionSet && (!e.sessionName || !sessionSet.has(e.sessionName))) {
            return false;
        }

        // Level filter
        if (levelSet) {
            const matches = e.level !== undefined && levelSet.has(e.level);
            const result = filter.levelsInverse ? !matches : matches;
            if (!result) return false;
        }

        // Title filter
        if (hasExtendedTitleFilter) {
            if (!matchesTextFilter(e.title, filter.titleFilter)) {
                return false;
            }
        } else if (titleRegex) {
            const matches = titleRegex.test(e.title || '');
            if (filter.inverseMatch ? matches : !matches) {
                return false;
            }
        }

        // Message pattern filter
        if (messageRegex) {
            const titleMatch = messageRegex.test(e.title || '');
            const dataMatch = messageRegex.test(e.data || '');
            const matches = titleMatch || dataMatch;
            if (filter.inverseMatch ? matches : !matches) {
                return false;
            }
        }

        // App name filter
        if (hasExtendedAppNameFilter) {
            if (!matchesListTextFilter(e.appName, filter.appNameFilter)) {
                return false;
            }
        } else if (appNameSet && (!e.appName || !appNameSet.has(e.appName))) {
            return false;
        }

        // Host name filter
        if (hasExtendedHostNameFilter) {
            if (!matchesListTextFilter(e.hostName, filter.hostNameFilter)) {
                return false;
            }
        } else if (hostNameSet && (!e.hostName || !hostNameSet.has(e.hostName))) {
            return false;
        }

        // Entry type filter
        if (entryTypeSet) {
            const matches = e.logEntryType !== undefined && entryTypeSet.has(e.logEntryType);
            const result = filter.entryTypesInverse ? !matches : matches;
            if (!result) return false;
        }

        return true;
    });
}

interface ViewGridProps {
    view: View;
    isActive: boolean;
    onColumnStateChange?: (viewId: string, columns: VlgColumnConfig[]) => void;
}

export function ViewGrid({
    view,
    isActive,
    onColumnStateChange
}: ViewGridProps) {
    const {
        entries,
        viewPausedState,
        setSelectedEntryId,
        selectedEntryId,
        globalHighlightRules,
        entriesVersion,
        theme,
        setViewStuckToBottom
    } = useLogStore();

    // Per-view pause state
    const isPaused = viewPausedState[view.id] ?? false;

    // Cell selection state
    const [selection, setSelection] = useState<CellRange | null>(null);

    // Column state - use view's column state or defaults
    const [columns, setColumns] = useState<ColumnConfig[]>(() => {
        // If view has saved column config, use it
        if (view.columnConfig && view.columnConfig.length > 0) {
            return view.columnConfig.map(toColumnConfig);
        }
        return DEFAULT_COLUMNS;
    });

    // Update columns when view.columnConfig changes (e.g., when switching views)
    const viewColumnConfigRef = useRef(view.columnConfig);
    useEffect(() => {
        if (view.columnConfig !== viewColumnConfigRef.current) {
            viewColumnConfigRef.current = view.columnConfig;
            if (view.columnConfig && view.columnConfig.length > 0) {
                setColumns(view.columnConfig.map(toColumnConfig));
            }
        }
    }, [view.columnConfig]);

    // Get combined highlight rules for this view
    const highlightRules = useMemo(() => {
        const viewRules = view.highlightRules || [];
        if (view.useGlobalHighlights) {
            return [...viewRules, ...globalHighlightRules];
        }
        return viewRules;
    }, [view.highlightRules, view.useGlobalHighlights, globalHighlightRules]);

    // Filter entries based on view filter
    const filteredEntries = useMemo(() => {
        return filterEntriesForView(entries, view.filter);
    }, [entries, view.filter, entriesVersion]);

    // Paused entries snapshot - freeze display when paused
    const [pausedEntries, setPausedEntries] = useState<LogEntry[]>([]);
    const wasPausedRef = useRef(false);

    // Update paused entries ONLY when transitioning from unpaused to paused
    useEffect(() => {
        if (isPaused && !wasPausedRef.current) {
            // Just paused - capture current entries
            setPausedEntries(filteredEntries);
        }
        wasPausedRef.current = isPaused;
    }, [isPaused, filteredEntries]);

    // Get target entries
    const targetEntries = isPaused ? pausedEntries : filteredEntries;
    const targetLen = targetEntries.length;

    // Progressive display for smooth scrolling
    // Key insight: show existing entries immediately, only animate NEW entries
    // Use a ref to track the "intended" display count synchronously to prevent flicker
    const targetLenRef = useRef(targetLen);
    const displayCountRef = useRef(targetLen); // Sync ref for immediate reads
    const rafIdRef = useRef<number | null>(null);
    const [displayCount, setDisplayCount] = useState(targetLen);

    // Keep target length ref updated
    targetLenRef.current = targetLen;

    // Progressive catch-up effect
    // Only animate small deltas (up to ~2 seconds worth at 60fps = 120 entries)
    const MAX_ANIMATE_DELTA = 120;

    // Synchronize displayCountRef with targetLen when it changes dramatically
    // This handles cases where state hasn't caught up yet (e.g., component re-mount)
    if (Math.abs(targetLen - displayCountRef.current) > MAX_ANIMATE_DELTA) {
        displayCountRef.current = targetLen;
    } else if (displayCountRef.current > targetLen) {
        // Target shrunk - sync immediately
        displayCountRef.current = targetLen;
    }

    useEffect(() => {
        const delta = targetLen - displayCountRef.current;

        // If target shrunk, snap immediately
        if (displayCountRef.current > targetLen) {
            displayCountRef.current = targetLen; // Update ref synchronously
            setDisplayCount(targetLen);
            return;
        }

        // If delta is too large (initial load or big batch), snap immediately
        if (delta > MAX_ANIMATE_DELTA) {
            displayCountRef.current = targetLen; // Update ref synchronously
            setDisplayCount(targetLen);
            return;
        }

        // If we have new entries to animate and no animation running
        if (delta > 0 && rafIdRef.current === null) {
            const animate = () => {
                const currentTarget = targetLenRef.current;
                const currentDisplay = displayCountRef.current;
                if (currentDisplay >= currentTarget) {
                    rafIdRef.current = null;
                    return;
                }
                const next = currentDisplay + 1;
                displayCountRef.current = next; // Update ref synchronously
                setDisplayCount(next);
                if (next < currentTarget) {
                    rafIdRef.current = requestAnimationFrame(animate);
                } else {
                    rafIdRef.current = null;
                }
            };
            rafIdRef.current = requestAnimationFrame(animate);
        }
    }, [targetLen, displayCount, view.id]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, []);

    // Displayed entries: use ref for immediate accurate count, state for re-render trigger
    // This prevents flicker when state update is async
    const displayedEntries = useMemo(() => {
        // Use the ref value which is always in sync, but depend on displayCount to trigger updates
        const count = displayCountRef.current;
        return targetEntries.slice(0, count);
    }, [targetEntries, displayCount]);

    // Handle column changes
    const handleColumnsChange = useCallback((newColumns: ColumnConfig[]) => {
        setColumns(newColumns);
        if (onColumnStateChange) {
            onColumnStateChange(view.id, newColumns.map(toVlgColumnConfig));
        }
    }, [onColumnStateChange, view.id]);

    // Handle row click - select for detail panel
    const handleRowClick = useCallback((entry: LogEntry) => {
        setSelectedEntryId(entry.id);
    }, [setSelectedEntryId]);

    // Handle stuckToBottom state change - store per view for FilterBar UI
    const handleStuckToBottomChange = useCallback((stuckToBottom: boolean) => {
        setViewStuckToBottom(view.id, stuckToBottom);
    }, [setViewStuckToBottom, view.id]);

    // Effective autoscroll - NOT affected by pause (pause freezes entries, not scroll)
    const effectiveAutoScroll = view.autoScroll;

    return (
        <div
            className="h-full w-full"
            style={{
                visibility: isActive ? 'visible' : 'hidden',
                position: isActive ? 'relative' : 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
            }}
        >
            <VirtualLogGrid
                entries={displayedEntries}
                autoScroll={effectiveAutoScroll}
                selection={selection}
                onSelectionChange={setSelection}
                theme={theme}
                alternatingRows={view.alternatingRows}
                columns={columns}
                onColumnsChange={handleColumnsChange}
                highlightRules={highlightRules}
                onRowClick={handleRowClick}
                selectedRowId={selectedEntryId}
                onStuckToBottomChange={handleStuckToBottomChange}
                actualEntryCount={targetLen}
            />
        </div>
    );
}
