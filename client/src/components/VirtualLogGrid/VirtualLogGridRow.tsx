import { memo, CSSProperties } from 'react';
import { format } from 'date-fns';
import { LogEntry, Level, LogEntryType } from '../../store/logStore';
import type { ColumnConfig } from './types';
import type { MultiSelection } from './VirtualLogGrid';

export interface VirtualLogGridRowProps {
  entry: LogEntry;
  rowIndex: number;
  style: CSSProperties;
  isOdd: boolean;
  columns: ColumnConfig[];
  highlightStyle?: CSSProperties;
  selection: MultiSelection | null | undefined;
  /** Serialized key representing selection state for this row - used for memoization */
  selectionKey: string;
  onCellMouseDown: (rowIndex: number, colIndex: number, e: React.MouseEvent) => void;
  isCellSelected: (rowIndex: number, colIndex: number, selection: MultiSelection | null) => boolean;
  getCellPosition: (rowIndex: number, colIndex: number, selection: MultiSelection | null) => {
    isTop: boolean;
    isBottom: boolean;
    isLeft: boolean;
    isRight: boolean;
  };
  /** Whether this row is selected (for detail panel indication) */
  isRowSelected?: boolean;
}

// Separator row component - renders a horizontal line with optional color
function SeparatorRow({
  entry,
  style,
  highlightStyle,
}: {
  entry: LogEntry;
  style: CSSProperties;
  highlightStyle?: CSSProperties;
}) {
  const rowStyle: CSSProperties = {
    ...style,
    ...highlightStyle,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // Determine line color:
  // - Default: let CSS handle it (uses --vlg-text-muted which adapts to theme)
  // - Use entry.color only if it's bright enough to be visible
  let lineStyle: CSSProperties = {};
  if (entry.color) {
    const { r, g, b, a } = entry.color;
    // Check if color is too dark (nearly black) - use threshold of 30
    const isDark = r < 30 && g < 30 && b < 30;
    if (!isDark) {
      lineStyle = { background: `rgba(${r}, ${g}, ${b}, ${a / 255})` };
    }
    // If too dark, let CSS handle it with theme-appropriate color
  }

  return (
    <div className="vlg-row vlg-separator-row" style={rowStyle}>
      <div className="vlg-separator-line" style={lineStyle} />
    </div>
  );
}

// Log entry type to icon mapping - matches ViewGrid
const EntryTypeIcons: Record<number, { icon: string; color: string; title: string }> = {
  [LogEntryType.EnterMethod]: { icon: '→', color: '#22c55e', title: 'Enter Method' },
  [LogEntryType.LeaveMethod]: { icon: '←', color: '#ef4444', title: 'Leave Method' },
  [LogEntryType.Separator]: { icon: '―', color: '#6b7280', title: 'Separator' },
  [LogEntryType.Message]: { icon: '●', color: '#3b82f6', title: 'Message' },
  [LogEntryType.Warning]: { icon: '⚠', color: '#f59e0b', title: 'Warning' },
  [LogEntryType.Error]: { icon: '✕', color: '#ef4444', title: 'Error' },
  [LogEntryType.Fatal]: { icon: '☠', color: '#dc2626', title: 'Fatal' },
  [LogEntryType.Debug]: { icon: '○', color: '#6b7280', title: 'Debug' },
  [LogEntryType.Verbose]: { icon: '◌', color: '#9ca3af', title: 'Verbose' },
  [LogEntryType.Checkpoint]: { icon: '◆', color: '#8b5cf6', title: 'Checkpoint' },
  [LogEntryType.Assert]: { icon: '!', color: '#ef4444', title: 'Assert' },
  [LogEntryType.Text]: { icon: '☰', color: '#3b82f6', title: 'Text' },
  [LogEntryType.Object]: { icon: '{}', color: '#3b82f6', title: 'Object' },
  [LogEntryType.Source]: { icon: '❮❯', color: '#8b5cf6', title: 'Source' },
  [LogEntryType.Binary]: { icon: '01', color: '#6b7280', title: 'Binary' },
  [LogEntryType.System]: { icon: '⚙', color: '#6b7280', title: 'System' },
  [LogEntryType.VariableValue]: { icon: '=', color: '#3b82f6', title: 'Variable' },
};

// Level config for badges - matches ViewGrid
const levelConfig: Record<number, { bg: string; text: string; label: string }> = {
  [Level.Debug]: { bg: '#374151', text: '#9ca3af', label: 'DBG' },
  [Level.Verbose]: { bg: '#374151', text: '#d1d5db', label: 'VRB' },
  [Level.Message]: { bg: '#1e3a5f', text: '#60a5fa', label: 'INF' },
  [Level.Warning]: { bg: '#78350f', text: '#fbbf24', label: 'WRN' },
  [Level.Error]: { bg: '#7f1d1d', text: '#fca5a5', label: 'ERR' },
  [Level.Fatal]: { bg: '#dc2626', text: '#ffffff', label: 'FTL' },
};

// Timestamp formatting with cache
const timestampCache = new Map<string, string>();
const CACHE_MAX_SIZE = 5000;

// Binary data decoding cache - avoids atob() in render path
const decodedDataCache = new Map<string, string>();
const DECODED_CACHE_MAX_SIZE = 1000;

// Merged style cache - avoids creating new style objects on every render
// Key: `${position}_${highlightKey}_${entryColorKey}` where keys are based on style properties
const mergedStyleCache = new Map<string, CSSProperties>();
const MERGED_STYLE_CACHE_MAX_SIZE = 500;

// Entry color type for convenience
type EntryColor = { r: number; g: number; b: number; a: number };

// Convert entry.color to CSS background color
// Returns undefined if color is too dark (nearly black) or not set
function getEntryBackgroundColor(color: EntryColor | undefined): string | undefined {
  if (!color) return undefined;
  const { r, g, b, a } = color;
  // Skip if too dark (nearly black) - threshold of 30
  if (r < 30 && g < 30 && b < 30) return undefined;
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

// Simple check if entry has a valid (non-dark) color
function hasValidEntryColor(color: EntryColor | undefined): boolean {
  if (!color) return false;
  return !(color.r < 30 && color.g < 30 && color.b < 30);
}

// Get or create merged row style with caching
// Priority: highlightStyle > entryColor > baseStyle
function getMergedRowStyle(
  baseStyle: CSSProperties,
  highlightStyle: CSSProperties | undefined,
  entryColor: EntryColor | undefined
): CSSProperties {
  // Create a cache key from position (transform), highlight properties, and entry color
  const transform = baseStyle.transform || '';
  const height = baseStyle.height || '';
  const highlightKey = highlightStyle
    ? `${highlightStyle.backgroundColor || ''}_${highlightStyle.color || ''}_${highlightStyle.fontWeight || ''}_${highlightStyle.fontStyle || ''}`
    : '';
  const entryColorKey = entryColor ? `${entryColor.r}_${entryColor.g}_${entryColor.b}_${entryColor.a}` : '';
  const cacheKey = `${transform}_${height}_${highlightKey}_${entryColorKey}`;

  let cached = mergedStyleCache.get(cacheKey);
  if (cached) return cached;

  // Highlight rules take priority over entry color
  if (highlightStyle) {
    cached = { ...baseStyle, ...highlightStyle };
  } else {
    // Apply entry color directly if no highlight and color is valid
    const entryBg = getEntryBackgroundColor(entryColor);
    if (entryBg) {
      cached = { ...baseStyle, backgroundColor: entryBg };
    } else {
      cached = baseStyle;
    }
  }

  // LRU-style eviction
  if (mergedStyleCache.size >= MERGED_STYLE_CACHE_MAX_SIZE) {
    const firstKey = mergedStyleCache.keys().next().value;
    if (firstKey) mergedStyleCache.delete(firstKey);
  }
  mergedStyleCache.set(cacheKey, cached);
  return cached;
}

function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return '';

  let cached = timestampCache.get(timestamp);
  if (cached) return cached;

  try {
    cached = format(new Date(timestamp), 'HH:mm:ss.SSS');
  } catch {
    cached = '';
  }

  if (timestampCache.size > CACHE_MAX_SIZE) {
    const firstKey = timestampCache.keys().next().value;
    if (firstKey) timestampCache.delete(firstKey);
  }
  timestampCache.set(timestamp, cached);
  return cached;
}

// Decode base64 data with caching to avoid atob() in render
function decodeBase64Data(data: string, maxLength: number): string {
  // Use data hash as cache key (first 100 chars + length for uniqueness)
  const cacheKey = `${data.substring(0, 100)}_${data.length}_${maxLength}`;

  let cached = decodedDataCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    // Decode base64 to binary, then convert to UTF-8
    const binaryStr = atob(data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    // Use TextDecoder to properly decode UTF-8 (handles BOM automatically)
    const decoder = new TextDecoder('utf-8');
    let decoded = decoder.decode(bytes);
    // Strip UTF-8 BOM if present
    if (decoded.charCodeAt(0) === 0xFEFF) {
      decoded = decoded.slice(1);
    }
    cached = decoded.length > maxLength ? decoded.substring(0, maxLength) + '...' : decoded;
  } catch {
    cached = '[Binary Data]';
  }

  // LRU-style cache eviction
  if (decodedDataCache.size >= DECODED_CACHE_MAX_SIZE) {
    const firstKey = decodedDataCache.keys().next().value;
    if (firstKey) decodedDataCache.delete(firstKey);
  }
  decodedDataCache.set(cacheKey, cached);
  return cached;
}

// Icon cell renderer
function IconCell({ entry }: { entry: LogEntry }) {
  const entryType = entry.logEntryType ?? LogEntryType.Message;
  const iconInfo = EntryTypeIcons[entryType] || EntryTypeIcons[LogEntryType.Message];

  return (
    <span
      title={iconInfo.title}
      style={{
        color: iconInfo.color,
        fontWeight: 'bold',
        fontSize: '14px',
      }}
    >
      {iconInfo.icon}
    </span>
  );
}

// Level badge cell renderer
function LevelCell({ level }: { level: number | undefined }) {
  if (level === undefined) return null;

  const config = levelConfig[level] || levelConfig[Level.Message];

  return (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: '3px',
        fontSize: '10px',
        fontWeight: 600,
        backgroundColor: config.bg,
        color: config.text,
      }}
    >
      {config.label}
    </span>
  );
}

// Cell value getter based on column field
function getCellValue(entry: LogEntry, field: string): string {
  switch (field) {
    case 'title': return entry.title || '';
    case 'sessionName': return entry.sessionName || '';
    case 'appName': return entry.appName || '';
    case 'hostName': return entry.hostName || '';
    case 'processId': return entry.processId?.toString() || '';
    case 'threadId': return entry.threadId?.toString() || '';
    case 'timestamp': return formatTimestamp(entry.timestamp);
    case 'data': {
      if (!entry.data) return '';
      if (entry.dataEncoding === 'base64') {
        return decodeBase64Data(entry.data, 400);
      }
      return entry.data;
    }
    default: return '';
  }
}

// Stream content cell renderer - truncates and handles binary
function StreamContentCell({ entry }: { entry: LogEntry }) {
  if (!entry.data) return <span className="vlg-empty-data">-</span>;

  // Handle binary data
  if (entry.dataEncoding === 'base64') {
    return <span className="vlg-binary-data">[Binary]</span>;
  }

  // Truncate long content (show more in table, full text in detail panel)
  const content = entry.data.length > 600 ? entry.data.substring(0, 600) + '...' : entry.data;
  return <span>{content}</span>;
}

// Render cell content based on column type
function renderCell(entry: LogEntry, column: ColumnConfig) {
  switch (column.type) {
    case 'icon':
      return <IconCell entry={entry} />;
    case 'level':
      return <LevelCell level={entry.level} />;
    case 'stream-content':
      return <StreamContentCell entry={entry} />;
    default:
      return getCellValue(entry, column.field);
  }
}

export const VirtualLogGridRow = memo(function VirtualLogGridRow({
  entry,
  rowIndex,
  style,
  isOdd,
  columns,
  highlightStyle,
  selection,
  selectionKey: _selectionKey, // Used for memo comparison, not in render
  onCellMouseDown,
  isCellSelected,
  getCellPosition,
  isRowSelected,
}: VirtualLogGridRowProps) {
  void _selectionKey; // Suppress unused warning - used in memo comparison

  // Render separator entries as horizontal lines
  if (entry.logEntryType === LogEntryType.Separator) {
    return <SeparatorRow entry={entry} style={style} highlightStyle={highlightStyle} />;
  }

  // Merge highlight style and entry color with row classes - use cached merged style to avoid allocations
  // Priority: highlightStyle > entry.color > default
  const rowStyle = getMergedRowStyle(style, highlightStyle, entry.color);

  // Check if row has custom background (highlight or entry color)
  const hasCustomBackground = highlightStyle || hasValidEntryColor(entry.color);

  // Build class names
  let className = 'vlg-row';
  if (isOdd && !hasCustomBackground) className += ' odd';
  if (hasCustomBackground) className += ' highlighted';
  if (isRowSelected) className += ' row-selected';

  return (
    <div className={className} style={rowStyle}>
      {columns.map((column, colIndex) => {
        const isSelected = isCellSelected(rowIndex, colIndex, selection ?? null);
        const position = getCellPosition(rowIndex, colIndex, selection ?? null);

        // Build cell class names for selection borders
        let cellClassName = `vlg-cell vlg-cell-${column.id}`;
        if (isSelected) {
          cellClassName += ' selected';
          if (position.isTop) cellClassName += ' sel-top';
          if (position.isBottom) cellClassName += ' sel-bottom';
          if (position.isLeft) cellClassName += ' sel-left';
          if (position.isRight) cellClassName += ' sel-right';
        }

        const cellStyle: CSSProperties = {
          width: column.width,
          flex: column.flex,
          minWidth: column.minWidth,
          textAlign: column.align,
        };

        return (
          <div
            key={column.id}
            className={cellClassName}
            style={cellStyle}
            title={column.type === 'text' ? getCellValue(entry, column.field) : undefined}
            onMouseDown={(e) => onCellMouseDown(rowIndex, colIndex, e)}
          >
            {renderCell(entry, column)}
          </div>
        );
      })}
    </div>
  );
}, (prev, next) =>
  prev.entry.id === next.entry.id &&
  prev.rowIndex === next.rowIndex &&
  prev.isOdd === next.isOdd &&
  prev.highlightStyle === next.highlightStyle &&
  prev.columns === next.columns &&
  prev.selectionKey === next.selectionKey && // Compare selectionKey instead of selection object
  prev.isRowSelected === next.isRowSelected
);

// Skeleton row for loading state - shows placeholder boxes
export interface SkeletonRowProps {
  rowIndex: number;
  style: CSSProperties;
  columns: ColumnConfig[];
  isOdd: boolean;
}

// Varying widths for skeleton content to look more natural
const SKELETON_WIDTHS = ['60%', '75%', '45%', '80%', '55%', '70%', '40%', '65%'];

export const SkeletonRow = memo(function SkeletonRow({
  rowIndex,
  style,
  columns,
  isOdd,
}: SkeletonRowProps) {
  return (
    <div className={`vlg-row vlg-skeleton-row${isOdd ? ' odd' : ''}`} style={style}>
      {columns.map((column, colIndex) => {
        const cellStyle: CSSProperties = {
          width: column.width,
          flex: column.flex,
          minWidth: column.minWidth,
        };

        // Different skeleton styles based on column type
        let skeletonContent: React.ReactNode;
        if (column.type === 'icon') {
          skeletonContent = <div className="vlg-skeleton-icon" />;
        } else if (column.type === 'level') {
          skeletonContent = <div className="vlg-skeleton-badge" />;
        } else {
          // Text columns get varying width placeholders
          const widthIndex = (rowIndex + colIndex) % SKELETON_WIDTHS.length;
          skeletonContent = (
            <div
              className="vlg-skeleton-text"
              style={{ width: SKELETON_WIDTHS[widthIndex] }}
            />
          );
        }

        return (
          <div key={column.id} className={`vlg-cell vlg-cell-${column.id}`} style={cellStyle}>
            {skeletonContent}
          </div>
        );
      })}
    </div>
  );
});
