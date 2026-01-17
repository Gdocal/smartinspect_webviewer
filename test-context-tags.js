/**
 * Test script for context tags (v3 protocol)
 * Sends log entries with ctx field to verify protocol and storage
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
        appName = 'test-ctx',
        sessionName = 'Main',
        title = 'Test message',
        hostName = 'localhost',
        correlationId = '',
        operationName = '',
        operationDepth = 0,
        ctx = {},  // Context tags
        data = null,
        color = { r: 0, g: 0, b: 0, a: 255 }
    } = options;

    // Encode strings
    const appNameBuf = Buffer.from(appName, 'utf8');
    const sessionNameBuf = Buffer.from(sessionName, 'utf8');
    const titleBuf = Buffer.from(title, 'utf8');
    const hostNameBuf = Buffer.from(hostName, 'utf8');
    const correlationIdBuf = Buffer.from(correlationId, 'utf8');
    const operationNameBuf = Buffer.from(operationName, 'utf8');

    // Encode context as JSON
    const ctxJson = Object.keys(ctx).length > 0 ? JSON.stringify(ctx) : '';
    const ctxBuf = Buffer.from(ctxJson, 'utf8');

    const dataBuf = data ? Buffer.from(data, 'utf8') : Buffer.alloc(0);

    // v3 header: 64 bytes
    // logEntryType(4), viewerId(4), appNameLen(4), sessionNameLen(4),
    // titleLen(4), hostNameLen(4), correlationIdLen(4), operationNameLen(4),
    // ctxLen(4), dataLen(4), processId(4), threadId(4), timestamp(8), color(4), operationDepth(4)
    const headerSize = 64;
    const totalDataSize = headerSize +
        appNameBuf.length +
        sessionNameBuf.length +
        titleBuf.length +
        hostNameBuf.length +
        correlationIdBuf.length +
        operationNameBuf.length +
        ctxBuf.length +
        dataBuf.length;

    const packet = Buffer.alloc(6 + totalDataSize);
    let offset = 0;

    // Packet header
    packet.writeInt16LE(4, offset); offset += 2;  // PacketType.LogEntry = 4
    packet.writeInt32LE(totalDataSize, offset); offset += 4;

    // v3 header
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
    packet.writeInt32LE(1, offset); offset += 4;  // threadId
    packet.writeDoubleLE(dateToTimestamp(new Date()), offset); offset += 8;
    packet.writeUInt32LE(colorToInt(color.r, color.g, color.b, color.a), offset); offset += 4;
    packet.writeInt32LE(operationDepth, offset); offset += 4;

    // Variable length data
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

// Connect and send test entries
const client = new net.Socket();

client.connect(4229, 'localhost', () => {
    console.log('Connected to SmartInspect server');

    // Send entries with different context combinations
    const testCases = [
        {
            title: 'User john logged in',
            ctx: { user: 'john@example.com', tenant: 'acme-corp' }
        },
        {
            title: 'Processing order #1001',
            ctx: { user: 'john@example.com', tenant: 'acme-corp', orderId: '1001' }
        },
        {
            title: 'User jane started checkout',
            ctx: { user: 'jane@example.com', tenant: 'acme-corp' }
        },
        {
            title: 'Payment processed',
            ctx: { user: 'john@example.com', tenant: 'acme-corp', orderId: '1001', payment: 'stripe' }
        },
        {
            title: 'Order shipped',
            ctx: { user: 'john@example.com', tenant: 'acme-corp', orderId: '1001' }
        },
        {
            title: 'User bob from different tenant',
            ctx: { user: 'bob@other.com', tenant: 'other-corp' }
        },
        {
            title: 'WebSocket WS1 connected',
            ctx: { ws: 'WS1', block: '001' }
        },
        {
            title: 'Received data from WS1',
            ctx: { ws: 'WS1', block: '001', source: 'A' }
        },
        {
            title: 'WebSocket WS2 connected',
            ctx: { ws: 'WS2', block: '001' }
        },
        {
            title: 'Block 001 complete',
            ctx: { block: '001' }
        }
    ];

    let i = 0;
    const sendNext = () => {
        if (i >= testCases.length) {
            console.log('All test entries sent');
            setTimeout(() => {
                client.end();
            }, 500);
            return;
        }

        const tc = testCases[i];
        const packet = buildLogEntryV3({
            title: tc.title,
            ctx: tc.ctx,
            sessionName: 'ContextTest'
        });

        client.write(packet);
        console.log(`Sent: "${tc.title}" with ctx:`, tc.ctx);
        i++;
        setTimeout(sendNext, 100);
    };

    sendNext();
});

client.on('close', () => {
    console.log('Connection closed');
    process.exit(0);
});

client.on('error', (err) => {
    console.error('Connection error:', err.message);
    process.exit(1);
});
