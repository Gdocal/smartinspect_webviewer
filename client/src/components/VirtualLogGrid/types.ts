import { LogEntry, HighlightRule } from '../../store/logStore';

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
  onKeyboardNavigate?: (entryId: number) => void;
}

export type ColumnType = 'icon' | 'level' | 'text' | 'number' | 'timestamp' | 'stream-content' | 'context-tags' | 'trace-id' | 'span-name' | 'span-kind';

export interface ColumnConfig {
  id: string;
  field: string;
  header: string;
  type: ColumnType;
  width?: number;
  minWidth?: number;
  flex?: number;
  hidden?: boolean;
  pinned?: 'left' | 'right';
  align?: 'left' | 'center' | 'right';
}

// Default columns matching ViewGrid
export const DEFAULT_COLUMNS: ColumnConfig[] = [
  {
    id: 'icon',
    field: 'logEntryType',
    header: '',
    type: 'icon',
    width: 32,
    minWidth: 32,
    pinned: 'left',
    align: 'center',
  },
  {
    id: 'title',
    field: 'title',
    header: 'Title',
    type: 'text',
    flex: 2,
    minWidth: 200,
  },
  {
    id: 'level',
    field: 'level',
    header: 'Level',
    type: 'level',
    width: 60,
    minWidth: 50,
    hidden: true,
    align: 'center',
  },
  {
    id: 'session',
    field: 'sessionName',
    header: 'Session',
    type: 'text',
    width: 140,
    minWidth: 100,
  },
  {
    id: 'app',
    field: 'appName',
    header: 'Application',
    type: 'text',
    width: 140,
    minWidth: 100,
    hidden: true,
  },
  {
    id: 'host',
    field: 'hostName',
    header: 'Host',
    type: 'text',
    width: 120,
    minWidth: 80,
    hidden: true,
  },
  {
    id: 'process',
    field: 'processId',
    header: 'Process',
    type: 'number',
    width: 80,
    minWidth: 60,
    hidden: true,
  },
  {
    id: 'thread',
    field: 'threadId',
    header: 'Thread',
    type: 'number',
    width: 70,
    minWidth: 50,
    hidden: true,
  },
  {
    id: 'data',
    field: 'data',
    header: 'Data',
    type: 'text',
    flex: 1,
    minWidth: 100,
    hidden: true,
  },
  {
    id: 'timestamp',
    field: 'timestamp',
    header: 'Time',
    type: 'timestamp',
    width: 110,
    minWidth: 90,
  },
  // OpenTelemetry trace columns (extracted from ctx)
  {
    id: 'traceId',
    field: 'ctx._traceId',
    header: 'TraceId',
    type: 'trace-id',
    width: 100,
    minWidth: 80,
    hidden: true,  // Enable for distributed tracing
  },
  {
    id: 'spanName',
    field: 'ctx._spanName',
    header: 'Span',
    type: 'span-name',
    width: 140,
    minWidth: 100,
    hidden: true,
  },
  {
    id: 'spanKind',
    field: 'ctx._spanKind',
    header: 'Kind',
    type: 'span-kind',
    width: 70,
    minWidth: 50,
    hidden: true,
    align: 'center',
  },
  // Context tags (v3 protocol - flexible key-value pairs)
  {
    id: 'ctx',
    field: 'ctx',
    header: 'Context',
    type: 'context-tags',
    width: 200,
    minWidth: 100,
    hidden: true,  // Hidden by default, enable for context-based debugging
  },
];

export interface RowHighlightStyle {
  backgroundColor?: string;
  color?: string;
  fontWeight?: string | number;
  fontStyle?: string;
}
