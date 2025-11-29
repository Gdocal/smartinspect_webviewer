/**
 * SmartInspect Web Viewer - Query API
 * REST API endpoints for querying logs and streams with structured filters
 */

// Level mapping for string to number conversion
const LEVEL_MAP = {
    debug: 0,
    verbose: 1,
    info: 2,
    message: 2,
    warning: 3,
    error: 4,
    fatal: 5,
    control: 6
};

/**
 * Parse query parameters from URL into filter object
 * @param {Object} query - Express req.query object
 * @returns {Object} Parsed filter object
 */
function parseQueryParams(query) {
    const filter = {};

    // Time filters
    if (query.from) {
        filter.from = new Date(query.from);
    }
    if (query.to) {
        filter.to = new Date(query.to);
    }
    if (query.between) {
        const parts = query.between.split(',');
        if (parts.length === 2) {
            filter.from = new Date(parts[0].trim());
            filter.to = new Date(parts[1].trim());
        }
    }

    // Session filters
    if (query.session) {
        filter.session = query.session;
    }
    if (query.sessionContains) {
        filter.sessionContains = query.sessionContains;
    }
    if (query.sessionPattern) {
        try {
            filter.sessionPattern = new RegExp(query.sessionPattern, 'i');
        } catch (e) {
            // Invalid regex, ignore
        }
    }
    if (query.sessions) {
        filter.sessions = query.sessions.split(',').map(s => s.trim());
    }
    filter.sessionInverse = query.sessionInverse === 'true';

    // Message filters (searches in title field)
    if (query.message) {
        filter.message = query.message;
    }
    if (query.messagePattern) {
        try {
            filter.messagePattern = new RegExp(query.messagePattern, 'i');
        } catch (e) {
            // Invalid regex, ignore
        }
    }
    filter.messageInverse = query.messageInverse === 'true';

    // Title filters (separate from message for more granular control)
    if (query.title) {
        filter.title = query.title;
    }
    if (query.titlePattern) {
        try {
            filter.titlePattern = new RegExp(query.titlePattern, 'i');
        } catch (e) {
            // Invalid regex, ignore
        }
    }

    // Level filter
    if (query.level) {
        filter.levels = query.level.split(',').map(l => {
            const trimmed = l.trim().toLowerCase();
            return LEVEL_MAP[trimmed] !== undefined ? LEVEL_MAP[trimmed] : parseInt(trimmed);
        }).filter(l => !isNaN(l));
    }

    // Entry type filter
    if (query.entryType) {
        filter.entryTypes = query.entryType.split(',').map(t => parseInt(t.trim())).filter(t => !isNaN(t));
    }

    // App name filter
    if (query.appName) {
        filter.appName = query.appName;
    }
    if (query.appNames) {
        filter.appNames = query.appNames.split(',').map(a => a.trim());
    }

    // Host name filter
    if (query.hostName) {
        filter.hostName = query.hostName;
    }

    // Pagination
    filter.limit = Math.min(parseInt(query.limit) || 1000, 10000);
    filter.offset = parseInt(query.offset) || 0;
    filter.order = query.order === 'asc' ? 'asc' : 'desc';

    return filter;
}

/**
 * Apply filters to a list of log entries
 * @param {Array} entries - Array of log entries
 * @param {Object} filter - Filter object from parseQueryParams
 * @returns {Object} { entries, total, hasMore }
 */
function applyFilters(entries, filter) {
    let result = entries;

    // Time filters
    if (filter.from && !isNaN(filter.from.getTime())) {
        const fromTime = filter.from.getTime();
        result = result.filter(e => {
            const entryTime = e.timestamp instanceof Date ? e.timestamp.getTime() : new Date(e.timestamp).getTime();
            return entryTime >= fromTime;
        });
    }
    if (filter.to && !isNaN(filter.to.getTime())) {
        const toTime = filter.to.getTime();
        result = result.filter(e => {
            const entryTime = e.timestamp instanceof Date ? e.timestamp.getTime() : new Date(e.timestamp).getTime();
            return entryTime < toTime;
        });
    }

    // Session filters
    if (filter.session) {
        const match = e => e.sessionName === filter.session;
        result = result.filter(filter.sessionInverse ? e => !match(e) : match);
    }
    if (filter.sessionContains) {
        const searchStr = filter.sessionContains.toLowerCase();
        const match = e => (e.sessionName || '').toLowerCase().includes(searchStr);
        result = result.filter(filter.sessionInverse ? e => !match(e) : match);
    }
    if (filter.sessionPattern) {
        const match = e => filter.sessionPattern.test(e.sessionName || '');
        result = result.filter(filter.sessionInverse ? e => !match(e) : match);
    }
    if (filter.sessions && filter.sessions.length > 0) {
        const sessionSet = new Set(filter.sessions);
        const match = e => sessionSet.has(e.sessionName);
        result = result.filter(filter.sessionInverse ? e => !match(e) : match);
    }

    // Message/title filters
    if (filter.message) {
        const searchStr = filter.message.toLowerCase();
        const match = e => (e.title || '').toLowerCase().includes(searchStr);
        result = result.filter(filter.messageInverse ? e => !match(e) : match);
    }
    if (filter.messagePattern) {
        const match = e => filter.messagePattern.test(e.title || '');
        result = result.filter(filter.messageInverse ? e => !match(e) : match);
    }
    if (filter.title) {
        const searchStr = filter.title.toLowerCase();
        const match = e => (e.title || '').toLowerCase().includes(searchStr);
        result = result.filter(e => match(e));
    }
    if (filter.titlePattern) {
        const match = e => filter.titlePattern.test(e.title || '');
        result = result.filter(e => match(e));
    }

    // Level filter
    if (filter.levels && filter.levels.length > 0) {
        const levelSet = new Set(filter.levels);
        result = result.filter(e => levelSet.has(e.level));
    }

    // Entry type filter
    if (filter.entryTypes && filter.entryTypes.length > 0) {
        const typeSet = new Set(filter.entryTypes);
        result = result.filter(e => typeSet.has(e.logEntryType));
    }

    // App name filter
    if (filter.appName) {
        result = result.filter(e => e.appName === filter.appName);
    }
    if (filter.appNames && filter.appNames.length > 0) {
        const appSet = new Set(filter.appNames);
        result = result.filter(e => appSet.has(e.appName));
    }

    // Host name filter
    if (filter.hostName) {
        result = result.filter(e => e.hostName === filter.hostName);
    }

    // Sort
    if (filter.order === 'asc') {
        result.sort((a, b) => a.id - b.id);
    } else {
        result.sort((a, b) => b.id - a.id);
    }

    // Pagination
    const total = result.length;
    const paginatedResult = result.slice(filter.offset, filter.offset + filter.limit);

    return {
        entries: paginatedResult,
        total,
        hasMore: filter.offset + paginatedResult.length < total
    };
}

/**
 * Serialize an entry for JSON response
 * Handles Buffer data conversion to base64
 */
function serializeEntry(entry) {
    const serialized = { ...entry };
    if (entry.data && Buffer.isBuffer(entry.data)) {
        serialized.data = entry.data.toString('base64');
        serialized.dataEncoding = 'base64';
    }
    // Convert Date to ISO string if needed
    if (entry.timestamp instanceof Date) {
        serialized.timestamp = entry.timestamp.toISOString();
    }
    if (entry.receivedAt instanceof Date) {
        serialized.receivedAt = entry.receivedAt.toISOString();
    }
    return serialized;
}

/**
 * Query logs from ring buffer with filters
 * @param {LogRingBuffer} buffer - The log ring buffer
 * @param {Object} filter - Filter object from parseQueryParams
 * @returns {Object} Query result
 */
function queryLogs(buffer, filter) {
    const entries = buffer.getAll();
    const result = applyFilters(entries, filter);

    return {
        entries: result.entries.map(serializeEntry),
        total: result.total,
        returned: result.entries.length,
        hasMore: result.hasMore
    };
}

/**
 * Query stream data with filters
 * Streams have stricter limits due to high volume
 * @param {Object} streams - Stream data store { channel: entries[] }
 * @param {string} channel - Channel name to query
 * @param {Object} filter - Filter object
 * @returns {Object} Query result
 */
function queryStreams(streams, channel, filter) {
    const channelEntries = streams[channel] || [];

    // Apply stricter limit for streams
    const streamLimit = Math.min(filter.limit, 1000);
    const streamFilter = { ...filter, limit: streamLimit };

    // Apply time filters only for streams (simpler filtering)
    let result = channelEntries;

    if (filter.from && !isNaN(filter.from.getTime())) {
        const fromTime = filter.from.getTime();
        result = result.filter(e => {
            const entryTime = e.timestamp instanceof Date ? e.timestamp.getTime() : new Date(e.timestamp).getTime();
            return entryTime >= fromTime;
        });
    }
    if (filter.to && !isNaN(filter.to.getTime())) {
        const toTime = filter.to.getTime();
        result = result.filter(e => {
            const entryTime = e.timestamp instanceof Date ? e.timestamp.getTime() : new Date(e.timestamp).getTime();
            return entryTime < toTime;
        });
    }

    // Sort by time
    if (filter.order === 'asc') {
        result.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } else {
        result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    const total = result.length;
    const paginatedResult = result.slice(filter.offset, filter.offset + streamLimit);

    return {
        entries: paginatedResult,
        total,
        returned: paginatedResult.length,
        warning: total > 1000 ? 'Stream data limited to 1000 entries per request' : undefined
    };
}

/**
 * Register query API routes on Express app
 * @param {Express.Application} app - Express app
 * @param {LogRingBuffer} logBuffer - Log ring buffer
 * @param {Object} streamStore - Stream data store (optional)
 */
function registerQueryRoutes(app, logBuffer, streamStore = null) {
    /**
     * GET /api/logs/query - Query logs with comprehensive filters
     *
     * Query Parameters:
     * - from: ISO datetime, start time (inclusive)
     * - to: ISO datetime, end time (exclusive)
     * - between: Alternative time range "from,to"
     * - session: Exact session name match
     * - sessionContains: Session name contains substring
     * - sessionPattern: Session name matches regex
     * - sessions: Comma-separated list of session names
     * - sessionInverse: Invert session filter (true/false)
     * - message: Message/title contains substring
     * - messagePattern: Message/title matches regex
     * - messageInverse: Invert message filter (true/false)
     * - title: Title contains substring
     * - titlePattern: Title matches regex
     * - level: Comma-separated levels (Debug,Info,Warning,Error,Fatal or 0,1,2,3,4,5)
     * - entryType: Comma-separated entry type IDs
     * - appName: Filter by app name
     * - appNames: Comma-separated list of app names
     * - hostName: Filter by host name
     * - limit: Max entries (default: 1000, max: 10000)
     * - offset: Skip first N entries
     * - order: Sort order "asc" or "desc" (default: desc)
     */
    app.get('/api/logs/query', (req, res) => {
        try {
            const filter = parseQueryParams(req.query);
            const result = queryLogs(logBuffer, filter);

            res.json({
                entries: result.entries,
                total: result.total,
                returned: result.returned,
                hasMore: result.hasMore,
                query: req.query
            });
        } catch (err) {
            console.error('[Query API] Error:', err.message);
            res.status(500).json({ error: 'Query failed', message: err.message });
        }
    });

    /**
     * GET /api/streams/query - Query stream data with filters
     *
     * Query Parameters:
     * - channel: Stream channel name (required)
     * - from: ISO datetime, start time
     * - to: ISO datetime, end time
     * - limit: Max entries (default: 100, max: 1000)
     * - offset: Skip first N entries
     * - order: Sort order "asc" or "desc" (default: desc)
     */
    if (streamStore) {
        app.get('/api/streams/query', (req, res) => {
            try {
                const { channel } = req.query;

                if (!channel) {
                    return res.status(400).json({
                        error: 'Missing required parameter',
                        message: 'channel parameter is required'
                    });
                }

                const filter = parseQueryParams(req.query);
                // Enforce stricter defaults for streams
                filter.limit = Math.min(filter.limit || 100, 1000);

                const result = queryStreams(streamStore, channel, filter);

                res.json({
                    channel,
                    entries: result.entries,
                    total: result.total,
                    returned: result.returned,
                    warning: result.warning,
                    query: req.query
                });
            } catch (err) {
                console.error('[Query API] Stream query error:', err.message);
                res.status(500).json({ error: 'Stream query failed', message: err.message });
            }
        });

        /**
         * GET /api/streams - List available stream channels
         */
        app.get('/api/streams', (req, res) => {
            const channels = Object.keys(streamStore).map(channel => ({
                channel,
                count: streamStore[channel].length
            }));
            res.json({ channels });
        });
    }
}

module.exports = {
    parseQueryParams,
    applyFilters,
    serializeEntry,
    queryLogs,
    queryStreams,
    registerQueryRoutes
};
