/**
 * Continuous trace writer - generates traces continuously for testing
 * Sends trace data via HTTP POST to the SmartInspect server
 */

const http = require('http');

const SERVER_HOST = 'localhost';
const SERVER_PORT = 5174;
const ROOM = 'default';

// Helper to generate random hex string
function randomHex(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += Math.floor(Math.random() * 16).toString(16);
    }
    return result;
}

// Generate a trace ID (32 hex chars)
function generateTraceId() {
    return randomHex(32);
}

// Generate a span ID (16 hex chars)
function generateSpanId() {
    return randomHex(16);
}

// Send a log entry via HTTP
function sendLog(entry) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            level: entry.level || 'info',
            app: entry.app || 'trace-generator',
            room: ROOM,
            session: entry.session || 'Main'
        });

        // Add context as JSON in body
        const body = JSON.stringify({
            message: entry.message,
            ctx: entry.ctx
        });

        const options = {
            hostname: SERVER_HOST,
            port: SERVER_PORT,
            path: `/api/log?${params}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Trace templates for variety
const traceTemplates = [
    // HTTP API calls
    {
        name: () => `GET /api/users/${100 + Math.floor(Math.random() * 900)}`,
        app: 'api-server',
        service: 'user-service',
        session: 'HTTP',
        kind: 'Server',
        duration: () => 50 + Math.random() * 200,
        children: [
            { name: 'Database Query', kind: 'Client', session: 'Database', durationFactor: 0.4 },
            { name: 'Cache Lookup', kind: 'Client', session: 'Redis', durationFactor: 0.2 }
        ],
        errorRate: 0.05
    },
    {
        name: () => `POST /api/orders`,
        app: 'order-service',
        service: 'orders',
        session: 'HTTP',
        kind: 'Server',
        duration: () => 200 + Math.random() * 500,
        children: [
            { name: 'Validate Cart', kind: 'Internal', session: 'Validation', durationFactor: 0.1 },
            { name: 'Check Inventory', kind: 'Client', session: 'Inventory', durationFactor: 0.2 },
            { name: 'Process Payment', kind: 'Client', session: 'Payment', durationFactor: 0.5 },
            { name: 'Send Notification', kind: 'Producer', session: 'Queue', durationFactor: 0.1 }
        ],
        errorRate: 0.1
    },
    // Background jobs
    {
        name: () => `ProcessBatchJob #${1000 + Math.floor(Math.random() * 9000)}`,
        app: 'job-worker',
        service: 'batch-processor',
        session: 'Jobs',
        kind: 'Consumer',
        duration: () => 300 + Math.random() * 700,
        children: [
            { name: 'Load Items', kind: 'Client', session: 'Database', durationFactor: 0.2 },
            { name: 'Process Items', kind: 'Internal', session: 'Processing', durationFactor: 0.5 },
            { name: 'Save Results', kind: 'Client', session: 'Database', durationFactor: 0.2 }
        ],
        errorRate: 0.08
    },
    // Health checks (fast)
    {
        name: () => `GET /api/health`,
        app: 'health-checker',
        service: 'monitoring',
        session: 'Health',
        kind: 'Server',
        duration: () => 10 + Math.random() * 30,
        children: [
            { name: 'Check DB', kind: 'Client', session: 'Database', durationFactor: 0.5 },
            { name: 'Check Cache', kind: 'Client', session: 'Redis', durationFactor: 0.3 }
        ],
        errorRate: 0.02
    },
    // Search queries
    {
        name: () => `GET /api/search?q=${['shoes', 'shirts', 'pants', 'jackets'][Math.floor(Math.random() * 4)]}`,
        app: 'search-service',
        service: 'search',
        session: 'HTTP',
        kind: 'Server',
        duration: () => 100 + Math.random() * 400,
        children: [
            { name: 'Elasticsearch Query', kind: 'Client', session: 'Elasticsearch', durationFactor: 0.7 },
            { name: 'Rank Results', kind: 'Internal', session: 'Ranking', durationFactor: 0.2 }
        ],
        errorRate: 0.15  // Search often times out
    },
    // Auth requests
    {
        name: () => `POST /api/auth/login`,
        app: 'auth-service',
        service: 'authentication',
        session: 'Auth',
        kind: 'Server',
        duration: () => 80 + Math.random() * 150,
        children: [
            { name: 'Validate Credentials', kind: 'Internal', session: 'Validation', durationFactor: 0.3 },
            { name: 'Check Password', kind: 'Client', session: 'Database', durationFactor: 0.4 },
            { name: 'Generate Token', kind: 'Internal', session: 'JWT', durationFactor: 0.2 }
        ],
        errorRate: 0.2  // Wrong passwords
    },
    // Dashboard aggregation
    {
        name: () => `GET /api/dashboard`,
        app: 'gateway',
        service: 'api-gateway',
        session: 'HTTP',
        kind: 'Server',
        duration: () => 150 + Math.random() * 350,
        children: [
            { name: 'Fetch User Profile', kind: 'Client', session: 'UserService', durationFactor: 0.3 },
            { name: 'Fetch Notifications', kind: 'Client', session: 'NotificationService', durationFactor: 0.2 },
            { name: 'Fetch Activity Feed', kind: 'Client', session: 'ActivityService', durationFactor: 0.4 }
        ],
        errorRate: 0.05
    }
];

// Generate a single trace
async function generateTrace(template) {
    const traceId = generateTraceId();
    const rootSpanId = generateSpanId();
    const traceName = typeof template.name === 'function' ? template.name() : template.name;
    const totalDuration = typeof template.duration === 'function' ? template.duration() : template.duration;
    const hasError = Math.random() < template.errorRate;
    const errorChildIndex = hasError ? Math.floor(Math.random() * template.children.length) : -1;

    // Root span start
    await sendLog({
        level: 'info',
        app: template.app,
        session: template.session,
        message: `[Span Start] ${traceName}`,
        ctx: {
            _traceId: traceId,
            _spanId: rootSpanId,
            _spanName: traceName,
            _spanKind: template.kind,
            service: template.service
        }
    });

    // Generate child spans
    for (let i = 0; i < template.children.length; i++) {
        const child = template.children[i];
        const childSpanId = generateSpanId();
        const childDuration = totalDuration * child.durationFactor;
        const childHasError = i === errorChildIndex;

        // Child span start
        await sendLog({
            level: 'info',
            app: template.app,
            session: child.session,
            message: `[Span Start] ${child.name}`,
            ctx: {
                _traceId: traceId,
                _spanId: childSpanId,
                _parentSpanId: rootSpanId,
                _spanName: child.name,
                _spanKind: child.kind,
                service: template.service
            }
        });

        // Some work in the child span
        await sendLog({
            level: childHasError ? 'error' : 'debug',
            app: template.app,
            session: child.session,
            message: childHasError
                ? `Error in ${child.name}: Operation failed`
                : `${child.name} processing...`,
            ctx: {
                _traceId: traceId,
                _spanId: childSpanId
            }
        });

        await sleep(childDuration * 0.8);

        // Child span end
        await sendLog({
            level: childHasError ? 'error' : 'info',
            app: template.app,
            session: child.session,
            message: `[Span End] ${child.name}`,
            ctx: {
                _traceId: traceId,
                _spanId: childSpanId,
                _parentSpanId: rootSpanId,
                _spanName: child.name,
                _spanDuration: String(Math.floor(childDuration)),
                _spanStatus: childHasError ? 'Error' : 'Ok'
            }
        });
    }

    // Root span end
    await sendLog({
        level: hasError ? 'error' : 'info',
        app: template.app,
        session: template.session,
        message: `[Span End] ${traceName}`,
        ctx: {
            _traceId: traceId,
            _spanId: rootSpanId,
            _spanName: traceName,
            _spanDuration: String(Math.floor(totalDuration)),
            _spanStatus: hasError ? 'Error' : 'Ok'
        }
    });

    return { traceId: traceId.substring(0, 8), name: traceName, hasError, duration: Math.floor(totalDuration) };
}

// Main loop
async function main() {
    console.log('='.repeat(60));
    console.log('Continuous Trace Writer');
    console.log('='.repeat(60));
    console.log('');
    console.log('Generating traces continuously...');
    console.log('Press Ctrl+C to stop.\n');

    let traceCount = 0;

    // Generate traces at varying intervals
    const generateLoop = async () => {
        try {
            // Pick a random template
            const template = traceTemplates[Math.floor(Math.random() * traceTemplates.length)];

            const result = await generateTrace(template);
            traceCount++;

            const status = result.hasError ? '\x1b[31m✗ ERROR\x1b[0m' : '\x1b[32m✓ OK\x1b[0m';
            console.log(`[${traceCount}] ${result.name} - ${result.duration}ms ${status}`);

            // Random delay between traces (500ms to 3000ms)
            const delay = 500 + Math.random() * 2500;
            setTimeout(generateLoop, delay);
        } catch (err) {
            console.error('Error generating trace:', err.message);
            setTimeout(generateLoop, 1000);
        }
    };

    // Start generating
    generateLoop();

    // Also start multiple parallel trace generators for more realistic load
    setTimeout(() => {
        setInterval(async () => {
            const template = traceTemplates[Math.floor(Math.random() * traceTemplates.length)];
            try {
                const result = await generateTrace(template);
                traceCount++;
                const status = result.hasError ? '\x1b[31m✗ ERROR\x1b[0m' : '\x1b[32m✓ OK\x1b[0m';
                console.log(`[${traceCount}] ${result.name} - ${result.duration}ms ${status}`);
            } catch (err) {
                console.error('Error:', err.message);
            }
        }, 2000 + Math.random() * 1000);
    }, 1000);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
        console.log(`\n\nStopped. Generated ${traceCount} traces.`);
        process.exit(0);
    });
}

main().catch(console.error);
