/**
 * Continuous log writer - sends logs and streams continuously
 * Combines test-live.js and test-stream.js functionality
 */

const path = require('path');
const si = require(path.join(__dirname, '../nodejs-poc/src/index'));

async function main() {
    console.log('Connecting to SmartInspect Web Viewer...');

    await si.connect({
        host: 'localhost',
        port: 4229,
        appName: 'Continuous Writer'
    });

    console.log('Connected! Sending logs and streams...');
    console.log('Press Ctrl+C to stop.\n');

    // Create loggers for different sessions
    const dbLog = si.createLogger('Database');
    const apiLog = si.createLogger('API');
    const authLog = si.createLogger('Authentication');
    const metricsLog = si.createLogger('Metrics');

    let requestId = 0;
    let queryCount = 0;

    // Update watches periodically
    const updateWatches = () => {
        dbLog.watch('active_connections', String(5 + Math.floor(Math.random() * 10)));
        dbLog.watch('queries_per_sec', String(50 + Math.floor(Math.random() * 100)));
        apiLog.watch('requests_total', String(requestId));
        apiLog.watch('avg_response_ms', String(20 + Math.floor(Math.random() * 80)));
    };

    // Simulate API requests
    const simulateRequest = () => {
        requestId++;
        const methods = ['GET', 'POST', 'PUT', 'DELETE'];
        const endpoints = ['/api/users', '/api/orders', '/api/products', '/api/auth/login', '/api/settings'];
        const method = methods[Math.floor(Math.random() * methods.length)];
        const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

        apiLog.info(`${method} ${endpoint} - Request #${requestId}`);

        // Simulate response time
        const responseTime = 10 + Math.floor(Math.random() * 200);
        if (responseTime > 150) {
            apiLog.warn(`Slow response: ${responseTime}ms for ${method} ${endpoint}`);
        }
    };

    // Simulate database queries
    const simulateQuery = () => {
        queryCount++;
        const tables = ['users', 'orders', 'products', 'sessions', 'logs'];
        const table = tables[Math.floor(Math.random() * tables.length)];

        dbLog.debug(`Executing query #${queryCount}`);
        dbLog.sql('Query', `SELECT * FROM ${table} WHERE updated_at > NOW() - INTERVAL 1 HOUR LIMIT 100`);

        // Occasionally log slow query
        if (Math.random() < 0.1) {
            dbLog.warn(`Slow query detected on table: ${table}`);
        }
    };

    // Simulate auth events
    const simulateAuth = () => {
        const users = ['alice@example.com', 'bob@example.com', 'charlie@example.com', 'admin@example.com'];
        const user = users[Math.floor(Math.random() * users.length)];

        const events = [
            () => authLog.info(`Login successful: ${user}`),
            () => authLog.info(`Session refreshed: ${user}`),
            () => authLog.warn(`Failed login attempt: ${user}`),
            () => authLog.debug(`Token validated: ${user}`),
        ];

        events[Math.floor(Math.random() * events.length)]();

        // Rare error
        if (Math.random() < 0.05) {
            authLog.error(`Authentication service timeout for ${user}`);
        }
    };

    // Send stream data (metrics)
    const sendStreams = () => {
        // CPU metrics stream
        metricsLog.stream('cpu', {
            timestamp: new Date().toISOString(),
            usage: Math.random() * 100,
            cores: [
                Math.random() * 100,
                Math.random() * 100,
                Math.random() * 100,
                Math.random() * 100
            ]
        });

        // Memory metrics stream
        metricsLog.stream('memory', {
            timestamp: new Date().toISOString(),
            used: 4096 + Math.random() * 1024,
            free: 8192 - Math.random() * 1024,
            total: 16384
        });

        // Request metrics stream
        metricsLog.stream('requests', {
            timestamp: new Date().toISOString(),
            count: Math.floor(Math.random() * 100),
            latency_ms: Math.random() * 200
        });

        // Network metrics stream
        metricsLog.stream('network', {
            timestamp: new Date().toISOString(),
            bytes_in: Math.floor(Math.random() * 1000000),
            bytes_out: Math.floor(Math.random() * 500000),
            connections: Math.floor(Math.random() * 50)
        });
    };

    // Main loop
    let tick = 0;
    const interval = setInterval(() => {
        tick++;

        // API request every tick
        simulateRequest();

        // Database query every 2 ticks
        if (tick % 2 === 0) {
            simulateQuery();
        }

        // Auth event every 3 ticks
        if (tick % 3 === 0) {
            simulateAuth();
        }

        // Send streams every 2 ticks
        if (tick % 2 === 0) {
            sendStreams();
        }

        // Update watches every 5 ticks
        if (tick % 5 === 0) {
            updateWatches();
        }

        // Occasional fatal error (very rare)
        if (Math.random() < 0.01) {
            const logs = [dbLog, apiLog, authLog];
            logs[Math.floor(Math.random() * logs.length)].fatal('Critical system error detected!');
        }

    }, 1000);

    // Handle Ctrl+C
    process.on('SIGINT', async () => {
        console.log('\n\nStopping...');
        clearInterval(interval);
        await si.disconnect();
        console.log('Disconnected.');
        process.exit(0);
    });
}

main().catch(console.error);
