/**
 * Connection Logger - Tracks connection events for TCP sources and WebSocket viewers
 * Uses ring buffer to keep max 100 events
 */

const MAX_HISTORY = 100;

class ConnectionLogger {
    constructor() {
        this.history = [];
        this.eventId = 0;
    }

    /**
     * Log a connection event
     * @param {Object} params
     * @param {'source'|'viewer'} params.type - Connection type
     * @param {'connect'|'disconnect'} params.event - Event type
     * @param {string} params.id - Connection ID
     * @param {string} params.address - IP address
     * @param {number} [params.port] - Port (for sources)
     * @param {string} [params.name] - App name or user name
     * @param {string} params.room - Room name
     * @param {number} [params.duration] - Connection duration in ms (for disconnect)
     */
    log({ type, event, id, address, port, name, room, duration }) {
        const entry = {
            eventId: ++this.eventId,
            timestamp: new Date().toISOString(),
            type,
            event,
            id,
            address,
            port,
            name,
            room,
            duration
        };

        this.history.push(entry);

        // Ring buffer - remove oldest if over limit
        if (this.history.length > MAX_HISTORY) {
            this.history.shift();
        }

        return entry;
    }

    /**
     * Log source (TCP client) connect
     */
    logSourceConnect(clientInfo) {
        return this.log({
            type: 'source',
            event: 'connect',
            id: clientInfo.id,
            address: clientInfo.address,
            port: clientInfo.port,
            name: clientInfo.appName,
            room: clientInfo.room
        });
    }

    /**
     * Log source (TCP client) disconnect
     */
    logSourceDisconnect(clientInfo) {
        const connectedAt = new Date(clientInfo.connectedAt).getTime();
        const duration = Date.now() - connectedAt;

        return this.log({
            type: 'source',
            event: 'disconnect',
            id: clientInfo.id,
            address: clientInfo.address,
            port: clientInfo.port,
            name: clientInfo.appName,
            room: clientInfo.room,
            duration
        });
    }

    /**
     * Log viewer (WebSocket) connect
     */
    logViewerConnect(viewerInfo) {
        return this.log({
            type: 'viewer',
            event: 'connect',
            id: viewerInfo.id,
            address: viewerInfo.address,
            name: viewerInfo.user,
            room: viewerInfo.room
        });
    }

    /**
     * Log viewer (WebSocket) disconnect
     */
    logViewerDisconnect(viewerInfo) {
        const connectedAt = new Date(viewerInfo.connectedAt).getTime();
        const duration = Date.now() - connectedAt;

        return this.log({
            type: 'viewer',
            event: 'disconnect',
            id: viewerInfo.id,
            address: viewerInfo.address,
            name: viewerInfo.user,
            room: viewerInfo.room,
            duration
        });
    }

    /**
     * Get connection history
     * @param {Object} [options]
     * @param {'source'|'viewer'} [options.type] - Filter by type
     * @param {string} [options.room] - Filter by room
     * @param {number} [options.limit] - Max entries to return
     */
    getHistory({ type, room, limit } = {}) {
        let result = [...this.history].reverse(); // Most recent first

        if (type) {
            result = result.filter(e => e.type === type);
        }

        if (room) {
            result = result.filter(e => e.room === room);
        }

        if (limit && limit > 0) {
            result = result.slice(0, limit);
        }

        return result;
    }

    /**
     * Clear history
     */
    clear() {
        this.history = [];
    }
}

// Singleton instance
const connectionLogger = new ConnectionLogger();

module.exports = { connectionLogger, ConnectionLogger };
