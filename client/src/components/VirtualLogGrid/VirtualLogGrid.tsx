import { useRef, useCallback, useEffect, useLayoutEffect, useMemo, useState, CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LogEntry, HighlightRule, matchesHighlightRule, useLogStore } from '../../store/logStore';
import { VirtualLogGridRow, SkeletonRow } from './VirtualLogGridRow';
import { VirtualLogGridHeader } from './VirtualLogGridHeader';
import { RowContextMenu, formatSelectionForCopy, copyToClipboard } from './RowContextMenu';
import { useAutoScroll } from './useAutoScroll';
import { useScrollDetection } from './useScrollDetection';
import { OVERSCAN, OVERSCAN_FAST, getRowHeight, getFontSize, getHeaderHeight } from './constants';
import { DEFAULT_COLUMNS, ColumnConfig } from './types';

// Scroll velocity tracking for dynamic overscan
const VELOCITY_THRESHOLD_FAST = 500; // pixels/second for "fast" scrolling

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

export function VirtualLogGrid({
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
}: VirtualLogGridProps) {
  flickerLog('RENDER', { entriesCount: entries.length, autoScroll });

  void _onAutoScrollChange;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get row density from store
  const rowDensity = useLogStore((state) => state.rowDensity);
  const rowHeight = getRowHeight(rowDensity);
  const fontSize = getFontSize(rowDensity);
  const headerHeight = getHeaderHeight(rowDensity);

  // Internal state: is the scrollbar at the bottom?
  const [stuckToBottom, setStuckToBottom] = useState(true);

  // Track number of rows below visible viewport (updated on scroll)
  const [rowsBelowViewport, setRowsBelowViewport] = useState(0);

  // Track if scrollbar is visible
  const [hasScrollbar, setHasScrollbar] = useState(false);

  // Track if virtualized content is ready (to show skeletons initially)
  const [isVirtualizerReady, setIsVirtualizerReady] = useState(false);

  // Scroll velocity tracking for dynamic overscan
  const [isScrollingFast, setIsScrollingFast] = useState(false);
  const lastScrollTopRef = useRef(0);
  const lastScrollTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const velocityDecayTimerRef = useRef<number | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
  }>({ isOpen: false, position: { x: 0, y: 0 } });

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ row: number; col: number } | null>(null);
  const autoScrollIntervalRef = useRef<number | null>(null);
  const clickStartRef = useRef<{ row: number; time: number } | null>(null);

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

  // Dynamic overscan based on scroll velocity
  const currentOverscan = isScrollingFast ? OVERSCAN_FAST : OVERSCAN;

  // TanStack Virtual virtualizer
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: currentOverscan,
    getItemKey: (index) => entries[index]?.id ?? index,
    initialOffset: initialScrollOffset,
  });

  // Scroll velocity tracking for dynamic overscan
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const now = performance.now();
      const scrollTop = container.scrollTop;
      const timeDelta = now - lastScrollTimeRef.current;

      if (timeDelta > 0 && lastScrollTimeRef.current > 0) {
        const scrollDelta = Math.abs(scrollTop - lastScrollTopRef.current);
        const velocity = (scrollDelta / timeDelta) * 1000; // pixels per second

        // Smooth velocity with exponential moving average
        velocityRef.current = velocityRef.current * 0.3 + velocity * 0.7;

        // Update fast scrolling state
        const isFast = velocityRef.current > VELOCITY_THRESHOLD_FAST;
        if (isFast !== isScrollingFast) {
          setIsScrollingFast(isFast);
        }
      }

      lastScrollTopRef.current = scrollTop;
      lastScrollTimeRef.current = now;

      // Clear any existing decay timer
      if (velocityDecayTimerRef.current) {
        clearTimeout(velocityDecayTimerRef.current);
      }

      // Start velocity decay after scrolling stops
      velocityDecayTimerRef.current = window.setTimeout(() => {
        velocityRef.current = 0;
        setIsScrollingFast(false);
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (velocityDecayTimerRef.current) {
        clearTimeout(velocityDecayTimerRef.current);
      }
    };
  }, [isScrollingFast]);

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

    // Mark virtualizer as ready (content is positioned, show real rows)
    if (entries.length > 0 && !isVirtualizerReady) {
      setIsVirtualizerReady(true);
    }
  }, [entries.length, effectiveAutoScroll, isVirtualizerReady]);

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

  // Calculate rows below viewport dynamically on scroll and entries change
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const calculateRowsBelow = () => {
      const { scrollTop, clientHeight } = container;
      const totalHeight = entries.length * rowHeight;
      const visibleBottom = scrollTop + clientHeight;
      const hiddenHeight = totalHeight - visibleBottom;
      const rowsBelow = Math.max(0, Math.floor(hiddenHeight / rowHeight));
      setRowsBelowViewport(rowsBelow);
    };

    // Calculate initially
    calculateRowsBelow();

    // Listen to scroll events
    container.addEventListener('scroll', calculateRowsBelow, { passive: true });

    return () => container.removeEventListener('scroll', calculateRowsBelow);
  }, [entries.length, rowHeight]);

  // Pre-sort highlight rules once when they change
  const sortedHighlightRules = useMemo(
    () => [...highlightRules].sort((a, b) => b.priority - a.priority),
    [highlightRules]
  );

  // Get or create cached highlight style for a rule
  const getRuleStyle = useCallback((rule: HighlightRule): CSSProperties => {
    const cacheKey = rule.id;
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

  // Pre-compute highlight styles for visible entries (computed once per render, not per row)
  const virtualItems = virtualizer.getVirtualItems();
  const highlightStyleMap = useMemo(() => {
    if (sortedHighlightRules.length === 0) return new Map<number, CSSProperties>();

    const map = new Map<number, CSSProperties>();
    for (const virtualRow of virtualItems) {
      const entry = entries[virtualRow.index];
      if (!entry) continue;

      for (const rule of sortedHighlightRules) {
        if (matchesHighlightRule(entry, rule)) {
          map.set(entry.id, getRuleStyle(rule));
          break; // First matching rule wins
        }
      }
    }
    return map;
  }, [virtualItems, entries, sortedHighlightRules, getRuleStyle]);

  // Get visible columns
  const visibleColumns = useMemo(
    () => columns.filter(col => !col.hidden),
    [columns]
  );

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
  }, [onSelectionChange, selection]);

  // Handle mouse move during drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !onSelectionChange) return;

      const rowIndex = getRowIndexFromY(e.clientY);
      const colIndex = getColumnIndexFromX(e.clientX);

      // Update the last range in the selection (the one being dragged)
      const existingRanges = selection?.ranges || [];
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

      onSelectionChange({
        ranges: newRanges,
        anchor: selection?.anchor,
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
      // Check if this was a click (not a drag) - same row and quick (<200ms)
      if (clickStartRef.current && onRowClick) {
        const rowIndex = getRowIndexFromY(e.clientY);
        const elapsed = Date.now() - clickStartRef.current.time;
        const sameRow = rowIndex === clickStartRef.current.row;

        // Fire onRowClick if it was a quick click on the same row
        if (sameRow && elapsed < 200 && entries[rowIndex]) {
          onRowClick(entries[rowIndex], rowIndex);
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
  }, [isDragging, getRowIndexFromY, getColumnIndexFromX, onSelectionChange, startAutoScroll, stopAutoScroll, onRowClick, entries, selection]);

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

  // Keyboard navigation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+A to select all rows
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        if (onSelectionChange && entries.length > 0) {
          onSelectionChange({
            ranges: [{
              startRow: 0,
              startCol: 0,
              endRow: entries.length - 1,
              endCol: visibleColumns.length - 1,
            }],
            anchor: { row: 0, col: 0 },
          });
        }
        return;
      }

      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (!onSelectionChange) return;

      e.preventDefault();

      // Use the last range for current position
      const lastRange = selection?.ranges[selection.ranges.length - 1];
      const currentRange = lastRange || { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      let newRow = currentRange.endRow;
      let newCol = currentRange.endCol;

      switch (e.key) {
        case 'ArrowDown':
          newRow = Math.min(currentRange.endRow + 1, entries.length - 1);
          break;
        case 'ArrowUp':
          newRow = Math.max(currentRange.endRow - 1, 0);
          break;
        case 'ArrowRight':
          newCol = Math.min(currentRange.endCol + 1, visibleColumns.length - 1);
          break;
        case 'ArrowLeft':
          newCol = Math.max(currentRange.endCol - 1, 0);
          break;
      }

      if (e.shiftKey) {
        // Extend selection from anchor
        const anchor = selection?.anchor || { row: currentRange.startRow, col: currentRange.startCol };
        const extendedRange: CellRange = {
          startRow: anchor.row,
          startCol: anchor.col,
          endRow: newRow,
          endCol: newCol,
        };
        // Replace last range with extended range
        const newRanges = selection && selection.ranges.length > 0
          ? [...selection.ranges.slice(0, -1), extendedRange]
          : [extendedRange];
        onSelectionChange({
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
        onSelectionChange({
          ranges: [newRange],
          anchor: { row: newRow, col: newCol },
        });
      }

      virtualizer.scrollToIndex(newRow, { align: 'auto' });
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [entries.length, selection, visibleColumns.length, onSelectionChange, virtualizer]);

  // Ctrl+C to copy selected cells (with smart formatting for non-contiguous selections)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleCopy = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (!selection || selection.ranges.length === 0) return;

        e.preventDefault();
        // Use smart format that handles non-contiguous selections with headers
        const text = formatSelectionForCopy(entries, visibleColumns, selection);
        if (text) {
          await copyToClipboard(text);
        }
      }
    };

    container.addEventListener('keydown', handleCopy);
    return () => container.removeEventListener('keydown', handleCopy);
  }, [entries, visibleColumns, selection]);

  // Handle context menu on rows
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
    });
  }, []);

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
  const scrollContainerStyle = useMemo(() => ({
    overflow: 'auto' as const,
    height: 'calc(100% - 32px)',
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
  }), [totalSize, rowHeight]);

  return (
    <div
      ref={containerRef}
      className={`virtual-log-grid ${theme}${isDragging ? ' selecting' : ''} density-${rowDensity}`}
      style={{ '--vlg-row-height': `${rowHeight}px`, '--vlg-font-size': `${fontSize}px`, '--vlg-header-height': `${headerHeight}px` } as React.CSSProperties}
      tabIndex={0}
    >
      <VirtualLogGridHeader columns={columns} onColumnsChange={onColumnsChange} hasScrollbar={hasScrollbar} />
      <div
        ref={scrollContainerRef}
        className="vlg-scroll-container"
        style={scrollContainerStyle}
        onContextMenu={handleContextMenu}
      >
        <div style={innerStyle}>
          {/* Show skeleton rows until virtualizer is ready */}
          {!isVirtualizerReady && entries.length > 0 ? (
            // Generate skeleton rows to fill estimated viewport (~600px / rowHeight rows)
            Array.from({ length: Math.ceil(600 / rowHeight) }, (_, i) => (
              <SkeletonRow
                key={`skeleton-${i}`}
                rowIndex={i}
                style={getRowStyle(i * rowHeight, rowHeight)}
                columns={visibleColumns}
                isOdd={alternatingRows && i % 2 === 1}
              />
            ))
          ) : (
            virtualItems.map((virtualRow) => {
              const entry = entries[virtualRow.index];
              if (!entry) return null;
              const rowSelectionInfo = rowSelectionMap.get(virtualRow.index);
              return (
                <VirtualLogGridRow
                  key={virtualRow.key}
                  entry={entry}
                  rowIndex={virtualRow.index}
                  style={getRowStyle(virtualRow.start, virtualRow.size)}
                  isOdd={alternatingRows && virtualRow.index % 2 === 1}
                  columns={visibleColumns}
                  highlightStyle={highlightStyleMap.get(entry.id)}
                  selection={selection}
                  selectionKey={rowSelectionInfo?.selectionKey ?? ''}
                  onCellMouseDown={handleCellMouseDown}
                  isCellSelected={isCellSelected}
                  getCellPosition={getCellPosition}
                  isRowSelected={entry.id === selectedRowId}
                />
              );
            })
          )}
        </div>
      </div>

      {contextMenu.isOpen && (
        <RowContextMenu
          position={contextMenu.position}
          selectedEntries={selectedEntries}
          entries={entries}
          columns={selectedColumns}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* Floating "Go to bottom" button - shows when autoscroll is enabled but user scrolled up */}
      {autoScroll && !stuckToBottom && (
        <button
          onClick={handleJumpToBottom}
          className="vlg-jump-to-bottom"
          title="Go to bottom and resume auto-scroll"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <span>Go to bottom</span>
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
