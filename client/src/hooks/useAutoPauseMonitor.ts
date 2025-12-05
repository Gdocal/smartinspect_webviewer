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
    const { streamTotalReceived, streamSubscriptions, autoPausedStreams, manualOverrides, addAutoPausedStream, addNotification } = useLogStore();
    const { pauseStream } = useWebSocket();

    // Track rate per channel
    const trackersRef = useRef<Record<string, StreamRateTracker>>({});

    // Use refs for values that change frequently to avoid recreating the interval
    const streamTotalReceivedRef = useRef(streamTotalReceived);
    streamTotalReceivedRef.current = streamTotalReceived;

    const streamSubscriptionsRef = useRef(streamSubscriptions);
    streamSubscriptionsRef.current = streamSubscriptions;

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

        const interval = setInterval(() => {
            const settings = getPerformanceSettings();

            // Skip if auto-pause is disabled
            if (!settings.autoPauseEnabled) return;

            const totals = streamTotalReceivedRef.current;
            const subscriptions = streamSubscriptionsRef.current;
            const paused = autoPausedStreamsRef.current;
            const overrides = manualOverridesRef.current;
            const trackers = trackersRef.current;

            const now = Date.now();
            const gracePeriodMs = settings.autoPauseGracePeriod * 1000;

            // Count active (subscribed and not paused) streams
            const activeStreamCount = Object.entries(subscriptions).filter(
                ([, sub]) => sub.subscribed && !sub.paused
            ).length;

            // Skip if not enough active streams to trigger auto-pause
            if (activeStreamCount < settings.autoPauseStreamCountThreshold) {
                // Reset all trackers when below threshold
                for (const channel of Object.keys(trackers)) {
                    trackers[channel].exceedingThresholdSince = null;
                }
                return;
            }

            // Check each subscribed stream
            for (const [channel, sub] of Object.entries(subscriptions)) {
                // Skip if not subscribed, already paused, or manually overridden
                if (!sub.subscribed || sub.paused) continue;
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
                    } else if (now - tracker.exceedingThresholdSince >= gracePeriodMs) {
                        // Grace period exceeded - auto-pause this stream
                        console.log(`[AutoPause] Pausing stream "${channel}" - rate ${avgRate.toFixed(0)}/s exceeds threshold ${settings.autoPauseRateThreshold}/s`);

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
                } else {
                    // Below threshold - reset counter
                    tracker.exceedingThresholdSince = null;
                }
            }

            // Clean up trackers for channels that no longer exist
            for (const channel of Object.keys(trackers)) {
                if (!subscriptions[channel]) {
                    delete trackers[channel];
                }
            }
        }, CHECK_INTERVAL);

        return () => clearInterval(interval);
    }, []); // Empty deps - uses refs for all mutable values

    return null;
}
