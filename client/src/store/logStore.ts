/**
 * Log Store - Zustand state management for log entries
 * OPTIMIZED: Ring buffer, batch updates, minimal object creation
 */

import { create } from 'zustand';
import { ColumnState } from 'ag-grid-community';

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
}

export interface WatchValue {
    value: string;
    timestamp: string;
    session?: string;
    watchType?: number;
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
    operator: 'contains' | 'equals' | 'regex';
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
    textOperator: 'contains' | 'equals' | 'regex';
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
export interface View {
    id: string;
    name: string;
    icon?: string;
    tabColor?: string; // Background color for tab header (CSS color value)
    filter: Filter;
    highlightRules: HighlightRule[];
    useGlobalHighlights: boolean; // Whether to also apply global highlight rules
    columnState?: ColumnState[];
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

    // Room isolation (multi-project support)
    currentRoom: string; // Active room ID
    currentUser: string; // User identifier for settings
    availableRooms: string[]; // List of known rooms from server
    roomSwitching: boolean; // True while switching rooms

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

    // Views (user-defined filter presets)
    views: View[];
    activeViewId: string | null;

    // Current filter (can be from view or manual)
    filter: Filter;

    // Global highlighting rules (applied to all views)
    globalHighlightRules: HighlightRule[];

    // Stream data
    streams: Record<string, StreamEntry[]>;
    streamMaxEntries: number;

    // UI state
    paused: boolean;
    autoScroll: boolean;
    selectedEntryId: number | null;
    selectedStreamEntryId: number | null;
    showDetailPanel: boolean;
    showWatchPanel: boolean;
    showStreamPanel: boolean;
    isStreamsMode: boolean; // True when Streams tab is active
    editingViewId: string | null; // ID of view being edited (triggers ViewEditor modal)
    theme: 'light' | 'dark'; // UI theme

    // Project tracking (shared state for dirty indicator)
    loadedProjectId: string | null; // Which server project is loaded (null = fresh)
    loadedProjectName: string | null; // Name of loaded project
    loadedProjectDirty: boolean; // Has working project diverged from loaded?

    // Percentage-based panel sizes (0-100)
    detailPanelHeightPercent: number;
    watchPanelWidthPercent: number;

    // Actions
    setConnected: (connected: boolean) => void;
    setConnecting: (connecting: boolean) => void;
    setLoadingInitialData: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setReconnectIn: (seconds: number | null) => void;
    setServerUrl: (url: string | null) => void;
    setAuthRequired: (required: boolean) => void;

    // Room actions
    setCurrentRoom: (room: string) => void;
    setCurrentUser: (user: string) => void;
    setAvailableRooms: (rooms: string[]) => void;
    setRoomSwitching: (switching: boolean) => void;
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
    addHighlightRule: (rule: Omit<HighlightRule, 'id'>) => void;
    updateHighlightRule: (id: string, updates: Partial<HighlightRule>) => void;
    deleteHighlightRule: (id: string) => void;
    setGlobalHighlightRules: (rules: HighlightRule[]) => void; // Replace all rules (for server sync)

    // Stream actions
    addStreamEntry: (channel: string, entry: Omit<StreamEntry, 'id'>) => void;
    clearStream: (channel: string) => void;
    clearAllStreams: () => void;

    // Panel visibility
    setShowDetailPanel: (show: boolean) => void;
    setShowWatchPanel: (show: boolean) => void;
    setShowStreamPanel: (show: boolean) => void;

    // View editing
    setEditingViewId: (id: string | null) => void;

    // Theme
    setTheme: (theme: 'light' | 'dark') => void;
    toggleTheme: () => void;

    // Layout size actions
    setDetailPanelHeightPercent: (percent: number) => void;
    setWatchPanelWidthPercent: (percent: number) => void;

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

    // Room state
    currentRoom: 'default',
    currentUser: 'default',
    availableRooms: ['default'],
    roomSwitching: false,

    entries: [],
    limits: { ...defaultLimits },
    lastEntryId: 0,
    entriesVersion: 0,
    watches: {},
    sessions: {},
    appNames: {},
    hostNames: {},
    stats: { size: 0, maxEntries: 100000, lastEntryId: 0 },

    // Views
    views: defaultViews,
    activeViewId: 'all',

    filter: defaultFilter,
    globalHighlightRules: [],

    // Streams
    streams: {},
    streamMaxEntries: 1000,

    // UI
    paused: false,
    autoScroll: true,
    selectedEntryId: null,
    selectedStreamEntryId: null,
    showDetailPanel: true,
    showWatchPanel: true,
    showStreamPanel: false,
    isStreamsMode: false,
    editingViewId: null,
    theme: (localStorage.getItem('si-theme') as 'light' | 'dark') || 'light',

    // Percentage-based panel sizes (defaults: detail=25%, watch=20%)
    detailPanelHeightPercent: 25,
    watchPanelWidthPercent: 20,

    // Project tracking (initialized by useProjectPersistence)
    loadedProjectId: null,
    loadedProjectName: null,
    loadedProjectDirty: false,

    // Actions
    setConnected: (connected) => set({ connected, reconnectIn: connected ? null : undefined, authRequired: connected ? false : undefined }),
    setConnecting: (connecting) => set({ connecting }),
    setLoadingInitialData: (loadingInitialData) => set({ loadingInitialData }),
    setError: (error) => set({ error }),
    setReconnectIn: (reconnectIn) => set({ reconnectIn }),
    setServerUrl: (serverUrl) => set({ serverUrl }),
    setAuthRequired: (authRequired) => set({ authRequired }),

    // Room actions
    setCurrentRoom: (currentRoom) => set({ currentRoom }),
    setCurrentUser: (currentUser) => set({ currentUser }),
    setAvailableRooms: (availableRooms) => set({ availableRooms }),
    setRoomSwitching: (roomSwitching) => set({ roomSwitching }),
    switchRoom: (room) => set((state) => ({
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
    })),

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

    // OPTIMIZED: Batch add with efficient array handling
    addEntriesBatch: (newEntries) => set((state) => {
        if (newEntries.length === 0) return state;

        const currentLen = state.entries.length;
        const newLen = newEntries.length;
        const maxLen = state.limits.maxBufferEntries;
        const totalLen = currentLen + newLen;

        let result: LogEntry[];

        if (totalLen <= maxLen) {
            // Fast path: just concatenate
            result = state.entries.concat(newEntries);
        } else if (newLen >= maxLen) {
            // New entries alone exceed max - just take the last maxLen from new
            result = newEntries.slice(-maxLen);
        } else {
            // Need to trim: keep end of current + all new
            const keepFromCurrent = maxLen - newLen;
            result = state.entries.slice(-keepFromCurrent).concat(newEntries);
        }

        // Extract unique appNames and hostNames from new entries
        const newAppNames = { ...state.appNames };
        const newHostNames = { ...state.hostNames };
        let appNamesChanged = false;
        let hostNamesChanged = false;

        for (const entry of newEntries) {
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
            lastEntryId: newEntries[newEntries.length - 1].id,
            entriesVersion: state.entriesVersion + 1,
            stats: {
                ...state.stats,
                size: result.length,
                lastEntryId: newEntries[newEntries.length - 1].id
            },
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
        lastEntryId: 0,
        entriesVersion: state.entriesVersion + 1
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
    addHighlightRule: (rule) => set((state) => ({
        globalHighlightRules: [...state.globalHighlightRules, { ...rule, id: generateId() }]
    })),

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
    addStreamEntry: (channel, entry) => set((state) => {
        const channelEntries = state.streams[channel] || [];
        const newEntry: StreamEntry = { ...entry, id: Date.now(), channel };

        // Efficient trimming
        const maxLen = state.streamMaxEntries;
        let updated: StreamEntry[];
        if (channelEntries.length >= maxLen) {
            updated = channelEntries.slice(-(maxLen - 1)).concat(newEntry);
        } else {
            updated = channelEntries.concat(newEntry);
        }

        return {
            streams: { ...state.streams, [channel]: updated }
        };
    }),

    clearStream: (channel) => set((state) => ({
        streams: { ...state.streams, [channel]: [] }
    })),

    clearAllStreams: () => set({ streams: {} }),

    // Panel visibility
    setShowDetailPanel: (show) => set({ showDetailPanel: show }),
    setShowWatchPanel: (show) => set({ showWatchPanel: show }),
    setShowStreamPanel: (show) => set({ showStreamPanel: show }),

    // View editing
    setEditingViewId: (id) => set({ editingViewId: id }),

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

    // Layout size actions
    setDetailPanelHeightPercent: (percent) => set({
        detailPanelHeightPercent: Math.max(5, Math.min(90, percent)) // Clamp 5-90%
    }),
    setWatchPanelWidthPercent: (percent) => set({
        watchPanelWidthPercent: Math.max(10, Math.min(40, percent)) // Clamp 10-40%
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

        let matches = false;
        switch (filter.textOperator) {
            case 'equals':
                matches = text.toLowerCase() === filter.textValue.toLowerCase();
                break;
            case 'contains':
                matches = text.toLowerCase().includes(filter.textValue.toLowerCase());
                break;
            case 'regex': {
                const regex = getCachedRegex(filter.textValue);
                matches = regex ? regex.test(text) : false;
                break;
            }
        }
        return filter.inverse ? !matches : matches;
    }
}

// Helper to check if entry matches a highlight rule using new filter structure
export function matchesHighlightRule(entry: LogEntry, rule: HighlightRule): boolean {
    if (!rule.enabled) return false;

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
