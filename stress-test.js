/**
 * Stress test - sends many logs over 30 seconds
 */

const path = require('path');
const si = require(path.join(__dirname, '../nodejs-poc/src/index'));

const DURATION_SECONDS = 30;
const LOGS_PER_SECOND = 50;

async function main() {
    console.log('Connecting to SmartInspect Web Viewer on port 4229...');

    await si.connect({
        host: 'localhost',
        port: 4229,
        appName: 'Stress Test'
    });

    console.log(`Connected! Stress testing for ${DURATION_SECONDS} seconds at ${LOGS_PER_SECOND} logs/sec...`);

    const sessions = ['Database', 'API', 'Auth', 'Cache', 'Worker', 'Scheduler'];
    const loggers = {};
    sessions.forEach(s => loggers[s] = si.createLogger(s));

    const levels = ['debug', 'info', 'warn', 'error'];
    let count = 0;
    const startTime = Date.now();
    const endTime = startTime + (DURATION_SECONDS * 1000);
    const interval = 1000 / LOGS_PER_SECOND;

    const sendLog = async () => {
        if (Date.now() >= endTime) {
            console.log(`\nDone! Sent ${count} logs in ${DURATION_SECONDS} seconds`);
            await new Promise(r => setTimeout(r, 500));
            await si.disconnect();
            console.log('Disconnected.');
            return;
        }

        const session = sessions[Math.floor(Math.random() * sessions.length)];
        const level = levels[Math.floor(Math.random() * levels.length)];
        const logger = loggers[session];

        count++;

        // Different log types
        const logType = Math.random();
        if (logType < 0.6) {
            // Regular messages
            logger[level](`Stress test log #${count} - ${Math.random().toString(36).substring(7)}`);
        } else if (logType < 0.8) {
            // Watch values
            logger.watch(`metric_${session.toLowerCase()}`, String(Math.floor(Math.random() * 1000)));
        } else if (logType < 0.9) {
            // Enter/leave methods
            logger.enterMethod(`process_${count}`);
            logger.leaveMethod(`process_${count}`);
        } else {
            // JSON objects
            logger.json(`Data #${count}`, { value: Math.random(), timestamp: Date.now() });
        }

        if (count % 100 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`Sent ${count} logs (${elapsed}s elapsed)`);
        }

        setTimeout(sendLog, interval);
    };

    sendLog();
}

main().catch(console.error);
