/**
 * StreamsView - Dedicated view for streams
 * Left: Stream channel list (30%)
 * Right: Entries table for selected stream (70%)
 * Uses shared DetailPanel for entry details
 */

import { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent, ICellRendererParams, RowClickedEvent, GridApi } from 'ag-grid-community';
import { useLogStore, StreamEntry } from '../store/logStore';
import { HighlightRulesPanel } from './HighlightRulesPanel';
import { format } from 'date-fns';

// Format timestamp for display
function formatTime(timestamp: string): string {
    try {
        return format(new Date(timestamp), 'HH:mm:ss.SSS');
    } catch {
        return timestamp;
    }
}

// Content cell renderer - truncate long content
const ContentCellRenderer = memo(function ContentCellRenderer(props: ICellRendererParams<StreamEntry>) {
    const data = props.value as string;
    if (!data) return null;

    // Try to detect JSON and show preview
    const trimmed = data.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            const preview = JSON.stringify(parsed).substring(0, 100);
            return (
                <span className="font-mono text-xs text-slate-600">
                    {preview}{preview.length >= 100 ? '...' : ''}
                </span>
            );
        } catch {
            // Not valid JSON
        }
    }

    return (
        <span className="text-xs text-slate-700">
            {data.length > 100 ? data.substring(0, 100) + '...' : data}
        </span>
    );
});

interface StreamsViewProps {
    onSelectEntry: (entry: StreamEntry | null) => void;
    selectedEntryId: number | null;
}

export function StreamsView({ onSelectEntry, selectedEntryId }: StreamsViewProps) {
    const { streams, clearAllStreams, clearStream } = useLogStore();
    const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
    const [filterText, setFilterText] = useState('');
    const [excludeFilter, setExcludeFilter] = useState(false);
    const [paused, setPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [showHighlightRules, setShowHighlightRules] = useState(false);
    const gridApiRef = useRef<GridApi | null>(null);
    const lastEntryCountRef = useRef(0);

    // Resizable panel width
    const [listWidth, setListWidth] = useState(280);
    const resizingRef = useRef(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const startResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        resizingRef.current = true;
        startXRef.current = e.clientX;
        startWidthRef.current = listWidth;

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingRef.current) return;
            const delta = e.clientX - startXRef.current;
            const newWidth = Math.max(150, Math.min(500, startWidthRef.current + delta));
            setListWidth(newWidth);
        };

        const handleMouseUp = () => {
            resizingRef.current = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }, [listWidth]);

    // Clear selected stream only
    const handleClearSelected = useCallback(() => {
        if (selectedChannel) {
            clearStream(selectedChannel);
        }
    }, [selectedChannel, clearStream]);

    // Clear all streams (for footer button)
    const handleClearAll = useCallback(async () => {
        try {
            await fetch('/api/streams', { method: 'DELETE' });
            clearAllStreams();
            setSelectedChannel(null);
        } catch (err) {
            console.error('Failed to clear streams:', err);
        }
    }, [clearAllStreams]);

    const channels = Object.keys(streams);
    const entries = selectedChannel ? (streams[selectedChannel] || []) : [];

    // Auto-select first channel
    if (!selectedChannel && channels.length > 0) {
        setSelectedChannel(channels[0]);
    }

    // Filter entries
    const filteredEntries = useMemo(() => {
        if (paused) {
            // When paused, don't update the list
            return [];
        }
        if (!filterText) return entries;
        const lower = filterText.toLowerCase();
        const matches = entries.filter(e => e.data.toLowerCase().includes(lower));
        return excludeFilter ? entries.filter(e => !e.data.toLowerCase().includes(lower)) : matches;
    }, [entries, filterText, excludeFilter, paused]);

    // Store paused entries separately
    const [pausedEntries, setPausedEntries] = useState<StreamEntry[]>([]);

    // Update paused entries when pause state changes
    useEffect(() => {
        if (paused) {
            setPausedEntries(filteredEntries);
        }
    }, [paused]);

    const displayedEntries = paused ? pausedEntries : filteredEntries;

    // Auto-scroll to bottom when new entries arrive
    useEffect(() => {
        if (autoScroll && !paused && gridApiRef.current && displayedEntries.length > lastEntryCountRef.current) {
            setTimeout(() => {
                if (gridApiRef.current) {
                    gridApiRef.current.ensureIndexVisible(displayedEntries.length - 1, 'bottom');
                }
            }, 50);
        }
        lastEntryCountRef.current = displayedEntries.length;
    }, [displayedEntries.length, autoScroll, paused]);

    // Column definitions
    const columnDefs = useMemo<ColDef<StreamEntry>[]>(() => [
        {
            headerName: 'Time',
            field: 'timestamp',
            width: 110,
            minWidth: 100,
            valueFormatter: (params) => formatTime(params.value),
            sortable: true,
        },
        {
            headerName: 'Content',
            field: 'data',
            flex: 1,
            minWidth: 200,
            cellRenderer: ContentCellRenderer,
            sortable: false,
        },
    ], []);

    const defaultColDef = useMemo<ColDef>(() => ({
        resizable: true,
        suppressMenu: true,
    }), []);

    const onGridReady = useCallback((params: GridReadyEvent) => {
        gridApiRef.current = params.api;
    }, []);

    const onRowClicked = useCallback((event: RowClickedEvent<StreamEntry>) => {
        if (event.data) {
            onSelectEntry(event.data);
        }
    }, [onSelectEntry]);

    const getRowStyle = useCallback((params: { data?: StreamEntry }) => {
        if (params.data?.id === selectedEntryId) {
            return { backgroundColor: '#dbeafe' };
        }
        return undefined;
    }, [selectedEntryId]);

    const totalCount = channels.reduce((sum, ch) => sum + (streams[ch]?.length || 0), 0);

    return (
        <div className="h-full flex">
            {/* Left: Stream channel list (resizable) */}
            <div
                className="flex flex-col bg-slate-50 flex-shrink-0"
                style={{ width: listWidth }}
            >
                {/* Header - same height as right side toolbar */}
                <div className="h-[42px] px-3 border-b border-slate-200 bg-white flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-700">Streams</span>
                    <span className="text-xs text-slate-400">{channels.length} channels</span>
                </div>

                {/* Channel list */}
                <div className="flex-1 overflow-auto">
                    {channels.length === 0 ? (
                        <div className="p-4 text-center">
                            <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <p className="text-sm text-slate-400">No streams yet</p>
                            <p className="text-xs text-slate-300 mt-1">Use logStream() to send data</p>
                        </div>
                    ) : (
                        channels.map(channel => {
                            const count = streams[channel]?.length || 0;
                            const isSelected = selectedChannel === channel;
                            return (
                                <button
                                    key={channel}
                                    onClick={() => setSelectedChannel(channel)}
                                    className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors ${
                                        isSelected
                                            ? 'bg-purple-500 text-white'
                                            : 'hover:bg-slate-100 text-slate-700'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <svg className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-purple-200' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        <span className="text-sm font-medium truncate">{channel}</span>
                                    </div>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                        isSelected
                                            ? 'bg-purple-600 text-purple-100'
                                            : 'bg-slate-200 text-slate-600'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer stats with Clear All button */}
                <div className="px-3 py-2 border-t border-slate-200 bg-white flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                        Total: {totalCount} entries
                    </span>
                    <button
                        onClick={handleClearAll}
                        className="text-xs text-slate-500 hover:text-red-500 transition-colors flex items-center gap-1"
                        title="Clear all streams"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Clear
                    </button>
                </div>
            </div>

            {/* Resize handle */}
            <div
                className="w-1.5 bg-slate-200 hover:bg-blue-400 cursor-ew-resize flex-shrink-0 flex items-center justify-center group"
                onMouseDown={startResize}
            >
                <div className="h-8 w-0.5 bg-slate-400 group-hover:bg-blue-600 rounded" />
            </div>

            {/* Right: Entries table */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Toolbar - filter, exclude, spacer, pause, autoscroll, clear (right-aligned) */}
                <div className="h-[42px] px-3 border-b border-slate-200 bg-white flex items-center gap-2">
                    {/* Filter input */}
                    <div className="relative max-w-xs">
                        <input
                            type="text"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            placeholder="Filter entries..."
                            className="w-48 text-sm border border-slate-200 rounded pl-8 pr-3 py-1 h-[28px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* Exclude checkbox */}
                    <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer" title="Hide entries matching the filter instead of showing only matches">
                        <input
                            type="checkbox"
                            checked={excludeFilter}
                            onChange={(e) => setExcludeFilter(e.target.checked)}
                            className="rounded border-slate-300 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        Exclude
                    </label>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Control buttons - icon only */}
                    <div className="flex items-center gap-1">
                        {/* Pause button */}
                        <button
                            onClick={() => setPaused(!paused)}
                            className={`p-1.5 rounded transition-colors ${
                                paused
                                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                            title={paused ? 'Resume' : 'Pause'}
                        >
                            {paused ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}
                        </button>

                        {/* AutoScroll button */}
                        <button
                            onClick={() => setAutoScroll(!autoScroll)}
                            className={`p-1.5 rounded transition-colors ${
                                autoScroll
                                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                            title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                        </button>

                        {/* Clear button - clears selected stream only */}
                        <button
                            onClick={handleClearSelected}
                            className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            title={selectedChannel ? `Clear ${selectedChannel} stream` : 'Clear selected stream'}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>

                    {/* Settings button - separated */}
                    <div className="ml-2 pl-2 border-l border-slate-200">
                        <button
                            onClick={() => setShowHighlightRules(true)}
                            className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                            title="Highlight rules"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Entries grid */}
                {selectedChannel ? (
                    <div className="flex-1 ag-theme-balham" style={{ fontSize: '13px' }}>
                        <AgGridReact
                            rowData={displayedEntries}
                            columnDefs={columnDefs}
                            defaultColDef={defaultColDef}
                            getRowId={(params) => String(params.data.id)}
                            getRowStyle={getRowStyle}
                            onGridReady={onGridReady}
                            onRowClicked={onRowClicked}
                            animateRows={false}
                            rowSelection="single"
                            suppressCellFocus={true}
                            rowBuffer={30}
                        />
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                            </svg>
                            <p className="text-slate-400 text-sm">Select a stream channel</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Highlight rules modal */}
            {showHighlightRules && (
                <HighlightRulesPanel onClose={() => setShowHighlightRules(false)} />
            )}
        </div>
    );
}
