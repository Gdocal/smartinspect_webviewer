import { useRef, useCallback, useEffect } from 'react';

// Debug logging - filter by grid name in console: "[AutoScroll:GridName]"
// Set DEBUG_ENABLED to a grid name string to enable logging for that grid only
// Examples: 'StreamsView', 'AllLogs', or true for all grids
const DEBUG_PREFIX = '[AutoScroll]';
const DEBUG_ENABLED: boolean | string = false; // Set to true for debugging

const debugLog = (message: string, data?: Record<string, unknown>) => {
  if (!DEBUG_ENABLED) return;
  if (data) {
    console.log(`${DEBUG_PREFIX} ${message}`, data);
  } else {
    console.log(`${DEBUG_PREFIX} ${message}`);
  }
};

interface AutoScrollState {
  isStuckToBottom: boolean;
  isProgrammaticScroll: boolean;
  userScrollTime: number;
  userDisabledTime: number;
  lastUpdateTime: number;
  averageRate: number;
  lastEntriesCount: number;
  lastEntryId: number | null;
}

// Threshold: below this rate (updates/sec), use smooth scrolling
const SMOOTH_SCROLL_RATE_THRESHOLD = 10;
// How quickly the smooth scroll catches up (0-1, lower = smoother)
const SMOOTH_SCROLL_LERP_FACTOR = 0.15;
// Minimum distance to animate (pixels)
const MIN_ANIMATE_DISTANCE = 2;

interface UseAutoScrollOptions {
  scrollElement: HTMLDivElement | null;
  entriesCount: number;
  autoScrollEnabled: boolean;
  onUserScrollUp?: () => void;
  lastEntryId?: number | null; // Optional: track content changes when count stays same
}

// Lock duration: how long after a wheel-up event to block auto-scroll (ms)
const WHEEL_LOCK_DURATION = 150;

export function useAutoScroll({
  scrollElement,
  entriesCount,
  autoScrollEnabled,
  onUserScrollUp,
  lastEntryId,
}: UseAutoScrollOptions) {
  const stateRef = useRef<AutoScrollState>({
    isStuckToBottom: true,
    isProgrammaticScroll: false,
    userScrollTime: 0,
    userDisabledTime: 0,
    lastUpdateTime: Date.now(),
    averageRate: 0,
    lastEntryId: null,
    lastEntriesCount: 0,
  });

  const animationRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  // Direct wheel-up timestamp for race condition prevention
  const wheelUpTimestampRef = useRef(0);

  // Continuous smooth scroll - lerps toward bottom
  const startSmoothScrollLoop = useCallback(() => {
    if (!scrollElement) {
      debugLog('startSmoothScrollLoop: no scrollElement');
      return;
    }
    if (isAnimatingRef.current) {
      debugLog('startSmoothScrollLoop: already animating, skip');
      return;
    }

    debugLog('startSmoothScrollLoop: STARTING smooth scroll loop');
    isAnimatingRef.current = true;
    stateRef.current.isProgrammaticScroll = true;

    const animate = () => {
      if (!scrollElement || !isAnimatingRef.current) {
        isAnimatingRef.current = false;
        stateRef.current.isProgrammaticScroll = false;
        return;
      }

      // Check for recent wheel-up events - stop animating if user is scrolling
      const timeSinceWheelUp = Date.now() - wheelUpTimestampRef.current;
      if (timeSinceWheelUp < WHEEL_LOCK_DURATION) {
        debugLog('animate: stopping due to wheel-up event');
        isAnimatingRef.current = false;
        stateRef.current.isProgrammaticScroll = false;
        stateRef.current.isStuckToBottom = false;
        return;
      }

      const target = scrollElement.scrollHeight - scrollElement.clientHeight;
      const current = scrollElement.scrollTop;
      const distance = target - current;

      if (distance > MIN_ANIMATE_DISTANCE) {
        // Lerp toward target - this creates smooth continuous motion
        const newPosition = current + distance * SMOOTH_SCROLL_LERP_FACTOR;
        scrollElement.scrollTop = newPosition;
      } else if (distance > 0) {
        // Close enough - snap to bottom
        scrollElement.scrollTop = target;
      }
      // Always keep the loop running - don't stop
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [scrollElement]);

  // Stop smooth scroll loop
  const stopSmoothScrollLoop = useCallback(() => {
    if (isAnimatingRef.current) {
      debugLog('stopSmoothScrollLoop: STOPPING smooth scroll loop');
    }
    isAnimatingRef.current = false;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    stateRef.current.isProgrammaticScroll = false;
  }, []);

  // Instant scroll (for high-speed mode)
  const instantScrollToBottom = useCallback(() => {
    if (!scrollElement) return;

    debugLog('instantScrollToBottom: using INSTANT scroll');
    stopSmoothScrollLoop();

    stateRef.current.isProgrammaticScroll = true;
    scrollElement.scrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;

    requestAnimationFrame(() => {
      stateRef.current.isProgrammaticScroll = false;
    });
  }, [scrollElement, stopSmoothScrollLoop]);

  // Smart scroll - chooses smooth or instant based on rate
  const scrollToBottom = useCallback(() => {
    if (!scrollElement) return;

    const rate = stateRef.current.averageRate;
    const useSmooth = rate < SMOOTH_SCROLL_RATE_THRESHOLD;

    debugLog('scrollToBottom: rate decision', {
      rate: rate.toFixed(2),
      threshold: SMOOTH_SCROLL_RATE_THRESHOLD,
      decision: useSmooth ? 'SMOOTH' : 'INSTANT',
    });

    if (useSmooth) {
      // Low rate - use continuous smooth scrolling
      startSmoothScrollLoop();
    } else {
      // High rate - use instant scroll for performance
      instantScrollToBottom();
    }
  }, [scrollElement, startSmoothScrollLoop, instantScrollToBottom]);

  const markUserScroll = useCallback(() => {
    stateRef.current.userScrollTime = Date.now();
    stateRef.current.isStuckToBottom = false;
    stopSmoothScrollLoop();
    onUserScrollUp?.();
  }, [onUserScrollUp, stopSmoothScrollLoop]);

  const markUserDisabled = useCallback(() => {
    stateRef.current.userDisabledTime = Date.now();
    stateRef.current.isStuckToBottom = false;
  }, []);

  const markStuckToBottom = useCallback(() => {
    stateRef.current.isStuckToBottom = true;
  }, []);

  // Track update rate using time-window approach (entries per second over last 2 seconds)
  // This measures actual entries added, not store update frequency
  const rateWindowRef = useRef<{ timestamp: number; count: number }[]>([]);
  const RATE_WINDOW_MS = 2000; // 2 second sliding window

  useEffect(() => {
    const now = Date.now();
    const entriesAdded = entriesCount - stateRef.current.lastEntriesCount;

    // Only track when entries actually increased
    if (entriesAdded > 0) {
      rateWindowRef.current.push({ timestamp: now, count: entriesAdded });
    }

    // Remove old entries from window
    rateWindowRef.current = rateWindowRef.current.filter(
      entry => now - entry.timestamp < RATE_WINDOW_MS
    );

    // Calculate entries per second over the window
    const totalEntries = rateWindowRef.current.reduce((sum, e) => sum + e.count, 0);
    const windowDuration = RATE_WINDOW_MS / 1000; // 2 seconds
    const entriesPerSecond = totalEntries / windowDuration;

    stateRef.current.averageRate = entriesPerSecond;
    stateRef.current.lastEntriesCount = entriesCount;
    stateRef.current.lastUpdateTime = now;

    debugLog('RATE TRACKING (window-based)', {
      entriesCount,
      entriesAdded,
      windowEntries: totalEntries,
      entriesPerSecond: entriesPerSecond.toFixed(2),
    });
  }, [entriesCount]);

  // Effect: scroll when entries count increases OR content changes (when at capacity)
  useEffect(() => {
    if (!autoScrollEnabled || !scrollElement) return;

    const prevCount = stateRef.current.lastEntriesCount;
    const prevEntryId = stateRef.current.lastEntryId;

    stateRef.current.lastEntriesCount = entriesCount;
    stateRef.current.lastEntryId = lastEntryId ?? null;

    // Detect if content changed: either count increased, or lastEntryId changed (grid at capacity)
    const countIncreased = entriesCount > prevCount;
    const contentChanged = lastEntryId !== undefined && lastEntryId !== prevEntryId;

    // Only react to new entries being added
    if (!countIncreased && !contentChanged) return;

    const timeSinceUserScroll = Date.now() - stateRef.current.userScrollTime;
    const timeSinceDisabled = Date.now() - stateRef.current.userDisabledTime;

    // Check if we're currently at the bottom (within threshold)
    // This prevents re-attaching when user is actively scrolling up
    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 10; // 10px - very strict threshold

    // Check for recent wheel-up events (race condition prevention)
    const timeSinceWheelUp = Date.now() - wheelUpTimestampRef.current;
    if (timeSinceWheelUp < WHEEL_LOCK_DURATION) {
      debugLog('entriesEffect: BLOCKED by recent wheel-up event', {
        timeSinceWheelUp,
        lockDuration: WHEEL_LOCK_DURATION,
      });
      return;
    }

    // Grace periods to avoid fighting user interaction
    // REQUIRE isStuckToBottom state - this is only true when:
    // 1. Initially (never scrolled), OR
    // 2. User manually scrolled back to bottom, OR
    // 3. User clicked "Resume" button
    if (timeSinceUserScroll > 300 && timeSinceDisabled > 2000 && stateRef.current.isStuckToBottom) {
      // Use requestAnimationFrame to delay scroll slightly
      // This allows any pending wheel events to fire first, preventing race conditions
      requestAnimationFrame(() => {
        // Re-check for recent wheel events inside the frame
        const timeSinceWheelUpInFrame = Date.now() - wheelUpTimestampRef.current;
        if (timeSinceWheelUpInFrame < WHEEL_LOCK_DURATION) {
          debugLog('entriesEffect: CANCELLED in rAF - recent wheel-up', { timeSinceWheelUpInFrame });
          return;
        }
        // Re-check isStuckToBottom after wheel events have had a chance to fire
        if (!stateRef.current.isStuckToBottom) {
          debugLog('entriesEffect: CANCELLED - user scrolled during frame');
          return;
        }
        debugLog('entriesEffect: content changed, triggering scroll', {
          entriesCount,
          lastEntryId,
          countIncreased,
          contentChanged,
          isAnimating: isAnimatingRef.current,
          distanceFromBottom,
        });
        scrollToBottom();
      });
    } else {
      debugLog('entriesEffect: BLOCKED by grace period or not stuck', {
        timeSinceUserScroll,
        timeSinceDisabled,
        countIncreased,
        contentChanged,
        distanceFromBottom,
        isAtBottom,
        isStuckToBottom: stateRef.current.isStuckToBottom,
      });
    }
  }, [entriesCount, lastEntryId, autoScrollEnabled, scrollToBottom, scrollElement]);

  // Start/stop scroll loop when autoScrollEnabled changes
  useEffect(() => {
    if (autoScrollEnabled && scrollElement) {
      debugLog('autoScrollEnabled changed: ENABLED - resetting state and jumping to bottom', {
        prevRate: stateRef.current.averageRate.toFixed(2),
      });
      stateRef.current.isStuckToBottom = true;
      // Reset grace periods when autoscroll is explicitly enabled
      // This ensures smooth scroll starts immediately without waiting for grace period
      stateRef.current.userScrollTime = 0;
      stateRef.current.userDisabledTime = 0;
      // Reset rate to 0 - subsequent entries will use rate-based scrolling
      stateRef.current.averageRate = 0;
      // Use instant scroll when autoscroll is enabled (initial load, resume button)
      // This avoids slow smooth scrolling through historical data on page refresh
      instantScrollToBottom();
    } else {
      debugLog('autoScrollEnabled changed: DISABLED - stopping scroll loop');
      // Stop the loop when autoscroll is disabled
      stopSmoothScrollLoop();
    }
  }, [autoScrollEnabled, scrollElement, instantScrollToBottom, stopSmoothScrollLoop]);

  // Direct wheel event listener for race condition prevention
  // This captures wheel-up events synchronously before React state can update
  useEffect(() => {
    if (!scrollElement) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        // User is scrolling UP - immediately mark the timestamp
        wheelUpTimestampRef.current = Date.now();
        debugLog('wheelUpTimestampRef: wheel-up detected', { timestamp: wheelUpTimestampRef.current });
      }
    };

    scrollElement.addEventListener('wheel', handleWheel, { passive: true });
    return () => scrollElement.removeEventListener('wheel', handleWheel);
  }, [scrollElement]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      stopSmoothScrollLoop();
    };
  }, [stopSmoothScrollLoop]);

  return {
    scrollToBottom,
    instantScrollToBottom,
    markUserScroll,
    markUserDisabled,
    markStuckToBottom,
    isProgrammaticScroll: () => stateRef.current.isProgrammaticScroll,
    isStuckToBottom: () => stateRef.current.isStuckToBottom,
    getCurrentRate: () => stateRef.current.averageRate,
  };
}
