/**
 * useWatchHistory - Hook to fetch watch history data from the server
 * Supports different resolutions and time ranges
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLogStore } from '../../../store/logStore';

export interface HistoryPoint {
    timestamp: number;  // Unix timestamp in ms
    value: number;
    avg?: number;
    min?: number;
    max?: number;
    count?: number;
}

export interface WatchHistoryResult {
    data: HistoryPoint[];
    resolution: string;
    fromTier: string;
    range: { from: number; to: number };
    loading: boolean;
    error: string | null;
}

interface UseWatchHistoryOptions {
    watchName: string;
    from?: number;      // Start timestamp (ms)
    to?: number;        // End timestamp (ms)
    resolution?: 'raw' | '1s' | '1m' | '1h' | 'auto';
    refreshInterval?: number;  // ms, 0 to disable
    enabled?: boolean;
}

export function useWatchHistory({
    watchName,
    from,
    to,
    resolution = 'auto',
    refreshInterval = 0,
    enabled = true,
}: UseWatchHistoryOptions): WatchHistoryResult {
    const { currentRoom } = useLogStore();
    const [data, setData] = useState<HistoryPoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resultResolution, setResultResolution] = useState<string>('auto');
    const [fromTier, setFromTier] = useState<string>('');
    const [range, setRange] = useState({ from: 0, to: 0 });
    const abortControllerRef = useRef<AbortController | null>(null);

    const fetchHistory = useCallback(async () => {
        if (!watchName || !enabled) {
            setData([]);
            return;
        }

        // Abort previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (from) params.set('from', from.toString());
            if (to) params.set('to', to.toString());
            params.set('resolution', resolution);

            const url = `/api/watches/${encodeURIComponent(watchName)}/history?${params}`;
            const response = await fetch(url, {
                headers: {
                    'X-Room': currentRoom,
                },
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            // Transform data to consistent format
            const points: HistoryPoint[] = (result.data || []).map((point: any) => ({
                timestamp: point.timestamp || point.t,
                value: point.value ?? point.avg ?? point.v,
                avg: point.avg,
                min: point.min,
                max: point.max,
                count: point.count,
            }));

            setData(points);
            setResultResolution(result.resolution || resolution);
            setFromTier(result.fromTier || '');
            setRange({
                from: result.range?.from || from || 0,
                to: result.range?.to || to || Date.now(),
            });
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setError(err.message || 'Failed to fetch history');
                console.error('useWatchHistory error:', err);
            }
        } finally {
            setLoading(false);
        }
    }, [watchName, from, to, resolution, currentRoom, enabled]);

    // Initial fetch and refresh
    useEffect(() => {
        fetchHistory();

        // Set up refresh interval if specified
        if (refreshInterval > 0 && enabled) {
            const interval = setInterval(fetchHistory, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [fetchHistory, refreshInterval, enabled]);

    // Cleanup abort controller
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    return {
        data,
        resolution: resultResolution,
        fromTier,
        range,
        loading,
        error,
    };
}

/**
 * Hook to fetch multiple watch histories at once
 */
export function useMultiWatchHistory(
    watchNames: string[],
    options: Omit<UseWatchHistoryOptions, 'watchName'>
): Map<string, WatchHistoryResult> {
    const { currentRoom } = useLogStore();
    const [results, setResults] = useState<Map<string, WatchHistoryResult>>(new Map());

    const fetchAll = useCallback(async () => {
        if (!watchNames.length || !options.enabled) {
            setResults(new Map());
            return;
        }

        const newResults = new Map<string, WatchHistoryResult>();

        // Fetch all in parallel
        await Promise.all(
            watchNames.map(async (watchName) => {
                const params = new URLSearchParams();
                if (options.from) params.set('from', options.from.toString());
                if (options.to) params.set('to', options.to.toString());
                params.set('resolution', options.resolution || 'auto');

                try {
                    const url = `/api/watches/${encodeURIComponent(watchName)}/history?${params}`;
                    const response = await fetch(url, {
                        headers: { 'X-Room': currentRoom },
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const result = await response.json();
                    const points: HistoryPoint[] = (result.data || []).map((point: any) => ({
                        timestamp: point.timestamp || point.t,
                        value: point.value ?? point.avg ?? point.v,
                        avg: point.avg,
                        min: point.min,
                        max: point.max,
                        count: point.count,
                    }));

                    newResults.set(watchName, {
                        data: points,
                        resolution: result.resolution || options.resolution || 'auto',
                        fromTier: result.fromTier || '',
                        range: {
                            from: result.range?.from || options.from || 0,
                            to: result.range?.to || options.to || Date.now(),
                        },
                        loading: false,
                        error: null,
                    });
                } catch (err: any) {
                    newResults.set(watchName, {
                        data: [],
                        resolution: options.resolution || 'auto',
                        fromTier: '',
                        range: { from: options.from || 0, to: options.to || Date.now() },
                        loading: false,
                        error: err.message,
                    });
                }
            })
        );

        setResults(newResults);
    }, [watchNames.join(','), options.from, options.to, options.resolution, currentRoom, options.enabled]);

    useEffect(() => {
        fetchAll();

        if (options.refreshInterval && options.refreshInterval > 0 && options.enabled) {
            const interval = setInterval(fetchAll, options.refreshInterval);
            return () => clearInterval(interval);
        }
    }, [fetchAll, options.refreshInterval, options.enabled]);

    return results;
}

/**
 * Hook to fetch available label names for the current room
 */
export function useLabelNames(): { labels: string[]; loading: boolean; error: string | null } {
    const { currentRoom } = useLogStore();
    const [labels, setLabels] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLabels = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/watches/labels', {
                    headers: { 'X-Room': currentRoom },
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const result = await response.json();
                setLabels(result.labels || []);
                setError(null);
            } catch (err: any) {
                setError(err.message);
                setLabels([]);
            } finally {
                setLoading(false);
            }
        };

        fetchLabels();
        const interval = setInterval(fetchLabels, 10000); // Refresh every 10s
        return () => clearInterval(interval);
    }, [currentRoom]);

    return { labels, loading, error };
}

/**
 * Hook to fetch available values for a specific label
 */
export function useLabelValues(labelName: string): { values: string[]; loading: boolean; error: string | null } {
    const { currentRoom } = useLogStore();
    const [values, setValues] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!labelName) {
            setValues([]);
            setLoading(false);
            return;
        }

        const fetchValues = async () => {
            setLoading(true);
            try {
                const response = await fetch(`/api/watches/labels/${encodeURIComponent(labelName)}/values`, {
                    headers: { 'X-Room': currentRoom },
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const result = await response.json();
                setValues(result.values || []);
                setError(null);
            } catch (err: any) {
                setError(err.message);
                setValues([]);
            } finally {
                setLoading(false);
            }
        };

        fetchValues();
        const interval = setInterval(fetchValues, 10000); // Refresh every 10s
        return () => clearInterval(interval);
    }, [labelName, currentRoom]);

    return { values, loading, error };
}

/**
 * Hook to fetch available metric names
 */
export function useMetricNames(): { metrics: string[]; loading: boolean; error: string | null } {
    const { currentRoom } = useLogStore();
    const [metrics, setMetrics] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMetrics = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/watches/metrics', {
                    headers: { 'X-Room': currentRoom },
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const result = await response.json();
                setMetrics(result.metrics || []);
                setError(null);
            } catch (err: any) {
                setError(err.message);
                setMetrics([]);
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
        const interval = setInterval(fetchMetrics, 10000); // Refresh every 10s
        return () => clearInterval(interval);
    }, [currentRoom]);

    return { metrics, loading, error };
}
