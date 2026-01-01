/**
 * TraceLogsPanel - Shows logs for the selected span
 * Displays span details and associated log entries
 */

import { useMemo, useEffect, useState } from 'react';
import {
    useTraceStore,
    formatDuration,
    formatTraceTime
} from '../../store/traceStore';
import { useLogStore, LogEntry } from '../../store/logStore';

// Fetch entries for a trace from the API
async function fetchTraceEntries(traceId: string): Promise<LogEntry[]> {
    const room = localStorage.getItem('si-room') || 'default';
    const response = await fetch(`/api/traces/${traceId}/entries?room=${encodeURIComponent(room)}`);
    if (!response.ok) {
        console.error('Failed to fetch trace entries:', response.statusText);
        return [];
    }
    const data = await response.json();
    return data.entries || [];
}

export function TraceLogsPanel() {
    const { selectedTrace, selectedSpanId, setSelectedSpanId, selectedTraceId } = useTraceStore();
    const { setSelectedEntryId } = useLogStore();
    const [traceEntries, setTraceEntries] = useState<LogEntry[]>([]);
    const [loadingEntries, setLoadingEntries] = useState(false);

    // Fetch entries when trace is selected
    useEffect(() => {
        if (!selectedTraceId) {
            setTraceEntries([]);
            return;
        }

        setLoadingEntries(true);
        fetchTraceEntries(selectedTraceId)
            .then(entries => setTraceEntries(entries))
            .finally(() => setLoadingEntries(false));
    }, [selectedTraceId]);

    // Get the selected span
    const selectedSpan = useMemo(() => {
        if (!selectedTrace || !selectedSpanId) return null;
        return selectedTrace.spans[selectedSpanId] || null;
    }, [selectedTrace, selectedSpanId]);

    // Get log entries for this span
    const spanEntries = useMemo(() => {
        if (!selectedSpan) return [];
        // Find entries that belong to this span
        return traceEntries.filter(e =>
            e.ctx?._spanId === selectedSpanId ||
            selectedSpan.entryIds.includes(e.id)
        );
    }, [selectedSpan, selectedSpanId, traceEntries]);

    if (!selectedSpan) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm p-4">
                <div className="text-center">
                    <svg className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Click a span in the waterfall to see logs</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                    {/* Status indicator */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        selectedSpan.hasError || selectedSpan.status === 'Error'
                            ? 'bg-red-500'
                            : 'bg-green-500'
                    }`} />
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {selectedSpan.name}
                    </h3>
                </div>
                <button
                    onClick={() => setSelectedSpanId(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                    title="Close"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 space-y-5">
                {/* Timing section */}
                <Section title="Timing">
                    <InfoRow label="Duration" value={formatDuration(selectedSpan.duration)} />
                    <InfoRow label="Start" value={formatTraceTime(selectedSpan.startTime)} />
                    {selectedSpan.endTime && (
                        <InfoRow label="End" value={formatTraceTime(selectedSpan.endTime)} />
                    )}
                </Section>

                {/* Identity section */}
                <Section title="Identity">
                    <InfoRow label="Span ID" value={selectedSpan.spanId} mono />
                    {selectedSpan.parentSpanId && (
                        <InfoRow label="Parent ID" value={selectedSpan.parentSpanId} mono />
                    )}
                    {selectedSpan.kind && (
                        <InfoRow label="Kind" value={selectedSpan.kind} />
                    )}
                </Section>

                {/* Status section */}
                {(selectedSpan.status || selectedSpan.statusDescription) && (
                    <Section title="Status">
                        {selectedSpan.status && (
                            <InfoRow
                                label="Status"
                                value={selectedSpan.status}
                                valueClass={selectedSpan.status === 'Error' ? 'text-red-500' : 'text-green-500'}
                            />
                        )}
                        {selectedSpan.statusDescription && (
                            <InfoRow label="Description" value={selectedSpan.statusDescription} />
                        )}
                    </Section>
                )}

                {/* Tags section */}
                {selectedSpan.tags && Object.keys(selectedSpan.tags).length > 0 && (
                    <Section title="Tags">
                        {Object.entries(selectedSpan.tags).map(([key, value]) => (
                            <InfoRow key={key} label={key} value={value} />
                        ))}
                    </Section>
                )}

                {/* Log entries section */}
                <Section title={`Logs (${loadingEntries ? '...' : spanEntries.length})`}>
                    {loadingEntries ? (
                        <div className="text-xs text-slate-400 italic py-2 flex items-center gap-2">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Loading entries...
                        </div>
                    ) : spanEntries.length === 0 ? (
                        <div className="text-xs text-slate-400 italic py-2">
                            No log entries found for this span
                        </div>
                    ) : (
                        <div className="space-y-1.5 max-h-96 overflow-auto">
                            {spanEntries.map((entry) => (
                                <LogEntryRow
                                    key={entry.id}
                                    entry={entry}
                                    onClick={() => setSelectedEntryId(entry.id)}
                                />
                            ))}
                        </div>
                    )}
                </Section>
            </div>
        </div>
    );
}

// Section component
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                {title}
            </h4>
            <div className="space-y-1.5">
                {children}
            </div>
        </div>
    );
}

// Info row component
interface InfoRowProps {
    label: string;
    value: string;
    mono?: boolean;
    valueClass?: string;
}

function InfoRow({ label, value, mono, valueClass }: InfoRowProps) {
    return (
        <div className="flex items-start gap-3 text-xs">
            <span className="text-slate-500 dark:text-slate-400 flex-shrink-0 w-20">
                {label}
            </span>
            <span className={`${mono ? 'font-mono text-[11px]' : ''} ${valueClass || 'text-slate-800 dark:text-slate-200'} break-all`}>
                {value}
            </span>
        </div>
    );
}

// Log entry row component
interface LogEntryRowProps {
    entry: LogEntry;
    onClick: () => void;
}

function LogEntryRow({ entry, onClick }: LogEntryRowProps) {
    const levelColors: Record<number, { bg: string; text: string }> = {
        0: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-500' }, // Debug
        1: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600' }, // Verbose
        2: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-slate-700 dark:text-slate-300' }, // Message
        3: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400' }, // Warning
        4: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400' }, // Error
        5: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300 font-semibold' } // Fatal
    };

    const levelStyle = levelColors[entry.level ?? 2] || levelColors[2];

    return (
        <div
            className={`p-2 rounded ${levelStyle.bg} cursor-pointer hover:ring-1 hover:ring-blue-400 transition-all`}
            onClick={onClick}
        >
            <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    }) + '.' + String(new Date(entry.timestamp).getMilliseconds()).padStart(3, '0') : ''}
                </span>
                <span className={`text-xs ${levelStyle.text} truncate`}>
                    {entry.title}
                </span>
            </div>
        </div>
    );
}
