/**
 * SmartInspect Web Viewer - Named Pipe Logger
 * Reads from a named pipe (FIFO) and injects logs into SmartInspect
 *
 * Supports formats:
 *   - "LEVEL: message" (e.g., "INFO: Server started")
 *   - "[room] LEVEL: message" (e.g., "[myproject] ERROR: Failed")
 *   - "[room] message" (uses default level)
 *   - "message" (defaults to INFO level, uses env room)
 *   - JSON: {"level":"info","message":"text","app":"myapp","room":"myroom"}
 *
 * Room selection priority:
 *   1. JSON format room field
 *   2. [room] prefix in message
 *   3. SI_PIPE_ROOM environment variable
 *   4. 'default' room
 */

const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');

const { Level, LogEntryType } = require('./packet-parser');

class PipeLogger {
    constructor(options = {}) {
        this.pipePath = options.pipePath || '/tmp/smartinspect.pipe';
        this.defaultRoom = options.defaultRoom || 'default';
        this.roomManager = options.roomManager;
        this.onEntry = options.onEntry || (() => {});

        this.readStream = null;
        this.rl = null;
        this.running = false;
        this.retryTimeout = null;

        // Level parsing (case-insensitive)
        this.levelMap = {
            'DEBUG': Level.Debug,
            'VERBOSE': Level.Verbose,
            'INFO': Level.Message,
            'MESSAGE': Level.Message,
            'MSG': Level.Message,
            'WARNING': Level.Warning,
            'WARN': Level.Warning,
            'ERROR': Level.Error,
            'ERR': Level.Error,
            'FATAL': Level.Fatal
        };

        this.entryTypeMap = {
            [Level.Debug]: LogEntryType.Debug,
            [Level.Verbose]: LogEntryType.Verbose,
            [Level.Message]: LogEntryType.Message,
            [Level.Warning]: LogEntryType.Warning,
            [Level.Error]: LogEntryType.Error,
            [Level.Fatal]: LogEntryType.Fatal
        };
    }

    /**
     * Start listening on the named pipe
     */
    async start() {
        this.running = true;
        await this._ensurePipeExists();
        this._openPipe();
    }

    /**
     * Stop listening
     */
    stop() {
        this.running = false;
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
        if (this.readStream) {
            this.readStream.destroy();
            this.readStream = null;
        }
        console.log('[Pipe] Stopped');
    }

    /**
     * Ensure the named pipe exists
     */
    async _ensurePipeExists() {
        try {
            const stats = fs.statSync(this.pipePath);
            if (!stats.isFIFO()) {
                // File exists but is not a FIFO - remove and recreate
                fs.unlinkSync(this.pipePath);
                throw new Error('Not a FIFO');
            }
            console.log(`[Pipe] Using existing pipe: ${this.pipePath}`);
        } catch (err) {
            if (err.code === 'ENOENT' || err.message === 'Not a FIFO') {
                // Create the named pipe using mkfifo
                try {
                    execSync(`mkfifo "${this.pipePath}"`);
                    // Make it world-writable so any script can write to it
                    fs.chmodSync(this.pipePath, 0o666);
                    console.log(`[Pipe] Created named pipe: ${this.pipePath}`);
                } catch (mkfifoErr) {
                    console.error(`[Pipe] Failed to create pipe: ${mkfifoErr.message}`);
                    throw mkfifoErr;
                }
            } else {
                throw err;
            }
        }
    }

    /**
     * Open the pipe for reading
     */
    _openPipe() {
        if (!this.running) return;

        try {
            // Open with fs.open to get non-blocking behavior
            // Reading from FIFO blocks until a writer connects
            this.readStream = fs.createReadStream(this.pipePath, {
                flags: 'r',
                encoding: 'utf8',
                highWaterMark: 64 * 1024  // 64KB buffer
            });

            this.rl = readline.createInterface({
                input: this.readStream,
                crlfDelay: Infinity
            });

            this.rl.on('line', (line) => {
                this._processLine(line);
            });

            this.readStream.on('end', () => {
                // Pipe writer closed - reopen to listen for new writers
                this._cleanup();
                if (this.running) {
                    this.retryTimeout = setTimeout(() => this._openPipe(), 100);
                }
            });

            this.readStream.on('error', (err) => {
                console.error(`[Pipe] Error: ${err.message}`);
                this._cleanup();
                if (this.running) {
                    this.retryTimeout = setTimeout(() => this._openPipe(), 1000);
                }
            });

            console.log(`[Pipe] Listening on ${this.pipePath} (default room: ${this.defaultRoom})`);

        } catch (err) {
            console.error(`[Pipe] Failed to open pipe: ${err.message}`);
            if (this.running) {
                this.retryTimeout = setTimeout(() => this._openPipe(), 1000);
            }
        }
    }

    /**
     * Cleanup resources
     */
    _cleanup() {
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
        if (this.readStream) {
            this.readStream.destroy();
            this.readStream = null;
        }
    }

    /**
     * Process a line from the pipe
     */
    _processLine(line) {
        if (!line.trim()) return;

        let level = Level.Message;
        let message = line;
        let appName = 'shell';
        let sessionName = 'Main';
        let roomId = this.defaultRoom;

        // Try JSON format first
        if (line.startsWith('{')) {
            try {
                const json = JSON.parse(line);
                message = json.message || json.msg || line;
                appName = json.app || json.appName || 'shell';
                sessionName = json.session || json.sessionName || 'Main';
                roomId = json.room || this.defaultRoom;

                if (json.level) {
                    const levelKey = json.level.toUpperCase();
                    level = this.levelMap[levelKey] ?? Level.Message;
                }
            } catch (e) {
                // Not valid JSON, treat as text
            }
        } else {
            // Try "[room] LEVEL: message" or "[room] message" format
            const roomMatch = line.match(/^\[([^\]]+)\]\s*(.*)$/);
            if (roomMatch) {
                roomId = roomMatch[1];
                line = roomMatch[2];
            }

            // Try "LEVEL: message" format
            const levelMatch = line.match(/^(DEBUG|VERBOSE|INFO|MESSAGE|MSG|WARNING|WARN|ERROR|ERR|FATAL):\s*(.*)$/i);
            if (levelMatch) {
                const levelKey = levelMatch[1].toUpperCase();
                level = this.levelMap[levelKey] ?? Level.Message;
                message = levelMatch[2];
            } else {
                message = line;
            }
        }

        // Get/create room
        const room = this.roomManager.getOrCreate(roomId);

        // Create and store entry
        const entry = {
            type: 'logEntry',
            logEntryType: this.entryTypeMap[level],
            viewerId: 0,
            appName: appName,
            sessionName: sessionName,
            title: message.substring(0, 100),
            hostName: 'shell',
            processId: 0,
            threadId: 0,
            timestamp: new Date(),
            color: { r: 0, g: 0, b: 0, a: 0 },
            data: message.length > 100 ? Buffer.from(message) : null,
            level: level
        };

        const storedEntry = room.logBuffer.push(entry);
        room.touch();

        // Emit for broadcasting
        this.onEntry(roomId, storedEntry);
    }
}

module.exports = { PipeLogger };
