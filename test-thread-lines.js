/**
 * Test script for Thread Lines panel
 * Sends many log entries with various context combinations to test visualization
 */

const net = require('net');

// OLE Automation Date conversion
const DAY_OFFSET = 25569;
function dateToTimestamp(date) {
    return (date.getTime() / 86400000) + DAY_OFFSET;
}

// Color to int (unsigned)
function colorToInt(r, g, b, a = 255) {
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

// Build v3 LogEntry packet with context tags
function buildLogEntryV3(options) {
    const {
        logEntryType = 100,  // Message
        viewerId = 0,
        appName = 'thread-test',
        sessionName = 'Main',
        title = 'Test message',
        hostName = 'localhost',
        correlationId = '',
        operationName = '',
        operationDepth = 0,
        ctx = {},
        data = null,
        color = { r: 0, g: 0, b: 0, a: 255 },
        threadId = 1
    } = options;

    const appNameBuf = Buffer.from(appName, 'utf8');
    const sessionNameBuf = Buffer.from(sessionName, 'utf8');
    const titleBuf = Buffer.from(title, 'utf8');
    const hostNameBuf = Buffer.from(hostName, 'utf8');
    const correlationIdBuf = Buffer.from(correlationId, 'utf8');
    const operationNameBuf = Buffer.from(operationName, 'utf8');
    const ctxJson = Object.keys(ctx).length > 0 ? JSON.stringify(ctx) : '';
    const ctxBuf = Buffer.from(ctxJson, 'utf8');
    const dataBuf = data ? Buffer.from(data, 'utf8') : Buffer.alloc(0);

    const headerSize = 64;
    const totalDataSize = headerSize +
        appNameBuf.length + sessionNameBuf.length + titleBuf.length +
        hostNameBuf.length + correlationIdBuf.length + operationNameBuf.length +
        ctxBuf.length + dataBuf.length;

    const packet = Buffer.alloc(6 + totalDataSize);
    let offset = 0;

    packet.writeInt16LE(4, offset); offset += 2;
    packet.writeInt32LE(totalDataSize, offset); offset += 4;
    packet.writeInt32LE(logEntryType, offset); offset += 4;
    packet.writeInt32LE(viewerId, offset); offset += 4;
    packet.writeInt32LE(appNameBuf.length, offset); offset += 4;
    packet.writeInt32LE(sessionNameBuf.length, offset); offset += 4;
    packet.writeInt32LE(titleBuf.length, offset); offset += 4;
    packet.writeInt32LE(hostNameBuf.length, offset); offset += 4;
    packet.writeInt32LE(correlationIdBuf.length, offset); offset += 4;
    packet.writeInt32LE(operationNameBuf.length, offset); offset += 4;
    packet.writeInt32LE(ctxBuf.length, offset); offset += 4;
    packet.writeInt32LE(dataBuf.length, offset); offset += 4;
    packet.writeInt32LE(process.pid, offset); offset += 4;
    packet.writeInt32LE(threadId, offset); offset += 4;
    packet.writeDoubleLE(dateToTimestamp(new Date()), offset); offset += 8;
    packet.writeUInt32LE(colorToInt(color.r, color.g, color.b, color.a), offset); offset += 4;
    packet.writeInt32LE(operationDepth, offset); offset += 4;

    appNameBuf.copy(packet, offset); offset += appNameBuf.length;
    sessionNameBuf.copy(packet, offset); offset += sessionNameBuf.length;
    titleBuf.copy(packet, offset); offset += titleBuf.length;
    hostNameBuf.copy(packet, offset); offset += hostNameBuf.length;
    correlationIdBuf.copy(packet, offset); offset += correlationIdBuf.length;
    operationNameBuf.copy(packet, offset); offset += operationNameBuf.length;
    ctxBuf.copy(packet, offset); offset += ctxBuf.length;
    dataBuf.copy(packet, offset);

    return packet;
}

// Generate test data
const users = [];
for (let i = 1; i <= 100; i++) {
    users.push(`user${i.toString().padStart(3, '0')}`);
}

const requests = [];
for (let i = 1; i <= 50; i++) {
    requests.push(`req-${i.toString().padStart(4, '0')}`);
}

const threads = ['thread-1', 'thread-2', 'thread-3', 'thread-4', 'thread-5',
                 'thread-6', 'thread-7', 'thread-8', 'thread-9', 'thread-10'];

const operations = ['login', 'logout', 'query', 'update', 'delete', 'create',
                    'fetch', 'sync', 'notify', 'validate'];

const services = ['api', 'db', 'cache', 'auth', 'queue', 'worker'];

// Generate entries
const entries = [];

// Generate 500 log entries with various context combinations
for (let i = 0; i < 500; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const request = requests[Math.floor(Math.random() * requests.length)];
    const thread = threads[Math.floor(Math.random() * threads.length)];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    const service = services[Math.floor(Math.random() * services.length)];

    const ctx = {};

    // Add contexts with varying probability
    if (Math.random() > 0.2) ctx.user = user;
    if (Math.random() > 0.3) ctx.requestId = request;
    if (Math.random() > 0.4) ctx.thread = thread;
    if (Math.random() > 0.5) ctx.service = service;

    const titles = [
        `[${operation}] Starting operation`,
        `[${operation}] Processing request`,
        `[${operation}] Validating input`,
        `[${operation}] Executing query`,
        `[${operation}] Completed successfully`,
        `[${operation}] Error occurred`,
        `[${operation}] Retrying...`,
        `[${operation}] Cache hit`,
        `[${operation}] Cache miss`,
        `[${operation}] Timeout warning`
    ];

    entries.push({
        title: titles[Math.floor(Math.random() * titles.length)],
        ctx,
        sessionName: service,
        threadId: parseInt(thread.split('-')[1]) || 1
    });
}

// Connect and send
const client = new net.Socket();

client.connect(4229, 'localhost', () => {
    console.log('Connected to SmartInspect server');
    console.log(`Sending ${entries.length} test entries...`);

    let i = 0;
    let batchSize = 10;

    const sendBatch = () => {
        if (i >= entries.length) {
            console.log('All entries sent!');
            setTimeout(() => client.end(), 500);
            return;
        }

        // Send a batch
        for (let j = 0; j < batchSize && i < entries.length; j++, i++) {
            const e = entries[i];
            const packet = buildLogEntryV3(e);
            client.write(packet);
        }

        if (i % 100 === 0) {
            console.log(`Sent ${i}/${entries.length} entries...`);
        }

        // Small delay between batches
        setTimeout(sendBatch, 10);
    };

    sendBatch();
});

client.on('close', () => {
    console.log('Connection closed');
    process.exit(0);
});

client.on('error', (err) => {
    console.error('Connection error:', err.message);
    process.exit(1);
});
