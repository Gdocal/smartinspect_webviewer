/**
 * SmartInspect Web Viewer - Server
 *
 * Main entry point for the log viewer server.
 * - TCP server receives logs from Node.js apps (port 4229)
 * - HTTP + WebSocket server serves web UI and streams logs to browsers
 * - Supports multiple rooms for isolated log namespaces
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');

const { TcpLogServer } = require('./tcp-server');
const { ConnectionManager } = require('./connection-manager');
const { RoomManager } = require('./room-manager');
const { SettingsDB } = require('./settings-db');
const { PacketType, ControlCommandType, Level, LogEntryType } = require('./packet-parser');
const { registerQueryRoutes } = require('./query-api');

// Configuration from environment
const config = {
    httpPort: parseInt(process.env.HTTP_PORT) || 3000,
    tcpPort: parseInt(process.env.TCP_PORT) || 4229,
    authToken: process.env.SI_AUTH_TOKEN || null,
    authRequired: process.env.SI_AUTH_REQUIRED === 'true',
    maxEntries: parseInt(process.env.MAX_ENTRIES) || 100000
};

// Initialize room manager (replaces global storage)
const roomManager = new RoomManager(config.maxEntries);

// Ensure default room exists
roomManager.getOrCreate('default');

// Initialize settings database
const settingsDB = new SettingsDB();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from client build (if available)
const clientBuildPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));

// ==================== Helper Functions ====================

/**
 * Get room ID from request (query param or header)
 */
function getRoomFromRequest(req) {
    return req.query.room || req.headers['x-room'] || 'default';
}

/**
 * Get room storage, creating if needed
 */
function getRoomStorage(roomId) {
    return roomManager.getOrCreate(roomId);
}

// ==================== REST API ====================

/**
 * GET /api/status - Server status
 */
app.get('/api/status', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = roomManager.get(roomId);

    res.json({
        status: 'ok',
        uptime: process.uptime(),
        room: roomId,
        logSources: tcpServer.getClientCount(),
        viewers: connectionManager.getViewerCount(),
        storage: room ? room.logBuffer.getStats() : null,
        totalStats: roomManager.getTotalStats()
    });
});

/**
 * GET /api/rooms - List all rooms
 * Requires auth token if SI_AUTH_TOKEN is set
 */
app.get('/api/rooms', (req, res) => {
    // Check auth if token is configured
    if (config.authToken) {
        const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
        if (token !== config.authToken) {
            return res.status(401).json({ error: 'Authentication required' });
        }
    }

    res.json({
        rooms: roomManager.listRooms(),
        details: roomManager.getRoomsInfo()
    });
});

/**
 * GET /api/logs - Query logs with filters
 */
app.get('/api/logs', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const filter = {};

    // Parse query parameters
    if (req.query.sessions) {
        filter.sessions = req.query.sessions.split(',');
    }
    if (req.query.levels) {
        filter.levels = req.query.levels.split(',').map(Number);
    }
    if (req.query.from) {
        filter.from = new Date(req.query.from);
    }
    if (req.query.to) {
        filter.to = new Date(req.query.to);
    }
    if (req.query.title) {
        filter.titlePattern = req.query.title;
    }
    if (req.query.message) {
        filter.messagePattern = req.query.message;
    }
    if (req.query.inverse === 'true') {
        filter.inverseMatch = true;
    }

    const offset = parseInt(req.query.offset) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

    const result = room.logBuffer.query(filter, offset, limit);

    // Serialize entries for JSON
    result.entries = result.entries.map(entry => {
        const serialized = { ...entry };
        if (entry.data && Buffer.isBuffer(entry.data)) {
            serialized.data = entry.data.toString('base64');
            serialized.dataEncoding = 'base64';
        }
        return serialized;
    });

    res.json({ ...result, room: roomId });
});

/**
 * GET /api/logs/since/:id - Get logs since a given ID (for polling)
 */
app.get('/api/logs/since/:id', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const sinceId = parseInt(req.params.id) || 0;
    const entries = room.logBuffer.getSince(sinceId);

    // Serialize entries for JSON
    const serialized = entries.map(entry => {
        const result = { ...entry };
        if (entry.data && Buffer.isBuffer(entry.data)) {
            result.data = entry.data.toString('base64');
            result.dataEncoding = 'base64';
        }
        return result;
    });

    res.json({
        entries: serialized,
        lastId: entries.length > 0 ? entries[entries.length - 1].id : sinceId,
        room: roomId
    });
});

/**
 * GET /api/sessions - Get list of sessions
 */
app.get('/api/sessions', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    res.json({ sessions: room.logBuffer.getSessions(), room: roomId });
});

/**
 * GET /api/watches - Get current watch values
 */
app.get('/api/watches', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    res.json({ watches: room.watchStore.getAll(), room: roomId });
});

/**
 * GET /api/watches/:name/history - Get watch history
 */
app.get('/api/watches/:name/history', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    res.json({ history: room.watchStore.getHistory(req.params.name), room: roomId });
});

/**
 * GET /api/clients - Get connected log sources
 */
app.get('/api/clients', (req, res) => {
    res.json(tcpServer.getClients());
});

/**
 * DELETE /api/logs - Clear all logs in a room
 */
app.delete('/api/logs', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    room.logBuffer.clear();
    room.watchStore.clear();
    room.methodTracker.clear();
    connectionManager.broadcastToRoom(roomId, { type: 'clear', target: 'logs' });
    res.json({ success: true, room: roomId });
});

/**
 * DELETE /api/watches - Clear all watches in a room
 */
app.delete('/api/watches', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    room.watchStore.clear();
    connectionManager.broadcastToRoom(roomId, { type: 'clear', target: 'watches' });
    res.json({ success: true, room: roomId });
});

/**
 * DELETE /api/streams - Clear all streams in a room
 */
app.delete('/api/streams', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    // Clear all stream data
    for (const key of Object.keys(room.streamStore)) {
        delete room.streamStore[key];
    }
    connectionManager.broadcastToRoom(roomId, { type: 'clear', target: 'streams' });
    res.json({ success: true, room: roomId });
});

/**
 * DELETE /api/rooms/:roomId - Delete a room
 */
app.delete('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    if (roomId === 'default') {
        return res.status(400).json({ error: 'Cannot delete default room' });
    }
    const deleted = roomManager.deleteRoom(roomId);
    if (deleted) {
        res.json({ success: true, deleted: roomId });
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

/**
 * GET /api/server/stats - Server stats for monitoring
 */
app.get('/api/server/stats', (req, res) => {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    res.json({
        memory: {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            rss: memUsage.rss,
            external: memUsage.external
        },
        cpu: cpuUsage,
        uptime: process.uptime(),
        rooms: roomManager.getTotalStats(),
        connections: {
            viewers: connectionManager.getViewerCount(),
            clients: tcpServer.getClientCount()
        }
    });
});

/**
 * GET /api/server/config - Get server configuration
 */
app.get('/api/server/config', (req, res) => {
    res.json({
        maxEntries: config.maxEntries,
        httpPort: config.httpPort,
        tcpPort: config.tcpPort,
        authRequired: config.authRequired,
        rooms: roomManager.listRooms()
    });
});

/**
 * PATCH /api/server/config - Update server configuration
 */
app.patch('/api/server/config', (req, res) => {
    const { maxEntries } = req.body;

    if (maxEntries !== undefined) {
        const newMax = parseInt(maxEntries);
        if (isNaN(newMax) || newMax < 1000 || newMax > 1000000) {
            return res.status(400).json({
                error: 'maxEntries must be between 1,000 and 1,000,000'
            });
        }
        roomManager.setMaxEntries(newMax);
        config.maxEntries = newMax;
    }

    res.json({
        maxEntries: config.maxEntries,
        httpPort: config.httpPort,
        tcpPort: config.tcpPort
    });
});

// ==================== Settings API ====================

/**
 * Helper to get user from request
 */
function getUserFromRequest(req) {
    return req.query.user || req.headers['x-user'] || 'default';
}

/**
 * GET /api/settings - Get all settings for room+user
 */
app.get('/api/settings', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const userId = getUserFromRequest(req);

    const settings = settingsDB.getAllSettings(roomId, userId);
    res.json({
        room: roomId,
        user: userId,
        settings
    });
});

/**
 * GET /api/settings/:key - Get a specific setting
 */
app.get('/api/settings/:key', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const userId = getUserFromRequest(req);
    const { key } = req.params;

    const value = settingsDB.getSetting(roomId, userId, key);
    res.json({
        room: roomId,
        user: userId,
        key,
        value
    });
});

/**
 * PUT /api/settings - Save multiple settings
 */
app.put('/api/settings', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const userId = getUserFromRequest(req);
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'settings object required' });
    }

    settingsDB.setMultipleSettings(roomId, userId, settings);
    res.json({
        success: true,
        room: roomId,
        user: userId,
        keysUpdated: Object.keys(settings)
    });
});

/**
 * PUT /api/settings/:key - Save a single setting
 */
app.put('/api/settings/:key', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const userId = getUserFromRequest(req);
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
        return res.status(400).json({ error: 'value required in body' });
    }

    settingsDB.setSetting(roomId, userId, key, value);
    res.json({
        success: true,
        room: roomId,
        user: userId,
        key
    });
});

/**
 * DELETE /api/settings/:key - Delete a specific setting
 */
app.delete('/api/settings/:key', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const userId = getUserFromRequest(req);
    const { key } = req.params;

    settingsDB.deleteSetting(roomId, userId, key);
    res.json({
        success: true,
        room: roomId,
        user: userId,
        key
    });
});

/**
 * DELETE /api/settings - Delete all settings for room+user
 */
app.delete('/api/settings', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const userId = getUserFromRequest(req);

    settingsDB.deleteAllSettings(roomId, userId);
    res.json({
        success: true,
        room: roomId,
        user: userId
    });
});

// ==================== Auth API (for optional authentication) ====================

/**
 * POST /api/auth/login - Authenticate user
 */
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'username and password required' });
    }

    if (settingsDB.validateUser(username, password)) {
        // In production, you'd generate a JWT token here
        const user = settingsDB.getUser(username);
        res.json({
            success: true,
            user: {
                username: user.username,
                lastLogin: user.lastLogin
            }
        });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

/**
 * POST /api/auth/register - Register new user (only when auth not required)
 */
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'username and password required' });
    }

    if (username === 'default') {
        return res.status(400).json({ error: 'Cannot register as default user' });
    }

    if (settingsDB.userExists(username)) {
        return res.status(409).json({ error: 'Username already exists' });
    }

    if (settingsDB.createUser(username, password)) {
        res.json({
            success: true,
            username
        });
    } else {
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * GET /api/auth/users - List users (admin only in production)
 */
app.get('/api/auth/users', (req, res) => {
    const users = settingsDB.listUsers();
    res.json({ users });
});

// ==================== Room-Aware Query API ====================

/**
 * GET /api/logs/query - Query logs with comprehensive filters (room-aware)
 */
app.get('/api/logs/query', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);

    // Import query functions
    const { parseQueryParams, queryLogs } = require('./query-api');

    try {
        const filter = parseQueryParams(req.query);
        const result = queryLogs(room.logBuffer, filter);

        res.json({
            ...result,
            room: roomId,
            query: req.query
        });
    } catch (err) {
        console.error('[Query API] Error:', err.message);
        res.status(500).json({ error: 'Query failed', message: err.message });
    }
});

/**
 * GET /api/streams - List stream channels (room-aware)
 */
app.get('/api/streams', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const channels = Object.keys(room.streamStore).map(channel => ({
        channel,
        count: room.streamStore[channel]?.length || 0
    }));
    res.json({ channels, room: roomId });
});

/**
 * GET /api/streams/query - Query stream data (room-aware)
 */
app.get('/api/streams/query', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const { channel } = req.query;

    if (!channel) {
        return res.status(400).json({
            error: 'Missing required parameter',
            message: 'channel parameter is required'
        });
    }

    const { parseQueryParams, queryStreams } = require('./query-api');

    try {
        const filter = parseQueryParams(req.query);
        filter.limit = Math.min(filter.limit || 100, 1000);
        const result = queryStreams(room.streamStore, channel, filter);

        res.json({
            channel,
            ...result,
            room: roomId,
            query: req.query
        });
    } catch (err) {
        console.error('[Query API] Stream query error:', err.message);
        res.status(500).json({ error: 'Stream query failed', message: err.message });
    }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// ==================== HTTP + WebSocket Server ====================

const httpServer = http.createServer(app);

const connectionManager = new ConnectionManager({
    authToken: config.authToken,
    authRequired: config.authRequired,
    roomManager: roomManager,
    onViewerConnect: (viewerInfo) => {
        console.log(`[Server] Viewer ${viewerInfo.id} connected to room: ${viewerInfo.room}`);
        // Send initial state for the viewer's room
        const room = roomManager.getOrCreate(viewerInfo.room);
        const ws = [...connectionManager.viewers.entries()]
            .find(([, v]) => v.id === viewerInfo.id)?.[0];
        if (ws) {
            connectionManager.send(ws, {
                type: 'init',
                data: {
                    room: viewerInfo.room,
                    stats: room.logBuffer.getStats(),
                    watches: room.watchStore.getAll(),
                    sessions: room.logBuffer.getSessions(),
                    availableRooms: roomManager.listRooms()
                }
            });
        }
    },
    onViewerMessage: (msg, viewerInfo, ws) => {
        const room = roomManager.getOrCreate(viewerInfo.room);

        // Handle viewer commands
        switch (msg.type) {
            case 'subscribe':
                connectionManager.setViewerFilters(ws, msg.filters);
                break;
            case 'pause':
                connectionManager.setViewerPaused(ws, true);
                break;
            case 'resume':
                connectionManager.setViewerPaused(ws, false);
                // Send any entries they missed
                const entries = room.logBuffer.getSince(viewerInfo.lastEntryId);
                if (entries.length > 0) {
                    connectionManager.broadcastEntriesToRoom(viewerInfo.room, entries);
                }
                break;
            case 'getSince':
                const sinceEntries = room.logBuffer.getSince(msg.sinceId || 0);
                connectionManager.send(ws, {
                    type: 'entries',
                    data: sinceEntries.map(e => connectionManager._serializeEntry(e))
                });
                break;
            case 'switchRoom':
                // Handle room switching
                if (msg.room && msg.room !== viewerInfo.room) {
                    const oldRoom = viewerInfo.room;
                    connectionManager.switchViewerRoom(ws, msg.room);
                    console.log(`[Server] Viewer ${viewerInfo.id} switched from ${oldRoom} to ${msg.room}`);

                    // Send new room's initial state
                    const newRoom = roomManager.getOrCreate(msg.room);
                    connectionManager.send(ws, {
                        type: 'roomChanged',
                        data: {
                            room: msg.room,
                            stats: newRoom.logBuffer.getStats(),
                            watches: newRoom.watchStore.getAll(),
                            sessions: newRoom.logBuffer.getSessions()
                        }
                    });
                }
                break;
            case 'getRooms':
                connectionManager.send(ws, {
                    type: 'rooms',
                    data: {
                        rooms: roomManager.listRooms(),
                        details: roomManager.getRoomsInfo()
                    }
                });
                break;
        }
    }
});

connectionManager.attach(httpServer);

// ==================== TCP Log Server ====================

const tcpServer = new TcpLogServer({
    port: config.tcpPort,
    authToken: config.authToken,
    roomManager: roomManager,
    onPacket: (packet, clientInfo) => {
        handlePacket(packet, clientInfo);
    },
    onClientConnect: (clientInfo) => {
        console.log(`[Server] Log source ${clientInfo.id} connected: ${clientInfo.address} -> room: ${clientInfo.room}`);
        connectionManager.broadcastToRoom(clientInfo.room, {
            type: 'clientConnect',
            data: { id: clientInfo.id, address: clientInfo.address, room: clientInfo.room }
        });
    },
    onClientDisconnect: (clientInfo) => {
        console.log(`[Server] Log source ${clientInfo.id} disconnected from room: ${clientInfo.room}`);
        connectionManager.broadcastToRoom(clientInfo.room, {
            type: 'clientDisconnect',
            data: { id: clientInfo.id }
        });
    }
});

/**
 * Handle incoming packet from log source
 */
function handlePacket(packet, clientInfo) {
    const roomId = clientInfo.room || 'default';
    const room = roomManager.getOrCreate(roomId);

    switch (packet.type) {
        case 'logHeader':
            // App name update - just metadata
            break;

        case 'logEntry':
            // Store in room's buffer
            const entry = room.logBuffer.push(packet);
            room.touch();

            // Broadcast to viewers in this room
            connectionManager.broadcastEntriesToRoom(roomId, [entry]);
            break;

        case 'processFlow':
            // Track method context
            room.methodTracker.processEntry(packet);

            // Store in room's buffer
            const flowEntry = room.logBuffer.push(packet);
            room.touch();

            // Broadcast to viewers in this room
            connectionManager.broadcastEntriesToRoom(roomId, [flowEntry]);
            break;

        case 'watch':
            // Update room's watch store
            room.watchStore.set(
                packet.name,
                packet.value,
                packet.timestamp,
                clientInfo.appName,
                packet.watchType
            );
            room.touch();

            // Broadcast to viewers in this room
            connectionManager.broadcastWatchToRoom(roomId, packet);
            break;

        case 'controlCommand':
            handleControlCommand(packet, roomId);
            break;
    }
}

/**
 * Handle control commands
 */
function handleControlCommand(packet, roomId) {
    const room = roomManager.getOrCreate(roomId);

    switch (packet.controlCommandType) {
        case ControlCommandType.ClearLog:
            room.logBuffer.clear();
            room.methodTracker.clear();
            connectionManager.broadcastControlToRoom(roomId, { command: 'clearLog' });
            break;

        case ControlCommandType.ClearWatches:
            room.watchStore.clear();
            connectionManager.broadcastControlToRoom(roomId, { command: 'clearWatches' });
            break;

        case ControlCommandType.ClearAll:
            room.logBuffer.clear();
            room.watchStore.clear();
            room.methodTracker.clear();
            connectionManager.broadcastControlToRoom(roomId, { command: 'clearAll' });
            break;

        case ControlCommandType.ClearProcessFlow:
            room.methodTracker.clear();
            connectionManager.broadcastControlToRoom(roomId, { command: 'clearProcessFlow' });
            break;
    }
}

// ==================== Start Servers ====================

async function start() {
    try {
        // Start TCP server for log sources
        await tcpServer.start();

        // Start HTTP server for web UI (bind to 0.0.0.0 for WSL/Docker access)
        httpServer.listen(config.httpPort, '0.0.0.0', () => {
            console.log(`[Server] HTTP server listening on port ${config.httpPort}`);
            console.log('');
            console.log('SmartInspect Web Viewer started!');
            console.log('================================');
            console.log(`Web UI:      http://localhost:${config.httpPort}`);
            console.log(`Log intake:  TCP port ${config.tcpPort}`);
            if (config.authToken) {
                console.log(`Auth token:  ${config.authToken.substring(0, 4)}...`);
            } else {
                console.log('Auth token:  None (open access)');
            }
            console.log(`Auth required: ${config.authRequired ? 'Yes' : 'No'}`);
            console.log(`Max entries: ${config.maxEntries.toLocaleString()} per room`);
            console.log(`Rooms:       ${roomManager.listRooms().join(', ')}`);
            console.log('');
        });

    } catch (err) {
        console.error('Failed to start server:', err.message);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await tcpServer.stop();
    httpServer.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await tcpServer.stop();
    httpServer.close();
    process.exit(0);
});

// Start the server
start();

module.exports = { app, httpServer, tcpServer, connectionManager, roomManager, settingsDB };
