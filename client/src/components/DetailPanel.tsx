/**
 * DetailPanel - Shows detailed information about a selected log entry
 */

import { useMemo } from 'react';
import { useLogStore, LogEntryType } from '../store/logStore';

// Get theme from store for conditional styling

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
        return <span className="text-slate-400 dark:text-slate-500 italic">No data</span>;
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
        <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap">
            {decodedData}
        </pre>
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
            <div className="h-full flex flex-col bg-white dark:bg-slate-800">
                <div className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Details
                    </span>
                    <button
                        onClick={() => setShowDetailPanel(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        title="Close detail panel"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <svg className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Select a log entry to view details</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-700 dark:to-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Details
                    <span className="text-xs font-normal text-slate-400">#{selectedEntry.id}</span>
                </span>
                <button
                    onClick={() => setShowDetailPanel(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    title="Close detail panel"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
                {/* Show data if available, otherwise show title */}
                {selectedEntry.data ? (
                    <DataViewer
                        data={selectedEntry.data}
                        encoding={selectedEntry.dataEncoding}
                        entryType={selectedEntry.logEntryType}
                    />
                ) : (
                    <div className="text-sm text-slate-800 dark:text-slate-200">{selectedEntry.title || '-'}</div>
                )}

                {/* Context (for EnterMethod/LeaveMethod) */}
                {selectedEntry.context && selectedEntry.context.length > 0 && (
                    <div className="mt-4">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Call Context</div>
                        <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3">
                            {selectedEntry.context.map((ctx, i) => (
                                <div key={i} className="text-xs font-mono text-slate-600 dark:text-slate-300" style={{ paddingLeft: `${i * 12}px` }}>
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
