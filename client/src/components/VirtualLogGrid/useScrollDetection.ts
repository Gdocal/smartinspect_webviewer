import { useEffect, useRef } from 'react';

interface UseScrollDetectionOptions {
  scrollElement: HTMLDivElement | null;
  onUserScrollUp: () => void;
  onScrollToBottom: () => void;
  isProgrammaticScroll: () => boolean;
  bottomThreshold?: number;
  /** External signal that user wants to stop autoscroll (e.g., clicked on a row) */
  userStoppedAutoscroll?: boolean;
}

export function useScrollDetection({
  scrollElement,
  onUserScrollUp,
  onScrollToBottom,
  isProgrammaticScroll,
  bottomThreshold = 30,
  userStoppedAutoscroll = false,
}: UseScrollDetectionOptions) {
  const lastScrollTopRef = useRef(0);
  const isScrollbarDragRef = useRef(false);
  // Track if user scrolled up - only re-enable when they scroll back to bottom
  const userScrolledUpRef = useRef(false);
  // Grace period timestamp - don't re-enable autoscroll immediately after user stops it
  const userStopTimeRef = useRef(0);
  const GRACE_PERIOD_MS = 300;

  // Sync external signal to internal ref (e.g., when user clicks on a row)
  useEffect(() => {
    if (userStoppedAutoscroll) {
      userScrolledUpRef.current = true;
      // Record when user stopped autoscroll to prevent immediate re-enable
      userStopTimeRef.current = performance.now();
    }
  }, [userStoppedAutoscroll]);

  useEffect(() => {
    if (!scrollElement) return;

    // Track wheel scrolling - UP disables autoscroll, DOWN to bottom re-enables
    const handleWheel = (e: WheelEvent) => {
      // Only trigger if there's actually content to scroll (scrollbar exists)
      const hasScrollbar = scrollElement.scrollHeight > scrollElement.clientHeight;
      if (!hasScrollbar) return;

      if (e.deltaY < 0) {
        // Scrolling UP = negative deltaY
        userScrolledUpRef.current = true;
        onUserScrollUp();
      } else if (e.deltaY > 0) {
        // Scrolling DOWN - check if we'll reach bottom after this scroll
        // Use requestAnimationFrame to check position after scroll is applied
        requestAnimationFrame(() => {
          const { scrollTop, scrollHeight, clientHeight } = scrollElement;
          const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
          const withinGracePeriod = performance.now() - userStopTimeRef.current < GRACE_PERIOD_MS;
          if (distanceFromBottom < bottomThreshold && userScrolledUpRef.current && !withinGracePeriod) {
            userScrolledUpRef.current = false;
            onScrollToBottom();
          }
        });
      }
    };

    // Track scroll position changes
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // Detect scroll direction
      const scrollingUp = scrollTop < lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;

      // During scrollbar drag, detect scroll up and bottom
      if (isScrollbarDragRef.current) {
        if (scrollingUp) {
          userScrolledUpRef.current = true;
          onUserScrollUp();
        }
        // Check for reaching bottom during drag
        // Check grace period - don't re-enable immediately after user stopped autoscroll
        const withinGracePeriod = performance.now() - userStopTimeRef.current < GRACE_PERIOD_MS;
        if (distanceFromBottom < bottomThreshold && userScrolledUpRef.current && !withinGracePeriod) {
          userScrolledUpRef.current = false;
          onScrollToBottom();
        }
        return;
      }

      // Skip other scroll handling during programmatic scroll
      if (isProgrammaticScroll()) return;

      // Only re-enable autoscroll at bottom if user previously scrolled up
      // (not if they clicked the button to disable)
      // Also check grace period to prevent immediate re-enable after click
      const withinGracePeriod = performance.now() - userStopTimeRef.current < GRACE_PERIOD_MS;
      if (distanceFromBottom < bottomThreshold && userScrolledUpRef.current && !withinGracePeriod) {
        userScrolledUpRef.current = false;
        onScrollToBottom();
      }
    };

    // Track scrollbar drag start - immediately disable autoscroll when user grabs scrollbar
    const handleMouseDown = (e: MouseEvent) => {
      // Check if clicking on scrollbar area (right edge of element)
      const rect = scrollElement.getBoundingClientRect();
      const scrollbarWidth = scrollElement.offsetWidth - scrollElement.clientWidth;
      if (e.clientX > rect.right - scrollbarWidth - 5) {
        isScrollbarDragRef.current = true;
        // Immediately disable autoscroll when user grabs scrollbar
        // This prevents the "fighting" behavior where autoscroll tries to take over
        userScrolledUpRef.current = true;
        onUserScrollUp();
      }
    };

    const handleMouseUp = () => {
      // On mouseup after scrollbar drag, check if we're at the bottom
      if (isScrollbarDragRef.current && scrollElement) {
        const { scrollTop, scrollHeight, clientHeight } = scrollElement;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        // Use absolute distance: if within 50px of bottom, user wants autoscroll
        // This is more reliable than percentage, especially with frozen entries during drag
        if (distanceFromBottom < 50 && userScrolledUpRef.current) {
          userScrolledUpRef.current = false;
          onScrollToBottom();
        }
      }
      isScrollbarDragRef.current = false;
    };

    // Keyboard scroll detection
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') {
        onUserScrollUp();
      }
    };

    scrollElement.addEventListener('wheel', handleWheel, { passive: true });
    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    scrollElement.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    scrollElement.addEventListener('keydown', handleKeyDown);

    return () => {
      scrollElement.removeEventListener('wheel', handleWheel);
      scrollElement.removeEventListener('scroll', handleScroll);
      scrollElement.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      scrollElement.removeEventListener('keydown', handleKeyDown);
    };
  }, [scrollElement, onUserScrollUp, onScrollToBottom, isProgrammaticScroll, bottomThreshold]);
}
