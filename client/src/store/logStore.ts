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
}

// Highlighting rule for custom styling
export interface HighlightRule {
    id: string;
    name: string;
    enabled: boolean;
    priority: number; // Higher = applied first
    conditions: {
        field: 'level' | 'sessionName' | 'appName' | 'title' | 'logEntryType';
        operator: 'equals' | 'contains' | 'regex' | 'in';
        value: string | number | string[] | number[];
    }[];
    style: {
        backgroundColor?: string;
        textColor?: string;
        fontWeight?: 'normal' | 'bold';
        fontStyle?: 'normal' | 'italic';
    };
}

// View = predefined filter set with highlighting rules
export interface View {
    id: string;
    name: string;
    icon?: string;
    filter: Filter;
    highlightRules: HighlightRule[];
    useGlobalHighlights: boolean; // Whether to also apply global highlight rules
    columnState?: ColumnState[];
    autoScroll: boolean;
}

// Stream entry for high-frequency data
export interface StreamEntry {
    id: number;
    channel: string;
    data: string;
    timestamp: string;
    sessionName?: string;
}

interface LogState {
    // Connection
    connected: boolean;
    connecting: boolean;
    error: string | null;

    // Log entries (limited buffer for performance)
    entries: LogEntry[];
    maxDisplayEntries: number;
    lastEntryId: number;
    entriesVersion: number; // Increment to trigger re-render only when needed

    // Watches
    watches: Record<string, WatchValue>;

    // Sessions (log sources)
    sessions: Record<string, number>;

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

    // Actions
    setConnected: (connected: boolean) => void;
    setConnecting: (connecting: boolean) => void;
    setError: (error: string | null) => void;
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
    setFilter: (filter: Partial<Filter>) => void;
    setPaused: (paused: boolean) => void;
    setAutoScroll: (autoScroll: boolean) => void;
    setSelectedEntryId: (id: number | null) => void;
    setSelectedStreamEntryId: (id: number | null) => void;
    setStreamsMode: (isStreamsMode: boolean) => void;

    // View actions
    addView: (view: Omit<View, 'id'>) => void;
    updateView: (id: string, updates: Partial<View>) => void;
    deleteView: (id: string) => void;
    setActiveView: (id: string | null) => void;

    // Highlight rule actions
    addHighlightRule: (rule: Omit<HighlightRule, 'id'>) => void;
    updateHighlightRule: (id: string, updates: Partial<HighlightRule>) => void;
    deleteHighlightRule: (id: string) => void;

    // Stream actions
    addStreamEntry: (channel: string, entry: Omit<StreamEntry, 'id'>) => void;
    clearStream: (channel: string) => void;
    clearAllStreams: () => void;

    // Panel visibility
    setShowDetailPanel: (show: boolean) => void;
    setShowWatchPanel: (show: boolean) => void;
    setShowStreamPanel: (show: boolean) => void;

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

// Pre-allocate array for ring buffer efficiency
const INITIAL_CAPACITY = 10000;

export const useLogStore = create<LogState>((set, get) => ({
    // Initial state
    connected: false,
    connecting: false,
    error: null,
    entries: [],
    maxDisplayEntries: INITIAL_CAPACITY,
    lastEntryId: 0,
    entriesVersion: 0,
    watches: {},
    sessions: {},
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

    // Actions
    setConnected: (connected) => set({ connected }),
    setConnecting: (connecting) => set({ connecting }),
    setError: (error) => set({ error }),

    // Legacy single-update method (kept for compatibility)
    addEntries: (newEntries) => set((state) => {
        if (newEntries.length === 0) return state;

        const combined = [...state.entries, ...newEntries];
        const trimmed = combined.length > state.maxDisplayEntries
            ? combined.slice(-state.maxDisplayEntries)
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
        const maxLen = state.maxDisplayEntries;
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

        return {
            entries: result,
            lastEntryId: newEntries[newEntries.length - 1].id,
            entriesVersion: state.entriesVersion + 1
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

    setFilter: (filter) => set((state) => ({
        filter: { ...state.filter, ...filter }
    })),

    setPaused: (paused) => set({ paused }),
    setAutoScroll: (autoScroll) => set({ autoScroll }),
    setSelectedEntryId: (id) => set({ selectedEntryId: id }),
    setSelectedStreamEntryId: (id) => set({ selectedStreamEntryId: id }),
    setStreamsMode: (isStreamsMode) => set({ isStreamsMode }),

    // View actions
    addView: (view) => set((state) => ({
        views: [...state.views, { ...view, id: generateId() }]
    })),

    updateView: (id, updates) => set((state) => ({
        views: state.views.map(v => v.id === id ? { ...v, ...updates } : v)
    })),

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

    // Stream actions
    addStreamEntry: (channel, entry) => set((state) => {
        const channelEntries = state.streams[channel] || [];
        const newEntry = { ...entry, id: Date.now() };

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

// Helper to check if entry matches a highlight rule
export function matchesHighlightRule(entry: LogEntry, rule: HighlightRule): boolean {
    if (!rule.enabled) return false;

    return rule.conditions.every(condition => {
        const fieldValue = entry[condition.field as keyof LogEntry];

        switch (condition.operator) {
            case 'equals':
                return fieldValue === condition.value;
            case 'contains':
                return String(fieldValue || '').toLowerCase().includes(String(condition.value).toLowerCase());
            case 'regex':
                try {
                    const regex = new RegExp(String(condition.value), 'i');
                    return regex.test(String(fieldValue || ''));
                } catch {
                    return false;
                }
            case 'in':
                return Array.isArray(condition.value) && condition.value.includes(fieldValue);
            default:
                return false;
        }
    });
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
