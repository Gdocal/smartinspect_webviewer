import { useRef, useCallback, useEffect } from 'react';

interface AutoScrollState {
  isStuckToBottom: boolean;
  isProgrammaticScroll: boolean;
  userScrollTime: number;
  userDisabledTime: number;
  lastUpdateTime: number;
  averageRate: number;
  lastEntriesCount: number;
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
}

export function useAutoScroll({
  scrollElement,
  entriesCount,
  autoScrollEnabled,
  onUserScrollUp,
}: UseAutoScrollOptions) {
  const stateRef = useRef<AutoScrollState>({
    isStuckToBottom: true,
    isProgrammaticScroll: false,
    userScrollTime: 0,
    userDisabledTime: 0,
    lastUpdateTime: Date.now(),
    averageRate: 0,
    lastEntriesCount: 0,
  });

  const animationRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);

  // Continuous smooth scroll - lerps toward bottom
  const startSmoothScrollLoop = useCallback(() => {
    if (!scrollElement || isAnimatingRef.current) return;

    isAnimatingRef.current = true;
    stateRef.current.isProgrammaticScroll = true;

    const animate = () => {
      if (!scrollElement || !isAnimatingRef.current) {
        isAnimatingRef.current = false;
        stateRef.current.isProgrammaticScroll = false;
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

    if (rate < SMOOTH_SCROLL_RATE_THRESHOLD) {
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

  // Track update rate
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - stateRef.current.lastUpdateTime;

    if (timeSinceLastUpdate > 0) {
      // Calculate instantaneous rate
      const instantRate = 1000 / timeSinceLastUpdate;

      // Exponential moving average for smooth rate tracking
      const alpha = 0.3;
      stateRef.current.averageRate =
        alpha * instantRate + (1 - alpha) * stateRef.current.averageRate;
    }

    stateRef.current.lastUpdateTime = now;
  }, [entriesCount]);

  // Effect: scroll when entries count increases AND autoscroll is enabled
  useEffect(() => {
    if (!autoScrollEnabled || !scrollElement) return;

    const prevCount = stateRef.current.lastEntriesCount;
    stateRef.current.lastEntriesCount = entriesCount;

    // Only react to new entries being added
    if (entriesCount <= prevCount) return;

    const timeSinceUserScroll = Date.now() - stateRef.current.userScrollTime;
    const timeSinceDisabled = Date.now() - stateRef.current.userDisabledTime;

    // Grace periods to avoid fighting user interaction
    if (timeSinceUserScroll > 300 && timeSinceDisabled > 2000) {
      stateRef.current.isStuckToBottom = true;
      scrollToBottom();
    }
  }, [entriesCount, autoScrollEnabled, scrollToBottom, scrollElement]);

  // Start/stop scroll loop when autoScrollEnabled changes
  useEffect(() => {
    if (autoScrollEnabled && scrollElement) {
      stateRef.current.isStuckToBottom = true;
      scrollToBottom();  // Use rate-based decision (smooth vs instant)
    } else {
      // Stop the loop when autoscroll is disabled
      stopSmoothScrollLoop();
    }
  }, [autoScrollEnabled, scrollElement, scrollToBottom, stopSmoothScrollLoop]);

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
