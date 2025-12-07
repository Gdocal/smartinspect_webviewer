import { useEffect, useRef } from 'react';

interface UseScrollDetectionOptions {
  scrollElement: HTMLDivElement | null;
  onUserScrollUp: () => void;
  onScrollToBottom: () => void;
  isProgrammaticScroll: () => boolean;
  bottomThreshold?: number;
}

export function useScrollDetection({
  scrollElement,
  onUserScrollUp,
  onScrollToBottom,
  isProgrammaticScroll,
  bottomThreshold = 30,
}: UseScrollDetectionOptions) {
  const lastScrollTopRef = useRef(0);
  const isScrollbarDragRef = useRef(false);
  // Track if user scrolled up - only re-enable when they scroll back to bottom
  const userScrolledUpRef = useRef(false);

  useEffect(() => {
    if (!scrollElement) return;

    // Track wheel scrolling UP (user wants to see history)
    const handleWheel = (e: WheelEvent) => {
      // Only trigger if there's actually content to scroll (scrollbar exists)
      const hasScrollbar = scrollElement.scrollHeight > scrollElement.clientHeight;
      if (!hasScrollbar) return;

      if (e.deltaY < 0) {
        // Scrolling UP = negative deltaY
        userScrolledUpRef.current = true;
        onUserScrollUp();
      }
    };

    // Track scroll position changes
    const handleScroll = () => {
      if (isProgrammaticScroll()) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // Detect scroll direction
      const scrollingUp = scrollTop < lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;

      // If user scrolled up via any method, disable autoscroll
      if (scrollingUp && isScrollbarDragRef.current) {
        userScrolledUpRef.current = true;
        onUserScrollUp();
      }

      // Only re-enable autoscroll at bottom if user previously scrolled up
      // (not if they clicked the button to disable)
      if (distanceFromBottom < bottomThreshold && userScrolledUpRef.current) {
        userScrolledUpRef.current = false;
        onScrollToBottom();
      }
    };

    // Track scrollbar drag start
    const handleMouseDown = (e: MouseEvent) => {
      // Check if clicking on scrollbar area (right edge of element)
      const rect = scrollElement.getBoundingClientRect();
      const scrollbarWidth = scrollElement.offsetWidth - scrollElement.clientWidth;
      if (e.clientX > rect.right - scrollbarWidth - 5) {
        isScrollbarDragRef.current = true;
      }
    };

    const handleMouseUp = () => {
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
