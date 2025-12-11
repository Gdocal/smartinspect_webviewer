import { memo, useEffect, useRef, useState } from 'react';
import { LogEntry, LogEntryType, useLogStore, defaultListTextFilter, defaultHighlightFilter, HighlightRule } from '../../store/logStore';
import type { ColumnConfig } from './types';
import { format } from 'date-fns';
import { TitleFilterModal } from '../TitleFilterModal';

// Color palette for random highlight colors (from HighlightsPanel)
const HIGHLIGHT_COLORS = [
  { bg: '#fef2f2', text: '#991b1b' }, { bg: '#fecaca', text: '#991b1b' }, { bg: '#dc2626', text: '#ffffff' },
  { bg: '#fff7ed', text: '#9a3412' }, { bg: '#fed7aa', text: '#9a3412' }, { bg: '#ea580c', text: '#ffffff' },
  { bg: '#fffbeb', text: '#92400e' }, { bg: '#fde68a', text: '#78350f' }, { bg: '#d97706', text: '#ffffff' },
  { bg: '#ecfdf5', text: '#065f46' }, { bg: '#a7f3d0', text: '#065f46' }, { bg: '#16a34a', text: '#ffffff' },
  { bg: '#eff6ff', text: '#1e40af' }, { bg: '#bfdbfe', text: '#1e40af' }, { bg: '#2563eb', text: '#ffffff' },
  { bg: '#f5f3ff', text: '#5b21b6' }, { bg: '#ddd6fe', text: '#5b21b6' }, { bg: '#7c3aed', text: '#ffffff' },
  { bg: '#f8fafc', text: '#334155' }, { bg: '#e2e8f0', text: '#1e293b' }, { bg: '#475569', text: '#ffffff' },
];

// Get a random unique color not used by existing rules
function getRandomUniqueColor(existingRules: HighlightRule[]): { backgroundColor: string; textColor: string } {
  const usedColors = new Set(existingRules.map(r => r.style.backgroundColor).filter(Boolean));
  const availableColors = HIGHLIGHT_COLORS.filter(c => !usedColors.has(c.bg));
  const colorPool = availableColors.length > 0 ? availableColors : HIGHLIGHT_COLORS;
  const randomColor = colorPool[Math.floor(Math.random() * colorPool.length)];
  return { backgroundColor: randomColor.bg, textColor: randomColor.text };
}

// Helper to get column info from clicked column index
function getColumnInfo(colIndex: number, columns: ColumnConfig[], entry: LogEntry): { field: string; value: string | number | undefined; label: string } | null {
  const col = columns[colIndex];
  if (!col) return null;

  const fieldMap: Record<string, { label: string; getValue: (e: LogEntry) => string | number | undefined }> = {
    sessionName: { label: 'Session', getValue: e => e.sessionName },
    appName: { label: 'App', getValue: e => e.appName },
    hostName: { label: 'Host', getValue: e => e.hostName },
    level: { label: 'Level', getValue: e => e.level },
    logEntryType: { label: 'Type', getValue: e => e.logEntryType },
    processId: { label: 'Process', getValue: e => e.processId },
    title: { label: 'Title', getValue: e => e.title },
  };

  const mapping = fieldMap[col.field];
  if (!mapping) return null;

  return {
    field: col.field,
    value: mapping.getValue(entry),
    label: mapping.label,
  };
}

// Format value for display in menu
function formatColumnValue(value: string | number | undefined, field: string): string {
  if (value === undefined || value === null || value === '') return '(none)';
  if (field === 'level') return getLevelText(value as number);
  if (field === 'logEntryType') return getEntryTypeName(value as number);
  const strValue = String(value);
  return strValue.length > 25 ? strValue.slice(0, 25) + '...' : strValue;
}

interface RowContextMenuProps {
  position: { x: number; y: number };
  selectedEntries: LogEntry[];
  entries: LogEntry[];
  columns: ColumnConfig[];
  allColumns: ColumnConfig[];  // Full visible columns list for column index lookup
  clickedColIndex: number;     // Which column was clicked
  onClose: () => void;
  clickedEntry: LogEntry | null;
  onOpenTitleHighlightModal?: (entry: LogEntry) => void;
  onOpenTitleViewModal?: (entry: LogEntry) => void;  // For "Create View by Title..."
}

// Get entry type name for display
function getEntryTypeName(type: number | undefined): string {
  if (type === undefined) return 'Unknown';
  const typeMap: Record<number, string> = {
    [LogEntryType.Separator]: 'Separator',
    [LogEntryType.EnterMethod]: 'EnterMethod',
    [LogEntryType.LeaveMethod]: 'LeaveMethod',
    [LogEntryType.ResetCallstack]: 'ResetCallstack',
    [LogEntryType.Message]: 'Message',
    [LogEntryType.Warning]: 'Warning',
    [LogEntryType.Error]: 'Error',
    [LogEntryType.InternalError]: 'InternalError',
    [LogEntryType.Comment]: 'Comment',
    [LogEntryType.VariableValue]: 'VariableValue',
    [LogEntryType.Checkpoint]: 'Checkpoint',
    [LogEntryType.Debug]: 'Debug',
    [LogEntryType.Verbose]: 'Verbose',
    [LogEntryType.Fatal]: 'Fatal',
    [LogEntryType.Conditional]: 'Conditional',
    [LogEntryType.Assert]: 'Assert',
    [LogEntryType.Text]: 'Text',
    [LogEntryType.Binary]: 'Binary',
    [LogEntryType.Graphic]: 'Graphic',
    [LogEntryType.Source]: 'Source',
    [LogEntryType.Object]: 'Object',
    [LogEntryType.WebContent]: 'WebContent',
    [LogEntryType.System]: 'System',
    [LogEntryType.MemoryStatistic]: 'MemoryStatistic',
    [LogEntryType.DatabaseResult]: 'DatabaseResult',
    [LogEntryType.DatabaseStructure]: 'DatabaseStructure',
  };
  return typeMap[type] || `Type ${type}`;
}

// Copy text to clipboard with fallback for non-HTTPS
async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback using execCommand
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  } catch {
    document.body.removeChild(textArea);
    return false;
  }
}

// Selection info for smart copy
interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface MultiSelection {
  ranges: CellRange[];
  anchor?: { row: number; col: number };
}

// Normalize a range so start <= end
function normalizeRange(range: CellRange): CellRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endRow: Math.max(range.startRow, range.endRow),
    endCol: Math.max(range.startCol, range.endCol),
  };
}

// Check if a cell is selected in the given selection
function isCellInSelection(rowIndex: number, colIndex: number, selection: MultiSelection | null): boolean {
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

// Format entries for text copy (multiple entries supported)
function formatEntriesForCopy(entries: LogEntry[], columns: ColumnConfig[]): string {
  const visibleColumns = columns.filter(col => !col.hidden && col.type !== 'icon');
  return entries.map(entry => {
    const values = visibleColumns.map(col => getCellText(entry, col.field));
    return values.join('\t');
  }).join('\n');
}

/**
 * Smart format for non-contiguous selections
 * Shows headers for all selected columns, values only in selected cells,
 * with "..." to indicate gaps between row groups
 *
 * @param allEntries - The full entries array (for row lookup by index)
 * @param visibleColumns - The visible columns array AS USED BY THE GRID (indices must match selection)
 * @param selection - The multi-selection with row/col indices into visibleColumns
 */
function formatSelectionForCopy(
  allEntries: LogEntry[],
  visibleColumns: ColumnConfig[],
  selection: MultiSelection | null
): string {
  if (!selection || selection.ranges.length === 0) return '';

  // Find all selected rows and columns (by index in visibleColumns)
  const selectedRows = new Set<number>();
  const selectedColIndices = new Set<number>();

  for (const range of selection.ranges) {
    const norm = normalizeRange(range);
    for (let r = norm.startRow; r <= norm.endRow; r++) {
      selectedRows.add(r);
    }
    for (let c = norm.startCol; c <= norm.endCol; c++) {
      selectedColIndices.add(c);
    }
  }

  // Sort rows and columns
  const sortedRows = Array.from(selectedRows).sort((a, b) => a - b);
  const sortedColIndices = Array.from(selectedColIndices).sort((a, b) => a - b);

  // Filter out icon columns from output (but keep indices aligned)
  // We skip icon columns in output but use original indices for cell lookup
  const colIndicesToShow = sortedColIndices.filter(idx => {
    const col = visibleColumns[idx];
    return col && col.type !== 'icon';
  });

  if (colIndicesToShow.length === 0 || sortedRows.length === 0) return '';

  // Build output lines
  const lines: string[] = [];

  // Add header row
  const headers = colIndicesToShow.map(idx => visibleColumns[idx]?.header || '');
  lines.push(headers.join('\t'));

  // Process rows with gap indicators
  let lastRowIndex = -2; // Track for gap detection
  for (const rowIndex of sortedRows) {
    const entry = allEntries[rowIndex];
    if (!entry) continue;

    // Add gap indicator if there's a break in row sequence
    if (lastRowIndex >= 0 && rowIndex > lastRowIndex + 1) {
      lines.push('...');
    }
    lastRowIndex = rowIndex;

    // Build row values - only include values for cells that are actually selected
    const values = colIndicesToShow.map(colIdx => {
      if (isCellInSelection(rowIndex, colIdx, selection)) {
        const col = visibleColumns[colIdx];
        return col ? getCellText(entry, col.field) : '';
      }
      return ''; // Empty for non-selected cells
    });

    lines.push(values.join('\t'));
  }

  return lines.join('\n');
}

// Format entries with headers for copy
function formatEntriesWithHeaders(entries: LogEntry[], columns: ColumnConfig[]): string {
  const visibleColumns = columns.filter(col => !col.hidden && col.type !== 'icon');
  const headers = visibleColumns.map(col => col.header);
  const headerLine = headers.join('\t');

  const dataLines = entries.map(entry => {
    const values = visibleColumns.map(col => getCellText(entry, col.field));
    return values.join('\t');
  });

  return [headerLine, ...dataLines].join('\n');
}

// Get decoded data/details from entry
function getEntryDetails(entry: LogEntry): string | null {
  if (!entry.data) return null;
  let decoded: string;
  if (entry.dataEncoding === 'base64') {
    try {
      decoded = atob(entry.data);
    } catch {
      return null;
    }
  } else {
    decoded = entry.data;
  }
  // Strip UTF-8 BOM if present (appears as ï»¿ or \uFEFF)
  if (decoded.charCodeAt(0) === 0xFEFF || decoded.startsWith('\ufeff')) {
    decoded = decoded.slice(1);
  }
  // Also handle the mojibake version (ï»¿) that appears when UTF-8 BOM is misinterpreted
  if (decoded.startsWith('ï»¿')) {
    decoded = decoded.slice(3);
  }
  return decoded;
}

// Format entries with details (data field) for copy
function formatEntriesWithDetails(entries: LogEntry[], columns: ColumnConfig[]): string {
  const visibleColumns = columns.filter(col => !col.hidden && col.type !== 'icon');

  const lines: string[] = [];
  for (const entry of entries) {
    const values = visibleColumns.map(col => getCellText(entry, col.field));
    lines.push(values.join('\t'));

    // Add details if present
    const details = getEntryDetails(entry);
    if (details) {
      // Indent details with a tab and prefix
      const detailLines = details.split('\n').map(line => `\t${line}`);
      lines.push(...detailLines);
    }
  }

  return lines.join('\n');
}

// Format entries with headers AND details for copy
function formatEntriesWithHeadersAndDetails(entries: LogEntry[], columns: ColumnConfig[]): string {
  const visibleColumns = columns.filter(col => !col.hidden && col.type !== 'icon');
  const headers = visibleColumns.map(col => col.header);
  const headerLine = headers.join('\t');

  const lines: string[] = [headerLine];
  for (const entry of entries) {
    const values = visibleColumns.map(col => getCellText(entry, col.field));
    lines.push(values.join('\t'));

    // Add details if present
    const details = getEntryDetails(entry);
    if (details) {
      // Indent details with a tab and prefix
      const detailLines = details.split('\n').map(line => `\t${line}`);
      lines.push(...detailLines);
    }
  }

  return lines.join('\n');
}

// Check if any entries have details
function hasAnyDetails(entries: LogEntry[]): boolean {
  return entries.some(entry => {
    if (!entry.data) return false;
    if (entry.dataEncoding === 'base64') {
      try {
        return atob(entry.data).length > 0;
      } catch {
        return false;
      }
    }
    return entry.data.length > 0;
  });
}

// Format entries for CSV export
function formatEntriesForCSV(entries: LogEntry[], columns: ColumnConfig[]): string {
  const visibleColumns = columns.filter(col => !col.hidden && col.type !== 'icon');
  const headers = visibleColumns.map(col => escapeCSV(col.header));
  const headerLine = headers.join(',');

  const dataLines = entries.map(entry => {
    const values = visibleColumns.map(col => escapeCSV(getCellText(entry, col.field)));
    return values.join(',');
  });

  return [headerLine, ...dataLines].join('\n');
}

// Escape value for CSV
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Get text value for a cell
function getCellText(entry: LogEntry, field: string): string {
  switch (field) {
    case 'title': return entry.title || '';
    case 'sessionName': return entry.sessionName || '';
    case 'appName': return entry.appName || '';
    case 'hostName': return entry.hostName || '';
    case 'processId': return entry.processId?.toString() || '';
    case 'threadId': return entry.threadId?.toString() || '';
    case 'level': return getLevelText(entry.level);
    case 'timestamp':
      if (!entry.timestamp) return '';
      try {
        return format(new Date(entry.timestamp), 'HH:mm:ss.SSS');
      } catch {
        return '';
      }
    case 'data': {
      if (!entry.data) return '';
      if (entry.dataEncoding === 'base64') {
        try {
          return atob(entry.data);
        } catch {
          return '[Binary Data]';
        }
      }
      return entry.data;
    }
    default: return '';
  }
}

function getLevelText(level: number | undefined): string {
  switch (level) {
    case 0: return 'Debug';
    case 1: return 'Verbose';
    case 2: return 'Message';
    case 3: return 'Warning';
    case 4: return 'Error';
    case 5: return 'Fatal';
    default: return '';
  }
}

export const RowContextMenu = memo(function RowContextMenu({
  position,
  selectedEntries,
  entries,
  columns,
  allColumns,
  clickedColIndex,
  onClose,
  clickedEntry,
  onOpenTitleHighlightModal,
  onOpenTitleViewModal,
}: RowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showSubmenu, setShowSubmenu] = useState(false);
  const [showCopySubmenu, setShowCopySubmenu] = useState(false);
  const [showHighlightSubmenu, setShowHighlightSubmenu] = useState(false);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const submenuRef = useRef<HTMLDivElement>(null);
  const copySubmenuRef = useRef<HTMLDivElement>(null);
  const highlightSubmenuRef = useRef<HTMLDivElement>(null);

  const addView = useLogStore(state => state.addView);
  const addHighlightRule = useLogStore(state => state.addHighlightRule);
  const globalHighlightRules = useLogStore(state => state.globalHighlightRules);

  // Get info about clicked column
  const clickedColInfo = clickedEntry ? getColumnInfo(clickedColIndex, allColumns, clickedEntry) : null;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${position.x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${position.y - rect.height}px`;
      }
    }
  }, [position]);

  // Position submenu to avoid overflow
  useEffect(() => {
    if (showSubmenu && submenuRef.current && menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const submenuRect = submenuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      // If submenu would overflow right, show it on the left side
      if (menuRect.right + submenuRect.width > viewportWidth) {
        submenuRef.current.style.left = 'auto';
        submenuRef.current.style.right = '100%';
      }
    }
  }, [showSubmenu]);

  // Position copy submenu to avoid overflow
  useEffect(() => {
    if (showCopySubmenu && copySubmenuRef.current && menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const submenuRect = copySubmenuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      if (menuRect.right + submenuRect.width > viewportWidth) {
        copySubmenuRef.current.style.left = 'auto';
        copySubmenuRef.current.style.right = '100%';
      }
    }
  }, [showCopySubmenu]);

  const handleCopy = async () => {
    if (selectedEntries.length === 0) return;
    const text = formatEntriesForCopy(selectedEntries, columns);
    await copyToClipboard(text);
    onClose();
  };

  const handleCopyWithHeaders = async () => {
    if (selectedEntries.length === 0) return;
    const text = formatEntriesWithHeaders(selectedEntries, columns);
    await copyToClipboard(text);
    onClose();
  };

  const handleCopyWithDetails = async () => {
    if (selectedEntries.length === 0) return;
    const text = formatEntriesWithDetails(selectedEntries, columns);
    await copyToClipboard(text);
    onClose();
  };

  const handleCopyWithHeadersAndDetails = async () => {
    if (selectedEntries.length === 0) return;
    const text = formatEntriesWithHeadersAndDetails(selectedEntries, columns);
    await copyToClipboard(text);
    onClose();
  };

  // Check if selected entries have any details
  const entriesHaveDetails = hasAnyDetails(selectedEntries);

  const handleExportCSV = () => {
    const csv = formatEntriesForCSV(entries, columns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `log-export-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onClose();
  };

  // Create view from Session
  const handleCreateViewFromSession = () => {
    if (!clickedEntry?.sessionName) return;
    addView({
      name: `Sess:${clickedEntry.sessionName}`,
      filter: {
        sessions: [],
        levels: [],
        titlePattern: '',
        messagePattern: '',
        inverseMatch: false,
        from: null,
        to: null,
        appNames: [],
        hostNames: [],
        entryTypes: [],
        sessionFilter: {
          mode: 'list',
          values: [clickedEntry.sessionName],
          textValue: '',
          textOperator: 'contains',
          inverse: false,
        },
        appNameFilter: { ...defaultListTextFilter },
        hostNameFilter: { ...defaultListTextFilter },
      },
      highlightRules: [],
      useGlobalHighlights: true,
      autoScroll: true,
    }, true);
    onClose();
  };

  // Create view from Application
  const handleCreateViewFromApp = () => {
    if (!clickedEntry?.appName) return;
    addView({
      name: `App:${clickedEntry.appName}`,
      filter: {
        sessions: [],
        levels: [],
        titlePattern: '',
        messagePattern: '',
        inverseMatch: false,
        from: null,
        to: null,
        appNames: [],
        hostNames: [],
        entryTypes: [],
        sessionFilter: { ...defaultListTextFilter },
        appNameFilter: {
          mode: 'list',
          values: [clickedEntry.appName],
          textValue: '',
          textOperator: 'contains',
          inverse: false,
        },
        hostNameFilter: { ...defaultListTextFilter },
      },
      highlightRules: [],
      useGlobalHighlights: true,
      autoScroll: true,
    }, true);
    onClose();
  };

  // Create view from Process ID
  const handleCreateViewFromProcess = () => {
    if (clickedEntry?.processId === undefined) return;
    addView({
      name: `Proc:${clickedEntry.processId}`,
      filter: {
        sessions: [],
        levels: [],
        titlePattern: '',
        messagePattern: '',
        inverseMatch: false,
        from: null,
        to: null,
        appNames: [],
        hostNames: [],
        entryTypes: [],
        sessionFilter: { ...defaultListTextFilter },
        appNameFilter: { ...defaultListTextFilter },
        hostNameFilter: { ...defaultListTextFilter },
        // Note: Process ID filter would need to be added to the Filter interface
        // For now, we'll use a workaround with titlePattern that won't work perfectly
        // This should be enhanced when proper processId filter support is added
      },
      highlightRules: [],
      useGlobalHighlights: true,
      autoScroll: true,
    }, true);
    onClose();
  };

  // Create view from Entity Type
  const handleCreateViewFromType = () => {
    if (clickedEntry?.logEntryType === undefined) return;
    const typeName = getEntryTypeName(clickedEntry.logEntryType);
    addView({
      name: `Type:${typeName}`,
      filter: {
        sessions: [],
        levels: [],
        titlePattern: '',
        messagePattern: '',
        inverseMatch: false,
        from: null,
        to: null,
        appNames: [],
        hostNames: [],
        entryTypes: [clickedEntry.logEntryType],
        sessionFilter: { ...defaultListTextFilter },
        appNameFilter: { ...defaultListTextFilter },
        hostNameFilter: { ...defaultListTextFilter },
      },
      highlightRules: [],
      useGlobalHighlights: true,
      autoScroll: true,
    }, true);
    onClose();
  };

  const handleCloseTitleModal = () => {
    setShowTitleModal(false);
    onClose();
  };

  // Create highlight rule from clicked column (smart action)
  const handleCreateHighlightFromColumn = () => {
    if (!clickedColInfo || clickedColInfo.field === 'title' || clickedColInfo.value === undefined) return;

    const randomColor = getRandomUniqueColor(globalHighlightRules);
    const filter = { ...defaultHighlightFilter };
    const displayValue = formatColumnValue(clickedColInfo.value, clickedColInfo.field);

    // Set the appropriate filter based on column type
    switch (clickedColInfo.field) {
      case 'sessionName':
        filter.sessionFilter = { mode: 'list', values: [String(clickedColInfo.value)], textValue: '', textOperator: 'contains', inverse: false };
        break;
      case 'appName':
        filter.appNameFilter = { mode: 'list', values: [String(clickedColInfo.value)], textValue: '', textOperator: 'contains', inverse: false };
        break;
      case 'hostName':
        filter.hostNameFilter = { mode: 'list', values: [String(clickedColInfo.value)], textValue: '', textOperator: 'contains', inverse: false };
        break;
      case 'level':
        filter.levels = [clickedColInfo.value as number];
        break;
      case 'logEntryType':
        filter.entryTypes = [clickedColInfo.value as number];
        break;
      case 'processId':
        filter.processId = clickedColInfo.value as number;
        break;
    }

    addHighlightRule({
      name: `${clickedColInfo.label}: ${displayValue}`,
      enabled: true,
      priority: globalHighlightRules.length + 1,
      filter,
      style: { backgroundColor: randomColor.backgroundColor, textColor: randomColor.textColor, fontWeight: 'normal' }
    });
    onClose();
  };

  // Create highlight from Session (submenu)
  const handleCreateHighlightFromSession = () => {
    if (!clickedEntry?.sessionName) return;
    const randomColor = getRandomUniqueColor(globalHighlightRules);
    addHighlightRule({
      name: `Session: ${clickedEntry.sessionName}`,
      enabled: true,
      priority: globalHighlightRules.length + 1,
      filter: {
        ...defaultHighlightFilter,
        sessionFilter: { mode: 'list', values: [clickedEntry.sessionName], textValue: '', textOperator: 'contains', inverse: false },
      },
      style: { backgroundColor: randomColor.backgroundColor, textColor: randomColor.textColor, fontWeight: 'normal' }
    });
    onClose();
  };

  // Create highlight from Application (submenu)
  const handleCreateHighlightFromApp = () => {
    if (!clickedEntry?.appName) return;
    const randomColor = getRandomUniqueColor(globalHighlightRules);
    addHighlightRule({
      name: `App: ${clickedEntry.appName}`,
      enabled: true,
      priority: globalHighlightRules.length + 1,
      filter: {
        ...defaultHighlightFilter,
        appNameFilter: { mode: 'list', values: [clickedEntry.appName], textValue: '', textOperator: 'contains', inverse: false },
      },
      style: { backgroundColor: randomColor.backgroundColor, textColor: randomColor.textColor, fontWeight: 'normal' }
    });
    onClose();
  };

  // Create highlight from Level (submenu)
  const handleCreateHighlightFromLevel = () => {
    if (clickedEntry?.level === undefined) return;
    const randomColor = getRandomUniqueColor(globalHighlightRules);
    addHighlightRule({
      name: `Level: ${getLevelText(clickedEntry.level)}`,
      enabled: true,
      priority: globalHighlightRules.length + 1,
      filter: {
        ...defaultHighlightFilter,
        levels: [clickedEntry.level],
      },
      style: { backgroundColor: randomColor.backgroundColor, textColor: randomColor.textColor, fontWeight: 'normal' }
    });
    onClose();
  };

  // Create highlight from Entry Type (submenu)
  const handleCreateHighlightFromType = () => {
    if (clickedEntry?.logEntryType === undefined) return;
    const randomColor = getRandomUniqueColor(globalHighlightRules);
    addHighlightRule({
      name: `Type: ${getEntryTypeName(clickedEntry.logEntryType)}`,
      enabled: true,
      priority: globalHighlightRules.length + 1,
      filter: {
        ...defaultHighlightFilter,
        entryTypes: [clickedEntry.logEntryType],
      },
      style: { backgroundColor: randomColor.backgroundColor, textColor: randomColor.textColor, fontWeight: 'normal' }
    });
    onClose();
  };

  // Open title highlight modal
  const handleOpenTitleHighlightModal = () => {
    if (clickedEntry && onOpenTitleHighlightModal) {
      onOpenTitleHighlightModal(clickedEntry);
      onClose();
    }
  };

  // Create view from clicked column (smart action)
  const handleCreateViewFromColumn = () => {
    if (!clickedColInfo || clickedColInfo.field === 'title' || clickedColInfo.value === undefined) return;

    const displayValue = formatColumnValue(clickedColInfo.value, clickedColInfo.field);
    const viewName = `${clickedColInfo.label}: ${displayValue}`;

    // Build filter based on column type
    const baseFilter = {
      sessions: [],
      levels: [] as number[],
      titlePattern: '',
      messagePattern: '',
      inverseMatch: false,
      from: null,
      to: null,
      appNames: [],
      hostNames: [],
      entryTypes: [] as number[],
      sessionFilter: { ...defaultListTextFilter },
      appNameFilter: { ...defaultListTextFilter },
      hostNameFilter: { ...defaultListTextFilter },
    };

    switch (clickedColInfo.field) {
      case 'sessionName':
        baseFilter.sessionFilter = { mode: 'list', values: [String(clickedColInfo.value)], textValue: '', textOperator: 'contains', inverse: false };
        break;
      case 'appName':
        baseFilter.appNameFilter = { mode: 'list', values: [String(clickedColInfo.value)], textValue: '', textOperator: 'contains', inverse: false };
        break;
      case 'hostName':
        baseFilter.hostNameFilter = { mode: 'list', values: [String(clickedColInfo.value)], textValue: '', textOperator: 'contains', inverse: false };
        break;
      case 'level':
        baseFilter.levels = [clickedColInfo.value as number];
        break;
      case 'logEntryType':
        baseFilter.entryTypes = [clickedColInfo.value as number];
        break;
    }

    addView({
      name: viewName,
      filter: baseFilter,
      highlightRules: [],
      useGlobalHighlights: true,
      autoScroll: true,
    }, true);
    onClose();
  };

  // Open title view modal
  const handleOpenTitleViewModal = () => {
    if (clickedEntry && onOpenTitleViewModal) {
      onOpenTitleViewModal(clickedEntry);
      onClose();
    }
  };

  const selectionCount = selectedEntries.length;
  const selectionLabel = selectionCount > 1 ? ` (${selectionCount} rows)` : '';

  // If title modal is open, render it instead of menu
  if (showTitleModal && clickedEntry) {
    return (
      <TitleFilterModal
        initialTitle={clickedEntry.title || ''}
        entries={entries}
        onClose={handleCloseTitleModal}
      />
    );
  }

  return (
    <div
      ref={menuRef}
      className="vlg-row-context-menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
      }}
    >
      <button
        className="vlg-menu-item"
        onClick={handleCopy}
        disabled={selectionCount === 0}
      >
        <svg className="vlg-menu-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z"/>
        </svg>
        <span>Copy{selectionLabel}</span>
        <span className="vlg-menu-shortcut">Ctrl+C</span>
      </button>

      {/* Copy as... submenu */}
      <div
        className="vlg-menu-item vlg-submenu-trigger"
        onMouseEnter={() => setShowCopySubmenu(true)}
        onMouseLeave={() => setShowCopySubmenu(false)}
      >
        <svg className="vlg-menu-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z"/>
        </svg>
        <span>Copy as...{selectionLabel}</span>
        <svg className="vlg-submenu-arrow" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 12.796V3.204L11.481 8 6 12.796zm.659.753 5.48-4.796a1 1 0 0 0 0-1.506L6.66 2.451C6.011 1.885 5 2.345 5 3.204v9.592a1 1 0 0 0 1.659.753z"/>
        </svg>

        {showCopySubmenu && (
          <div ref={copySubmenuRef} className="vlg-submenu">
            <button
              className="vlg-menu-item"
              onClick={handleCopyWithHeaders}
              disabled={selectionCount === 0}
            >
              <span>With Headers</span>
            </button>
            <button
              className="vlg-menu-item"
              onClick={handleCopyWithDetails}
              disabled={selectionCount === 0 || !entriesHaveDetails}
            >
              <span>With Details</span>
              {!entriesHaveDetails && <span className="vlg-menu-value">(none)</span>}
            </button>
            <button
              className="vlg-menu-item"
              onClick={handleCopyWithHeadersAndDetails}
              disabled={selectionCount === 0}
            >
              <span>With Headers & Details</span>
            </button>
          </div>
        )}
      </div>
      <div className="vlg-menu-divider" />

      {/* Smart highlight action based on clicked column */}
      {clickedEntry && clickedColInfo && clickedColInfo.field !== 'title' && clickedColInfo.value !== undefined && clickedColInfo.value !== '' && (
        <button
          className="vlg-menu-item"
          onClick={handleCreateHighlightFromColumn}
        >
          <svg className="vlg-menu-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5.5A.5.5 0 0 1 6 0h4a.5.5 0 0 1 0 1H6a.5.5 0 0 1-.5-.5zm2.5 2a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H8zm-2 3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H6zm-3 3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H3z"/>
          </svg>
          <span>Highlight {clickedColInfo.label}: {formatColumnValue(clickedColInfo.value, clickedColInfo.field)}</span>
        </button>
      )}

      {/* Highlight by Title... (opens modal) */}
      {clickedEntry && clickedColInfo?.field === 'title' && clickedEntry.title && (
        <button
          className="vlg-menu-item"
          onClick={handleOpenTitleHighlightModal}
        >
          <svg className="vlg-menu-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5.5A.5.5 0 0 1 6 0h4a.5.5 0 0 1 0 1H6a.5.5 0 0 1-.5-.5zm2.5 2a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H8zm-2 3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H6zm-3 3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H3z"/>
          </svg>
          <span>Highlight by Title...</span>
        </button>
      )}

      {/* Highlight Rule from... submenu */}
      {clickedEntry && (
        <div
          className="vlg-menu-item vlg-submenu-trigger"
          onMouseEnter={() => setShowHighlightSubmenu(true)}
          onMouseLeave={() => setShowHighlightSubmenu(false)}
        >
          <svg className="vlg-menu-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5.5A.5.5 0 0 1 6 0h4a.5.5 0 0 1 0 1H6a.5.5 0 0 1-.5-.5zm2.5 2a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H8zm-2 3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H6zm-3 3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H3z"/>
          </svg>
          <span>Highlight Rule from...</span>
          <svg className="vlg-submenu-arrow" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 12.796V3.204L11.481 8 6 12.796zm.659.753 5.48-4.796a1 1 0 0 0 0-1.506L6.66 2.451C6.011 1.885 5 2.345 5 3.204v9.592a1 1 0 0 0 1.659.753z"/>
          </svg>

          {showHighlightSubmenu && (
            <div ref={highlightSubmenuRef} className="vlg-submenu">
              <button
                className="vlg-menu-item"
                onClick={handleCreateHighlightFromSession}
                disabled={!clickedEntry.sessionName}
              >
                <span>Session</span>
                <span className="vlg-menu-value">{clickedEntry.sessionName || '(none)'}</span>
              </button>
              <button
                className="vlg-menu-item"
                onClick={handleCreateHighlightFromApp}
                disabled={!clickedEntry.appName}
              >
                <span>Application</span>
                <span className="vlg-menu-value">{clickedEntry.appName || '(none)'}</span>
              </button>
              <button
                className="vlg-menu-item"
                onClick={handleCreateHighlightFromLevel}
                disabled={clickedEntry.level === undefined}
              >
                <span>Level</span>
                <span className="vlg-menu-value">{getLevelText(clickedEntry.level)}</span>
              </button>
              <button
                className="vlg-menu-item"
                onClick={handleCreateHighlightFromType}
                disabled={clickedEntry.logEntryType === undefined}
              >
                <span>Entry Type</span>
                <span className="vlg-menu-value">{getEntryTypeName(clickedEntry.logEntryType)}</span>
              </button>
              <div className="vlg-menu-divider" />
              <button
                className="vlg-menu-item"
                onClick={handleOpenTitleHighlightModal}
                disabled={!clickedEntry.title}
              >
                <span>Title...</span>
                <span className="vlg-menu-value vlg-menu-value-truncate">{clickedEntry.title ? clickedEntry.title.substring(0, 20) + (clickedEntry.title.length > 20 ? '...' : '') : '(none)'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="vlg-menu-divider" />

      {/* Smart view action based on clicked column */}
      {clickedEntry && clickedColInfo && clickedColInfo.field !== 'title' && clickedColInfo.value !== undefined && clickedColInfo.value !== '' && (
        <button
          className="vlg-menu-item"
          onClick={handleCreateViewFromColumn}
        >
          <svg className="vlg-menu-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
          </svg>
          <span>Create View: {clickedColInfo.label} = {formatColumnValue(clickedColInfo.value, clickedColInfo.field)}</span>
        </button>
      )}

      {/* Create View by Title... (opens modal) */}
      {clickedEntry && clickedColInfo?.field === 'title' && clickedEntry.title && (
        <button
          className="vlg-menu-item"
          onClick={handleOpenTitleViewModal}
        >
          <svg className="vlg-menu-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
          </svg>
          <span>Create View by Title...</span>
        </button>
      )}

      {/* Create View from... submenu */}
      {clickedEntry && (
        <div
          className="vlg-menu-item vlg-submenu-trigger"
          onMouseEnter={() => setShowSubmenu(true)}
          onMouseLeave={() => setShowSubmenu(false)}
        >
          <svg className="vlg-menu-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
          </svg>
          <span>Create View from...</span>
          <svg className="vlg-submenu-arrow" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 12.796V3.204L11.481 8 6 12.796zm.659.753 5.48-4.796a1 1 0 0 0 0-1.506L6.66 2.451C6.011 1.885 5 2.345 5 3.204v9.592a1 1 0 0 0 1.659.753z"/>
          </svg>

          {/* Submenu */}
          {showSubmenu && (
            <div ref={submenuRef} className="vlg-submenu">
              <button
                className="vlg-menu-item"
                onClick={handleCreateViewFromSession}
                disabled={!clickedEntry.sessionName}
              >
                <span>Session</span>
                <span className="vlg-menu-value">{clickedEntry.sessionName || '(none)'}</span>
              </button>
              <button
                className="vlg-menu-item"
                onClick={handleCreateViewFromApp}
                disabled={!clickedEntry.appName}
              >
                <span>Application</span>
                <span className="vlg-menu-value">{clickedEntry.appName || '(none)'}</span>
              </button>
              <button
                className="vlg-menu-item"
                onClick={handleCreateViewFromProcess}
                disabled={clickedEntry.processId === undefined}
              >
                <span>Process</span>
                <span className="vlg-menu-value">{clickedEntry.processId ?? '(none)'}</span>
              </button>
              <button
                className="vlg-menu-item"
                onClick={handleCreateViewFromType}
                disabled={clickedEntry.logEntryType === undefined}
              >
                <span>Entity Type</span>
                <span className="vlg-menu-value">{getEntryTypeName(clickedEntry.logEntryType)}</span>
              </button>
              <div className="vlg-menu-divider" />
              <button
                className="vlg-menu-item"
                onClick={handleOpenTitleViewModal}
                disabled={!clickedEntry.title}
              >
                <span>Title...</span>
                <span className="vlg-menu-value vlg-menu-value-truncate">{clickedEntry.title ? clickedEntry.title.substring(0, 20) + (clickedEntry.title.length > 20 ? '...' : '') : '(none)'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="vlg-menu-divider" />
      <button
        className="vlg-menu-item"
        onClick={handleExportCSV}
      >
        <svg className="vlg-menu-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
          <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
        </svg>
        <span>Export (CSV)</span>
      </button>
    </div>
  );
});

// Export utility functions for use in keyboard shortcuts
export {
  formatEntriesForCopy,
  formatEntriesWithHeaders,
  formatEntriesWithDetails,
  formatEntriesWithHeadersAndDetails,
  formatSelectionForCopy,
  copyToClipboard,
  hasAnyDetails
};
