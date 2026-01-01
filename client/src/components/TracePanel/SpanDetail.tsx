/**
 * SpanDetail - Shows detailed information about a selected span
 * Displays span attributes, tags, timing, and associated log entries
 */

import { useMemo } from 'react';
import {
    useTraceStore,
    formatDuration,
    formatTraceTime
} from '../../store/traceStore';
import { useLogStore, LogEntry } from '../../store/logStore';

export function SpanDetail() {
    const { selectedTrace, selectedSpanId, setSelectedSpanId } = useTraceStore();
    const { entries, setSelectedEntryId } = useLogStore();

    // Get the selected span
    const selectedSpan = useMemo(() => {
        if (!selectedTrace || !selectedSpanId) return null;
        return selectedTrace.spans[selectedSpanId] || null;
    }, [selectedTrace, selectedSpanId]);

    // Get log entries for this span
    const spanEntries = useMemo(() => {
        if (!selectedSpan) return [];
        // Find entries that belong to this span
        return entries.filter(e =>
            e.ctx?._spanId === selectedSpanId ||
            selectedSpan.entryIds.includes(e.id)
        );
    }, [selectedSpan, selectedSpanId, entries]);

    if (!selectedSpan) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm p-4">
                <div className="text-center">
                    <svg className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Click a span in the waterfall to see details</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800 overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                    {/* Status indicator */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        selectedSpan.hasError || selectedSpan.status === 'Error'
                            ? 'bg-red-500'
                            : 'bg-green-500'
                    }`} />
                    <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {selectedSpan.name}
                    </h3>
                </div>
                <button
                    onClick={() => setSelectedSpanId(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
                    title="Close"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-3 space-y-4">
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
                <Section title={`Log Entries (${spanEntries.length})`}>
                    {spanEntries.length === 0 ? (
                        <div className="text-xs text-slate-400 italic">
                            No log entries found for this span
                        </div>
                    ) : (
                        <div className="space-y-1 max-h-48 overflow-auto">
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
            <div className="space-y-1">
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
        <div className="flex items-start gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400 flex-shrink-0 w-24">
                {label}
            </span>
            <span className={`${mono ? 'font-mono' : ''} ${valueClass || 'text-slate-800 dark:text-slate-200'} break-all`}>
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
    const levelColors: Record<number, string> = {
        0: 'text-slate-500', // Debug
        1: 'text-slate-600', // Verbose
        2: 'text-slate-700 dark:text-slate-300', // Message
        3: 'text-amber-500', // Warning
        4: 'text-red-500', // Error
        5: 'text-red-600 font-bold' // Fatal
    };

    return (
        <div
            className="p-1.5 rounded bg-slate-50 dark:bg-slate-700/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={onClick}
        >
            <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-mono">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    }) : ''}
                </span>
                <span className={`text-xs ${levelColors[entry.level ?? 2]} truncate`}>
                    {entry.title}
                </span>
            </div>
        </div>
    );
}
