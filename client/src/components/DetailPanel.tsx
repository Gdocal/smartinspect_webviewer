/**
 * DetailPanel - Shows detailed information about a selected log entry
 */

import { useMemo, useState, useCallback } from 'react';
import { useLogStore, LogEntryType } from '../store/logStore';
import { JsonView, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

// Density-based sizing configuration - matches FilterBar and WatchPanel
const DENSITY_CONFIG = {
    compact: {
        headerHeight: 'h-[32px]',
        headerPx: 'px-2',
        headerText: 'text-[10px]',
        headerIconSize: 'w-3 h-3',
        toolbarPx: 'px-2',
        toolbarPy: 'py-1',
        buttonPadding: 'p-1',
        iconSize: 'w-3.5 h-3.5',
        buttonGap: 'gap-0.5',
        statsText: 'text-[10px]',
        contentPadding: 'p-2',
    },
    default: {
        headerHeight: 'h-[36px]',
        headerPx: 'px-3',
        headerText: 'text-xs',
        headerIconSize: 'w-3.5 h-3.5',
        toolbarPx: 'px-3',
        toolbarPy: 'py-1.5',
        buttonPadding: 'p-1.5',
        iconSize: 'w-4 h-4',
        buttonGap: 'gap-1',
        statsText: 'text-xs',
        contentPadding: 'p-4',
    },
    comfortable: {
        headerHeight: 'h-[42px]',
        headerPx: 'px-4',
        headerText: 'text-xs',
        headerIconSize: 'w-3.5 h-3.5',
        toolbarPx: 'px-3',
        toolbarPy: 'py-1.5',
        buttonPadding: 'p-1.5',
        iconSize: 'w-4 h-4',
        buttonGap: 'gap-1',
        statsText: 'text-xs',
        contentPadding: 'p-4',
    },
};

// Custom dark theme matching our UI
const jsonStyles = {
    ...darkStyles,
    container: 'json-view-container',
    basicChildStyle: 'json-view-child',
    label: 'json-view-label',
    nullValue: 'json-view-null',
    undefinedValue: 'json-view-undefined',
    stringValue: 'json-view-string',
    booleanValue: 'json-view-boolean',
    numberValue: 'json-view-number',
    otherValue: 'json-view-other',
    punctuation: 'json-view-punctuation',
    expandIcon: 'json-view-expand',
    collapseIcon: 'json-view-collapse',
    collapsedContent: 'json-view-collapsed',
};

function decodeData(data: string | undefined, encoding: string | undefined): string {
    if (!data) return '';

    if (encoding === 'base64') {
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
            // Strip UTF-8 BOM if present (TextDecoder doesn't always strip it)
            if (decoded.charCodeAt(0) === 0xFEFF) {
                decoded = decoded.slice(1);
            }
            return decoded;
        } catch {
            return '[Binary data - cannot decode]';
        }
    }

    return data;
}

function DataViewer({ data, encoding, entryType, wordWrap }: { data?: string; encoding?: string; entryType?: number; wordWrap: boolean }) {
    const decodedData = useMemo(() => decodeData(data, encoding), [data, encoding]);

    if (!decodedData) {
        return <span className="text-slate-400 dark:text-slate-500 italic">No data</span>;
    }

    const wrapClass = wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre';

    // Binary data - hex dump (only for Binary type, not all base64)
    if (entryType === LogEntryType.Binary) {
        // Show hex dump style
        const bytes = decodedData.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0'));
        const lines = [];
        for (let i = 0; i < bytes.length; i += 16) {
            const hex = bytes.slice(i, i + 16).join(' ');
            const ascii = decodedData.slice(i, i + 16).replace(/[^\x20-\x7E]/g, '.');
            lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(48)}  ${ascii}`);
        }
        return (
            <pre className={`text-xs font-mono bg-slate-900 text-slate-300 p-3 rounded ${wrapClass}`}>
                {lines.slice(0, 20).join('\n')}
                {lines.length > 20 && `\n... (${lines.length - 20} more lines)`}
            </pre>
        );
    }

    // Source code highlighting
    if (entryType === LogEntryType.Source) {
        return (
            <pre className={`text-xs font-mono bg-slate-900 text-blue-300 p-3 rounded ${wrapClass}`}>
                {decodedData}
            </pre>
        );
    }

    // Try to parse as JSON for ANY type (not just Object)
    // This handles dictionaries, lists, objects, config data, etc.
    try {
        const parsed = JSON.parse(decodedData);
        // Only use JSON viewer for objects/arrays, not primitive values
        if (typeof parsed === 'object' && parsed !== null) {
            return (
                <div className="text-xs font-mono bg-slate-900 p-3 rounded overflow-auto json-viewer-wrapper">
                    <JsonView
                        data={parsed}
                        style={jsonStyles}
                        shouldExpandNode={() => true}
                    />
                </div>
            );
        }
    } catch {
        // Not valid JSON, continue to text display
    }

    // Default text view
    return (
        <pre className={`text-xs font-mono bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 p-3 rounded ${wrapClass}`}>
            {decodedData}
        </pre>
    );
}

export function DetailPanel() {
    const { selectedEntryId, entries, setShowDetailPanel, rowDensity } = useLogStore();
    const density = DENSITY_CONFIG[rowDensity];
    const [wordWrap, setWordWrap] = useState(true);
    const [copySuccess, setCopySuccess] = useState(false);

    const selectedEntry = useMemo(() => {
        if (selectedEntryId === null) return null;
        return entries.find(e => e.id === selectedEntryId) || null;
    }, [selectedEntryId, entries]);

    // Get the content to display (decoded if needed)
    const displayContent = useMemo(() => {
        if (!selectedEntry) return '';
        if (selectedEntry.data) {
            return decodeData(selectedEntry.data, selectedEntry.dataEncoding);
        }
        return selectedEntry.title || '';
    }, [selectedEntry]);

    // Calculate stats
    const contentStats = useMemo(() => {
        const lines = displayContent.split('\n').length;
        const chars = displayContent.length;
        return { lines, chars };
    }, [displayContent]);

    // Copy to clipboard handler (with fallback for non-secure contexts)
    const handleCopy = useCallback(() => {
        const copyToClipboard = (text: string): boolean => {
            // Try modern API first (requires secure context)
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text);
                return true;
            }
            // Fallback for non-secure contexts
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                return true;
            } catch (err) {
                console.error('Failed to copy:', err);
                return false;
            } finally {
                textArea.remove();
            }
        };

        if (copyToClipboard(displayContent)) {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        }
    }, [displayContent]);

    // Save to file handler
    const handleSave = useCallback(() => {
        const blob = new Blob([displayContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `log-entry-${selectedEntry?.id || 'unknown'}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [displayContent, selectedEntry?.id]);

    if (!selectedEntry) {
        return (
            <div className="h-full flex flex-col bg-white dark:bg-slate-800">
                <div className={`bg-slate-50 dark:bg-slate-800 ${density.headerPx} ${density.headerHeight} border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0`}>
                    <span className={`font-medium ${density.headerText} text-slate-600 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide`}>
                        <svg className={`${density.headerIconSize} text-slate-400 dark:text-slate-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Details
                    </span>
                    <button
                        onClick={() => setShowDetailPanel(false)}
                        className={`text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors ${density.buttonPadding} rounded hover:bg-slate-200 dark:hover:bg-slate-700`}
                        title="Close detail panel"
                    >
                        <svg className={density.headerIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
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
            <div className={`bg-slate-50 dark:bg-slate-800 ${density.headerPx} ${density.headerHeight} border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0`}>
                <span className={`font-medium ${density.headerText} text-slate-600 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide`}>
                    <svg className={`${density.headerIconSize} text-slate-400 dark:text-slate-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Details
                    <span className="text-slate-400 dark:text-slate-500 font-normal">#{selectedEntry.id}</span>
                </span>
                <button
                    onClick={() => setShowDetailPanel(false)}
                    className={`text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors ${density.buttonPadding} rounded hover:bg-slate-200 dark:hover:bg-slate-700`}
                    title="Close detail panel"
                >
                    <svg className={density.headerIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Toolbar */}
            <div className={`bg-slate-100 dark:bg-slate-700/50 ${density.toolbarPx} ${density.toolbarPy} border-b border-slate-200 dark:border-slate-600 flex items-center ${density.buttonGap} flex-shrink-0`}>
                {/* Save button */}
                <button
                    onClick={handleSave}
                    className={`${density.buttonPadding} text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors`}
                    title="Save to file"
                >
                    <svg className={density.iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 3v4a1 1 0 001 1h3" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 14h10M7 18h10M9 3v4h6V3" />
                    </svg>
                </button>

                {/* Word wrap toggle */}
                <button
                    onClick={() => setWordWrap(!wordWrap)}
                    className={`${density.buttonPadding} rounded transition-colors ${
                        wordWrap
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                    title={wordWrap ? 'Word wrap: ON' : 'Word wrap: OFF'}
                >
                    <svg className={density.iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h11m-11 6h7m4-6v6m0 0l-3-3m3 3l3-3" />
                    </svg>
                </button>

                {/* Copy button */}
                <button
                    onClick={handleCopy}
                    className={`${density.buttonPadding} rounded transition-colors ${
                        copySuccess
                            ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                    title={copySuccess ? 'Copied!' : 'Copy to clipboard'}
                >
                    {copySuccess ? (
                        <svg className={density.iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className={density.iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    )}
                </button>

                {/* Separator */}
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-500 mx-1" />

                {/* Stats */}
                <span className={`${density.statsText} text-slate-500 dark:text-slate-400 font-mono`}>
                    {contentStats.lines.toLocaleString()} lines | {contentStats.chars.toLocaleString()} chars
                </span>
            </div>

            {/* Content */}
            <div className={`flex-1 ${density.contentPadding} min-h-0 overflow-y-auto ${wordWrap ? '' : 'overflow-x-auto'}`}>
                {/* Show data if available, otherwise show title */}
                {selectedEntry.data ? (
                    <DataViewer
                        data={selectedEntry.data}
                        encoding={selectedEntry.dataEncoding}
                        entryType={selectedEntry.logEntryType}
                        wordWrap={wordWrap}
                    />
                ) : (
                    <pre className={`text-sm text-slate-800 dark:text-slate-200 font-mono ${wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
                        {selectedEntry.title || '-'}
                    </pre>
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
