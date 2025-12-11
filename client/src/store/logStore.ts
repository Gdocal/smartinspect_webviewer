/**
 * Log Store - Zustand state management for log entries
 * OPTIMIZED: Ring buffer, batch updates, minimal object creation
 */

import { create } from 'zustand';
import { ColumnState } from 'ag-grid-community';

// Counter for unique stream entry IDs (Date.now() alone can produce duplicates within same ms)
let streamEntryIdCounter = 0;
function getUniqueStreamEntryId(): number {
    return Date.now() * 1000 + (streamEntryIdCounter++ % 1000);
}

// Log entry types (matching server)
export enum Level {
    Debug = 0,
    Verbose = 1,
    Message = 2,
    Warning = 3,
    Error = 4,
    Fatal = 5,
    Control = 6
}

export enum LogEntryType {
    Separator = 0,
    EnterMethod = 1,
    LeaveMethod = 2,
    ResetCallstack = 3,
    Message = 100,
    Warning = 101,
    Error = 102,
    InternalError = 103,
    Comment = 104,
    VariableValue = 105,
    Checkpoint = 106,
    Debug = 107,
    Verbose = 108,
    Fatal = 109,
    Conditional = 110,
    Assert = 111,
    Text = 200,
    Binary = 201,
    Graphic = 202,
    Source = 203,
    Object = 204,
    WebContent = 205,
    System = 206,
    MemoryStatistic = 207,
    DatabaseResult = 208,
    DatabaseStructure = 209
}

export interface LogEntry {
    id: number;
    type: string;
    logEntryType?: number;
    viewerId?: number;
    appName?: string;
    sessionName?: string;
    title?: string;
    hostName?: string;
    processId?: number;
    threadId?: number;
    timestamp: string;
    color?: { r: number; g: number; b: number; a: number };
    data?: string;
    dataEncoding?: string;
    level?: number;
    receivedAt?: string;
    // ProcessFlow fields
    processFlowType?: number;
    depth?: number;
    parentId?: number | null;
    context?: string[];
    matchingEnterId?: number | null;
    // Async context fields (v2 protocol)
    correlationId?: string;      // Groups related async operations
    operationName?: string;      // Current operation name within async flow
    operationDepth?: number;     // Async nesting level
}

export interface WatchValue {
    value: string;
    timestamp: string;
    session?: string;
    watchType?: number;
    group?: string;  // Optional group for organizing watches
}

export interface Filter {
    sessions: string[];
    levels: number[];
    titlePattern: string;
    messagePattern: string;
    inverseMatch: boolean;
    from: Date | null;
    to: Date | null;
    appNames: string[];
    hostNames: string[];
    entryTypes: number[];
    // Extended filters using ListTextFilter for text mode support
    sessionFilter?: ListTextFilter;
    appNameFilter?: ListTextFilter;
    hostNameFilter?: ListTextFilter;
    titleFilter?: TextFilter;
    levelsInverse?: boolean;
    entryTypesInverse?: boolean;
}

// Text filter with operator and inverse support
export interface TextFilter {
    value: string;
    operator: 'contains' | 'equals' | 'starts' | 'ends' | 'regex';
    inverse: boolean;
    caseSensitive: boolean;
}

// Combined list + text filter - can use EITHER list selection OR text matching
// mode: 'list' = match against selected values, 'text' = use text filter
export interface ListTextFilter {
    mode: 'list' | 'text';
    // List mode
    values: string[];
    // Text mode
    textValue: string;
    textOperator: 'contains' | 'equals' | 'starts' | 'ends' | 'regex';
    caseSensitive?: boolean;  // For text mode
    // Common
    inverse: boolean;
}

// Default list text filter
export const defaultListTextFilter: ListTextFilter = {
    mode: 'list',
    values: [],
    textValue: '',
    textOperator: 'contains',
    inverse: false
};

// ============================================================================
// NEW FILTER RULES SYSTEM (v2)
// Supports multiple rules per field, each with enable/disable and include/exclude
// ============================================================================

// Operators for filter matching
export type FilterOperator = 'list' | 'contains' | 'starts' | 'ends' | 'regex' | 'equals';

// A single filter rule - can be enabled/disabled, include/exclude
export interface FilterRule {
    id: string;
    enabled: boolean;           // Can be temporarily disabled without deleting
    include: boolean;           // true = show matching (include), false = hide matching (exclude)
    operator: FilterOperator;   // How to match the value
    value: string;              // Pattern for text operators (contains, starts, ends, regex, equals)
    values: string[];           // Selected items for 'list' operator
    caseSensitive?: boolean;    // For text operators (default: false)
}

// Create a new filter rule with defaults
export function createFilterRule(partial: Partial<FilterRule> = {}): FilterRule {
    return {
        id: Math.random().toString(36).substring(2, 9),
        enabled: true,
        include: true,
        operator: 'list',
        value: '',
        values: [],
        caseSensitive: false,
        ...partial
    };
}

// Collection of filter rules for a field
export interface FilterRules {
    rules: FilterRule[];
}

// Default empty filter rules
export const defaultFilterRules: FilterRules = {
    rules: []
};

// Create empty filter rules
export function createFilterRules(): FilterRules {
    return { rules: [] };
}

// Helper to check if filter rules have any active rules
export function hasActiveFilterRules(filterRules: FilterRules): boolean {
    return filterRules.rules.some(r => r.enabled && (r.values.length > 0 || r.value.trim() !== ''));
}

// Helper to count active rules
export function countActiveRules(filterRules: FilterRules): { includes: number; excludes: number } {
    const activeRules = filterRules.rules.filter(r => r.enabled && (r.values.length > 0 || r.value.trim() !== ''));
    return {
        includes: activeRules.filter(r => r.include).length,
        excludes: activeRules.filter(r => !r.include).length
    };
}

// The new v2 filter structure with multiple rules per field
export interface FilterV2 {
    version: 2;
    sessions: FilterRules;
    levels: FilterRules;        // values are string representations of level numbers ('0', '1', etc.)
    appNames: FilterRules;
    hostNames: FilterRules;
    titles: FilterRules;
    entryTypes: FilterRules;    // values are string representations of entry type numbers
    // Quick search pattern (searches title and data)
    messagePattern: string;
    // Time range
    from: Date | null;
    to: Date | null;
}

// Create default empty v2 filter
export function createDefaultFilterV2(): FilterV2 {
    return {
        version: 2,
        sessions: createFilterRules(),
        levels: createFilterRules(),
        appNames: createFilterRules(),
        hostNames: createFilterRules(),
        titles: createFilterRules(),
        entryTypes: createFilterRules(),
        messagePattern: '',
        from: null,
        to: null
    };
}

// Check if entry matches a single rule
export function matchesFilterRule(rule: FilterRule, value: string | undefined | null): boolean {
    if (!rule.enabled) return false;
    if (!value) value = '';

    const testValue = rule.caseSensitive ? value : value.toLowerCase();

    switch (rule.operator) {
        case 'list':
            if (rule.values.length === 0) return false;
            const valuesToMatch = rule.caseSensitive
                ? rule.values
                : rule.values.map(v => v.toLowerCase());
            return valuesToMatch.includes(testValue);

        case 'contains': {
            if (!rule.value) return false;
            const pattern = rule.caseSensitive ? rule.value : rule.value.toLowerCase();
            return testValue.includes(pattern);
        }

        case 'starts': {
            if (!rule.value) return false;
            const pattern = rule.caseSensitive ? rule.value : rule.value.toLowerCase();
            return testValue.startsWith(pattern);
        }

        case 'ends': {
            if (!rule.value) return false;
            const pattern = rule.caseSensitive ? rule.value : rule.value.toLowerCase();
            return testValue.endsWith(pattern);
        }

        case 'equals': {
            if (!rule.value) return false;
            const pattern = rule.caseSensitive ? rule.value : rule.value.toLowerCase();
            return testValue === pattern;
        }

        case 'regex': {
            if (!rule.value) return false;
            try {
                const flags = rule.caseSensitive ? '' : 'i';
                const regex = new RegExp(rule.value, flags);
                return regex.test(value); // Use original value for regex
            } catch {
                return false; // Invalid regex
            }
        }

        default:
            return false;
    }
}

// Check if entry passes a FilterRules collection (all rules for one field)
// Logic:
// - If no include rules active: entry passes (show all by default)
// - If include rules exist: entry must match at least one include rule
// - If exclude rules match: entry is filtered out (excludes override includes)
export function passesFilterRules(filterRules: FilterRules, value: string | undefined | null): boolean {
    if (!filterRules.rules || filterRules.rules.length === 0) {
        return true; // No rules = show all
    }

    const activeRules = filterRules.rules.filter(r =>
        r.enabled && (r.values.length > 0 || r.value.trim() !== '')
    );

    if (activeRules.length === 0) {
        return true; // No active rules = show all
    }

    const includeRules = activeRules.filter(r => r.include);
    const excludeRules = activeRules.filter(r => !r.include);

    // Check excludes first - if any exclude matches, filter out
    for (const rule of excludeRules) {
        if (matchesFilterRule(rule, value)) {
            return false; // Excluded
        }
    }

    // If no include rules, entry passes (wasn't excluded)
    if (includeRules.length === 0) {
        return true;
    }

    // Must match at least one include rule
    for (const rule of includeRules) {
        if (matchesFilterRule(rule, value)) {
            return true;
        }
    }

    return false; // Has include rules but didn't match any
}

// Migrate old Filter to new FilterV2 format
export function migrateFilterToV2(oldFilter: Filter): FilterV2 {
    const v2: FilterV2 = createDefaultFilterV2();

    // Migrate sessions
    if (oldFilter.sessionFilter) {
        const sf = oldFilter.sessionFilter;
        if (sf.mode === 'list' && sf.values.length > 0) {
            v2.sessions.rules.push(createFilterRule({
                include: !sf.inverse,
                operator: 'list',
                values: [...sf.values]
            }));
        } else if (sf.mode === 'text' && sf.textValue) {
            v2.sessions.rules.push(createFilterRule({
                include: !sf.inverse,
                operator: sf.textOperator === 'contains' ? 'contains' : sf.textOperator === 'equals' ? 'equals' : 'regex',
                value: sf.textValue
            }));
        }
    } else if (oldFilter.sessions && oldFilter.sessions.length > 0) {
        v2.sessions.rules.push(createFilterRule({
            include: true,
            operator: 'list',
            values: [...oldFilter.sessions]
        }));
    }

    // Migrate levels
    if (oldFilter.levels && oldFilter.levels.length > 0) {
        v2.levels.rules.push(createFilterRule({
            include: !oldFilter.levelsInverse,
            operator: 'list',
            values: oldFilter.levels.map(l => String(l))
        }));
    }

    // Migrate app names
    if (oldFilter.appNameFilter) {
        const af = oldFilter.appNameFilter;
        if (af.mode === 'list' && af.values.length > 0) {
            v2.appNames.rules.push(createFilterRule({
                include: !af.inverse,
                operator: 'list',
                values: [...af.values]
            }));
        } else if (af.mode === 'text' && af.textValue) {
            v2.appNames.rules.push(createFilterRule({
                include: !af.inverse,
                operator: af.textOperator === 'contains' ? 'contains' : af.textOperator === 'equals' ? 'equals' : 'regex',
                value: af.textValue
            }));
        }
    } else if (oldFilter.appNames && oldFilter.appNames.length > 0) {
        v2.appNames.rules.push(createFilterRule({
            include: true,
            operator: 'list',
            values: [...oldFilter.appNames]
        }));
    }

    // Migrate host names
    if (oldFilter.hostNameFilter) {
        const hf = oldFilter.hostNameFilter;
        if (hf.mode === 'list' && hf.values.length > 0) {
            v2.hostNames.rules.push(createFilterRule({
                include: !hf.inverse,
                operator: 'list',
                values: [...hf.values]
            }));
        } else if (hf.mode === 'text' && hf.textValue) {
            v2.hostNames.rules.push(createFilterRule({
                include: !hf.inverse,
                operator: hf.textOperator === 'contains' ? 'contains' : hf.textOperator === 'equals' ? 'equals' : 'regex',
                value: hf.textValue
            }));
        }
    } else if (oldFilter.hostNames && oldFilter.hostNames.length > 0) {
        v2.hostNames.rules.push(createFilterRule({
            include: true,
            operator: 'list',
            values: [...oldFilter.hostNames]
        }));
    }

    // Migrate title pattern
    if (oldFilter.titleFilter && oldFilter.titleFilter.value) {
        const tf = oldFilter.titleFilter;
        v2.titles.rules.push(createFilterRule({
            include: !tf.inverse,
            operator: tf.operator === 'contains' ? 'contains' : tf.operator === 'equals' ? 'equals' : 'regex',
            value: tf.value,
            caseSensitive: tf.caseSensitive
        }));
    } else if (oldFilter.titlePattern) {
        v2.titles.rules.push(createFilterRule({
            include: !oldFilter.inverseMatch,
            operator: 'regex',
            value: oldFilter.titlePattern
        }));
    }

    // Migrate entry types
    if (oldFilter.entryTypes && oldFilter.entryTypes.length > 0) {
        v2.entryTypes.rules.push(createFilterRule({
            include: !oldFilter.entryTypesInverse,
            operator: 'list',
            values: oldFilter.entryTypes.map(t => String(t))
        }));
    }

    // Migrate simple fields
    v2.messagePattern = oldFilter.messagePattern || '';
    v2.from = oldFilter.from;
    v2.to = oldFilter.to;

    return v2;
}

// ============================================================================
// END NEW FILTER RULES SYSTEM
// ============================================================================

// Highlight filter - same structure as view filter but for highlighting
export interface HighlightFilter {
    // String fields with dual mode (list + text)
    sessionFilter: ListTextFilter;
    appNameFilter: ListTextFilter;
    hostNameFilter: ListTextFilter;
    // Numeric multi-select (levels and entry types are always from predefined list)
    levels: number[];
    levelsInverse: boolean;
    entryTypes: number[];
    entryTypesInverse: boolean;
    // Single value filters
    processId: number | null;
    processIdInverse: boolean;
    // Text filters with operators
    titleFilter: TextFilter;
}

// Default highlight filter
export const defaultHighlightFilter: HighlightFilter = {
    sessionFilter: { ...defaultListTextFilter },
    appNameFilter: { ...defaultListTextFilter },
    hostNameFilter: { ...defaultListTextFilter },
    levels: [],
    levelsInverse: false,
    entryTypes: [],
    entryTypesInverse: false,
    processId: null,
    processIdInverse: false,
    titleFilter: { value: '', operator: 'contains', inverse: false, caseSensitive: false }
};

// Highlight style with optional dark theme variants
// If *Dark fields are undefined, they will be auto-calculated from light colors
export interface HighlightStyle {
    backgroundColor?: string;      // Light theme background
    backgroundColorDark?: string;  // Dark theme background (undefined = auto-adapt)
    textColor?: string;            // Light theme text
    textColorDark?: string;        // Dark theme text (undefined = auto-adapt)
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
}

// Highlighting rule for custom styling
export interface HighlightRule {
    id: string;
    name: string;
    enabled: boolean;
    priority: number; // Higher = applied first
    filter: HighlightFilter; // Use unified filter structure
    style: HighlightStyle;
}

// Legacy conditions type for backwards compatibility
export interface LegacyHighlightCondition {
    field: 'level' | 'sessionName' | 'appName' | 'title' | 'logEntryType';
    operator: 'equals' | 'contains' | 'regex' | 'in';
    value: string | number | string[] | number[];
}

// View = predefined filter set with highlighting rules
// VirtualLogGrid column configuration (replaces AG Grid ColumnState)
export type VlgColumnType = 'icon' | 'level' | 'text' | 'number' | 'timestamp' | 'stream-content';

export interface VlgColumnConfig {
    id: string;
    field: string;
    header: string;
    type: VlgColumnType;
    width?: number;
    minWidth?: number;
    flex?: number;
    hidden?: boolean;
    pinned?: 'left' | 'right';
    align?: 'left' | 'center' | 'right';
}

export interface View {
    id: string;
    name: string;
    icon?: string;
    tabColor?: string; // Background color for tab header (CSS color value)
    filter: Filter;
    filterV2?: FilterV2; // New rules-based filter (takes precedence over 'filter' when present)
    highlightRules: HighlightRule[];
    useGlobalHighlights: boolean; // Whether to also apply global highlight rules
    columnState?: ColumnState[]; // Legacy AG Grid column state (kept for backwards compatibility)
    columnConfig?: VlgColumnConfig[]; // VirtualLogGrid column configuration
    autoScroll: boolean;
    alternatingRows?: boolean; // Show alternating row colors for better readability
}

// Extended view with per-view grid state (for Projects system)
export interface ViewWithGridState extends View {
    gridFilterModel: Record<string, unknown>;  // AG Grid user-applied column filters
    scrollPosition: { top: number };           // Scroll position to restore
}

// Project data limits
export interface ProjectLimits {
    initialLoadLimit: number;   // How many entries to fetch on connect
    maxBufferEntries: number;   // Total entries to keep in client memory
    maxGridRows: number;        // Max rows each grid view displays
}

// Project data structure
export interface Project {
    id: string;
    name: string;
    description?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    isShared: boolean;

    // Project data
    views: ViewWithGridState[];
    activeViewId: string | null;
    panelSizes: {
        detailHeightPercent: number;
        watchWidthPercent: number;
    };
    panelVisibility: {
        showDetailPanel: boolean;
        showWatchPanel: boolean;
        showStreamPanel: boolean;
    };
    limits: ProjectLimits;
    theme: 'light' | 'dark';
    // Column widths for panels (percentages)
    watchPanelColumnWidths?: [number, number, number, number];  // [name, group, value, updated]
    streamsViewColumnWidths?: [number, number, number];  // [content (flex), type (px), time (px)]
    // Hidden columns for panels
    watchPanelHiddenColumns?: string[];
    streamsViewHiddenColumns?: string[];
    streamsChannelHiddenColumns?: string[];
}

// Project summary (without full project data, for listing)
export interface ProjectSummary {
    id: string;
    name: string;
    description?: string;
    room: string;
    user: string;
    isShared: boolean;
    createdAt: string;
    updatedAt: string;
}

// Working project state in localStorage
export interface WorkingProjectState {
    project: Project;
    loadedProjectId: string | null;  // Which named project was loaded (null = fresh)
    loadedProjectDirty: boolean;     // Has working project diverged from loaded?
}

// Stream entry for high-frequency data
export interface StreamEntry {
    id: number;
    channel: string;
    data: string;
    timestamp: string;
    sessionName?: string;
    streamType?: string;
    group?: string;  // Optional group for filtering/organizing channels
}

// Layout sizes stored as percentages (0-100)
export interface LayoutSizes {
    detailPanelHeightPercent: number;
    watchPanelWidthPercent: number;
}

// Panel visibility state
export interface PanelVisibility {
    showDetailPanel: boolean;
    showWatchPanel: boolean;
    showStreamPanel: boolean;
}

interface LogState {
    // Connection
    connected: boolean;
    connecting: boolean;
    loadingInitialData: boolean; // True while fetching initial log entries after connect
    error: string | null;
    reconnectIn: number | null; // Seconds until reconnect attempt
    serverUrl: string | null; // Current server URL being connected to
    authRequired: boolean; // True when server requires authentication (close code 4001)
    wsLatency: number | null; // WebSocket round-trip latency in ms
    wsThroughput: number; // WebSocket data throughput in bytes/sec

    // Room isolation (multi-project support)
    currentRoom: string; // Active room ID
    currentUser: string; // User identifier for settings
    availableRooms: string[]; // List of known rooms from server
    roomSwitching: boolean; // True while switching rooms
    newRoomDetected: boolean; // True when a new room is created (triggers animation)
    roomLastActivity: Record<string, string>; // Last activity timestamp per room (ISO string)

    // Log entries (limited buffer for performance)
    entries: LogEntry[];
    limits: ProjectLimits;  // Project limits (initialLoadLimit, maxBufferEntries, maxGridRows)
    lastEntryId: number;
    entriesVersion: number; // Increment to trigger re-render only when needed

    // Watches
    watches: Record<string, WatchValue>;

    // Sessions (log sources)
    sessions: Record<string, number>;

    // Application names and host names (for filtering)
    appNames: Record<string, number>;
    hostNames: Record<string, number>;

    // Stats
    stats: {
        size: number;
        maxEntries: number;
        lastEntryId: number;
    };

    // TCP client count (log sources connected to current room)
    tcpClientCount: number;

    // Performance monitoring - true when message queue is backlogged
    backlogged: boolean;

    // Views (user-defined filter presets)
    views: View[];
    activeViewId: string | null;

    // Current filter (can be from view or manual)
    filter: Filter;

    // Global highlighting rules (applied to all views)
    globalHighlightRules: HighlightRule[];

    // Stream data
    streams: Record<string, StreamEntry[]>;
    streamTotalReceived: Record<string, number>; // Total entries received per channel (for speedometer)
    streamMaxEntries: number;

    // Stream subscriptions - tracks which streams the user is subscribed to
    streamSubscriptions: Record<string, { subscribed: boolean; paused: boolean }>;
    autoPausedStreams: Set<string>; // Streams that were auto-paused due to high rate
    manualOverrides: Set<string>; // Streams user manually resumed (skip auto-pause)

    // Notifications for auto-pause alerts
    notifications: Array<{
        id: string;
        type: 'info' | 'warning' | 'error';
        message: string;
        channel?: string;
        timestamp: Date;
        dismissed: boolean;
    }>;

    // UI state
    paused: boolean;
    autoScroll: boolean;
    selectedEntryId: number | null;
    selectedStreamEntryId: number | null;
    showDetailPanel: boolean;
    showWatchPanel: boolean;
    showStreamPanel: boolean;
    highlightsPanelOpen: boolean; // True when highlights panel is open
    isStreamsMode: boolean; // True when Streams tab is active
    editingViewId: string | null; // ID of view being edited (triggers ViewEditor modal)
    theme: 'light' | 'dark'; // UI theme
    rowDensity: 'compact' | 'default' | 'comfortable'; // Row density for grids

    // Project tracking (shared state for dirty indicator)
    loadedProjectId: string | null; // Which server project is loaded (null = fresh)
    loadedProjectName: string | null; // Name of loaded project
    loadedProjectDirty: boolean; // Has working project diverged from loaded?

    // Percentage-based panel sizes (0-100)
    detailPanelHeightPercent: number;
    watchPanelWidthPercent: number;

    // Column widths for panels (percentages)
    watchPanelColumnWidths: [number, number, number, number];  // [name, group, value, updated]
    streamsViewColumnWidths: [number, number, number];  // [content (flex weight), type (px), time (px)]

    // Hidden columns for panels (column ids)
    watchPanelHiddenColumns: string[];  // e.g., ['group', 'updated']
    streamsViewHiddenColumns: string[];  // e.g., ['type'] - right panel (entries grid)
    streamsChannelHiddenColumns: string[];  // e.g., ['group', 'speed'] - left panel (channel list)

    // Actions
    setConnected: (connected: boolean) => void;
    setConnecting: (connecting: boolean) => void;
    setLoadingInitialData: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setReconnectIn: (seconds: number | null) => void;
    setServerUrl: (url: string | null) => void;
    setAuthRequired: (required: boolean) => void;
    setWsLatency: (latency: number | null) => void;
    setWsThroughput: (bytesPerSec: number) => void;

    // Room actions
    setCurrentRoom: (room: string) => void;
    setCurrentUser: (user: string) => void;
    setAvailableRooms: (rooms: string[]) => void;
    setRoomSwitching: (switching: boolean) => void;
    setNewRoomDetected: (detected: boolean) => void;
    setRoomLastActivity: (room: string, timestamp: string) => void;
    setRoomLastActivityBulk: (activities: Record<string, string>) => void;
    switchRoom: (room: string) => void; // Clears data and triggers reconnect
    addEntries: (entries: LogEntry[]) => void;
    addEntriesBatch: (entries: LogEntry[]) => void; // Optimized batch add
    setEntries: (entries: LogEntry[]) => void;
    clearEntries: () => void;
    updateWatch: (name: string, value: WatchValue) => void;
    updateWatchBatch: (watches: Record<string, WatchValue>) => void; // Optimized batch update
    setWatches: (watches: Record<string, WatchValue>) => void;
    clearWatches: () => void;
    setSessions: (sessions: Record<string, number>) => void;
    setStats: (stats: LogState['stats']) => void;
    setTcpClientCount: (count: number) => void;
    incrementTcpClientCount: () => void;
    decrementTcpClientCount: () => void;
    setBacklogged: (backlogged: boolean) => void;
    setLimits: (limits: Partial<ProjectLimits>) => void;
    setAppNames: (appNames: Record<string, number>) => void;
    setHostNames: (hostNames: Record<string, number>) => void;
    setFilter: (filter: Partial<Filter>) => void;
    setPaused: (paused: boolean) => void;
    setAutoScroll: (autoScroll: boolean) => void;
    setSelectedEntryId: (id: number | null) => void;
    setSelectedStreamEntryId: (id: number | null) => void;
    setStreamsMode: (isStreamsMode: boolean) => void;

    // View actions
    addView: (view: Omit<View, 'id'>, setAsActive?: boolean) => void;
    updateView: (id: string, updates: Partial<View>) => void;
    deleteView: (id: string) => void;
    setActiveView: (id: string | null) => void;
    setViews: (views: View[]) => void; // Replace all views (for server sync)

    // Highlight rule actions
    addHighlightRule: (rule: Omit<HighlightRule, 'id'>) => string;
    updateHighlightRule: (id: string, updates: Partial<HighlightRule>) => void;
    deleteHighlightRule: (id: string) => void;
    setGlobalHighlightRules: (rules: HighlightRule[]) => void; // Replace all rules (for server sync)

    // Stream actions
    addStreamEntry: (channel: string, entry: Omit<StreamEntry, 'id'>) => void;
    setStreamChannel: (channel: string, entries: StreamEntry[]) => void;
    clearStream: (channel: string) => void;
    clearAllStreams: () => void;

    // Stream subscription actions
    setStreamSubscription: (channel: string, state: { subscribed: boolean; paused: boolean }) => void;
    removeStreamSubscription: (channel: string) => void;
    setAllStreamSubscriptions: (subscriptions: Record<string, { subscribed: boolean; paused: boolean }>) => void;
    addAutoPausedStream: (channel: string) => void;
    removeAutoPausedStream: (channel: string) => void;
    addManualOverride: (channel: string) => void;
    removeManualOverride: (channel: string) => void;
    clearManualOverrides: () => void;

    // Notification actions
    addNotification: (notification: Omit<LogState['notifications'][0], 'id' | 'timestamp' | 'dismissed'>) => void;
    dismissNotification: (id: string) => void;
    clearNotifications: () => void;

    // Panel visibility
    setShowDetailPanel: (show: boolean) => void;
    setShowWatchPanel: (show: boolean) => void;
    setShowStreamPanel: (show: boolean) => void;
    setHighlightsPanelOpen: (open: boolean) => void;

    // View editing
    setEditingViewId: (id: string | null) => void;

    // Preview highlighting (for TitleFilterModal live preview)
    previewTitleFilter: { pattern: string; operator: 'contains' | 'starts-with' | 'regex'; caseSensitive: boolean } | null;
    setPreviewTitleFilter: (filter: { pattern: string; operator: 'contains' | 'starts-with' | 'regex'; caseSensitive: boolean } | null) => void;

    // Scroll stability: tracks how many entries were trimmed in last batch
    lastTrimCount: number;

    // Runtime view state (not persisted)
    viewStuckToBottom: Map<string, boolean>;
    setViewStuckToBottom: (viewId: string, stuckToBottom: boolean) => void;
    getViewStuckToBottom: (viewId: string) => boolean;

    // Per-view pause state (not persisted)
    viewPausedState: Record<string, boolean>;
    setViewPaused: (viewId: string, paused: boolean) => void;
    isViewPaused: (viewId: string) => boolean;

    // Theme
    setTheme: (theme: 'light' | 'dark') => void;
    toggleTheme: () => void;

    // Row density
    setRowDensity: (density: 'compact' | 'default' | 'comfortable') => void;

    // Layout size actions
    setDetailPanelHeightPercent: (percent: number) => void;
    setWatchPanelWidthPercent: (percent: number) => void;
    setWatchPanelColumnWidths: (widths: [number, number, number, number]) => void;
    setStreamsViewColumnWidths: (widths: [number, number, number]) => void;
    setWatchPanelHiddenColumns: (columns: string[]) => void;
    setStreamsViewHiddenColumns: (columns: string[]) => void;
    setStreamsChannelHiddenColumns: (columns: string[]) => void;

    // Project tracking actions
    setLoadedProjectId: (id: string | null) => void;
    setLoadedProjectName: (name: string | null) => void;
    setLoadedProjectDirty: (dirty: boolean) => void;

    // Get selected entry
    getSelectedEntry: () => LogEntry | null;
}

const defaultFilter: Filter = {
    sessions: [],
    levels: [],
    titlePattern: '',
    messagePattern: '',
    inverseMatch: false,
    from: null,
    to: null,
    appNames: [],
    hostNames: [],
    entryTypes: []
};

// Default views
const defaultViews: View[] = [
    {
        id: 'all',
        name: 'All Logs',
        icon: 'list',
        filter: { ...defaultFilter },
        highlightRules: [],
        useGlobalHighlights: true,
        autoScroll: true
    }
];

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// Default limits for projects
export const defaultLimits: ProjectLimits = {
    initialLoadLimit: 5000,    // Entries to fetch on connect
    maxBufferEntries: 50000,   // Total entries in client memory
    maxGridRows: 10000         // Max rows per grid view
};

export const useLogStore = create<LogState>((set, get) => ({
    // Initial state
    connected: false,
    connecting: false,
    loadingInitialData: false,
    error: null,
    reconnectIn: null,
    serverUrl: null,
    authRequired: false,
    wsLatency: null,
    wsThroughput: 0,

    // Room state (persisted to localStorage)
    currentRoom: localStorage.getItem('si-room') || 'default',
    currentUser: 'default',
    availableRooms: ['default'],
    roomSwitching: false,
    newRoomDetected: false,
    roomLastActivity: {},

    entries: [],
    limits: { ...defaultLimits },
    lastEntryId: 0,
    entriesVersion: 0,
    watches: {},
    sessions: {},
    appNames: {},
    hostNames: {},
    stats: { size: 0, maxEntries: 100000, lastEntryId: 0 },
    tcpClientCount: 0,
    backlogged: false,

    // Views
    views: defaultViews,
    activeViewId: 'all',

    filter: defaultFilter,
    globalHighlightRules: [],

    // Streams
    streams: {},
    streamTotalReceived: {},
    streamMaxEntries: 1000,

    // Stream subscriptions
    streamSubscriptions: {},
    autoPausedStreams: new Set<string>(),
    manualOverrides: new Set<string>(),
    notifications: [],

    // UI
    paused: false,
    autoScroll: true,
    selectedEntryId: null,
    selectedStreamEntryId: null,
    showDetailPanel: true,
    showWatchPanel: true,
    showStreamPanel: false,
    highlightsPanelOpen: false,
    isStreamsMode: false,
    editingViewId: null,
    previewTitleFilter: null,
    lastTrimCount: 0,
    theme: (localStorage.getItem('si-theme') as 'light' | 'dark') || 'light',
    rowDensity: (localStorage.getItem('si-row-density') as 'compact' | 'default' | 'comfortable') || 'compact',

    // Runtime view state (not persisted - tracks stuckToBottom per view)
    viewStuckToBottom: new Map<string, boolean>(),

    // Per-view pause state (not persisted)
    viewPausedState: {},

    // Percentage-based panel sizes (defaults: detail=25%, watch=20%)
    detailPanelHeightPercent: 25,
    watchPanelWidthPercent: 20,

    // Column widths for panels (percentages)
    watchPanelColumnWidths: [30, 15, 40, 15] as [number, number, number, number],  // [name, group, value, updated]
    streamsViewColumnWidths: [1, 100, 110] as [number, number, number],  // [content (flex), type (px), time (px)]

    // Hidden columns for panels (empty = all visible)
    watchPanelHiddenColumns: [] as string[],
    streamsViewHiddenColumns: [] as string[],
    streamsChannelHiddenColumns: [] as string[],

    // Project tracking (initialized by useProjectPersistence)
    loadedProjectId: null,
    loadedProjectName: null,
    loadedProjectDirty: false,

    // Actions
    setConnected: (connected) => set({ connected, reconnectIn: connected ? null : undefined, authRequired: connected ? false : undefined, wsLatency: connected ? undefined : null }),
    setConnecting: (connecting) => set({ connecting }),
    setLoadingInitialData: (loadingInitialData) => set({ loadingInitialData }),
    setError: (error) => set({ error }),
    setReconnectIn: (reconnectIn) => set({ reconnectIn }),
    setServerUrl: (serverUrl) => set({ serverUrl }),
    setAuthRequired: (authRequired) => set({ authRequired }),
    setWsLatency: (wsLatency) => set({ wsLatency }),
    setWsThroughput: (wsThroughput) => set({ wsThroughput }),

    // Room actions
    setCurrentRoom: (currentRoom) => set({ currentRoom }),
    setCurrentUser: (currentUser) => set({ currentUser }),
    setAvailableRooms: (availableRooms) => set({ availableRooms }),
    setRoomSwitching: (roomSwitching) => set({ roomSwitching }),
    setNewRoomDetected: (newRoomDetected) => set({ newRoomDetected }),
    setRoomLastActivity: (room, timestamp) => set((state) => ({
        roomLastActivity: { ...state.roomLastActivity, [room]: timestamp }
    })),
    setRoomLastActivityBulk: (activities) => set((state) => ({
        roomLastActivity: { ...state.roomLastActivity, ...activities }
    })),
    switchRoom: (room) => {
        // Persist room to localStorage
        localStorage.setItem('si-room', room);
        return set((state) => ({
            currentRoom: room,
            roomSwitching: true,
            // Clear data for new room
            entries: [],
            lastEntryId: 0,
            entriesVersion: state.entriesVersion + 1,
            watches: {},
            sessions: {},
            appNames: {},
            hostNames: {},
            streams: {},
            selectedEntryId: null,
            selectedStreamEntryId: null
        }));
    },

    // Legacy single-update method (kept for compatibility)
    addEntries: (newEntries) => set((state) => {
        if (newEntries.length === 0) return state;

        const maxLen = state.limits.maxBufferEntries;
        const combined = [...state.entries, ...newEntries];
        const trimmed = combined.length > maxLen
            ? combined.slice(-maxLen)
            : combined;

        return {
            entries: trimmed,
            lastEntryId: newEntries[newEntries.length - 1].id,
            entriesVersion: state.entriesVersion + 1
        };
    }),

    // OPTIMIZED: Batch add with efficient array handling and deduplication
    addEntriesBatch: (newEntries) => set((state) => {
        if (newEntries.length === 0) return state;

        // Deduplicate: filter out entries that already exist (by ID)
        const existingIds = new Set(state.entries.map(e => e.id));
        const uniqueNewEntries = newEntries.filter(e => !existingIds.has(e.id));

        if (uniqueNewEntries.length === 0) return state;

        const currentLen = state.entries.length;
        const newLen = uniqueNewEntries.length;
        const maxLen = state.limits.maxBufferEntries;
        const totalLen = currentLen + newLen;

        let result: LogEntry[];
        let trimCount = 0; // Track how many entries were removed from the top

        if (totalLen <= maxLen) {
            // Fast path: just concatenate
            result = state.entries.concat(uniqueNewEntries);
        } else if (newLen >= maxLen) {
            // New entries alone exceed max - just take the last maxLen from new
            result = uniqueNewEntries.slice(-maxLen);
            trimCount = currentLen; // All old entries were trimmed
        } else {
            // Need to trim: keep end of current + all new
            const keepFromCurrent = maxLen - newLen;
            result = state.entries.slice(-keepFromCurrent).concat(uniqueNewEntries);
            trimCount = currentLen - keepFromCurrent; // Number of old entries trimmed
        }

        // Extract unique sessions, appNames and hostNames from new entries
        const newSessions = { ...state.sessions };
        const newAppNames = { ...state.appNames };
        const newHostNames = { ...state.hostNames };
        let sessionsChanged = false;
        let appNamesChanged = false;
        let hostNamesChanged = false;

        for (const entry of uniqueNewEntries) {
            if (entry.sessionName && !(entry.sessionName in newSessions)) {
                newSessions[entry.sessionName] = 1;
                sessionsChanged = true;
            } else if (entry.sessionName) {
                newSessions[entry.sessionName]++;
            }
            if (entry.appName && !(entry.appName in newAppNames)) {
                newAppNames[entry.appName] = 1;
                appNamesChanged = true;
            } else if (entry.appName) {
                newAppNames[entry.appName]++;
            }
            if (entry.hostName && !(entry.hostName in newHostNames)) {
                newHostNames[entry.hostName] = 1;
                hostNamesChanged = true;
            } else if (entry.hostName) {
                newHostNames[entry.hostName]++;
            }
        }

        return {
            entries: result,
            lastEntryId: uniqueNewEntries[uniqueNewEntries.length - 1].id,
            entriesVersion: state.entriesVersion + 1,
            // Update lastTrimCount - increment by trimCount so VirtualLogGrid can detect changes
            lastTrimCount: state.lastTrimCount + trimCount,
            stats: {
                ...state.stats,
                size: result.length,
                lastEntryId: uniqueNewEntries[uniqueNewEntries.length - 1].id
            },
            ...(sessionsChanged ? { sessions: newSessions } : {}),
            ...(appNamesChanged ? { appNames: newAppNames } : {}),
            ...(hostNamesChanged ? { hostNames: newHostNames } : {})
        };
    }),

    setEntries: (entries) => set((state) => ({
        entries,
        lastEntryId: entries.length > 0 ? entries[entries.length - 1].id : 0,
        entriesVersion: state.entriesVersion + 1
    })),

    clearEntries: () => set((state) => ({
        entries: [],
        lastTrimCount: 0, // Reset on clear
        lastEntryId: 0,
        entriesVersion: state.entriesVersion + 1,
        // Also clear tracking dictionaries to prevent memory leaks
        sessions: {},
        appNames: {},
        hostNames: {}
    })),

    // Legacy single watch update
    updateWatch: (name, value) => set((state) => ({
        watches: { ...state.watches, [name]: value }
    })),

    // OPTIMIZED: Batch watch updates
    updateWatchBatch: (newWatches) => set((state) => ({
        watches: { ...state.watches, ...newWatches }
    })),

    setWatches: (watches) => set({ watches }),
    clearWatches: () => set({ watches: {} }),
    setSessions: (sessions) => set({ sessions }),
    setStats: (stats) => set({ stats }),
    setTcpClientCount: (count) => set({ tcpClientCount: count }),
    incrementTcpClientCount: () => set((s) => ({ tcpClientCount: s.tcpClientCount + 1 })),
    decrementTcpClientCount: () => set((s) => ({ tcpClientCount: Math.max(0, s.tcpClientCount - 1) })),
    setBacklogged: (backlogged) => set({ backlogged }),
    setLimits: (limitsUpdate) => set((state) => ({
        limits: { ...state.limits, ...limitsUpdate }
    })),
    setAppNames: (appNames) => set({ appNames }),
    setHostNames: (hostNames) => set({ hostNames }),

    setFilter: (filterUpdate) => set((state) => {
        const newFilter = { ...state.filter, ...filterUpdate };

        // Also update the active view's filter so it persists when switching tabs
        if (state.activeViewId) {
            const updatedViews = state.views.map(v =>
                v.id === state.activeViewId
                    ? { ...v, filter: { ...v.filter, ...filterUpdate } }
                    : v
            );
            return { filter: newFilter, views: updatedViews };
        }

        return { filter: newFilter };
    }),

    setPaused: (paused) => set({ paused }),
    setAutoScroll: (autoScroll) => set({ autoScroll }),
    setSelectedEntryId: (id) => set({ selectedEntryId: id }),
    setSelectedStreamEntryId: (id) => set({ selectedStreamEntryId: id }),
    setStreamsMode: (isStreamsMode) => set({ isStreamsMode }),

    // View actions
    addView: (view, setAsActive = false) => set((state) => {
        const newId = generateId();
        const newView = { ...view, id: newId };
        return {
            views: [...state.views, newView],
            ...(setAsActive ? { activeViewId: newId, filter: { ...newView.filter } } : {})
        };
    }),

    updateView: (id, updates) => set((state) => {
        const newViews = state.views.map(v => v.id === id ? { ...v, ...updates } : v);

        // If updating the active view and filter is included, sync to current filter state
        if (state.activeViewId === id && updates.filter) {
            const updatedView = newViews.find(v => v.id === id);
            return {
                views: newViews,
                filter: updatedView ? { ...updatedView.filter } : state.filter
            };
        }

        return { views: newViews };
    }),

    deleteView: (id) => set((state) => ({
        views: state.views.filter(v => v.id !== id),
        activeViewId: state.activeViewId === id ? 'all' : state.activeViewId
    })),

    setActiveView: (id) => set((state) => {
        const view = state.views.find(v => v.id === id);
        if (view) {
            return {
                activeViewId: id,
                filter: { ...view.filter },
                autoScroll: view.autoScroll
            };
        }
        return { activeViewId: id };
    }),

    setViews: (views) => set({ views }),

    // Highlight rule actions
    addHighlightRule: (rule) => {
        const newId = generateId();
        set((state) => ({
            globalHighlightRules: [...state.globalHighlightRules, { ...rule, id: newId }]
        }));
        return newId;
    },

    updateHighlightRule: (id, updates) => set((state) => ({
        globalHighlightRules: state.globalHighlightRules.map(r =>
            r.id === id ? { ...r, ...updates } : r
        )
    })),

    deleteHighlightRule: (id) => set((state) => ({
        globalHighlightRules: state.globalHighlightRules.filter(r => r.id !== id)
    })),

    setGlobalHighlightRules: (globalHighlightRules) => set({ globalHighlightRules }),

    // Stream actions
    // Max number of stream channels to prevent unbounded memory growth
    addStreamEntry: (channel, entry) => set((state) => {
        const MAX_STREAM_CHANNELS = 100;
        const channelCount = Object.keys(state.streams).length;

        // Check if this is a new channel and we're at the limit
        if (!(channel in state.streams) && channelCount >= MAX_STREAM_CHANNELS) {
            // Find and remove the oldest/smallest channel to make room
            const sortedChannels = Object.entries(state.streams)
                .sort(([, a], [, b]) => (a.length || 0) - (b.length || 0));
            if (sortedChannels.length > 0) {
                const [oldestChannel] = sortedChannels[0];
                const newStreams = { ...state.streams };
                delete newStreams[oldestChannel];
                const newTotals = { ...state.streamTotalReceived };
                delete newTotals[oldestChannel];
                // Continue with the new channel
                const newEntry: StreamEntry = { ...entry, id: getUniqueStreamEntryId(), channel };
                return {
                    streams: { ...newStreams, [channel]: [newEntry] },
                    streamTotalReceived: { ...newTotals, [channel]: 1 }
                };
            }
        }

        const channelEntries = state.streams[channel] || [];
        const newEntry: StreamEntry = { ...entry, id: getUniqueStreamEntryId(), channel };

        // Efficient trimming
        const maxLen = state.streamMaxEntries;
        let updated: StreamEntry[];
        if (channelEntries.length >= maxLen) {
            updated = channelEntries.slice(-(maxLen - 1)).concat(newEntry);
        } else {
            updated = channelEntries.concat(newEntry);
        }

        // Increment total received counter for speedometer
        const newTotal = (state.streamTotalReceived[channel] || 0) + 1;

        return {
            streams: { ...state.streams, [channel]: updated },
            streamTotalReceived: { ...state.streamTotalReceived, [channel]: newTotal }
        };
    }),

    // Bulk set entries for a channel (used for initial load from API)
    setStreamChannel: (channel, entries) => set((state) => ({
        streams: { ...state.streams, [channel]: entries },
        streamTotalReceived: { ...state.streamTotalReceived, [channel]: entries.length }
    })),

    clearStream: (channel) => set((state) => ({
        streams: { ...state.streams, [channel]: [] },
        streamTotalReceived: { ...state.streamTotalReceived, [channel]: 0 }
    })),

    clearAllStreams: () => set({ streams: {}, streamTotalReceived: {} }),

    // Stream subscription actions
    setStreamSubscription: (channel, state) => set((s) => ({
        streamSubscriptions: { ...s.streamSubscriptions, [channel]: state }
    })),

    removeStreamSubscription: (channel) => set((s) => {
        const newSubs = { ...s.streamSubscriptions };
        delete newSubs[channel];
        return { streamSubscriptions: newSubs };
    }),

    setAllStreamSubscriptions: (subscriptions) => set({ streamSubscriptions: subscriptions }),

    addAutoPausedStream: (channel) => set((s) => {
        const newSet = new Set(s.autoPausedStreams);
        newSet.add(channel);
        return { autoPausedStreams: newSet };
    }),

    removeAutoPausedStream: (channel) => set((s) => {
        const newSet = new Set(s.autoPausedStreams);
        newSet.delete(channel);
        return { autoPausedStreams: newSet };
    }),

    addManualOverride: (channel) => set((s) => {
        const newSet = new Set(s.manualOverrides);
        newSet.add(channel);
        return { manualOverrides: newSet };
    }),

    removeManualOverride: (channel) => set((s) => {
        const newSet = new Set(s.manualOverrides);
        newSet.delete(channel);
        return { manualOverrides: newSet };
    }),

    clearManualOverrides: () => set({ manualOverrides: new Set<string>() }),

    // Notification actions
    addNotification: (notification) => set((s) => ({
        notifications: [...s.notifications, {
            ...notification,
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date(),
            dismissed: false
        }]
    })),

    dismissNotification: (id) => set((s) => ({
        notifications: s.notifications.map(n =>
            n.id === id ? { ...n, dismissed: true } : n
        )
    })),

    clearNotifications: () => set({ notifications: [] }),

    // Panel visibility
    setShowDetailPanel: (show) => set({ showDetailPanel: show }),
    setShowWatchPanel: (show) => set({ showWatchPanel: show }),
    setShowStreamPanel: (show) => set({ showStreamPanel: show }),
    setHighlightsPanelOpen: (open) => set({ highlightsPanelOpen: open }),

    // View editing
    setEditingViewId: (id) => set({ editingViewId: id }),

    // Preview highlighting
    setPreviewTitleFilter: (filter) => set({ previewTitleFilter: filter }),

    // Runtime view state (stuckToBottom per view)
    setViewStuckToBottom: (viewId, stuckToBottom) => set((state) => {
        const newMap = new Map(state.viewStuckToBottom);
        newMap.set(viewId, stuckToBottom);
        return { viewStuckToBottom: newMap };
    }),
    getViewStuckToBottom: (viewId) => {
        const state = get();
        return state.viewStuckToBottom.get(viewId) ?? true; // Default to true (at bottom)
    },

    // Per-view pause state
    setViewPaused: (viewId, paused) => set((state) => ({
        viewPausedState: { ...state.viewPausedState, [viewId]: paused }
    })),
    isViewPaused: (viewId) => {
        const state = get();
        return state.viewPausedState[viewId] ?? false; // Default to not paused
    },

    // Theme
    setTheme: (theme) => {
        localStorage.setItem('si-theme', theme);
        set({ theme });
    },
    toggleTheme: () => set((state) => {
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('si-theme', newTheme);
        return { theme: newTheme };
    }),

    // Row density
    setRowDensity: (density) => {
        localStorage.setItem('si-row-density', density);
        set({ rowDensity: density });
    },

    // Layout size actions
    setDetailPanelHeightPercent: (percent) => set({
        detailPanelHeightPercent: Math.max(5, Math.min(90, percent)) // Clamp 5-90%
    }),
    setWatchPanelWidthPercent: (percent) => set({
        watchPanelWidthPercent: Math.max(10, Math.min(40, percent)) // Clamp 10-40%
    }),
    setWatchPanelColumnWidths: (widths) => set({
        watchPanelColumnWidths: widths
    }),
    setStreamsViewColumnWidths: (widths) => set({
        streamsViewColumnWidths: widths
    }),
    setWatchPanelHiddenColumns: (columns) => set({
        watchPanelHiddenColumns: columns
    }),
    setStreamsViewHiddenColumns: (columns) => set({
        streamsViewHiddenColumns: columns
    }),
    setStreamsChannelHiddenColumns: (columns) => set({
        streamsChannelHiddenColumns: columns
    }),

    // Project tracking actions
    setLoadedProjectId: (id) => set({ loadedProjectId: id }),
    setLoadedProjectName: (name) => set({ loadedProjectName: name }),
    setLoadedProjectDirty: (dirty) => set({ loadedProjectDirty: dirty }),

    // Get selected entry
    getSelectedEntry: () => {
        const state = get();
        if (state.selectedEntryId === null) return null;
        return state.entries.find(e => e.id === state.selectedEntryId) || null;
    }
}));

// Helper to get level name
export function getLevelName(level: number): string {
    switch (level) {
        case Level.Debug: return 'Debug';
        case Level.Verbose: return 'Verbose';
        case Level.Message: return 'Info';
        case Level.Warning: return 'Warning';
        case Level.Error: return 'Error';
        case Level.Fatal: return 'Fatal';
        default: return 'Unknown';
    }
}

// Helper to get level color
export function getLevelColor(level: number): string {
    switch (level) {
        case Level.Debug: return '#888888';
        case Level.Verbose: return '#666666';
        case Level.Message: return '#333333';
        case Level.Warning: return '#f59e0b';
        case Level.Error: return '#ef4444';
        case Level.Fatal: return '#dc2626';
        default: return '#333333';
    }
}

// Regex cache to avoid recompiling the same patterns
const regexCache = new Map<string, RegExp | null>();
const MAX_REGEX_CACHE_SIZE = 300;

function getCachedRegex(pattern: string, caseSensitive: boolean = false): RegExp | null {
    // Include case sensitivity in cache key
    const cacheKey = caseSensitive ? pattern : `i:${pattern}`;

    if (regexCache.has(cacheKey)) {
        return regexCache.get(cacheKey)!;
    }

    // Evict old entries if cache is full
    if (regexCache.size >= MAX_REGEX_CACHE_SIZE) {
        const firstKey = regexCache.keys().next().value;
        if (firstKey) regexCache.delete(firstKey);
    }

    try {
        const flags = caseSensitive ? '' : 'i';
        const regex = new RegExp(pattern, flags);
        regexCache.set(cacheKey, regex);
        return regex;
    } catch {
        regexCache.set(cacheKey, null); // Cache invalid patterns too
        return null;
    }
}

// Helper to match text with operator
function matchText(value: string | undefined, filter: TextFilter): boolean {
    if (!filter.value) return true; // Empty filter matches everything

    const text = String(value || '');
    let matches = false;

    switch (filter.operator) {
        case 'equals':
            matches = filter.caseSensitive
                ? text === filter.value
                : text.toLowerCase() === filter.value.toLowerCase();
            break;
        case 'contains':
            matches = filter.caseSensitive
                ? text.includes(filter.value)
                : text.toLowerCase().includes(filter.value.toLowerCase());
            break;
        case 'starts':
            matches = filter.caseSensitive
                ? text.startsWith(filter.value)
                : text.toLowerCase().startsWith(filter.value.toLowerCase());
            break;
        case 'ends':
            matches = filter.caseSensitive
                ? text.endsWith(filter.value)
                : text.toLowerCase().endsWith(filter.value.toLowerCase());
            break;
        case 'regex': {
            const regex = getCachedRegex(filter.value, filter.caseSensitive);
            matches = regex ? regex.test(text) : false;
            break;
        }
    }

    return filter.inverse ? !matches : matches;
}

// Helper to match ListTextFilter (dual mode: list or text)
function matchListTextFilter(value: string | undefined, filter: ListTextFilter): boolean {
    const text = String(value || '');

    if (filter.mode === 'list') {
        // List mode - check if value is in the selected list
        if (filter.values.length === 0) return true; // Empty list matches everything
        const inList = filter.values.includes(text);
        return filter.inverse ? !inList : inList;
    } else {
        // Text mode - use text matching with operator
        if (!filter.textValue) return true; // Empty text matches everything

        const caseSensitive = filter.caseSensitive || false;
        const compareText = caseSensitive ? text : text.toLowerCase();
        const compareValue = caseSensitive ? filter.textValue : filter.textValue.toLowerCase();

        let matches = false;
        switch (filter.textOperator) {
            case 'equals':
                matches = compareText === compareValue;
                break;
            case 'contains':
                matches = compareText.includes(compareValue);
                break;
            case 'starts':
                matches = compareText.startsWith(compareValue);
                break;
            case 'ends':
                matches = compareText.endsWith(compareValue);
                break;
            case 'regex': {
                const regex = getCachedRegex(filter.textValue, caseSensitive);
                matches = regex ? regex.test(text) : false;
                break;
            }
        }
        return filter.inverse ? !matches : matches;
    }
}

// Helper to check if a ListTextFilter has any actual filter criteria
function isListTextFilterEmpty(filter: ListTextFilter | undefined): boolean {
    if (!filter) return true;
    if (filter.mode === 'list') {
        return filter.values.length === 0;
    } else {
        return filter.textValue.trim() === '';
    }
}

// Helper to check if a TextFilter has any actual filter criteria
function isTextFilterEmpty(filter: TextFilter | undefined): boolean {
    if (!filter) return true;
    return filter.value.trim() === '';
}

// Helper to check if a highlight filter is completely empty (matches everything)
export function isHighlightFilterEmpty(filter: HighlightFilter): boolean {
    return isListTextFilterEmpty(filter.sessionFilter) &&
           isListTextFilterEmpty(filter.appNameFilter) &&
           isListTextFilterEmpty(filter.hostNameFilter) &&
           filter.levels.length === 0 &&
           filter.entryTypes.length === 0 &&
           filter.processId === null &&
           isTextFilterEmpty(filter.titleFilter);
}

// Helper to check if entry matches a highlight rule using new filter structure
export function matchesHighlightRule(entry: LogEntry, rule: HighlightRule): boolean {
    if (!rule.enabled) return false;

    // If filter is completely empty, don't match anything
    if (isHighlightFilterEmpty(rule.filter)) return false;

    const f = rule.filter;

    // Session filter (dual mode)
    if (!matchListTextFilter(entry.sessionName, f.sessionFilter)) return false;

    // App name filter (dual mode)
    if (!matchListTextFilter(entry.appName, f.appNameFilter)) return false;

    // Host name filter (dual mode)
    if (!matchListTextFilter(entry.hostName, f.hostNameFilter)) return false;

    // Levels filter
    if (f.levels.length > 0) {
        const inList = f.levels.includes(entry.level ?? -1);
        if (f.levelsInverse ? inList : !inList) return false;
    }

    // Entry types filter
    if (f.entryTypes.length > 0) {
        const inList = f.entryTypes.includes(entry.logEntryType ?? -1);
        if (f.entryTypesInverse ? inList : !inList) return false;
    }

    // Process ID filter
    if (f.processId !== null) {
        const matches = entry.processId === f.processId;
        if (f.processIdInverse ? matches : !matches) return false;
    }

    // Title filter
    if (!matchText(entry.title, f.titleFilter)) return false;

    return true;
}

// Helper to get style for entry based on highlight rules
export function getEntryStyle(entry: LogEntry, rules: HighlightRule[]): React.CSSProperties | undefined {
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
        if (matchesHighlightRule(entry, rule)) {
            return {
                backgroundColor: rule.style.backgroundColor,
                color: rule.style.textColor,
                fontWeight: rule.style.fontWeight,
                fontStyle: rule.style.fontStyle
            };
        }
    }

    return undefined;
}

// Preview title filter type
export type PreviewTitleFilter = { pattern: string; operator: 'contains' | 'starts-with' | 'regex'; caseSensitive: boolean };

// Helper to match preview title filter
export function matchesPreviewTitleFilter(entry: LogEntry, filter: PreviewTitleFilter): boolean {
    if (!filter.pattern) return false;

    const title = entry.title || '';
    const pattern = filter.caseSensitive ? filter.pattern : filter.pattern.toLowerCase();
    const text = filter.caseSensitive ? title : title.toLowerCase();

    switch (filter.operator) {
        case 'contains':
            return text.includes(pattern);
        case 'starts-with':
            return text.startsWith(pattern);
        case 'regex': {
            const regex = getCachedRegex(filter.pattern, filter.caseSensitive);
            return regex ? regex.test(title) : false;
        }
        default:
            return false;
    }
}
