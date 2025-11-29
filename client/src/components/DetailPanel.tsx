/**
 * DetailPanel - Shows detailed information about a selected log entry
 */

import { useMemo } from 'react';
import { useLogStore, LogEntry, LogEntryType, Level, getLevelName } from '../store/logStore';
import { format } from 'date-fns';

// Entry type names
const EntryTypeNames: Record<number, string> = {
    [LogEntryType.Separator]: 'Separator',
    [LogEntryType.EnterMethod]: 'Enter Method',
    [LogEntryType.LeaveMethod]: 'Leave Method',
    [LogEntryType.ResetCallstack]: 'Reset Callstack',
    [LogEntryType.Message]: 'Message',
    [LogEntryType.Warning]: 'Warning',
    [LogEntryType.Error]: 'Error',
    [LogEntryType.InternalError]: 'Internal Error',
    [LogEntryType.Comment]: 'Comment',
    [LogEntryType.VariableValue]: 'Variable',
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
    [LogEntryType.WebContent]: 'Web Content',
    [LogEntryType.System]: 'System',
    [LogEntryType.MemoryStatistic]: 'Memory Stats',
    [LogEntryType.DatabaseResult]: 'Database Result',
    [LogEntryType.DatabaseStructure]: 'Database Structure'
};

function formatTimestamp(date: string): string {
    try {
        return format(new Date(date), 'yyyy-MM-dd HH:mm:ss.SSS');
    } catch {
        return date || '';
    }
}

function decodeData(data: string | undefined, encoding: string | undefined): string {
    if (!data) return '';

    if (encoding === 'base64') {
        try {
            return atob(data);
        } catch {
            return '[Binary data - cannot decode]';
        }
    }

    return data;
}

function DataViewer({ data, encoding, entryType }: { data?: string; encoding?: string; entryType?: number }) {
    const decodedData = useMemo(() => decodeData(data, encoding), [data, encoding]);

    if (!decodedData) {
        return <span className="text-slate-400 italic">No data</span>;
    }

    // Try to parse as JSON for Object type
    if (entryType === LogEntryType.Object) {
        try {
            const parsed = JSON.parse(decodedData);
            return (
                <pre className="text-xs font-mono bg-slate-900 text-green-400 p-3 rounded overflow-auto max-h-64">
                    {JSON.stringify(parsed, null, 2)}
                </pre>
            );
        } catch {
            // Not valid JSON, show as text
        }
    }

    // Source code highlighting
    if (entryType === LogEntryType.Source) {
        return (
            <pre className="text-xs font-mono bg-slate-900 text-blue-300 p-3 rounded overflow-auto max-h-64">
                {decodedData}
            </pre>
        );
    }

    // Binary data
    if (entryType === LogEntryType.Binary || encoding === 'base64') {
        // Show hex dump style
        const bytes = decodedData.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0'));
        const lines = [];
        for (let i = 0; i < bytes.length; i += 16) {
            const hex = bytes.slice(i, i + 16).join(' ');
            const ascii = decodedData.slice(i, i + 16).replace(/[^\x20-\x7E]/g, '.');
            lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(48)}  ${ascii}`);
        }
        return (
            <pre className="text-xs font-mono bg-slate-900 text-slate-300 p-3 rounded overflow-auto max-h-64">
                {lines.slice(0, 20).join('\n')}
                {lines.length > 20 && `\n... (${lines.length - 20} more lines)`}
            </pre>
        );
    }

    // Default text view
    return (
        <pre className="text-xs font-mono bg-slate-50 text-slate-700 p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap">
            {decodedData}
        </pre>
    );
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="flex border-b border-slate-100 py-1.5">
            <span className="w-28 flex-shrink-0 text-xs font-medium text-slate-500">{label}</span>
            <span className={`text-xs text-slate-800 ${mono ? 'font-mono' : ''}`}>{value || '-'}</span>
        </div>
    );
}

export function DetailPanel() {
    const { selectedEntryId, entries, setShowDetailPanel } = useLogStore();

    const selectedEntry = useMemo(() => {
        if (selectedEntryId === null) return null;
        return entries.find(e => e.id === selectedEntryId) || null;
    }, [selectedEntryId, entries]);

    if (!selectedEntry) {
        return (
            <div className="h-full flex flex-col bg-white">
                <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Details
                    </span>
                    <button
                        onClick={() => setShowDetailPanel(false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        title="Close detail panel"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-slate-500 text-sm">Select a log entry to view details</p>
                    </div>
                </div>
            </div>
        );
    }

    const entryTypeName = EntryTypeNames[selectedEntry.logEntryType ?? LogEntryType.Message] || 'Unknown';
    const levelName = getLevelName(selectedEntry.level ?? Level.Message);

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Details
                    <span className="text-xs font-normal text-slate-400">#{selectedEntry.id}</span>
                </span>
                <button
                    onClick={() => setShowDetailPanel(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    title="Close detail panel"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
                {/* Title */}
                <div className="mb-4">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Title</div>
                    <div className="text-sm text-slate-800 font-medium">{selectedEntry.title || '-'}</div>
                </div>

                {/* Metadata grid */}
                <div className="mb-4">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Metadata</div>
                    <div className="bg-slate-50 rounded-lg p-3">
                        <InfoRow label="Timestamp" value={formatTimestamp(selectedEntry.timestamp)} mono />
                        <InfoRow label="Type" value={entryTypeName} />
                        <InfoRow label="Level" value={
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                selectedEntry.level === Level.Error || selectedEntry.level === Level.Fatal
                                    ? 'bg-red-100 text-red-700'
                                    : selectedEntry.level === Level.Warning
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-blue-100 text-blue-700'
                            }`}>
                                {levelName}
                            </span>
                        } />
                        <InfoRow label="Session" value={selectedEntry.sessionName} />
                        <InfoRow label="Application" value={selectedEntry.appName} />
                        <InfoRow label="Hostname" value={selectedEntry.hostName} />
                        <InfoRow label="Process ID" value={selectedEntry.processId} mono />
                        <InfoRow label="Thread ID" value={selectedEntry.threadId} mono />
                    </div>
                </div>

                {/* Data section */}
                {selectedEntry.data && (
                    <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Data</div>
                        <DataViewer
                            data={selectedEntry.data}
                            encoding={selectedEntry.dataEncoding}
                            entryType={selectedEntry.logEntryType}
                        />
                    </div>
                )}

                {/* Context (for EnterMethod/LeaveMethod) */}
                {selectedEntry.context && selectedEntry.context.length > 0 && (
                    <div className="mt-4">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Call Context</div>
                        <div className="bg-slate-50 rounded-lg p-3">
                            {selectedEntry.context.map((ctx, i) => (
                                <div key={i} className="text-xs font-mono text-slate-600" style={{ paddingLeft: `${i * 12}px` }}>
                                    {i > 0 && '└─ '}{ctx}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
