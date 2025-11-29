/**
 * Seed Test Data for Query API Testing
 *
 * Sends log entries via TCP to the SmartInspect Web Viewer server.
 * This creates a variety of log entries for testing all filter types.
 *
 * Run with: node tests/seed-test-data.js
 */

const net = require('net');

// SmartInspect binary protocol constants
const PacketType = {
    LogHeader: 0,
    LogEntry: 1,
    Watch: 2,
    ControlCommand: 3,
    ProcessFlow: 4
};

const Level = {
    Debug: 0,
    Verbose: 1,
    Message: 2,
    Warning: 3,
    Error: 4,
    Fatal: 5,
    Control: 6
};

const LogEntryType = {
    Separator: 0,
    EnterMethod: 1,
    LeaveMethod: 2,
    ResetCallstack: 3,
    Message: 100,
    Warning: 101,
    Error: 102,
    InternalError: 103,
    Comment: 104,
    VariableValue: 105
};

class TestDataGenerator {
    constructor(port = 4229, host = 'localhost') {
        this.port = port;
        this.host = host;
        this.socket = null;
        this.appName = 'TestApp';
        this.hostName = 'test-server';
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.socket = net.createConnection({ port: this.port, host: this.host }, () => {
                console.log('Connected to SmartInspect server');
                resolve();
            });
            this.socket.on('error', reject);
        });
    }

    disconnect() {
        return new Promise((resolve) => {
            if (this.socket) {
                this.socket.end(() => {
                    console.log('Disconnected from server');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    // Create a SmartInspect binary packet
    createPacket(type, data) {
        // Packet format: [size:4][type:1][data:...]
        const packetSize = 1 + data.length; // type byte + data
        const buffer = Buffer.alloc(4 + packetSize);

        // Write size (little-endian)
        buffer.writeUInt32LE(packetSize, 0);
        // Write type
        buffer.writeUInt8(type, 4);
        // Write data
        data.copy(buffer, 5);

        return buffer;
    }

    // Create a log entry packet
    createLogEntry(sessionName, title, level, logEntryType = LogEntryType.Message) {
        // LogEntry format (simplified):
        // [logEntryType:4][level:1][sessionLen:4][session:...][titleLen:4][title:...][timestamp:8][threadId:4][processId:4][appNameLen:4][appName:...][hostNameLen:4][hostName:...]

        const sessionBuf = Buffer.from(sessionName, 'utf8');
        const titleBuf = Buffer.from(title, 'utf8');
        const appNameBuf = Buffer.from(this.appName, 'utf8');
        const hostNameBuf = Buffer.from(this.hostName, 'utf8');

        // Calculate total size
        const dataSize = 4 + 1 + 4 + sessionBuf.length + 4 + titleBuf.length + 8 + 4 + 4 + 4 + appNameBuf.length + 4 + hostNameBuf.length + 4 + 4; // +4 for color, +4 for viewerId

        const data = Buffer.alloc(dataSize);
        let offset = 0;

        // LogEntryType (4 bytes)
        data.writeUInt32LE(logEntryType, offset);
        offset += 4;

        // Level (1 byte)
        data.writeUInt8(level, offset);
        offset += 1;

        // Session name
        data.writeUInt32LE(sessionBuf.length, offset);
        offset += 4;
        sessionBuf.copy(data, offset);
        offset += sessionBuf.length;

        // Title
        data.writeUInt32LE(titleBuf.length, offset);
        offset += 4;
        titleBuf.copy(data, offset);
        offset += titleBuf.length;

        // Timestamp (milliseconds since epoch)
        const now = BigInt(Date.now());
        data.writeBigUInt64LE(now, offset);
        offset += 8;

        // Thread ID
        data.writeUInt32LE(1, offset);
        offset += 4;

        // Process ID
        data.writeUInt32LE(process.pid, offset);
        offset += 4;

        // App name
        data.writeUInt32LE(appNameBuf.length, offset);
        offset += 4;
        appNameBuf.copy(data, offset);
        offset += appNameBuf.length;

        // Host name
        data.writeUInt32LE(hostNameBuf.length, offset);
        offset += 4;
        hostNameBuf.copy(data, offset);
        offset += hostNameBuf.length;

        // Color (4 bytes)
        data.writeUInt32LE(0, offset);
        offset += 4;

        // ViewerId (4 bytes)
        data.writeUInt32LE(0, offset);

        return this.createPacket(PacketType.LogEntry, data);
    }

    send(buffer) {
        return new Promise((resolve, reject) => {
            this.socket.write(buffer, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async sendLogEntry(sessionName, title, level, logEntryType) {
        const packet = this.createLogEntry(sessionName, title, level, logEntryType);
        await this.send(packet);
    }
}

async function seedData() {
    const generator = new TestDataGenerator();

    try {
        await generator.connect();
        console.log('Seeding test data...\n');

        // Define test sessions
        const sessions = ['Database', 'Auth', 'API', 'UserService', 'Cache', 'Background', 'Debug'];

        // Define test messages per level
        const messagesByLevel = {
            [Level.Debug]: [
                'Debug: Variable x = 42',
                'Debug: Entering function processRequest',
                'Debug: Loop iteration 5 of 10'
            ],
            [Level.Verbose]: [
                'Verbose: Request headers parsed',
                'Verbose: Connection pool size: 10',
                'Verbose: Cache hit for key user_123'
            ],
            [Level.Message]: [
                'Request received from client',
                'Processing user registration',
                'Starting background job',
                'Configuration loaded successfully',
                'Service initialized'
            ],
            [Level.Warning]: [
                'Warning: Connection pool running low',
                'Warning: Deprecated API called',
                'Warning: High memory usage detected',
                'Warning: Slow query execution (500ms)'
            ],
            [Level.Error]: [
                'Error: Failed to connect to database',
                'Error: Authentication failed for user',
                'Error: Timeout waiting for response',
                'Error: Invalid request format',
                'Error: Connection refused'
            ],
            [Level.Fatal]: [
                'Fatal: Out of memory',
                'Fatal: Database connection lost',
                'Fatal: Critical system failure'
            ]
        };

        let count = 0;

        // Send logs for each session and level
        for (const session of sessions) {
            for (const [level, messages] of Object.entries(messagesByLevel)) {
                for (const message of messages) {
                    const title = `[${session}] ${message}`;
                    await generator.sendLogEntry(session, title, parseInt(level));
                    count++;

                    // Small delay to avoid overwhelming the server
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
            }
        }

        // Add some specific patterns for testing
        const specialEntries = [
            { session: 'Database', title: 'SQL query: SELECT * FROM users WHERE id = 123', level: Level.Message },
            { session: 'Database', title: 'SQL query timeout after 30s', level: Level.Error },
            { session: 'Auth', title: 'JWT token validation failed: expired', level: Level.Error },
            { session: 'Auth', title: 'User login successful: admin@example.com', level: Level.Message },
            { session: 'API', title: 'Rate limit exceeded for IP 192.168.1.1', level: Level.Warning },
            { session: 'API', title: 'Endpoint /api/users called 1000 times', level: Level.Message },
            { session: 'UserService', title: 'User profile updated: user_456', level: Level.Message },
            { session: 'Cache', title: 'Redis connection established', level: Level.Message },
            { session: 'Cache', title: 'Cache miss for key session_789', level: Level.Verbose },
            { session: 'Background', title: 'Cleanup job started', level: Level.Message },
            { session: 'Background', title: 'Cleanup job completed: 150 items deleted', level: Level.Message }
        ];

        for (const entry of specialEntries) {
            await generator.sendLogEntry(entry.session, entry.title, entry.level);
            count++;
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        console.log(`\nSeeded ${count} log entries successfully!`);
        console.log('\nSessions created:');
        sessions.forEach(s => console.log(`  - ${s}`));

        console.log('\nLevels used:');
        console.log('  - Debug (0)');
        console.log('  - Verbose (1)');
        console.log('  - Message/Info (2)');
        console.log('  - Warning (3)');
        console.log('  - Error (4)');
        console.log('  - Fatal (5)');

        // Give server time to process
        await new Promise(resolve => setTimeout(resolve, 500));

        await generator.disconnect();

    } catch (err) {
        console.error('Error seeding data:', err.message);
        if (err.code === 'ECONNREFUSED') {
            console.error('\nMake sure the SmartInspect Web Viewer server is running:');
            console.error('  cd server && node src/index.js');
        }
        process.exit(1);
    }
}

seedData();
