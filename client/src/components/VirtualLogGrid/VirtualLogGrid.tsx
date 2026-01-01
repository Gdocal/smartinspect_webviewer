import React, { useRef, useCallback, useEffect, useLayoutEffect, useMemo, useState, CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LogEntry, HighlightRule, matchesHighlightRule, matchesPreviewTitleFilter, useLogStore } from '../../store/logStore';
import { useTraceStore, fetchTrace, fetchTraceTree } from '../../store/traceStore';
import { VirtualLogGridRow } from './VirtualLogGridRow';
import { VirtualLogGridHeader } from './VirtualLogGridHeader';
import { RowContextMenu, formatSelectionForCopy, copyToClipboard } from './RowContextMenu';
import { TitleHighlightModal } from '../TitleHighlightModal';
import { useAutoScroll } from './useAutoScroll';
import { useScrollDetection } from './useScrollDetection';
import { OVERSCAN_DRAG, getRowHeight, getFontSize, getHeaderHeight } from './constants';
import { DEFAULT_COLUMNS, ColumnConfig } from './types';
import { ThreadLinesPanel } from '../ThreadLinesPanel';
import '../ThreadLinesPanel/ThreadLinesPanel.css';

// Debug logging for scroll issues
const DEBUG_SCROLL = false; // Set to true for scroll debugging
const scrollLog = {
  debug: (msg: string) => DEBUG_SCROLL && console.debug(`[VLG:Scroll] ${msg}`),
  info: (msg: string) => DEBUG_SCROLL && console.log(`[VLG:Scroll] ${msg}`),
  warn: (msg: string) => DEBUG_SCROLL && console.warn(`[VLG:Scroll] ${msg}`),
  enter: (method: string) => DEBUG_SCROLL && console.group(`[VLG:Scroll] >>> ${method}`),
  leave: (_method: string) => DEBUG_SCROLL && console.groupEnd(),
};


// Debug logging for flicker investigation
const DEBUG_FLICKER = false;
const flickerLog = (msg: string, data?: Record<string, unknown>) => {
  if (!DEBUG_FLICKER) return;
  const timestamp = performance.now().toFixed(2);
  if (data) {
    console.log(`[Flicker:${timestamp}] ${msg}`, data);
  } else {
    console.log(`[Flicker:${timestamp}] ${msg}`);
  }
};

// Cache for highlight styles to avoid recreating objects
const highlightStyleCache = new Map<string, CSSProperties>();
const MAX_CACHE_SIZE = 100;

// Cache for row position styles to avoid recreating objects
const rowStyleCache = new Map<string, CSSProperties>();
const ROW_STYLE_CACHE_SIZE = 200;

// Cell selection range
export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

// Multi-selection: array of ranges for non-contiguous selections
export interface MultiSelection {
  ranges: CellRange[];
  // Anchor point for Shift+Click range extension
  anchor?: { row: number; col: number };
}

export interface VirtualLogGridProps {
  entries: LogEntry[];
  autoScroll: boolean;
  onAutoScrollChange?: (enabled: boolean) => void;
  selection?: MultiSelection | null;
  onSelectionChange?: (selection: MultiSelection | null) => void;
  theme?: 'light' | 'dark';
  alternatingRows?: boolean;
  columns?: ColumnConfig[];
  onColumnsChange?: (columns: ColumnConfig[]) => void;
  highlightRules?: HighlightRule[];
  /** Called when user clicks on a row (not during drag selection) */
  onRowClick?: (entry: LogEntry, rowIndex: number) => void;
  /** ID of the row to highlight as "selected" (for detail panel, etc.) */
  selectedRowId?: number | null;
  /** Called when stuckToBottom state changes (for UI feedback about autoscroll) */
  onStuckToBottomChange?: (stuckToBottom: boolean) => void;
  /** Actual entry count for rate tracking (when using progressive display) */
  actualEntryCount?: number;
  /** Cumulative count of trimmed entries for virtual padding scroll stability */
  lastTrimCount?: number;
  /** Called when first visible row changes (for safe trimming) */
  onFirstVisibleRowChange?: (firstVisibleRow: number) => void;
  /** Called with scroll mode info for debug display */
  onScrollModeChange?: (info: { isAnimating: boolean; wouldUseSmooth: boolean; rate: number }) => void;
  /** Available context keys (for thread lines panel) */
  availableContextKeys?: string[];
}

// Get normalized range (start <= end)
function normalizeRange(range: CellRange): CellRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endRow: Math.max(range.startRow, range.endRow),
    endCol: Math.max(range.startCol, range.endCol),
  };
}

// Check if a cell is within any selection range
function isCellSelected(rowIndex: number, colIndex: number, selection: MultiSelection | null): boolean {
  if (!selection || selection.ranges.length === 0) return false;
  return selection.ranges.some(range => {
    const norm = normalizeRange(range);
    return (
      rowIndex >= norm.startRow &&
      rowIndex <= norm.endRow &&
      colIndex >= norm.startCol &&
      colIndex <= norm.endCol
    );
  });
}

// Find which range contains the cell (for border rendering)
function findContainingRange(rowIndex: number, colIndex: number, selection: MultiSelection | null): CellRange | null {
  if (!selection || selection.ranges.length === 0) return null;
  for (const range of selection.ranges) {
    const norm = normalizeRange(range);
    if (
      rowIndex >= norm.startRow &&
      rowIndex <= norm.endRow &&
      colIndex >= norm.startCol &&
      colIndex <= norm.endCol
    ) {
      return norm;
    }
  }
  return null;
}

// Get cell selection position within its containing range (for border rendering)
function getCellPosition(rowIndex: number, colIndex: number, selection: MultiSelection | null): {
  isTop: boolean;
  isBottom: boolean;
  isLeft: boolean;
  isRight: boolean;
} {
  const range = findContainingRange(rowIndex, colIndex, selection);
  if (!range) return { isTop: false, isBottom: false, isLeft: false, isRight: false };
  return {
    isTop: rowIndex === range.startRow,
    isBottom: rowIndex === range.endRow,
    isLeft: colIndex === range.startCol,
    isRight: colIndex === range.endCol,
  };
}

// Render counter for debugging
let renderCount = 0;
// Global refs for drag state (to check in render)
let globalIsMouseDown = false;
let globalIsScrollbarDrag = false;

// Helper to check mouse down state from both local and window (for ViewGrid sync)
const isMouseDownGlobal = () => {
  return globalIsMouseDown || (window as unknown as { __vlgMouseDown?: boolean }).__vlgMouseDown === true;
};

// Inner component - the actual implementation
function VirtualLogGridInner({
  entries,
  autoScroll,
  onAutoScrollChange: _onAutoScrollChange,
  selection,
  onSelectionChange,
  theme = 'dark',
  alternatingRows = true,
  columns = DEFAULT_COLUMNS,
  onColumnsChange,
  highlightRules = [],
  onRowClick,
  selectedRowId,
  onStuckToBottomChange,
  actualEntryCount,
  lastTrimCount = 0,
  onFirstVisibleRowChange,
  onScrollModeChange,
  availableContextKeys = [],
}: VirtualLogGridProps) {
  renderCount++;
  const currentRender = renderCount;
  flickerLog('RENDER', { entriesCount: entries.length, autoScroll });

  void _onAutoScrollChange;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track mouse Y position during scrollbar drag (moved early for useLayoutEffect access)
  const mouseYRef = useRef(0);
  const scrollbarTopRef = useRef(0);
  const scrollbarHeightRef = useRef(0);

  // Track the last known good scroll position during drag
  // Updated by scroll events, used for restoration after re-renders
  const lastGoodScrollRef = useRef<number | null>(null);

  // Log renders during scrollbar drag for debugging
  // Note: Some re-renders may still occur from React's concurrent scheduler processing
  // pending work, but they should be harmless because:
  // 1. We restore scroll position via lastGoodScrollRef in useLayoutEffect
  // 2. The observeElementOffset callback skips virtualizer updates during drag
  if (isMouseDownGlobal() && globalIsScrollbarDrag) {
    // Only warn on first few renders to avoid log spam
    if (currentRender % 50 === 0) {
      scrollLog.debug(`Render #${currentRender} during scrollbar drag (normal - scroll is stable)`);
    }
  }

  // Restore scroll to last known good position after every render during drag
  // The key insight: lastGoodScrollRef is updated by scroll events BEFORE re-renders,
  // so it contains the user's intended scroll position
  useLayoutEffect(() => {
    if (isMouseDownGlobal() && globalIsScrollbarDrag && lastGoodScrollRef.current !== null) {
      const container = scrollContainerRef.current;
      if (container) {
        const currentScroll = container.scrollTop;
        const targetScroll = lastGoodScrollRef.current;
        const deviation = Math.abs(currentScroll - targetScroll);
        if (deviation > 5) { // Only correct if significantly off
          scrollLog.warn(`RESTORE: ${currentScroll|0} -> ${targetScroll|0} (dev=${deviation|0})`);
          container.scrollTop = targetScroll;
        }
      }
    }
  });

  // Get row density, preview filter, context fade filter, ribbon key, and thread lines from store
  const rowDensity = useLogStore((state) => state.rowDensity);
  const previewTitleFilter = useLogStore((state) => state.previewTitleFilter);
  const contextFadeFilter = useLogStore((state) => state.contextFadeFilter);
  const contextRibbonKey = useLogStore((state) => state.contextRibbonKey);
  const showThreadLinesPanel = useLogStore((state) => state.showThreadLinesPanel);
  const threadLineColumns = useLogStore((state) => state.threadLineColumns);
  const setTracesMode = useLogStore((state) => state.setTracesMode);
  const rowHeight = getRowHeight(rowDensity);
  const fontSize = getFontSize(rowDensity);
  const headerHeight = getHeaderHeight(rowDensity);

  // Trace store actions - using refs to avoid re-renders
  const traceStore = useTraceStore();

  // Handle trace ID click - navigates to Traces tab
  const handleTraceClick = useCallback(async (traceId: string) => {
    setTracesMode(true);
    traceStore.setSelectedTraceId(traceId);
    traceStore.setLoadingTrace(true);
    traceStore.setLoadingTree(true);

    try {
      const [fullTrace, tree] = await Promise.all([
        fetchTrace(traceId),
        fetchTraceTree(traceId)
      ]);
      traceStore.setSelectedTrace(fullTrace);
      traceStore.setTraceTree(tree);
    } catch (err) {
      traceStore.setError(err instanceof Error ? err.message : 'Failed to load trace');
    } finally {
      traceStore.setLoadingTrace(false);
      traceStore.setLoadingTree(false);
    }
  }, [setTracesMode, traceStore]);

  // Internal state: is the scrollbar at the bottom?
  const [stuckToBottom, setStuckToBottom] = useState(true);

  // Track if mouse is down on scroll container (to pause scroll compensation during drag)
  const isMouseDownRef = useRef(false);
  // Track if user was at bottom when mouse went down (to scroll to bottom on release)
  const wasAtBottomOnMouseDownRef = useRef(false);
  // Track scroll position when mouse went down (to detect if user scrolled up during drag)
  const scrollTopOnMouseDownRef = useRef(0);

  // Track trim count for scroll compensation
  const prevTrimCountRef = useRef(lastTrimCount);

  // Track number of rows below visible viewport (updated on scroll)
  const [rowsBelowViewport, setRowsBelowViewport] = useState(0);

  // Track if scrollbar is visible
  const [hasScrollbar, setHasScrollbar] = useState(false);

  // Track scroll position for ThreadLinesPanel sync
  // Use ref to avoid re-renders during scroll - only update state via RAF throttle
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRafRef = useRef<number | null>(null);
  const lastScrollTopStateRef = useRef(0);

  // Track if virtualized content is ready (to show skeletons initially)
  // Note: Skeleton rows removed - striped background shows through gaps during fast scroll instead

  // Scroll velocity tracking for debug logging only (no state updates during scroll)
  const lastScrollTopRef = useRef(0);
  const lastScrollTimeRef = useRef(0);
  const velocityRef = useRef(0);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    clickedEntry: LogEntry | null;
    clickedColIndex: number;
  }>({ isOpen: false, position: { x: 0, y: 0 }, clickedEntry: null, clickedColIndex: 0 });

  // Title modal state (supports both highlight and view modes)
  const [titleModalState, setTitleModalState] = useState<{ entry: LogEntry; mode: 'highlight' | 'view' } | null>(null);

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ row: number; col: number } | null>(null);
  const autoScrollIntervalRef = useRef<number | null>(null);
  const clickStartRef = useRef<{ row: number; time: number } | null>(null);

  // Refs for values that change frequently but shouldn't cause listener re-attachment
  // This prevents mouseup events from being missed during rapid updates
  const entriesRef = useRef(entries);
  const selectionRef = useRef(selection);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onRowClickRef = useRef(onRowClick);
  entriesRef.current = entries;
  selectionRef.current = selection;
  onSelectionChangeRef.current = onSelectionChange;
  onRowClickRef.current = onRowClick;

  // Track if grid is active (clicked) for keyboard event handling
  const isGridActiveRef = useRef(false);

  // Track mount state to ensure keyboard listeners are attached after container is ready
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Effective autoscroll = user wants it AND scrollbar is at bottom
  const effectiveAutoScroll = autoScroll && stuckToBottom && !isDragging;

  // Get the last entry ID for better scroll tracking
  const lastEntryId = entries.length > 0 ? entries[entries.length - 1]?.id : null;

  // Use actualEntryCount for rate calculation (to avoid progressive display inflating the rate)
  const rateTrackingCount = actualEntryCount ?? entries.length;

  // Autoscroll hook
  const {
    markUserScroll,
    markStuckToBottom,
    isProgrammaticScroll,
    instantScrollToBottom,
    isAnimating,
    wouldUseSmooth,
    getCurrentRate,
  } = useAutoScroll({
    scrollElement: scrollContainerRef.current,
    entriesCount: rateTrackingCount, // Use actual count for rate tracking
    autoScrollEnabled: effectiveAutoScroll,
    onUserScrollUp: () => {
      setStuckToBottom(false);
    },
    lastEntryId,
    componentName: 'AllLogs', // VirtualLogGrid used in All Logs view
  });

  // Report scroll mode for debug display
  useEffect(() => {
    if (!onScrollModeChange) return;
    const interval = setInterval(() => {
      onScrollModeChange({
        isAnimating: isAnimating(),
        wouldUseSmooth: wouldUseSmooth(),
        rate: getCurrentRate(),
      });
    }, 500);
    return () => clearInterval(interval);
  }, [onScrollModeChange, isAnimating, wouldUseSmooth, getCurrentRate]);

  // Handler for "Jump to bottom" button - for re-enabling autoscroll at high data rates
  const handleJumpToBottom = useCallback(() => {
    setStuckToBottom(true);
    setRowsBelowViewport(0);
    markStuckToBottom();
    instantScrollToBottom();
  }, [markStuckToBottom, instantScrollToBottom]);

  // Scroll detection hook
  useScrollDetection({
    scrollElement: scrollContainerRef.current,
    onUserScrollUp: useCallback(() => {
      markUserScroll();
      setStuckToBottom(false);
    }, [markUserScroll]),
    onScrollToBottom: useCallback(() => {
      markStuckToBottom();
      setStuckToBottom(true);
      setRowsBelowViewport(0);
    }, [markStuckToBottom]),
    isProgrammaticScroll,
    // Signal to useScrollDetection that user stopped autoscroll (e.g., clicked on row)
    // This enables scrolling back to bottom to re-enable autoscroll
    userStoppedAutoscroll: !stuckToBottom,
  });

  // Calculate initial scroll offset for auto-scroll mode
  // This tells the virtualizer to render bottom rows on first mount, preventing flicker
  const initialScrollOffset = useMemo(() => {
    if (!effectiveAutoScroll || entries.length === 0) return 0;
    // Estimate: total virtual height minus typical viewport height
    // Use 600px as reasonable viewport estimate (actual is ~546px based on logs)
    const estimatedTotalHeight = entries.length * rowHeight;
    const estimatedViewport = 600;
    const offset = Math.max(0, estimatedTotalHeight - estimatedViewport);
    flickerLog('initialScrollOffset calculated', {
      entriesLen: entries.length,
      rowHeight,
      estimatedTotalHeight,
      offset
    });
    return offset;
  }, []); // Empty deps - only calculate once on mount

  // Use maximum overscan always for smooth scrolling
  // Dynamic overscan caused jerky scrolling due to re-renders when velocity crossed thresholds
  // The extra DOM nodes are worth the smooth experience
  const currentOverscan = OVERSCAN_DRAG;

  // Track last scroll offset for throttled updates during drag
  const lastScrollOffsetRef = useRef(0);
  const pendingScrollUpdateRef = useRef<number | null>(null);
  const lastDragUpdateTimeRef = useRef(0);
  const deferredDragUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Custom observeElementOffset with throttled updates during scrollbar drag
  // During drag: defer virtualizer updates until mouse pauses (150ms), then update once
  // This allows rows to render when user pauses, but prevents fighting during active drag
  const observeElementOffset = useCallback(
    <T extends Element>(
      instance: { scrollElement: T | null; targetWindow: Window | null; options: { horizontal?: boolean } },
      cb: (offset: number, isScrolling: boolean) => void
    ) => {
      const element = instance.scrollElement;
      if (!element) return;

      const targetWindow = instance.targetWindow;
      if (!targetWindow) return;

      const handler = (event?: Event) => {
        const offset = instance.options.horizontal
          ? element.scrollLeft
          : element.scrollTop;

        lastScrollOffsetRef.current = offset;

        // During scrollbar drag: use deferred update strategy
        // Update only when mouse pauses for 150ms to allow rows to render
        // without causing scroll position fighting during active drag
        if (isMouseDownGlobal() && globalIsScrollbarDrag) {
          // Clear any pending deferred update
          if (deferredDragUpdateRef.current !== null) {
            clearTimeout(deferredDragUpdateRef.current);
          }

          // Schedule a deferred update - will fire when mouse pauses
          deferredDragUpdateRef.current = setTimeout(() => {
            // Re-read current scroll position (may have changed)
            const currentOffset = instance.options.horizontal
              ? element.scrollLeft
              : element.scrollTop;
            cb(currentOffset, false);
            lastDragUpdateTimeRef.current = performance.now();
            deferredDragUpdateRef.current = null;
          }, 150);

          return;
        }

        // Normal scrolling: always update immediately (but with isScrolling=false for async)
        cb(offset, false);
        void event; // suppress unused warning
      };

      handler(); // Initial call

      element.addEventListener('scroll', handler, { passive: true });

      return () => {
        if (pendingScrollUpdateRef.current !== null) {
          cancelAnimationFrame(pendingScrollUpdateRef.current);
        }
        if (deferredDragUpdateRef.current !== null) {
          clearTimeout(deferredDragUpdateRef.current);
        }
        element.removeEventListener('scroll', handler);
      };
    },
    []
  );

  // TanStack Virtual virtualizer with custom scroll observation
  // Note: We use a custom observeElementOffset that skips callbacks during scrollbar drag
  // This prevents the virtualizer from triggering flushSync re-renders during drag.
  // However, React's concurrent scheduler may still process pending work - that's OK
  // because we track scroll position via lastGoodScrollRef and restore if needed.
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: currentOverscan,
    getItemKey: (index) => entries[index]?.id ?? index,
    initialOffset: initialScrollOffset,
    observeElementOffset,
  });

  // CRITICAL: Force virtualizer to initialize by dispatching a scroll event after mount
  // This ensures the virtualizer calculates visible items even before user interaction
  const hasEntries = entries.length > 0;
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && hasEntries) {
      // Small delay to ensure container is fully rendered
      const timer = setTimeout(() => {
        container.dispatchEvent(new Event('scroll'));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [hasEntries]); // Only run when we first get entries

  // Scroll velocity tracking for dynamic overscan
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let lastLogTime = 0;
    const LOG_THROTTLE_MS = 100; // Log at most every 100ms

    const handleScroll = () => {
      const now = performance.now();
      const scrollTop = container.scrollTop;
      const { scrollHeight, clientHeight } = container;
      const timeDelta = now - lastScrollTimeRef.current;

      // During scrollbar drag, track the scroll position and log for debugging
      if (isMouseDownRef.current && isScrollbarDragRef.current) {
        // Update last known good scroll position - this is what the user dragged to
        lastGoodScrollRef.current = scrollTop;

        const scrollDelta = scrollTop - lastScrollTopRef.current;
        const heightChange = scrollHeight - scrollHeightAtDragStartRef.current;
        const hc = heightChange !== 0 ? ` h${heightChange > 0 ? '+' : ''}${heightChange}` : '';

        scrollLog.info(`DRAG t=${scrollTop|0} d=${scrollDelta|0} lastGood=${lastGoodScrollRef.current}${hc}`);

        if (heightChange !== 0) scrollLog.warn(`HEIGHT CHANGED ${scrollHeightAtDragStartRef.current}->${scrollHeight}`);
      }

      if (timeDelta > 0 && lastScrollTimeRef.current > 0) {
        const scrollDelta = Math.abs(scrollTop - lastScrollTopRef.current);
        const velocity = (scrollDelta / timeDelta) * 1000; // pixels per second

        // Smooth velocity with exponential moving average (for debug logging only)
        velocityRef.current = velocityRef.current * 0.3 + velocity * 0.7;

        // Throttled scroll position logging
        if (DEBUG_SCROLL && now - lastLogTime > LOG_THROTTLE_MS && !isScrollbarDragRef.current) {
          lastLogTime = now;
          const maxScroll = scrollHeight - clientHeight;
          const scrollPercent = maxScroll > 0 ? ((scrollTop / maxScroll) * 100).toFixed(1) : '0';
          scrollLog.debug(`Scroll: top=${scrollTop.toFixed(0)}, velocity=${velocityRef.current.toFixed(0)}px/s, pos=${scrollPercent}%`);
        }
      }

      lastScrollTopRef.current = scrollTop;
      lastScrollTimeRef.current = now;

      // Update scrollTop state for ThreadLinesPanel sync via RAF throttle
      // This prevents re-renders on every scroll tick - only update once per frame
      // and only if the scroll changed significantly (>10px)
      if (!isMouseDownGlobal() && scrollTopRafRef.current === null) {
        scrollTopRafRef.current = requestAnimationFrame(() => {
          scrollTopRafRef.current = null;
          const currentScroll = container.scrollTop;
          // Only trigger state update if scroll changed significantly
          if (Math.abs(currentScroll - lastScrollTopStateRef.current) > 10) {
            lastScrollTopStateRef.current = currentScroll;
            setScrollTop(currentScroll);
          }
        });
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTopRafRef.current !== null) {
        cancelAnimationFrame(scrollTopRafRef.current);
      }
    };
  }, []);

  // Track if initial scroll has been done (to prevent flicker on mount)
  const hasInitialScrollRef = useRef(false);
  // Track previous entries length to detect room switches (entries cleared to 0)
  const prevEntriesLengthRef = useRef(entries.length);
  // Track mount count for debugging
  const mountCountRef = useRef(0);
  mountCountRef.current++;

  flickerLog('entries check', {
    prevLen: prevEntriesLengthRef.current,
    currentLen: entries.length,
    hasInitialScroll: hasInitialScrollRef.current
  });

  // Reset initial scroll flag when entries are cleared (room switch)
  if (prevEntriesLengthRef.current > 0 && entries.length === 0) {
    flickerLog('RESET hasInitialScrollRef - entries cleared (room switch)');
    hasInitialScrollRef.current = false;
  }
  prevEntriesLengthRef.current = entries.length;

  // Set initial scroll position to bottom BEFORE paint (prevents flicker)
  // This runs synchronously after DOM mutations but before browser paint
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    flickerLog('useLayoutEffect RUN', {
      hasContainer: !!container,
      hasInitialScroll: hasInitialScrollRef.current,
      entriesLength: entries.length,
      effectiveAutoScroll,
      scrollHeight: container?.scrollHeight,
      clientHeight: container?.clientHeight,
      scrollTop: container?.scrollTop,
      mountCount: mountCountRef.current,
    });

    if (!container) {
      flickerLog('useLayoutEffect SKIP - no container');
      return;
    }
    if (hasInitialScrollRef.current) {
      flickerLog('useLayoutEffect SKIP - already done initial scroll');
      return;
    }

    // Only do initial scroll if we have entries and autoscroll is enabled
    if (entries.length > 0 && effectiveAutoScroll) {
      const targetScroll = container.scrollHeight - container.clientHeight;
      flickerLog('useLayoutEffect SCROLLING', {
        from: container.scrollTop,
        to: targetScroll,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });
      container.scrollTop = targetScroll;
      hasInitialScrollRef.current = true;
    } else {
      flickerLog('useLayoutEffect SKIP - conditions not met', {
        entriesLength: entries.length,
        effectiveAutoScroll,
      });
    }
  }, [entries.length, effectiveAutoScroll]);

  // CRITICAL: Synchronous scroll-to-bottom when entries change while autoscroll is active
  // This runs BEFORE paint (useLayoutEffect) to prevent visual jumping
  // The useAutoScroll hook handles the smooth animation, but this ensures no jump on first frame
  const prevEntriesLenForScrollRef = useRef(entries.length);
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const prevLen = prevEntriesLenForScrollRef.current;
    const currentLen = entries.length;
    prevEntriesLenForScrollRef.current = currentLen;

    // Only scroll if entries were added (not removed) and autoscroll is active
    if (currentLen > prevLen && effectiveAutoScroll && stuckToBottom) {
      // Synchronously scroll to bottom before browser paints
      container.scrollTop = container.scrollHeight - container.clientHeight;
    }
  }, [entries.length, effectiveAutoScroll, stuckToBottom]);

  // Detect scrollbar visibility
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const checkScrollbar = () => {
      const hasVerticalScrollbar = container.scrollHeight > container.clientHeight;
      setHasScrollbar(hasVerticalScrollbar);
    };

    // Check initially and when entries change
    checkScrollbar();

    // Use ResizeObserver to detect size changes
    const resizeObserver = new ResizeObserver(checkScrollbar);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [entries.length]);

  // Notify parent when stuckToBottom changes
  useEffect(() => {
    onStuckToBottomChange?.(stuckToBottom);
  }, [stuckToBottom, onStuckToBottomChange]);

  // Reset scroll state when entries are cleared
  useEffect(() => {
    if (entries.length === 0) {
      setStuckToBottom(true);
      setRowsBelowViewport(0);
      prevTrimCountRef.current = 0;
    }
  }, [entries.length]);

  // Track if this is a scrollbar drag (vs content click)
  const isScrollbarDragRef = useRef(false);
  // Track scrollHeight at drag start to detect changes
  const scrollHeightAtDragStartRef = useRef(0);
  // Note: mouseYRef, scrollbarTopRef, scrollbarHeightRef are declared earlier (near top of component)

  // Track mouse down state to pause scroll compensation during scrollbar drag
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      isMouseDownRef.current = true;
      globalIsMouseDown = true;

      // Track if click is inside the grid container (for keyboard event handling)
      const gridContainer = containerRef.current;
      isGridActiveRef.current = gridContainer ? gridContainer.contains(e.target as Node) : false;

      // Check if clicking on scrollbar area (right edge of scroll container)
      const container = scrollContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const scrollbarWidth = container.offsetWidth - container.clientWidth;
        // Only track as scrollbar drag if clicking on the scrollbar area
        isScrollbarDragRef.current = e.clientX > rect.right - scrollbarWidth - 5;

        if (isScrollbarDragRef.current) {
          globalIsScrollbarDrag = true;
          const { scrollTop, scrollHeight, clientHeight } = container;
          const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
          wasAtBottomOnMouseDownRef.current = distanceFromBottom < 20;
          scrollTopOnMouseDownRef.current = scrollTop;
          scrollHeightAtDragStartRef.current = scrollHeight;
          mouseYRef.current = e.clientY;
          scrollbarTopRef.current = rect.top;
          scrollbarHeightRef.current = clientHeight;

          scrollLog.enter('ScrollbarDrag');
          scrollLog.info(`Scrollbar drag START: scrollTop=${scrollTop}, scrollHeight=${scrollHeight}, clientHeight=${clientHeight}, mouseY=${e.clientY}`);
        }
      }
    };
    const handleMouseUp = () => {
      const wasScrollbarDrag = isScrollbarDragRef.current;
      isMouseDownRef.current = false;

      // Only process autoscroll re-enable for scrollbar drags, not content clicks
      if (!isScrollbarDragRef.current) {
        isScrollbarDragRef.current = false;
        return;
      }

      // Check if user is at bottom of CURRENT (frozen) view BEFORE unfreeze happens
      const container = scrollContainerRef.current;
      let wasAtFrozenBottom = false;
      let didScrollUp = false;
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        // Use tight threshold - only if truly at the bottom of frozen view
        const threshold = 50; // 50px from bottom
        wasAtFrozenBottom = distanceFromBottom < threshold;
        // Check if user scrolled UP during drag (they want to see history, not autoscroll)
        didScrollUp = scrollTop < scrollTopOnMouseDownRef.current - 20; // 20px buffer for noise

        scrollLog.info(`Scrollbar drag END: scrollTop=${scrollTop}, distFromBottom=${distanceFromBottom.toFixed(0)}, wasAtFrozenBottom=${wasAtFrozenBottom}, didScrollUp=${didScrollUp}`);
      }

      // Only re-enable autoscroll if:
      // 1. User is at the frozen bottom (wasAtFrozenBottom)
      // 2. AND user didn't scroll up during the drag
      const shouldReEnableAutoscroll = wasAtFrozenBottom && !didScrollUp;

      if (shouldReEnableAutoscroll) {
        // Wait 2 frames for ViewGrid's freeze to release and scrollHeight to update
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Re-fetch container to get fresh scrollHeight after unfreeze
            const freshContainer = scrollContainerRef.current;
            if (freshContainer) {
              const newBottom = freshContainer.scrollHeight - freshContainer.clientHeight;
              freshContainer.scrollTop = newBottom;
              // Re-enable stuckToBottom React state after scrolling to bottom
              setStuckToBottom(true);
              markStuckToBottom();

              scrollLog.info(`Scrollbar drag: Re-enabled autoscroll, scrolled to ${newBottom}`);
            }
          });
        });
      }

      if (wasScrollbarDrag) {
        scrollLog.leave('ScrollbarDrag');
      }

      wasAtBottomOnMouseDownRef.current = false;
      scrollTopOnMouseDownRef.current = 0;
      isScrollbarDragRef.current = false;
      globalIsMouseDown = false;
      globalIsScrollbarDrag = false;
      lastGoodScrollRef.current = null; // Reset for next drag

      // Reset velocity tracking after drag ends
      velocityRef.current = 0;

      // Update scroll position for ThreadLinesPanel sync
      const finalContainer = scrollContainerRef.current;
      if (finalContainer) {
        setScrollTop(finalContainer.scrollTop);

        // CRITICAL: Force virtualizer to recalculate visible items
        // During drag, we blocked all virtualizer callbacks in observeElementOffset.
        // Now we need to dispatch a scroll event so the virtualizer updates.
        // Use requestAnimationFrame to ensure global flags are cleared first.
        requestAnimationFrame(() => {
          finalContainer.dispatchEvent(new Event('scroll'));
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isScrollbarDragRef.current) {
        mouseYRef.current = e.clientY;
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [markStuckToBottom]);

  // Scroll compensation when rows are trimmed (only when not stuck to bottom)
  // Adjusts scroll position to keep the same content visible
  // Also adjusts selection indices to stay on the same rows
  useEffect(() => {
    const trimmedSinceLastCheck = lastTrimCount - prevTrimCountRef.current;
    prevTrimCountRef.current = lastTrimCount;

    if (trimmedSinceLastCheck <= 0) return;

    // Adjust selection indices to compensate for trimmed rows
    if (selection && selection.ranges.length > 0 && onSelectionChange) {
      const adjustedRanges = selection.ranges
        .map(range => ({
          startRow: range.startRow - trimmedSinceLastCheck,
          endRow: range.endRow - trimmedSinceLastCheck,
          startCol: range.startCol,
          endCol: range.endCol,
        }))
        // Filter out ranges that are completely above the visible area
        .filter(range => range.endRow >= 0);

      // Clamp startRow to 0 if it went negative
      const clampedRanges = adjustedRanges.map(range => ({
        ...range,
        startRow: Math.max(0, range.startRow),
      }));

      if (clampedRanges.length !== selection.ranges.length ||
          clampedRanges.some((r, i) => r.startRow !== selection.ranges[i].startRow || r.endRow !== selection.ranges[i].endRow)) {
        onSelectionChange(clampedRanges.length > 0 ? {
          ranges: clampedRanges,
          anchor: selection.anchor ? {
            row: Math.max(0, selection.anchor.row - trimmedSinceLastCheck),
            col: selection.anchor.col,
          } : undefined,
        } : null);
      }
    }

    if (stuckToBottom) return; // No scroll compensation needed when at bottom
    if (isMouseDownRef.current) return; // Don't compensate during mouse drag

    const container = scrollContainerRef.current;
    if (!container) return;

    // Reduce scroll position by the height of trimmed rows
    const scrollReduction = trimmedSinceLastCheck * rowHeight;
    const newScrollTop = Math.max(0, container.scrollTop - scrollReduction);
    container.scrollTop = newScrollTop;
  }, [lastTrimCount, stuckToBottom, rowHeight, selection, onSelectionChange]);

  // Calculate rows below viewport dynamically on scroll and entries change
  // Also report first visible row for safe trimming
  const lastReportedFirstVisibleRef = useRef(-1);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const calculateScrollMetrics = () => {
      const { scrollTop, clientHeight } = container;
      const totalHeight = entries.length * rowHeight;
      const visibleBottom = scrollTop + clientHeight;
      const hiddenHeight = totalHeight - visibleBottom;
      const rowsBelow = Math.max(0, Math.floor(hiddenHeight / rowHeight));
      setRowsBelowViewport(rowsBelow);

      // Calculate and report first visible row (for safe trimming)
      const firstVisibleRow = Math.floor(scrollTop / rowHeight);
      if (onFirstVisibleRowChange && firstVisibleRow !== lastReportedFirstVisibleRef.current) {
        lastReportedFirstVisibleRef.current = firstVisibleRow;
        onFirstVisibleRowChange(firstVisibleRow);
      }
    };

    // Calculate initially
    calculateScrollMetrics();

    // Listen to scroll events
    container.addEventListener('scroll', calculateScrollMetrics, { passive: true });

    return () => container.removeEventListener('scroll', calculateScrollMetrics);
  }, [entries.length, rowHeight, onFirstVisibleRowChange]);

  // Pre-sort highlight rules once when they change
  const sortedHighlightRules = useMemo(
    () => [...highlightRules].sort((a, b) => b.priority - a.priority),
    [highlightRules]
  );

  // Log virtualizer state for debugging
  useEffect(() => {
    if (!DEBUG_SCROLL) return;

    const interval = setInterval(() => {
      const items = virtualizer.getVirtualItems();
      const container = scrollContainerRef.current;
      if (container && items.length > 0) {
        const { scrollTop, clientHeight } = container;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        const expectedFirstIndex = Math.floor(scrollTop / rowHeight);

        // Check for gaps (empty rows)
        const viewportTopRow = Math.floor(scrollTop / rowHeight);
        const viewportBottomRow = Math.floor((scrollTop + clientHeight) / rowHeight);
        const renderedIndices = new Set(items.map(i => i.index));

        let gapCount = 0;
        for (let i = viewportTopRow; i <= viewportBottomRow && i < entries.length; i++) {
          if (!renderedIndices.has(i)) {
            gapCount++;
          }
        }

        if (gapCount > 0) {
          scrollLog.warn(`GAPS DETECTED: ${gapCount} empty rows in viewport [${viewportTopRow}-${viewportBottomRow}], rendered=${items.length}, overscan=${currentOverscan}`);
        }

        scrollLog.debug(`Virtualizer: items=${items.length}, range=[${firstItem.index}-${lastItem.index}], expected=${expectedFirstIndex}, overscan=${currentOverscan}, entries=${entries.length}`);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [virtualizer, rowHeight, entries.length, currentOverscan]);

  // Get or create cached highlight style for a rule
  const getRuleStyle = useCallback((rule: HighlightRule): CSSProperties => {
    // Include style properties in cache key so changes are detected
    const cacheKey = `${rule.id}-${rule.style.backgroundColor || ''}-${rule.style.textColor || ''}-${rule.style.fontWeight || ''}-${rule.style.fontStyle || ''}`;
    let style = highlightStyleCache.get(cacheKey);
    if (!style) {
      style = {};
      if (rule.style.backgroundColor) style.backgroundColor = rule.style.backgroundColor;
      if (rule.style.textColor) style.color = rule.style.textColor;
      if (rule.style.fontWeight) style.fontWeight = rule.style.fontWeight;
      if (rule.style.fontStyle) style.fontStyle = rule.style.fontStyle as CSSProperties['fontStyle'];
      if (highlightStyleCache.size >= MAX_CACHE_SIZE) {
        const firstKey = highlightStyleCache.keys().next().value;
        if (firstKey) highlightStyleCache.delete(firstKey);
      }
      highlightStyleCache.set(cacheKey, style);
    }
    return style;
  }, []);

  // Get trace highlighting and depth indentation settings from store
  const traceHighlighting = useLogStore((state) => state.correlationHighlighting); // TODO: rename in store
  const depthIndentation = useLogStore((state) => state.depthIndentation);

  // Generate a consistent pastel color from traceId for visual grouping
  // Uses a simple hash to map traceId to one of many pastel colors
  const getTraceColor = useCallback((traceId: string): CSSProperties => {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < traceId.length; i++) {
      hash = ((hash << 5) - hash) + traceId.charCodeAt(i);
      hash = hash & hash;
    }

    // Generate pastel color using HSL
    // Hue: spread across color wheel (0-360), Saturation: 60% (soft), Lightness: 90% (very light)
    const hue = Math.abs(hash % 360);
    return {
      backgroundColor: `hsla(${hue}, 60%, 90%, 0.5)`,
    };
  }, []);

  // Get virtual items for rendering
  const virtualItems = virtualizer.getVirtualItems();

  // Debug: Check for index mismatch and empty virtualItems
  if (virtualItems.length === 0 && entries.length > 0) {
    console.error(`[VLG] NO VIRTUAL ITEMS! entries.length=${entries.length}, scrollContainer exists=${!!scrollContainerRef.current}`);
  } else if (virtualItems.length > 0) {
    const maxIndex = Math.max(...virtualItems.map(v => v.index));
    if (maxIndex >= entries.length) {
      console.error(`[VLG] INDEX MISMATCH! virtualizer maxIndex=${maxIndex}, entries.length=${entries.length}, count given=${entries.length}`);
    }
  }

  // Debug: Log render every 100 renders
  if (renderCount % 100 === 0) {
    const debugTotalSize = virtualizer.getTotalSize();
    console.log(`[VLG] Render #${renderCount}: entries=${entries.length}, virtualItems=${virtualItems.length}, totalSize=${debugTotalSize}`);
  }

  // PERFORMANCE: Compute highlight style inline during render, not in useMemo with virtualItems dependency
  // Having virtualItems as a dependency caused recomputation on every scroll, blocking the main thread
  const previewStyle: CSSProperties = useMemo(() => ({ backgroundColor: 'rgba(250, 204, 21, 0.3)' }), []);

  const getHighlightStyle = useCallback((entry: LogEntry): CSSProperties | undefined => {
    // Check preview filter first (highest priority)
    if (previewTitleFilter && matchesPreviewTitleFilter(entry, previewTitleFilter)) {
      return previewStyle;
    }

    // Then check regular highlight rules
    for (const rule of sortedHighlightRules) {
      if (matchesHighlightRule(entry, rule)) {
        return getRuleStyle(rule);
      }
    }

    // If no highlight rule and trace highlighting is enabled, apply trace color
    const traceId = entry.ctx?._traceId;
    if (traceHighlighting && traceId) {
      return getTraceColor(traceId);
    }

    return undefined;
  }, [sortedHighlightRules, getRuleStyle, previewTitleFilter, traceHighlighting, getTraceColor, previewStyle]);


  // PERFORMANCE: Compute fade state inline, not in useMemo with virtualItems dependency
  const getIsFaded = useCallback((entry: LogEntry): boolean => {
    if (!contextFadeFilter) return false;
    const matches = entry.ctx &&
      entry.ctx[contextFadeFilter.key] === contextFadeFilter.value;
    return !matches;
  }, [contextFadeFilter]);


  // Helper function to compute consistent hue from string value
  const getHueFromString = useCallback((str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash % 360);
  }, []);

  // PERFORMANCE: Compute ribbon hue inline, not in useMemo with virtualItems dependency
  const getRibbonHue = useCallback((entry: LogEntry): number | undefined => {
    if (!contextRibbonKey) return undefined;
    const value = entry.ctx?.[contextRibbonKey];
    return value ? getHueFromString(value) : undefined;
  }, [contextRibbonKey, getHueFromString]);


  // Get visible columns
  const visibleColumns = useMemo(
    () => columns.filter(col => !col.hidden),
    [columns]
  );

  // Debug: Log setup info
  useEffect(() => {
    console.log(`[VLG] Setup: entries=${entries.length}, columns visible=${visibleColumns.length}`, visibleColumns.map(c => c.id));
  }, [entries.length, visibleColumns]);

  // Pre-compute selection info per row for visible entries
  // This creates a stable reference for rows that aren't selected, avoiding re-renders
  type RowSelectionInfo = {
    hasSelection: boolean;
    // Serialized key for memo comparison - only changes when selection for this row changes
    selectionKey: string;
  };

  const rowSelectionMap = useMemo(() => {
    const map = new Map<number, RowSelectionInfo>();

    if (!selection || selection.ranges.length === 0) {
      // No selection - all rows get the same stable empty object
      return map;
    }

    // Build a set of all row indices that have any selection
    const selectedRows = new Set<number>();
    for (const range of selection.ranges) {
      const norm = normalizeRange(range);
      for (let row = norm.startRow; row <= norm.endRow; row++) {
        selectedRows.add(row);
      }
    }

    // Create selection info only for rows with selection
    for (const rowIndex of selectedRows) {
      // Build a key that identifies this row's selection state
      // Only recalculate if selection for this specific row changes
      const relevantRanges = selection.ranges.filter(range => {
        const norm = normalizeRange(range);
        return rowIndex >= norm.startRow && rowIndex <= norm.endRow;
      });
      const selectionKey = relevantRanges
        .map(r => `${r.startRow},${r.startCol},${r.endRow},${r.endCol}`)
        .join('|');

      map.set(rowIndex, { hasSelection: true, selectionKey });
    }

    return map;
  }, [selection]);

  // Find column index from mouse position by measuring actual header cell widths
  const getColumnIndexFromX = useCallback((clientX: number): number => {
    const container = containerRef.current;
    if (!container) return 0;

    // Get the header cells to measure actual widths
    const headerCells = container.querySelectorAll('.vlg-header-cell');
    if (headerCells.length === 0) return 0;

    const containerRect = container.getBoundingClientRect();
    const x = clientX - containerRect.left;

    // Find which column the x position falls within
    let accumulatedWidth = 0;
    for (let i = 0; i < headerCells.length; i++) {
      const cellRect = headerCells[i].getBoundingClientRect();
      const cellWidth = cellRect.width;
      accumulatedWidth += cellWidth;
      if (x < accumulatedWidth) {
        return i;
      }
    }
    return Math.max(0, headerCells.length - 1);
  }, []);

  // Find row index from mouse position
  const getRowIndexFromY = useCallback((clientY: number): number => {
    const container = scrollContainerRef.current;
    if (!container) return 0;

    const rect = container.getBoundingClientRect();
    const y = clientY - rect.top + container.scrollTop;
    const rowIndex = Math.floor(y / rowHeight);
    return Math.max(0, Math.min(rowIndex, entries.length - 1));
  }, [entries.length, rowHeight]);

  // Auto-scroll during drag
  const startAutoScroll = useCallback((direction: 'up' | 'down') => {
    if (autoScrollIntervalRef.current) return;

    const scrollAmount = direction === 'up' ? -rowHeight : rowHeight;
    autoScrollIntervalRef.current = window.setInterval(() => {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTop += scrollAmount;
      }
    }, 50);
  }, [rowHeight]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);

  // Handle mouse down on cell - start selection
  // Standard keyboard modifiers:
  // - Plain click: Clear all, select single cell
  // - Shift+Click: Extend selection from anchor to clicked cell
  // - Ctrl+Click (Cmd on Mac): Add new range / toggle cell
  const handleCellMouseDown = useCallback((rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click

    e.preventDefault();

    // Stop autoscroll when user clicks on a row - they're interacting with specific content
    setStuckToBottom(false);
    markUserScroll();

    // Focus container so it can receive keyboard events (like Ctrl+C)
    containerRef.current?.focus();

    setIsDragging(true);
    dragStartRef.current = { row: rowIndex, col: colIndex };
    clickStartRef.current = { row: rowIndex, time: Date.now() };

    if (onSelectionChange) {
      const newRange: CellRange = {
        startRow: rowIndex,
        startCol: colIndex,
        endRow: rowIndex,
        endCol: colIndex,
      };

      if (e.shiftKey && selection?.anchor) {
        // Shift+Click: Extend from anchor to clicked cell
        const extendedRange: CellRange = {
          startRow: selection.anchor.row,
          startCol: selection.anchor.col,
          endRow: rowIndex,
          endCol: colIndex,
        };
        // Replace last range with extended range, keep anchor
        const newRanges = selection.ranges.length > 0
          ? [...selection.ranges.slice(0, -1), extendedRange]
          : [extendedRange];
        onSelectionChange({
          ranges: newRanges,
          anchor: selection.anchor,
        });
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd+Click: Add new range or toggle
        const existingRanges = selection?.ranges || [];
        // Check if cell is already selected - if so, we could deselect (for single cells)
        const cellSelected = isCellSelected(rowIndex, colIndex, selection ?? null);
        if (cellSelected) {
          // Remove the range containing this cell (simple toggle for now)
          const filteredRanges = existingRanges.filter(range => {
            const norm = normalizeRange(range);
            // Keep ranges that don't contain just this single cell
            const isSingleCell = norm.startRow === norm.endRow && norm.startCol === norm.endCol;
            const isThisCell = norm.startRow === rowIndex && norm.startCol === colIndex;
            return !(isSingleCell && isThisCell);
          });
          onSelectionChange({
            ranges: filteredRanges.length > 0 ? filteredRanges : [newRange],
            anchor: { row: rowIndex, col: colIndex },
          });
        } else {
          // Add new range
          onSelectionChange({
            ranges: [...existingRanges, newRange],
            anchor: { row: rowIndex, col: colIndex },
          });
        }
      } else {
        // Plain click: Clear all, select single cell
        onSelectionChange({
          ranges: [newRange],
          anchor: { row: rowIndex, col: colIndex },
        });
      }
    }
  }, [onSelectionChange, selection, markUserScroll]);

  // Handle mouse move during drag
  // Uses refs for frequently-changing values to prevent listener re-attachment
  // which can cause mouseup events to be missed during rapid updates
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const onSelectionChangeCurrent = onSelectionChangeRef.current;
      const selectionCurrent = selectionRef.current;
      if (!dragStartRef.current || !onSelectionChangeCurrent) return;

      const rowIndex = getRowIndexFromY(e.clientY);
      const colIndex = getColumnIndexFromX(e.clientX);

      // Update the last range in the selection (the one being dragged)
      const existingRanges = selectionCurrent?.ranges || [];
      const updatedRange: CellRange = {
        startRow: dragStartRef.current.row,
        startCol: dragStartRef.current.col,
        endRow: rowIndex,
        endCol: colIndex,
      };

      // Replace last range with updated one, keep others
      const newRanges = existingRanges.length > 0
        ? [...existingRanges.slice(0, -1), updatedRange]
        : [updatedRange];

      onSelectionChangeCurrent({
        ranges: newRanges,
        anchor: selectionCurrent?.anchor,
      });

      // Auto-scroll when near edges
      const container = scrollContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const nearTop = e.clientY < rect.top + 30;
        const nearBottom = e.clientY > rect.bottom - 30;

        if (nearTop) {
          startAutoScroll('up');
        } else if (nearBottom) {
          startAutoScroll('down');
        } else {
          stopAutoScroll();
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const onRowClickCurrent = onRowClickRef.current;
      const entriesCurrent = entriesRef.current;

      // Check if this was a click (not a drag) - same row and quick (<200ms)
      if (clickStartRef.current && onRowClickCurrent) {
        const rowIndex = getRowIndexFromY(e.clientY);
        const elapsed = Date.now() - clickStartRef.current.time;
        const sameRow = rowIndex === clickStartRef.current.row;

        // Fire onRowClick if it was a quick click on the same row
        if (sameRow && elapsed < 200 && entriesCurrent[rowIndex]) {
          onRowClickCurrent(entriesCurrent[rowIndex], rowIndex);
        }
      }

      setIsDragging(false);
      dragStartRef.current = null;
      clickStartRef.current = null;
      stopAutoScroll();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      stopAutoScroll();
    };
  }, [isDragging, getRowIndexFromY, getColumnIndexFromX, startAutoScroll, stopAutoScroll]);

  // Get selected entries for copy/context menu (from all ranges)
  const selectedEntries = useMemo(() => {
    if (!selection || selection.ranges.length === 0) return [];
    const selectedRowSet = new Set<number>();
    for (const range of selection.ranges) {
      const norm = normalizeRange(range);
      for (let i = norm.startRow; i <= norm.endRow; i++) {
        selectedRowSet.add(i);
      }
    }
    const sortedRows = Array.from(selectedRowSet).sort((a, b) => a - b);
    return sortedRows.map(i => entries[i]).filter(Boolean);
  }, [entries, selection]);

  // Get selected columns for copy (union of all ranges)
  const selectedColumns = useMemo(() => {
    if (!selection || selection.ranges.length === 0) return visibleColumns;
    const selectedColSet = new Set<number>();
    for (const range of selection.ranges) {
      const norm = normalizeRange(range);
      for (let i = norm.startCol; i <= norm.endCol; i++) {
        selectedColSet.add(i);
      }
    }
    const sortedCols = Array.from(selectedColSet).sort((a, b) => a - b);
    return sortedCols.map(i => visibleColumns[i]).filter(Boolean);
  }, [selection, visibleColumns]);

  // Ref for visibleColumns to avoid listener re-attachment
  const visibleColumnsRef = useRef(visibleColumns);
  visibleColumnsRef.current = visibleColumns;

  // Keyboard navigation - attached to container element
  // Uses refs for frequently-changing values to minimize listener re-attachment
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const entriesCurrent = entriesRef.current;
      const selectionCurrent = selectionRef.current;
      const onSelectionChangeCurrent = onSelectionChangeRef.current;
      const visibleColumnsCurrent = visibleColumnsRef.current;

      // Ctrl+A to select all rows
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        if (onSelectionChangeCurrent && entriesCurrent.length > 0) {
          onSelectionChangeCurrent({
            ranges: [{
              startRow: 0,
              startCol: 0,
              endRow: entriesCurrent.length - 1,
              endCol: visibleColumnsCurrent.length - 1,
            }],
            anchor: { row: 0, col: 0 },
          });
        }
        return;
      }

      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (!onSelectionChangeCurrent) return;

      e.preventDefault();

      // Use the last range for current position
      const lastRange = selectionCurrent?.ranges[selectionCurrent.ranges.length - 1];
      const currentRange = lastRange || { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      let newRow = currentRange.endRow;
      let newCol = currentRange.endCol;

      switch (e.key) {
        case 'ArrowDown':
          newRow = Math.min(currentRange.endRow + 1, entriesCurrent.length - 1);
          break;
        case 'ArrowUp':
          newRow = Math.max(currentRange.endRow - 1, 0);
          break;
        case 'ArrowRight':
          newCol = Math.min(currentRange.endCol + 1, visibleColumnsCurrent.length - 1);
          break;
        case 'ArrowLeft':
          newCol = Math.max(currentRange.endCol - 1, 0);
          break;
      }

      if (e.shiftKey) {
        // Extend selection from anchor
        const anchor = selectionCurrent?.anchor || { row: currentRange.startRow, col: currentRange.startCol };
        const extendedRange: CellRange = {
          startRow: anchor.row,
          startCol: anchor.col,
          endRow: newRow,
          endCol: newCol,
        };
        // Replace last range with extended range
        const newRanges = selectionCurrent && selectionCurrent.ranges.length > 0
          ? [...selectionCurrent.ranges.slice(0, -1), extendedRange]
          : [extendedRange];
        onSelectionChangeCurrent({
          ranges: newRanges,
          anchor,
        });
      } else {
        // Move selection - clear to single cell
        const newRange: CellRange = {
          startRow: newRow,
          startCol: newCol,
          endRow: newRow,
          endCol: newCol,
        };
        onSelectionChangeCurrent({
          ranges: [newRange],
          anchor: { row: newRow, col: newCol },
        });
      }

      // Update detail panel when navigating with arrow keys (non-shift)
      // For shift+arrow (range selection), we don't update detail panel
      if (!e.shiftKey) {
        const onRowClickCurrent = onRowClickRef.current;
        const entry = entriesCurrent[newRow];
        if (onRowClickCurrent && entry) {
          onRowClickCurrent(entry, newRow);
        }
      }

      virtualizer.scrollToIndex(newRow, { align: 'auto' });
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [virtualizer, isMounted]);

  // Ctrl+C to copy selected cells (with smart formatting for non-contiguous selections)
  // Attached to container, uses refs
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleCopy = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selectionCurrent = selectionRef.current;
        if (!selectionCurrent || selectionCurrent.ranges.length === 0) return;

        e.preventDefault();
        // Use smart format that handles non-contiguous selections with headers
        const text = formatSelectionForCopy(entriesRef.current, visibleColumnsRef.current, selectionCurrent);
        if (text) {
          await copyToClipboard(text);
        }
      }
    };

    container.addEventListener('keydown', handleCopy);
    return () => container.removeEventListener('keydown', handleCopy);
  }, [isMounted]);

  // Handle context menu on rows
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Stop autoscroll when user opens context menu - they're interacting with specific rows
    setStuckToBottom(false);
    markUserScroll();

    const rowIndex = getRowIndexFromY(e.clientY);
    const colIndex = getColumnIndexFromX(e.clientX);
    const clickedEntry = entries[rowIndex] || null;
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      clickedEntry,
      clickedColIndex: colIndex,
    });
  }, [getRowIndexFromY, getColumnIndexFromX, entries, markUserScroll]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Get cached row style to avoid allocations
  const getRowStyle = useCallback((start: number, size: number): CSSProperties => {
    const key = `${start}-${size}`;
    let style = rowStyleCache.get(key);
    if (!style) {
      style = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: size,
        transform: `translateY(${start}px)`,
      };
      if (rowStyleCache.size >= ROW_STYLE_CACHE_SIZE) {
        const keys = Array.from(rowStyleCache.keys()).slice(0, 50);
        keys.forEach(k => rowStyleCache.delete(k));
      }
      rowStyleCache.set(key, style);
    }
    return style;
  }, []);

  // Memoize scroll container style
  // Note: DO NOT use scrollBehavior: 'smooth' here - it conflicts with
  // useAutoScroll's programmatic lerp-based smooth scrolling
  // Note: Use flex: 1 instead of fixed height to fill available space
  const scrollContainerStyle = useMemo(() => ({
    overflow: 'auto' as const,
    overflowAnchor: 'none' as const,
    contain: 'strict' as const,
  }), []);

  const totalSize = virtualizer.getTotalSize();
  const innerStyle = useMemo(() => ({
    height: totalSize,
    width: '100%',
    position: 'relative' as const,
    // Striped background pattern matching row heights - fallback when rows not yet rendered during fast scroll
    background: `repeating-linear-gradient(to bottom, var(--vlg-row-bg) 0px, var(--vlg-row-bg) ${rowHeight}px, var(--vlg-odd-bg) ${rowHeight}px, var(--vlg-odd-bg) ${rowHeight * 2}px)`,
    // Performance optimizations for smooth scrolling
    willChange: 'transform' as const,
    transform: 'translateZ(0)', // Force GPU acceleration
  }), [totalSize, rowHeight]);

  // Handle scroll from ThreadLinesPanel (sync back to main grid)
  const handleThreadLinesPanelScroll = useCallback((newScrollTop: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = newScrollTop;
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`virtual-log-grid ${theme}${isDragging ? ' selecting' : ''} density-${rowDensity}`}
      style={{ '--vlg-row-height': `${rowHeight}px`, '--vlg-font-size': `${fontSize}px`, '--vlg-header-height': `${headerHeight}px` } as React.CSSProperties}
      tabIndex={0}
    >
      <VirtualLogGridHeader columns={columns} onColumnsChange={onColumnsChange} hasScrollbar={hasScrollbar} />
      <div className="vlg-body-container" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Thread Lines Panel - left side */}
        {showThreadLinesPanel && threadLineColumns.length > 0 && (
          <ThreadLinesPanel
            entries={entries}
            virtualItems={virtualItems}
            rowHeight={rowHeight}
            headerHeight={0}
            totalHeight={totalSize}
            scrollTop={scrollTop}
            onScroll={handleThreadLinesPanelScroll}
            theme={theme}
            availableKeys={availableContextKeys}
          />
        )}
        <div
          ref={scrollContainerRef}
          className="vlg-scroll-container"
          style={{ ...scrollContainerStyle, flex: 1 }}
          onContextMenu={handleContextMenu}
        >
          <div style={innerStyle}>
          {/* Render virtual rows - the striped background shows through gaps during fast scroll */}
          {virtualItems.map((virtualRow) => {
              const entry = entries[virtualRow.index];
              if (!entry) {
                // Only log once per scroll position to avoid spam
                if (virtualRow.index % 100 === 0) {
                  console.warn(`[VLG] Missing entry at index ${virtualRow.index}, entries.length=${entries.length}, virtualItems count=${virtualItems.length}`);
                }
                return null;
              }
              // Debug: Log first few entries to diagnose empty cells issue
              if (virtualRow.index < 3 && renderCount % 50 === 0) {
                console.log(`[VLG] Entry[${virtualRow.index}]:`, JSON.stringify({
                  id: entry.id,
                  title: entry.title,
                  sessionName: entry.sessionName,
                  timestamp: entry.timestamp,
                  level: entry.level,
                  logEntryType: entry.logEntryType,
                  appName: entry.appName,
                  keys: Object.keys(entry)
                }));
              }
              const rowSelectionInfo = rowSelectionMap.get(virtualRow.index);
              return (
                <VirtualLogGridRow
                  key={virtualRow.key}
                  entry={entry}
                  rowIndex={virtualRow.index}
                  style={getRowStyle(virtualRow.start, virtualRow.size)}
                  isOdd={alternatingRows && entry.id % 2 === 1}
                  columns={visibleColumns}
                  highlightStyle={getHighlightStyle(entry)}
                  selection={selection}
                  selectionKey={rowSelectionInfo?.selectionKey ?? ''}
                  onCellMouseDown={handleCellMouseDown}
                  isCellSelected={isCellSelected}
                  getCellPosition={getCellPosition}
                  isRowSelected={entry.id === selectedRowId}
                  depthIndentation={depthIndentation}
                  isFaded={getIsFaded(entry)}
                  ribbonHue={getRibbonHue(entry)}
                  onTraceClick={handleTraceClick}
                />
              );
            })}
        </div>
      </div>
      </div>

      {contextMenu.isOpen && (
        <RowContextMenu
          position={contextMenu.position}
          selectedEntries={selectedEntries}
          entries={entries}
          columns={selectedColumns}
          allColumns={visibleColumns}
          clickedColIndex={contextMenu.clickedColIndex}
          onClose={handleCloseContextMenu}
          clickedEntry={contextMenu.clickedEntry}
          onOpenTitleHighlightModal={(entry) => setTitleModalState({ entry, mode: 'highlight' })}
          onOpenTitleViewModal={(entry) => setTitleModalState({ entry, mode: 'view' })}
        />
      )}

      {/* Title Modal (for highlight or view creation) */}
      {titleModalState && (
        <TitleHighlightModal
          entry={titleModalState.entry}
          entries={entries}
          onClose={() => setTitleModalState(null)}
          mode={titleModalState.mode}
        />
      )}

      {/* Floating button - shows when autoscroll is paused (user clicked row or scrolled up) */}
      {autoScroll && !stuckToBottom && hasScrollbar && entries.length > 0 && (
        <button
          onClick={handleJumpToBottom}
          className="vlg-jump-to-bottom"
          title="Resume auto-scroll"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <span>{rowsBelowViewport > 0 ? 'Resume' : 'Resume auto-scroll'}</span>
          {rowsBelowViewport > 0 && (
            <span className="vlg-new-entries-badge">
              {rowsBelowViewport > 999 ? '999+' : rowsBelowViewport}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

// Memoized wrapper to prevent re-renders during mouse drag
// The virtualizer's internal flushSync causes re-renders on every scroll event,
// which can cause scroll position "fighting" during scrollbar drag.
// This memo wrapper blocks prop-driven re-renders when mouse is down.
export const VirtualLogGrid = React.memo(VirtualLogGridInner, (prevProps, nextProps) => {
  // During scrollbar drag specifically, block ALL re-renders to prevent scroll fighting
  // Check both local flag and window flag (window flag is set by ViewGrid before React updates)
  const mouseDown = isMouseDownGlobal();
  const isScrollbarDrag = globalIsScrollbarDrag;

  // Only log and block during scrollbar drag (not regular content clicks)
  if (mouseDown && isScrollbarDrag) {
    // Don't log every check - too noisy. Only log when blocking
    scrollLog.debug('MEMO: Blocking re-render during scrollbar drag');
    return true; // true = props are equal, skip re-render
  }

  // Normal comparison - allow re-render if any prop changed
  // Compare entries by reference (fast) and length (detects new entries)
  if (prevProps.entries !== nextProps.entries) {
    return false; // false = props different, re-render
  }

  // Check other props that could trigger re-render
  if (prevProps.autoScroll !== nextProps.autoScroll) return false;
  if (prevProps.selection !== nextProps.selection) return false;
  if (prevProps.theme !== nextProps.theme) return false;
  if (prevProps.alternatingRows !== nextProps.alternatingRows) return false;
  if (prevProps.columns !== nextProps.columns) return false;
  if (prevProps.highlightRules !== nextProps.highlightRules) return false;
  if (prevProps.selectedRowId !== nextProps.selectedRowId) return false;
  if (prevProps.actualEntryCount !== nextProps.actualEntryCount) return false;
  if (prevProps.lastTrimCount !== nextProps.lastTrimCount) return false;

  // Props are equal
  return true;
});
