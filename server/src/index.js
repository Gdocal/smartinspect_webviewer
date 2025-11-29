/**
 * SmartInspect Web Viewer - Server
 *
 * Main entry point for the log viewer server.
 * - TCP server receives logs from Node.js apps (port 4229)
 * - HTTP + WebSocket server serves web UI and streams logs to browsers
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');

const { TcpLogServer } = require('./tcp-server');
const { ConnectionManager } = require('./connection-manager');
const { LogRingBuffer, WatchStore, MethodContextTracker } = require('./storage');
const { PacketType, ControlCommandType, Level, LogEntryType } = require('./packet-parser');
const { registerQueryRoutes } = require('./query-api');

// Configuration from environment
const config = {
    httpPort: parseInt(process.env.HTTP_PORT) || 3000,
    tcpPort: parseInt(process.env.TCP_PORT) || 4229,
    authToken: process.env.SI_AUTH_TOKEN || null,
    maxEntries: parseInt(process.env.MAX_ENTRIES) || 100000
};

// Initialize storage
const logBuffer = new LogRingBuffer(config.maxEntries);
const watchStore = new WatchStore();
const methodTracker = new MethodContextTracker();

// Stream data store (high-frequency data)
const streamStore = {};

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from client build (if available)
const clientBuildPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));

// ==================== REST API ====================

/**
 * GET /api/status - Server status
 */
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        logSources: tcpServer.getClientCount(),
        viewers: connectionManager.getViewerCount(),
        storage: logBuffer.getStats()
    });
});

/**
 * GET /api/logs - Query logs with filters
 */
app.get('/api/logs', (req, res) => {
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

    const result = logBuffer.query(filter, offset, limit);

    // Serialize entries for JSON
    result.entries = result.entries.map(entry => {
        const serialized = { ...entry };
        if (entry.data && Buffer.isBuffer(entry.data)) {
            serialized.data = entry.data.toString('base64');
            serialized.dataEncoding = 'base64';
        }
        return serialized;
    });

    res.json(result);
});

/**
 * GET /api/logs/since/:id - Get logs since a given ID (for polling)
 */
app.get('/api/logs/since/:id', (req, res) => {
    const sinceId = parseInt(req.params.id) || 0;
    const entries = logBuffer.getSince(sinceId);

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
        lastId: entries.length > 0 ? entries[entries.length - 1].id : sinceId
    });
});

/**
 * GET /api/sessions - Get list of sessions
 */
app.get('/api/sessions', (req, res) => {
    res.json(logBuffer.getSessions());
});

/**
 * GET /api/watches - Get current watch values
 */
app.get('/api/watches', (req, res) => {
    res.json(watchStore.getAll());
});

/**
 * GET /api/watches/:name/history - Get watch history
 */
app.get('/api/watches/:name/history', (req, res) => {
    res.json(watchStore.getHistory(req.params.name));
});

/**
 * GET /api/clients - Get connected log sources
 */
app.get('/api/clients', (req, res) => {
    res.json(tcpServer.getClients());
});

/**
 * DELETE /api/logs - Clear all logs
 */
app.delete('/api/logs', (req, res) => {
    logBuffer.clear();
    watchStore.clear();
    methodTracker.clear();
    connectionManager.broadcast({ type: 'clear', target: 'logs' });
    res.json({ success: true });
});

/**
 * DELETE /api/watches - Clear all watches
 */
app.delete('/api/watches', (req, res) => {
    watchStore.clear();
    connectionManager.broadcast({ type: 'clear', target: 'watches' });
    res.json({ success: true });
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
        logs: {
            count: logBuffer.size,
            maxEntries: logBuffer.maxEntries
        },
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
        maxEntries: logBuffer.maxEntries,
        httpPort: config.httpPort,
        tcpPort: config.tcpPort
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
        logBuffer.resize(newMax);
        config.maxEntries = newMax;
    }

    res.json({
        maxEntries: logBuffer.maxEntries,
        httpPort: config.httpPort,
        tcpPort: config.tcpPort
    });
});

// ==================== Query API ====================
// Register /api/logs/query and /api/streams/query endpoints
registerQueryRoutes(app, logBuffer, streamStore);

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// ==================== HTTP + WebSocket Server ====================

const httpServer = http.createServer(app);

const connectionManager = new ConnectionManager({
    authToken: config.authToken,
    onViewerConnect: (viewerInfo) => {
        console.log(`[Server] Viewer ${viewerInfo.id} connected`);
        // Send initial state
        const ws = [...connectionManager.viewers.entries()]
            .find(([, v]) => v.id === viewerInfo.id)?.[0];
        if (ws) {
            connectionManager.send(ws, {
                type: 'init',
                data: {
                    stats: logBuffer.getStats(),
                    watches: watchStore.getAll(),
                    sessions: logBuffer.getSessions()
                }
            });
        }
    },
    onViewerMessage: (msg, viewerInfo, ws) => {
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
                const entries = logBuffer.getSince(viewerInfo.lastEntryId);
                if (entries.length > 0) {
                    connectionManager.broadcastEntries(entries);
                }
                break;
            case 'getSince':
                const sinceEntries = logBuffer.getSince(msg.sinceId || 0);
                connectionManager.send(ws, {
                    type: 'entries',
                    data: sinceEntries.map(e => connectionManager._serializeEntry(e))
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
    onPacket: (packet, clientInfo) => {
        handlePacket(packet, clientInfo);
    },
    onClientConnect: (clientInfo) => {
        console.log(`[Server] Log source ${clientInfo.id} connected: ${clientInfo.address}`);
        connectionManager.broadcast({
            type: 'clientConnect',
            data: { id: clientInfo.id, address: clientInfo.address }
        });
    },
    onClientDisconnect: (clientInfo) => {
        console.log(`[Server] Log source ${clientInfo.id} disconnected`);
        connectionManager.broadcast({
            type: 'clientDisconnect',
            data: { id: clientInfo.id }
        });
    }
});

/**
 * Handle incoming packet from log source
 */
function handlePacket(packet, clientInfo) {
    switch (packet.type) {
        case 'logHeader':
            // App name update - just metadata
            break;

        case 'logEntry':
            // Add method context tracking for ProcessFlow-related entries
            if (packet.logEntryType === LogEntryType.EnterMethod ||
                packet.logEntryType === LogEntryType.LeaveMethod) {
                // These are tracked via processFlow packets, not logEntry
            }

            // Store in buffer
            const entry = logBuffer.push(packet);

            // Broadcast to viewers
            connectionManager.broadcastEntries([entry]);
            break;

        case 'processFlow':
            // Track method context
            methodTracker.processEntry(packet);

            // Store in buffer
            const flowEntry = logBuffer.push(packet);

            // Broadcast to viewers
            connectionManager.broadcastEntries([flowEntry]);
            break;

        case 'watch':
            // Update watch store
            watchStore.set(
                packet.name,
                packet.value,
                packet.timestamp,
                clientInfo.appName,
                packet.watchType
            );

            // Broadcast to viewers
            connectionManager.broadcastWatch(packet);
            break;

        case 'controlCommand':
            handleControlCommand(packet);
            break;
    }
}

/**
 * Handle control commands
 */
function handleControlCommand(packet) {
    switch (packet.controlCommandType) {
        case ControlCommandType.ClearLog:
            logBuffer.clear();
            methodTracker.clear();
            connectionManager.broadcastControl({ command: 'clearLog' });
            break;

        case ControlCommandType.ClearWatches:
            watchStore.clear();
            connectionManager.broadcastControl({ command: 'clearWatches' });
            break;

        case ControlCommandType.ClearAll:
            logBuffer.clear();
            watchStore.clear();
            methodTracker.clear();
            connectionManager.broadcastControl({ command: 'clearAll' });
            break;

        case ControlCommandType.ClearProcessFlow:
            methodTracker.clear();
            connectionManager.broadcastControl({ command: 'clearProcessFlow' });
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
            console.log(`Max entries: ${config.maxEntries.toLocaleString()}`);
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

module.exports = { app, httpServer, tcpServer, connectionManager, logBuffer, watchStore, streamStore };
