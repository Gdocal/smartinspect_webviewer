/**
 * SmartInspect Web Viewer - Connection Manager
 * Manages web viewer clients (WebSocket connections)
 * Supports room-based isolation for multi-project viewing
 *
 * Security: Supports both URL-based and message-based authentication.
 * Message-based auth (recommended) sends token after connection, avoiding URL logging.
 */

const WebSocket = require('ws');

// Timeout for authentication after connection (ms)
const AUTH_TIMEOUT = 10000;

/**
 * Manages WebSocket connections from web viewers
 */
class ConnectionManager {
    constructor(options = {}) {
        this.authToken = options.authToken || null;
        this.authRequired = options.authRequired || false;
        this.roomManager = options.roomManager || null;
        this.wss = null;
        this.viewers = new Map();  // ws -> viewer info
        this.pendingAuth = new Map();  // ws -> { timeout, room, user }
        this.viewerIdCounter = 0;

        // Callbacks
        this.onViewerConnect = options.onViewerConnect || (() => {});
        this.onViewerDisconnect = options.onViewerDisconnect || (() => {});
        this.onViewerMessage = options.onViewerMessage || (() => {});
    }

    /**
     * Attach to HTTP server
     */
    attach(server) {
        this.wss = new WebSocket.Server({
            server,
            path: '/ws'
        });

        this.wss.on('connection', (ws, req) => {
            this._handleConnection(ws, req);
        });

        console.log('[WS] WebSocket server attached');
    }

    /**
     * Handle new viewer connection
     * Supports two authentication modes:
     * 1. URL-based: token passed in query string (legacy, less secure for logging)
     * 2. Message-based: token sent after connection via 'auth' message (recommended)
     */
    _handleConnection(ws, req) {
        // Extract token and room from query string
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');
        const room = url.searchParams.get('room') || 'default';
        const user = url.searchParams.get('user') || 'default';

        // Check if auth is required
        if (this.authToken) {
            // If token provided in URL, validate immediately (legacy mode)
            if (token) {
                if (token !== this.authToken) {
                    console.log('[WS] Viewer rejected - invalid token in URL');
                    ws.close(4001, 'Invalid token');
                    return;
                }
                // Token valid, proceed with full connection
                this._completeConnection(ws, req, room, user);
            } else {
                // No token in URL - wait for auth message (secure mode)
                console.log('[WS] Viewer connected, waiting for auth message...');

                // Set up timeout for authentication
                const timeout = setTimeout(() => {
                    if (this.pendingAuth.has(ws)) {
                        console.log('[WS] Viewer rejected - auth timeout');
                        ws.close(4001, 'Authentication timeout');
                        this.pendingAuth.delete(ws);
                    }
                }, AUTH_TIMEOUT);

                this.pendingAuth.set(ws, { timeout, room, user, address: req.socket.remoteAddress });

                // Handle messages (looking for auth message)
                ws.on('message', (message) => {
                    this._handlePendingAuthMessage(ws, message);
                });

                // Handle early disconnect
                ws.on('close', () => {
                    const pending = this.pendingAuth.get(ws);
                    if (pending) {
                        clearTimeout(pending.timeout);
                        this.pendingAuth.delete(ws);
                        console.log('[WS] Pending viewer disconnected before auth');
                    }
                });

                // Send auth required message to client
                ws.send(JSON.stringify({ type: 'auth_required' }));
            }
        } else {
            // No auth required, proceed immediately
            this._completeConnection(ws, req, room, user);
        }
    }

    /**
     * Handle messages from pending (unauthenticated) connections
     */
    _handlePendingAuthMessage(ws, message) {
        const pending = this.pendingAuth.get(ws);
        if (!pending) return;

        try {
            const msg = JSON.parse(message.toString());

            if (msg.type === 'auth') {
                // Validate token
                if (msg.token === this.authToken) {
                    console.log('[WS] Viewer authenticated via message');
                    clearTimeout(pending.timeout);
                    this.pendingAuth.delete(ws);

                    // Use room/user from auth message if provided, otherwise from URL
                    const room = msg.room || pending.room;
                    const user = msg.user || pending.user;

                    // Remove the pending message handler and complete connection
                    ws.removeAllListeners('message');
                    ws.removeAllListeners('close');

                    this._completeConnection(ws, { socket: { remoteAddress: pending.address } }, room, user);

                    // Send auth success message
                    ws.send(JSON.stringify({ type: 'auth_success' }));
                } else {
                    console.log('[WS] Viewer rejected - invalid token in message');
                    clearTimeout(pending.timeout);
                    this.pendingAuth.delete(ws);
                    ws.close(4001, 'Invalid token');
                }
            }
        } catch (err) {
            console.error('[WS] Invalid message from pending viewer:', err.message);
        }
    }

    /**
     * Complete viewer connection after successful authentication
     */
    _completeConnection(ws, req, room, user, skipConnectedMessage = false) {
        const viewerId = ++this.viewerIdCounter;
        const viewerInfo = {
            id: viewerId,
            address: req.socket.remoteAddress,
            connectedAt: new Date(),
            room: room,              // Current room
            user: user,              // User identifier
            lastEntryId: 0,          // For streaming updates
            filters: null,           // Client-side filters (for server-side filtering)
            paused: false,
            streamSubscriptions: new Map()  // channel -> { subscribed: true, paused: false }
        };

        this.viewers.set(ws, viewerInfo);

        // Register with room manager if available
        if (this.roomManager) {
            this.roomManager.addViewer(room, viewerId);
        }

        console.log(`[WS] Viewer ${viewerId} connected from ${viewerInfo.address} to room: ${room}`);

        // Handle messages from viewer
        ws.on('message', (message) => {
            this._handleMessage(ws, message);
        });

        // Handle disconnect
        ws.on('close', () => {
            console.log(`[WS] Viewer ${viewerId} disconnected from room: ${viewerInfo.room}`);
            // Remove from room manager
            if (this.roomManager) {
                this.roomManager.removeViewer(viewerInfo.room, viewerId);
            }
            this.onViewerDisconnect(viewerInfo);
            this.viewers.delete(ws);
        });

        // Handle errors
        ws.on('error', (err) => {
            console.error(`[WS] Viewer ${viewerId} error:`, err.message);
        });

        // Send connected message to client (tells client no auth was required)
        // Skip if this was after auth_success (that already signals connection)
        if (!skipConnectedMessage) {
            ws.send(JSON.stringify({ type: 'connected' }));
        }

        this.onViewerConnect(viewerInfo);
    }

    /**
     * Handle message from viewer
     */
    _handleMessage(ws, message) {
        const viewerInfo = this.viewers.get(ws);
        if (!viewerInfo) return;

        try {
            const msg = JSON.parse(message.toString());

            // Handle ping/pong for latency measurement
            if (msg.type === 'ping') {
                // Echo back pong with the same timestamp
                this.send(ws, { type: 'pong', timestamp: msg.timestamp });
                return;
            }

            this.onViewerMessage(msg, viewerInfo, ws);
        } catch (err) {
            console.error('[WS] Invalid message from viewer:', err.message);
        }
    }

    /**
     * Switch a viewer to a different room
     */
    switchViewerRoom(ws, newRoom) {
        const viewerInfo = this.viewers.get(ws);
        if (!viewerInfo) return;

        const oldRoom = viewerInfo.room;
        if (oldRoom === newRoom) return;

        // Update room manager
        if (this.roomManager) {
            this.roomManager.moveViewer(viewerInfo.id, oldRoom, newRoom);
        }

        viewerInfo.room = newRoom;
        viewerInfo.lastEntryId = 0;  // Reset entry tracking for new room
        viewerInfo.streamSubscriptions.clear();  // Clear stream subscriptions for new room

        console.log(`[WS] Viewer ${viewerInfo.id} switched from ${oldRoom} to ${newRoom}`);
    }

    /**
     * Broadcast a message to all connected viewers (all rooms)
     */
    broadcast(message) {
        const data = JSON.stringify(message);
        for (const [ws, viewerInfo] of this.viewers) {
            if (ws.readyState === WebSocket.OPEN && !viewerInfo.paused) {
                ws.send(data);
            }
        }
    }

    /**
     * Broadcast a message to all viewers in a specific room
     */
    broadcastToRoom(roomId, message) {
        const data = JSON.stringify(message);
        for (const [ws, viewerInfo] of this.viewers) {
            if (viewerInfo.room === roomId && ws.readyState === WebSocket.OPEN && !viewerInfo.paused) {
                ws.send(data);
            }
        }
    }

    /**
     * Send a message to a specific viewer
     */
    send(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    /**
     * Broadcast new log entries to viewers in a specific room
     */
    broadcastEntriesToRoom(roomId, entries) {
        if (entries.length === 0) return;

        // Prepare entries for JSON serialization
        const serialized = entries.map(entry => this._serializeEntry(entry));

        const message = {
            type: 'entries',
            data: serialized
        };

        this.broadcastToRoom(roomId, message);
    }

    /**
     * Legacy: Broadcast entries to all rooms (for backward compatibility)
     */
    broadcastEntries(entries) {
        if (entries.length === 0) return;

        const serialized = entries.map(entry => this._serializeEntry(entry));
        const message = {
            type: 'entries',
            data: serialized
        };

        this.broadcast(message);
    }

    /**
     * Broadcast watch update to viewers in a specific room
     */
    broadcastWatchToRoom(roomId, watch) {
        const message = {
            type: 'watch',
            data: {
                name: watch.name,
                value: watch.value,
                timestamp: watch.timestamp,
                watchType: watch.watchType,
                group: watch.group || ''
            }
        };
        this.broadcastToRoom(roomId, message);
    }

    /**
     * Legacy: Broadcast watch update to all viewers
     */
    broadcastWatch(watch) {
        const message = {
            type: 'watch',
            data: {
                name: watch.name,
                value: watch.value,
                timestamp: watch.timestamp,
                watchType: watch.watchType,
                group: watch.group || ''
            }
        };
        this.broadcast(message);
    }

    /**
     * Broadcast control command to viewers in a specific room
     */
    broadcastControlToRoom(roomId, command) {
        const message = {
            type: 'control',
            data: command
        };
        this.broadcastToRoom(roomId, message);
    }

    /**
     * Legacy: Broadcast control command to all viewers
     */
    broadcastControl(command) {
        const message = {
            type: 'control',
            data: command
        };
        this.broadcast(message);
    }

    /**
     * Broadcast stream entry to viewers in a specific room
     * Only sends to viewers who are subscribed to this stream channel and not paused
     */
    broadcastStreamToRoom(roomId, streamData) {
        const channel = streamData.channel;
        const message = JSON.stringify({
            type: 'stream',
            channel: channel,
            entry: streamData.entry
        });

        for (const [ws, viewerInfo] of this.viewers) {
            // Must be in the same room
            if (viewerInfo.room !== roomId) continue;
            // Must have WebSocket open
            if (ws.readyState !== WebSocket.OPEN) continue;
            // Must be subscribed to this specific channel and not paused
            const sub = viewerInfo.streamSubscriptions.get(channel);
            if (!sub || !sub.subscribed || sub.paused) continue;

            ws.send(message);
        }
    }

    /**
     * Serialize entry for JSON transport
     */
    _serializeEntry(entry) {
        const serialized = { ...entry };

        // Convert Buffer data to base64
        if (entry.data && Buffer.isBuffer(entry.data)) {
            serialized.data = entry.data.toString('base64');
            serialized.dataEncoding = 'base64';
        }

        return serialized;
    }

    /**
     * Update viewer's filter subscription
     */
    setViewerFilters(ws, filters) {
        const viewerInfo = this.viewers.get(ws);
        if (viewerInfo) {
            viewerInfo.filters = filters;
        }
    }

    /**
     * Pause/resume streaming for a viewer
     */
    setViewerPaused(ws, paused) {
        const viewerInfo = this.viewers.get(ws);
        if (viewerInfo) {
            viewerInfo.paused = paused;
        }
    }

    /**
     * Subscribe a viewer to a stream channel
     */
    subscribeToStream(ws, channel) {
        const viewerInfo = this.viewers.get(ws);
        if (!viewerInfo) return false;

        viewerInfo.streamSubscriptions.set(channel, {
            subscribed: true,
            paused: false
        });

        console.log(`[WS] Viewer ${viewerInfo.id} subscribed to stream: ${channel}`);
        return true;
    }

    /**
     * Unsubscribe a viewer from a stream channel
     */
    unsubscribeFromStream(ws, channel) {
        const viewerInfo = this.viewers.get(ws);
        if (!viewerInfo) return false;

        viewerInfo.streamSubscriptions.delete(channel);

        console.log(`[WS] Viewer ${viewerInfo.id} unsubscribed from stream: ${channel}`);
        return true;
    }

    /**
     * Pause a stream for a viewer (keep subscribed but stop sending)
     */
    pauseStream(ws, channel) {
        const viewerInfo = this.viewers.get(ws);
        if (!viewerInfo) return false;

        const sub = viewerInfo.streamSubscriptions.get(channel);
        if (sub) {
            sub.paused = true;
            console.log(`[WS] Viewer ${viewerInfo.id} paused stream: ${channel}`);
            return true;
        }
        return false;
    }

    /**
     * Resume a stream for a viewer (only new data, no replay)
     */
    resumeStream(ws, channel) {
        const viewerInfo = this.viewers.get(ws);
        if (!viewerInfo) return false;

        const sub = viewerInfo.streamSubscriptions.get(channel);
        if (sub) {
            sub.paused = false;
            console.log(`[WS] Viewer ${viewerInfo.id} resumed stream: ${channel}`);
            return true;
        }
        return false;
    }

    /**
     * Get stream subscriptions for a viewer
     */
    getStreamSubscriptions(ws) {
        const viewerInfo = this.viewers.get(ws);
        if (!viewerInfo) return [];

        return Array.from(viewerInfo.streamSubscriptions.entries()).map(([channel, sub]) => ({
            channel,
            paused: sub.paused
        }));
    }

    /**
     * Auto-subscribe all viewers in a room to a new channel
     * Called when a new stream channel is detected
     */
    autoSubscribeRoomToChannel(roomId, channel) {
        let count = 0;
        for (const [ws, viewerInfo] of this.viewers) {
            if (viewerInfo.room !== roomId) continue;
            // Only subscribe if not already subscribed
            if (!viewerInfo.streamSubscriptions.has(channel)) {
                viewerInfo.streamSubscriptions.set(channel, {
                    subscribed: true,
                    paused: false
                });
                // Notify the viewer of the auto-subscription
                this.send(ws, { type: 'streamSubscribed', channel, auto: true });
                count++;
            }
        }
        if (count > 0) {
            console.log(`[WS] Auto-subscribed ${count} viewer(s) to new channel: ${channel}`);
        }
    }

    /**
     * Get list of connected viewers
     */
    getViewers() {
        const result = [];
        for (const [, viewerInfo] of this.viewers) {
            result.push({
                id: viewerInfo.id,
                address: viewerInfo.address,
                connectedAt: viewerInfo.connectedAt,
                room: viewerInfo.room,
                user: viewerInfo.user,
                paused: viewerInfo.paused
            });
        }
        return result;
    }

    /**
     * Get viewers in a specific room
     */
    getViewersInRoom(roomId) {
        const result = [];
        for (const [, viewerInfo] of this.viewers) {
            if (viewerInfo.room === roomId) {
                result.push({
                    id: viewerInfo.id,
                    address: viewerInfo.address,
                    user: viewerInfo.user,
                    paused: viewerInfo.paused
                });
            }
        }
        return result;
    }

    /**
     * Get viewer count
     */
    getViewerCount() {
        return this.viewers.size;
    }

    /**
     * Get viewer count for a specific room
     */
    getViewerCountInRoom(roomId) {
        let count = 0;
        for (const [, viewerInfo] of this.viewers) {
            if (viewerInfo.room === roomId) count++;
        }
        return count;
    }
}

module.exports = { ConnectionManager };
