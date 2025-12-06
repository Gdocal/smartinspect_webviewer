/**
 * Continuous log writer - sends logs, streams, and watches at various speeds
 * Streams and watches use randomized intervals around target average speeds
 */

const path = require('path');
const si = require(path.join(__dirname, '../nodejs-poc/src/index'));

/**
 * Schedule a function to run repeatedly with randomized intervals
 * @param {Function} fn - Function to call
 * @param {number} avgMs - Average interval in ms
 * @param {number} jitter - Jitter factor (0-1), e.g., 0.3 = ±30% variation
 * @returns {Function} Cancel function
 */
function scheduleRandom(fn, avgMs, jitter = 0.3) {
    let timeoutId = null;
    let cancelled = false;

    function schedule() {
        if (cancelled) return;
        // Random interval: avgMs * (1 - jitter) to avgMs * (1 + jitter)
        const minMs = avgMs * (1 - jitter);
        const maxMs = avgMs * (1 + jitter);
        const delay = minMs + Math.random() * (maxMs - minMs);
        timeoutId = setTimeout(() => {
            if (!cancelled) {
                fn();
                schedule();
            }
        }, delay);
    }

    schedule();
    return () => {
        cancelled = true;
        if (timeoutId) clearTimeout(timeoutId);
    };
}

async function main() {
    console.log('Connecting to SmartInspect Web Viewer...');

    await si.connect({
        host: 'localhost',
        port: 4229,
        appName: 'Continuous Writer',
        room: 'test'
    });

    console.log('Connected! Sending logs, streams, and watches...');
    console.log('Press Ctrl+C to stop.\n');

    // Create loggers for different sessions
    const dbLog = si.createLogger('Database');
    const apiLog = si.createLogger('API');
    const authLog = si.createLogger('Authentication');
    const metricsLog = si.createLogger('Metrics');
    const tradingLog = si.createLogger('Trading');

    let requestId = 0;
    let queryCount = 0;
    const cancellers = [];

    // ==================== STREAMS ====================
    // Different speed streams with randomized intervals

    // SUPER FAST: Price ticker (~50ms avg, 20 updates/sec)
    cancellers.push(scheduleRandom(() => {
        const price = 42000 + (Math.random() - 0.5) * 1000;
        tradingLog.stream('price_ticker', {
            symbol: 'BTC/USD',
            price: price.toFixed(2),
            change: ((Math.random() - 0.5) * 2).toFixed(4),
            ts: Date.now()
        });
    }, 50, 0.4));

    // FAST: Order book updates (~200ms avg, 5 updates/sec)
    cancellers.push(scheduleRandom(() => {
        metricsLog.stream('orderbook', {
            bids: Array.from({length: 5}, () => [
                (41900 + Math.random() * 100).toFixed(2),
                (Math.random() * 10).toFixed(4)
            ]),
            asks: Array.from({length: 5}, () => [
                (42000 + Math.random() * 100).toFixed(2),
                (Math.random() * 10).toFixed(4)
            ]),
            ts: Date.now()
        });
    }, 200, 0.3));

    // MEDIUM: CPU/Memory metrics (~1000ms avg, 1 update/sec)
    cancellers.push(scheduleRandom(() => {
        metricsLog.stream('cpu', {
            usage: Math.random() * 100,
            cores: [
                Math.random() * 100,
                Math.random() * 100,
                Math.random() * 100,
                Math.random() * 100
            ],
            ts: Date.now()
        });
    }, 1000, 0.25));

    cancellers.push(scheduleRandom(() => {
        metricsLog.stream('memory', {
            used_mb: 4096 + Math.random() * 1024,
            free_mb: 8192 - Math.random() * 1024,
            swap_mb: Math.random() * 512,
            ts: Date.now()
        });
    }, 1200, 0.3));

    // SLOW: Network stats (~3000ms avg)
    cancellers.push(scheduleRandom(() => {
        metricsLog.stream('network', {
            bytes_in: Math.floor(Math.random() * 1000000),
            bytes_out: Math.floor(Math.random() * 500000),
            packets_in: Math.floor(Math.random() * 10000),
            packets_out: Math.floor(Math.random() * 8000),
            connections: Math.floor(Math.random() * 50),
            ts: Date.now()
        });
    }, 3000, 0.35));

    // VERY SLOW: Disk I/O (~5000ms avg)
    cancellers.push(scheduleRandom(() => {
        metricsLog.stream('disk_io', {
            read_mb: Math.floor(Math.random() * 100),
            write_mb: Math.floor(Math.random() * 50),
            iops: Math.floor(Math.random() * 5000),
            latency_ms: Math.random() * 10,
            ts: Date.now()
        });
    }, 5000, 0.4));

    // ==================== WATCHES ====================
    // Different speed watches with randomized intervals

    // SUPER FAST: Trading position (~100ms avg)
    let position = 0;
    cancellers.push(scheduleRandom(() => {
        position += (Math.random() - 0.5) * 0.1;
        tradingLog.watch('btc_position', position.toFixed(4));
    }, 100, 0.4));

    // FAST: Request counter (~300ms avg)
    cancellers.push(scheduleRandom(() => {
        apiLog.watch('requests_total', String(requestId));
    }, 300, 0.3));

    // FAST: Response time (~400ms avg)
    cancellers.push(scheduleRandom(() => {
        apiLog.watch('avg_response_ms', String(20 + Math.floor(Math.random() * 80)));
    }, 400, 0.35));

    // MEDIUM: Active connections (~1500ms avg)
    cancellers.push(scheduleRandom(() => {
        dbLog.watch('active_connections', String(5 + Math.floor(Math.random() * 20)));
    }, 1500, 0.3));

    // MEDIUM: Queries per second (~2000ms avg)
    cancellers.push(scheduleRandom(() => {
        dbLog.watch('queries_per_sec', String(50 + Math.floor(Math.random() * 100)));
    }, 2000, 0.25));

    // SLOW: Cache hit rate (~4000ms avg)
    cancellers.push(scheduleRandom(() => {
        dbLog.watch('cache_hit_rate', (0.85 + Math.random() * 0.14).toFixed(2));
    }, 4000, 0.3));

    // SLOW: Error rate (~5000ms avg)
    cancellers.push(scheduleRandom(() => {
        apiLog.watch('error_rate', (Math.random() * 0.05).toFixed(4));
    }, 5000, 0.35));

    // VERY SLOW: Uptime (~10000ms avg)
    let uptimeSeconds = 0;
    cancellers.push(scheduleRandom(() => {
        uptimeSeconds += 10;
        const hours = Math.floor(uptimeSeconds / 3600);
        const mins = Math.floor((uptimeSeconds % 3600) / 60);
        const secs = uptimeSeconds % 60;
        metricsLog.watch('uptime', `${hours}h ${mins}m ${secs}s`);
    }, 10000, 0.2));

    // ==================== LOG MESSAGES ====================
    // Keep existing log simulation with some randomization

    // API requests (~800ms avg)
    cancellers.push(scheduleRandom(() => {
        requestId++;
        const methods = ['GET', 'POST', 'PUT', 'DELETE'];
        const endpoints = ['/api/users', '/api/orders', '/api/products', '/api/auth/login', '/api/settings'];
        const method = methods[Math.floor(Math.random() * methods.length)];
        const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

        apiLog.info(`${method} ${endpoint} - Request #${requestId}`);

        const responseTime = 10 + Math.floor(Math.random() * 200);
        if (responseTime > 150) {
            apiLog.warn(`Slow response: ${responseTime}ms for ${method} ${endpoint}`);
        }
    }, 800, 0.4));

    // Database queries (~1500ms avg)
    cancellers.push(scheduleRandom(() => {
        queryCount++;
        const tables = ['users', 'orders', 'products', 'sessions', 'logs'];
        const table = tables[Math.floor(Math.random() * tables.length)];

        dbLog.debug(`Executing query #${queryCount}`);
        dbLog.sql('Query', `SELECT * FROM ${table} WHERE updated_at > NOW() - INTERVAL 1 HOUR LIMIT 100`);

        if (Math.random() < 0.1) {
            dbLog.warn(`Slow query detected on table: ${table}`);
        }
    }, 1500, 0.35));

    // Auth events (~2500ms avg)
    cancellers.push(scheduleRandom(() => {
        const users = ['alice@example.com', 'bob@example.com', 'charlie@example.com', 'admin@example.com'];
        const user = users[Math.floor(Math.random() * users.length)];

        const events = [
            () => authLog.info(`Login successful: ${user}`),
            () => authLog.info(`Session refreshed: ${user}`),
            () => authLog.warn(`Failed login attempt: ${user}`),
            () => authLog.debug(`Token validated: ${user}`),
        ];

        events[Math.floor(Math.random() * events.length)]();

        if (Math.random() < 0.05) {
            authLog.error(`Authentication service timeout for ${user}`);
        }
    }, 2500, 0.4));

    // Occasional fatal errors (~15000ms avg)
    cancellers.push(scheduleRandom(() => {
        const logs = [dbLog, apiLog, authLog, tradingLog];
        logs[Math.floor(Math.random() * logs.length)].fatal('Critical system error detected!');
    }, 15000, 0.5));

    // Trading events (~600ms avg)
    cancellers.push(scheduleRandom(() => {
        const sides = ['BUY', 'SELL'];
        const side = sides[Math.floor(Math.random() * 2)];
        const amount = (Math.random() * 2).toFixed(4);
        const price = (42000 + (Math.random() - 0.5) * 500).toFixed(2);
        tradingLog.info(`${side} ${amount} BTC @ $${price}`);
    }, 600, 0.45));

    console.log('Streaming data at various speeds:');
    console.log('  Streams: price_ticker(50ms), orderbook(200ms), cpu(1s), memory(1.2s), network(3s), disk_io(5s)');
    console.log('  Watches: btc_position(100ms), requests(300ms), response_ms(400ms), connections(1.5s), qps(2s), cache(4s), errors(5s), uptime(10s)');
    console.log('  Logs: api(800ms), db(1.5s), auth(2.5s), trading(600ms), fatal(15s)\n');

    // Handle Ctrl+C
    process.on('SIGINT', async () => {
        console.log('\n\nStopping...');
        cancellers.forEach(cancel => cancel());
        await si.disconnect();
        console.log('Disconnected.');
        process.exit(0);
    });
}

main().catch(console.error);
