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
    const host = settings.serverUrl || window.location.host;
    const protocol = host.startsWith('localhost') || host.match(/^[\d.]+:/)
        ? 'ws:'
        : (window.location.protocol === 'https:' ? 'wss:' : 'ws:');
    // Only pass non-sensitive user param in URL (no token)
    let url = `${protocol}//${host}/ws`;
    if (settings.username && settings.username !== 'default') {
        url += `?user=${encodeURIComponent(settings.username)}`;
    }

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
                const message = JSON.parse(event.data);
                handleMessage(message, useLogStore.getState());
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

    // Fetch existing logs from REST API
    try {
        const settings = getSettings();
        const headers: Record<string, string> = {};
        if (settings.authToken) {
            headers['Authorization'] = `Bearer ${settings.authToken}`;
        }
        const response = await fetch('/api/logs?limit=5000', { headers });
        const data = await response.json();
        if (data.entries && data.entries.length > 0) {
            console.log(`[Early WS] Loaded ${data.entries.length} existing entries`);
            store.addEntriesBatch(data.entries);
        }
    } catch (err) {
        console.error('[Early WS] Failed to load existing logs:', err);
    } finally {
        store.setLoadingInitialData(false);
    }
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
            const watch = message.data as { name: string; value: string; timestamp: string; watchType?: number; session?: string };
            if (watch && watch.name) {
                store.updateWatch(watch.name, {
                    value: watch.value,
                    timestamp: watch.timestamp,
                    watchType: watch.watchType,
                    session: watch.session
                });
            }
            break;
        }
        case 'watches': {
            if (!useLogStore.getState().connected && !pendingAuth) {
                completeConnection();
            }
            const watches = message.watches as Array<{ name: string; value: string; timestamp: string; watchType?: number; session?: string }>;
            if (watches) {
                const watchMap: Record<string, WatchValue> = {};
                for (const w of watches) {
                    watchMap[w.name] = {
                        value: w.value,
                        timestamp: w.timestamp,
                        watchType: w.watchType,
                        session: w.session
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
            const { channel, entry } = message as { channel: string; entry: { data: string; timestamp: string } };
            if (channel && entry) {
                store.addStreamEntry(channel, {
                    channel,
                    data: entry.data,
                    timestamp: entry.timestamp
                });
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

// Force reconnect (used when auth token changes)
export function reconnect(): void {
    console.log('[Early WS] Reconnecting (forced)...');

    // Clear any pending reconnect timers
    clearReconnectTimers();

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

    // Connect with new settings
    connect();
}
