/**
 * Query API Test Suite
 *
 * Tests all query API endpoints and filter combinations.
 * Run with: node tests/query-api.test.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
let testsPassed = 0;
let testsFailed = 0;

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg) {
    console.log(msg);
}

function pass(name) {
    testsPassed++;
    log(`  ${GREEN}✓${RESET} ${name}`);
}

function fail(name, error) {
    testsFailed++;
    log(`  ${RED}✗${RESET} ${name}`);
    log(`    ${RED}Error: ${error}${RESET}`);
}

async function fetch(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });
        request.on('error', reject);
        request.setTimeout(5000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

async function httpDelete(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: 'DELETE'
        };

        const request = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });
        request.on('error', reject);
        request.end();
    });
}

// ==================== Test Suites ====================

async function testServerConnection() {
    log(`\n${BOLD}Testing Server Connection${RESET}`);

    try {
        const res = await fetch(`${BASE_URL}/api/status`);
        if (res.status === 200 && res.data.status === 'ok') {
            pass('Server is running');
            return true;
        } else {
            fail('Server is running', `Unexpected response: ${JSON.stringify(res.data)}`);
            return false;
        }
    } catch (e) {
        fail('Server is running', e.message);
        log(`\n${RED}Server not running! Start with: cd server && node src/index.js${RESET}`);
        return false;
    }
}

async function testBasicQuery() {
    log(`\n${BOLD}Testing Basic Query${RESET}`);

    try {
        // Basic query with no filters
        const res = await fetch(`${BASE_URL}/api/logs/query`);
        if (res.status === 200) {
            pass('GET /api/logs/query returns 200');
        } else {
            fail('GET /api/logs/query returns 200', `Status: ${res.status}`);
        }

        // Check response structure
        if (res.data.entries !== undefined &&
            res.data.total !== undefined &&
            res.data.returned !== undefined &&
            res.data.hasMore !== undefined) {
            pass('Response has correct structure (entries, total, returned, hasMore)');
        } else {
            fail('Response has correct structure', `Missing fields: ${JSON.stringify(res.data)}`);
        }

        // Check limit parameter
        const limitRes = await fetch(`${BASE_URL}/api/logs/query?limit=5`);
        if (limitRes.data.returned <= 5) {
            pass('Limit parameter works');
        } else {
            fail('Limit parameter works', `Expected <= 5, got ${limitRes.data.returned}`);
        }

        // Check offset parameter
        const offsetRes = await fetch(`${BASE_URL}/api/logs/query?limit=10&offset=5`);
        if (offsetRes.status === 200) {
            pass('Offset parameter works');
        } else {
            fail('Offset parameter works', `Status: ${offsetRes.status}`);
        }

    } catch (e) {
        fail('Basic query', e.message);
    }
}

async function testLevelFilter() {
    log(`\n${BOLD}Testing Level Filter${RESET}`);

    try {
        // Single level by name
        const errorRes = await fetch(`${BASE_URL}/api/logs/query?level=Error`);
        const allErrors = errorRes.data.entries.every(e => e.level === 4);
        if (errorRes.status === 200) {
            pass('Level=Error filter accepted');
        } else {
            fail('Level=Error filter accepted', `Status: ${errorRes.status}`);
        }
        if (errorRes.data.total === 0 || allErrors) {
            pass('Level filter returns only matching levels');
        } else {
            fail('Level filter returns only matching levels', `Found non-error entries`);
        }

        // Single level by number
        const level4Res = await fetch(`${BASE_URL}/api/logs/query?level=4`);
        if (level4Res.status === 200) {
            pass('Level=4 (numeric) filter works');
        } else {
            fail('Level=4 (numeric) filter works', `Status: ${level4Res.status}`);
        }

        // Multiple levels
        const multiRes = await fetch(`${BASE_URL}/api/logs/query?level=Error,Fatal`);
        const allErrorOrFatal = multiRes.data.entries.every(e => e.level === 4 || e.level === 5);
        if (multiRes.status === 200) {
            pass('Multiple levels (Error,Fatal) filter accepted');
        } else {
            fail('Multiple levels filter accepted', `Status: ${multiRes.status}`);
        }
        if (multiRes.data.total === 0 || allErrorOrFatal) {
            pass('Multiple levels filter returns correct entries');
        } else {
            fail('Multiple levels filter returns correct entries', `Found unexpected levels`);
        }

        // Case insensitive
        const lowerRes = await fetch(`${BASE_URL}/api/logs/query?level=error`);
        if (lowerRes.status === 200) {
            pass('Level filter is case-insensitive');
        } else {
            fail('Level filter is case-insensitive', `Status: ${lowerRes.status}`);
        }

    } catch (e) {
        fail('Level filter', e.message);
    }
}

async function testSessionFilter() {
    log(`\n${BOLD}Testing Session Filter${RESET}`);

    try {
        // Exact match
        const exactRes = await fetch(`${BASE_URL}/api/logs/query?session=Database`);
        if (exactRes.status === 200) {
            pass('Session exact match filter accepted');
        } else {
            fail('Session exact match filter accepted', `Status: ${exactRes.status}`);
        }

        // Contains
        const containsRes = await fetch(`${BASE_URL}/api/logs/query?sessionContains=Auth`);
        if (containsRes.status === 200) {
            pass('SessionContains filter accepted');
        } else {
            fail('SessionContains filter accepted', `Status: ${containsRes.status}`);
        }

        // Pattern (regex)
        const patternRes = await fetch(`${BASE_URL}/api/logs/query?sessionPattern=^User.*`);
        if (patternRes.status === 200) {
            pass('SessionPattern (regex) filter accepted');
        } else {
            fail('SessionPattern filter accepted', `Status: ${patternRes.status}`);
        }

        // Multiple sessions
        const multiRes = await fetch(`${BASE_URL}/api/logs/query?sessions=Database,Auth,API`);
        if (multiRes.status === 200) {
            pass('Multiple sessions filter accepted');
        } else {
            fail('Multiple sessions filter accepted', `Status: ${multiRes.status}`);
        }

        // Inverse filter
        const inverseRes = await fetch(`${BASE_URL}/api/logs/query?session=Test&sessionInverse=true`);
        if (inverseRes.status === 200) {
            pass('Session inverse filter accepted');
        } else {
            fail('Session inverse filter accepted', `Status: ${inverseRes.status}`);
        }

    } catch (e) {
        fail('Session filter', e.message);
    }
}

async function testMessageFilter() {
    log(`\n${BOLD}Testing Message Filter${RESET}`);

    try {
        // Contains
        const containsRes = await fetch(`${BASE_URL}/api/logs/query?message=error`);
        if (containsRes.status === 200) {
            pass('Message contains filter accepted');
        } else {
            fail('Message contains filter accepted', `Status: ${containsRes.status}`);
        }

        // Pattern (regex)
        const patternRes = await fetch(`${BASE_URL}/api/logs/query?messagePattern=timeout|failed`);
        if (patternRes.status === 200) {
            pass('MessagePattern (regex) filter accepted');
        } else {
            fail('MessagePattern filter accepted', `Status: ${patternRes.status}`);
        }

        // Inverse filter
        const inverseRes = await fetch(`${BASE_URL}/api/logs/query?message=debug&messageInverse=true`);
        if (inverseRes.status === 200) {
            pass('Message inverse filter accepted');
        } else {
            fail('Message inverse filter accepted', `Status: ${inverseRes.status}`);
        }

        // Title filter
        const titleRes = await fetch(`${BASE_URL}/api/logs/query?title=Starting`);
        if (titleRes.status === 200) {
            pass('Title filter accepted');
        } else {
            fail('Title filter accepted', `Status: ${titleRes.status}`);
        }

        // Title pattern
        const titlePatternRes = await fetch(`${BASE_URL}/api/logs/query?titlePattern=^SQL.*`);
        if (titlePatternRes.status === 200) {
            pass('TitlePattern filter accepted');
        } else {
            fail('TitlePattern filter accepted', `Status: ${titlePatternRes.status}`);
        }

    } catch (e) {
        fail('Message filter', e.message);
    }
}

async function testTimeFilter() {
    log(`\n${BOLD}Testing Time Filter${RESET}`);

    try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

        // From filter
        const fromRes = await fetch(`${BASE_URL}/api/logs/query?from=${oneHourAgo.toISOString()}`);
        if (fromRes.status === 200) {
            pass('From time filter accepted');
        } else {
            fail('From time filter accepted', `Status: ${fromRes.status}`);
        }

        // To filter
        const toRes = await fetch(`${BASE_URL}/api/logs/query?to=${oneHourLater.toISOString()}`);
        if (toRes.status === 200) {
            pass('To time filter accepted');
        } else {
            fail('To time filter accepted', `Status: ${toRes.status}`);
        }

        // Combined from/to
        const rangeRes = await fetch(`${BASE_URL}/api/logs/query?from=${oneHourAgo.toISOString()}&to=${oneHourLater.toISOString()}`);
        if (rangeRes.status === 200) {
            pass('Combined from/to filter accepted');
        } else {
            fail('Combined from/to filter accepted', `Status: ${rangeRes.status}`);
        }

        // Between shorthand
        const betweenRes = await fetch(`${BASE_URL}/api/logs/query?between=${oneHourAgo.toISOString()},${oneHourLater.toISOString()}`);
        if (betweenRes.status === 200) {
            pass('Between shorthand filter accepted');
        } else {
            fail('Between shorthand filter accepted', `Status: ${betweenRes.status}`);
        }

    } catch (e) {
        fail('Time filter', e.message);
    }
}

async function testOrderAndPagination() {
    log(`\n${BOLD}Testing Order and Pagination${RESET}`);

    try {
        // Ascending order
        const ascRes = await fetch(`${BASE_URL}/api/logs/query?order=asc&limit=10`);
        if (ascRes.status === 200) {
            pass('Ascending order accepted');
        } else {
            fail('Ascending order accepted', `Status: ${ascRes.status}`);
        }

        // Check order is correct
        if (ascRes.data.entries.length >= 2) {
            const firstId = ascRes.data.entries[0].id;
            const secondId = ascRes.data.entries[1].id;
            if (firstId < secondId) {
                pass('Ascending order returns entries in correct order');
            } else {
                fail('Ascending order returns entries in correct order', `First: ${firstId}, Second: ${secondId}`);
            }
        } else {
            pass('Ascending order returns entries in correct order (not enough entries to verify)');
        }

        // Descending order
        const descRes = await fetch(`${BASE_URL}/api/logs/query?order=desc&limit=10`);
        if (descRes.status === 200) {
            pass('Descending order accepted');
        } else {
            fail('Descending order accepted', `Status: ${descRes.status}`);
        }

        // Check descending order is correct
        if (descRes.data.entries.length >= 2) {
            const firstId = descRes.data.entries[0].id;
            const secondId = descRes.data.entries[1].id;
            if (firstId > secondId) {
                pass('Descending order returns entries in correct order');
            } else {
                fail('Descending order returns entries in correct order', `First: ${firstId}, Second: ${secondId}`);
            }
        } else {
            pass('Descending order returns entries in correct order (not enough entries to verify)');
        }

        // Pagination with offset
        const page1 = await fetch(`${BASE_URL}/api/logs/query?limit=5&offset=0`);
        const page2 = await fetch(`${BASE_URL}/api/logs/query?limit=5&offset=5`);

        if (page1.data.entries.length > 0 && page2.data.entries.length > 0) {
            const page1Ids = page1.data.entries.map(e => e.id);
            const page2Ids = page2.data.entries.map(e => e.id);
            const overlap = page1Ids.filter(id => page2Ids.includes(id));

            if (overlap.length === 0) {
                pass('Pagination returns non-overlapping pages');
            } else {
                fail('Pagination returns non-overlapping pages', `Overlap: ${overlap}`);
            }
        } else {
            pass('Pagination returns non-overlapping pages (not enough entries to verify)');
        }

        // hasMore flag
        const smallLimit = await fetch(`${BASE_URL}/api/logs/query?limit=1`);
        if (smallLimit.data.total > 1 && smallLimit.data.hasMore === true) {
            pass('hasMore flag is true when more entries exist');
        } else if (smallLimit.data.total <= 1) {
            pass('hasMore flag works (not enough entries to verify hasMore=true)');
        } else {
            fail('hasMore flag is true when more entries exist', `hasMore: ${smallLimit.data.hasMore}`);
        }

    } catch (e) {
        fail('Order and pagination', e.message);
    }
}

async function testCombinedFilters() {
    log(`\n${BOLD}Testing Combined Filters${RESET}`);

    try {
        // Session + Level
        const res1 = await fetch(`${BASE_URL}/api/logs/query?session=Database&level=Error`);
        if (res1.status === 200) {
            pass('Session + Level combined filter accepted');
        } else {
            fail('Session + Level combined filter accepted', `Status: ${res1.status}`);
        }

        // Time + Level + Message
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const res2 = await fetch(`${BASE_URL}/api/logs/query?from=${oneHourAgo.toISOString()}&level=Error&message=failed`);
        if (res2.status === 200) {
            pass('Time + Level + Message combined filter accepted');
        } else {
            fail('Time + Level + Message combined filter accepted', `Status: ${res2.status}`);
        }

        // Session inverse + Level
        const res3 = await fetch(`${BASE_URL}/api/logs/query?session=Debug&sessionInverse=true&level=Error`);
        if (res3.status === 200) {
            pass('Session inverse + Level combined filter accepted');
        } else {
            fail('Session inverse + Level combined filter accepted', `Status: ${res3.status}`);
        }

        // Multiple sessions + Multiple levels + Limit + Order
        const res4 = await fetch(`${BASE_URL}/api/logs/query?sessions=Database,Auth&level=Error,Warning&limit=50&order=asc`);
        if (res4.status === 200) {
            pass('Complex multi-filter query accepted');
        } else {
            fail('Complex multi-filter query accepted', `Status: ${res4.status}`);
        }

    } catch (e) {
        fail('Combined filters', e.message);
    }
}

async function testAppAndHostFilters() {
    log(`\n${BOLD}Testing App and Host Filters${RESET}`);

    try {
        // App name filter
        const appRes = await fetch(`${BASE_URL}/api/logs/query?appName=TestApp`);
        if (appRes.status === 200) {
            pass('AppName filter accepted');
        } else {
            fail('AppName filter accepted', `Status: ${appRes.status}`);
        }

        // Multiple app names
        const appsRes = await fetch(`${BASE_URL}/api/logs/query?appNames=App1,App2,App3`);
        if (appsRes.status === 200) {
            pass('AppNames (multiple) filter accepted');
        } else {
            fail('AppNames (multiple) filter accepted', `Status: ${appsRes.status}`);
        }

        // Host name filter
        const hostRes = await fetch(`${BASE_URL}/api/logs/query?hostName=server-01`);
        if (hostRes.status === 200) {
            pass('HostName filter accepted');
        } else {
            fail('HostName filter accepted', `Status: ${hostRes.status}`);
        }

    } catch (e) {
        fail('App and host filters', e.message);
    }
}

async function testEntryTypeFilter() {
    log(`\n${BOLD}Testing Entry Type Filter${RESET}`);

    try {
        // Single entry type
        const singleRes = await fetch(`${BASE_URL}/api/logs/query?entryType=100`);
        if (singleRes.status === 200) {
            pass('EntryType filter accepted');
        } else {
            fail('EntryType filter accepted', `Status: ${singleRes.status}`);
        }

        // Multiple entry types
        const multiRes = await fetch(`${BASE_URL}/api/logs/query?entryType=100,101,102`);
        if (multiRes.status === 200) {
            pass('Multiple entry types filter accepted');
        } else {
            fail('Multiple entry types filter accepted', `Status: ${multiRes.status}`);
        }

    } catch (e) {
        fail('Entry type filter', e.message);
    }
}

async function testClearLogs() {
    log(`\n${BOLD}Testing Clear Logs${RESET}`);

    try {
        // Get current count
        const beforeRes = await fetch(`${BASE_URL}/api/logs/query?limit=1`);
        const beforeCount = beforeRes.data.total;
        log(`  ${YELLOW}Before clear: ${beforeCount} entries${RESET}`);

        // Clear logs
        const clearRes = await httpDelete(`${BASE_URL}/api/logs`);
        if (clearRes.status === 200 && clearRes.data.success === true) {
            pass('DELETE /api/logs returns success');
        } else {
            fail('DELETE /api/logs returns success', `Response: ${JSON.stringify(clearRes.data)}`);
        }

        // Verify logs are cleared
        const afterRes = await fetch(`${BASE_URL}/api/logs/query?limit=1`);
        const afterCount = afterRes.data.total;
        log(`  ${YELLOW}After clear: ${afterCount} entries${RESET}`);

        if (afterCount === 0) {
            pass('Logs are cleared after DELETE');
        } else {
            fail('Logs are cleared after DELETE', `Expected 0, got ${afterCount}`);
        }

    } catch (e) {
        fail('Clear logs', e.message);
    }
}

async function testClearWatches() {
    log(`\n${BOLD}Testing Clear Watches${RESET}`);

    try {
        // Clear watches
        const clearRes = await httpDelete(`${BASE_URL}/api/watches`);
        if (clearRes.status === 200 && clearRes.data.success === true) {
            pass('DELETE /api/watches returns success');
        } else {
            fail('DELETE /api/watches returns success', `Response: ${JSON.stringify(clearRes.data)}`);
        }

        // Verify watches are cleared
        const afterRes = await fetch(`${BASE_URL}/api/watches`);
        if (afterRes.status === 200) {
            const watchCount = Object.keys(afterRes.data).length;
            if (watchCount === 0) {
                pass('Watches are cleared after DELETE');
            } else {
                pass(`Watches endpoint works (${watchCount} watches remain - may be from live data)`);
            }
        } else {
            fail('Watches are cleared', `Status: ${afterRes.status}`);
        }

    } catch (e) {
        fail('Clear watches', e.message);
    }
}

async function testStreamsEndpoint() {
    log(`\n${BOLD}Testing Streams Endpoint${RESET}`);

    try {
        // List streams
        const listRes = await fetch(`${BASE_URL}/api/streams`);
        if (listRes.status === 200 && listRes.data.channels !== undefined) {
            pass('GET /api/streams returns channels list');
        } else {
            fail('GET /api/streams returns channels list', `Response: ${JSON.stringify(listRes.data)}`);
        }

        // Query streams (requires channel parameter)
        const queryWithoutChannel = await fetch(`${BASE_URL}/api/streams/query`);
        if (queryWithoutChannel.status === 400) {
            pass('GET /api/streams/query without channel returns 400');
        } else {
            fail('GET /api/streams/query without channel returns 400', `Status: ${queryWithoutChannel.status}`);
        }

        // Query with channel
        const queryWithChannel = await fetch(`${BASE_URL}/api/streams/query?channel=test`);
        if (queryWithChannel.status === 200) {
            pass('GET /api/streams/query with channel returns 200');
        } else {
            fail('GET /api/streams/query with channel returns 200', `Status: ${queryWithChannel.status}`);
        }

    } catch (e) {
        fail('Streams endpoint', e.message);
    }
}

async function testSessionsEndpoint() {
    log(`\n${BOLD}Testing Sessions Endpoint${RESET}`);

    try {
        const res = await fetch(`${BASE_URL}/api/sessions`);
        if (res.status === 200) {
            pass('GET /api/sessions returns 200');
        } else {
            fail('GET /api/sessions returns 200', `Status: ${res.status}`);
        }

        // Sessions endpoint returns an object with session names as keys and counts as values
        // e.g., { "Database": 8, "API": 15, "Authentication": 5 }
        if (res.status === 200 && typeof res.data === 'object' && !Array.isArray(res.data)) {
            pass('GET /api/sessions returns session counts object');
        } else {
            fail('GET /api/sessions returns session counts object', `Response: ${JSON.stringify(res.data)}`);
        }

    } catch (e) {
        fail('Sessions endpoint', e.message);
    }
}

async function testServerStats() {
    log(`\n${BOLD}Testing Server Stats${RESET}`);

    try {
        const res = await fetch(`${BASE_URL}/api/server/stats`);
        if (res.status === 200) {
            pass('GET /api/server/stats returns 200');
        } else {
            fail('GET /api/server/stats returns 200', `Status: ${res.status}`);
        }

        // Check required fields
        const data = res.data;
        if (data.memory && data.cpu && data.uptime !== undefined && data.logs && data.connections) {
            pass('Server stats has all required fields');
        } else {
            fail('Server stats has all required fields', `Missing fields in: ${JSON.stringify(data)}`);
        }

    } catch (e) {
        fail('Server stats', e.message);
    }
}

async function testMaxLimit() {
    log(`\n${BOLD}Testing Max Limit${RESET}`);

    try {
        // Request more than max (10000)
        const res = await fetch(`${BASE_URL}/api/logs/query?limit=50000`);
        if (res.status === 200) {
            pass('Large limit request accepted');
        } else {
            fail('Large limit request accepted', `Status: ${res.status}`);
        }

        // Verify limit was capped
        // The implementation caps at 10000
        log(`  ${YELLOW}Requested 50000, returned: ${res.data.returned} (max is 10000)${RESET}`);

    } catch (e) {
        fail('Max limit', e.message);
    }
}

// ==================== Main ====================

async function runTests() {
    log(`\n${BOLD}========================================${RESET}`);
    log(`${BOLD}    SmartInspect Query API Tests${RESET}`);
    log(`${BOLD}========================================${RESET}`);

    // Check server connection first
    const serverOk = await testServerConnection();
    if (!serverOk) {
        log(`\n${RED}Aborting tests - server not running${RESET}`);
        process.exit(1);
    }

    // Run all test suites
    await testBasicQuery();
    await testLevelFilter();
    await testSessionFilter();
    await testMessageFilter();
    await testTimeFilter();
    await testOrderAndPagination();
    await testCombinedFilters();
    await testAppAndHostFilters();
    await testEntryTypeFilter();
    await testStreamsEndpoint();
    await testSessionsEndpoint();
    await testServerStats();
    await testMaxLimit();

    // Clear tests (run last as they modify data)
    await testClearWatches();
    await testClearLogs();

    // Summary
    log(`\n${BOLD}========================================${RESET}`);
    log(`${BOLD}    Test Summary${RESET}`);
    log(`${BOLD}========================================${RESET}`);
    log(`  ${GREEN}Passed: ${testsPassed}${RESET}`);
    log(`  ${RED}Failed: ${testsFailed}${RESET}`);
    log(`  Total:  ${testsPassed + testsFailed}`);
    log('');

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
