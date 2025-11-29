/**
 * SmartInspect Web Viewer - Main App
 * Layout: Grid on top, Details below (resizable), Watches on right (collapsible)
 */

import { useRef, useState, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useLayout } from './hooks/useLayout';
import { useLogStore, StreamEntry } from './store/logStore';
import { LogGrid } from './components/LogGrid';
import { FilterBar } from './components/FilterBar';
import { WatchPanel } from './components/WatchPanel';
import { StreamPanel } from './components/StreamPanel';
import { DetailPanel } from './components/DetailPanel';
import { StreamDetailPanel } from './components/StreamDetailPanel';
import { ViewTabs } from './components/ViewTabs';
import { StatusBar } from './components/StatusBar';
import { HighlightRulesPanel } from './components/HighlightRulesPanel';
import { StreamsView } from './components/StreamsView';
import { ServerInfoModal } from './components/ServerInfoModal';
import { SettingsPanel } from './components/SettingsPanel';
import { ColumnState } from 'ag-grid-community';

export function App() {
    const { layout, saveLayout, resetLayout, exportLayout, importLayout } = useLayout();
    const {
        showDetailPanel,
        showWatchPanel,
        showStreamPanel,
        setShowDetailPanel,
        setShowWatchPanel,
        isStreamsMode,
        selectedStreamEntryId,
        setSelectedStreamEntryId
    } = useLogStore();

    // Selected stream entry for detail panel
    const [selectedStreamEntry, setSelectedStreamEntry] = useState<StreamEntry | null>(null);

    const handleStreamEntrySelect = useCallback((entry: StreamEntry | null) => {
        setSelectedStreamEntry(entry);
        setSelectedStreamEntryId(entry?.id || null);
    }, [setSelectedStreamEntryId]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showHighlightRules, setShowHighlightRules] = useState(false);
    const [showServerInfo, setShowServerInfo] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Resizable panel heights/widths
    const [detailHeight, setDetailHeight] = useState(250);
    const [watchWidth, setWatchWidth] = useState(320);
    const resizingRef = useRef<'detail' | 'watch' | null>(null);
    const startPosRef = useRef(0);
    const startSizeRef = useRef(0);

    // Connect to WebSocket
    useWebSocket();

    const handleColumnStateChange = (state: ColumnState[]) => {
        saveLayout({ columnState: state });
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            importLayout(file);
        }
        e.target.value = '';
    };

    // Resize handlers
    const startResize = useCallback((type: 'detail' | 'watch', e: React.MouseEvent) => {
        e.preventDefault();
        resizingRef.current = type;
        startPosRef.current = type === 'detail' ? e.clientY : e.clientX;
        startSizeRef.current = type === 'detail' ? detailHeight : watchWidth;

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingRef.current) return;

            if (resizingRef.current === 'detail') {
                const delta = startPosRef.current - e.clientY;
                const newHeight = Math.max(100, Math.min(600, startSizeRef.current + delta));
                setDetailHeight(newHeight);
            } else {
                const delta = startPosRef.current - e.clientX;
                const newWidth = Math.max(200, Math.min(600, startSizeRef.current + delta));
                setWatchWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            resizingRef.current = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = type === 'detail' ? 'ns-resize' : 'ew-resize';
        document.body.style.userSelect = 'none';
    }, [detailHeight, watchWidth]);

    return (
        <div className="h-screen flex flex-col bg-gray-100">
            {/* Header */}
            <header className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-4 py-2.5 flex items-center gap-4 shadow-md">
                <div className="flex items-center gap-2">
                    <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                    <h1 className="text-lg font-semibold tracking-tight">SmartInspect</h1>
                    <span className="text-xs text-slate-400 font-normal">Web Viewer</span>
                </div>

                <div className="flex-1" />

                {/* Panel toggles */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowDetailPanel(!showDetailPanel)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
                            showDetailPanel
                                ? 'bg-blue-500 text-white hover:bg-blue-600'
                                : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                        }`}
                        title="Toggle detail panel (below grid)"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Details
                    </button>
                    <button
                        onClick={() => setShowWatchPanel(!showWatchPanel)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
                            showWatchPanel
                                ? 'bg-blue-500 text-white hover:bg-blue-600'
                                : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                        }`}
                        title="Toggle watch panel (right side)"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Watches
                    </button>
                </div>

                <div className="w-px h-5 bg-slate-600" />

                {/* Highlight rules */}
                <button
                    onClick={() => setShowHighlightRules(true)}
                    className="px-2.5 py-1.5 text-xs font-medium bg-slate-600 text-slate-200 rounded hover:bg-slate-500 transition-colors flex items-center gap-1.5"
                    title="Configure highlight rules"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    Highlight
                </button>

                {/* Settings */}
                <button
                    onClick={() => setShowSettings(true)}
                    className="px-2.5 py-1.5 text-xs font-medium bg-slate-600 text-slate-200 rounded hover:bg-slate-500 transition-colors flex items-center gap-1.5"
                    title="Settings"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                </button>

                <div className="w-px h-5 bg-slate-600" />

                {/* Layout controls */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={exportLayout}
                        className="px-2.5 py-1.5 text-xs font-medium bg-slate-600 text-slate-200 rounded hover:bg-slate-500 transition-colors"
                        title="Export layout"
                    >
                        Export
                    </button>
                    <button
                        onClick={handleImportClick}
                        className="px-2.5 py-1.5 text-xs font-medium bg-slate-600 text-slate-200 rounded hover:bg-slate-500 transition-colors"
                        title="Import layout"
                    >
                        Import
                    </button>
                    <button
                        onClick={resetLayout}
                        className="px-2.5 py-1.5 text-xs font-medium bg-slate-600 text-slate-200 rounded hover:bg-slate-500 transition-colors"
                        title="Reset layout"
                    >
                        Reset
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>
            </header>

            {/* View tabs */}
            <ViewTabs />

            {/* Main content - Horizontal layout with collapsible watch panel on right */}
            <main className="flex-1 flex overflow-hidden">
                {/* Left side: Grid/Streams + Details (stacked vertically) */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Filter bar - only show for logs mode, inside left content area */}
                    {!isStreamsMode && <FilterBar />}

                    {/* Content area - either StreamsView or LogGrid */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        {isStreamsMode ? (
                            <StreamsView
                                onSelectEntry={handleStreamEntrySelect}
                                selectedEntryId={selectedStreamEntryId}
                            />
                        ) : (
                            <LogGrid
                                onColumnStateChange={handleColumnStateChange}
                                initialColumnState={layout.columnState}
                            />
                        )}
                    </div>

                    {/* Stream Panel (if visible, only in logs mode) */}
                    {!isStreamsMode && showStreamPanel && (
                        <div className="h-48 border-t border-slate-300 flex-shrink-0">
                            <StreamPanel />
                        </div>
                    )}

                    {/* Detail Panel below grid (resizable) */}
                    {showDetailPanel && (
                        <>
                            {/* Resize handle */}
                            <div
                                className="h-1.5 bg-slate-200 hover:bg-blue-400 cursor-ns-resize flex-shrink-0 flex items-center justify-center group"
                                onMouseDown={(e) => startResize('detail', e)}
                            >
                                <div className="w-8 h-0.5 bg-slate-400 group-hover:bg-blue-600 rounded" />
                            </div>
                            <div
                                className="flex-shrink-0 bg-white border-t border-slate-200 overflow-hidden"
                                style={{ height: detailHeight }}
                            >
                                {isStreamsMode ? (
                                    <StreamDetailPanel entry={selectedStreamEntry} />
                                ) : (
                                    <DetailPanel />
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Right side: Watch Panel (collapsible, full height, always available) */}
                {showWatchPanel && (
                    <>
                        {/* Resize handle */}
                        <div
                            className="w-1.5 bg-slate-200 hover:bg-blue-400 cursor-ew-resize flex-shrink-0 flex items-center justify-center group"
                            onMouseDown={(e) => startResize('watch', e)}
                        >
                            <div className="h-8 w-0.5 bg-slate-400 group-hover:bg-blue-600 rounded" />
                        </div>
                        <div
                            className="flex-shrink-0 bg-white border-l border-slate-200 overflow-hidden"
                            style={{ width: watchWidth }}
                        >
                            <WatchPanel />
                        </div>
                    </>
                )}
            </main>

            {/* Status bar */}
            <StatusBar onServerInfoClick={() => setShowServerInfo(true)} />

            {/* Highlight rules modal */}
            {showHighlightRules && (
                <HighlightRulesPanel onClose={() => setShowHighlightRules(false)} />
            )}

            {/* Server info modal */}
            <ServerInfoModal
                isOpen={showServerInfo}
                onClose={() => setShowServerInfo(false)}
            />

            {/* Settings modal */}
            <SettingsPanel
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
            />
        </div>
    );
}

export default App;
