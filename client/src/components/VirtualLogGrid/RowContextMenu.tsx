import { memo, useEffect, useRef } from 'react';
import type { LogEntry } from '../../store/logStore';
import type { ColumnConfig } from './types';
import { format } from 'date-fns';

interface RowContextMenuProps {
  position: { x: number; y: number };
  selectedEntries: LogEntry[];
  entries: LogEntry[];
  columns: ColumnConfig[];
  onClose: () => void;
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

// Format entries for text copy (multiple entries supported)
function formatEntriesForCopy(entries: LogEntry[], columns: ColumnConfig[]): string {
  const visibleColumns = columns.filter(col => !col.hidden && col.type !== 'icon');
  return entries.map(entry => {
    const values = visibleColumns.map(col => getCellText(entry, col.field));
    return values.join('\t');
  }).join('\n');
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
  onClose,
}: RowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  const selectionCount = selectedEntries.length;
  const selectionLabel = selectionCount > 1 ? ` (${selectionCount} rows)` : '';

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
      <button
        className="vlg-menu-item"
        onClick={handleCopyWithHeaders}
        disabled={selectionCount === 0}
      >
        <svg className="vlg-menu-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z"/>
        </svg>
        <span>Copy with Headers{selectionLabel}</span>
      </button>
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
export { formatEntriesForCopy, formatEntriesWithHeaders, copyToClipboard };
