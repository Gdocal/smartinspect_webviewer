import { memo, CSSProperties } from 'react';
import { format } from 'date-fns';
import { LogEntry, Level, LogEntryType } from '../../store/logStore';
import type { ColumnConfig } from './types';
import type { CellRange } from './VirtualLogGrid';

export interface VirtualLogGridRowProps {
  entry: LogEntry;
  rowIndex: number;
  style: CSSProperties;
  isOdd: boolean;
  columns: ColumnConfig[];
  highlightStyle?: CSSProperties;
  selection: CellRange | null | undefined;
  onCellMouseDown: (rowIndex: number, colIndex: number, e: React.MouseEvent) => void;
  isCellSelected: (rowIndex: number, colIndex: number, range: CellRange | null) => boolean;
  getCellPosition: (rowIndex: number, colIndex: number, range: CellRange | null) => {
    isTop: boolean;
    isBottom: boolean;
    isLeft: boolean;
    isRight: boolean;
  };
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
        try {
          const decoded = atob(entry.data);
          return decoded.length > 200 ? decoded.substring(0, 200) + '...' : decoded;
        } catch {
          return '[Binary Data]';
        }
      }
      return entry.data;
    }
    default: return '';
  }
}

// Render cell content based on column type
function renderCell(entry: LogEntry, column: ColumnConfig) {
  switch (column.type) {
    case 'icon':
      return <IconCell entry={entry} />;
    case 'level':
      return <LevelCell level={entry.level} />;
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
  onCellMouseDown,
  isCellSelected,
  getCellPosition,
}: VirtualLogGridRowProps) {
  // Merge highlight style with row classes - avoid spread if no highlight
  const rowStyle: CSSProperties = highlightStyle
    ? { ...style, ...highlightStyle }
    : style;

  // Build class names
  let className = 'vlg-row';
  if (isOdd && !highlightStyle) className += ' odd';
  if (highlightStyle) className += ' highlighted';

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
  prev.selection === next.selection
);
