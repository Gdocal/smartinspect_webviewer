/**
 * SmartInspect Web Viewer - Room Manager
 * Manages isolated log namespaces (rooms) for multi-project support
 *
 * Each room has independent:
 * - LogRingBuffer for log entries
 * - WatchStore for watch values
 * - StreamStore for stream data
 * - MethodContextTracker for call stacks
 */

const { LogRingBuffer, WatchStore, MethodContextTracker, StreamStore } = require('./storage');

/**
 * Storage container for a single room
 */
class RoomStorage {
    constructor(maxEntries = 100000) {
        this.logBuffer = new LogRingBuffer(maxEntries);
        this.watchStore = new WatchStore();
        this.streamStore = new StreamStore();
        this.methodTracker = new MethodContextTracker();
        this.clients = new Set();    // TCP client IDs in this room
        this.viewers = new Set();    // WebSocket viewer IDs in this room
        this.createdAt = new Date();
        this.lastActivity = new Date();
    }

    /**
     * Update last activity timestamp
     */
    touch() {
        this.lastActivity = new Date();
    }

    /**
     * Clear all data in this room
     */
    clear() {
        this.logBuffer.clear();
        this.watchStore.clear();
        this.methodTracker.clear();
        this.streamStore.clear();
        this.touch();
    }

    /**
     * Get room statistics
     */
    getStats() {
        return {
            logStats: this.logBuffer.getStats(),
            watchCount: Object.keys(this.watchStore.getAll()).length,
            streamStats: this.streamStore.getStats(),
            clientCount: this.clients.size,
            viewerCount: this.viewers.size,
            createdAt: this.createdAt,
            lastActivity: this.lastActivity
        };
    }
}

/**
 * Manages multiple rooms with lazy creation
 */
class RoomManager {
    constructor(defaultMaxEntries = 100000) {
        this.rooms = new Map();  // roomId -> RoomStorage
        this.defaultMaxEntries = defaultMaxEntries;
    }

    /**
     * Get or create a room by ID
     * @param {string} roomId - Room identifier (defaults to 'default')
     * @returns {RoomStorage} The room storage
     */
    getOrCreate(roomId = 'default') {
        if (!this.rooms.has(roomId)) {
            console.log(`[RoomManager] Creating room: ${roomId}`);
            this.rooms.set(roomId, new RoomStorage(this.defaultMaxEntries));
        }
        return this.rooms.get(roomId);
    }

    /**
     * Get a room without creating it
     * @param {string} roomId - Room identifier
     * @returns {RoomStorage|undefined} The room storage or undefined
     */
    get(roomId = 'default') {
        return this.rooms.get(roomId);
    }

    /**
     * Check if a room exists
     * @param {string} roomId - Room identifier
     * @returns {boolean}
     */
    has(roomId) {
        return this.rooms.has(roomId);
    }

    /**
     * List all room IDs
     * @returns {string[]} Array of room IDs
     */
    listRooms() {
        return Array.from(this.rooms.keys());
    }

    /**
     * Get detailed info about all rooms
     * @returns {Object[]} Array of room info objects
     */
    getRoomsInfo() {
        const result = [];
        for (const [roomId, storage] of this.rooms) {
            result.push({
                id: roomId,
                ...storage.getStats()
            });
        }
        return result;
    }

    /**
     * Delete a room and all its data
     * @param {string} roomId - Room identifier
     * @returns {boolean} True if room was deleted
     */
    deleteRoom(roomId) {
        if (roomId === 'default') {
            // Don't delete default room, just clear it
            const room = this.rooms.get('default');
            if (room) {
                room.clear();
                return true;
            }
            return false;
        }

        if (this.rooms.has(roomId)) {
            const room = this.rooms.get(roomId);
            room.clear();  // Clear data first
            this.rooms.delete(roomId);
            console.log(`[RoomManager] Deleted room: ${roomId}`);
            return true;
        }
        return false;
    }

    /**
     * Clear all data in a room without deleting it
     * @param {string} roomId - Room identifier
     * @returns {boolean} True if room was cleared
     */
    clearRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.clear();
            return true;
        }
        return false;
    }

    /**
     * Add a TCP client to a room
     * @param {string} roomId - Room identifier
     * @param {number} clientId - Client ID
     */
    addClient(roomId, clientId) {
        const room = this.getOrCreate(roomId);
        room.clients.add(clientId);
        room.touch();
    }

    /**
     * Remove a TCP client from a room
     * @param {string} roomId - Room identifier
     * @param {number} clientId - Client ID
     */
    removeClient(roomId, clientId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.clients.delete(clientId);
        }
    }

    /**
     * Add a WebSocket viewer to a room
     * @param {string} roomId - Room identifier
     * @param {number} viewerId - Viewer ID
     */
    addViewer(roomId, viewerId) {
        const room = this.getOrCreate(roomId);
        room.viewers.add(viewerId);
        room.touch();
    }

    /**
     * Remove a WebSocket viewer from a room
     * @param {string} roomId - Room identifier
     * @param {number} viewerId - Viewer ID
     */
    removeViewer(roomId, viewerId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.viewers.delete(viewerId);
        }
    }

    /**
     * Move a viewer from one room to another
     * @param {number} viewerId - Viewer ID
     * @param {string} fromRoom - Previous room ID
     * @param {string} toRoom - New room ID
     */
    moveViewer(viewerId, fromRoom, toRoom) {
        this.removeViewer(fromRoom, viewerId);
        this.addViewer(toRoom, viewerId);
    }

    /**
     * Get all viewers in a room
     * @param {string} roomId - Room identifier
     * @returns {Set<number>} Set of viewer IDs
     */
    getViewersInRoom(roomId) {
        const room = this.rooms.get(roomId);
        return room ? room.viewers : new Set();
    }

    /**
     * Get all clients in a room
     * @param {string} roomId - Room identifier
     * @returns {Set<number>} Set of client IDs
     */
    getClientsInRoom(roomId) {
        const room = this.rooms.get(roomId);
        return room ? room.clients : new Set();
    }

    /**
     * Update max entries for all rooms
     * @param {number} maxEntries - New maximum entries
     */
    setMaxEntries(maxEntries) {
        this.defaultMaxEntries = maxEntries;
        for (const [, room] of this.rooms) {
            room.logBuffer.resize(maxEntries);
        }
    }

    /**
     * Get total statistics across all rooms
     * @returns {Object} Aggregated statistics
     */
    getTotalStats() {
        let totalLogs = 0;
        let totalWatches = 0;
        let totalStreams = 0;
        let totalClients = 0;
        let totalViewers = 0;

        for (const [, room] of this.rooms) {
            totalLogs += room.logBuffer.size;
            totalWatches += Object.keys(room.watchStore.getAll()).length;
            totalStreams += room.streamStore.getStats().channelCount;
            totalClients += room.clients.size;
            totalViewers += room.viewers.size;
        }

        return {
            roomCount: this.rooms.size,
            totalLogs,
            totalWatches,
            totalStreams,
            totalClients,
            totalViewers,
            maxEntriesPerRoom: this.defaultMaxEntries
        };
    }
}

module.exports = { RoomManager, RoomStorage };
