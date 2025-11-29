/**
 * SmartInspect Web Viewer - Connection Manager
 * Manages web viewer clients (WebSocket connections)
 */

const WebSocket = require('ws');

/**
 * Manages WebSocket connections from web viewers
 */
class ConnectionManager {
    constructor(options = {}) {
        this.authToken = options.authToken || null;
        this.wss = null;
        this.viewers = new Map();  // ws -> viewer info
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
     */
    _handleConnection(ws, req) {
        // Extract token from query string
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');

        // Authenticate if token is required
        if (this.authToken && token !== this.authToken) {
            console.log('[WS] Viewer rejected - invalid token');
            ws.close(4001, 'Invalid token');
            return;
        }

        const viewerId = ++this.viewerIdCounter;
        const viewerInfo = {
            id: viewerId,
            address: req.socket.remoteAddress,
            connectedAt: new Date(),
            lastEntryId: 0,  // For streaming updates
            filters: null,   // Client-side filters (for server-side filtering)
            paused: false
        };

        this.viewers.set(ws, viewerInfo);

        console.log(`[WS] Viewer ${viewerId} connected from ${viewerInfo.address}`);

        // Handle messages from viewer
        ws.on('message', (message) => {
            this._handleMessage(ws, message);
        });

        // Handle disconnect
        ws.on('close', () => {
            console.log(`[WS] Viewer ${viewerId} disconnected`);
            this.onViewerDisconnect(viewerInfo);
            this.viewers.delete(ws);
        });

        // Handle errors
        ws.on('error', (err) => {
            console.error(`[WS] Viewer ${viewerId} error:`, err.message);
        });

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
            this.onViewerMessage(msg, viewerInfo, ws);
        } catch (err) {
            console.error('[WS] Invalid message from viewer:', err.message);
        }
    }

    /**
     * Broadcast a message to all connected viewers
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
     * Send a message to a specific viewer
     */
    send(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    /**
     * Broadcast new log entries to viewers
     * Optionally filter by viewer's subscriptions
     */
    broadcastEntries(entries) {
        if (entries.length === 0) return;

        // Prepare entries for JSON serialization
        const serialized = entries.map(entry => this._serializeEntry(entry));

        const message = {
            type: 'entries',
            data: serialized
        };

        this.broadcast(message);
    }

    /**
     * Broadcast watch update to viewers
     */
    broadcastWatch(watch) {
        const message = {
            type: 'watch',
            data: {
                name: watch.name,
                value: watch.value,
                timestamp: watch.timestamp,
                watchType: watch.watchType
            }
        };
        this.broadcast(message);
    }

    /**
     * Broadcast control command to viewers
     */
    broadcastControl(command) {
        const message = {
            type: 'control',
            data: command
        };
        this.broadcast(message);
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
     * Get list of connected viewers
     */
    getViewers() {
        const result = [];
        for (const [, viewerInfo] of this.viewers) {
            result.push({
                id: viewerInfo.id,
                address: viewerInfo.address,
                connectedAt: viewerInfo.connectedAt,
                paused: viewerInfo.paused
            });
        }
        return result;
    }

    /**
     * Get viewer count
     */
    getViewerCount() {
        return this.viewers.size;
    }
}

module.exports = { ConnectionManager };
