/**
 * Test script for v3 Watch protocol with native labels
 * Simulates C# client sending watches with labels in native protocol format
 */

const net = require('net');

// SmartInspect protocol packet types
const PACKET_TYPES = {
    WATCH: 0x05
};

// Watch value types
const WATCH_TYPES = {
    STRING: 0,
    INTEGER: 1,
    FLOAT: 2
};

function encodeString(str) {
    if (!str) return { len: 0, data: Buffer.alloc(0) };
    const buf = Buffer.from(str, 'utf8');
    return { len: buf.length, data: buf };
}

/**
 * Create a v3 Watch packet with native labels
 * Header format: nameLen(4) + valueLen(4) + watchType(4) + timestamp(8) + groupLen(4) + labelsLen(4) = 28 bytes
 */
function createWatchPacketV3(name, value, watchType = WATCH_TYPES.STRING, labels = {}) {
    const timestamp = Date.now();

    // Encode strings
    const nameEnc = encodeString(name);
    const valueEnc = encodeString(String(value));
    const groupEnc = encodeString('');  // v3 uses labels, not group
    const labelsJson = Object.keys(labels).length > 0 ? JSON.stringify(labels) : '';
    const labelsEnc = encodeString(labelsJson);

    // Build header (28 bytes)
    const header = Buffer.alloc(28);
    let offset = 0;
    header.writeInt32LE(nameEnc.len, offset); offset += 4;
    header.writeInt32LE(valueEnc.len, offset); offset += 4;
    header.writeInt32LE(watchType, offset); offset += 4;

    // OLE Automation timestamp (double)
    const oleDate = (timestamp / 86400000) + 25569;  // Days since 1899-12-30
    header.writeDoubleLE(oleDate, offset); offset += 8;

    header.writeInt32LE(groupEnc.len, offset); offset += 4;
    header.writeInt32LE(labelsEnc.len, offset); offset += 4;

    // Build data section
    const data = Buffer.concat([
        nameEnc.data,
        valueEnc.data,
        groupEnc.data,
        labelsEnc.data
    ]);

    // Build payload
    const payload = Buffer.concat([header, data]);

    // Build packet with SmartInspect framing
    // [packetType(2)] [dataSize(4)] [payload]
    const packetHeader = Buffer.alloc(6);
    packetHeader.writeInt16LE(PACKET_TYPES.WATCH, 0);
    packetHeader.writeInt32LE(payload.length, 2);

    return Buffer.concat([packetHeader, payload]);
}

async function sendWatches() {
    const client = new net.Socket();

    return new Promise((resolve, reject) => {
        client.connect(4229, 'localhost', () => {
            console.log('Connected to SmartInspect server');
            console.log('Testing v3 Watch protocol with native labels\n');

            // Define trading instances with multiple labels
            const instances = [
                { instance: 'BTC_trade', env: 'prod', strategy: 'momentum' },
                { instance: 'ETH_trade', env: 'prod', strategy: 'mean_reversion' },
                { instance: 'SOL_trade', env: 'staging', strategy: 'momentum' }
            ];
            const exitReasons = ['take_profit', 'stop_loss', 'trailing_stop', 'timeout', 'manual'];
            const positions = ['long', 'short', 'flat'];

            let messagesSent = 0;

            // Send initial values for each instance
            instances.forEach(labels => {
                // strategy_exitReason with native labels
                const exitReason = exitReasons[Math.floor(Math.random() * exitReasons.length)];
                const packet = createWatchPacketV3('strategy_exitReason', exitReason, WATCH_TYPES.STRING, labels);
                client.write(packet);
                console.log(`[${labels.instance}] strategy_exitReason = ${exitReason} (labels: ${JSON.stringify(labels)})`);
                messagesSent++;

                // strategy_position
                const position = positions[Math.floor(Math.random() * positions.length)];
                const posPacket = createWatchPacketV3('strategy_position', position, WATCH_TYPES.STRING, labels);
                client.write(posPacket);
                console.log(`[${labels.instance}] strategy_position = ${position}`);
                messagesSent++;

                // strategy_pnl (numeric)
                const pnl = (Math.random() * 2000 - 1000).toFixed(2);
                const pnlPacket = createWatchPacketV3('strategy_pnl', pnl, WATCH_TYPES.FLOAT, labels);
                client.write(pnlPacket);
                console.log(`[${labels.instance}] strategy_pnl = ${pnl}`);
                messagesSent++;
            });

            console.log(`\nSent ${messagesSent} initial watch values with v3 protocol\n`);
            console.log('Now sending continuous updates every 2 seconds...');
            console.log('Press Ctrl+C to stop\n');

            // Send continuous updates
            const interval = setInterval(() => {
                const labels = instances[Math.floor(Math.random() * instances.length)];
                const metricType = Math.floor(Math.random() * 3);

                if (metricType === 0) {
                    const exitReason = exitReasons[Math.floor(Math.random() * exitReasons.length)];
                    const packet = createWatchPacketV3('strategy_exitReason', exitReason, WATCH_TYPES.STRING, labels);
                    client.write(packet);
                    console.log(`[${labels.instance}] strategy_exitReason = ${exitReason}`);
                } else if (metricType === 1) {
                    const position = positions[Math.floor(Math.random() * positions.length)];
                    const packet = createWatchPacketV3('strategy_position', position, WATCH_TYPES.STRING, labels);
                    client.write(packet);
                    console.log(`[${labels.instance}] strategy_position = ${position}`);
                } else {
                    const pnl = (Math.random() * 2000 - 1000).toFixed(2);
                    const packet = createWatchPacketV3('strategy_pnl', pnl, WATCH_TYPES.FLOAT, labels);
                    client.write(packet);
                    console.log(`[${labels.instance}] strategy_pnl = ${pnl}`);
                }
            }, 2000);

            // Handle Ctrl+C
            process.on('SIGINT', () => {
                console.log('\nStopping...');
                clearInterval(interval);
                client.end();
                resolve();
            });
        });

        client.on('error', (err) => {
            console.error('Connection error:', err.message);
            reject(err);
        });

        client.on('close', () => {
            console.log('Connection closed');
        });
    });
}

console.log('SmartInspect v3 Watch Protocol Test');
console.log('====================================\n');

sendWatches().catch(console.error);
