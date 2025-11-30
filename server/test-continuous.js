/**
 * Continuous test data generator for SmartInspect Web Viewer
 * Uses the SmartInspect Node.js library from nodejs-poc/src
 *
 * Generates realistic log data with:
 * - Multiple sessions (Auth, Database, API, UI, Background)
 * - Multiple applications (WebApp, MobileApp, Backend)
 * - Various log levels (Debug, Message, Warning, Error)
 * - Watches (config values, counters, states)
 *
 * Rate: ~30 messages/minute for logs, more frequent for watches
 */

const path = require('path');

// Use the SmartInspect library from nodejs-poc/src
const { SmartInspect } = require(path.join(__dirname, '../../nodejs-poc/src'));

// Configuration
const HOST = 'localhost';
const PORT = 4229; // Web Viewer server port

// Sessions to simulate
const SESSIONS = ['Auth', 'Database', 'API', 'UI', 'Background'];

// Applications to simulate
const APPS = ['WebApp', 'MobileApp', 'Backend'];

// Hostnames
const HOSTS = ['server-01', 'server-02', 'mobile-device'];

// Message templates per session
const MESSAGE_TEMPLATES = {
    Auth: [
        { level: 'message', title: 'User login attempt', msg: 'User attempting to login with email: user@example.com' },
        { level: 'message', title: 'User authenticated', msg: 'User successfully authenticated, session created' },
        { level: 'warning', title: 'Invalid credentials', msg: 'Login failed: invalid password for user@example.com' },
        { level: 'debug', title: 'Token refresh', msg: 'Refreshing JWT token for session' },
        { level: 'message', title: 'User logout', msg: 'User logged out, session destroyed' },
        { level: 'error', title: 'Auth service timeout', msg: 'Authentication service did not respond within 5000ms' },
    ],
    Database: [
        { level: 'debug', title: 'Query executed', msg: 'SELECT * FROM users WHERE id = 123' },
        { level: 'message', title: 'Connection established', msg: 'Database connection pool initialized with 10 connections' },
        { level: 'warning', title: 'Slow query detected', msg: 'Query took 2500ms, consider optimization' },
        { level: 'error', title: 'Connection failed', msg: 'Failed to connect to database: ECONNREFUSED' },
        { level: 'verbose', title: 'Transaction started', msg: 'Beginning transaction for order processing' },
        { level: 'message', title: 'Migration complete', msg: 'Database migration v2.3.1 applied successfully' },
    ],
    API: [
        { level: 'message', title: 'GET /api/users', msg: 'Request completed in 45ms, status: 200' },
        { level: 'message', title: 'POST /api/orders', msg: 'Order created successfully, orderId: ORD-12345' },
        { level: 'warning', title: 'Rate limit warning', msg: 'Client approaching rate limit: 450/500 requests' },
        { level: 'error', title: 'Internal server error', msg: 'Unhandled exception in order processing' },
        { level: 'debug', title: 'Request headers', msg: 'Content-Type: application/json, Authorization: Bearer ***' },
        { level: 'verbose', title: 'Response payload', msg: '{"success": true, "data": {...}}' },
    ],
    UI: [
        { level: 'message', title: 'Page loaded', msg: 'Dashboard page rendered in 320ms' },
        { level: 'debug', title: 'Component mounted', msg: 'UserProfile component initialized' },
        { level: 'warning', title: 'Deprecation warning', msg: 'Using deprecated API, update before v3.0' },
        { level: 'message', title: 'User action', msg: 'User clicked "Submit Order" button' },
        { level: 'verbose', title: 'State update', msg: 'Redux state updated: cart.items.length = 5' },
        { level: 'error', title: 'Render error', msg: 'Failed to render chart: invalid data format' },
    ],
    Background: [
        { level: 'message', title: 'Job started', msg: 'Starting scheduled cleanup job' },
        { level: 'message', title: 'Job completed', msg: 'Cleanup job finished, removed 150 expired sessions' },
        { level: 'debug', title: 'Queue status', msg: 'Message queue depth: 23 pending, 5 processing' },
        { level: 'warning', title: 'High memory usage', msg: 'Worker memory at 85%, consider scaling' },
        { level: 'verbose', title: 'Task progress', msg: 'Processing batch 45/100' },
        { level: 'error', title: 'Worker crashed', msg: 'Background worker terminated unexpectedly' },
    ]
};

// Watch configurations
const WATCHES = [
    { name: 'config.maxConnections', type: 'int', value: 100 },
    { name: 'config.timeout', type: 'int', value: 5000 },
    { name: 'app.version', type: 'string', value: '2.3.1' },
    { name: 'app.environment', type: 'string', value: 'development' },
    { name: 'cache.hitRate', type: 'float', value: 0.85 },
    { name: 'session.count', type: 'int', value: 42 },
    { name: 'queue.pending', type: 'int', value: 15 },
    { name: 'db.poolSize', type: 'int', value: 10 },
    { name: 'feature.darkMode', type: 'bool', value: true },
    { name: 'feature.betaFeatures', type: 'bool', value: false },
];

// Metric streams (numeric values that change over time)
const METRICS = [
    { name: 'cpu.usage', min: 15, max: 85, variance: 10 },
    { name: 'memory.mb', min: 512, max: 2048, variance: 50 },
    { name: 'network.kbps', min: 100, max: 5000, variance: 500 },
    { name: 'users.active', min: 10, max: 150, variance: 5 },
    { name: 'latency.ms', min: 20, max: 200, variance: 30 },
];

// Current values for metrics (for continuous random walk)
const metricValues = METRICS.map(m => (m.min + m.max) / 2);

// Current values for watches
const watchValues = WATCHES.map(w => w.value);

// SmartInspect instances per app
const inspectors = {};
const sessions = {};

let messageCount = 0;
let watchCount = 0;

async function connect() {
    console.log('SmartInspect Continuous Test Data Generator');
    console.log('==========================================\n');
    console.log(`Connecting to ${HOST}:${PORT}...`);

    for (const appName of APPS) {
        const hostName = HOSTS[APPS.indexOf(appName)];
        const inspector = new SmartInspect(appName);
        inspector.hostName = hostName;

        try {
            await inspector.connect({ host: HOST, port: PORT });
            inspectors[appName] = inspector;

            // Create sessions for this app
            sessions[appName] = {};
            for (const sessionName of SESSIONS) {
                sessions[appName][sessionName] = inspector.getSession(sessionName);
            }

            console.log(`  Connected: ${appName} (${hostName})`);
        } catch (err) {
            console.error(`  Failed to connect ${appName}:`, err.message);
        }
    }

    const connectedApps = Object.keys(inspectors);
    if (connectedApps.length === 0) {
        console.error('\nNo connections established. Is the server running on port 4229?');
        console.log('Retrying in 3 seconds...');
        setTimeout(connect, 3000);
        return;
    }

    console.log(`\nConnected ${connectedApps.length}/${APPS.length} applications`);
    console.log('Starting continuous test data generation...');
    console.log('  - Logs: ~30 messages/minute (every 2 seconds)');
    console.log('  - Watches: every 3 seconds');
    console.log('\nPress Ctrl+C to stop\n');

    startGenerating();
}

function startGenerating() {
    // Generate log messages every 2 seconds (~30/minute)
    setInterval(generateLogMessage, 2000);

    // Generate watch updates every 3 seconds
    setInterval(generateWatchData, 3000);

    // Print stats every 30 seconds
    setInterval(printStats, 30000);
}

function generateLogMessage() {
    const appName = APPS[Math.floor(Math.random() * APPS.length)];
    const sessionName = SESSIONS[Math.floor(Math.random() * SESSIONS.length)];
    const templates = MESSAGE_TEMPLATES[sessionName];
    const template = templates[Math.floor(Math.random() * templates.length)];

    const inspector = inspectors[appName];
    if (!inspector) return;

    const session = sessions[appName][sessionName];
    if (!session) return;

    const message = `${template.title}: ${template.msg} [${new Date().toISOString()}]`;

    switch (template.level) {
        case 'debug':
            session.logDebug(message);
            break;
        case 'verbose':
            session.logVerbose(message);
            break;
        case 'message':
            session.logMessage(message);
            break;
        case 'warning':
            session.logWarning(message);
            break;
        case 'error':
            session.logError(message);
            break;
        default:
            session.logMessage(message);
    }

    messageCount++;
}

function generateWatchData() {
    // Update metrics (simulate numeric time series)
    for (let i = 0; i < METRICS.length; i++) {
        const metric = METRICS[i];
        // Random walk within bounds
        const delta = (Math.random() - 0.5) * metric.variance;
        metricValues[i] = Math.max(metric.min, Math.min(metric.max, metricValues[i] + delta));

        // Send to a random app's Main session
        const appName = APPS[0]; // Use first app for metrics
        const inspector = inspectors[appName];
        if (inspector) {
            inspector.mainSession.watchFloat(metric.name, Math.round(metricValues[i] * 100) / 100);
            watchCount++;
        }
    }

    // Update 2-4 random watches
    const count = 2 + Math.floor(Math.random() * 3);
    const indices = [];
    while (indices.length < count) {
        const idx = Math.floor(Math.random() * WATCHES.length);
        if (!indices.includes(idx)) indices.push(idx);
    }

    for (const idx of indices) {
        const watch = WATCHES[idx];
        let value = watchValues[idx];

        // Update value based on type
        if (watch.type === 'int' && (watch.name.includes('count') || watch.name.includes('pending'))) {
            value = Math.max(0, value + Math.floor((Math.random() - 0.5) * 10));
        } else if (watch.type === 'float') {
            value = Math.max(0, Math.min(1, value + (Math.random() - 0.5) * 0.1));
            value = Math.round(value * 100) / 100;
        } else if (watch.type === 'bool' && Math.random() < 0.1) {
            value = !value;
        }

        watchValues[idx] = value;

        // Send to a random app's Config session
        const appName = APPS[1]; // Use second app for config watches
        const inspector = inspectors[appName];
        if (inspector) {
            const session = inspector.getSession('Config');
            session.watch(watch.name, value);
            watchCount++;
        }
    }
}

function printStats() {
    console.log(`[Stats] Messages: ${messageCount}, Watches: ${watchCount}`);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    console.log(`Final stats - Messages: ${messageCount}, Watches: ${watchCount}`);

    for (const appName of Object.keys(inspectors)) {
        try {
            await inspectors[appName].disconnect();
        } catch (e) {
            // Ignore disconnect errors
        }
    }

    process.exit(0);
});

// Start
connect();
