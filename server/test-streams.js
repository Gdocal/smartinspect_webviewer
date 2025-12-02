/**
 * Test script for generating stream data
 * Used to test the streams view speedometer feature
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3001';

async function main() {
    console.log('Stream Test Data Generator');
    console.log('==========================\n');

    const ws = new WebSocket(WS_URL);

    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });

    console.log('WebSocket connected to', WS_URL);
    console.log('Starting stream generation...\n');

    let count = 0;
    const channels = ['metrics', 'events', 'telemetry'];

    // Generate stream data rapidly
    const interval = setInterval(() => {
        for (let i = 0; i < 5; i++) {  // 5 entries per tick
            const channel = channels[count % channels.length];
            const packet = {
                type: 'stream',
                channel,
                data: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    value: Math.random() * 100,
                    counter: count,
                    message: `Stream entry ${count} on channel ${channel}`
                }),
                timestamp: new Date().toISOString(),
                streamType: channel === 'metrics' ? 'json' : 'text'
            };

            ws.send(JSON.stringify(packet));
            count++;
        }
    }, 100);  // 50 entries/sec (5 entries * 10 ticks/sec)

    // Print stats every 2 seconds
    let lastCount = 0;
    setInterval(() => {
        const rate = (count - lastCount) / 2;
        console.log(`[Stats] Total: ${count}, Rate: ${rate}/sec`);
        lastCount = count;
    }, 2000);

    process.on('SIGINT', () => {
        console.log('\nStopping...');
        clearInterval(interval);
        ws.close();
        process.exit(0);
    });

    console.log('Press Ctrl+C to stop\n');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
