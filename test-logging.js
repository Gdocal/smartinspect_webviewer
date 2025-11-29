/**
 * Test script - sends logs to the web viewer server
 */

const path = require('path');
const si = require(path.join(__dirname, '../nodejs-poc/src/index'));

async function main() {
    console.log('Connecting to SmartInspect Web Viewer on port 4229...');

    await si.connect({
        host: 'localhost',
        port: 4229,
        appName: 'Test Application'
    });

    console.log('Connected! Sending test logs...');

    // Create some loggers for different modules
    const dbLog = si.createLogger('Database');
    const apiLog = si.createLogger('API');
    const authLog = si.createLogger('Authentication');

    // Send various log levels
    dbLog.info('Database connection established');
    dbLog.debug('Connection pool size: 10');
    dbLog.sql('Query', 'SELECT * FROM users WHERE active = true LIMIT 10');

    apiLog.info('Server started on port 3000');
    apiLog.info('GET /api/users');
    apiLog.json('Response', { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] });

    authLog.info('User login attempt: john@example.com');
    authLog.warn('Password attempt 1 failed');
    authLog.warn('Password attempt 2 failed');
    authLog.error('Account locked after 3 failed attempts');

    // Method tracking
    dbLog.enterMethod('executeQuery');
    dbLog.debug('Preparing statement...');
    dbLog.debug('Executing...');
    dbLog.leaveMethod('executeQuery');

    // Watch values
    dbLog.watch('connections', '5');
    dbLog.watch('queries_per_sec', '125');
    apiLog.watch('requests_total', '1234');
    apiLog.watch('response_time_ms', '45');

    // Timing
    apiLog.time('request');
    await new Promise(r => setTimeout(r, 100));
    apiLog.timeEnd('request');

    // Object logging
    dbLog.object('Config', {
        host: 'localhost',
        port: 5432,
        database: 'myapp',
        ssl: true
    });

    // More logs with delays to simulate real activity
    for (let i = 1; i <= 10; i++) {
        await new Promise(r => setTimeout(r, 200));
        apiLog.info(`Processing request ${i}...`);
        dbLog.watch('queries_per_sec', String(100 + Math.floor(Math.random() * 50)));
    }

    // Error simulation
    authLog.fatal('Critical security alert: suspicious activity detected');

    console.log('Done sending logs!');

    // Wait a bit for all logs to be sent
    await new Promise(r => setTimeout(r, 500));
    await si.disconnect();

    console.log('Disconnected.');
}

main().catch(console.error);
