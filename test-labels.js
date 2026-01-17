/**
 * Test script for labeled watch metrics
 * Simulates multiple trading instances sending metrics with labels
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
    const buf = Buffer.from(str, 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeInt32LE(buf.length, 0);
    return Buffer.concat([lenBuf, buf]);
}

function createWatchPacket(name, value, watchType = WATCH_TYPES.STRING, group = '') {
    // Packet format: type(1) + session(str) + title(str) + timestamp(8) + watchType(4) + value(str) + group(str)
    const timestamp = Date.now();

    const typeBuf = Buffer.alloc(1);
    typeBuf.writeUInt8(PACKET_TYPES.WATCH, 0);

    const sessionBuf = encodeString('Trading');
    const titleBuf = encodeString(name);

    const timestampBuf = Buffer.alloc(8);
    timestampBuf.writeBigInt64LE(BigInt(timestamp * 10000) + BigInt(621355968000000000), 0); // Convert to .NET ticks

    const watchTypeBuf = Buffer.alloc(4);
    watchTypeBuf.writeInt32LE(watchType, 0);

    const valueBuf = encodeString(String(value));
    const groupBuf = encodeString(group);  // Group is used as instance label

    const payload = Buffer.concat([typeBuf, sessionBuf, titleBuf, timestampBuf, watchTypeBuf, valueBuf, groupBuf]);

    // Length prefix (4 bytes)
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeInt32LE(payload.length, 0);

    // Full packet with header: "CYCL" + length + payload
    return Buffer.concat([Buffer.from('CYCL'), lenBuf, payload]);
}

async function sendWatches() {
    const client = new net.Socket();

    return new Promise((resolve, reject) => {
        client.connect(4229, 'localhost', () => {
            console.log('Connected to SmartInspect server');

            // Define trading instances
            const instances = ['BTC_trade', 'ETH_trade', 'SOL_trade'];
            const exitReasons = ['take_profit', 'stop_loss', 'trailing_stop', 'timeout', 'manual'];
            const positions = ['long', 'short', 'flat'];

            let messagesSent = 0;

            // Send initial values for each instance
            instances.forEach(instance => {
                // strategy_exitReason with instance label (via group field)
                const exitReason = exitReasons[Math.floor(Math.random() * exitReasons.length)];
                const packet = createWatchPacket('strategy_exitReason', exitReason, WATCH_TYPES.STRING, instance);
                client.write(packet);
                console.log(`[${instance}] strategy_exitReason = ${exitReason}`);
                messagesSent++;

                // strategy_position
                const position = positions[Math.floor(Math.random() * positions.length)];
                const posPacket = createWatchPacket('strategy_position', position, WATCH_TYPES.STRING, instance);
                client.write(posPacket);
                console.log(`[${instance}] strategy_position = ${position}`);
                messagesSent++;

                // strategy_pnl (numeric)
                const pnl = (Math.random() * 2000 - 1000).toFixed(2);
                const pnlPacket = createWatchPacket('strategy_pnl', pnl, WATCH_TYPES.FLOAT, instance);
                client.write(pnlPacket);
                console.log(`[${instance}] strategy_pnl = ${pnl}`);
                messagesSent++;
            });

            console.log(`\nSent ${messagesSent} initial watch values`);
            console.log('\nNow sending continuous updates every 2 seconds...');
            console.log('Press Ctrl+C to stop\n');

            // Send continuous updates
            const interval = setInterval(() => {
                const instance = instances[Math.floor(Math.random() * instances.length)];

                // Randomly update one metric
                const metricType = Math.floor(Math.random() * 3);

                if (metricType === 0) {
                    const exitReason = exitReasons[Math.floor(Math.random() * exitReasons.length)];
                    const packet = createWatchPacket('strategy_exitReason', exitReason, WATCH_TYPES.STRING, instance);
                    client.write(packet);
                    console.log(`[${instance}] strategy_exitReason = ${exitReason}`);
                } else if (metricType === 1) {
                    const position = positions[Math.floor(Math.random() * positions.length)];
                    const packet = createWatchPacket('strategy_position', position, WATCH_TYPES.STRING, instance);
                    client.write(packet);
                    console.log(`[${instance}] strategy_position = ${position}`);
                } else {
                    const pnl = (Math.random() * 2000 - 1000).toFixed(2);
                    const packet = createWatchPacket('strategy_pnl', pnl, WATCH_TYPES.FLOAT, instance);
                    client.write(packet);
                    console.log(`[${instance}] strategy_pnl = ${pnl}`);
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

sendWatches().catch(console.error);
