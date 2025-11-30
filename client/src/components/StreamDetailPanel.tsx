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
                <div className="bg-gradient-to-r from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-800/30 px-4 py-2.5 border-b border-purple-200 dark:border-purple-700 flex items-center justify-between">
                    <span className="font-semibold text-sm text-purple-700 dark:text-purple-300 flex items-center gap-2">
                        <svg className="w-4 h-4 text-purple-500 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Stream Entry Details
                    </span>
                    <button
                        onClick={() => setShowDetailPanel(false)}
                        className="text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors"
                        title="Close detail panel"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <svg className="w-12 h-12 mx-auto mb-3 text-purple-200 dark:text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div className="bg-gradient-to-r from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-800/30 px-4 py-2.5 border-b border-purple-200 dark:border-purple-700 flex items-center justify-between">
                <span className="font-semibold text-sm text-purple-700 dark:text-purple-300 flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-500 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Stream Entry Details
                    <span className="text-xs font-normal text-purple-400">#{entry.id}</span>
                </span>
                <button
                    onClick={() => setShowDetailPanel(false)}
                    className="text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors"
                    title="Close detail panel"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content - Data only, no metadata */}
            <div className="flex-1 overflow-auto p-4">
                <DataViewer data={entry.data} />
            </div>
        </div>
    );
}
