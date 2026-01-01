/**
 * Trace Store - Zustand state management for distributed tracing
 * Handles trace data fetching, span selection, and waterfall view state
 */

import { create } from 'zustand';

// Span represents a single operation in a trace
export interface Span {
    spanId: string;
    parentSpanId?: string;
    name: string;
    kind?: string;  // Internal, Server, Client, Producer, Consumer
    startTime: string;
    endTime?: string;
    duration?: number;  // milliseconds
    status?: 'Ok' | 'Error' | 'Unset';
    statusDescription?: string;
    entryIds: number[];
    entryCount: number;
    tags?: Record<string, string>;
    hasError?: boolean;
}

// SpanNode includes children for tree rendering
export interface SpanNode extends Span {
    children: SpanNode[];
    depth: number;
}

// Trace summary for list view
export interface TraceSummary {
    traceId: string;
    rootSpanName?: string;
    startTime: string;
    endTime?: string;
    duration?: number;
    spanCount: number;
    hasError: boolean;
    serviceNames?: string[];
    isActive?: boolean;  // True if trace is still receiving spans
}

// Full trace data
export interface Trace extends TraceSummary {
    spans: Record<string, Span>;
    entryIds: number[];
}

// Trace tree for waterfall view
export interface TraceTree {
    traceId: string;
    rootSpanName?: string;
    duration?: number;
    spanCount: number;
    hasError: boolean;
    roots: SpanNode[];
}

// Trace statistics
export interface TraceStats {
    totalTracesProcessed: number;
    totalSpansProcessed: number;
    activeTraces: number;
    completedTraces: number;
    spanIndexSize: number;
}

// Filter options for trace list
export interface TraceFilter {
    status: 'all' | 'ok' | 'error';
    minDuration?: number;
    maxDuration?: number;
    search: string;
    sort: 'recent' | 'duration' | 'spans';
    // Advanced filters for Sprint 2
    services?: string[];
    operations?: string[];
    tags?: Record<string, string>;
}

// Available filter options (populated from actual data)
export interface TraceFilterOptions {
    services: string[];
    operations: string[];
    tagKeys: string[];
}

interface TraceState {
    // Data
    traces: TraceSummary[];
    totalTraces: number;
    selectedTraceId: string | null;
    selectedTrace: Trace | null;
    selectedSpanId: string | null;
    traceTree: TraceTree | null;
    stats: TraceStats | null;

    // Loading states
    loadingTraces: boolean;
    loadingTrace: boolean;
    loadingTree: boolean;

    // Filtering (no pagination - continuous virtualized list)
    filter: TraceFilter;
    filterOptions: TraceFilterOptions;

    // Error state
    error: string | null;

    // Auto-scroll state (like log grid)
    autoScroll: boolean;

    // Paused trace count (when auto-scroll is off)
    pausedNewCount: number;

    // Actions
    setTraces: (traces: TraceSummary[], total: number) => void;
    appendTraces: (traces: TraceSummary[]) => void;
    upsertTrace: (trace: TraceSummary) => void;
    setSelectedTraceId: (traceId: string | null) => void;
    setSelectedTrace: (trace: Trace | null) => void;
    setSelectedSpanId: (spanId: string | null) => void;
    setTraceTree: (tree: TraceTree | null) => void;
    setStats: (stats: TraceStats | null) => void;
    setLoadingTraces: (loading: boolean) => void;
    setLoadingTrace: (loading: boolean) => void;
    setLoadingTree: (loading: boolean) => void;
    setFilter: (filter: Partial<TraceFilter>) => void;
    updateFilterOptions: (traces: TraceSummary[]) => void;
    setError: (error: string | null) => void;
    setAutoScroll: (autoScroll: boolean) => void;
    incrementPausedCount: () => void;
    resetPausedCount: () => void;
    clearSelection: () => void;
    reset: () => void;
}

const defaultFilter: TraceFilter = {
    status: 'all',
    search: '',
    sort: 'recent',
    services: [],
    operations: [],
    tags: {}
};

const defaultFilterOptions: TraceFilterOptions = {
    services: [],
    operations: [],
    tagKeys: []
};

export const useTraceStore = create<TraceState>((set, get) => ({
    // Initial state
    traces: [],
    totalTraces: 0,
    selectedTraceId: null,
    selectedTrace: null,
    selectedSpanId: null,
    traceTree: null,
    stats: null,

    loadingTraces: false,
    loadingTrace: false,
    loadingTree: false,

    filter: { ...defaultFilter },
    filterOptions: { ...defaultFilterOptions },

    error: null,
    autoScroll: true,
    pausedNewCount: 0,

    // Actions
    setTraces: (traces, total) => {
        set({ traces, totalTraces: total });
        // Update filter options from loaded traces
        get().updateFilterOptions(traces);
    },

    appendTraces: (newTraces) => set((state) => {
        // Append new traces (for loading more history)
        const existingIds = new Set(state.traces.map(t => t.traceId));
        const uniqueNew = newTraces.filter(t => !existingIds.has(t.traceId));
        return {
            traces: [...state.traces, ...uniqueNew],
            totalTraces: state.totalTraces + uniqueNew.length
        };
    }),

    upsertTrace: (trace) => set((state) => {
        const existingIndex = state.traces.findIndex(t => t.traceId === trace.traceId);
        if (existingIndex >= 0) {
            // Update existing trace in place
            const newTraces = [...state.traces];
            newTraces[existingIndex] = trace;
            return { traces: newTraces };
        } else {
            // Add new trace at the END (oldest first, newest last - like a real-time feed going down)
            // If auto-scroll is off, increment paused count
            const pausedNewCount = state.autoScroll ? 0 : state.pausedNewCount + 1;
            return {
                traces: [...state.traces, trace],
                totalTraces: state.totalTraces + 1,
                pausedNewCount
            };
        }
    }),

    setSelectedTraceId: (traceId) => set({ selectedTraceId: traceId }),
    setSelectedTrace: (trace) => set({ selectedTrace: trace }),
    setSelectedSpanId: (spanId) => set({ selectedSpanId: spanId }),
    setTraceTree: (tree) => set({ traceTree: tree }),
    setStats: (stats) => set({ stats }),

    setLoadingTraces: (loading) => set({ loadingTraces: loading }),
    setLoadingTrace: (loading) => set({ loadingTrace: loading }),
    setLoadingTree: (loading) => set({ loadingTree: loading }),

    setFilter: (filterUpdate) => set((state) => ({
        filter: { ...state.filter, ...filterUpdate }
    })),

    updateFilterOptions: (traces) => set((state) => {
        // Extract unique services and operations from traces
        const services = new Set<string>(state.filterOptions.services);
        const operations = new Set<string>(state.filterOptions.operations);

        for (const trace of traces) {
            if (trace.serviceNames) {
                trace.serviceNames.forEach(s => services.add(s));
            }
            if (trace.rootSpanName) {
                // Extract operation name (before first space or full name)
                const op = trace.rootSpanName.split(' ')[0];
                operations.add(op);
            }
        }

        return {
            filterOptions: {
                services: Array.from(services).sort(),
                operations: Array.from(operations).sort(),
                tagKeys: state.filterOptions.tagKeys
            }
        };
    }),

    setError: (error) => set({ error }),
    setAutoScroll: (autoScroll) => set({ autoScroll, pausedNewCount: autoScroll ? 0 : get().pausedNewCount }),
    incrementPausedCount: () => set((state) => ({ pausedNewCount: state.pausedNewCount + 1 })),
    resetPausedCount: () => set({ pausedNewCount: 0 }),

    clearSelection: () => set({
        selectedTraceId: null,
        selectedTrace: null,
        selectedSpanId: null,
        traceTree: null
    }),

    reset: () => set({
        traces: [],
        totalTraces: 0,
        selectedTraceId: null,
        selectedTrace: null,
        selectedSpanId: null,
        traceTree: null,
        stats: null,
        loadingTraces: false,
        loadingTrace: false,
        loadingTree: false,
        filter: { ...defaultFilter },
        filterOptions: { ...defaultFilterOptions },
        error: null,
        autoScroll: true,
        pausedNewCount: 0
    })
}));

// API functions for fetching trace data
const getBaseUrl = () => {
    // Use the same base URL as the main app
    return '';  // Relative URLs, vite proxy handles it
};

const getRoomParam = () => {
    const room = localStorage.getItem('si-room') || 'default';
    return `room=${encodeURIComponent(room)}`;
};

export async function fetchTraces(
    filter: TraceFilter,
    limit: number = 1000  // Fetch up to 1000 traces for initial load
): Promise<{ traces: TraceSummary[]; total: number }> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', '0');
    params.set('status', filter.status);
    params.set('sort', filter.sort);
    if (filter.search) params.set('search', filter.search);
    if (filter.minDuration) params.set('minDuration', String(filter.minDuration));
    if (filter.maxDuration) params.set('maxDuration', String(filter.maxDuration));
    // Advanced filters
    if (filter.services?.length) params.set('services', filter.services.join(','));
    if (filter.operations?.length) params.set('operations', filter.operations.join(','));
    if (filter.tags && Object.keys(filter.tags).length > 0) {
        params.set('tags', JSON.stringify(filter.tags));
    }

    const room = localStorage.getItem('si-room') || 'default';
    params.set('room', room);

    const response = await fetch(`${getBaseUrl()}/api/traces?${params}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch traces: ${response.statusText}`);
    }

    const data = await response.json();
    return { traces: data.traces || [], total: data.total || 0 };
}

// Get last entry ID for content change detection (like log grid)
export function getLastTraceId(traces: TraceSummary[]): string | null {
    if (traces.length === 0) return null;
    return traces[traces.length - 1].traceId;
}

export async function fetchTrace(traceId: string): Promise<Trace> {
    const response = await fetch(`${getBaseUrl()}/api/traces/${traceId}?${getRoomParam()}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch trace: ${response.statusText}`);
    }

    const data = await response.json();
    return data.trace;
}

export async function fetchTraceTree(traceId: string): Promise<TraceTree> {
    const response = await fetch(`${getBaseUrl()}/api/traces/${traceId}/tree?${getRoomParam()}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch trace tree: ${response.statusText}`);
    }

    return await response.json();
}

export async function fetchTraceStats(): Promise<TraceStats> {
    const response = await fetch(`${getBaseUrl()}/api/traces/stats?${getRoomParam()}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch trace stats: ${response.statusText}`);
    }

    const data = await response.json();
    return data.stats;
}

export async function clearTraces(): Promise<void> {
    const response = await fetch(`${getBaseUrl()}/api/traces?${getRoomParam()}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        throw new Error(`Failed to clear traces: ${response.statusText}`);
    }
}

// Helper to format duration
export function formatDuration(ms: number | undefined): string {
    if (ms === undefined || ms === null) return '-';
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

// Helper to format timestamp
export function formatTraceTime(isoString: string): string {
    const date = new Date(isoString);
    const time = date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    // Add milliseconds manually since fractionalSecondDigits isn't supported in all TypeScript versions
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${time}.${ms}`;
}
