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
        this.correlationIndex = new Map();  // correlationId -> Set<index> - for async flow grouping

        // Context tags index (v3 protocol)
        // Structure: Map<contextKey, Map<contextValue, Set<entryIndex>>>
        // Example: { "user": { "john": Set([1,5,9]), "jane": Set([2,6]) }, "tenant": { ... } }
        this.contextIndex = new Map();
        // Track context key statistics
        // Structure: Map<contextKey, { uniqueValues: number, totalEntries: number, lastSeen: Date }>
        this.contextStats = new Map();

        // ID index for fast lookup by entry ID
        // Structure: Map<entryId, bufferIndex>
        this.idIndex = new Map();
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
        // ID index for fast lookup
        if (entry.id !== undefined) {
            this.idIndex.set(entry.id, index);
        }

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

        // CorrelationId index (for async flow grouping)
        if (entry.correlationId) {
            if (!this.correlationIndex.has(entry.correlationId)) {
                this.correlationIndex.set(entry.correlationId, new Set());
            }
            this.correlationIndex.get(entry.correlationId).add(index);
        }

        // Context tags index (v3 protocol)
        if (entry.ctx && typeof entry.ctx === 'object') {
            for (const [key, value] of Object.entries(entry.ctx)) {
                if (value === undefined || value === null) continue;
                const strValue = String(value);

                // Initialize key map if not exists
                if (!this.contextIndex.has(key)) {
                    this.contextIndex.set(key, new Map());
                    this.contextStats.set(key, { uniqueValues: 0, totalEntries: 0, lastSeen: new Date() });
                }

                const valueMap = this.contextIndex.get(key);
                const stats = this.contextStats.get(key);

                // Initialize value set if not exists
                if (!valueMap.has(strValue)) {
                    valueMap.set(strValue, new Set());
                    stats.uniqueValues++;
                }

                // Add entry index to value set
                valueMap.get(strValue).add(index);
                stats.totalEntries++;
                stats.lastSeen = new Date();
            }
        }
    }

    /**
     * Remove entry from indexes
     */
    _removeFromIndexes(entry, index) {
        // ID index
        if (entry.id !== undefined) {
            this.idIndex.delete(entry.id);
        }

        if (entry.sessionName && this.sessionIndex.has(entry.sessionName)) {
            this.sessionIndex.get(entry.sessionName).delete(index);
        }
        if (entry.level !== undefined && this.levelIndex.has(entry.level)) {
            this.levelIndex.get(entry.level).delete(index);
        }
        if (entry.correlationId && this.correlationIndex.has(entry.correlationId)) {
            this.correlationIndex.get(entry.correlationId).delete(index);
        }

        // Remove from context tags index
        if (entry.ctx && typeof entry.ctx === 'object') {
            for (const [key, value] of Object.entries(entry.ctx)) {
                if (value === undefined || value === null) continue;
                const strValue = String(value);

                if (this.contextIndex.has(key)) {
                    const valueMap = this.contextIndex.get(key);
                    if (valueMap.has(strValue)) {
                        valueMap.get(strValue).delete(index);

                        // Update stats
                        const stats = this.contextStats.get(key);
                        if (stats) {
                            stats.totalEntries--;
                            // Check if value is now empty
                            if (valueMap.get(strValue).size === 0) {
                                valueMap.delete(strValue);
                                stats.uniqueValues--;
                            }
                        }
                    }
                }
            }
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
     * Get a single entry by ID (O(1) lookup using index)
     */
    getById(entryId) {
        const index = this.idIndex.get(entryId);
        if (index === undefined) return null;
        return this.buffer[index] || null;
    }

    /**
     * Get multiple entries by IDs (O(n) where n = ids.length)
     */
    getByIds(entryIds) {
        const result = [];
        for (const id of entryIds) {
            const entry = this.getById(id);
            if (entry) {
                result.push(entry);
            }
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
     * Get list of all correlation IDs with counts
     * Returns top N correlations by entry count for filtering UI
     */
    getCorrelations(limit = 100) {
        const correlations = [];
        for (const [correlationId, indexes] of this.correlationIndex) {
            correlations.push({ id: correlationId, count: indexes.size });
        }
        // Sort by count descending, return top N
        correlations.sort((a, b) => b.count - a.count);
        return correlations.slice(0, limit);
    }

    /**
     * Get all entries with a specific correlation ID
     */
    getByCorrelation(correlationId) {
        const indexes = this.correlationIndex.get(correlationId);
        if (!indexes || indexes.size === 0) {
            return [];
        }
        const entries = [];
        for (const index of indexes) {
            if (this.buffer[index]) {
                entries.push(this.buffer[index]);
            }
        }
        // Sort by timestamp
        entries.sort((a, b) => a.timestamp - b.timestamp);
        return entries;
    }

    /**
     * Get list of all context keys with statistics
     * @returns {Object} { keys: string[], summary: { [key]: { uniqueValues, totalEntries } } }
     */
    getContextKeys() {
        const keys = Array.from(this.contextIndex.keys());
        const summary = {};

        for (const key of keys) {
            const stats = this.contextStats.get(key);
            const valueMap = this.contextIndex.get(key);

            // Recalculate actual counts (in case of index drift)
            let actualTotal = 0;
            for (const indexSet of valueMap.values()) {
                actualTotal += indexSet.size;
            }

            summary[key] = {
                uniqueValues: valueMap.size,
                totalEntries: actualTotal,
                lastSeen: stats?.lastSeen || null
            };
        }

        return { keys, summary };
    }

    /**
     * Get all values for a specific context key
     * @param {string} key - Context key name
     * @param {Object} options - Query options
     * @param {number} options.limit - Max values to return (default 100)
     * @param {number} options.offset - Skip first N values (default 0)
     * @param {string} options.sort - Sort by 'count' or 'recent' (default 'count')
     * @param {string} options.search - Filter values containing this string
     * @returns {Object} { key, values: [{ value, count, lastSeen }], total }
     */
    getContextValues(key, options = {}) {
        const { limit = 100, offset = 0, sort = 'count', search = '' } = options;

        const valueMap = this.contextIndex.get(key);
        if (!valueMap) {
            return { key, values: [], total: 0 };
        }

        // Build values array with counts
        let values = [];
        for (const [value, indexSet] of valueMap) {
            // Apply search filter
            if (search && !value.toLowerCase().includes(search.toLowerCase())) {
                continue;
            }

            // Get last seen timestamp from most recent entry
            let lastSeen = null;
            let maxTimestamp = 0;
            for (const index of indexSet) {
                const entry = this.buffer[index];
                if (entry && entry.timestamp) {
                    const ts = entry.timestamp.getTime ? entry.timestamp.getTime() : new Date(entry.timestamp).getTime();
                    if (ts > maxTimestamp) {
                        maxTimestamp = ts;
                        lastSeen = entry.timestamp;
                    }
                }
            }

            values.push({
                value,
                count: indexSet.size,
                lastSeen
            });
        }

        // Sort
        if (sort === 'recent') {
            values.sort((a, b) => {
                const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
                const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
                return bTime - aTime;
            });
        } else {
            // Default: sort by count descending
            values.sort((a, b) => b.count - a.count);
        }

        const total = values.length;

        // Apply pagination
        values = values.slice(offset, offset + limit);

        return { key, values, total };
    }

    /**
     * Get entries by context key-value pair
     * @param {string} key - Context key
     * @param {string} value - Context value
     * @returns {LogEntry[]} Matching entries sorted by timestamp
     */
    getByContext(key, value) {
        const valueMap = this.contextIndex.get(key);
        if (!valueMap) {
            return [];
        }

        const indexes = valueMap.get(String(value));
        if (!indexes || indexes.size === 0) {
            return [];
        }

        const entries = [];
        for (const index of indexes) {
            if (this.buffer[index]) {
                entries.push(this.buffer[index]);
            }
        }

        // Sort by timestamp
        entries.sort((a, b) => a.timestamp - b.timestamp);
        return entries;
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
        this.correlationIndex.clear();
        this.contextIndex.clear();
        this.contextStats.clear();
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
        this.correlationIndex.clear();
        this.contextIndex.clear();
        this.contextStats.clear();

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
            levels: this.getLevelCounts(),
            contexts: this.getContextKeys()
        };
    }
}

/**
 * Ring buffer for fixed-size history
 */
class RingBuffer {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.buffer = new Array(maxSize);
        this.head = 0;
        this.size = 0;
    }

    push(item) {
        this.buffer[this.head] = item;
        this.head = (this.head + 1) % this.maxSize;
        if (this.size < this.maxSize) {
            this.size++;
        }
    }

    getAll() {
        if (this.size === 0) return [];
        const result = [];
        const start = this.size < this.maxSize ? 0 : this.head;
        for (let i = 0; i < this.size; i++) {
            const index = (start + i) % this.maxSize;
            result.push(this.buffer[index]);
        }
        return result;
    }

    clear() {
        this.buffer = new Array(this.maxSize);
        this.head = 0;
        this.size = 0;
    }

    getSize() {
        return this.size;
    }
}

/**
 * Watch values store with tiered aggregation
 *
 * Tiers:
 * - raw: Last 100 points (for zoomed-in views)
 * - secondly: 1 hour of 1-second averages (3600 points)
 * - minutely: 24 hours of 1-minute averages (1440 points)
 * - hourly: 7 days of 1-hour averages (168 points)
 *
 * Memory budget for 100 watches: ~53 MB
 */
class WatchStore {
    constructor() {
        // Current values
        this.values = new Map();   // name -> { value, timestamp, session, watchType, group }

        // Tiered history with automatic rollup
        this.raw = new Map();      // name -> RingBuffer(100) - last 100 raw points
        this.secondly = new Map(); // name -> RingBuffer(3600) - 1 hour of 1s averages
        this.minutely = new Map(); // name -> RingBuffer(1440) - 24h of 1m averages
        this.hourly = new Map();   // name -> RingBuffer(168) - 7 days of 1h averages

        // Aggregation state per watch
        this.aggregators = new Map(); // name -> { secondBucket, minuteBucket, hourBucket, currentSecond, currentMinute, currentHour }

        // Non-numeric value counters
        this.nonNumericCounts = new Map(); // name -> Map<value, count>

        // Tier sizes
        this.RAW_SIZE = 6000;       // 30 sec at 200/sec (~6MB per 100 watches)
        this.SECONDLY_SIZE = 3600;  // 1 hour of 1s averages
        this.MINUTELY_SIZE = 1440;  // 24 hours of 1m averages
        this.HOURLY_SIZE = 168;     // 7 days of 1h averages
    }

    /**
     * Get or create raw ring buffer for a watch
     */
    _getRaw(name) {
        if (!this.raw.has(name)) {
            this.raw.set(name, new RingBuffer(this.RAW_SIZE));
        }
        return this.raw.get(name);
    }

    /**
     * Get or create secondly ring buffer for a watch
     */
    _getSecondly(name) {
        if (!this.secondly.has(name)) {
            this.secondly.set(name, new RingBuffer(this.SECONDLY_SIZE));
        }
        return this.secondly.get(name);
    }

    /**
     * Get or create minutely ring buffer for a watch
     */
    _getMinutely(name) {
        if (!this.minutely.has(name)) {
            this.minutely.set(name, new RingBuffer(this.MINUTELY_SIZE));
        }
        return this.minutely.get(name);
    }

    /**
     * Get or create hourly ring buffer for a watch
     */
    _getHourly(name) {
        if (!this.hourly.has(name)) {
            this.hourly.set(name, new RingBuffer(this.HOURLY_SIZE));
        }
        return this.hourly.get(name);
    }

    /**
     * Get or create aggregator for a watch
     */
    _getAggregator(name) {
        if (!this.aggregators.has(name)) {
            this.aggregators.set(name, {
                currentSecond: null,
                currentMinute: null,
                currentHour: null,
                secondBucket: { sum: 0, min: Infinity, max: -Infinity, count: 0 },
                minuteBucket: { sum: 0, min: Infinity, max: -Infinity, count: 0 },
                hourBucket: { sum: 0, min: Infinity, max: -Infinity, count: 0 }
            });
        }
        return this.aggregators.get(name);
    }

    /**
     * Update a watch value
     */
    set(name, value, timestamp, session = null, watchType = null, group = '') {
        const entry = { value, timestamp, session, watchType, group };
        this.values.set(name, entry);

        const numValue = parseFloat(value);
        const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);

        if (isNaN(numValue)) {
            // Non-numeric: count occurrences
            this._setNonNumeric(name, value, ts);
        } else {
            // Add to raw ring buffer
            this._getRaw(name).push({ value: numValue, timestamp: ts });

            // Aggregate into time buckets
            this._aggregateToSecond(name, numValue, ts);
        }

        return entry;
    }

    /**
     * Track non-numeric values by counting occurrences
     */
    _setNonNumeric(name, value, timestamp) {
        if (!this.nonNumericCounts.has(name)) {
            this.nonNumericCounts.set(name, new Map());
        }
        const counts = this.nonNumericCounts.get(name);
        const strValue = String(value);
        counts.set(strValue, (counts.get(strValue) || 0) + 1);

        // Also track as count in raw (for charting)
        const currentCount = counts.get(strValue);
        this._getRaw(name).push({ value: currentCount, timestamp, label: strValue });
    }

    /**
     * Aggregate value into second bucket, rolling up as needed
     */
    _aggregateToSecond(name, value, timestamp) {
        const secondKey = Math.floor(timestamp.getTime() / 1000);
        const agg = this._getAggregator(name);

        // Check if we moved to a new second
        if (agg.currentSecond !== null && agg.currentSecond !== secondKey) {
            // Flush previous second bucket
            if (agg.secondBucket.count > 0) {
                const secondData = {
                    timestamp: new Date(agg.currentSecond * 1000),
                    avg: agg.secondBucket.sum / agg.secondBucket.count,
                    min: agg.secondBucket.min,
                    max: agg.secondBucket.max,
                    count: agg.secondBucket.count
                };
                this._getSecondly(name).push(secondData);

                // Roll up to minute
                this._aggregateToMinute(name, secondData, agg.currentSecond);
            }
            // Reset second bucket
            agg.secondBucket = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
        }

        agg.currentSecond = secondKey;

        // Accumulate into current second bucket
        agg.secondBucket.sum += value;
        agg.secondBucket.min = Math.min(agg.secondBucket.min, value);
        agg.secondBucket.max = Math.max(agg.secondBucket.max, value);
        agg.secondBucket.count++;
    }

    /**
     * Aggregate second data into minute bucket
     */
    _aggregateToMinute(name, secondData, secondKey) {
        const minuteKey = Math.floor(secondKey / 60);
        const agg = this._getAggregator(name);

        // Check if we moved to a new minute
        if (agg.currentMinute !== null && agg.currentMinute !== minuteKey) {
            // Flush previous minute bucket
            if (agg.minuteBucket.count > 0) {
                const minuteData = {
                    timestamp: new Date(agg.currentMinute * 60 * 1000),
                    avg: agg.minuteBucket.sum / agg.minuteBucket.count,
                    min: agg.minuteBucket.min,
                    max: agg.minuteBucket.max,
                    count: agg.minuteBucket.count
                };
                this._getMinutely(name).push(minuteData);

                // Roll up to hour
                this._aggregateToHour(name, minuteData, agg.currentMinute);
            }
            // Reset minute bucket
            agg.minuteBucket = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
        }

        agg.currentMinute = minuteKey;

        // Accumulate second data into minute bucket
        agg.minuteBucket.sum += secondData.avg * secondData.count;
        agg.minuteBucket.min = Math.min(agg.minuteBucket.min, secondData.min);
        agg.minuteBucket.max = Math.max(agg.minuteBucket.max, secondData.max);
        agg.minuteBucket.count += secondData.count;
    }

    /**
     * Aggregate minute data into hour bucket
     */
    _aggregateToHour(name, minuteData, minuteKey) {
        const hourKey = Math.floor(minuteKey / 60);
        const agg = this._getAggregator(name);

        // Check if we moved to a new hour
        if (agg.currentHour !== null && agg.currentHour !== hourKey) {
            // Flush previous hour bucket
            if (agg.hourBucket.count > 0) {
                const hourData = {
                    timestamp: new Date(agg.currentHour * 60 * 60 * 1000),
                    avg: agg.hourBucket.sum / agg.hourBucket.count,
                    min: agg.hourBucket.min,
                    max: agg.hourBucket.max,
                    count: agg.hourBucket.count
                };
                this._getHourly(name).push(hourData);
            }
            // Reset hour bucket
            agg.hourBucket = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
        }

        agg.currentHour = hourKey;

        // Accumulate minute data into hour bucket
        agg.hourBucket.sum += minuteData.avg * minuteData.count;
        agg.hourBucket.min = Math.min(agg.hourBucket.min, minuteData.min);
        agg.hourBucket.max = Math.max(agg.hourBucket.max, minuteData.max);
        agg.hourBucket.count += minuteData.count;
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
     * Get history for a watch with resolution selection
     * @param {string} name - Watch name
     * @param {Object} options - Query options
     * @param {number} options.from - Start timestamp (ms)
     * @param {number} options.to - End timestamp (ms)
     * @param {string} options.resolution - 'raw', '1s', '1m', '1h', or 'auto'
     */
    getHistory(name, options = {}) {
        const { from, to, resolution = 'auto' } = options;

        // Determine resolution
        // Auto-resolution: <30s→raw, <1h→1s, <24h→1m, >24h→1h
        let tier = resolution;
        if (resolution === 'auto') {
            const range = (to || Date.now()) - (from || 0);
            if (range < 30 * 1000) {
                tier = 'raw';
            } else if (range < 60 * 60 * 1000) {
                tier = '1s';
            } else if (range < 24 * 60 * 60 * 1000) {
                tier = '1m';
            } else {
                tier = '1h';
            }
        }

        // Get data from appropriate tier
        let data;
        switch (tier) {
            case 'raw':
                data = this.raw.has(name) ? this._getRaw(name).getAll() : [];
                break;
            case '1s':
                data = this.secondly.has(name) ? this._getSecondly(name).getAll() : [];
                break;
            case '1m':
                data = this.minutely.has(name) ? this._getMinutely(name).getAll() : [];
                break;
            case '1h':
                data = this.hourly.has(name) ? this._getHourly(name).getAll() : [];
                break;
            default:
                data = this.raw.has(name) ? this._getRaw(name).getAll() : [];
        }

        // Filter by time range if specified
        if (from || to) {
            const fromMs = from || 0;
            const toMs = to || Date.now();
            data = data.filter(point => {
                const ts = point.timestamp instanceof Date ? point.timestamp.getTime() : new Date(point.timestamp).getTime();
                return ts >= fromMs && ts <= toMs;
            });
        }

        return {
            data,
            resolution: tier,
            pointCount: data.length
        };
    }

    /**
     * Get all tiers' stats for a watch (for debugging)
     */
    getTierStats(name) {
        return {
            raw: this.raw.has(name) ? this._getRaw(name).getSize() : 0,
            secondly: this.secondly.has(name) ? this._getSecondly(name).getSize() : 0,
            minutely: this.minutely.has(name) ? this._getMinutely(name).getSize() : 0,
            hourly: this.hourly.has(name) ? this._getHourly(name).getSize() : 0
        };
    }

    /**
     * Clear a specific watch
     */
    delete(name) {
        this.values.delete(name);
        this.raw.delete(name);
        this.secondly.delete(name);
        this.minutely.delete(name);
        this.hourly.delete(name);
        this.aggregators.delete(name);
        this.nonNumericCounts.delete(name);
    }

    /**
     * Clear all watches
     */
    clear() {
        this.values.clear();
        this.raw.clear();
        this.secondly.clear();
        this.minutely.clear();
        this.hourly.clear();
        this.aggregators.clear();
        this.nonNumericCounts.clear();
    }

    /**
     * Clear history only (keep current values)
     */
    clearHistory(name = null) {
        if (name) {
            // Clear history for specific watch
            if (this.raw.has(name)) this._getRaw(name).clear();
            if (this.secondly.has(name)) this._getSecondly(name).clear();
            if (this.minutely.has(name)) this._getMinutely(name).clear();
            if (this.hourly.has(name)) this._getHourly(name).clear();
            if (this.aggregators.has(name)) {
                const agg = this.aggregators.get(name);
                agg.currentSecond = null;
                agg.currentMinute = null;
                agg.currentHour = null;
                agg.secondBucket = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
                agg.minuteBucket = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
                agg.hourBucket = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
            }
        } else {
            // Clear all history
            for (const name of this.raw.keys()) {
                this.clearHistory(name);
            }
        }
    }

    /**
     * Get history statistics for monitoring memory usage
     */
    getHistoryStats() {
        let totalPoints = 0;
        const tiers = { raw: 0, secondly: 0, minutely: 0, hourly: 0 };
        const watches = {};

        for (const [name] of this.values) {
            const stats = this.getTierStats(name);
            watches[name] = stats;
            tiers.raw += stats.raw;
            tiers.secondly += stats.secondly;
            tiers.minutely += stats.minutely;
            tiers.hourly += stats.hourly;
            totalPoints += stats.raw + stats.secondly + stats.minutely + stats.hourly;
        }

        // Memory estimates:
        // raw: ~50 bytes per point (value, timestamp)
        // aggregated: ~80 bytes per point (avg, min, max, count, timestamp)
        const estimatedMemoryBytes =
            tiers.raw * 50 +
            (tiers.secondly + tiers.minutely + tiers.hourly) * 80;

        return {
            totalPoints,
            watchCount: this.values.size,
            tiers,
            watches,
            estimatedMemoryMB: estimatedMemoryBytes / (1024 * 1024)
        };
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

/**
 * Trace Aggregator for distributed tracing
 * Aggregates log entries into traces based on _traceId context tag
 * Builds span hierarchy from _spanId and _parentSpanId
 */
class TraceAggregator {
    constructor(maxTraces = 1000, traceTimeoutMs = 300000) {
        // Active traces (still receiving spans)
        // Map<traceId, TraceData>
        this.traces = new Map();

        // Completed trace summaries (for list view)
        // Ring buffer of recent traces
        this.completedTraces = [];
        this.maxTraces = maxTraces;

        // Timeout for considering a trace complete (5 min default)
        this.traceTimeoutMs = traceTimeoutMs;

        // Index: spanId -> traceId (for quick lookup)
        this.spanIndex = new Map();

        // Stats
        this.stats = {
            totalTracesProcessed: 0,
            totalSpansProcessed: 0,
            activeTraces: 0
        };
    }

    /**
     * Process a log entry and update trace data
     * @param {Object} entry - Log entry with ctx field
     * @returns {Object|null} Updated trace if this entry has trace context
     */
    processEntry(entry) {
        if (!entry.ctx) return null;

        const traceId = entry.ctx._traceId;
        if (!traceId) return null;

        const spanId = entry.ctx._spanId;
        const parentSpanId = entry.ctx._parentSpanId;
        const spanName = entry.ctx._spanName;
        const spanKind = entry.ctx._spanKind;
        const spanDuration = entry.ctx._spanDuration ? parseFloat(entry.ctx._spanDuration) : null;
        const spanStatus = entry.ctx._spanStatus;
        const spanStatusDesc = entry.ctx._spanStatusDesc;

        // Get or create trace
        let trace = this.traces.get(traceId);
        if (!trace) {
            trace = this._createTrace(traceId);
            this.traces.set(traceId, trace);
            this.stats.activeTraces++;
        }

        // Update trace metadata
        trace.lastUpdated = new Date();
        trace.entryCount++;

        // Track apps and sessions
        if (entry.appName) trace.apps.add(entry.appName);
        if (entry.sessionName) trace.sessions.add(entry.sessionName);

        // Update time bounds
        const entryTime = entry.timestamp ? new Date(entry.timestamp) : new Date();
        if (!trace.startTime || entryTime < trace.startTime) {
            trace.startTime = entryTime;
        }
        if (!trace.endTime || entryTime > trace.endTime) {
            trace.endTime = entryTime;
        }

        // Track error status
        if (entry.level >= 4 || spanStatus === 'Error') {
            trace.hasError = true;
            trace.errorCount++;
        }

        // Process span if we have spanId
        if (spanId) {
            this._processSpan(trace, {
                spanId,
                parentSpanId,
                spanName,
                spanKind,
                spanDuration,
                spanStatus,
                spanStatusDesc,
                entryId: entry.id,
                timestamp: entryTime,
                title: entry.title,
                level: entry.level,
                sessionName: entry.sessionName,
                appName: entry.appName
            });

            // Update span index
            this.spanIndex.set(spanId, traceId);
            this.stats.totalSpansProcessed++;
        }

        // Add entry reference
        trace.entryIds.push(entry.id);

        // Update root span name for display
        if (!parentSpanId && spanName) {
            trace.rootSpanName = spanName;
        }

        return trace;
    }

    /**
     * Create a new trace data structure
     */
    _createTrace(traceId) {
        this.stats.totalTracesProcessed++;
        return {
            traceId,
            rootSpanName: null,
            startTime: null,
            endTime: null,
            duration: null,  // Calculated on demand
            spans: new Map(),  // spanId -> SpanData
            rootSpans: [],     // Spans with no parent
            entryIds: [],      // All log entry IDs in this trace
            entryCount: 0,
            spanCount: 0,
            apps: new Set(),
            sessions: new Set(),
            hasError: false,
            errorCount: 0,
            lastUpdated: new Date(),
            completed: false
        };
    }

    /**
     * Process a span within a trace
     */
    _processSpan(trace, spanData) {
        const { spanId, parentSpanId, spanName, spanKind, spanDuration, spanStatus } = spanData;

        let span = trace.spans.get(spanId);
        if (!span) {
            span = {
                spanId,
                parentSpanId: parentSpanId || null,
                name: spanName || 'unknown',
                kind: spanKind || 'Internal',
                status: 'Unset',
                duration: null,
                startTime: spanData.timestamp,
                endTime: null,
                entryIds: [],
                children: [],
                attributes: {}
            };
            trace.spans.set(spanId, span);
            trace.spanCount++;

            // Track root spans
            if (!parentSpanId) {
                trace.rootSpans.push(spanId);
            }
        }

        // Update span with new data
        if (spanName) span.name = spanName;
        if (spanKind) span.kind = spanKind;
        if (spanStatus && spanStatus !== 'Unset') span.status = spanStatus;
        if (spanDuration !== null) {
            span.duration = spanDuration;
            span.endTime = new Date(span.startTime.getTime() + spanDuration);
        }

        // Add entry reference
        span.entryIds.push(spanData.entryId);

        // Build parent-child relationship
        if (parentSpanId) {
            let parentSpan = trace.spans.get(parentSpanId);
            if (!parentSpan) {
                // Create placeholder for parent
                parentSpan = {
                    spanId: parentSpanId,
                    parentSpanId: null,
                    name: 'unknown',
                    kind: 'Internal',
                    status: 'Unset',
                    duration: null,
                    startTime: null,
                    endTime: null,
                    entryIds: [],
                    children: [],
                    attributes: {}
                };
                trace.spans.set(parentSpanId, parentSpan);
            }

            // Add child reference if not already there
            if (!parentSpan.children.includes(spanId)) {
                parentSpan.children.push(spanId);
            }
        }

        return span;
    }

    /**
     * Get a trace by ID
     * @param {string} traceId
     * @returns {Object|null} Trace data or null if not found
     */
    getTrace(traceId) {
        // First check active traces
        const activeTrace = this.traces.get(traceId);
        if (activeTrace) {
            return this._formatTrace(activeTrace);
        }

        // Then check completed traces (already formatted)
        const completedTrace = this.completedTraces.find(t => t.traceId === traceId);
        if (completedTrace) {
            return completedTrace;
        }

        return null;
    }

    /**
     * Get a trace by span ID
     * @param {string} spanId
     * @returns {Object|null} Trace data or null if not found
     */
    getTraceBySpan(spanId) {
        const traceId = this.spanIndex.get(spanId);
        if (!traceId) return null;
        return this.getTrace(traceId);
    }

    /**
     * List all traces with optional filtering
     * @param {Object} options
     * @param {number} options.limit - Max traces to return
     * @param {number} options.offset - Skip first N traces
     * @param {string} options.status - Filter by status (ok, error, all)
     * @param {number} options.minDuration - Min duration in ms
     * @param {number} options.maxDuration - Max duration in ms
     * @param {string} options.search - Search in trace/span names
     * @param {string} options.sort - Sort by (recent, duration, spans)
     */
    listTraces(options = {}) {
        const {
            limit = 50,
            offset = 0,
            status = 'all',
            minDuration = null,
            maxDuration = null,
            search = '',
            sort = 'recent'
        } = options;

        // Combine active traces and completed traces
        // For completed traces, extract only summary fields (not spans array)
        const extractSummary = (t) => ({
            traceId: t.traceId,
            rootSpanName: t.rootSpanName,
            startTime: t.startTime,
            endTime: t.endTime,
            duration: t.duration,
            spanCount: t.spanCount,
            entryCount: t.entryCount,
            apps: t.apps,
            sessions: t.sessions,
            hasError: t.hasError,
            errorCount: t.errorCount,
            lastUpdated: t.lastUpdated
        });

        let traces = [
            ...Array.from(this.traces.values()).map(t => ({ ...this._formatTraceSummary(t), isActive: true })),
            ...this.completedTraces.map(t => ({ ...extractSummary(t), isActive: false }))
        ];

        // Filter by status
        if (status === 'error') {
            traces = traces.filter(t => t.hasError);
        } else if (status === 'ok') {
            traces = traces.filter(t => !t.hasError);
        }

        // Filter by duration
        if (minDuration !== null) {
            traces = traces.filter(t => t.duration >= minDuration);
        }
        if (maxDuration !== null) {
            traces = traces.filter(t => t.duration <= maxDuration);
        }

        // Filter by search
        if (search) {
            const searchLower = search.toLowerCase();
            traces = traces.filter(t =>
                (t.rootSpanName && t.rootSpanName.toLowerCase().includes(searchLower)) ||
                t.traceId.toLowerCase().includes(searchLower)
            );
        }

        // Sort
        switch (sort) {
            case 'duration':
                traces.sort((a, b) => (b.duration || 0) - (a.duration || 0));
                break;
            case 'spans':
                traces.sort((a, b) => b.spanCount - a.spanCount);
                break;
            case 'recent':
            default:
                traces.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
                break;
        }

        const total = traces.length;
        traces = traces.slice(offset, offset + limit);

        return {
            traces,
            total,
            offset,
            limit
        };
    }

    /**
     * Get span hierarchy for a trace (for waterfall view)
     * @param {string} traceId
     * @returns {Object} Hierarchical span tree
     */
    getSpanTree(traceId) {
        // First check active traces
        const activeTrace = this.traces.get(traceId);
        if (activeTrace) {
            return this._buildSpanTreeFromActiveTrace(activeTrace);
        }

        // Then check completed traces (already formatted with spans as array)
        const completedTrace = this.completedTraces.find(t => t.traceId === traceId);
        if (completedTrace) {
            return this._buildSpanTreeFromCompletedTrace(completedTrace);
        }

        return null;
    }

    /**
     * Build span tree from active trace (spans is a Map)
     */
    _buildSpanTreeFromActiveTrace(trace) {
        // Build tree from root spans
        const buildTree = (spanId, depth = 0) => {
            const span = trace.spans.get(spanId);
            if (!span) return null;

            return {
                ...span,
                depth,
                children: span.children
                    .map(childId => buildTree(childId, depth + 1))
                    .filter(Boolean)
                    .sort((a, b) => {
                        // Sort children by start time
                        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
                        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
                        return aTime - bTime;
                    })
            };
        };

        const roots = trace.rootSpans
            .map(spanId => buildTree(spanId, 0))
            .filter(Boolean)
            .sort((a, b) => {
                const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
                const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
                return aTime - bTime;
            });

        return {
            traceId: trace.traceId,
            rootSpanName: trace.rootSpanName,
            startTime: trace.startTime,
            endTime: trace.endTime,
            duration: this._calculateDuration(trace),
            spanCount: trace.spanCount,
            hasError: trace.hasError,
            roots
        };
    }

    /**
     * Build span tree from completed trace (spans is an object keyed by spanId)
     */
    _buildSpanTreeFromCompletedTrace(trace) {
        // spans is already an object, convert to array for iteration
        const spansArray = Object.values(trace.spans);

        // Find root spans (no parent)
        const rootSpanIds = spansArray
            .filter(s => !s.parentSpanId)
            .map(s => s.spanId);

        // Build tree
        const buildTree = (spanId, depth = 0) => {
            const span = trace.spans[spanId];
            if (!span) return null;

            return {
                ...span,
                depth,
                children: (span.children || [])
                    .map(childId => buildTree(childId, depth + 1))
                    .filter(Boolean)
                    .sort((a, b) => {
                        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
                        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
                        return aTime - bTime;
                    })
            };
        };

        const roots = rootSpanIds
            .map(spanId => buildTree(spanId, 0))
            .filter(Boolean)
            .sort((a, b) => {
                const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
                const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
                return aTime - bTime;
            });

        return {
            traceId: trace.traceId,
            rootSpanName: trace.rootSpanName,
            startTime: trace.startTime,
            endTime: trace.endTime,
            duration: trace.duration,
            spanCount: trace.spanCount,
            hasError: trace.hasError,
            roots
        };
    }

    /**
     * Format trace for API response
     */
    _formatTrace(trace) {
        // Convert spans Map to object keyed by spanId (client expects Record<string, Span>)
        const spansObject = {};
        for (const [spanId, span] of trace.spans) {
            spansObject[spanId] = span;
        }

        return {
            traceId: trace.traceId,
            rootSpanName: trace.rootSpanName,
            startTime: trace.startTime,
            endTime: trace.endTime,
            duration: this._calculateDuration(trace),
            spans: spansObject,
            rootSpans: trace.rootSpans,
            entryIds: trace.entryIds,
            entryCount: trace.entryCount,
            spanCount: trace.spanCount,
            apps: Array.from(trace.apps),
            sessions: Array.from(trace.sessions),
            hasError: trace.hasError,
            errorCount: trace.errorCount,
            lastUpdated: trace.lastUpdated
        };
    }

    /**
     * Format trace summary for list view
     */
    _formatTraceSummary(trace) {
        return {
            traceId: trace.traceId,
            rootSpanName: trace.rootSpanName || trace.traceId.substring(0, 8),
            startTime: trace.startTime,
            duration: this._calculateDuration(trace),
            spanCount: trace.spanCount,
            entryCount: trace.entryCount,
            apps: Array.from(trace.apps),
            sessions: Array.from(trace.sessions),
            hasError: trace.hasError,
            errorCount: trace.errorCount,
            lastUpdated: trace.lastUpdated
        };
    }

    /**
     * Calculate trace duration
     */
    _calculateDuration(trace) {
        if (!trace.startTime || !trace.endTime) return null;
        return trace.endTime.getTime() - trace.startTime.getTime();
    }

    /**
     * Clean up old/stale traces
     */
    cleanup() {
        const now = Date.now();
        const toDelete = [];

        for (const [traceId, trace] of this.traces) {
            const age = now - trace.lastUpdated.getTime();
            if (age > this.traceTimeoutMs) {
                // Move to completed traces - store FULL trace data, not just summary
                this.completedTraces.push(this._formatTrace(trace));
                toDelete.push(traceId);

                // Trim completed traces if over limit
                if (this.completedTraces.length > this.maxTraces) {
                    this.completedTraces.shift();
                }
            }
        }

        // Delete from active traces
        for (const traceId of toDelete) {
            const trace = this.traces.get(traceId);
            if (trace) {
                // Clean up span index
                for (const spanId of trace.spans.keys()) {
                    this.spanIndex.delete(spanId);
                }
            }
            this.traces.delete(traceId);
            this.stats.activeTraces--;
        }

        return toDelete.length;
    }

    /**
     * Clear all traces
     */
    clear() {
        this.traces.clear();
        this.completedTraces = [];
        this.spanIndex.clear();
        this.stats.activeTraces = 0;
    }

    /**
     * Get aggregator stats
     */
    getStats() {
        return {
            ...this.stats,
            completedTraces: this.completedTraces.length,
            spanIndexSize: this.spanIndex.size
        };
    }
}

module.exports = {
    LogRingBuffer,
    WatchStore,
    MethodContextTracker,
    StreamStore,
    TraceAggregator
};
