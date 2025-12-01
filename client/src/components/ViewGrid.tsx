/**
 * ViewGrid - Per-view AG Grid wrapper
 *
 * Each view gets its own ViewGrid component that:
 * - Applies the view's filter to entries before passing to AG Grid
 * - Maintains its own AG Grid column filter state (gridFilterModel)
 * - Preserves scroll position when switching tabs
 * - Stays mounted but hidden when not active (CSS visibility)
 */

import { useMemo, useRef, useCallback, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
    ColDef,
    GridReadyEvent,
    RowClassParams,
    GridApi,
    SideBarDef,
    ColumnState,
    GetRowIdParams,
    ICellRendererParams,
    ModuleRegistry,
    AllCommunityModule,
    FilterModel
} from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { memo } from 'react';

// Register AG Grid modules (required for v34+)
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

import { useLogStore, LogEntry, Level, LogEntryType, matchesHighlightRule, View, Filter, ListTextFilter, TextFilter } from '../store/logStore';
import { TimestampFilter } from './TimestampFilter';
import { format } from 'date-fns';

// Set license key if available
const licenseKey = import.meta.env.VITE_AG_GRID_LICENSE;
if (licenseKey) {
    LicenseManager.setLicenseKey(licenseKey);
}

// Log entry type to icon mapping - STATIC, never recreated
const EntryTypeIcons: Record<number, { icon: string; color: string; title: string }> = {
    [LogEntryType.EnterMethod]: { icon: '→', color: '#22c55e', title: 'Enter Method' },
    [LogEntryType.LeaveMethod]: { icon: '←', color: '#ef4444', title: 'Leave Method' },
    [LogEntryType.Separator]: { icon: '―', color: '#6b7280', title: 'Separator' },
    [LogEntryType.Message]: { icon: '●', color: '#3b82f6', title: 'Message' },
    [LogEntryType.Warning]: { icon: '⚠', color: '#f59e0b', title: 'Warning' },
    [LogEntryType.Error]: { icon: '✕', color: '#ef4444', title: 'Error' },
    [LogEntryType.Fatal]: { icon: '☠', color: '#dc2626', title: 'Fatal' },
    [LogEntryType.Debug]: { icon: '○', color: '#6b7280', title: 'Debug' },
    [LogEntryType.Verbose]: { icon: '◌', color: '#9ca3af', title: 'Verbose' },
    [LogEntryType.Checkpoint]: { icon: '◆', color: '#8b5cf6', title: 'Checkpoint' },
    [LogEntryType.Assert]: { icon: '!', color: '#ef4444', title: 'Assert' },
    [LogEntryType.Text]: { icon: '☰', color: '#3b82f6', title: 'Text' },
    [LogEntryType.Object]: { icon: '{}', color: '#3b82f6', title: 'Object' },
    [LogEntryType.Source]: { icon: '❮❯', color: '#8b5cf6', title: 'Source' },
    [LogEntryType.Binary]: { icon: '01', color: '#6b7280', title: 'Binary' },
    [LogEntryType.System]: { icon: '⚙', color: '#6b7280', title: 'System' },
    [LogEntryType.VariableValue]: { icon: '=', color: '#3b82f6', title: 'Variable' },
};

// Level config - STATIC
const levelConfig: Record<number, { bg: string; text: string; label: string }> = {
    [Level.Debug]: { bg: '#f3f4f6', text: '#6b7280', label: 'DBG' },
    [Level.Verbose]: { bg: '#f3f4f6', text: '#9ca3af', label: 'VRB' },
    [Level.Message]: { bg: '#dbeafe', text: '#1d4ed8', label: 'INF' },
    [Level.Warning]: { bg: '#fef3c7', text: '#d97706', label: 'WRN' },
    [Level.Error]: { bg: '#fee2e2', text: '#dc2626', label: 'ERR' },
    [Level.Fatal]: { bg: '#dc2626', text: '#ffffff', label: 'FTL' },
};

// MEMOIZED Icon cell renderer
const IconCellRenderer = memo(function IconCellRenderer(props: ICellRendererParams<LogEntry>) {
    const entry = props.data;
    if (!entry) return null;

    const entryType = entry.logEntryType ?? LogEntryType.Message;
    const iconInfo = EntryTypeIcons[entryType] || EntryTypeIcons[LogEntryType.Message];

    return (
        <span
            title={iconInfo.title}
            style={{
                color: iconInfo.color,
                fontWeight: 'bold',
                fontSize: '14px'
            }}
        >
            {iconInfo.icon}
        </span>
    );
});

// MEMOIZED Level badge cell renderer
const LevelCellRenderer = memo(function LevelCellRenderer(props: ICellRendererParams<LogEntry>) {
    const level = props.value as number;
    if (level === undefined) return null;

    const config = levelConfig[level] || levelConfig[Level.Message];

    return (
        <span
            style={{
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: 600,
                backgroundColor: config.bg,
                color: config.text,
            }}
        >
            {config.label}
        </span>
    );
});

// Timestamp formatter caches
const timestampCache = new Map<string, string>();
const fullTimestampCache = new Map<string, string>();
const CACHE_MAX_SIZE = 5000;

function formatTimestamp(date: string): string {
    if (!date) return '';

    let cached = timestampCache.get(date);
    if (cached) return cached;

    try {
        cached = format(new Date(date), 'HH:mm:ss.SSS');
    } catch {
        cached = date;
    }

    if (timestampCache.size > CACHE_MAX_SIZE) {
        const firstKey = timestampCache.keys().next().value;
        if (firstKey) timestampCache.delete(firstKey);
    }
    timestampCache.set(date, cached);
    return cached;
}

function formatFullTimestamp(date: string): string {
    if (!date) return '';

    let cached = fullTimestampCache.get(date);
    if (cached) return cached;

    try {
        cached = format(new Date(date), 'yyyy-MM-dd HH:mm:ss.SSS');
    } catch {
        cached = date;
    }

    if (fullTimestampCache.size > CACHE_MAX_SIZE) {
        const firstKey = fullTimestampCache.keys().next().value;
        if (firstKey) fullTimestampCache.delete(firstKey);
    }
    fullTimestampCache.set(date, cached);
    return cached;
}

// Stable getRowId function
const getRowId = (params: GetRowIdParams<LogEntry>) => String(params.data.id);

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
    onColumnStateChange?: (viewId: string, state: ColumnState[]) => void;
    onFilterModelChange?: (viewId: string, model: FilterModel) => void;
    onScrollChange?: (viewId: string, scrollTop: number) => void;
}

export function ViewGrid({
    view,
    isActive,
    onColumnStateChange,
    onFilterModelChange,
    onScrollChange
}: ViewGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<AgGridReact>(null);
    const gridApiRef = useRef<GridApi | null>(null);
    const scrollTopRef = useRef(0);
    const hasRestoredStateRef = useRef(false);

    const {
        entries,
        paused,
        setSelectedEntryId,
        globalHighlightRules,
        entriesVersion,
        theme,
        loadingInitialData
    } = useLogStore();

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

    const lastEntryCountRef = useRef(0);
    const lastEntriesVersionRef = useRef(0);

    const overlayNoRowsTemplate = '<span class="text-slate-400">No log entries</span>';
    // Loading overlay shown only when loadingInitialData is true (actively fetching data)
    const overlayLoadingTemplate = '<span class="text-slate-400">Loading...</span>';

    // Column definitions
    const columnDefs = useMemo<ColDef<LogEntry>[]>(() => [
        {
            headerName: '',
            field: 'logEntryType',
            width: 40,
            minWidth: 40,
            maxWidth: 40,
            cellRenderer: IconCellRenderer,
            sortable: false,
            filter: false,
            resizable: false,
            suppressHeaderMenuButton: true,
            pinned: 'left'
        },
        {
            headerName: 'Title',
            field: 'title',
            flex: 2,
            minWidth: 200,
            filter: 'agTextColumnFilter',
            tooltipField: 'title',
        },
        {
            headerName: 'Level',
            field: 'level',
            width: 70,
            minWidth: 60,
            cellRenderer: LevelCellRenderer,
            filter: 'agSetColumnFilter',
            filterParams: {
                valueFormatter: (params: { value: number | null }) => {
                    if (params.value === null || params.value === undefined) return '(Blank)';
                    const names: Record<number, string> = {
                        [Level.Debug]: 'Debug',
                        [Level.Verbose]: 'Verbose',
                        [Level.Message]: 'Info',
                        [Level.Warning]: 'Warning',
                        [Level.Error]: 'Error',
                        [Level.Fatal]: 'Fatal',
                    };
                    return names[params.value] || String(params.value);
                }
            },
        },
        {
            headerName: 'Session',
            field: 'sessionName',
            width: 140,
            minWidth: 100,
            filter: 'agSetColumnFilter',
        },
        {
            headerName: 'Application',
            field: 'appName',
            width: 140,
            minWidth: 100,
            filter: 'agSetColumnFilter',
            hide: false,
        },
        {
            headerName: 'Host',
            field: 'hostName',
            width: 120,
            minWidth: 80,
            filter: 'agSetColumnFilter',
            hide: true,
        },
        {
            headerName: 'Process',
            field: 'processId',
            width: 80,
            minWidth: 60,
            filter: 'agNumberColumnFilter',
            hide: true,
        },
        {
            headerName: 'Thread',
            field: 'threadId',
            width: 70,
            minWidth: 50,
            filter: 'agNumberColumnFilter',
            hide: true,
        },
        {
            headerName: 'Data',
            field: 'data',
            flex: 1,
            minWidth: 100,
            valueFormatter: (params) => {
                if (!params.value) return '';
                const entry = params.data as LogEntry;
                if (entry.dataEncoding === 'base64') {
                    try {
                        const decoded = atob(params.value);
                        return decoded.length > 200 ? decoded.substring(0, 200) + '...' : decoded;
                    } catch {
                        return '[Binary Data]';
                    }
                }
                return params.value;
            },
            sortable: false,
            filter: 'agTextColumnFilter',
            hide: true,
        },
        {
            headerName: 'Time',
            field: 'timestamp',
            width: 110,
            minWidth: 90,
            valueFormatter: (params) => formatTimestamp(params.value),
            tooltipValueGetter: (params) => formatFullTimestamp(params.value),
            filter: TimestampFilter,
        },
    ], []);

    const defaultColDef = useMemo<ColDef>(() => ({
        resizable: true,
        sortable: false,
        filter: true,
        suppressHeaderMenuButton: true,
    }), []);

    const sideBar = useMemo<SideBarDef>(() => ({
        toolPanels: [
            {
                id: 'columns',
                labelDefault: 'Columns',
                labelKey: 'columns',
                iconKey: 'columns',
                toolPanel: 'agColumnsToolPanel',
                toolPanelParams: {
                    suppressRowGroups: true,
                    suppressValues: true,
                    suppressPivots: true,
                    suppressPivotMode: true,
                },
            },
            {
                id: 'filters',
                labelDefault: 'Filters',
                labelKey: 'filters',
                iconKey: 'filter',
                toolPanel: 'agFiltersToolPanel',
            },
        ],
        defaultToolPanel: '',
    }), []);

    // Row styling based on highlight rules and alternating rows
    const getRowStyle = useCallback((params: RowClassParams<LogEntry>): Record<string, string | number> | undefined => {
        const entry = params.data;
        if (!entry) return undefined;

        // Check highlight rules first (they take priority)
        const sortedRules = [...highlightRules].sort((a, b) => b.priority - a.priority);
        for (const rule of sortedRules) {
            if (matchesHighlightRule(entry, rule)) {
                const style: Record<string, string | number> = {};

                // Use exact colors as stored - no theme adaptation
                if (rule.style.backgroundColor) style.backgroundColor = rule.style.backgroundColor;
                if (rule.style.textColor) style.color = rule.style.textColor;
                if (rule.style.fontWeight) style.fontWeight = rule.style.fontWeight;
                if (rule.style.fontStyle) style.fontStyle = rule.style.fontStyle;
                return style;
            }
        }

        // Apply alternating row colors if enabled (only for rows without highlight rules)
        if (view.alternatingRows && params.node?.rowIndex != null) {
            const isOddRow = params.node.rowIndex % 2 === 1;
            if (isOddRow) {
                // Subtle alternating colors - low contrast
                // Light: slightly darker than default white (#f8fafc = slate-50)
                // Dark: slightly lighter than default (#1e293b = slate-800, so use a touch lighter)
                return {
                    backgroundColor: theme === 'dark' ? '#243244' : '#f8fafc'
                };
            }
        }

        return undefined;
    }, [highlightRules, theme, view.alternatingRows]);

    // Handle grid ready
    const onGridReady = useCallback((params: GridReadyEvent) => {
        gridApiRef.current = params.api;

        // Apply initial column state if provided
        if (view.columnState && view.columnState.length > 0) {
            params.api.applyColumnState({ state: view.columnState });
        }

        // Restore scroll position if we have one saved
        // Note: This will be called when the grid first mounts
        hasRestoredStateRef.current = false;
    }, [view.columnState]);

    // Handle column state change
    const handleColumnStateChanged = useCallback(() => {
        if (gridApiRef.current && onColumnStateChange) {
            const state = gridApiRef.current.getColumnState();
            onColumnStateChange(view.id, state);
        }
    }, [onColumnStateChange, view.id]);

    // Handle filter change
    const handleFilterChanged = useCallback(() => {
        if (gridApiRef.current && onFilterModelChange) {
            const model = gridApiRef.current.getFilterModel();
            onFilterModelChange(view.id, model);
        }
    }, [onFilterModelChange, view.id]);

    // Handle scroll
    const handleBodyScroll = useCallback(() => {
        if (gridApiRef.current) {
            const scrollTop = gridApiRef.current.getVerticalPixelRange().top;
            scrollTopRef.current = scrollTop;

            // Debounce scroll change callback
            if (onScrollChange) {
                onScrollChange(view.id, scrollTop);
            }
        }
    }, [onScrollChange, view.id]);

    // Handle row selection
    const onRowClicked = useCallback((event: { data?: LogEntry }) => {
        setSelectedEntryId(event.data?.id || null);
    }, [setSelectedEntryId]);

    // Refs for stick-to-bottom behavior (from AgGridTest.tsx)
    const stickToBottomRef = useRef(true);
    const isProgrammaticScrollRef = useRef(false);
    const userInteractionTimeRef = useRef(0);
    const userDisabledAutoScrollTimeRef = useRef(0);

    // Snap to bottom helper - updates both viewports to prevent bounce
    const snapToBottom = useCallback(() => {
        if (!containerRef.current) return;

        const viewport = containerRef.current.querySelector('.ag-body-viewport') as HTMLElement;
        const fakeScroll = containerRef.current.querySelector('.ag-body-vertical-scroll-viewport') as HTMLElement;

        if (viewport) {
            isProgrammaticScrollRef.current = true;
            const maxScroll = viewport.scrollHeight - viewport.clientHeight;
            viewport.scrollTop = maxScroll;
            if (fakeScroll) {
                fakeScroll.scrollTop = maxScroll;
            }
            // Reset after a short delay
            setTimeout(() => {
                isProgrammaticScrollRef.current = false;
            }, 50);
        }
    }, []);

    // Set up scroll event listeners to track user scroll intent
    useEffect(() => {
        if (!containerRef.current) return;

        const viewport = containerRef.current.querySelector('.ag-body-viewport') as HTMLElement;
        const fakeScroll = containerRef.current.querySelector('.ag-body-vertical-scroll-viewport') as HTMLElement;

        if (!viewport) return;

        // Wheel event - user is scrolling with mouse wheel
        const handleWheel = (e: WheelEvent) => {
            userInteractionTimeRef.current = Date.now();
            // Scrolling up (negative deltaY) = user wants to leave auto-scroll
            if (e.deltaY < 0) {
                stickToBottomRef.current = false;
                userDisabledAutoScrollTimeRef.current = Date.now();
            }
        };

        // Mousedown on scrollbar track - user is dragging scrollbar
        const handleMouseDown = () => {
            userInteractionTimeRef.current = Date.now();
            // User is interacting with scrollbar, disable stick-to-bottom
            stickToBottomRef.current = false;
            userDisabledAutoScrollTimeRef.current = Date.now();
        };

        // Scroll event - check if user scrolled to bottom to re-enable
        const handleScroll = () => {
            if (isProgrammaticScrollRef.current) return;

            const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

            // If user scrolled to bottom (within 10px), enable stick-to-bottom
            if (distanceFromBottom < 10) {
                stickToBottomRef.current = true;
                // Reset the disabled timer so auto-scroll can resume immediately
                userDisabledAutoScrollTimeRef.current = 0;
            }
        };

        viewport.addEventListener('wheel', handleWheel, { passive: true });
        viewport.addEventListener('mousedown', handleMouseDown);
        fakeScroll?.addEventListener('mousedown', handleMouseDown);
        viewport.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            viewport.removeEventListener('wheel', handleWheel);
            viewport.removeEventListener('mousedown', handleMouseDown);
            fakeScroll?.removeEventListener('mousedown', handleMouseDown);
            viewport.removeEventListener('scroll', handleScroll);
        };
    }, [view.id]); // Re-attach when view changes

    // Auto-scroll to bottom when new entries arrive (only for active view with autoScroll)
    useEffect(() => {
        if (paused || !isActive || !view.autoScroll) return;

        if (gridApiRef.current && filteredEntries.length > 0) {
            const hasNewEntries = filteredEntries.length > lastEntryCountRef.current ||
                entriesVersion > lastEntriesVersionRef.current;

            if (hasNewEntries) {
                // Check timing conditions before auto-scrolling
                const timeSinceInteraction = Date.now() - userInteractionTimeRef.current;
                const timeSinceDisabled = Date.now() - userDisabledAutoScrollTimeRef.current;

                // Don't auto-scroll if:
                // 1. stickToBottom is false (user explicitly disabled)
                // 2. User interacted within last 500ms
                // 3. User disabled auto-scroll within last 5 seconds (longer grace period)
                if (stickToBottomRef.current && timeSinceInteraction > 500 && timeSinceDisabled > 5000) {
                    // Snap multiple times to catch all AG Grid internal updates
                    // This prevents the scroll bounce issue
                    snapToBottom();
                    queueMicrotask(() => snapToBottom());
                    requestAnimationFrame(() => {
                        snapToBottom();
                        requestAnimationFrame(() => snapToBottom());
                    });
                }
            }
        }
        lastEntryCountRef.current = filteredEntries.length;
        lastEntriesVersionRef.current = entriesVersion;
    }, [filteredEntries.length, isActive, view.autoScroll, paused, entriesVersion, snapToBottom]);

    // Restore scroll position when becoming active (but not on initial mount during auto-scroll)
    useEffect(() => {
        if (isActive && gridApiRef.current && !view.autoScroll && hasRestoredStateRef.current === false) {
            // If the view has a saved scroll position, restore it
            // (Scroll position is stored in the view via onScrollChange callback)
            hasRestoredStateRef.current = true;
        }
    }, [isActive, view.autoScroll]);

    // Track previous loading state to only call overlay methods on transitions
    const prevLoadingRef = useRef(loadingInitialData);

    // Show/hide loading overlay based on loadingInitialData state
    useEffect(() => {
        if (!gridApiRef.current) return;

        // Only act on state transitions, not on every render
        if (loadingInitialData && !prevLoadingRef.current) {
            // Transitioning to loading state - show overlay
            gridApiRef.current.showLoadingOverlay();
        } else if (!loadingInitialData && prevLoadingRef.current) {
            // Transitioning from loading to not loading - hide overlay
            gridApiRef.current.hideOverlay();
        }
        prevLoadingRef.current = loadingInitialData;
    }, [loadingInitialData]);

    return (
        <div
            ref={containerRef}
            className={`${theme === 'dark' ? 'ag-theme-balham-dark' : 'ag-theme-balham'} h-full w-full`}
            style={{
                fontSize: '13px',
                visibility: isActive ? 'visible' : 'hidden',
                position: isActive ? 'relative' : 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
            }}
        >
            <AgGridReact
                ref={gridRef}
                theme="legacy"
                rowData={filteredEntries}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                getRowId={getRowId}
                getRowStyle={getRowStyle}
                onGridReady={onGridReady}
                onRowClicked={onRowClicked}
                onColumnMoved={handleColumnStateChanged}
                onColumnResized={handleColumnStateChanged}
                onColumnVisible={handleColumnStateChanged}
                onFilterChanged={handleFilterChanged}
                onBodyScroll={handleBodyScroll}
                animateRows={false}
                rowSelection={{ mode: 'singleRow', enableClickSelection: true, hideDisabledCheckboxes: true, checkboxes: false }}
                sideBar={sideBar}
                cellSelection={true}
                suppressCellFocus={true}
                rowBuffer={50}
                suppressColumnVirtualisation={false}
                suppressRowVirtualisation={false}
                debounceVerticalScrollbar={true}
                suppressAnimationFrame={false}
                asyncTransactionWaitMillis={50}
                tooltipShowDelay={500}
                overlayNoRowsTemplate={overlayNoRowsTemplate}
                overlayLoadingTemplate={overlayLoadingTemplate}
                statusBar={{
                    statusPanels: [
                        { statusPanel: 'agTotalRowCountComponent', align: 'left' },
                        { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
                    ]
                }}
            />
        </div>
    );
}
