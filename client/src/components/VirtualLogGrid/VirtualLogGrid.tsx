import { useRef, useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LogEntry, HighlightRule, matchesHighlightRule, useLogStore } from '../../store/logStore';
import { VirtualLogGridRow } from './VirtualLogGridRow';
import { VirtualLogGridHeader } from './VirtualLogGridHeader';
import { RowContextMenu, formatEntriesForCopy, copyToClipboard } from './RowContextMenu';
import { useAutoScroll } from './useAutoScroll';
import { useScrollDetection } from './useScrollDetection';
import { OVERSCAN, getRowHeight, getFontSize, getHeaderHeight } from './constants';
import { DEFAULT_COLUMNS, ColumnConfig } from './types';

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

export interface VirtualLogGridProps {
  entries: LogEntry[];
  autoScroll: boolean;
  onAutoScrollChange?: (enabled: boolean) => void;
  selection?: CellRange | null;
  onSelectionChange?: (range: CellRange | null) => void;
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

// Check if a cell is within the selection range
function isCellSelected(rowIndex: number, colIndex: number, range: CellRange | null): boolean {
  if (!range) return false;
  const norm = normalizeRange(range);
  return (
    rowIndex >= norm.startRow &&
    rowIndex <= norm.endRow &&
    colIndex >= norm.startCol &&
    colIndex <= norm.endCol
  );
}

// Get cell selection position within range (for border rendering)
function getCellPosition(rowIndex: number, colIndex: number, range: CellRange | null): {
  isTop: boolean;
  isBottom: boolean;
  isLeft: boolean;
  isRight: boolean;
} {
  if (!range) return { isTop: false, isBottom: false, isLeft: false, isRight: false };
  const norm = normalizeRange(range);
  return {
    isTop: rowIndex === norm.startRow,
    isBottom: rowIndex === norm.endRow,
    isLeft: colIndex === norm.startCol,
    isRight: colIndex === norm.endCol,
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

  // Debug: track what we're passing to useAutoScroll
  const prevRateTrackingCountRef = useRef(rateTrackingCount);
  useEffect(() => {
    if (rateTrackingCount !== prevRateTrackingCountRef.current) {
      console.log('[VLG] rateTrackingCount CHANGED:', {
        prev: prevRateTrackingCountRef.current,
        new: rateTrackingCount,
        actualEntryCount,
        entriesLength: entries.length,
      });
      prevRateTrackingCountRef.current = rateTrackingCount;
    }
  }, [rateTrackingCount, actualEntryCount, entries.length]);

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

  // TanStack Virtual virtualizer
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
    getItemKey: (index) => entries[index]?.id ?? index,
  });

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

  // Get highlight style with caching
  const getHighlightStyle = useCallback((entry: LogEntry): CSSProperties | undefined => {
    if (sortedHighlightRules.length === 0) return undefined;

    for (const rule of sortedHighlightRules) {
      if (matchesHighlightRule(entry, rule)) {
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
      }
    }
    return undefined;
  }, [sortedHighlightRules]);

  // Get visible columns
  const visibleColumns = useMemo(
    () => columns.filter(col => !col.hidden),
    [columns]
  );

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
  const handleCellMouseDown = useCallback((rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click

    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { row: rowIndex, col: colIndex };
    clickStartRef.current = { row: rowIndex, time: Date.now() };

    if (onSelectionChange) {
      onSelectionChange({
        startRow: rowIndex,
        startCol: colIndex,
        endRow: rowIndex,
        endCol: colIndex,
      });
    }
  }, [onSelectionChange]);

  // Handle mouse move during drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !onSelectionChange) return;

      const rowIndex = getRowIndexFromY(e.clientY);
      const colIndex = getColumnIndexFromX(e.clientX);

      onSelectionChange({
        startRow: dragStartRef.current.row,
        startCol: dragStartRef.current.col,
        endRow: rowIndex,
        endCol: colIndex,
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
  }, [isDragging, getRowIndexFromY, getColumnIndexFromX, onSelectionChange, startAutoScroll, stopAutoScroll, onRowClick, entries]);

  // Get selected entries for copy/context menu
  const selectedEntries = useMemo(() => {
    if (!selection) return [];
    const norm = normalizeRange(selection);
    const selected: LogEntry[] = [];
    for (let i = norm.startRow; i <= norm.endRow; i++) {
      if (entries[i]) {
        selected.push(entries[i]);
      }
    }
    return selected;
  }, [entries, selection]);

  // Get selected columns for copy
  const selectedColumns = useMemo(() => {
    if (!selection) return visibleColumns;
    const norm = normalizeRange(selection);
    return visibleColumns.slice(norm.startCol, norm.endCol + 1);
  }, [selection, visibleColumns]);

  // Keyboard navigation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (!onSelectionChange) return;

      e.preventDefault();

      const currentSelection = selection || { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      let newRow = currentSelection.endRow;
      let newCol = currentSelection.endCol;

      switch (e.key) {
        case 'ArrowDown':
          newRow = Math.min(currentSelection.endRow + 1, entries.length - 1);
          break;
        case 'ArrowUp':
          newRow = Math.max(currentSelection.endRow - 1, 0);
          break;
        case 'ArrowRight':
          newCol = Math.min(currentSelection.endCol + 1, visibleColumns.length - 1);
          break;
        case 'ArrowLeft':
          newCol = Math.max(currentSelection.endCol - 1, 0);
          break;
      }

      if (e.shiftKey) {
        // Extend selection
        onSelectionChange({
          startRow: currentSelection.startRow,
          startCol: currentSelection.startCol,
          endRow: newRow,
          endCol: newCol,
        });
      } else {
        // Move selection
        onSelectionChange({
          startRow: newRow,
          startCol: newCol,
          endRow: newRow,
          endCol: newCol,
        });
      }

      virtualizer.scrollToIndex(newRow, { align: 'auto' });
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [entries.length, selection, visibleColumns.length, onSelectionChange, virtualizer]);

  // Ctrl+C to copy selected cells
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleCopy = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedEntries.length === 0) return;

        e.preventDefault();
        const text = formatEntriesForCopy(selectedEntries, selectedColumns);
        await copyToClipboard(text);
      }
    };

    container.addEventListener('keydown', handleCopy);
    return () => container.removeEventListener('keydown', handleCopy);
  }, [selectedEntries, selectedColumns]);

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
  }), [totalSize]);

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
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index];
            if (!entry) return null;
            return (
              <VirtualLogGridRow
                key={virtualRow.key}
                entry={entry}
                rowIndex={virtualRow.index}
                style={getRowStyle(virtualRow.start, virtualRow.size)}
                isOdd={alternatingRows && virtualRow.index % 2 === 1}
                columns={visibleColumns}
                highlightStyle={getHighlightStyle(entry)}
                selection={selection}
                onCellMouseDown={handleCellMouseDown}
                isCellSelected={isCellSelected}
                getCellPosition={getCellPosition}
                isRowSelected={entry.id === selectedRowId}
              />
            );
          })}
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
