/**
 * Test script for Stream functionality
 * Tests the end-to-end flow from client library to server to web UI
 */

const path = require('path');
const si = require(path.join(__dirname, '../nodejs-poc/src/index'));

async function main() {
    console.log('Connecting to SmartInspect Web Viewer on port 4229...');

    await si.connect({
        host: 'localhost',
        port: 4229,
        appName: 'Stream Test'
    });

    console.log('Connected! Sending stream data...');

    // Create a logger
    const metrics = si.createLogger('Metrics');

    // Send some stream entries
    let counter = 0;
    const interval = setInterval(() => {
        counter++;

        // Send metrics to different channels
        metrics.stream('cpu', {
            timestamp: new Date().toISOString(),
            usage: Math.random() * 100,
            cores: [
                Math.random() * 100,
                Math.random() * 100,
                Math.random() * 100,
                Math.random() * 100
            ]
        });

        metrics.stream('memory', {
            timestamp: new Date().toISOString(),
            used: 4096 + Math.random() * 1024,
            free: 8192 - Math.random() * 1024,
            total: 16384
        });

        metrics.stream('requests', {
            timestamp: new Date().toISOString(),
            count: Math.floor(Math.random() * 100),
            latency_ms: Math.random() * 200
        });

        console.log(`Sent stream batch ${counter}`);

        // Run continuously - press Ctrl+C to stop
    }, 500);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nStopping stream test...');
        clearInterval(interval);
        setTimeout(() => {
            si.disconnect();
            process.exit(0);
        }, 500);
    });
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
