/**
 * StreamDetailPanel - Shows detailed information about a selected stream entry
 */

import { StreamEntry, useLogStore } from '../store/logStore';
import { format } from 'date-fns';

function formatTimestamp(date: string): string {
    try {
        return format(new Date(date), 'yyyy-MM-dd HH:mm:ss.SSS');
    } catch {
        return date || '';
    }
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="flex border-b border-slate-100 py-1.5">
            <span className="w-28 flex-shrink-0 text-xs font-medium text-slate-500">{label}</span>
            <span className={`text-xs text-slate-800 ${mono ? 'font-mono' : ''}`}>{value || '-'}</span>
        </div>
    );
}

function DataViewer({ data }: { data: string }) {
    // Try to parse as JSON
    const trimmed = data.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            return (
                <pre className="text-xs font-mono bg-slate-900 text-green-400 p-3 rounded overflow-auto max-h-64">
                    {JSON.stringify(parsed, null, 2)}
                </pre>
            );
        } catch {
            // Not valid JSON
        }
    }

    // Default text view
    return (
        <pre className="text-xs font-mono bg-slate-50 text-slate-700 p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap">
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
            <div className="h-full flex flex-col bg-white">
                <div className="bg-gradient-to-r from-purple-100 to-purple-50 px-4 py-2.5 border-b border-purple-200 flex items-center justify-between">
                    <span className="font-semibold text-sm text-purple-700 flex items-center gap-2">
                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Stream Entry Details
                    </span>
                    <button
                        onClick={() => setShowDetailPanel(false)}
                        className="text-purple-400 hover:text-purple-600 transition-colors"
                        title="Close detail panel"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <svg className="w-12 h-12 mx-auto mb-3 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <p className="text-slate-500 text-sm">Select a stream entry to view details</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-100 to-purple-50 px-4 py-2.5 border-b border-purple-200 flex items-center justify-between">
                <span className="font-semibold text-sm text-purple-700 flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Stream Entry Details
                    <span className="text-xs font-normal text-purple-400">#{entry.id}</span>
                </span>
                <button
                    onClick={() => setShowDetailPanel(false)}
                    className="text-purple-400 hover:text-purple-600 transition-colors"
                    title="Close detail panel"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
                {/* Metadata */}
                <div className="mb-4">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Metadata</div>
                    <div className="bg-purple-50 rounded-lg p-3">
                        <InfoRow label="Channel" value={
                            <span className="inline-flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <span className="font-medium text-purple-700">{entry.channel}</span>
                            </span>
                        } />
                        <InfoRow label="Timestamp" value={formatTimestamp(entry.timestamp)} mono />
                        {entry.sessionName && (
                            <InfoRow label="Session" value={entry.sessionName} />
                        )}
                    </div>
                </div>

                {/* Data section */}
                <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Data</div>
                    <DataViewer data={entry.data} />
                </div>
            </div>
        </div>
    );
}
