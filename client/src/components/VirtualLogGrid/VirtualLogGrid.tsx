import { useRef, useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LogEntry, HighlightRule, matchesHighlightRule } from '../../store/logStore';
import { VirtualLogGridRow } from './VirtualLogGridRow';
import { VirtualLogGridHeader } from './VirtualLogGridHeader';
import { useAutoScroll } from './useAutoScroll';
import { useScrollDetection } from './useScrollDetection';
import { ROW_HEIGHT, OVERSCAN } from './constants';
import { DEFAULT_COLUMNS, ColumnConfig } from './types';

// Cache for highlight styles to avoid recreating objects
const highlightStyleCache = new Map<string, CSSProperties>();
const MAX_CACHE_SIZE = 100;

// Cache for row position styles to avoid recreating objects
const rowStyleCache = new Map<string, CSSProperties>();
const ROW_STYLE_CACHE_SIZE = 200;

export interface VirtualLogGridProps {
  entries: LogEntry[];
  autoScroll: boolean;
  onAutoScrollChange?: (enabled: boolean) => void;
  selectedEntryId: number | null;
  onSelectEntry?: (entry: LogEntry) => void;
  theme?: 'light' | 'dark';
  alternatingRows?: boolean;
  columns?: ColumnConfig[];
  highlightRules?: HighlightRule[];
}

export function VirtualLogGrid({
  entries,
  autoScroll,
  onAutoScrollChange: _onAutoScrollChange, // Kept for API compatibility, not used internally
  selectedEntryId,
  onSelectEntry,
  theme = 'dark',
  alternatingRows = true,
  columns = DEFAULT_COLUMNS,
  highlightRules = [],
}: VirtualLogGridProps) {
  void _onAutoScrollChange; // Suppress unused warning
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Internal state: is the scrollbar at the bottom?
  // This is separate from the user's autoScroll preference (button)
  const [stuckToBottom, setStuckToBottom] = useState(true);

  // Effective autoscroll = user wants it AND scrollbar is at bottom
  const effectiveAutoScroll = autoScroll && stuckToBottom;

  // Autoscroll hook
  const {
    markUserScroll,
    markStuckToBottom,
    isProgrammaticScroll,
  } = useAutoScroll({
    scrollElement: scrollContainerRef.current,
    entriesCount: entries.length,
    autoScrollEnabled: effectiveAutoScroll,
    onUserScrollUp: () => {
      setStuckToBottom(false);
    },
  });

  // Scroll detection hook - only updates internal stuckToBottom state
  // Does NOT change the user's autoScroll preference
  useScrollDetection({
    scrollElement: scrollContainerRef.current,
    onUserScrollUp: useCallback(() => {
      markUserScroll();
      setStuckToBottom(false);
    }, [markUserScroll]),
    onScrollToBottom: useCallback(() => {
      markStuckToBottom();
      setStuckToBottom(true);
    }, [markStuckToBottom]),
    isProgrammaticScroll,
  });

  // TanStack Virtual virtualizer
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    getItemKey: (index) => entries[index].id,
  });

  // Pre-sort highlight rules once when they change
  const sortedHighlightRules = useMemo(
    () => [...highlightRules].sort((a, b) => b.priority - a.priority),
    [highlightRules]
  );

  // Get highlight style with caching to reduce allocations
  const getHighlightStyle = useCallback((entry: LogEntry): CSSProperties | undefined => {
    if (sortedHighlightRules.length === 0) return undefined;

    for (const rule of sortedHighlightRules) {
      if (matchesHighlightRule(entry, rule)) {
        // Use rule id as cache key
        const cacheKey = rule.id;
        let style = highlightStyleCache.get(cacheKey);

        if (!style) {
          style = {};
          if (rule.style.backgroundColor) style.backgroundColor = rule.style.backgroundColor;
          if (rule.style.textColor) style.color = rule.style.textColor;
          if (rule.style.fontWeight) style.fontWeight = rule.style.fontWeight;
          if (rule.style.fontStyle) style.fontStyle = rule.style.fontStyle as CSSProperties['fontStyle'];

          // Limit cache size
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

  // Handle row click
  const handleRowClick = useCallback((entry: LogEntry) => {
    onSelectEntry?.(entry);
  }, [onSelectEntry]);

  // Keyboard navigation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

      e.preventDefault();

      if (entries.length === 0) return;

      let currentIndex = selectedEntryId
        ? entries.findIndex(entry => entry.id === selectedEntryId)
        : -1;

      let newIndex: number;
      if (e.key === 'ArrowDown') {
        newIndex = currentIndex < entries.length - 1 ? currentIndex + 1 : currentIndex;
        if (currentIndex === -1) newIndex = 0;
      } else {
        newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      }

      if (newIndex !== currentIndex && entries[newIndex]) {
        onSelectEntry?.(entries[newIndex]);
        // Scroll to make row visible
        virtualizer.scrollToIndex(newIndex, { align: 'auto' });
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [entries, selectedEntryId, onSelectEntry, virtualizer]);

  // Memoize columns to prevent unnecessary re-renders
  const visibleColumns = useMemo(() => columns, [columns]);

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
        // Clear old entries
        const keys = Array.from(rowStyleCache.keys()).slice(0, 50);
        keys.forEach(k => rowStyleCache.delete(k));
      }
      rowStyleCache.set(key, style);
    }
    return style;
  }, []);

  // Memoize scroll container style
  const scrollContainerStyle = useMemo(() => ({
    overflow: 'auto' as const,
    height: 'calc(100% - 32px)',
    overflowAnchor: 'none' as const,
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
      className={`virtual-log-grid ${theme}`}
      tabIndex={0}
    >
      <VirtualLogGridHeader columns={visibleColumns} />
      <div
        ref={scrollContainerRef}
        className="vlg-scroll-container"
        style={scrollContainerStyle}
      >
        <div style={innerStyle}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index];
            return (
              <VirtualLogGridRow
                key={virtualRow.key}
                entry={entry}
                style={getRowStyle(virtualRow.start, virtualRow.size)}
                isSelected={entry.id === selectedEntryId}
                isOdd={alternatingRows && virtualRow.index % 2 === 1}
                onClick={handleRowClick}
                columns={visibleColumns}
                highlightStyle={getHighlightStyle(entry)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
