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
const { connectionLogger } = require('./connection-logger');
const { PipeLogger } = require('./pipe-logger');

// Configuration from environment
const config = {
    httpPort: parseInt(process.env.HTTP_PORT) || 5174,
    tcpPort: parseInt(process.env.TCP_PORT) || 4229,
    authToken: process.env.SI_AUTH_TOKEN || null,
    authRequired: process.env.SI_AUTH_REQUIRED === 'true',
    maxEntries: parseInt(process.env.MAX_ENTRIES) || 100000,
    maxStreamEntries: parseInt(process.env.MAX_STREAM_ENTRIES) || 1000,
    // Named pipe configuration
    pipePath: process.env.SI_PIPE_PATH || '/tmp/smartinspect.pipe',
    pipeEnabled: process.env.SI_PIPE_ENABLED !== 'false',
    pipeRoom: process.env.SI_PIPE_ROOM || 'default'
};

// Initialize room manager (replaces global storage)
const roomManager = new RoomManager(config.maxEntries, config.maxStreamEntries);

// ==================== Watch Throttling ====================
// Limits watch broadcasts to 10 per second per watch to prevent UI overload
const WATCH_THROTTLE_MS = 100; // ~10 updates per second
const watchThrottleState = new Map(); // roomId:watchName -> { lastBroadcast, pending, timer }

// ==================== Stream Throttling ====================
// NO server-side throttling for streams - client handles auto-pause for fast streams
const STREAM_THROTTLE_MS = 0; // No throttling - broadcast all stream messages immediately
const streamThrottleState = new Map(); // Kept for compatibility but not used

// ==================== Log Entry Throttling ====================
// Batches log entry broadcasts to 3 per second per room to prevent UI overload
const ENTRY_THROTTLE_MS = 333; // ~3 updates per second per room
const entryThrottleState = new Map(); // roomId -> { lastBroadcast, pendingEntries, timer }

// ==================== Performance Metrics ====================
// Track messages per second for monitoring
const perfMetrics = {
    // Current second counters
    entriesReceived: 0,
    watchesReceived: 0,
    entriesBroadcast: 0,
    watchesBroadcast: 0,
    // Per-second rates (updated every second)
    entriesPerSec: 0,
    watchesPerSec: 0,
    entriesBroadcastPerSec: 0,
    watchesBroadcastPerSec: 0,
    // Totals
    totalEntriesReceived: 0,
    totalWatchesReceived: 0,
    // Last update time
    lastUpdate: Date.now()
};

// Update rates every second
setInterval(() => {
    perfMetrics.entriesPerSec = perfMetrics.entriesReceived;
    perfMetrics.watchesPerSec = perfMetrics.watchesReceived;
    perfMetrics.entriesBroadcastPerSec = perfMetrics.entriesBroadcast;
    perfMetrics.watchesBroadcastPerSec = perfMetrics.watchesBroadcast;
    // Reset counters
    perfMetrics.entriesReceived = 0;
    perfMetrics.watchesReceived = 0;
    perfMetrics.entriesBroadcast = 0;
    perfMetrics.watchesBroadcast = 0;
    perfMetrics.lastUpdate = Date.now();
}, 1000);

function getThrottleKey(roomId, watchName) {
    return `${roomId}:${watchName}`;
}

/**
 * Throttled watch broadcast - limits to ~3 updates/sec per watch
 * Always stores to watchStore immediately, but throttles WebSocket broadcasts
 */
function throttledWatchBroadcast(roomId, packet) {
    // Track received watch
    perfMetrics.watchesReceived++;
    perfMetrics.totalWatchesReceived++;

    const key = getThrottleKey(roomId, packet.name);
    const now = Date.now();
    let state = watchThrottleState.get(key);

    if (!state) {
        state = { lastBroadcast: 0, pending: null, timer: null };
        watchThrottleState.set(key, state);
    }

    const timeSinceLast = now - state.lastBroadcast;

    if (timeSinceLast >= WATCH_THROTTLE_MS) {
        // Enough time has passed - broadcast immediately
        state.lastBroadcast = now;
        state.pending = null;
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }
        perfMetrics.watchesBroadcast++;
        connectionManager.broadcastWatchToRoom(roomId, packet);
    } else {
        // Too soon - store as pending and schedule broadcast
        state.pending = packet;
        if (!state.timer) {
            const delay = WATCH_THROTTLE_MS - timeSinceLast;
            state.timer = setTimeout(() => {
                const currentState = watchThrottleState.get(key);
                if (currentState && currentState.pending) {
                    currentState.lastBroadcast = Date.now();
                    perfMetrics.watchesBroadcast++;
                    connectionManager.broadcastWatchToRoom(roomId, currentState.pending);
                    currentState.pending = null;
                }
                currentState.timer = null;
            }, delay);
        }
    }
}

/**
 * Stream broadcast - sends immediately without throttling
 * Client handles auto-pause for high-frequency streams
 */
function throttledStreamBroadcast(roomId, streamData) {
    // No throttling - broadcast immediately
    connectionManager.broadcastStreamToRoom(roomId, streamData);
}

/**
 * Format trace data for WebSocket broadcast
 */
function formatTraceSummary(trace) {
    return {
        traceId: trace.traceId,
        rootSpanName: trace.rootSpanName,
        startTime: trace.startTime ? trace.startTime.toISOString() : null,
        endTime: trace.endTime ? trace.endTime.toISOString() : null,
        duration: trace.endTime && trace.startTime
            ? trace.endTime.getTime() - trace.startTime.getTime()
            : null,
        spanCount: trace.spanCount,
        hasError: trace.hasError,
        serviceNames: trace.apps ? Array.from(trace.apps) : [],
        isActive: true  // Active because we just received data
    };
}

/**
 * Throttled entry broadcast - batches entries and sends ~3 times/sec per room
 * Collects all entries and sends them together (unlike watch/stream which send latest only)
 */
function throttledEntryBroadcast(roomId, entries) {
    // Track received entries
    perfMetrics.entriesReceived += entries.length;
    perfMetrics.totalEntriesReceived += entries.length;

    const now = Date.now();
    let state = entryThrottleState.get(roomId);

    if (!state) {
        state = { lastBroadcast: 0, pendingEntries: [], timer: null };
        entryThrottleState.set(roomId, state);
    }

    // Add entries to pending batch
    state.pendingEntries.push(...entries);

    const timeSinceLast = now - state.lastBroadcast;

    if (timeSinceLast >= ENTRY_THROTTLE_MS) {
        // Enough time has passed - broadcast immediately
        state.lastBroadcast = now;
        const toSend = state.pendingEntries;
        state.pendingEntries = [];
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }
        if (toSend.length > 0) {
            perfMetrics.entriesBroadcast += toSend.length;
            connectionManager.broadcastEntriesToRoom(roomId, toSend);
        }
    } else if (!state.timer) {
        // Schedule batch broadcast
        const delay = ENTRY_THROTTLE_MS - timeSinceLast;
        state.timer = setTimeout(() => {
            const currentState = entryThrottleState.get(roomId);
            if (currentState && currentState.pendingEntries.length > 0) {
                currentState.lastBroadcast = Date.now();
                const toSend = currentState.pendingEntries;
                currentState.pendingEntries = [];
                perfMetrics.entriesBroadcast += toSend.length;
                connectionManager.broadcastEntriesToRoom(roomId, toSend);
            }
            currentState.timer = null;
        }, delay);
    }
}

// Ensure default room exists
roomManager.getOrCreate('default');

// Initialize settings database
const settingsDB = new SettingsDB();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// ==================== Shell Script Logging API ====================

/**
 * POST /api/log - Simple log injection for shell scripts
 *
 * Query params:
 *   - level: debug|verbose|info|warning|error|fatal (default: info)
 *   - app: Application name (default: 'shell')
 *   - session: Session name (default: 'Main')
 *   - room: Room ID (default: 'default')
 *
 * Body: Plain text message or JSON { message, title, data }
 *
 * Examples:
 *   curl -X POST "http://host:5174/api/log?level=info&app=myscript" -d "message"
 *   curl -X POST "http://host:5174/api/log" -H "Content-Type: application/json" -d '{"message":"text"}'
 */
app.post('/api/log', express.text({ type: '*/*' }), (req, res) => {
    const roomId = req.query.room || 'default';
    const appName = req.query.app || 'shell';
    const sessionName = req.query.session || 'Main';
    const levelParam = (req.query.level || 'info').toLowerCase();

    // Level mapping
    const levelMap = {
        'debug': Level.Debug,
        'verbose': Level.Verbose,
        'info': Level.Message,
        'message': Level.Message,
        'warning': Level.Warning,
        'warn': Level.Warning,
        'error': Level.Error,
        'fatal': Level.Fatal
    };
    const level = levelMap[levelParam] ?? Level.Message;

    // Entry type mapping
    const entryTypeMap = {
        [Level.Debug]: LogEntryType.Debug,
        [Level.Verbose]: LogEntryType.Verbose,
        [Level.Message]: LogEntryType.Message,
        [Level.Warning]: LogEntryType.Warning,
        [Level.Error]: LogEntryType.Error,
        [Level.Fatal]: LogEntryType.Fatal
    };

    // Parse body - handle both plain text and JSON
    let message = '';
    let title = '';
    let data = null;
    let ctx = null;
    let parsedBody = null;

    if (typeof req.body === 'string') {
        // Try to parse as JSON first (since express.text() receives all as string)
        try {
            parsedBody = JSON.parse(req.body);
        } catch {
            // Not JSON, treat as plain text message
            message = req.body;
            title = message.substring(0, 100);
        }
    }

    // If we parsed JSON or body was already an object
    if (parsedBody || (typeof req.body === 'object' && req.body !== null)) {
        const bodyObj = parsedBody || req.body;
        message = bodyObj.message || bodyObj.msg || '';
        title = bodyObj.title || message.substring(0, 100);
        data = bodyObj.data ? Buffer.from(JSON.stringify(bodyObj.data)) : null;
        ctx = bodyObj.ctx || null;  // Extract context for tracing
    }

    if (!message) {
        return res.status(400).json({ error: 'Message required in body' });
    }

    // Get/create room and inject log
    const room = roomManager.getOrCreate(roomId);
    const entry = {
        type: 'logEntry',
        logEntryType: entryTypeMap[level],
        viewerId: 0,
        appName: appName,
        sessionName: sessionName,
        title: title,
        hostName: 'shell',
        processId: 0,
        threadId: 0,
        timestamp: new Date(),
        color: { r: 0, g: 0, b: 0, a: 0 },
        data: data || (message.length > 100 ? Buffer.from(message) : null),
        level: level,
        ctx: ctx  // Include context for tracing
    };

    const storedEntry = room.logBuffer.push(entry);
    room.touch();

    // Process for trace aggregation (if entry has trace context)
    const trace = room.processEntryForTracing(storedEntry);
    if (trace) {
        connectionManager.broadcastTraceToRoom(roomId, formatTraceSummary(trace));
    }

    // Broadcast to viewers
    throttledEntryBroadcast(roomId, [storedEntry]);

    res.json({
        success: true,
        id: storedEntry.id,
        room: roomId
    });
});

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
        totalStats: roomManager.getTotalStats(),
        performance: {
            entriesPerSec: perfMetrics.entriesPerSec,
            watchesPerSec: perfMetrics.watchesPerSec,
            entriesBroadcastPerSec: perfMetrics.entriesBroadcastPerSec,
            watchesBroadcastPerSec: perfMetrics.watchesBroadcastPerSec,
            totalEntriesReceived: perfMetrics.totalEntriesReceived,
            totalWatchesReceived: perfMetrics.totalWatchesReceived
        }
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
        details: roomManager.getRoomsInfo(),
        lastActivity: roomManager.getLastActivityMap()
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
    const order = req.query.order || 'desc'; // Default to newest first

    // Get all entries and apply filters
    let allEntries = room.logBuffer.getAll();

    // Apply session filter
    if (filter.sessions && filter.sessions.length > 0) {
        const sessionSet = new Set(filter.sessions);
        allEntries = allEntries.filter(e => sessionSet.has(e.sessionName));
    }

    // Apply level filter
    if (filter.levels && filter.levels.length > 0) {
        const levelSet = new Set(filter.levels);
        allEntries = allEntries.filter(e => levelSet.has(e.level));
    }

    // Apply time filters
    if (filter.from && !isNaN(filter.from.getTime())) {
        const fromTime = filter.from.getTime();
        allEntries = allEntries.filter(e => e.timestamp.getTime() >= fromTime);
    }
    if (filter.to && !isNaN(filter.to.getTime())) {
        const toTime = filter.to.getTime();
        allEntries = allEntries.filter(e => e.timestamp.getTime() < toTime);
    }

    // Apply title/message pattern filters
    if (filter.titlePattern) {
        try {
            const regex = new RegExp(filter.titlePattern, 'i');
            const matches = e => regex.test(e.title || '');
            allEntries = allEntries.filter(e =>
                filter.inverseMatch ? !matches(e) : matches(e)
            );
        } catch (err) {
            // Invalid regex, ignore
        }
    }
    if (filter.messagePattern) {
        try {
            const regex = new RegExp(filter.messagePattern, 'i');
            const matches = e => {
                if (regex.test(e.title || '')) return true;
                if (e.data) {
                    const dataStr = e.data.toString('utf8');
                    if (regex.test(dataStr)) return true;
                }
                return false;
            };
            allEntries = allEntries.filter(e =>
                filter.inverseMatch ? !matches(e) : matches(e)
            );
        } catch (err) {
            // Invalid regex, ignore
        }
    }

    const total = allEntries.length;

    // Sort entries: 'desc' = newest first (default), 'asc' = oldest first
    if (order === 'desc') {
        allEntries.sort((a, b) => b.id - a.id);
    } else {
        allEntries.sort((a, b) => a.id - b.id);
    }

    // Apply pagination
    const paginatedEntries = allEntries.slice(offset, offset + limit);

    // For display, always sort ascending (chronological order)
    paginatedEntries.sort((a, b) => a.id - b.id);

    // Serialize entries for JSON
    const serializedEntries = paginatedEntries.map(entry => {
        const serialized = { ...entry };
        if (entry.data && Buffer.isBuffer(entry.data)) {
            serialized.data = entry.data.toString('base64');
            serialized.dataEncoding = 'base64';
        }
        return serialized;
    });

    res.json({
        entries: serializedEntries,
        total,
        offset,
        limit,
        room: roomId
    });
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
 * GET /api/contexts - Get list of context keys with statistics
 * Returns: { keys: string[], summary: { [key]: { uniqueValues, totalEntries, lastSeen } } }
 */
app.get('/api/contexts', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    res.json({ ...room.logBuffer.getContextKeys(), room: roomId });
});

/**
 * GET /api/contexts/:key - Get values for a specific context key
 * Query params: limit, offset, sort (count|recent), search
 * Returns: { key, values: [{ value, count, lastSeen }], total }
 */
app.get('/api/contexts/:key', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const { limit, offset, sort, search } = req.query;

    const result = room.logBuffer.getContextValues(req.params.key, {
        limit: limit ? parseInt(limit, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
        sort: sort || 'count',
        search: search || ''
    });

    res.json({ ...result, room: roomId });
});

/**
 * GET /api/contexts/:key/:value/entries - Get entries with specific context value
 * Returns: { entries: LogEntry[], count: number }
 */
app.get('/api/contexts/:key/:value/entries', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const entries = room.logBuffer.getByContext(req.params.key, req.params.value);
    res.json({ entries, count: entries.length, room: roomId });
});

// ==================== Trace API Endpoints ====================

/**
 * GET /api/traces - List all traces
 * Query params:
 *   - limit: number (default 50)
 *   - offset: number (default 0)
 *   - status: 'all' | 'ok' | 'error' (default 'all')
 *   - minDuration: number (ms)
 *   - maxDuration: number (ms)
 *   - search: string (search in trace/span names)
 *   - sort: 'recent' | 'duration' | 'spans' (default 'recent')
 * Returns: { traces: TraceSummary[], total, offset, limit, room }
 */
app.get('/api/traces', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);

    const result = room.traceAggregator.listTraces({
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
        status: req.query.status || 'all',
        minDuration: req.query.minDuration ? parseInt(req.query.minDuration, 10) : null,
        maxDuration: req.query.maxDuration ? parseInt(req.query.maxDuration, 10) : null,
        search: req.query.search || '',
        sort: req.query.sort || 'recent'
    });

    res.json({ ...result, room: roomId });
});

/**
 * GET /api/traces/stats - Get trace aggregation statistics
 * Returns: { totalTracesProcessed, totalSpansProcessed, activeTraces, completedTraces, spanIndexSize }
 */
app.get('/api/traces/stats', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    res.json({ stats: room.traceAggregator.getStats(), room: roomId });
});

/**
 * GET /api/traces/:traceId - Get full trace details
 * Returns: { traceId, rootSpanName, startTime, endTime, duration, spans, ... }
 */
app.get('/api/traces/:traceId', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const trace = room.traceAggregator.getTrace(req.params.traceId);

    if (!trace) {
        return res.status(404).json({ error: 'Trace not found', traceId: req.params.traceId, room: roomId });
    }

    res.json({ trace, room: roomId });
});

/**
 * GET /api/traces/:traceId/tree - Get span hierarchy for waterfall view
 * Returns: { traceId, rootSpanName, duration, spanCount, hasError, roots: SpanNode[] }
 */
app.get('/api/traces/:traceId/tree', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const tree = room.traceAggregator.getSpanTree(req.params.traceId);

    if (!tree) {
        return res.status(404).json({ error: 'Trace not found', traceId: req.params.traceId, room: roomId });
    }

    res.json({ ...tree, room: roomId });
});

/**
 * GET /api/traces/:traceId/entries - Get all log entries in a trace
 * Returns: { entries: LogEntry[], count, traceId }
 */
app.get('/api/traces/:traceId/entries', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const trace = room.traceAggregator.getTrace(req.params.traceId);

    if (!trace) {
        return res.status(404).json({ error: 'Trace not found', traceId: req.params.traceId, room: roomId });
    }

    // Get actual entries from log buffer using indexed lookup (O(n) instead of O(n*m))
    const entries = room.logBuffer.getByIds(trace.entryIds)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json({ entries, count: entries.length, traceId: req.params.traceId, room: roomId });
});

/**
 * GET /api/spans/:spanId/trace - Get trace containing a specific span
 * Returns: { trace, room }
 */
app.get('/api/spans/:spanId/trace', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const trace = room.traceAggregator.getTraceBySpan(req.params.spanId);

    if (!trace) {
        return res.status(404).json({ error: 'Span not found', spanId: req.params.spanId, room: roomId });
    }

    res.json({ trace, room: roomId });
});

/**
 * DELETE /api/traces - Clear all traces
 */
app.delete('/api/traces', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    room.traceAggregator.clear();
    res.json({ success: true, room: roomId });
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
 * GET /api/watches/:name/history - Get watch history with resolution support
 * Query params:
 *   - from: Start timestamp (ms since epoch)
 *   - to: End timestamp (ms since epoch)
 *   - resolution: 'raw' | '1s' | '1m' | '1h' | 'auto' (default: 'auto')
 *
 * Auto-resolution logic:
 *   - < 30 sec range  → raw (sub-second precision)
 *   - < 1 hour range  → 1s (secondly averages)
 *   - < 24 hour range → 1m (minutely averages)
 *   - > 24 hour range → 1h (hourly averages)
 */
app.get('/api/watches/:name/history', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const { from, to, resolution } = req.query;

    const options = {
        from: from ? parseInt(from, 10) : undefined,
        to: to ? parseInt(to, 10) : undefined,
        resolution: resolution || 'auto'
    };

    const result = room.watchStore.getHistory(req.params.name, options);
    res.json({
        ...result,
        name: req.params.name,
        room: roomId
    });
});

/**
 * GET /api/clients - Get connected log sources
 */
app.get('/api/clients', (req, res) => {
    res.json(tcpServer.getClients());
});

/**
 * GET /api/viewers - Get connected viewers (WebSocket clients)
 */
app.get('/api/viewers', (req, res) => {
    res.json(connectionManager.getViewers());
});

/**
 * GET /api/connections/history - Get connection event history
 * Query params: type (source|viewer), room, limit
 */
app.get('/api/connections/history', (req, res) => {
    const { type, room, limit } = req.query;
    res.json(connectionLogger.getHistory({
        type,
        room,
        limit: limit ? parseInt(limit, 10) : undefined
    }));
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
 * DELETE /api/watches/history - Clear watch history only (keep current values)
 */
app.delete('/api/watches/history', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    const watchName = req.query.name || null;
    room.watchStore.clearHistory(watchName);
    res.json({ success: true, room: roomId, watch: watchName || 'all' });
});

/**
 * GET /api/watches/stats - Get watch history statistics
 */
app.get('/api/watches/stats', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    res.json({ stats: room.watchStore.getHistoryStats(), room: roomId });
});

/**
 * DELETE /api/streams - Clear all streams in a room
 */
app.delete('/api/streams', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const room = getRoomStorage(roomId);
    room.streamStore.clear();
    connectionManager.broadcastToRoom(roomId, { type: 'clear', target: 'streams' });
    res.json({ success: true, room: roomId });
});

/**
 * DELETE /api/all/logs - Clear logs in ALL rooms
 */
app.delete('/api/all/logs', (req, res) => {
    const rooms = roomManager.listRooms();
    let clearedCount = 0;
    for (const roomId of rooms) {
        const room = roomManager.get(roomId);
        if (room) {
            room.logBuffer.clear();
            room.methodTracker.clear();
            connectionManager.broadcastToRoom(roomId, { type: 'clear', target: 'logs' });
            clearedCount++;
        }
    }
    res.json({ success: true, roomsCleared: clearedCount });
});

/**
 * DELETE /api/all/watches - Clear watches in ALL rooms
 */
app.delete('/api/all/watches', (req, res) => {
    const rooms = roomManager.listRooms();
    let clearedCount = 0;
    for (const roomId of rooms) {
        const room = roomManager.get(roomId);
        if (room) {
            room.watchStore.clear();
            connectionManager.broadcastToRoom(roomId, { type: 'clear', target: 'watches' });
            clearedCount++;
        }
    }
    res.json({ success: true, roomsCleared: clearedCount });
});

/**
 * DELETE /api/all/streams - Clear streams in ALL rooms
 */
app.delete('/api/all/streams', (req, res) => {
    const rooms = roomManager.listRooms();
    let clearedCount = 0;
    for (const roomId of rooms) {
        const room = roomManager.get(roomId);
        if (room) {
            room.streamStore.clear();
            connectionManager.broadcastToRoom(roomId, { type: 'clear', target: 'streams' });
            clearedCount++;
        }
    }
    res.json({ success: true, roomsCleared: clearedCount });
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

// CPU usage tracking for percentage calculation
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

/**
 * GET /api/server/stats - Server stats for monitoring
 */
app.get('/api/server/stats', (req, res) => {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const now = Date.now();

    // Calculate CPU percentage since last call
    const elapsedMs = now - lastCpuTime;
    const elapsedMicros = elapsedMs * 1000;
    const userDelta = cpuUsage.user - lastCpuUsage.user;
    const systemDelta = cpuUsage.system - lastCpuUsage.system;
    const totalDelta = userDelta + systemDelta;

    // CPU percentage (total CPU time / elapsed time * 100)
    // For multi-core, this can exceed 100% (e.g., 200% = 2 cores fully used)
    const cpuPercent = elapsedMicros > 0 ? (totalDelta / elapsedMicros) * 100 : 0;

    // Update tracking
    lastCpuUsage = cpuUsage;
    lastCpuTime = now;

    res.json({
        memory: {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            rss: memUsage.rss,
            external: memUsage.external
        },
        cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
            percent: Math.round(cpuPercent * 10) / 10  // 1 decimal place
        },
        uptime: process.uptime(),
        rooms: roomManager.getTotalStats(),
        connections: {
            viewers: connectionManager.getViewerCount(),
            clients: tcpServer.getClientCount()
        },
        performance: {
            entriesPerSec: perfMetrics.entriesPerSec,
            watchesPerSec: perfMetrics.watchesPerSec,
            entriesBroadcastPerSec: perfMetrics.entriesBroadcastPerSec,
            watchesBroadcastPerSec: perfMetrics.watchesBroadcastPerSec,
            totalEntriesReceived: perfMetrics.totalEntriesReceived,
            totalWatchesReceived: perfMetrics.totalWatchesReceived
        }
    });
});

/**
 * GET /api/server/config - Get server configuration
 */
app.get('/api/server/config', (req, res) => {
    res.json({
        maxEntries: config.maxEntries,
        maxStreamEntries: config.maxStreamEntries,
        httpPort: config.httpPort,
        tcpPort: config.tcpPort,
        authRequired: config.authRequired,
        rooms: roomManager.listRooms()
    });
});

/**
 * GET /api/server/connection-info - Get connection info for loggers
 * Returns all network interfaces with IPs and ports for connecting log sources
 */
app.get('/api/server/connection-info', (req, res) => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const connections = [];

    // Collect all network interfaces
    for (const [name, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
            // Skip internal (loopback) addresses
            if (addr.internal) continue;

            const connectionString = addr.family === 'IPv4'
                ? `tcp(host=${addr.address}, port=${config.tcpPort})`
                : `tcp(host=[${addr.address}], port=${config.tcpPort})`;

            connections.push({
                interface: name,
                address: addr.address,
                family: addr.family,
                port: config.tcpPort,
                connectionString
            });
        }
    }

    // Add localhost entries
    connections.unshift({
        interface: 'localhost',
        address: '127.0.0.1',
        family: 'IPv4',
        port: config.tcpPort,
        connectionString: `tcp(host=127.0.0.1, port=${config.tcpPort})`
    });

    res.json({
        tcpPort: config.tcpPort,
        httpPort: config.httpPort,
        connections,
        hostname: os.hostname()
    });
});

/**
 * PATCH /api/server/config - Update server configuration
 */
app.patch('/api/server/config', (req, res) => {
    const { maxEntries, maxStreamEntries } = req.body;

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

    if (maxStreamEntries !== undefined) {
        const newMax = parseInt(maxStreamEntries);
        if (isNaN(newMax) || newMax < 100 || newMax > 100000) {
            return res.status(400).json({
                error: 'maxStreamEntries must be between 100 and 100,000'
            });
        }
        roomManager.setMaxStreamEntries(newMax);
        config.maxStreamEntries = newMax;
    }

    res.json({
        maxEntries: config.maxEntries,
        maxStreamEntries: config.maxStreamEntries,
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

// ==================== Projects API ====================

/**
 * GET /api/projects/working - Get the working project for room+user
 * NOTE: This must be before /api/projects/:id to avoid being caught by :id param
 */
app.get('/api/projects/working', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const userId = getUserFromRequest(req);

    const working = settingsDB.getWorkingProject(roomId, userId);
    res.json({
        room: roomId,
        user: userId,
        working
    });
});

/**
 * PUT /api/projects/working - Save the working project for room+user
 * NOTE: This must be before /api/projects/:id to avoid being caught by :id param
 */
app.put('/api/projects/working', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const userId = getUserFromRequest(req);
    const { projectData } = req.body;

    if (!projectData) {
        return res.status(400).json({ error: 'projectData required' });
    }

    settingsDB.setWorkingProject(roomId, userId, projectData);
    res.json({
        success: true,
        room: roomId,
        user: userId
    });
});

/**
 * GET /api/projects - List projects for room+user (includes shared)
 */
app.get('/api/projects', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const userId = getUserFromRequest(req);

    const projects = settingsDB.listProjects(roomId, userId);
    res.json({
        room: roomId,
        user: userId,
        projects
    });
});

/**
 * GET /api/projects/:id - Get a specific project
 */
app.get('/api/projects/:id', (req, res) => {
    const { id } = req.params;
    const project = settingsDB.getProject(id);

    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
});

/**
 * POST /api/projects - Create a new project
 */
app.post('/api/projects', (req, res) => {
    const roomId = getRoomFromRequest(req);
    const userId = getUserFromRequest(req);

    // Support both formats: { name, projectData } and { project: { name, ... } }
    let name, projectData, description, isShared;

    if (req.body.project) {
        // Client sends { project: { name, views, ... } }
        const project = req.body.project;
        name = project.name;
        description = project.description;
        isShared = project.isShared;
        // Extract project data (everything except metadata)
        const { name: _n, description: _d, createdBy: _c, isShared: _s, ...data } = project;
        projectData = data;
    } else {
        // Legacy format: { name, projectData }
        ({ name, projectData, description, isShared } = req.body);
    }

    if (!name || !projectData) {
        return res.status(400).json({ error: 'name and projectData required' });
    }

    const id = settingsDB.createProject(roomId, userId, name, projectData, description || '', isShared || false);

    // Return full project data for client
    const savedProject = {
        id,
        name,
        description: description || '',
        createdBy: userId,
        isShared: isShared || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...projectData
    };

    res.json({
        success: true,
        project: savedProject
    });
});

/**
 * PUT /api/projects/:id - Update an existing project (owner only)
 */
app.put('/api/projects/:id', (req, res) => {
    const { id } = req.params;
    const userId = getUserFromRequest(req);

    // Support both formats: { name, projectData } and { project: { ... } }
    let name, projectData, description, isShared;

    if (req.body.project) {
        // Client sends { project: { views, activeViewId, ... } }
        const project = req.body.project;
        name = project.name;
        description = project.description;
        isShared = project.isShared;
        // For updates, client may send partial data (just view state)
        const { name: _n, description: _d, createdBy: _c, isShared: _s, id: _id, createdAt: _ca, updatedAt: _ua, ...data } = project;
        projectData = data;

        // If client didn't send name, we need to get it from existing project
        if (!name) {
            const existing = settingsDB.getProject(id, userId);
            if (existing) {
                name = existing.name;
                if (description === undefined) description = existing.description;
            }
        }
    } else {
        // Legacy format: { name, projectData }
        ({ name, projectData, description, isShared } = req.body);
    }

    if (!name || !projectData || Object.keys(projectData).length === 0) {
        return res.status(400).json({ error: 'name and projectData required' });
    }

    const updated = settingsDB.updateProject(id, userId, name, projectData, description || '', isShared || false);
    if (updated) {
        // Return full project data
        const savedProject = {
            id,
            name,
            description: description || '',
            createdBy: userId,
            isShared: isShared || false,
            updatedAt: new Date().toISOString(),
            ...projectData
        };
        res.json({ success: true, project: savedProject });
    } else {
        res.status(404).json({ error: 'Project not found or not owner' });
    }
});

/**
 * DELETE /api/projects/:id - Delete a project (owner only)
 */
app.delete('/api/projects/:id', (req, res) => {
    const { id } = req.params;
    const userId = getUserFromRequest(req);

    const deleted = settingsDB.deleteProject(id, userId);
    if (deleted) {
        res.json({ success: true, id });
    } else {
        res.status(404).json({ error: 'Project not found or not owner' });
    }
});

/**
 * POST /api/projects/:id/copy - Copy a project to own collection
 */
app.post('/api/projects/:id/copy', (req, res) => {
    const { id } = req.params;
    const userId = getUserFromRequest(req);
    const { name } = req.body;

    const newId = settingsDB.copyProject(id, userId, name);
    if (newId) {
        res.json({ success: true, id: newId });
    } else {
        res.status(404).json({ error: 'Source project not found' });
    }
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
    const channelNames = room.streamStore.getAllChannels();
    const channels = channelNames.map(channel => ({
        channel,
        count: room.streamStore.getChannel(channel).length
    }));
    res.json({ channels, room: roomId, stats: room.streamStore.getStats() });
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
        const result = queryStreams(room.streamStore.getAll(), channel, filter);

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
        // Log viewer connection event
        const event = connectionLogger.logViewerConnect(viewerInfo);
        // Broadcast connection event globally for live updates
        connectionManager.broadcastToAll({
            type: 'connectionEvent',
            data: event
        });

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
                    availableRooms: roomManager.listRooms(),
                    tcpClientCount: tcpServer.getClientCountInRoom(viewerInfo.room)
                }
            });

            // Auto-subscribe to all existing stream channels in this room
            const existingChannels = room.streamStore.getAllChannels();
            for (const channel of existingChannels) {
                connectionManager.subscribeToStream(ws, channel);
                connectionManager.send(ws, { type: 'streamSubscribed', channel, auto: true });
            }
            if (existingChannels.length > 0) {
                console.log(`[Server] Auto-subscribed viewer ${viewerInfo.id} to ${existingChannels.length} existing channel(s)`);
            }
        }
    },
    onViewerDisconnect: (viewerInfo) => {
        console.log(`[Server] Viewer ${viewerInfo.id} disconnected from room: ${viewerInfo.room}`);
        // Log viewer disconnection event
        const event = connectionLogger.logViewerDisconnect(viewerInfo);
        // Broadcast connection event globally for live updates
        connectionManager.broadcastToAll({
            type: 'connectionEvent',
            data: event
        });
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
                        type: 'roomSwitched',
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

            // Stream subscription commands
            case 'subscribeStream':
                if (msg.channel) {
                    connectionManager.subscribeToStream(ws, msg.channel);
                    connectionManager.send(ws, {
                        type: 'streamSubscribed',
                        channel: msg.channel
                    });
                }
                break;

            case 'unsubscribeStream':
                if (msg.channel) {
                    connectionManager.unsubscribeFromStream(ws, msg.channel);
                    connectionManager.send(ws, {
                        type: 'streamUnsubscribed',
                        channel: msg.channel
                    });
                }
                break;

            case 'pauseStream':
                if (msg.channel) {
                    connectionManager.pauseStream(ws, msg.channel);
                    connectionManager.send(ws, {
                        type: 'streamPaused',
                        channel: msg.channel
                    });
                }
                break;

            case 'resumeStream':
                if (msg.channel) {
                    connectionManager.resumeStream(ws, msg.channel);
                    // Note: No replay of missed data - only new data from now
                    connectionManager.send(ws, {
                        type: 'streamResumed',
                        channel: msg.channel
                    });
                }
                break;

            case 'getStreamSubscriptions':
                connectionManager.send(ws, {
                    type: 'streamSubscriptions',
                    subscriptions: connectionManager.getStreamSubscriptions(ws)
                });
                break;
        }
    }
});

connectionManager.attach(httpServer);

// Wire room creation notification to broadcast to all viewers
roomManager.onRoomCreated = (roomId) => {
    console.log(`[Server] Broadcasting new room: ${roomId}`);
    connectionManager.broadcast({
        type: 'roomCreated',
        data: {
            roomId: roomId,
            rooms: roomManager.listRooms(),
            lastActivity: roomManager.getLastActivityMap()
        }
    });
};

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
        // Log connection event
        const event = connectionLogger.logSourceConnect(clientInfo);
        // Broadcast to room viewers
        connectionManager.broadcastToRoom(clientInfo.room, {
            type: 'clientConnect',
            data: { id: clientInfo.id, address: clientInfo.address, room: clientInfo.room }
        });
        // Broadcast connection event globally for live updates
        connectionManager.broadcastToAll({
            type: 'connectionEvent',
            data: event
        });
    },
    onClientDisconnect: (clientInfo) => {
        console.log(`[Server] Log source ${clientInfo.id} disconnected from room: ${clientInfo.room}`);
        // Log disconnection event
        const event = connectionLogger.logSourceDisconnect(clientInfo);
        // Broadcast to room viewers
        connectionManager.broadcastToRoom(clientInfo.room, {
            type: 'clientDisconnect',
            data: { id: clientInfo.id }
        });
        // Broadcast connection event globally for live updates
        connectionManager.broadcastToAll({
            type: 'connectionEvent',
            data: event
        });
    },
    onClientRoomChange: (clientInfo, oldRoom, newRoom) => {
        console.log(`[Server] Log source ${clientInfo.id} moved from room ${oldRoom} to ${newRoom}`);
        // Broadcast disconnect to old room
        connectionManager.broadcastToRoom(oldRoom, {
            type: 'clientDisconnect',
            data: { id: clientInfo.id }
        });
        // Broadcast connect to new room
        connectionManager.broadcastToRoom(newRoom, {
            type: 'clientConnect',
            data: { id: clientInfo.id, address: clientInfo.address, room: newRoom }
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

        case 'logEntry': {
            // Store in room's buffer
            const entry = room.logBuffer.push(packet);
            room.touch();

            // Process for trace aggregation (if entry has trace context)
            const entryTrace = room.processEntryForTracing(entry);
            if (entryTrace) {
                connectionManager.broadcastTraceToRoom(roomId, formatTraceSummary(entryTrace));
            }

            // Throttled broadcast to viewers (max 3/sec to prevent UI overload)
            throttledEntryBroadcast(roomId, [entry]);
            break;
        }

        case 'processFlow': {
            // Track method context
            room.methodTracker.processEntry(packet);

            // Store in room's buffer
            const flowEntry = room.logBuffer.push(packet);
            room.touch();

            // Process for trace aggregation (if entry has trace context)
            const flowTrace = room.processEntryForTracing(flowEntry);
            if (flowTrace) {
                connectionManager.broadcastTraceToRoom(roomId, formatTraceSummary(flowTrace));
            }

            // Throttled broadcast to viewers (max 3/sec to prevent UI overload)
            throttledEntryBroadcast(roomId, [flowEntry]);
            break;
        }

        case 'watch':
            // Update room's watch store (always immediate - data is preserved)
            room.watchStore.set(
                packet.name,
                packet.value,
                packet.timestamp,
                clientInfo.appName,
                packet.watchType,
                packet.group || ''  // Pass group from packet, default empty
            );
            room.touch();

            // Throttled broadcast to viewers (max 3/sec per watch to prevent UI overload)
            throttledWatchBroadcast(roomId, packet);
            break;

        case 'controlCommand':
            handleControlCommand(packet, roomId);
            break;

        case 'stream': {
            // Check if this is a new channel (before adding)
            const isNewChannel = !room.streamStore.hasChannel(packet.channel);

            // Store in room's stream store (always immediate - data is preserved)
            const streamEntry = room.streamStore.add(
                packet.channel,
                packet.data,
                packet.timestamp,
                packet.streamType,
                packet.group || ''  // Pass group from packet, default empty
            );
            room.touch();

            // If new channel, auto-subscribe all viewers in this room
            if (isNewChannel) {
                connectionManager.autoSubscribeRoomToChannel(roomId, packet.channel);
            }

            // Throttled broadcast to viewers (max 3/sec per channel to prevent UI overload)
            throttledStreamBroadcast(roomId, {
                channel: packet.channel,
                entry: {
                    id: streamEntry.id,
                    data: streamEntry.data,
                    timestamp: streamEntry.timestamp.toISOString(),
                    streamType: streamEntry.streamType,
                    group: streamEntry.group
                }
            });
            break;
        }
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

// Named pipe logger instance (initialized in start())
let pipeLogger = null;

async function start() {
    try {
        // Start TCP server for log sources
        await tcpServer.start();

        // Start named pipe logger (if enabled)
        if (config.pipeEnabled) {
            pipeLogger = new PipeLogger({
                pipePath: config.pipePath,
                defaultRoom: config.pipeRoom,
                roomManager: roomManager,
                onEntry: (roomId, entry) => {
                    throttledEntryBroadcast(roomId, [entry]);
                },
                onTrace: (roomId, trace) => {
                    connectionManager.broadcastTraceToRoom(roomId, formatTraceSummary(trace));
                }
            });
            try {
                await pipeLogger.start();
            } catch (err) {
                console.warn(`[Server] Named pipe disabled: ${err.message}`);
                pipeLogger = null;
            }
        }

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
            if (pipeLogger) {
                console.log(`Named pipe:  ${config.pipePath} (room: ${config.pipeRoom})`);
            }
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
    if (pipeLogger) pipeLogger.stop();
    await tcpServer.stop();
    httpServer.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (pipeLogger) pipeLogger.stop();
    await tcpServer.stop();
    httpServer.close();
    process.exit(0);
});

// Start the server
start();

module.exports = { app, httpServer, tcpServer, connectionManager, roomManager, settingsDB };
