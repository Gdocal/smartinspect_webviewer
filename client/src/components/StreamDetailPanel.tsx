/**
 * StreamDetailPanel - Shows detailed information about a selected stream entry
 */

import { useMemo } from 'react';
import { StreamEntry, useLogStore } from '../store/logStore';
import { JsonView, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

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

function DataViewer({ data }: { data: string }) {
    // Try to parse as JSON
    const parsed = useMemo(() => {
        const trimmed = data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return JSON.parse(trimmed);
            } catch {
                return null;
            }
        }
        return null;
    }, [data]);

    if (parsed !== null) {
        return (
            <div className="text-xs font-mono bg-slate-900 p-3 rounded overflow-auto json-viewer-wrapper">
                <JsonView
                    data={parsed}
                    style={jsonStyles}
                    shouldExpandNode={(level) => level < 2}
                />
            </div>
        );
    }

    // Default text view
    return (
        <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 p-3 rounded overflow-auto whitespace-pre-wrap">
            {data}
        </pre>
    );
}

interface StreamDetailPanelProps {
    entry: StreamEntry | null;
}

export function StreamDetailPanel({ entry }: StreamDetailPanelProps) {
    const { setShowDetailPanel } = useLogStore();

    if (!entry) {
        return (
            <div className="h-full flex flex-col bg-white dark:bg-slate-800">
                <div className="bg-purple-50/50 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="font-medium text-xs text-purple-600 dark:text-purple-400 flex items-center gap-2 uppercase tracking-wide">
                        <svg className="w-3.5 h-3.5 text-purple-400 dark:text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Stream Details
                    </span>
                    <button
                        onClick={() => setShowDetailPanel(false)}
                        className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                        title="Close detail panel"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <svg className="w-12 h-12 mx-auto mb-3 text-purple-200 dark:text-purple-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Select a stream entry to view details</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800">
            {/* Header */}
            <div className="bg-purple-50/50 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="font-medium text-xs text-purple-600 dark:text-purple-400 flex items-center gap-2 uppercase tracking-wide">
                    <svg className="w-3.5 h-3.5 text-purple-400 dark:text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Stream Details
                    <span className="text-purple-400 dark:text-purple-500 font-normal">#{entry.id}</span>
                </span>
                <button
                    onClick={() => setShowDetailPanel(false)}
                    className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                    title="Close detail panel"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Metadata row */}
            <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 dark:text-slate-500">Channel:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{entry.channel}</span>
                </div>
                {entry.streamType && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 dark:text-slate-500">Type:</span>
                        <span className="font-medium text-purple-600 dark:text-purple-400">{entry.streamType}</span>
                    </div>
                )}
                <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 dark:text-slate-500">Time:</span>
                    <span className="text-slate-600 dark:text-slate-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
            </div>

            {/* Content - Data */}
            <div className="flex-1 overflow-auto p-4">
                <DataViewer data={entry.data} />
            </div>
        </div>
    );
}
