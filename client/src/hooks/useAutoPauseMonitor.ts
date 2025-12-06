/**
 * useAutoPauseMonitor - Monitors stream rates and auto-pauses high-frequency streams
 *
 * Features:
 * - Tracks messages/sec per subscribed stream
 * - Auto-pauses streams exceeding rate threshold for grace period
 * - Shows notification when auto-pausing
 * - Manual resume adds to overrides (won't auto-pause again until page reload)
 */

import { useEffect, useRef } from 'react';
import { useLogStore } from '../store/logStore';
import { getPerformanceSettings } from './useSettings';
import { useWebSocket } from './useWebSocket';

interface StreamRateTracker {
    prevTotal: number;
    rateHistory: number[];  // Last N rate samples for smoothing
    exceedingThresholdSince: number | null;  // Timestamp when started exceeding threshold
}

export function useAutoPauseMonitor() {
    const { streams, streamTotalReceived, autoPausedStreams, manualOverrides, addAutoPausedStream, addNotification } = useLogStore();
    const { pauseStream } = useWebSocket();

    // Track rate per channel
    const trackersRef = useRef<Record<string, StreamRateTracker>>({});

    // Use refs for values that change frequently to avoid recreating the interval
    const streamsRef = useRef(streams);
    streamsRef.current = streams;

    const streamTotalReceivedRef = useRef(streamTotalReceived);
    streamTotalReceivedRef.current = streamTotalReceived;

    const autoPausedStreamsRef = useRef(autoPausedStreams);
    autoPausedStreamsRef.current = autoPausedStreams;

    const manualOverridesRef = useRef(manualOverrides);
    manualOverridesRef.current = manualOverrides;

    const pauseStreamRef = useRef(pauseStream);
    pauseStreamRef.current = pauseStream;

    const addAutoPausedStreamRef = useRef(addAutoPausedStream);
    addAutoPausedStreamRef.current = addAutoPausedStream;

    const addNotificationRef = useRef(addNotification);
    addNotificationRef.current = addNotification;

    useEffect(() => {
        const CHECK_INTERVAL = 500; // Check every 500ms
        const RATE_HISTORY_SIZE = 4; // Keep 4 samples for smoothing (2 seconds of data)

        let tickCount = 0;
        const interval = setInterval(() => {
            tickCount++;
            const settings = getPerformanceSettings();

            // Log settings every 20 ticks (10 seconds)
            if (tickCount % 20 === 1) {
                console.log('[AutoPause] Settings:', {
                    enabled: settings.autoPauseEnabled,
                    rateThreshold: settings.autoPauseRateThreshold,
                    gracePeriod: settings.autoPauseGracePeriod
                });
            }

            // Skip if auto-pause is disabled
            if (!settings.autoPauseEnabled) return;

            const currentStreams = streamsRef.current;
            const totals = streamTotalReceivedRef.current;
            const paused = autoPausedStreamsRef.current;
            const overrides = manualOverridesRef.current;
            const trackers = trackersRef.current;

            const now = Date.now();
            const gracePeriodMs = settings.autoPauseGracePeriod * 1000;

            // Get all channels that have stream data
            const channels = Object.keys(currentStreams);
            if (channels.length === 0) {
                // No streams yet
                if (tickCount % 20 === 1) {
                    console.log('[AutoPause] No streams found');
                }
                return;
            }

            // Log channel count periodically
            if (tickCount % 20 === 1) {
                console.log(`[AutoPause] Checking ${channels.length} streams:`, channels);
            }

            // Check each stream channel
            for (const channel of channels) {
                // Skip if already paused or manually overridden
                if (paused.has(channel)) continue;
                if (overrides.has(channel)) continue;

                const currentTotal = totals[channel] || 0;

                // Initialize tracker if needed
                if (!trackers[channel]) {
                    trackers[channel] = {
                        prevTotal: currentTotal,
                        rateHistory: [],
                        exceedingThresholdSince: null
                    };
                    continue; // Skip first tick - need baseline
                }

                const tracker = trackers[channel];

                // Calculate rate (messages per second)
                // We check every 500ms, so multiply by 2 to get per-second rate
                const delta = currentTotal - tracker.prevTotal;
                const rate = delta * 2;
                tracker.prevTotal = currentTotal;

                // Add to history and keep last N samples
                tracker.rateHistory.push(rate);
                if (tracker.rateHistory.length > RATE_HISTORY_SIZE) {
                    tracker.rateHistory.shift();
                }

                // Calculate average rate from history for smoothing
                const avgRate = tracker.rateHistory.reduce((a, b) => a + b, 0) / tracker.rateHistory.length;

                // Check if exceeding threshold
                if (avgRate > settings.autoPauseRateThreshold) {
                    if (!tracker.exceedingThresholdSince) {
                        tracker.exceedingThresholdSince = now;
                        console.log(`[AutoPause] "${channel}" exceeds threshold: ${avgRate.toFixed(1)}/s > ${settings.autoPauseRateThreshold}/s, starting grace period`);
                    } else {
                        const elapsed = (now - tracker.exceedingThresholdSince) / 1000;
                        if (tickCount % 4 === 0) {
                            console.log(`[AutoPause] "${channel}" still high: ${avgRate.toFixed(1)}/s, elapsed: ${elapsed.toFixed(1)}s / ${settings.autoPauseGracePeriod}s`);
                        }
                        if (now - tracker.exceedingThresholdSince >= gracePeriodMs) {
                            // Grace period exceeded - auto-pause this stream
                            console.log(`[AutoPause] PAUSING "${channel}" - rate ${avgRate.toFixed(1)}/s exceeded for ${settings.autoPauseGracePeriod}s`);

                            pauseStreamRef.current(channel);
                            addAutoPausedStreamRef.current(channel);
                            addNotificationRef.current({
                                type: 'warning',
                                message: `Stream "${channel}" auto-paused (${avgRate.toFixed(0)} msg/s)`,
                                channel
                            });

                            // Reset tracker
                            tracker.exceedingThresholdSince = null;
                            tracker.rateHistory = [];
                        }
                    }
                } else {
                    // Below threshold - reset counter
                    if (tracker.exceedingThresholdSince) {
                        console.log(`[AutoPause] "${channel}" dropped below threshold: ${avgRate.toFixed(1)}/s, resetting grace period`);
                    }
                    tracker.exceedingThresholdSince = null;
                }
            }

            // Clean up trackers for channels that no longer exist
            for (const channel of Object.keys(trackers)) {
                if (!currentStreams[channel]) {
                    delete trackers[channel];
                }
            }
        }, CHECK_INTERVAL);

        return () => clearInterval(interval);
    }, []); // Empty deps - uses refs for all mutable values

    return null;
}
