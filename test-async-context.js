/**
 * Test script for async context tracking features
 * Sends logs with correlationId, operationName, and operationDepth
 * to demonstrate correlation highlighting and filtering in the viewer
 *
 * Format matches SmartInspect C# BinaryFormatter exactly
 */

const net = require('net');
const crypto = require('crypto');

const HOST = 'localhost';
const PORT = 4229;

// Packet types (from SmartInspect protocol)
const PacketType = {
    ControlCommand: 1,
    LogEntry: 4,
    Watch: 5,
    ProcessFlow: 6,
    LogHeader: 7,
    Stream: 8
};

// Log entry types
const LogEntryType = {
    Separator: 0,
    EnterMethod: 1,
    LeaveMethod: 2,
    Message: 100,
    Warning: 101,
    Error: 102,
    Debug: 107,
    Verbose: 108,
};

// Viewer IDs
const ViewerId = {
    Title: 0,
};

let client = null;
let connected = false;

// Client banner (same as SmartInspect C# TcpProtocol)
const CLIENT_BANNER = 'SmartInspect Node.js Test Client v1.0\n';

// Timestamp conversion constants (from BinaryFormatter.cs)
const TICKS_OFFSET = BigInt('621355968000000000'); // 0x89f7ff5f7b58000L
const MICROSECONDS_PER_DAY = BigInt('86400000000'); // 0x141dd76000L
const DAY_OFFSET = 25569; // 0x63e1

function connect() {
    return new Promise((resolve, reject) => {
        client = new net.Socket();
        let bannerReceived = false;
        let serverBanner = '';

        client.connect(PORT, HOST, () => {
            console.log(`TCP connected to ${HOST}:${PORT}`);
            // Don't mark as connected yet - wait for handshake
        });

        client.on('data', (data) => {
            if (!bannerReceived) {
                // Accumulate server banner until newline
                serverBanner += data.toString('ascii');
                if (serverBanner.includes('\n')) {
                    bannerReceived = true;
                    console.log(`Server banner: ${serverBanner.trim()}`);

                    // Send client banner
                    client.write(CLIENT_BANNER);
                    console.log(`Sent client banner: ${CLIENT_BANNER.trim()}`);

                    // Now we're connected and ready
                    connected = true;
                    resolve();
                }
            }
            // After handshake, data is ACK responses (2 bytes per packet)
        });

        client.on('error', (err) => {
            console.error('Connection error:', err.message);
            connected = false;
            reject(err);
        });

        client.on('close', () => {
            console.log('Connection closed');
            connected = false;
        });
    });
}

function generateCorrelationId() {
    return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Convert JavaScript Date to OLE Automation timestamp (SmartInspect format)
 */
function dateToTimestamp(date) {
    const ticks = BigInt(date.getTime()) * BigInt(10000) + TICKS_OFFSET;
    const microseconds = ticks / BigInt(10);
    const days = microseconds / MICROSECONDS_PER_DAY;
    const remainder = microseconds % MICROSECONDS_PER_DAY;
    const oleDate = Number(days) + DAY_OFFSET + Number(remainder) / 86400000000;
    return oleDate;
}

/**
 * Build a LogEntry packet matching SmartInspect C# BinaryFormatter format
 *
 * Header format (60 bytes):
 *   logEntryType(4), viewerId(4), appNameLen(4), sessionNameLen(4),
 *   titleLen(4), hostNameLen(4), correlationIdLen(4), operationNameLen(4),
 *   dataLen(4), processId(4), threadId(4), timestamp(8), color(4), operationDepth(4)
 *
 * Data section:
 *   appName, sessionName, title, hostName, correlationId, operationName, [data]
 */
function buildLogEntryPacket(options) {
    const {
        title = '',
        sessionName = 'Main',
        appName = 'AsyncTest',
        hostName = 'localhost',
        logEntryType = LogEntryType.Message,
        viewerId = ViewerId.Title,
        correlationId = '',
        operationName = '',
        operationDepth = 0,
        color = { r: 0, g: 0, b: 0, a: 0 },
    } = options;

    // Encode strings as UTF-8
    const appNameBytes = Buffer.from(appName, 'utf8');
    const sessionNameBytes = Buffer.from(sessionName, 'utf8');
    const titleBytes = Buffer.from(title, 'utf8');
    const hostNameBytes = Buffer.from(hostName, 'utf8');
    const correlationIdBytes = Buffer.from(correlationId, 'utf8');
    const operationNameBytes = Buffer.from(operationName, 'utf8');

    // Calculate sizes
    // Header: 11 int32 (44) + 1 double (8) + 2 int32 (8) = 60 bytes
    const headerSize = 60;
    const dataSize =
        appNameBytes.length +
        sessionNameBytes.length +
        titleBytes.length +
        hostNameBytes.length +
        correlationIdBytes.length +
        operationNameBytes.length;

    const packetDataSize = headerSize + dataSize;
    const totalSize = 6 + packetDataSize; // 6 = packet header (type + size)

    const buffer = Buffer.alloc(totalSize);
    let offset = 0;

    // Packet header
    buffer.writeInt16LE(PacketType.LogEntry, offset); offset += 2;
    buffer.writeInt32LE(packetDataSize, offset); offset += 4;

    // LogEntry header (56 bytes)
    buffer.writeInt32LE(logEntryType, offset); offset += 4;
    buffer.writeInt32LE(viewerId, offset); offset += 4;
    buffer.writeInt32LE(appNameBytes.length, offset); offset += 4;
    buffer.writeInt32LE(sessionNameBytes.length, offset); offset += 4;
    buffer.writeInt32LE(titleBytes.length, offset); offset += 4;
    buffer.writeInt32LE(hostNameBytes.length, offset); offset += 4;
    buffer.writeInt32LE(correlationIdBytes.length, offset); offset += 4;
    buffer.writeInt32LE(operationNameBytes.length, offset); offset += 4;
    buffer.writeInt32LE(0, offset); offset += 4; // dataLen (no binary data)
    buffer.writeInt32LE(process.pid, offset); offset += 4; // processId
    buffer.writeInt32LE(process.pid, offset); offset += 4; // threadId
    buffer.writeDoubleLE(dateToTimestamp(new Date()), offset); offset += 8; // timestamp

    // Color (RGBA as 32-bit int)
    const colorInt = color.r | (color.g << 8) | (color.b << 16) | (color.a << 24);
    buffer.writeUInt32LE(colorInt, offset); offset += 4;

    buffer.writeInt32LE(operationDepth, offset); offset += 4;

    // Data section - strings in order
    appNameBytes.copy(buffer, offset); offset += appNameBytes.length;
    sessionNameBytes.copy(buffer, offset); offset += sessionNameBytes.length;
    titleBytes.copy(buffer, offset); offset += titleBytes.length;
    hostNameBytes.copy(buffer, offset); offset += hostNameBytes.length;
    correlationIdBytes.copy(buffer, offset); offset += correlationIdBytes.length;
    operationNameBytes.copy(buffer, offset); offset += operationNameBytes.length;

    return buffer;
}

function sendPacket(packet) {
    if (connected && client) {
        client.write(packet);
    }
}

function log(title, options = {}) {
    const packet = buildLogEntryPacket({ title, ...options });
    sendPacket(packet);
}

// Simulate different async operations
async function simulateHttpRequest(requestId) {
    const correlationId = generateCorrelationId();
    const baseOpts = {
        correlationId,
        sessionName: 'HTTP',
        appName: 'WebAPI'
    };

    log(`[Request ${requestId}] Incoming GET /api/orders`, {
        ...baseOpts,
        operationName: 'HandleRequest',
        operationDepth: 0,
        logEntryType: LogEntryType.Message
    });

    await sleep(100);

    log(`[Request ${requestId}] Validating authentication`, {
        ...baseOpts,
        operationName: 'ValidateAuth',
        operationDepth: 1,
        logEntryType: LogEntryType.Debug
    });

    await sleep(50);

    log(`[Request ${requestId}] Querying database`, {
        ...baseOpts,
        operationName: 'QueryDB',
        operationDepth: 1,
        logEntryType: LogEntryType.Debug
    });

    await sleep(150);

    if (Math.random() > 0.8) {
        log(`[Request ${requestId}] Database timeout warning`, {
            ...baseOpts,
            operationName: 'QueryDB',
            operationDepth: 1,
            logEntryType: LogEntryType.Warning
        });
    }

    log(`[Request ${requestId}] Processing 15 orders`, {
        ...baseOpts,
        operationName: 'ProcessOrders',
        operationDepth: 1,
        logEntryType: LogEntryType.Message
    });

    await sleep(100);

    log(`[Request ${requestId}] Serializing response`, {
        ...baseOpts,
        operationName: 'Serialize',
        operationDepth: 1,
        logEntryType: LogEntryType.Debug
    });

    log(`[Request ${requestId}] Response sent: 200 OK`, {
        ...baseOpts,
        operationName: 'HandleRequest',
        operationDepth: 0,
        logEntryType: LogEntryType.Message
    });
}

async function simulateBackgroundJob(jobId) {
    const correlationId = generateCorrelationId();
    const baseOpts = {
        correlationId,
        sessionName: 'Jobs',
        appName: 'Worker'
    };

    log(`[Job ${jobId}] Starting email batch job`, {
        ...baseOpts,
        operationName: 'EmailBatch',
        operationDepth: 0,
        logEntryType: LogEntryType.Message
    });

    await sleep(200);

    for (let i = 1; i <= 3; i++) {
        log(`[Job ${jobId}] Sending email ${i}/3`, {
            ...baseOpts,
            operationName: 'SendEmail',
            operationDepth: 1,
            logEntryType: LogEntryType.Debug
        });
        await sleep(100);

        if (Math.random() > 0.9) {
            log(`[Job ${jobId}] Email ${i} delivery delayed`, {
                ...baseOpts,
                operationName: 'SendEmail',
                operationDepth: 1,
                logEntryType: LogEntryType.Warning
            });
        }
    }

    log(`[Job ${jobId}] Batch job completed`, {
        ...baseOpts,
        operationName: 'EmailBatch',
        operationDepth: 0,
        logEntryType: LogEntryType.Message
    });
}

async function simulateDbOperation(opId) {
    const correlationId = generateCorrelationId();
    const baseOpts = {
        correlationId,
        sessionName: 'Database',
        appName: 'DataService'
    };

    log(`[DB ${opId}] Begin transaction`, {
        ...baseOpts,
        operationName: 'Transaction',
        operationDepth: 0,
        logEntryType: LogEntryType.Message
    });

    await sleep(50);

    log(`[DB ${opId}] INSERT INTO orders VALUES (...)`, {
        ...baseOpts,
        operationName: 'Insert',
        operationDepth: 1,
        logEntryType: LogEntryType.Debug
    });

    await sleep(80);

    log(`[DB ${opId}] UPDATE inventory SET quantity = quantity - 1`, {
        ...baseOpts,
        operationName: 'Update',
        operationDepth: 1,
        logEntryType: LogEntryType.Debug
    });

    await sleep(60);

    if (Math.random() > 0.85) {
        log(`[DB ${opId}] Deadlock detected, retrying...`, {
            ...baseOpts,
            operationName: 'Transaction',
            operationDepth: 0,
            logEntryType: LogEntryType.Error
        });
        await sleep(100);
    }

    log(`[DB ${opId}] Commit transaction`, {
        ...baseOpts,
        operationName: 'Transaction',
        operationDepth: 0,
        logEntryType: LogEntryType.Message
    });
}

async function simulateError(errorId) {
    const correlationId = generateCorrelationId();
    const baseOpts = {
        correlationId,
        sessionName: 'Errors',
        appName: 'ErrorTest'
    };

    log(`[Error ${errorId}] Processing payment`, {
        ...baseOpts,
        operationName: 'ProcessPayment',
        operationDepth: 0,
        logEntryType: LogEntryType.Message
    });

    await sleep(100);

    log(`[Error ${errorId}] Connecting to payment gateway`, {
        ...baseOpts,
        operationName: 'ConnectGateway',
        operationDepth: 1,
        logEntryType: LogEntryType.Debug
    });

    await sleep(200);

    log(`[Error ${errorId}] Payment gateway timeout!`, {
        ...baseOpts,
        operationName: 'ConnectGateway',
        operationDepth: 1,
        logEntryType: LogEntryType.Error
    });

    log(`[Error ${errorId}] Payment failed - rolling back`, {
        ...baseOpts,
        operationName: 'ProcessPayment',
        operationDepth: 0,
        logEntryType: LogEntryType.Warning
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    try {
        await connect();

        console.log('\nStarting continuous log generation with async context...');
        console.log('Press Ctrl+C to stop\n');

        let requestId = 1;
        let jobId = 1;
        let dbOpId = 1;
        let errorId = 1;

        // Run multiple concurrent operations
        while (true) {
            const operations = [];

            // Random mix of operations
            const rand = Math.random();

            if (rand < 0.4) {
                operations.push(simulateHttpRequest(requestId++));
            } else if (rand < 0.6) {
                operations.push(simulateBackgroundJob(jobId++));
            } else if (rand < 0.85) {
                operations.push(simulateDbOperation(dbOpId++));
            } else {
                operations.push(simulateError(errorId++));
            }

            // Sometimes run multiple concurrent operations
            if (Math.random() > 0.5) {
                operations.push(simulateHttpRequest(requestId++));
            }
            if (Math.random() > 0.7) {
                operations.push(simulateDbOperation(dbOpId++));
            }

            await Promise.all(operations);

            // Small delay between batches
            await sleep(500 + Math.random() * 1000);
        }

    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    if (client) {
        client.destroy();
    }
    process.exit(0);
});

main();
