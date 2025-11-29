/**
 * WebSocket Hook - Connects to server and handles real-time updates
 * OPTIMIZED: Batches messages with requestAnimationFrame to reduce React re-renders
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLogStore, LogEntry, WatchValue } from '../store/logStore';

interface UseWebSocketOptions {
    token?: string;
    autoReconnect?: boolean;
    reconnectDelay?: number;
    batchInterval?: number; // ms between batch flushes
}

// Message batch for collecting updates between frames
interface MessageBatch {
    entries: LogEntry[];
    watches: Map<string, WatchValue>;
    controlCommands: string[];
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
    const {
        token,
        autoReconnect = true,
        reconnectDelay = 3000,
        batchInterval = 50 // Flush every 50ms for smooth updates
    } = options;

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);

    // Batching refs
    const batchRef = useRef<MessageBatch>({
        entries: [],
        watches: new Map(),
        controlCommands: []
    });
    const rafIdRef = useRef<number | null>(null);
    const lastFlushRef = useRef<number>(0);
    const flushScheduledRef = useRef<boolean>(false);

    const {
        setConnected,
        setConnecting,
        setError,
        addEntriesBatch,
        updateWatchBatch,
        setWatches,
        setSessions,
        setStats,
        clearEntries,
        clearWatches,
        paused
    } = useLogStore();

    // Flush batched updates
    const flushBatch = useCallback(() => {
        const batch = batchRef.current;
        flushScheduledRef.current = false;

        // Process entries
        if (batch.entries.length > 0) {
            addEntriesBatch(batch.entries);
            batch.entries = [];
        }

        // Process watches
        if (batch.watches.size > 0) {
            updateWatchBatch(Object.fromEntries(batch.watches));
            batch.watches.clear();
        }

        // Process control commands
        for (const cmd of batch.controlCommands) {
            switch (cmd) {
                case 'clearLog':
                    clearEntries();
                    break;
                case 'clearAll':
                    clearEntries();
                    clearWatches();
                    break;
                case 'clearWatches':
                    clearWatches();
                    break;
            }
        }
        batch.controlCommands = [];

        lastFlushRef.current = performance.now();
    }, [addEntriesBatch, updateWatchBatch, clearEntries, clearWatches]);

    // Schedule a flush using requestAnimationFrame with throttling
    const scheduleFlush = useCallback(() => {
        if (flushScheduledRef.current) return;

        const now = performance.now();
        const timeSinceLastFlush = now - lastFlushRef.current;

        if (timeSinceLastFlush >= batchInterval) {
            // Flush immediately on next frame
            flushScheduledRef.current = true;
            rafIdRef.current = requestAnimationFrame(flushBatch);
        } else {
            // Schedule flush after remaining interval
            flushScheduledRef.current = true;
            setTimeout(() => {
                rafIdRef.current = requestAnimationFrame(flushBatch);
            }, batchInterval - timeSinceLastFlush);
        }
    }, [batchInterval, flushBatch]);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        setConnecting(true);
        setError(null);

        // Build WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        let url = `${protocol}//${host}/ws`;
        if (token) {
            url += `?token=${encodeURIComponent(token)}`;
        }

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = async () => {
            console.log('[WS] Connected');
            setConnected(true);
            setConnecting(false);
            setError(null);

            // Fetch existing logs from REST API
            try {
                const response = await fetch('/api/logs?limit=5000');
                const data = await response.json();
                if (data.entries && data.entries.length > 0) {
                    console.log(`[WS] Loaded ${data.entries.length} existing entries`);
                    addEntriesBatch(data.entries);
                }
            } catch (err) {
                console.error('[WS] Failed to load existing logs:', err);
            }
        };

        ws.onclose = (event) => {
            console.log('[WS] Disconnected:', event.code, event.reason);
            setConnected(false);
            setConnecting(false);
            wsRef.current = null;

            // Auto-reconnect
            if (autoReconnect && event.code !== 4001) {  // 4001 = auth failed
                reconnectTimeoutRef.current = window.setTimeout(() => {
                    console.log('[WS] Reconnecting...');
                    connect();
                }, reconnectDelay);
            }
        };

        ws.onerror = (event) => {
            console.error('[WS] Error:', event);
            setError('WebSocket connection error');
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (err) {
                console.error('[WS] Failed to parse message:', err);
            }
        };
    }, [token, autoReconnect, reconnectDelay]);

    const disconnect = useCallback(() => {
        // Cancel any pending RAF
        if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
    }, []);

    const send = useCallback((message: object) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        }
    }, []);

    const handleMessage = useCallback((message: { type: string; data?: unknown }) => {
        const pausedNow = useLogStore.getState().paused;

        switch (message.type) {
            case 'init':
                // Initial state from server - apply immediately
                const initData = message.data as {
                    stats: { size: number; maxEntries: number; lastEntryId: number };
                    watches: Record<string, { value: string; timestamp: string }>;
                    sessions: Record<string, number>;
                };
                setStats(initData.stats);
                setWatches(initData.watches);
                setSessions(initData.sessions);
                break;

            case 'entries':
                // New log entries - batch them
                if (!pausedNow) {
                    const entries = message.data as LogEntry[];
                    batchRef.current.entries.push(...entries);
                    scheduleFlush();
                }
                break;

            case 'watch':
                // Watch value update - batch it
                const watch = message.data as {
                    name: string;
                    value: string;
                    timestamp: string;
                    watchType?: number;
                    session?: string;
                };
                batchRef.current.watches.set(watch.name, {
                    value: watch.value,
                    timestamp: watch.timestamp,
                    watchType: watch.watchType,
                    session: watch.session
                });
                scheduleFlush();
                break;

            case 'control':
                // Control command - queue it
                const control = message.data as { command: string };
                batchRef.current.controlCommands.push(control.command);
                scheduleFlush();
                break;

            case 'clientConnect':
            case 'clientDisconnect':
                // Log source connection events - could update UI
                break;

            case 'clear':
                const clearData = message.data as { target: string };
                if (clearData.target === 'logs') {
                    batchRef.current.controlCommands.push('clearLog');
                } else if (clearData.target === 'watches') {
                    batchRef.current.controlCommands.push('clearWatches');
                }
                scheduleFlush();
                break;
        }
    }, [setWatches, setSessions, setStats, scheduleFlush]);

    // Pause/resume streaming
    useEffect(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            send({ type: paused ? 'pause' : 'resume' });
        }
    }, [paused, send]);

    // Connect on mount
    useEffect(() => {
        connect();
        return () => disconnect();
    }, [connect, disconnect]);

    return {
        connect,
        disconnect,
        send,
        isConnected: wsRef.current?.readyState === WebSocket.OPEN
    };
}
