/**
 * Generate extensive trace data for testing the trace visualization
 * Sends data via HTTP POST to the SmartInspect server
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

// Generate a complete trace with multiple spans
async function generateTrace(config) {
    const traceId = generateTraceId();
    const rootSpanId = generateSpanId();
    const startTime = Date.now();

    console.log(`Generating trace: ${config.name} (${traceId.substring(0, 8)}...)`);

    // Root span start
    await sendLog({
        level: 'info',
        app: config.app,
        session: config.session,
        message: `[Span Start] ${config.name}`,
        ctx: {
            _traceId: traceId,
            _spanId: rootSpanId,
            _spanName: config.name,
            _spanKind: config.kind || 'Server',
            service: config.service
        }
    });

    // Generate child spans
    const childSpans = [];
    for (const child of config.children || []) {
        const childSpanId = generateSpanId();
        childSpans.push({ id: childSpanId, config: child });

        // Child span start
        await sendLog({
            level: 'info',
            app: config.app,
            session: child.session || config.session,
            message: `[Span Start] ${child.name}`,
            ctx: {
                _traceId: traceId,
                _spanId: childSpanId,
                _parentSpanId: rootSpanId,
                _spanName: child.name,
                _spanKind: child.kind || 'Internal',
                service: child.service || config.service
            }
        });

        // Generate some log entries within the child span
        for (let i = 0; i < (child.logCount || 2); i++) {
            await sendLog({
                level: child.hasError && i === child.logCount - 1 ? 'error' : 'debug',
                app: config.app,
                session: child.session || config.session,
                message: child.hasError && i === child.logCount - 1
                    ? `Error in ${child.name}: ${child.errorMessage || 'Something went wrong'}`
                    : `${child.name} - Step ${i + 1}`,
                ctx: {
                    _traceId: traceId,
                    _spanId: childSpanId,
                    _parentSpanId: rootSpanId,
                    step: String(i + 1)
                }
            });
            await sleep(child.stepDelay || 10);
        }

        // Nested grandchild spans
        if (child.children) {
            for (const grandchild of child.children) {
                const grandchildSpanId = generateSpanId();

                await sendLog({
                    level: 'info',
                    app: config.app,
                    session: grandchild.session || config.session,
                    message: `[Span Start] ${grandchild.name}`,
                    ctx: {
                        _traceId: traceId,
                        _spanId: grandchildSpanId,
                        _parentSpanId: childSpanId,
                        _spanName: grandchild.name,
                        _spanKind: grandchild.kind || 'Internal',
                        service: grandchild.service || config.service
                    }
                });

                await sleep(grandchild.duration || 20);

                await sendLog({
                    level: 'info',
                    app: config.app,
                    session: grandchild.session || config.session,
                    message: `[Span End] ${grandchild.name}`,
                    ctx: {
                        _traceId: traceId,
                        _spanId: grandchildSpanId,
                        _parentSpanId: childSpanId,
                        _spanName: grandchild.name,
                        _spanDuration: String(grandchild.duration || 20),
                        _spanStatus: grandchild.hasError ? 'Error' : 'Ok'
                    }
                });
            }
        }

        await sleep(child.duration || 50);

        // Child span end
        await sendLog({
            level: child.hasError ? 'error' : 'info',
            app: config.app,
            session: child.session || config.session,
            message: `[Span End] ${child.name}`,
            ctx: {
                _traceId: traceId,
                _spanId: childSpanId,
                _parentSpanId: rootSpanId,
                _spanName: child.name,
                _spanDuration: String(child.duration || 50),
                _spanStatus: child.hasError ? 'Error' : 'Ok',
                _spanStatusDesc: child.hasError ? child.errorMessage : undefined
            }
        });
    }

    // Some logs in root span
    for (let i = 0; i < (config.logCount || 3); i++) {
        await sendLog({
            level: 'info',
            app: config.app,
            session: config.session,
            message: `${config.name} - Processing ${i + 1}`,
            ctx: {
                _traceId: traceId,
                _spanId: rootSpanId,
                iteration: String(i + 1)
            }
        });
        await sleep(20);
    }

    const totalDuration = Date.now() - startTime;

    // Root span end
    await sendLog({
        level: config.hasError ? 'error' : 'info',
        app: config.app,
        session: config.session,
        message: `[Span End] ${config.name}`,
        ctx: {
            _traceId: traceId,
            _spanId: rootSpanId,
            _spanName: config.name,
            _spanDuration: String(totalDuration),
            _spanStatus: config.hasError ? 'Error' : 'Ok'
        }
    });

    console.log(`  Completed in ${totalDuration}ms`);
    return traceId;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Main function to generate various traces
async function main() {
    console.log('='.repeat(60));
    console.log('SmartInspect Trace Data Generator');
    console.log('='.repeat(60));
    console.log('');

    // 1. Simple HTTP Request traces
    console.log('\n--- Generating HTTP Request Traces ---\n');

    for (let i = 0; i < 5; i++) {
        await generateTrace({
            name: `GET /api/users/${100 + i}`,
            app: 'api-server',
            service: 'user-service',
            session: 'HTTP',
            kind: 'Server',
            logCount: 2,
            children: [
                {
                    name: 'Database Query',
                    kind: 'Client',
                    session: 'Database',
                    duration: 30 + Math.random() * 50,
                    logCount: 3,
                    children: [
                        { name: 'Connection Pool', kind: 'Internal', duration: 5 },
                        { name: 'Execute SQL', kind: 'Internal', duration: 20 }
                    ]
                },
                {
                    name: 'Cache Lookup',
                    kind: 'Client',
                    session: 'Redis',
                    duration: 10 + Math.random() * 20,
                    logCount: 2
                }
            ]
        });
        await sleep(100);
    }

    // 2. Complex E-commerce Order Flow
    console.log('\n--- Generating E-commerce Order Traces ---\n');

    for (let i = 0; i < 3; i++) {
        await generateTrace({
            name: `POST /api/orders`,
            app: 'order-service',
            service: 'orders',
            session: 'HTTP',
            kind: 'Server',
            logCount: 4,
            children: [
                {
                    name: 'Validate Cart',
                    kind: 'Internal',
                    session: 'Validation',
                    duration: 20,
                    logCount: 3
                },
                {
                    name: 'Check Inventory',
                    kind: 'Client',
                    session: 'Inventory',
                    duration: 80,
                    logCount: 4,
                    children: [
                        { name: 'Query Warehouse A', kind: 'Client', duration: 30 },
                        { name: 'Query Warehouse B', kind: 'Client', duration: 25 },
                        { name: 'Aggregate Results', kind: 'Internal', duration: 10 }
                    ]
                },
                {
                    name: 'Process Payment',
                    kind: 'Client',
                    session: 'Payment',
                    duration: 200 + Math.random() * 100,
                    logCount: 5,
                    children: [
                        { name: 'Tokenize Card', kind: 'Internal', duration: 30 },
                        { name: 'Authorize Payment', kind: 'Client', duration: 150, service: 'stripe' },
                        { name: 'Record Transaction', kind: 'Internal', duration: 20 }
                    ]
                },
                {
                    name: 'Create Order Record',
                    kind: 'Client',
                    session: 'Database',
                    duration: 40,
                    logCount: 2
                },
                {
                    name: 'Send Confirmation Email',
                    kind: 'Producer',
                    session: 'Queue',
                    duration: 15,
                    logCount: 2
                }
            ]
        });
        await sleep(200);
    }

    // 3. Traces with Errors
    console.log('\n--- Generating Error Traces ---\n');

    await generateTrace({
        name: 'POST /api/checkout',
        app: 'checkout-service',
        service: 'checkout',
        session: 'HTTP',
        kind: 'Server',
        hasError: true,
        logCount: 2,
        children: [
            {
                name: 'Validate Session',
                kind: 'Internal',
                duration: 10,
                logCount: 2
            },
            {
                name: 'Process Payment',
                kind: 'Client',
                session: 'Payment',
                duration: 300,
                hasError: true,
                errorMessage: 'Payment declined: Insufficient funds',
                logCount: 4,
                children: [
                    { name: 'Tokenize Card', kind: 'Internal', duration: 20 },
                    { name: 'Authorize Payment', kind: 'Client', duration: 250, hasError: true, service: 'stripe' }
                ]
            }
        ]
    });

    await generateTrace({
        name: 'GET /api/products/search',
        app: 'search-service',
        service: 'search',
        session: 'HTTP',
        kind: 'Server',
        hasError: true,
        logCount: 2,
        children: [
            {
                name: 'Elasticsearch Query',
                kind: 'Client',
                session: 'Elasticsearch',
                duration: 5000,
                hasError: true,
                errorMessage: 'Connection timeout after 5000ms',
                logCount: 3
            }
        ]
    });

    // 4. Background Job Traces
    console.log('\n--- Generating Background Job Traces ---\n');

    for (let i = 0; i < 4; i++) {
        await generateTrace({
            name: `ProcessBatchJob #${1000 + i}`,
            app: 'job-worker',
            service: 'batch-processor',
            session: 'Jobs',
            kind: 'Consumer',
            logCount: 5,
            children: [
                {
                    name: 'Load Batch Items',
                    kind: 'Client',
                    session: 'Database',
                    duration: 50 + Math.random() * 30,
                    logCount: 3
                },
                {
                    name: 'Process Items',
                    kind: 'Internal',
                    session: 'Processing',
                    duration: 200 + Math.random() * 100,
                    logCount: 10,
                    children: [
                        { name: 'Transform Data', kind: 'Internal', duration: 80 },
                        { name: 'Validate Results', kind: 'Internal', duration: 30 },
                        { name: 'Prepare Output', kind: 'Internal', duration: 50 }
                    ]
                },
                {
                    name: 'Save Results',
                    kind: 'Client',
                    session: 'Database',
                    duration: 40 + Math.random() * 20,
                    logCount: 2
                },
                {
                    name: 'Notify Completion',
                    kind: 'Producer',
                    session: 'Queue',
                    duration: 10,
                    logCount: 1
                }
            ]
        });
        await sleep(150);
    }

    // 5. Microservices Communication
    console.log('\n--- Generating Microservices Traces ---\n');

    for (let i = 0; i < 3; i++) {
        await generateTrace({
            name: `GET /api/dashboard`,
            app: 'gateway',
            service: 'api-gateway',
            session: 'HTTP',
            kind: 'Server',
            logCount: 2,
            children: [
                {
                    name: 'Fetch User Profile',
                    kind: 'Client',
                    session: 'UserService',
                    service: 'user-service',
                    duration: 60,
                    logCount: 2,
                    children: [
                        { name: 'Get User', kind: 'Client', service: 'postgres', duration: 30 },
                        { name: 'Get Preferences', kind: 'Client', service: 'redis', duration: 15 }
                    ]
                },
                {
                    name: 'Fetch Notifications',
                    kind: 'Client',
                    session: 'NotificationService',
                    service: 'notification-service',
                    duration: 40,
                    logCount: 2
                },
                {
                    name: 'Fetch Activity Feed',
                    kind: 'Client',
                    session: 'ActivityService',
                    service: 'activity-service',
                    duration: 80,
                    logCount: 3,
                    children: [
                        { name: 'Query Recent Activity', kind: 'Client', service: 'mongodb', duration: 50 },
                        { name: 'Enrich Activity Data', kind: 'Internal', duration: 20 }
                    ]
                },
                {
                    name: 'Aggregate Response',
                    kind: 'Internal',
                    duration: 10,
                    logCount: 1
                }
            ]
        });
        await sleep(100);
    }

    // 6. Fast traces (short duration)
    console.log('\n--- Generating Fast Traces ---\n');

    for (let i = 0; i < 10; i++) {
        await generateTrace({
            name: `GET /api/health`,
            app: 'health-checker',
            service: 'monitoring',
            session: 'Health',
            kind: 'Server',
            logCount: 1,
            children: [
                { name: 'Check DB', kind: 'Client', duration: 5, logCount: 1 },
                { name: 'Check Cache', kind: 'Client', duration: 3, logCount: 1 }
            ]
        });
        await sleep(50);
    }

    // 7. Long running traces
    console.log('\n--- Generating Long Running Traces ---\n');

    await generateTrace({
        name: 'Generate Monthly Report',
        app: 'reporting-service',
        service: 'reports',
        session: 'Reports',
        kind: 'Internal',
        logCount: 8,
        children: [
            {
                name: 'Fetch Sales Data',
                kind: 'Client',
                session: 'Database',
                duration: 500,
                logCount: 5,
                stepDelay: 50
            },
            {
                name: 'Fetch Inventory Data',
                kind: 'Client',
                session: 'Database',
                duration: 400,
                logCount: 4,
                stepDelay: 50
            },
            {
                name: 'Calculate Metrics',
                kind: 'Internal',
                session: 'Analytics',
                duration: 800,
                logCount: 10,
                stepDelay: 50,
                children: [
                    { name: 'Revenue Calculation', kind: 'Internal', duration: 200 },
                    { name: 'Trend Analysis', kind: 'Internal', duration: 300 },
                    { name: 'Forecasting', kind: 'Internal', duration: 250 }
                ]
            },
            {
                name: 'Generate PDF',
                kind: 'Internal',
                session: 'Rendering',
                duration: 300,
                logCount: 3
            },
            {
                name: 'Upload to S3',
                kind: 'Client',
                session: 'Storage',
                service: 'aws-s3',
                duration: 200,
                logCount: 2
            }
        ]
    });

    console.log('\n' + '='.repeat(60));
    console.log('Trace data generation complete!');
    console.log('='.repeat(60));
    console.log('\nOpen the SmartInspect Web Viewer and click the "Traces" button');
    console.log('in the header to see the generated traces.');
}

// Run
main().catch(console.error);
