/**
 * WebSocket Hook - Connects to server and handles real-time updates
 * OPTIMIZED: Batches messages with requestAnimationFrame to reduce React re-renders
 * STREAMS: Supports per-stream subscriptions with localStorage persistence
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLogStore, LogEntry, WatchValue } from '../store/logStore';
import { getWebSocket, isInitialized as isEarlyInitialized, reconnect as earlyReconnect } from '../services/earlyWebSocket';
import { getPerformanceSettings } from './useSettings';

// localStorage key for stream subscriptions
const STREAM_SUBSCRIPTIONS_KEY = 'si-stream-subscriptions';

interface StoredSubscriptions {
    version: 1;
    channels: Record<string, { subscribed: boolean; paused: boolean }>;
}

// Load subscriptions from localStorage
function loadSubscriptionsFromStorage(): Record<string, { subscribed: boolean; paused: boolean }> {
    try {
        const stored = localStorage.getItem(STREAM_SUBSCRIPTIONS_KEY);
        if (stored) {
            const data: StoredSubscriptions = JSON.parse(stored);
            if (data.version === 1 && data.channels) {
                return data.channels;
            }
        }
    } catch (err) {
        console.warn('[WS] Failed to load stream subscriptions from localStorage:', err);
    }
    return {};
}

// Save subscriptions to localStorage (debounced)
let saveTimeout: number | null = null;
function saveSubscriptionsToStorage(subscriptions: Record<string, { subscribed: boolean; paused: boolean }>) {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = window.setTimeout(() => {
        try {
            const data: StoredSubscriptions = {
                version: 1,
                channels: subscriptions
            };
            localStorage.setItem(STREAM_SUBSCRIPTIONS_KEY, JSON.stringify(data));
        } catch (err) {
            console.warn('[WS] Failed to save stream subscriptions to localStorage:', err);
        }
    }, 500); // Debounce 500ms
}

interface UseWebSocketOptions {
    token?: string;
    room?: string; // Room ID for room isolation
    user?: string; // User ID for settings
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

    // Get room/user from store if not provided in options
    const currentRoom = useLogStore(state => state.currentRoom);
    const currentUser = useLogStore(state => state.currentUser);
    const room = options.room ?? currentRoom;
    const user = options.user ?? currentUser;

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectCountdownRef = useRef<number | null>(null);
    const mountedRef = useRef(true);
    const connectedOnceRef = useRef(false);

    // Batching refs
    const batchRef = useRef<MessageBatch>({
        entries: [],
        watches: new Map(),
        controlCommands: []
    });
    const rafIdRef = useRef<number | null>(null);
    const lastFlushRef = useRef<number>(0);
    const flushScheduledRef = useRef<boolean>(false);
    const lastLoadedEntryIdRef = useRef<number>(0);
    const fetchAbortControllerRef = useRef<AbortController | null>(null);
    const lastWatchFlushRef = useRef<number>(0);

    // Throughput tracking refs
    const bytesReceivedRef = useRef<number>(0);
    const throughputIntervalRef = useRef<number | null>(null);
    const pingIntervalRef = useRef<number | null>(null);

    // Store refs for callbacks to avoid dependency issues
    const storeRef = useRef(useLogStore.getState());

    // Update store ref on each render
    storeRef.current = useLogStore.getState();

    // Flush batched updates - use refs to avoid dependencies
    const flushBatch = useCallback(() => {
        const batch = batchRef.current;
        const store = storeRef.current;
        flushScheduledRef.current = false;

        // Process entries
        if (batch.entries.length > 0) {
            store.addEntriesBatch(batch.entries);
            batch.entries = [];
        }

        // Process watches with optional throttling
        if (batch.watches.size > 0) {
            const perfSettings = getPerformanceSettings();
            const now = performance.now();

            if (perfSettings.watchThrottleMode === 'throttled') {
                const minInterval = 1000 / perfSettings.watchMaxUpdatesPerSecond;
                if (now - lastWatchFlushRef.current >= minInterval) {
                    // Enough time has passed, flush watches
                    store.updateWatchBatch(Object.fromEntries(batch.watches));
                    batch.watches.clear();
                    lastWatchFlushRef.current = now;
                }
                // If not enough time has passed, keep the latest values in batch for next flush
            } else {
                // Realtime mode - flush immediately
                store.updateWatchBatch(Object.fromEntries(batch.watches));
                batch.watches.clear();
                lastWatchFlushRef.current = now;
            }
        }

        // Process control commands
        for (const cmd of batch.controlCommands) {
            switch (cmd) {
                case 'clearLog':
                    store.clearEntries();
                    break;
                case 'clearAll':
                    store.clearEntries();
                    store.clearWatches();
                    break;
                case 'clearWatches':
                    store.clearWatches();
                    break;
            }
        }
        batch.controlCommands = [];

        lastFlushRef.current = performance.now();
    }, []);

    // Schedule a flush using requestAnimationFrame with throttling
    const scheduleFlush = useCallback(() => {
        if (flushScheduledRef.current) return;

        const now = performance.now();
        const timeSinceLastFlush = now - lastFlushRef.current;

        if (timeSinceLastFlush >= batchInterval) {
            flushScheduledRef.current = true;
            rafIdRef.current = requestAnimationFrame(flushBatch);
        } else {
            flushScheduledRef.current = true;
            setTimeout(() => {
                rafIdRef.current = requestAnimationFrame(flushBatch);
            }, batchInterval - timeSinceLastFlush);
        }
    }, [batchInterval, flushBatch]);

    // Handle incoming messages - stable callback
    const handleMessage = useCallback((message: { type: string; data?: unknown }) => {
        const store = storeRef.current;
        const pausedNow = store.paused;

        switch (message.type) {
            case 'init': {
                const initData = message.data as {
                    stats: { size: number; maxEntries: number; lastEntryId: number };
                    watches: Record<string, { value: string; timestamp: string }>;
                    sessions: Record<string, number>;
                    tcpClientCount?: number;
                };
                store.setStats(initData.stats);
                store.setWatches(initData.watches);
                store.setSessions(initData.sessions);
                if (initData.tcpClientCount !== undefined) {
                    console.log('[WS] Init: setting tcpClientCount to', initData.tcpClientCount);
                    store.setTcpClientCount(initData.tcpClientCount);
                } else {
                    console.log('[WS] Init: tcpClientCount not in message');
                }
                break;
            }

            case 'entries': {
                if (!pausedNow) {
                    const entries = message.data as LogEntry[];
                    const newEntries = entries.filter(e => e.id > lastLoadedEntryIdRef.current);
                    if (newEntries.length > 0) {
                        batchRef.current.entries.push(...newEntries);
                        const maxId = Math.max(...newEntries.map(e => e.id));
                        if (maxId > lastLoadedEntryIdRef.current) {
                            lastLoadedEntryIdRef.current = maxId;
                        }
                        scheduleFlush();
                    }
                }
                break;
            }

            case 'watch': {
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
            }

            case 'control': {
                const control = message.data as { command: string };
                batchRef.current.controlCommands.push(control.command);
                scheduleFlush();
                break;
            }

            case 'clientConnect':
                console.log('[WS] TCP client connected, incrementing count');
                store.incrementTcpClientCount();
                break;

            case 'clientDisconnect':
                console.log('[WS] TCP client disconnected, decrementing count');
                store.decrementTcpClientCount();
                break;

            case 'rooms': {
                // Server sending list of available rooms (with optional lastActivity)
                const roomsData = message.data as { rooms: string[]; lastActivity?: Record<string, string> };
                store.setAvailableRooms(roomsData.rooms);
                // Update last activity timestamps if provided
                if (roomsData.lastActivity) {
                    store.setRoomLastActivityBulk(roomsData.lastActivity);
                }
                break;
            }

            case 'roomCreated': {
                // New room was created - trigger notification animation
                const roomCreatedData = message.data as { roomId: string; rooms: string[]; lastActivity?: Record<string, string> };
                console.log('[WS] New room created:', roomCreatedData.roomId);
                store.setAvailableRooms(roomCreatedData.rooms);
                store.setNewRoomDetected(true);
                if (roomCreatedData.lastActivity) {
                    store.setRoomLastActivityBulk(roomCreatedData.lastActivity);
                }
                break;
            }

            case 'roomSwitched': {
                // Confirmation that room switch completed
                store.setRoomSwitching(false);
                break;
            }

            case 'pong': {
                // Server responding to our ping - calculate latency
                const pongData = message as unknown as { timestamp: number };
                if (pongData.timestamp) {
                    const latency = Math.round(performance.now() - pongData.timestamp);
                    store.setWsLatency(latency);
                }
                break;
            }

            case 'clear': {
                const clearData = message.data as { target: string };
                if (clearData.target === 'logs') {
                    batchRef.current.controlCommands.push('clearLog');
                } else if (clearData.target === 'watches') {
                    batchRef.current.controlCommands.push('clearWatches');
                }
                scheduleFlush();
                break;
            }

            // Stream subscription confirmations from server
            case 'streamSubscribed': {
                const data = message as unknown as { channel: string };
                console.log(`[WS] Stream subscribed: ${data.channel}`);
                store.setStreamSubscription(data.channel, { subscribed: true, paused: false });
                saveSubscriptionsToStorage(useLogStore.getState().streamSubscriptions);
                break;
            }

            case 'streamUnsubscribed': {
                const data = message as unknown as { channel: string };
                console.log(`[WS] Stream unsubscribed: ${data.channel}`);
                store.removeStreamSubscription(data.channel);
                saveSubscriptionsToStorage(useLogStore.getState().streamSubscriptions);
                break;
            }

            case 'streamPaused': {
                const data = message as unknown as { channel: string };
                console.log(`[WS] Stream paused: ${data.channel}`);
                const currentSub = store.streamSubscriptions[data.channel];
                if (currentSub) {
                    store.setStreamSubscription(data.channel, { ...currentSub, paused: true });
                    saveSubscriptionsToStorage(useLogStore.getState().streamSubscriptions);
                }
                break;
            }

            case 'streamResumed': {
                const data = message as unknown as { channel: string };
                console.log(`[WS] Stream resumed: ${data.channel}`);
                const currentSub = store.streamSubscriptions[data.channel];
                if (currentSub) {
                    store.setStreamSubscription(data.channel, { ...currentSub, paused: false });
                    saveSubscriptionsToStorage(useLogStore.getState().streamSubscriptions);
                }
                break;
            }

            case 'streamSubscriptions': {
                // Server response with current subscriptions
                const data = message as unknown as { subscriptions: Array<{ channel: string; paused: boolean }> };
                console.log(`[WS] Got stream subscriptions from server:`, data.subscriptions);
                break;
            }
        }
    }, [scheduleFlush]);

    const clearReconnectTimers = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (reconnectCountdownRef.current) {
            clearInterval(reconnectCountdownRef.current);
            reconnectCountdownRef.current = null;
        }
        storeRef.current.setReconnectIn(null);
    }, []);

    const disconnect = useCallback(() => {
        if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }

        clearReconnectTimers();

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        storeRef.current.setConnected(false);
        storeRef.current.setConnecting(false);
    }, [clearReconnectTimers]);

    const connect = useCallback(() => {
        // Don't connect if already connected or connecting
        if (wsRef.current?.readyState === WebSocket.OPEN ||
            wsRef.current?.readyState === WebSocket.CONNECTING) {
            return;
        }

        clearReconnectTimers();

        const store = storeRef.current;
        store.setConnecting(true);
        store.setError(null);

        // Get current room/user from store to avoid stale closure
        const currentRoomValue = options.room ?? useLogStore.getState().currentRoom;
        const currentUserValue = options.user ?? useLogStore.getState().currentUser;

        // Build WebSocket URL with room and user
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const params = new URLSearchParams();
        if (token) params.set('token', token);
        params.set('room', currentRoomValue);
        params.set('user', currentUserValue);
        const queryString = params.toString();
        const url = `${protocol}//${host}/ws${queryString ? '?' + queryString : ''}`;

        // Store the server URL (just host:port for display)
        store.setServerUrl(host);

        console.log('[WS] Connecting to:', url);
        const ws = new WebSocket(url);
        wsRef.current = ws;
        // Expose WebSocket for ClientsModal live updates
        (window as unknown as { __siWebSocket?: WebSocket }).__siWebSocket = ws;

        ws.onopen = async () => {
            console.log('[WS] Connected to room:', currentRoomValue);
            if (!mountedRef.current) return;

            const store = storeRef.current;
            store.setConnected(true);
            store.setConnecting(false);
            store.setError(null);
            store.setLoadingInitialData(true);

            // Cancel any previous fetch
            if (fetchAbortControllerRef.current) {
                fetchAbortControllerRef.current.abort();
            }
            fetchAbortControllerRef.current = new AbortController();

            // Fetch existing logs from REST API for this room
            try {
                const initialLoadLimit = useLogStore.getState().limits.initialLoadLimit;
                const response = await fetch(
                    `/api/logs?limit=${initialLoadLimit}&room=${encodeURIComponent(currentRoomValue)}`,
                    { signal: fetchAbortControllerRef.current.signal }
                );
                const data = await response.json();

                // Verify we're still on the same room (race condition check)
                const currentStoreRoom = useLogStore.getState().currentRoom;
                if (currentStoreRoom !== currentRoomValue) {
                    console.log(`[WS] Room changed during fetch (${currentRoomValue} -> ${currentStoreRoom}), ignoring results`);
                    return;
                }

                if (data.entries && data.entries.length > 0) {
                    console.log(`[WS] Loaded ${data.entries.length} existing entries for room ${currentRoomValue}`);
                    store.addEntriesBatch(data.entries);
                    const maxId = Math.max(...data.entries.map((e: LogEntry) => e.id));
                    lastLoadedEntryIdRef.current = maxId;
                } else {
                    console.log(`[WS] No existing entries for room ${currentRoomValue}`);
                }

                // Also load existing streams for this room
                try {
                    const streamsResponse = await fetch(
                        `/api/streams?room=${encodeURIComponent(currentRoomValue)}`,
                        { signal: fetchAbortControllerRef.current?.signal }
                    );
                    const streamsData = await streamsResponse.json();
                    if (streamsData.channels && streamsData.channels.length > 0) {
                        console.log(`[WS] Found ${streamsData.channels.length} stream channels for room ${currentRoomValue}`);
                        for (const { channel } of streamsData.channels) {
                            try {
                                const channelResponse = await fetch(
                                    `/api/streams/query?channel=${encodeURIComponent(channel)}&limit=100&room=${encodeURIComponent(currentRoomValue)}`,
                                    { signal: fetchAbortControllerRef.current?.signal }
                                );
                                const channelData = await channelResponse.json();
                                if (channelData.entries && channelData.entries.length > 0) {
                                    console.log(`[WS] Loaded ${channelData.entries.length} entries for stream: ${channel}`);
                                    store.setStreamChannel(channel, channelData.entries);
                                }
                            } catch (err) {
                                if (err instanceof Error && err.name === 'AbortError') return;
                                console.error(`[WS] Failed to load stream channel ${channel}:`, err);
                            }
                        }
                    }
                } catch (err) {
                    if (err instanceof Error && err.name === 'AbortError') return;
                    console.error('[WS] Failed to load existing streams:', err);
                }
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    console.log('[WS] Fetch aborted (room switch)');
                    return;
                }
                console.error('[WS] Failed to load existing logs:', err);
            } finally {
                store.setLoadingInitialData(false);
                // Clear room switching state - we're now connected to the new room
                store.setRoomSwitching(false);
            }

            // Restore stream subscriptions from localStorage after connection is fully established
            // Small delay to ensure server is ready for subscription messages
            setTimeout(() => {
                const stored = loadSubscriptionsFromStorage();
                const channels = Object.keys(stored);
                if (channels.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                    console.log(`[WS] Restoring ${channels.length} stream subscriptions from localStorage`);
                    for (const channel of channels) {
                        const sub = stored[channel];
                        if (sub.subscribed) {
                            wsRef.current.send(JSON.stringify({ type: 'subscribeStream', channel }));
                            if (sub.paused) {
                                // Slight delay for pause to ensure subscribe completes first
                                setTimeout(() => {
                                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                                        wsRef.current.send(JSON.stringify({ type: 'pauseStream', channel }));
                                    }
                                }, 50);
                            }
                        }
                    }
                    // Restore state in store
                    useLogStore.getState().setAllStreamSubscriptions(stored);
                }
            }, 200);

            // Start throughput calculation interval (every 1 second)
            throughputIntervalRef.current = window.setInterval(() => {
                storeRef.current.setWsThroughput(bytesReceivedRef.current);
                bytesReceivedRef.current = 0;
            }, 1000);

            // Start ping interval for latency measurement (every 2 seconds)
            pingIntervalRef.current = window.setInterval(() => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'ping', timestamp: performance.now() }));
                }
            }, 2000);

            // Send initial ping immediately
            ws.send(JSON.stringify({ type: 'ping', timestamp: performance.now() }));
        };

        ws.onclose = (event) => {
            console.log('[WS] Disconnected:', event.code, event.reason);
            if (!mountedRef.current) return;

            // Clean up throughput and ping intervals
            if (throughputIntervalRef.current) {
                clearInterval(throughputIntervalRef.current);
                throughputIntervalRef.current = null;
            }
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = null;
            }
            bytesReceivedRef.current = 0;

            const store = storeRef.current;
            store.setConnected(false);
            store.setConnecting(false);
            store.setWsThroughput(0);
            wsRef.current = null;

            // Check for auth failure (close code 4001)
            if (event.code === 4001) {
                store.setAuthRequired(true);
                store.setError('Authentication required');
            }

            // Auto-reconnect with countdown
            if (autoReconnect && event.code !== 4001) {
                const reconnectSeconds = Math.ceil(reconnectDelay / 1000);
                let countdown = reconnectSeconds;
                store.setReconnectIn(countdown);

                // Update countdown every second
                reconnectCountdownRef.current = window.setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        storeRef.current.setReconnectIn(countdown);
                    } else {
                        if (reconnectCountdownRef.current) {
                            clearInterval(reconnectCountdownRef.current);
                            reconnectCountdownRef.current = null;
                        }
                    }
                }, 1000);

                // Actually reconnect after delay
                reconnectTimeoutRef.current = window.setTimeout(() => {
                    if (mountedRef.current) {
                        console.log('[WS] Reconnecting...');
                        connect();
                    }
                }, reconnectDelay);
            }
        };

        ws.onerror = (event) => {
            console.error('[WS] Error:', event);
            if (mountedRef.current) {
                storeRef.current.setError('WebSocket connection error');
            }
        };

        ws.onmessage = (event) => {
            try {
                // Track bytes received for throughput calculation
                const dataSize = typeof event.data === 'string' ? event.data.length : event.data.size;
                bytesReceivedRef.current += dataSize;

                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (err) {
                console.error('[WS] Failed to parse message:', err);
            }
        };
    }, [token, room, user, autoReconnect, reconnectDelay, handleMessage, clearReconnectTimers]);

    const send = useCallback((message: object) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        }
    }, []);

    // Stream subscription methods
    const subscribeToStream = useCallback((channel: string) => {
        send({ type: 'subscribeStream', channel });
        // Optimistic update - server will confirm
        const store = storeRef.current;
        store.setStreamSubscription(channel, { subscribed: true, paused: false });
        saveSubscriptionsToStorage(useLogStore.getState().streamSubscriptions);
    }, [send]);

    const unsubscribeFromStream = useCallback((channel: string) => {
        send({ type: 'unsubscribeStream', channel });
        // Optimistic update
        const store = storeRef.current;
        store.removeStreamSubscription(channel);
        // Also remove from auto-paused and manual overrides
        store.removeAutoPausedStream(channel);
        store.removeManualOverride(channel);
        saveSubscriptionsToStorage(useLogStore.getState().streamSubscriptions);
    }, [send]);

    const pauseStream = useCallback((channel: string) => {
        send({ type: 'pauseStream', channel });
        // Optimistic update - create subscription if it doesn't exist
        const store = storeRef.current;
        const currentSub = store.streamSubscriptions[channel];
        store.setStreamSubscription(channel, {
            subscribed: currentSub?.subscribed ?? true,
            paused: true
        });
        saveSubscriptionsToStorage(useLogStore.getState().streamSubscriptions);
    }, [send]);

    const resumeStream = useCallback((channel: string) => {
        send({ type: 'resumeStream', channel });
        // Optimistic update - create subscription if it doesn't exist
        const store = storeRef.current;
        const currentSub = store.streamSubscriptions[channel];
        store.setStreamSubscription(channel, {
            subscribed: currentSub?.subscribed ?? true,
            paused: false
        });
        saveSubscriptionsToStorage(useLogStore.getState().streamSubscriptions);
        // Remove from auto-paused if manually resumed
        store.removeAutoPausedStream(channel);
        store.addManualOverride(channel);
    }, [send]);

    const pauseAllStreams = useCallback(() => {
        const store = storeRef.current;
        const subscriptions = store.streamSubscriptions;
        for (const channel of Object.keys(subscriptions)) {
            if (subscriptions[channel].subscribed && !subscriptions[channel].paused) {
                pauseStream(channel);
            }
        }
    }, [pauseStream]);

    const resumeAllStreams = useCallback(() => {
        const store = storeRef.current;
        const subscriptions = store.streamSubscriptions;
        for (const channel of Object.keys(subscriptions)) {
            if (subscriptions[channel].subscribed && subscriptions[channel].paused) {
                resumeStream(channel);
            }
        }
    }, [resumeStream]);

    // Restore subscriptions from localStorage and send to server
    const restoreSubscriptions = useCallback(() => {
        const stored = loadSubscriptionsFromStorage();
        const channels = Object.keys(stored);
        if (channels.length === 0) return;

        console.log(`[WS] Restoring ${channels.length} stream subscriptions from localStorage`);

        for (const channel of channels) {
            const sub = stored[channel];
            if (sub.subscribed) {
                // Send subscribe message to server
                send({ type: 'subscribeStream', channel });
                // If it was paused, pause it again
                if (sub.paused) {
                    setTimeout(() => {
                        send({ type: 'pauseStream', channel });
                    }, 100);
                }
            }
        }

        // Restore state in store
        const store = storeRef.current;
        store.setAllStreamSubscriptions(stored);
    }, [send]);

    // Subscribe to paused state changes
    useEffect(() => {
        let prevPaused = useLogStore.getState().paused;
        const unsubscribe = useLogStore.subscribe((state) => {
            if (state.paused !== prevPaused) {
                prevPaused = state.paused;
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    send({ type: state.paused ? 'pause' : 'resume' });
                }
            }
        });
        return unsubscribe;
    }, [send]);

    // Subscribe to room switching - reconnect when room changes
    useEffect(() => {
        let prevRoom = useLogStore.getState().currentRoom;
        const unsubscribe = useLogStore.subscribe((state) => {
            if (state.roomSwitching && state.currentRoom !== prevRoom) {
                prevRoom = state.currentRoom;
                console.log(`[WS] Room switched to: ${state.currentRoom}, reconnecting...`);

                // Abort any in-flight fetch request
                if (fetchAbortControllerRef.current) {
                    fetchAbortControllerRef.current.abort();
                    fetchAbortControllerRef.current = null;
                }

                // Reset the lastLoadedEntryId to avoid filtering out new room's entries
                lastLoadedEntryIdRef.current = 0;

                // Clear any pending batched entries from old room
                batchRef.current.entries = [];
                batchRef.current.watches.clear();
                batchRef.current.controlCommands = [];

                // Use earlyWebSocket's reconnect to maintain message handlers
                // (useWebSocket's connect() doesn't have stream handlers)
                earlyReconnect();
                // Update our ref to point to the new connection after a small delay
                setTimeout(() => {
                    const newWs = getWebSocket();
                    if (newWs) {
                        wsRef.current = newWs;
                    }
                }, 200);
            }
        });
        return unsubscribe;
    }, [connect, disconnect]);

    // Sync with early WebSocket on mount
    useEffect(() => {
        mountedRef.current = true;

        // Check if early WebSocket is handling connection
        if (isEarlyInitialized()) {
            // The early WebSocket service handles everything - just sync the ref
            const earlyWs = getWebSocket();
            if (earlyWs) {
                wsRef.current = earlyWs;
                console.log('[WS] Using early WebSocket connection');
            }
            // Don't call connect() - early WebSocket handles reconnection
        } else {
            // Fallback: no early connection, connect normally
            if (!connectedOnceRef.current) {
                connectedOnceRef.current = true;
                connect();
            }
        }

        return () => {
            mountedRef.current = false;
            // Don't disconnect - early WebSocket manages connection lifecycle
            if (!isEarlyInitialized()) {
                disconnect();
            }
        };
    }, []); // Empty deps - only run on mount/unmount

    return {
        connect,
        disconnect,
        send,
        isConnected: wsRef.current?.readyState === WebSocket.OPEN,
        // Stream subscription methods
        subscribeToStream,
        unsubscribeFromStream,
        pauseStream,
        resumeStream,
        pauseAllStreams,
        resumeAllStreams,
        restoreSubscriptions
    };
}
