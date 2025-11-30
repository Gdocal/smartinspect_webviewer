/**
 * SmartInspect Web Viewer - Settings Database
 * SQLite-based persistence for user settings per room
 *
 * Settings are stored per (room, user) combination.
 * Default user is "default" for anonymous/no-auth mode.
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

/**
 * Settings database manager
 */
class SettingsDB {
    constructor(dbPath = null) {
        // Default to data directory next to server
        if (!dbPath) {
            dbPath = path.join(__dirname, '../data/smartinspect.db');
        }

        // Ensure data directory exists
        const dataDir = path.dirname(dbPath);
        const fs = require('fs');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');  // Better performance
        this._init();

        console.log(`[SettingsDB] Database initialized at ${dbPath}`);
    }

    /**
     * Initialize database schema
     */
    _init() {
        this.db.exec(`
            -- Users table (for optional authentication)
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT,
                salt TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                last_login INTEGER
            );

            -- Settings table (room + user -> key -> value)
            CREATE TABLE IF NOT EXISTS settings (
                room TEXT NOT NULL,
                user TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT,
                updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                PRIMARY KEY (room, user, key)
            );

            -- Create indexes for faster queries
            CREATE INDEX IF NOT EXISTS idx_settings_room ON settings(room);
            CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user);

            -- Layout presets table
            CREATE TABLE IF NOT EXISTS layout_presets (
                id TEXT PRIMARY KEY,
                room TEXT NOT NULL,
                user TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                is_default INTEGER DEFAULT 0,
                is_shared INTEGER DEFAULT 0,
                preset_data TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            );
            CREATE INDEX IF NOT EXISTS idx_presets_room ON layout_presets(room);
            CREATE INDEX IF NOT EXISTS idx_presets_user ON layout_presets(room, user);
            CREATE INDEX IF NOT EXISTS idx_presets_shared ON layout_presets(room, is_shared);

            -- Insert default user if not exists
            INSERT OR IGNORE INTO users (username, password_hash, salt)
            VALUES ('default', NULL, NULL);
        `);

        // Prepare commonly used statements
        this._stmts = {
            getSetting: this.db.prepare(`
                SELECT value FROM settings
                WHERE room = ? AND user = ? AND key = ?
            `),
            setSetting: this.db.prepare(`
                INSERT OR REPLACE INTO settings (room, user, key, value, updated_at)
                VALUES (?, ?, ?, ?, strftime('%s', 'now'))
            `),
            deleteSetting: this.db.prepare(`
                DELETE FROM settings
                WHERE room = ? AND user = ? AND key = ?
            `),
            getAllSettings: this.db.prepare(`
                SELECT key, value FROM settings
                WHERE room = ? AND user = ?
            `),
            deleteAllSettings: this.db.prepare(`
                DELETE FROM settings
                WHERE room = ? AND user = ?
            `),
            getUserByUsername: this.db.prepare(`
                SELECT username, password_hash, salt, created_at, last_login
                FROM users WHERE username = ?
            `),
            createUser: this.db.prepare(`
                INSERT INTO users (username, password_hash, salt)
                VALUES (?, ?, ?)
            `),
            updateLastLogin: this.db.prepare(`
                UPDATE users SET last_login = strftime('%s', 'now')
                WHERE username = ?
            `),
            listUsers: this.db.prepare(`
                SELECT username, created_at, last_login FROM users
                WHERE username != 'default'
            `)
        };
    }

    // ==================== Settings CRUD ====================

    /**
     * Get a single setting value
     * @param {string} room - Room ID
     * @param {string} user - User ID (default: 'default')
     * @param {string} key - Setting key
     * @returns {any} Parsed JSON value or null
     */
    getSetting(room, user, key) {
        const row = this._stmts.getSetting.get(room, user, key);
        if (row && row.value) {
            try {
                return JSON.parse(row.value);
            } catch (e) {
                return row.value;  // Return as string if not valid JSON
            }
        }
        return null;
    }

    /**
     * Set a single setting value
     * @param {string} room - Room ID
     * @param {string} user - User ID (default: 'default')
     * @param {string} key - Setting key
     * @param {any} value - Setting value (will be JSON-stringified)
     */
    setSetting(room, user, key, value) {
        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
        this._stmts.setSetting.run(room, user, key, jsonValue);
    }

    /**
     * Delete a single setting
     * @param {string} room - Room ID
     * @param {string} user - User ID
     * @param {string} key - Setting key
     */
    deleteSetting(room, user, key) {
        this._stmts.deleteSetting.run(room, user, key);
    }

    /**
     * Get all settings for a room/user combination
     * @param {string} room - Room ID
     * @param {string} user - User ID (default: 'default')
     * @returns {Object} All settings as key-value pairs
     */
    getAllSettings(room, user) {
        const rows = this._stmts.getAllSettings.all(room, user);
        const result = {};
        for (const row of rows) {
            try {
                result[row.key] = JSON.parse(row.value);
            } catch (e) {
                result[row.key] = row.value;
            }
        }
        return result;
    }

    /**
     * Set multiple settings at once
     * @param {string} room - Room ID
     * @param {string} user - User ID
     * @param {Object} settings - Key-value pairs to set
     */
    setMultipleSettings(room, user, settings) {
        const setMany = this.db.transaction((entries) => {
            for (const [key, value] of entries) {
                const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
                this._stmts.setSetting.run(room, user, key, jsonValue);
            }
        });
        setMany(Object.entries(settings));
    }

    /**
     * Delete all settings for a room/user combination
     * @param {string} room - Room ID
     * @param {string} user - User ID
     */
    deleteAllSettings(room, user) {
        this._stmts.deleteAllSettings.run(room, user);
    }

    /**
     * Copy settings from one room/user to another
     * @param {string} fromRoom - Source room
     * @param {string} fromUser - Source user
     * @param {string} toRoom - Destination room
     * @param {string} toUser - Destination user
     */
    copySettings(fromRoom, fromUser, toRoom, toUser) {
        const settings = this.getAllSettings(fromRoom, fromUser);
        this.setMultipleSettings(toRoom, toUser, settings);
    }

    // ==================== User Authentication ====================

    /**
     * Hash a password with salt
     * @param {string} password - Plain text password
     * @param {string} salt - Salt (or null to generate)
     * @returns {{ hash: string, salt: string }}
     */
    _hashPassword(password, salt = null) {
        if (!salt) {
            salt = crypto.randomBytes(16).toString('hex');
        }
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        return { hash, salt };
    }

    /**
     * Create a new user with password
     * @param {string} username - Username
     * @param {string} password - Plain text password
     * @returns {boolean} True if created successfully
     */
    createUser(username, password) {
        // Check if user exists
        const existing = this._stmts.getUserByUsername.get(username);
        if (existing) {
            return false;
        }

        const { hash, salt } = this._hashPassword(password);
        try {
            this._stmts.createUser.run(username, hash, salt);
            return true;
        } catch (e) {
            console.error('[SettingsDB] Failed to create user:', e.message);
            return false;
        }
    }

    /**
     * Validate user credentials
     * @param {string} username - Username
     * @param {string} password - Plain text password
     * @returns {boolean} True if valid
     */
    validateUser(username, password) {
        const user = this._stmts.getUserByUsername.get(username);
        if (!user || !user.password_hash || !user.salt) {
            return false;
        }

        const { hash } = this._hashPassword(password, user.salt);
        if (hash === user.password_hash) {
            // Update last login
            this._stmts.updateLastLogin.run(username);
            return true;
        }
        return false;
    }

    /**
     * Check if a user exists
     * @param {string} username - Username
     * @returns {boolean}
     */
    userExists(username) {
        const user = this._stmts.getUserByUsername.get(username);
        return !!user;
    }

    /**
     * Get user info (without password)
     * @param {string} username - Username
     * @returns {Object|null}
     */
    getUser(username) {
        const user = this._stmts.getUserByUsername.get(username);
        if (user) {
            return {
                username: user.username,
                createdAt: new Date(user.created_at * 1000),
                lastLogin: user.last_login ? new Date(user.last_login * 1000) : null
            };
        }
        return null;
    }

    /**
     * List all users (excluding default)
     * @returns {Object[]}
     */
    listUsers() {
        const rows = this._stmts.listUsers.all();
        return rows.map(row => ({
            username: row.username,
            createdAt: new Date(row.created_at * 1000),
            lastLogin: row.last_login ? new Date(row.last_login * 1000) : null
        }));
    }

    /**
     * Change user password
     * @param {string} username - Username
     * @param {string} newPassword - New plain text password
     * @returns {boolean}
     */
    changePassword(username, newPassword) {
        const { hash, salt } = this._hashPassword(newPassword);
        const stmt = this.db.prepare(`
            UPDATE users SET password_hash = ?, salt = ?
            WHERE username = ?
        `);
        const result = stmt.run(hash, salt, username);
        return result.changes > 0;
    }

    /**
     * Delete a user and their settings
     * @param {string} username - Username
     * @returns {boolean}
     */
    deleteUser(username) {
        if (username === 'default') {
            return false;  // Cannot delete default user
        }

        const deleteSettings = this.db.prepare(`
            DELETE FROM settings WHERE user = ?
        `);
        const deleteUser = this.db.prepare(`
            DELETE FROM users WHERE username = ?
        `);

        const transaction = this.db.transaction(() => {
            deleteSettings.run(username);
            return deleteUser.run(username);
        });

        const result = transaction();
        return result.changes > 0;
    }

    // ==================== Layout Presets ====================

    /**
     * List presets for user (own + shared in room)
     * @param {string} room - Room ID
     * @param {string} user - User ID
     * @returns {Object[]} Array of preset summaries
     */
    listPresets(room, user) {
        const stmt = this.db.prepare(`
            SELECT id, name, user as createdBy, is_default as isDefault,
                   is_shared as isShared, created_at as createdAt, description
            FROM layout_presets
            WHERE room = ? AND (user = ? OR is_shared = 1)
            ORDER BY is_default DESC, updated_at DESC
        `);
        return stmt.all(room, user).map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            createdBy: row.createdBy,
            isDefault: !!row.isDefault,
            isShared: !!row.isShared,
            createdAt: new Date(row.createdAt * 1000).toISOString()
        }));
    }

    /**
     * Get a specific preset by ID
     * @param {string} room - Room ID
     * @param {string} user - User ID (for access control)
     * @param {string} id - Preset ID
     * @returns {Object|null} Preset data or null
     */
    getPreset(room, user, id) {
        const stmt = this.db.prepare(`
            SELECT * FROM layout_presets
            WHERE room = ? AND id = ? AND (user = ? OR is_shared = 1)
        `);
        const row = stmt.get(room, id, user);
        if (!row) return null;

        try {
            const presetData = JSON.parse(row.preset_data);
            return {
                ...presetData,
                id: row.id,
                name: row.name,
                description: row.description,
                createdBy: row.user,
                isDefault: !!row.is_default,
                isShared: !!row.is_shared,
                createdAt: new Date(row.created_at * 1000).toISOString(),
                updatedAt: new Date(row.updated_at * 1000).toISOString()
            };
        } catch (e) {
            console.error('[SettingsDB] Failed to parse preset data:', e.message);
            return null;
        }
    }

    /**
     * Create a new preset
     * @param {string} room - Room ID
     * @param {string} user - User ID (owner)
     * @param {Object} presetData - Preset configuration
     * @returns {Object} Created preset
     */
    createPreset(room, user, presetData) {
        const id = crypto.randomUUID();
        const now = Math.floor(Date.now() / 1000);

        const stmt = this.db.prepare(`
            INSERT INTO layout_presets
            (id, room, user, name, description, is_shared, preset_data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const fullPreset = {
            layout: presetData.layout || {},
            views: presetData.views || [],
            globalHighlightRules: presetData.globalHighlightRules || [],
            activeViewId: presetData.activeViewId || null,
            maxDisplayEntries: presetData.maxDisplayEntries || 10000,
            theme: presetData.theme || 'dark'
        };

        stmt.run(
            id, room, user,
            presetData.name,
            presetData.description || null,
            presetData.isShared ? 1 : 0,
            JSON.stringify(fullPreset),
            now, now
        );

        return {
            id,
            name: presetData.name,
            description: presetData.description || null,
            createdBy: user,
            isDefault: false,
            isShared: !!presetData.isShared,
            createdAt: new Date(now * 1000).toISOString(),
            updatedAt: new Date(now * 1000).toISOString(),
            ...fullPreset
        };
    }

    /**
     * Update a preset (only owner can update)
     * @param {string} room - Room ID
     * @param {string} user - User ID (must be owner)
     * @param {string} id - Preset ID
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated preset or null if not found/not owner
     */
    updatePreset(room, user, id, updates) {
        // First check ownership
        const check = this.db.prepare(`
            SELECT * FROM layout_presets WHERE id = ? AND room = ? AND user = ?
        `);
        const existing = check.get(id, room, user);
        if (!existing) return null;

        const now = Math.floor(Date.now() / 1000);
        let existingData = {};
        try {
            existingData = JSON.parse(existing.preset_data);
        } catch (e) {}

        const updatedData = {
            layout: updates.layout || existingData.layout || {},
            views: updates.views || existingData.views || [],
            globalHighlightRules: updates.globalHighlightRules || existingData.globalHighlightRules || [],
            activeViewId: updates.activeViewId !== undefined ? updates.activeViewId : existingData.activeViewId,
            maxDisplayEntries: updates.maxDisplayEntries || existingData.maxDisplayEntries || 10000,
            theme: updates.theme || existingData.theme || 'dark'
        };

        const stmt = this.db.prepare(`
            UPDATE layout_presets
            SET name = ?, description = ?, is_shared = ?, preset_data = ?, updated_at = ?
            WHERE id = ? AND room = ? AND user = ?
        `);

        stmt.run(
            updates.name || existing.name,
            updates.description !== undefined ? updates.description : existing.description,
            updates.isShared !== undefined ? (updates.isShared ? 1 : 0) : existing.is_shared,
            JSON.stringify(updatedData),
            now,
            id, room, user
        );

        return {
            id,
            name: updates.name || existing.name,
            description: updates.description !== undefined ? updates.description : existing.description,
            createdBy: user,
            isDefault: !!existing.is_default,
            isShared: updates.isShared !== undefined ? !!updates.isShared : !!existing.is_shared,
            createdAt: new Date(existing.created_at * 1000).toISOString(),
            updatedAt: new Date(now * 1000).toISOString(),
            ...updatedData
        };
    }

    /**
     * Delete a preset (only owner can delete)
     * @param {string} room - Room ID
     * @param {string} user - User ID (must be owner)
     * @param {string} id - Preset ID
     * @returns {boolean} True if deleted
     */
    deletePreset(room, user, id) {
        const stmt = this.db.prepare(`
            DELETE FROM layout_presets WHERE id = ? AND room = ? AND user = ?
        `);
        const result = stmt.run(id, room, user);
        return result.changes > 0;
    }

    /**
     * Copy a preset to own collection
     * @param {string} room - Room ID
     * @param {string} user - User ID (new owner)
     * @param {string} sourceId - Source preset ID
     * @param {string} newName - Name for the copy (optional)
     * @returns {Object|null} New preset or null if source not found
     */
    copyPreset(room, user, sourceId, newName) {
        const source = this.getPreset(room, user, sourceId);
        if (!source) return null;

        return this.createPreset(room, user, {
            name: newName || `${source.name} (Copy)`,
            description: source.description,
            isShared: false,
            layout: source.layout,
            views: source.views,
            globalHighlightRules: source.globalHighlightRules,
            activeViewId: source.activeViewId,
            maxDisplayEntries: source.maxDisplayEntries,
            theme: source.theme
        });
    }

    /**
     * Set a preset as the default (clears other defaults for this user)
     * @param {string} room - Room ID
     * @param {string} user - User ID
     * @param {string} id - Preset ID to make default
     * @returns {boolean} True if successful
     */
    setDefaultPreset(room, user, id) {
        const transaction = this.db.transaction(() => {
            // Clear existing defaults for this user in this room
            this.db.prepare(`
                UPDATE layout_presets SET is_default = 0
                WHERE room = ? AND user = ?
            `).run(room, user);

            // Set new default (must be owned by user)
            const result = this.db.prepare(`
                UPDATE layout_presets SET is_default = 1
                WHERE id = ? AND room = ? AND user = ?
            `).run(id, room, user);

            return result.changes > 0;
        });

        return transaction();
    }

    /**
     * Get the default preset for a user
     * @param {string} room - Room ID
     * @param {string} user - User ID
     * @returns {Object|null} Default preset or null
     */
    getDefaultPreset(room, user) {
        const stmt = this.db.prepare(`
            SELECT * FROM layout_presets
            WHERE room = ? AND user = ? AND is_default = 1
        `);
        const row = stmt.get(room, user);
        if (!row) return null;

        try {
            const presetData = JSON.parse(row.preset_data);
            return {
                id: row.id,
                name: row.name,
                description: row.description,
                createdBy: row.user,
                isDefault: true,
                isShared: !!row.is_shared,
                createdAt: new Date(row.created_at * 1000).toISOString(),
                updatedAt: new Date(row.updated_at * 1000).toISOString(),
                ...presetData
            };
        } catch (e) {
            return null;
        }
    }

    // ==================== Utility Methods ====================

    /**
     * Get database statistics
     * @returns {Object}
     */
    getStats() {
        const settingsCount = this.db.prepare('SELECT COUNT(*) as count FROM settings').get();
        const usersCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get();
        const roomsQuery = this.db.prepare('SELECT DISTINCT room FROM settings').all();
        const presetsCount = this.db.prepare('SELECT COUNT(*) as count FROM layout_presets').get();

        return {
            totalSettings: settingsCount.count,
            totalUsers: usersCount.count,
            totalPresets: presetsCount.count,
            rooms: roomsQuery.map(r => r.room)
        };
    }

    /**
     * Close the database connection
     */
    close() {
        this.db.close();
    }
}

module.exports = { SettingsDB };
