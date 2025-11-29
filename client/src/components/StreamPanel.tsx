/**
 * StreamPanel - Display high-frequency stream data with separate buffer
 */

import { useState, useEffect, useRef } from 'react';
import { useLogStore } from '../store/logStore';
import { format } from 'date-fns';

export function StreamPanel() {
    const { streams, clearStream, clearAllStreams, setShowStreamPanel, streamMaxEntries } = useLogStore();
    const [activeChannel, setActiveChannel] = useState<string | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [filterText, setFilterText] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const channels = Object.keys(streams);
    const activeEntries = activeChannel ? (streams[activeChannel] || []) : [];

    // Auto-scroll to bottom
    useEffect(() => {
        if (autoScroll && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [activeEntries.length, autoScroll]);

    // Auto-select first channel
    useEffect(() => {
        if (!activeChannel && channels.length > 0) {
            setActiveChannel(channels[0]);
        }
    }, [channels, activeChannel]);

    const filteredEntries = filterText
        ? activeEntries.filter(e => e.data.toLowerCase().includes(filterText.toLowerCase()))
        : activeEntries;

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Streams
                    <span className="text-xs font-normal text-slate-400">({channels.length} channels)</span>
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                            autoScroll
                                ? 'bg-green-500 text-white'
                                : 'bg-slate-200 text-slate-600'
                        }`}
                        title="Auto-scroll"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                    </button>
                    <button
                        onClick={() => setShowStreamPanel(false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        title="Close stream panel"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Channel tabs */}
            {channels.length > 0 && (
                <div className="flex border-b border-slate-200 bg-slate-50 px-2 py-1 overflow-x-auto gap-1">
                    {channels.map(channel => (
                        <button
                            key={channel}
                            onClick={() => setActiveChannel(channel)}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1.5 ${
                                activeChannel === channel
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                        >
                            <span>{channel}</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                                activeChannel === channel
                                    ? 'bg-blue-600'
                                    : 'bg-slate-100'
                            }`}>
                                {streams[channel]?.length || 0}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Filter */}
            <div className="px-3 py-2 border-b border-slate-100">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Filter stream data..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Content */}
            {channels.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <p className="text-slate-500 text-sm">No stream data</p>
                        <p className="text-slate-400 text-xs mt-1">
                            Use <code className="bg-slate-100 px-1.5 py-0.5 rounded">log.stream()</code> to send stream data
                        </p>
                    </div>
                </div>
            ) : (
                <div ref={containerRef} className="flex-1 overflow-auto p-3 font-mono text-xs bg-slate-900 text-slate-100">
                    {filteredEntries.map((entry, index) => (
                        <div
                            key={entry.id || index}
                            className="flex gap-3 py-0.5 hover:bg-slate-800 rounded px-2 -mx-2"
                        >
                            <span className="text-slate-500 select-none tabular-nums">
                                {format(new Date(entry.timestamp), 'HH:mm:ss.SSS')}
                            </span>
                            <span className="text-slate-100 whitespace-pre-wrap break-all">{entry.data}</span>
                        </div>
                    ))}
                    {filteredEntries.length === 0 && filterText && (
                        <div className="text-center text-slate-500 py-4">No matches found</div>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="border-t border-slate-200 px-3 py-2 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                    {filteredEntries.length} of {activeEntries.length} entries (max: {streamMaxEntries})
                </span>
                <div className="flex items-center gap-2">
                    {activeChannel && (
                        <button
                            onClick={() => clearStream(activeChannel)}
                            className="text-xs text-slate-500 hover:text-red-500 transition-colors flex items-center gap-1"
                            title="Clear this channel"
                        >
                            Clear Channel
                        </button>
                    )}
                    <button
                        onClick={() => clearAllStreams()}
                        className="text-xs text-slate-500 hover:text-red-500 transition-colors flex items-center gap-1"
                        title="Clear all streams"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Clear All
                    </button>
                </div>
            </div>
        </div>
    );
}
