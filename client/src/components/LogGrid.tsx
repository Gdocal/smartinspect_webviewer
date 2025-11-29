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

import { useLogStore, LogEntry, Level, LogEntryType, matchesHighlightRule } from '../store/logStore';
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

export function LogGrid({ onColumnStateChange, initialColumnState }: LogGridProps) {
    const gridRef = useRef<AgGridReact>(null);
    const gridApiRef = useRef<GridApi | null>(null);
    const { entries, autoScroll, paused, setSelectedEntryId, filter, globalHighlightRules, views, activeViewId, entriesVersion } = useLogStore();

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
    const lastEntryCountRef = useRef(0);
    const lastEntriesVersionRef = useRef(0);

    // OPTIMIZED: Debounced filter computation
    const filteredEntries = useMemo(() => {
        // Check if any filter is active
        const hasSessionFilter = filter.sessions.length > 0;
        const hasLevelFilter = filter.levels.length > 0;
        const hasTitleFilter = !!filter.titlePattern;
        const hasMessageFilter = !!filter.messagePattern;

        // Fast path: no filters active
        if (!hasSessionFilter && !hasLevelFilter && !hasTitleFilter && !hasMessageFilter) {
            return entries;
        }

        // Pre-compile regex patterns
        let titleRegex: RegExp | null = null;
        let messageRegex: RegExp | null = null;

        if (hasTitleFilter) {
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

        // Pre-create Sets for O(1) lookup
        const sessionSet = hasSessionFilter ? new Set(filter.sessions) : null;
        const levelSet = hasLevelFilter ? new Set(filter.levels) : null;

        // Single-pass filtering
        return entries.filter(e => {
            // Session filter
            if (sessionSet && (!e.sessionName || !sessionSet.has(e.sessionName))) {
                return false;
            }

            // Level filter
            if (levelSet && (e.level === undefined || !levelSet.has(e.level))) {
                return false;
            }

            // Title pattern filter
            if (titleRegex) {
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

            return true;
        });
    }, [entries, filter, entriesVersion]);

    // Column definitions with all columns
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
            headerName: 'Time',
            field: 'timestamp',
            width: 110,
            minWidth: 90,
            valueFormatter: (params) => formatTimestamp(params.value),
            tooltipValueGetter: (params) => formatFullTimestamp(params.value),
            sortable: true,
            filter: 'agDateColumnFilter',
        },
        {
            headerName: 'Level',
            field: 'level',
            width: 70,
            minWidth: 60,
            cellRenderer: LevelCellRenderer,
            sortable: true,
            filter: 'agSetColumnFilter',
        },
        {
            headerName: 'Session',
            field: 'sessionName',
            width: 140,
            minWidth: 100,
            sortable: true,
            filter: 'agSetColumnFilter',
        },
        {
            headerName: 'Title',
            field: 'title',
            flex: 2,
            minWidth: 200,
            sortable: true,
            filter: 'agTextColumnFilter',
            tooltipField: 'title',
        },
        {
            headerName: 'Application',
            field: 'appName',
            width: 140,
            minWidth: 100,
            sortable: true,
            filter: 'agSetColumnFilter',
            hide: false,
        },
        {
            headerName: 'Host',
            field: 'hostName',
            width: 120,
            minWidth: 80,
            sortable: true,
            filter: 'agSetColumnFilter',
            hide: true,
        },
        {
            headerName: 'Process',
            field: 'processId',
            width: 80,
            minWidth: 60,
            sortable: true,
            filter: 'agNumberColumnFilter',
            hide: true,
        },
        {
            headerName: 'Thread',
            field: 'threadId',
            width: 70,
            minWidth: 50,
            sortable: true,
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
    ], []);

    // Default column definition
    const defaultColDef = useMemo<ColDef>(() => ({
        resizable: true,
        sortable: true,
        filter: true,
        suppressMenu: false,
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

    // Row styling based on user-defined highlight rules (no auto-styling)
    const getRowStyle = useCallback((params: RowClassParams<LogEntry>): Record<string, string | number> | undefined => {
        const entry = params.data;
        if (!entry) return undefined;

        // Apply user-defined highlight rules (sorted by priority, highest first)
        const sortedRules = [...activeHighlightRules].sort((a, b) => b.priority - a.priority);
        for (const rule of sortedRules) {
            if (matchesHighlightRule(entry, rule)) {
                const style: Record<string, string | number> = {};
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

    // Auto-scroll to bottom when new entries arrive
    useEffect(() => {
        // Don't auto-scroll when paused
        if (paused) return;

        if (autoScroll && gridApiRef.current && filteredEntries.length > 0) {
            // Check if we have new entries (count increased OR entriesVersion changed with same count)
            const hasNewEntries = filteredEntries.length > lastEntryCountRef.current ||
                                  entriesVersion > lastEntriesVersionRef.current;

            if (hasNewEntries) {
                // Use setTimeout to ensure grid has rendered the new rows
                setTimeout(() => {
                    if (gridApiRef.current) {
                        const rowCount = gridApiRef.current.getDisplayedRowCount();
                        if (rowCount > 0) {
                            gridApiRef.current.ensureIndexVisible(rowCount - 1, 'bottom');
                        }
                    }
                }, 100);
            }
        }
        lastEntryCountRef.current = filteredEntries.length;
        lastEntriesVersionRef.current = entriesVersion;
    }, [filteredEntries.length, autoScroll, paused, entriesVersion]);

    return (
        <div className="ag-theme-balham h-full w-full" style={{ fontSize: '13px' }}>
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
                // PERFORMANCE OPTIMIZATIONS
                animateRows={false}
                rowSelection={{ mode: 'singleRow', enableClickSelection: true }}
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
