/**
 * SmartInspect Web Viewer - Storage Layer
 * In-memory ring buffer for log entries and watch values
 */

const { ProcessFlowType } = require('./packet-parser');

// Global entry ID counter - shared across all rooms for uniqueness
let globalEntryId = 0;
let globalStreamEntryId = 0;

/**
 * Ring buffer for log entries
 * Circular buffer that evicts oldest entries when full
 */
class LogRingBuffer {
    constructor(maxEntries = 100000) {
        this.maxEntries = maxEntries;
        this.buffer = new Array(maxEntries);
        this.head = 0;       // Next write position
        this.size = 0;       // Current number of entries

        // Indexes for fast filtering
        this.sessionIndex = new Map();  // session -> Set<index>
        this.levelIndex = new Map();    // level -> Set<index>
    }

    /**
     * Add an entry to the buffer
     */
    push(entry) {
        entry.id = ++globalEntryId;
        entry.receivedAt = new Date();

        // If buffer is full, remove old entry from indexes
        if (this.size === this.maxEntries) {
            const oldEntry = this.buffer[this.head];
            if (oldEntry) {
                this._removeFromIndexes(oldEntry, this.head);
            }
        }

        // Store entry
        const index = this.head;
        this.buffer[index] = entry;
        this.head = (this.head + 1) % this.maxEntries;

        if (this.size < this.maxEntries) {
            this.size++;
        }

        // Add to indexes
        this._addToIndexes(entry, index);

        return entry;
    }

    /**
     * Add entry to indexes
     */
    _addToIndexes(entry, index) {
        // Session index
        if (entry.sessionName) {
            if (!this.sessionIndex.has(entry.sessionName)) {
                this.sessionIndex.set(entry.sessionName, new Set());
            }
            this.sessionIndex.get(entry.sessionName).add(index);
        }

        // Level index
        if (entry.level !== undefined) {
            if (!this.levelIndex.has(entry.level)) {
                this.levelIndex.set(entry.level, new Set());
            }
            this.levelIndex.get(entry.level).add(index);
        }
    }

    /**
     * Remove entry from indexes
     */
    _removeFromIndexes(entry, index) {
        if (entry.sessionName && this.sessionIndex.has(entry.sessionName)) {
            this.sessionIndex.get(entry.sessionName).delete(index);
        }
        if (entry.level !== undefined && this.levelIndex.has(entry.level)) {
            this.levelIndex.get(entry.level).delete(index);
        }
    }

    /**
     * Get all entries as array (ordered by time)
     */
    getAll() {
        const result = [];
        if (this.size === 0) return result;

        // Start from oldest entry
        const start = this.size < this.maxEntries ? 0 : this.head;
        for (let i = 0; i < this.size; i++) {
            const index = (start + i) % this.maxEntries;
            result.push(this.buffer[index]);
        }

        return result;
    }

    /**
     * Get entries since a given ID (for streaming updates)
     */
    getSince(sinceId) {
        const result = [];
        if (this.size === 0) return result;

        // Start from oldest entry
        const start = this.size < this.maxEntries ? 0 : this.head;
        for (let i = 0; i < this.size; i++) {
            const index = (start + i) % this.maxEntries;
            const entry = this.buffer[index];
            if (entry && entry.id > sinceId) {
                result.push(entry);
            }
        }

        return result;
    }

    /**
     * Query entries with filters
     * @param {Object} filter - Filter options
     * @param {string[]} filter.sessions - Session names to include
     * @param {number[]} filter.levels - Levels to include
     * @param {string} filter.titlePattern - Regex pattern for title
     * @param {string} filter.messagePattern - Regex pattern for message/data
     * @param {boolean} filter.inverseMatch - Invert pattern matching
     * @param {Date} filter.from - Start time
     * @param {Date} filter.to - End time
     * @param {number} offset - Skip first N results
     * @param {number} limit - Maximum results to return
     */
    query(filter = {}, offset = 0, limit = 100) {
        let entries = this.getAll();

        // Filter by sessions
        if (filter.sessions && filter.sessions.length > 0) {
            const sessionSet = new Set(filter.sessions);
            entries = entries.filter(e => sessionSet.has(e.sessionName));
        }

        // Filter by levels
        if (filter.levels && filter.levels.length > 0) {
            const levelSet = new Set(filter.levels);
            entries = entries.filter(e => levelSet.has(e.level));
        }

        // Filter by time range
        if (filter.from) {
            const fromTime = filter.from.getTime();
            entries = entries.filter(e => e.timestamp.getTime() >= fromTime);
        }
        if (filter.to) {
            const toTime = filter.to.getTime();
            entries = entries.filter(e => e.timestamp.getTime() <= toTime);
        }

        // Filter by title pattern
        if (filter.titlePattern) {
            try {
                const regex = new RegExp(filter.titlePattern, 'i');
                const matches = e => regex.test(e.title || '');
                entries = entries.filter(e =>
                    filter.inverseMatch ? !matches(e) : matches(e)
                );
            } catch (err) {
                // Invalid regex, ignore filter
            }
        }

        // Filter by message/data pattern
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
                entries = entries.filter(e =>
                    filter.inverseMatch ? !matches(e) : matches(e)
                );
            } catch (err) {
                // Invalid regex, ignore filter
            }
        }

        // Apply pagination
        const total = entries.length;
        entries = entries.slice(offset, offset + limit);

        return {
            entries,
            total,
            offset,
            limit
        };
    }

    /**
     * Get list of all sessions with counts
     */
    getSessions() {
        const sessions = {};
        for (const [name, indexes] of this.sessionIndex) {
            sessions[name] = indexes.size;
        }
        return sessions;
    }

    /**
     * Get counts by level
     */
    getLevelCounts() {
        const counts = {};
        for (const [level, indexes] of this.levelIndex) {
            counts[level] = indexes.size;
        }
        return counts;
    }

    /**
     * Clear all entries
     */
    clear() {
        this.buffer = new Array(this.maxEntries);
        this.head = 0;
        this.size = 0;
        this.sessionIndex.clear();
        this.levelIndex.clear();
        // Global entryId is not reset - maintains uniqueness across rooms
    }

    /**
     * Resize the buffer to a new maximum size
     * If newMax is smaller than current size, oldest entries are dropped
     */
    resize(newMaxEntries) {
        if (newMaxEntries === this.maxEntries) return;

        // Get all current entries in order
        const entries = this.getAll();

        // Clear indexes
        this.sessionIndex.clear();
        this.levelIndex.clear();

        // If shrinking, keep only the newest entries
        const entriesToKeep = entries.length > newMaxEntries
            ? entries.slice(entries.length - newMaxEntries)
            : entries;

        // Create new buffer
        this.buffer = new Array(newMaxEntries);
        this.maxEntries = newMaxEntries;
        this.head = 0;
        this.size = 0;

        // Re-add entries
        for (const entry of entriesToKeep) {
            const index = this.head;
            this.buffer[index] = entry;
            this.head = (this.head + 1) % this.maxEntries;
            this.size++;
            this._addToIndexes(entry, index);
        }
    }

    /**
     * Get current stats
     */
    getStats() {
        return {
            size: this.size,
            maxEntries: this.maxEntries,
            lastEntryId: globalEntryId,
            sessions: this.getSessions(),
            levels: this.getLevelCounts()
        };
    }
}

/**
 * Watch values store
 * Stores current values and recent history for each watch
 */
class WatchStore {
    constructor(historyLimit = 100) {
        this.values = new Map();   // name -> { value, timestamp, session, watchType, group }
        this.history = new Map();  // name -> Array of { value, timestamp }
        this.historyLimit = historyLimit;
    }

    /**
     * Update a watch value
     */
    set(name, value, timestamp, session = null, watchType = null, group = '') {
        const entry = { value, timestamp, session, watchType, group };
        this.values.set(name, entry);

        // Add to history
        if (!this.history.has(name)) {
            this.history.set(name, []);
        }
        const hist = this.history.get(name);
        hist.push({ value, timestamp });

        // Trim history
        if (hist.length > this.historyLimit) {
            hist.shift();
        }

        return entry;
    }

    /**
     * Get current value for a watch
     */
    get(name) {
        return this.values.get(name);
    }

    /**
     * Get all current watch values
     */
    getAll() {
        const result = {};
        for (const [name, entry] of this.values) {
            result[name] = entry;
        }
        return result;
    }

    /**
     * Get history for a watch
     */
    getHistory(name) {
        return this.history.get(name) || [];
    }

    /**
     * Clear a specific watch
     */
    delete(name) {
        this.values.delete(name);
        this.history.delete(name);
    }

    /**
     * Clear all watches
     */
    clear() {
        this.values.clear();
        this.history.clear();
    }
}

/**
 * Method context tracker for EnterMethod/LeaveMethod
 * Tracks call stacks per session to provide context for filtered views
 */
class MethodContextTracker {
    constructor() {
        this.stacks = new Map();  // session -> call stack array
    }

    /**
     * Process a log entry and add context metadata
     */
    processEntry(entry) {
        if (entry.type !== 'processFlow') return entry;

        const session = entry.hostName || 'default';
        let stack = this.stacks.get(session);
        if (!stack) {
            stack = [];
            this.stacks.set(session, stack);
        }

        if (entry.processFlowType === ProcessFlowType.EnterMethod) {
            stack.push({
                id: entry.id,
                method: entry.title,
                timestamp: entry.timestamp
            });
            entry.depth = stack.length;
            entry.parentId = stack.length > 1 ? stack[stack.length - 2].id : null;
            entry.context = stack.map(s => s.method);
        } else if (entry.processFlowType === ProcessFlowType.LeaveMethod) {
            const matching = stack.pop();
            entry.depth = stack.length + 1;
            entry.parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
            entry.matchingEnterId = matching ? matching.id : null;
            entry.context = [...stack.map(s => s.method), entry.title];
        }

        return entry;
    }

    /**
     * Get current call stack for a session
     */
    getStack(session) {
        return this.stacks.get(session) || [];
    }

    /**
     * Clear all stacks
     */
    clear() {
        this.stacks.clear();
    }
}

/**
 * Stream data store
 * Stores recent entries per channel for high-frequency data streams
 */
class StreamStore {
    constructor(maxEntriesPerChannel = 1000) {
        this.channels = new Map();  // channel -> Array<StreamEntry>
        this.maxEntries = maxEntriesPerChannel;
    }

    /**
     * Update max entries per channel
     */
    setMaxEntries(maxEntries) {
        this.maxEntries = maxEntries;
        // Trim existing channels if needed
        for (const [channel, entries] of this.channels) {
            if (entries.length > maxEntries) {
                this.channels.set(channel, entries.slice(-maxEntries));
            }
        }
    }

    /**
     * Add a stream entry to a channel
     */
    add(channel, data, timestamp, streamType = null, group = '') {
        if (!this.channels.has(channel)) {
            this.channels.set(channel, []);
        }

        const entry = {
            id: ++globalStreamEntryId,
            channel,
            data,
            timestamp: timestamp || new Date(),
            streamType: streamType || undefined,
            group: group || ''
        };

        const entries = this.channels.get(channel);
        entries.push(entry);

        // Trim if over limit
        if (entries.length > this.maxEntries) {
            entries.shift();
        }

        return entry;
    }

    /**
     * Check if a channel exists
     */
    hasChannel(channel) {
        return this.channels.has(channel);
    }

    /**
     * Get all entries for a specific channel
     */
    getChannel(channel) {
        return this.channels.get(channel) || [];
    }

    /**
     * Get list of all channel names
     */
    getAllChannels() {
        return Array.from(this.channels.keys());
    }

    /**
     * Get all streams data grouped by channel
     */
    getAll() {
        const result = {};
        for (const [channel, entries] of this.channels) {
            result[channel] = entries;
        }
        return result;
    }

    /**
     * Clear a specific channel
     */
    clearChannel(channel) {
        this.channels.delete(channel);
    }

    /**
     * Clear all stream data
     */
    clear() {
        this.channels.clear();
    }

    /**
     * Get stats about the stream store
     */
    getStats() {
        let totalEntries = 0;
        for (const entries of this.channels.values()) {
            totalEntries += entries.length;
        }
        return {
            channelCount: this.channels.size,
            totalEntries,
            maxEntriesPerChannel: this.maxEntries
        };
    }
}

module.exports = {
    LogRingBuffer,
    WatchStore,
    MethodContextTracker,
    StreamStore
};
