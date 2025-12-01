/**
 * LogGrid - Main log entries grid using AG Grid Enterprise
 * OPTIMIZED: Memoized renderers, debounced filtering, efficient updates
 */

import { useMemo, useRef, useCallback, useEffect, memo } from 'react';
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
    AllCommunityModule
} from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';

// Register AG Grid modules (required for v34+)
ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

import { useLogStore, LogEntry, Level, LogEntryType, matchesHighlightRule, Filter, ListTextFilter, TextFilter } from '../store/logStore';
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

// MEMOIZED Icon cell renderer - prevents re-creation on each render
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

// Timestamp formatter - cached Date objects for performance
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

    // Limit cache size
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

interface LogGridProps {
    onColumnStateChange?: (state: ColumnState[]) => void;
    initialColumnState?: ColumnState[];
}

// Stable getRowId function - defined outside component
const getRowId = (params: GetRowIdParams<LogEntry>) => String(params.data.id);

// Create a stable key from filter values for cache comparison
function getFilterKey(filter: Filter): string {
    return JSON.stringify({
        sessions: filter.sessions.slice().sort(),
        levels: filter.levels.slice().sort(),
        titlePattern: filter.titlePattern,
        messagePattern: filter.messagePattern,
        inverseMatch: filter.inverseMatch,
        appNames: filter.appNames.slice().sort(),
        hostNames: filter.hostNames.slice().sort(),
        entryTypes: filter.entryTypes.slice().sort(),
        // Include extended filters for cache invalidation
        sessionFilter: filter.sessionFilter,
        appNameFilter: filter.appNameFilter,
        hostNameFilter: filter.hostNameFilter,
        titleFilter: filter.titleFilter,
        levelsInverse: filter.levelsInverse,
        entryTypesInverse: filter.entryTypesInverse,
    });
}

// Helper to match a string value against a ListTextFilter
function matchesListTextFilter(value: string | undefined, filter: ListTextFilter | undefined): boolean {
    if (!filter) return true; // No filter = match all

    // Check if filter is active
    const hasListValues = filter.mode === 'list' && filter.values.length > 0;
    const hasTextValue = filter.mode === 'text' && filter.textValue;

    if (!hasListValues && !hasTextValue) return true; // Empty filter = match all

    const val = value || '';
    let matches = false;

    if (filter.mode === 'list') {
        matches = filter.values.includes(val);
    } else {
        // Text mode
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
    if (!filter || !filter.value) return true; // No filter = match all

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

// Cache for filtered entries per view - stores { filterKey, entriesVersion, result }
interface FilterCache {
    filterKey: string;
    entriesVersion: number;
    entriesLength: number;
    result: LogEntry[];
}
const filterCacheByView = new Map<string, FilterCache>();

export function LogGrid({ onColumnStateChange, initialColumnState }: LogGridProps) {
    const gridRef = useRef<AgGridReact>(null);
    const gridApiRef = useRef<GridApi | null>(null);
    const { entries, autoScroll, paused, setSelectedEntryId, filter, globalHighlightRules, views, activeViewId, entriesVersion, theme } = useLogStore();

    // Get active view's highlight rules combined with global (if enabled)
    const activeHighlightRules = useMemo(() => {
        const activeView = views.find(v => v.id === activeViewId);
        if (!activeView) return globalHighlightRules;

        const viewRules = activeView.highlightRules || [];
        if (activeView.useGlobalHighlights) {
            return [...viewRules, ...globalHighlightRules];
        }
        return viewRules;
    }, [views, activeViewId, globalHighlightRules]);

    // Simple static overlay - connection status is shown in footer
    const overlayNoRowsTemplate = '<span class="text-slate-400">No log entries</span>';

    // OPTIMIZED: Cached filter computation per view
    // Uses a cache to avoid re-filtering when switching tabs if filter values are unchanged
    const filteredEntries = useMemo(() => {
        const viewId = activeViewId || 'default';
        const filterKey = getFilterKey(filter);
        const cached = filterCacheByView.get(viewId);

        // Check if we can use cached result
        if (cached &&
            cached.filterKey === filterKey &&
            cached.entriesVersion === entriesVersion &&
            cached.entriesLength === entries.length) {
            return cached.result;
        }

        // Check if any filter is active (including extended filters)
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

        // Fall back to legacy filters if extended not present
        const hasSessionFilter = hasExtendedSessionFilter || filter.sessions.length > 0;
        const hasLevelFilter = filter.levels.length > 0;
        const hasTitleFilter = hasExtendedTitleFilter || !!filter.titlePattern;
        const hasMessageFilter = !!filter.messagePattern;
        const hasAppNameFilter = hasExtendedAppNameFilter || filter.appNames.length > 0;
        const hasHostNameFilter = hasExtendedHostNameFilter || filter.hostNames.length > 0;
        const hasEntryTypeFilter = filter.entryTypes.length > 0;

        let result: LogEntry[];

        // Fast path: no filters active
        if (!hasSessionFilter && !hasLevelFilter && !hasTitleFilter && !hasMessageFilter &&
            !hasAppNameFilter && !hasHostNameFilter && !hasEntryTypeFilter) {
            result = entries;
        } else {
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

            // Single-pass filtering
            result = entries.filter(e => {
                // Session filter - prefer extended filter if available
                if (hasExtendedSessionFilter) {
                    if (!matchesListTextFilter(e.sessionName, filter.sessionFilter)) {
                        return false;
                    }
                } else if (sessionSet && (!e.sessionName || !sessionSet.has(e.sessionName))) {
                    return false;
                }

                // Level filter (with inverse support)
                if (levelSet) {
                    const matches = e.level !== undefined && levelSet.has(e.level);
                    const result = filter.levelsInverse ? !matches : matches;
                    if (!result) return false;
                }

                // Title filter - prefer extended filter if available
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

                // Message pattern filter (legacy)
                if (messageRegex) {
                    const titleMatch = messageRegex.test(e.title || '');
                    const dataMatch = messageRegex.test(e.data || '');
                    const matches = titleMatch || dataMatch;
                    if (filter.inverseMatch ? matches : !matches) {
                        return false;
                    }
                }

                // App name filter - prefer extended filter if available
                if (hasExtendedAppNameFilter) {
                    if (!matchesListTextFilter(e.appName, filter.appNameFilter)) {
                        return false;
                    }
                } else if (appNameSet && (!e.appName || !appNameSet.has(e.appName))) {
                    return false;
                }

                // Host name filter - prefer extended filter if available
                if (hasExtendedHostNameFilter) {
                    if (!matchesListTextFilter(e.hostName, filter.hostNameFilter)) {
                        return false;
                    }
                } else if (hostNameSet && (!e.hostName || !hostNameSet.has(e.hostName))) {
                    return false;
                }

                // Entry type filter (with inverse support)
                if (entryTypeSet) {
                    const matches = e.logEntryType !== undefined && entryTypeSet.has(e.logEntryType);
                    const result = filter.entryTypesInverse ? !matches : matches;
                    if (!result) return false;
                }

                return true;
            });
        }

        // Update cache for this view
        filterCacheByView.set(viewId, {
            filterKey,
            entriesVersion,
            entriesLength: entries.length,
            result
        });

        // Limit cache size to prevent memory bloat (keep max 10 views)
        if (filterCacheByView.size > 10) {
            const firstKey = filterCacheByView.keys().next().value;
            if (firstKey && firstKey !== viewId) {
                filterCacheByView.delete(firstKey);
            }
        }

        return result;
    }, [entries, filter, entriesVersion, activeViewId]);


    // Column definitions with all columns
    // Order: Icon (pinned), Title, Level, Session, Application, Host, Process, Thread, Data, Time
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

    // Default column definition - filter icons show on hover (via CSS)
    const defaultColDef = useMemo<ColDef>(() => ({
        resizable: true,
        sortable: false,
        filter: true,
        suppressHeaderMenuButton: true,
    }), []);

    // Sidebar with column tool panel
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

    // Row styling based on user-defined highlight rules
    // Uses exact colors as stored - no theme adaptation
    const getRowStyle = useCallback((params: RowClassParams<LogEntry>): Record<string, string | number> | undefined => {
        const entry = params.data;
        if (!entry) return undefined;

        // Apply user-defined highlight rules (sorted by priority, highest first)
        const sortedRules = [...activeHighlightRules].sort((a, b) => b.priority - a.priority);
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

        // No auto-styling - user controls all highlighting via rules
        return undefined;
    }, [activeHighlightRules]);

    // Handle grid ready
    const onGridReady = useCallback((params: GridReadyEvent) => {
        gridApiRef.current = params.api;

        // Apply initial column state if provided
        if (initialColumnState && initialColumnState.length > 0) {
            params.api.applyColumnState({ state: initialColumnState });
        }
    }, [initialColumnState]);

    // Handle column state change
    const onColumnStateChanged = useCallback(() => {
        if (gridApiRef.current && onColumnStateChange) {
            const state = gridApiRef.current.getColumnState();
            onColumnStateChange(state);
        }
    }, [onColumnStateChange]);

    // Handle row selection
    const onRowClicked = useCallback((event: { data?: LogEntry }) => {
        setSelectedEntryId(event.data?.id || null);
    }, [setSelectedEntryId]);

    // Auto-scroll handler - called when grid finishes updating row data
    const onRowDataUpdated = useCallback(() => {
        // Don't auto-scroll when paused or disabled
        if (paused || !autoScroll || !gridApiRef.current) return;

        const rowCount = gridApiRef.current.getDisplayedRowCount();
        if (rowCount > 0) {
            gridApiRef.current.ensureIndexVisible(rowCount - 1, 'bottom');
        }
    }, [autoScroll, paused]);

    return (
        <div className={`${theme === 'dark' ? 'ag-theme-balham-dark' : 'ag-theme-balham'} h-full w-full`} style={{ fontSize: '13px' }}>
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
                onColumnMoved={onColumnStateChanged}
                onColumnResized={onColumnStateChanged}
                onColumnVisible={onColumnStateChanged}
                onRowDataUpdated={onRowDataUpdated}
                // PERFORMANCE OPTIMIZATIONS
                animateRows={false}
                rowSelection={{ mode: 'singleRow', enableClickSelection: true, hideDisabledCheckboxes: true, checkboxes: false }}
                sideBar={sideBar}
                cellSelection={true}
                suppressCellFocus={true}
                // Increased row buffer for smoother scrolling
                rowBuffer={50}
                // Disable expensive features
                suppressColumnVirtualisation={false}
                suppressRowVirtualisation={false}
                // Debounce resize events
                debounceVerticalScrollbar={true}
                // Reduce DOM operations
                suppressAnimationFrame={false}
                // Async transactions for bulk updates
                asyncTransactionWaitMillis={50}
                tooltipShowDelay={500}
                overlayNoRowsTemplate={overlayNoRowsTemplate}
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
