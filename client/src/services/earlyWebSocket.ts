/**
 * Early WebSocket Connection
 *
 * This module initiates the WebSocket connection and initial data fetch
 * as early as possible (before AG Grid modules load) to minimize perceived latency.
 *
 * Security: Uses message-based authentication (sends token after connection)
 * instead of URL query params to avoid token appearing in server logs.
 */

import { useLogStore, LogEntry, WatchValue } from '../store/logStore';
import { getSettings } from '../hooks/useSettings';

let initialized = false;
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectCountdown: ReturnType<typeof setInterval> | null = null;
let pendingAuth = false;  // Track if we're waiting for auth response
const RECONNECT_DELAY = 3000;

// Throughput and latency tracking
let bytesReceived = 0;
let throughputInterval: ReturnType<typeof setInterval> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;

// ==================== Client-side Message Batching ====================
// Batches incoming messages and processes them in requestAnimationFrame
// to prevent UI jank and allow monitoring of backlog
interface QueuedMessage {
    message: unknown;
    receivedAt: number;
}

const messageQueue: QueuedMessage[] = [];
let processingScheduled = false;
let lastBacklogWarning = 0;
let backlogStartTime = 0; // Track when backlog started
const BACKLOG_WARNING_INTERVAL = 5000; // Warn every 5 seconds if backlogged
const BACKLOG_THRESHOLD = 50; // Warn if queue exceeds this
const MAX_BATCH_SIZE = 100; // Process max this many messages per frame
const MAX_BATCH_TIME_MS = 16; // Target 60fps - max 16ms per batch

function scheduleProcessing(): void {
    if (processingScheduled) return;
    processingScheduled = true;
    requestAnimationFrame(processMessageBatch);
}

function processMessageBatch(): void {
    processingScheduled = false;
    const startTime = performance.now();
    const store = useLogStore.getState();
    const now = Date.now();

    // Check for backlog and warn
    if (messageQueue.length > BACKLOG_THRESHOLD) {
        if (backlogStartTime === 0) {
            backlogStartTime = now;
        }
        if (now - lastBacklogWarning > BACKLOG_WARNING_INTERVAL) {
            const backlogDuration = ((now - backlogStartTime) / 1000).toFixed(1);
            console.warn(`[Early WS] Performance: Backlog ${messageQueue.length} msgs, duration: ${backlogDuration}s`);
            lastBacklogWarning = now;
            // Set backlog flag in store for UI to react (skip animations)
            store.setBacklogged(true);
        }
    } else if (messageQueue.length < BACKLOG_THRESHOLD / 2) {
        // Clear backlog flag when queue is manageable
        if (store.backlogged) {
            const backlogDuration = backlogStartTime > 0 ? ((now - backlogStartTime) / 1000).toFixed(1) : '0';
            console.log(`[Early WS] Performance: Backlog cleared after ${backlogDuration}s`);
            store.setBacklogged(false);
            backlogStartTime = 0;
        }
    }

    // Batch watch updates for single store update
    const watchUpdates: Record<string, WatchValue> = {};
    let processedCount = 0;

    while (messageQueue.length > 0 && processedCount < MAX_BATCH_SIZE) {
        const elapsed = performance.now() - startTime;
        if (elapsed > MAX_BATCH_TIME_MS && processedCount > 0) {
            // Time budget exceeded, schedule next batch
            break;
        }

        const queued = messageQueue.shift()!;
        processedCount++;

        try {
            // Handle watch messages specially - batch them
            const msg = queued.message as { type?: string; data?: unknown };
            if (msg.type === 'watch') {
                const watch = msg.data as { name: string; value: string; timestamp: string; watchType?: number; session?: string; group?: string };
                if (watch?.name) {
                    watchUpdates[watch.name] = {
                        value: watch.value,
                        timestamp: watch.timestamp,
                        watchType: watch.watchType,
                        session: watch.session,
                        group: watch.group
                    };
                }
            } else {
                // Process other messages immediately
                handleMessage(queued.message, store);
            }
        } catch (err) {
            console.error('[Early WS] Failed to process queued message:', err);
        }
    }

    // Apply batched watch updates in single store update
    if (Object.keys(watchUpdates).length > 0) {
        store.updateWatchBatch(watchUpdates);
    }

    // Schedule next batch if queue not empty
    if (messageQueue.length > 0) {
        scheduleProcessing();
    }
}

function queueMessage(message: unknown): void {
    messageQueue.push({ message, receivedAt: Date.now() });
    scheduleProcessing();
}

function clearReconnectTimers(): void {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    if (reconnectCountdown) {
        clearInterval(reconnectCountdown);
        reconnectCountdown = null;
    }
}

function clearMetricsIntervals(): void {
    if (throughputInterval) {
        clearInterval(throughputInterval);
        throughputInterval = null;
    }
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
    bytesReceived = 0;
}

function startMetricsTracking(): void {
    // Start throughput calculation interval (every 1 second)
    throughputInterval = setInterval(() => {
        useLogStore.getState().setWsThroughput(bytesReceived);
        bytesReceived = 0;
    }, 1000);

    // Start ping interval for latency measurement (every 2 seconds)
    pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: performance.now() }));
        }
    }, 2000);

    // Send initial ping immediately
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', timestamp: performance.now() }));
    }
}

function connect(): void {
    const store = useLogStore.getState();

    // Don't connect if already connected or connecting
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
        return;
    }

    clearReconnectTimers();
    pendingAuth = false;
    store.setReconnectIn(null);
    store.setConnecting(true);
    store.setError(null);

    console.log('[Early WS] Connecting...');

    // Build WebSocket URL - NO sensitive data in URL for security
    const settings = getSettings();
    // Use custom server URL from settings, or fall back to current host
    // Strip any protocol prefix from serverUrl if present
    let host = settings.serverUrl || window.location.host;
    if (host.startsWith('ws://')) host = host.slice(5);
    if (host.startsWith('wss://')) host = host.slice(6);
    if (host.startsWith('http://')) host = host.slice(7);
    if (host.startsWith('https://')) host = host.slice(8);
    // Remove trailing slash if present
    if (host.endsWith('/')) host = host.slice(0, -1);

    const protocol = host.startsWith('localhost') || host.match(/^[\d.]+:/)
        ? 'ws:'
        : (window.location.protocol === 'https:' ? 'wss:' : 'ws:');

    // Build WebSocket URL with room and user params
    const currentRoom = store.currentRoom;
    const params = new URLSearchParams();
    params.set('room', currentRoom);
    if (settings.username && settings.username !== 'default') {
        params.set('user', settings.username);
    }
    const url = `${protocol}//${host}/ws?${params.toString()}`;

    store.setServerUrl(host);

    try {
        ws = new WebSocket(url);

        ws.onopen = async () => {
            console.log('[Early WS] Connected, waiting for server...');
            // Don't mark as fully connected yet - wait for auth flow
            // The server will send either 'auth_required' or we're fully connected
        };

        ws.onclose = (event) => {
            console.log('[Early WS] Disconnected:', event.code, event.reason);
            const store = useLogStore.getState();
            store.setConnected(false);
            store.setConnecting(false);
            ws = null;

            // Clear metrics intervals and reset throughput
            clearMetricsIntervals();
            store.setWsThroughput(0);
            store.setWsLatency(null);

            // Check for auth failure (close code 4001)
            if (event.code === 4001) {
                store.setAuthRequired(true);
                store.setError('Authentication required');
                return; // Don't auto-reconnect
            }

            // Auto-reconnect unless intentionally closed
            if (event.code !== 1000) {
                const reconnectSeconds = Math.ceil(RECONNECT_DELAY / 1000);
                let countdown = reconnectSeconds;
                store.setReconnectIn(countdown);

                // Update countdown every second
                reconnectCountdown = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        useLogStore.getState().setReconnectIn(countdown);
                    } else {
                        if (reconnectCountdown) {
                            clearInterval(reconnectCountdown);
                            reconnectCountdown = null;
                        }
                    }
                }, 1000);

                // Reconnect after delay
                reconnectTimeout = setTimeout(() => {
                    console.log('[Early WS] Reconnecting...');
                    connect();
                }, RECONNECT_DELAY);
            }
        };

        ws.onerror = (event) => {
            console.error('[Early WS] Error:', event);
            store.setError('WebSocket connection error');
        };

        ws.onmessage = (event) => {
            try {
                // Track bytes received for throughput calculation
                const dataSize = typeof event.data === 'string' ? event.data.length : event.data.size;
                bytesReceived += dataSize;

                const message = JSON.parse(event.data);
                // Auth and control messages are processed immediately (critical path)
                // Data messages (watch, stream, entries) are queued for batched processing
                const msgType = message.type;

                // Handle pong for latency measurement
                if (msgType === 'pong') {
                    const pongData = message as { timestamp: number };
                    if (pongData.timestamp) {
                        const latency = Math.round(performance.now() - pongData.timestamp);
                        useLogStore.getState().setWsLatency(latency);
                    }
                    return;
                }

                if (msgType === 'auth_required' || msgType === 'auth_success' || msgType === 'connected' ||
                    msgType === 'init' || msgType === 'control' || msgType === 'clientConnect' ||
                    msgType === 'clientDisconnect' || msgType === 'session' || msgType === 'roomCreated') {
                    handleMessage(message, useLogStore.getState());
                } else {
                    // Queue data messages for batched processing
                    queueMessage(message);
                }
            } catch (err) {
                console.error('[Early WS] Failed to parse message:', err);
            }
        };
    } catch (err) {
        console.error('[Early WS] Failed to create WebSocket:', err);
        store.setConnecting(false);
        store.setError('Failed to connect to WebSocket');
    }
}

export function initializeWebSocket(): void {
    if (initialized) return;
    initialized = true;
    connect();
}

/**
 * Send auth message to server (secure message-based authentication)
 */
function sendAuthMessage(): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const settings = getSettings();
    const authMsg = {
        type: 'auth',
        token: settings.authToken || '',
        user: settings.username || 'default'
    };

    console.log('[Early WS] Sending auth message...');
    ws.send(JSON.stringify(authMsg));
    pendingAuth = true;
}

/**
 * Complete connection after successful auth (or when no auth required)
 */
async function completeConnection(): Promise<void> {
    const store = useLogStore.getState();
    console.log('[Early WS] Fully connected');
    store.setConnected(true);
    store.setConnecting(false);
    store.setError(null);
    store.setLoadingInitialData(true);

    // Start metrics tracking (throughput & latency)
    startMetricsTracking();

    const settings = getSettings();
    const headers: Record<string, string> = {};
    if (settings.authToken) {
        headers['Authorization'] = `Bearer ${settings.authToken}`;
    }

    // Get current room for API calls
    const currentRoom = store.currentRoom;
    const roomParam = `room=${encodeURIComponent(currentRoom)}`;

    // Fetch existing logs from REST API
    try {
        const initialLoadLimit = store.limits.initialLoadLimit;
        const response = await fetch(`/api/logs?limit=${initialLoadLimit}&${roomParam}`, { headers });
        const data = await response.json();
        if (data.entries && data.entries.length > 0) {
            console.log(`[Early WS] Loaded ${data.entries.length} existing entries for room: ${currentRoom}`);
            store.addEntriesBatch(data.entries);
        }
    } catch (err) {
        console.error('[Early WS] Failed to load existing logs:', err);
    }

    // Fetch existing streams from REST API
    try {
        const streamsResponse = await fetch(`/api/streams?${roomParam}`, { headers });
        const streamsData = await streamsResponse.json();
        if (streamsData.channels && streamsData.channels.length > 0) {
            console.log(`[Early WS] Found ${streamsData.channels.length} stream channels for room: ${currentRoom}`);
            // Fetch entries for each channel (limit to 100 per channel for initial load)
            for (const { channel } of streamsData.channels) {
                try {
                    const channelResponse = await fetch(`/api/streams/query?channel=${encodeURIComponent(channel)}&limit=100&${roomParam}`, { headers });
                    const channelData = await channelResponse.json();
                    if (channelData.entries && channelData.entries.length > 0) {
                        console.log(`[Early WS] Loaded ${channelData.entries.length} entries for stream: ${channel}`);
                        store.setStreamChannel(channel, channelData.entries);
                    }
                } catch (err) {
                    console.error(`[Early WS] Failed to load stream channel ${channel}:`, err);
                }
            }
        }
    } catch (err) {
        console.error('[Early WS] Failed to load existing streams:', err);
    }

    store.setLoadingInitialData(false);
    // Clear room switching state - we're now connected to the new room
    store.setRoomSwitching(false);
}

function handleMessage(message: any, store: ReturnType<typeof useLogStore.getState>): void {
    switch (message.type) {
        // Auth flow messages
        case 'auth_required': {
            // Server requires authentication - send auth message
            console.log('[Early WS] Server requires auth');
            const settings = getSettings();
            if (settings.authToken) {
                sendAuthMessage();
            } else {
                // No token configured - show auth required UI
                store.setAuthRequired(true);
                store.setConnecting(false);
                store.setError('Authentication required');
            }
            break;
        }
        case 'auth_success': {
            // Auth successful - complete connection
            console.log('[Early WS] Auth successful');
            pendingAuth = false;
            store.setAuthRequired(false);
            completeConnection();
            break;
        }
        case 'connected': {
            // Server says no auth required, connection complete
            console.log('[Early WS] Connected (no auth required)');
            completeConnection();
            break;
        }

        // Data messages
        case 'entries':
        case 'entry': {
            // If we receive data without auth flow, server doesn't require auth
            if (!useLogStore.getState().connected && !pendingAuth) {
                completeConnection();
            }
            const entries: LogEntry[] = message.type === 'entry' ? [message.entry] : message.data;
            if (entries && entries.length > 0) {
                store.addEntriesBatch(entries);
            }
            break;
        }
        case 'watch': {
            if (!useLogStore.getState().connected && !pendingAuth) {
                completeConnection();
            }
            const watch = message.data as { name: string; value: string; timestamp: string; watchType?: number; session?: string; group?: string };
            if (watch && watch.name) {
                store.updateWatch(watch.name, {
                    value: watch.value,
                    timestamp: watch.timestamp,
                    watchType: watch.watchType,
                    session: watch.session,
                    group: watch.group
                });
            }
            break;
        }
        case 'watches': {
            if (!useLogStore.getState().connected && !pendingAuth) {
                completeConnection();
            }
            const watches = message.watches as Array<{ name: string; value: string; timestamp: string; watchType?: number; session?: string; group?: string }>;
            if (watches) {
                const watchMap: Record<string, WatchValue> = {};
                for (const w of watches) {
                    watchMap[w.name] = {
                        value: w.value,
                        timestamp: w.timestamp,
                        watchType: w.watchType,
                        session: w.session,
                        group: w.group
                    };
                }
                store.updateWatchBatch(watchMap);
            }
            break;
        }
        case 'control': {
            const command = message.command;
            if (command === 'clearLog') {
                store.clearEntries();
            } else if (command === 'clearAll') {
                store.clearEntries();
                store.clearWatches();
            } else if (command === 'clearWatches') {
                store.clearWatches();
            }
            break;
        }
        case 'session': {
            // Session info - sessions are already extracted from entries in addEntriesBatch
            // This message type is handled for future use
            break;
        }
        case 'stream': {
            // Stream data for high-frequency metrics/timeseries
            if (!useLogStore.getState().connected && !pendingAuth) {
                completeConnection();
            }
            const { channel, entry } = message as { channel: string; entry: { data: string; timestamp: string; streamType?: string } };
            if (channel && entry) {
                store.addStreamEntry(channel, {
                    channel,
                    data: entry.data,
                    timestamp: entry.timestamp,
                    streamType: entry.streamType
                });
            }
            break;
        }
        case 'init': {
            // Initial state from server
            const initData = message.data as {
                stats?: { size: number; maxEntries: number; lastEntryId: number };
                watches?: Record<string, { value: string; timestamp: string }>;
                sessions?: Record<string, number>;
                tcpClientCount?: number;
                availableRooms?: string[];
            };
            if (initData.stats) store.setStats(initData.stats);
            if (initData.watches) store.setWatches(initData.watches);
            if (initData.sessions) store.setSessions(initData.sessions);
            if (initData.tcpClientCount !== undefined) {
                console.log('[Early WS] Init: setting tcpClientCount to', initData.tcpClientCount);
                store.setTcpClientCount(initData.tcpClientCount);
            }
            if (initData.availableRooms && Array.isArray(initData.availableRooms)) {
                console.log('[Early WS] Init: setting availableRooms to', initData.availableRooms);
                store.setAvailableRooms(initData.availableRooms);
            }
            break;
        }
        case 'clientConnect': {
            // TCP client connected
            console.log('[Early WS] TCP client connected');
            store.incrementTcpClientCount();
            break;
        }
        case 'clientDisconnect': {
            // TCP client disconnected
            console.log('[Early WS] TCP client disconnected');
            store.decrementTcpClientCount();
            break;
        }
        case 'roomCreated': {
            // New room was created on server
            const { roomId, rooms } = message as { roomId: string; rooms: string[] };
            console.log('[Early WS] Room created:', roomId);
            if (rooms && Array.isArray(rooms)) {
                store.setAvailableRooms(rooms);
            }
            break;
        }
    }
}

// Export for potential external use
export function getWebSocket(): WebSocket | null {
    return ws;
}

export function isInitialized(): boolean {
    return initialized;
}

// Force reconnect (used when auth token changes or room switches)
export function reconnect(): void {
    console.log('[Early WS] Reconnecting (forced)...');

    // Clear any pending reconnect timers
    clearReconnectTimers();

    // Clear metrics tracking
    clearMetricsIntervals();

    // Clear message queue to prevent old room's messages from being processed
    messageQueue.length = 0;
    processingScheduled = false;
    backlogStartTime = 0;

    // Close existing connection if any
    if (ws) {
        ws.onclose = null; // Prevent auto-reconnect from onclose
        ws.close(1000);
        ws = null;
    }

    // Reset auth state
    const store = useLogStore.getState();
    store.setAuthRequired(false);
    store.setError(null);
    store.setBacklogged(false);

    // Connect with new settings
    connect();
}
