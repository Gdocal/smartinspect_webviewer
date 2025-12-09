/**
 * Test script for virtual padding scroll stability
 *
 * Phase 1: Rapidly fills 10K buffer (should take ~1-2 seconds)
 * Phase 2: Continues at steady rate to test scroll stability
 *
 * Usage: node test-scroll-stability.js
 */

const path = require('path');
const si = require(path.join(__dirname, '../nodejs-poc/src/index'));

const ROOM = 'Test123';
const BUFFER_SIZE = 10000;
const PHASE2_RATE_MS = 50;

async function main() {
    console.log(`Connecting to SmartInspect Web Viewer (room: ${ROOM})...`);

    await si.connect({
        host: 'localhost',
        port: 4229,
        appName: 'Scroll Test',
        room: ROOM
    });

    console.log('Connected!');
    console.log(`\nPHASE 1: Filling ${BUFFER_SIZE + 2000} entries rapidly (no console output)...`);

    // Get raw sessions to avoid console output
    const testSession = si.getInstance().getSession('ScrollTest');
    const dataSession = si.getInstance().getSession('DataFeed');
    const systemSession = si.getInstance().getSession('System');

    let totalSent = 0;
    const startTime = Date.now();
    const targetEntries = BUFFER_SIZE + 2000;

    // Phase 1: Rapid filling - use raw session methods (no console output)
    while (totalSent < targetEntries) {
        totalSent++;

        if (totalSent % 3 === 0) {
            testSession.logMessage(`Entry ${totalSent}`);
        } else if (totalSent % 3 === 1) {
            dataSession.logDebug(`Data point ${totalSent}: value=${(Math.random() * 1000).toFixed(2)}`);
        } else {
            systemSession.logMessage(`System event ${totalSent}`);
        }

        // Progress update every 2000
        if (totalSent % 2000 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = Math.floor(totalSent / (Date.now() - startTime) * 1000);
            console.log(`  ${totalSent} entries (${elapsed}s) - ${rate}/sec`);
        }
    }

    const phase1Time = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgRate = Math.floor(totalSent / (Date.now() - startTime) * 1000);
    console.log(`\nPHASE 1 COMPLETE: ${totalSent} entries in ${phase1Time}s (avg ${avgRate}/sec)`);
    console.log('\nPHASE 2: Continuous writing (20/sec)...');
    console.log('  - Buffer is now full, old rows being trimmed');
    console.log('  - Scroll UP in grid to test virtual padding');
    console.log('  - Press Ctrl+C to stop\n');

    // Phase 2: Continuous at steady rate (with console for visibility)
    const testLog = si.createLogger('ScrollTest');
    const dataLog = si.createLogger('DataFeed');
    const systemLog = si.createLogger('System');

    let phase2Count = 0;
    const phase2Start = Date.now();

    const interval = setInterval(() => {
        totalSent++;
        phase2Count++;

        const type = phase2Count % 5;
        switch (type) {
            case 0:
                testLog.info(`Continuous entry ${totalSent}`);
                break;
            case 1:
                dataLog.debug(`Stream: val=${Math.random().toFixed(4)}`);
                break;
            case 2:
                systemLog.info(`Heartbeat #${phase2Count}`);
                break;
            case 3:
                testLog.warn(`Warning at entry ${totalSent}`);
                break;
            case 4:
                dataLog.info(`CPU: ${(Math.random() * 100).toFixed(1)}%`);
                break;
        }

        if (phase2Count % 100 === 0) {
            const elapsed = ((Date.now() - phase2Start) / 1000).toFixed(0);
            console.log(`  Phase 2: +${phase2Count} (${elapsed}s), total: ${totalSent}`);
        }
    }, PHASE2_RATE_MS);

    process.on('SIGINT', async () => {
        console.log('\n\nStopping...');
        clearInterval(interval);
        await si.disconnect();
        console.log(`Total entries sent: ${totalSent}`);
        process.exit(0);
    });
}

main().catch(console.error);
