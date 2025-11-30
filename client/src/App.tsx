/**
 * SmartInspect Web Viewer - Main App
 * Layout: Grid on top, Details below (resizable), Watches on right (collapsible)
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useLayout } from './hooks/useLayout';
import { useLayoutPresets } from './hooks/useLayoutPresets';
import { useViewsSync } from './hooks/useViewsSync';
import { usePWAInstall } from './hooks/usePWAInstall';
import { useLogStore, StreamEntry } from './store/logStore';
import { LogGrid } from './components/LogGrid';
import { FilterBar } from './components/FilterBar';
import { WatchPanel } from './components/WatchPanel';
import { StreamPanel } from './components/StreamPanel';
import { DetailPanel } from './components/DetailPanel';
import { StreamDetailPanel } from './components/StreamDetailPanel';
import { ViewTabs } from './components/ViewTabs';
import { StatusBar } from './components/StatusBar';
import { StreamsView } from './components/StreamsView';
import { ServerInfoModal } from './components/ServerInfoModal';
import { SettingsPanel } from './components/SettingsPanel';
import { LayoutPresetDropdown } from './components/LayoutPresetDropdown';
import { ColumnState } from 'ag-grid-community';

export function App() {
    const {
        layout,
        saveLayout,
        resetLayout,
        exportLayout,
        importLayout,
        getDetailPanelHeightPx,
        getWatchPanelWidthPx,
        updateDetailPanelHeightFromPx,
        updateWatchPanelWidthFromPx
    } = useLayout();

    // Layout presets management
    const {
        activePreset,
        ownPresets,
        sharedPresets,
        loading: presetsLoading,
        loadPreset,
        saveAsNewPreset,
        updateActivePreset,
        deletePreset,
        copyPreset,
        setAsDefault,
        updatePresetMetadata,
        updateColumnState
    } = useLayoutPresets();

    const {
        showDetailPanel,
        showWatchPanel,
        showStreamPanel,
        setShowDetailPanel,
        setShowWatchPanel,
        isStreamsMode,
        selectedStreamEntryId,
        setSelectedStreamEntryId,
        theme
    } = useLogStore();

    // Apply dark class to document element (both html and body for full coverage)
    useEffect(() => {
        console.log('[Theme] Applying theme:', theme);
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark');
            console.log('[Theme] Added dark class. HTML classes:', document.documentElement.className);
        } else {
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark');
            console.log('[Theme] Removed dark class. HTML classes:', document.documentElement.className);
        }
    }, [theme]);

    // Apply theme on initial mount (in case localStorage had a value)
    useEffect(() => {
        const savedTheme = localStorage.getItem('si-theme');
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark');
        }
    }, []);

    // Selected stream entry for detail panel
    const [selectedStreamEntry, setSelectedStreamEntry] = useState<StreamEntry | null>(null);

    const handleStreamEntrySelect = useCallback((entry: StreamEntry | null) => {
        setSelectedStreamEntry(entry);
        setSelectedStreamEntryId(entry?.id || null);
    }, [setSelectedStreamEntryId]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showServerInfo, setShowServerInfo] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // PWA install
    const { canInstall, install, showInstallHint, installInfo, dismissHint } = usePWAInstall();

    // Resizable panel heights/widths - now percentage-based
    const resizingRef = useRef<'detail' | 'watch' | null>(null);
    const startPosRef = useRef(0);
    const startSizeRef = useRef(0);

    // Connect to WebSocket
    useWebSocket();

    // Sync views and highlights with server
    useViewsSync();

    const handleColumnStateChange = useCallback((state: ColumnState[]) => {
        saveLayout({ columnState: state });
        updateColumnState(state);
    }, [saveLayout, updateColumnState]);

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

    // Resize handlers - now update percentage-based sizes
    const startResize = useCallback((type: 'detail' | 'watch', e: React.MouseEvent) => {
        e.preventDefault();
        resizingRef.current = type;
        startPosRef.current = type === 'detail' ? e.clientY : e.clientX;
        startSizeRef.current = type === 'detail' ? getDetailPanelHeightPx() : getWatchPanelWidthPx();

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingRef.current) return;

            if (resizingRef.current === 'detail') {
                const delta = startPosRef.current - e.clientY;
                const newHeight = Math.max(100, Math.min(600, startSizeRef.current + delta));
                updateDetailPanelHeightFromPx(newHeight);
            } else {
                const delta = startPosRef.current - e.clientX;
                const newWidth = Math.max(200, Math.min(600, startSizeRef.current + delta));
                updateWatchPanelWidthFromPx(newWidth);
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
    }, [getDetailPanelHeightPx, getWatchPanelWidthPx, updateDetailPanelHeightFromPx, updateWatchPanelWidthFromPx]);

    return (
        <div className="h-screen flex flex-col bg-gray-100 dark:bg-slate-900">
            {/* Header - Modern enterprise style */}
            <header className="bg-slate-900 text-white px-4 py-2 flex items-center border-b border-slate-700/50">
                {/* Logo and title */}
                <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                        </svg>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <h1 className="text-sm font-semibold tracking-tight text-white">SmartInspect</h1>
                        <span className="text-xs text-slate-500 font-normal">Web Viewer</span>
                    </div>
                </div>

                {/* Layout preset dropdown */}
                <div className="ml-4">
                    <LayoutPresetDropdown
                        activePreset={activePreset}
                        ownPresets={ownPresets}
                        sharedPresets={sharedPresets}
                        loading={presetsLoading}
                        onSelectPreset={loadPreset}
                        onSaveNew={saveAsNewPreset}
                        onCopyPreset={copyPreset}
                        onSetDefault={setAsDefault}
                        onOpenSettings={() => setShowSettings(true)}
                    />
                </div>

                <div className="flex-1" />

                {/* Header actions */}
                <div className="flex items-center gap-0.5">
                    {/* Detail panel toggle */}
                    <button
                        onClick={() => setShowDetailPanel(!showDetailPanel)}
                        className={`p-1.5 rounded transition-all ${
                            showDetailPanel
                                ? 'bg-blue-500/15 text-blue-400'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                        }`}
                        title="Toggle detail panel"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                        </svg>
                    </button>

                    {/* Watch panel toggle */}
                    <button
                        onClick={() => setShowWatchPanel(!showWatchPanel)}
                        className={`p-1.5 rounded transition-all ${
                            showWatchPanel
                                ? 'bg-blue-500/15 text-blue-400'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                        }`}
                        title="Toggle watch panel"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    </button>

                    <div className="w-px h-4 bg-slate-700 mx-1.5" />

                    {/* Install App button - only show when installable */}
                    {canInstall && (
                        <button
                            onClick={install}
                            className="p-1.5 rounded text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 transition-all"
                            title="Install App"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                        </button>
                    )}

                    {/* Settings */}
                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
                        title="Settings"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </div>

                {/* Hidden file input for layout import */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                />
            </header>

            {/* Install hint banner - shown on IP access */}
            {showInstallHint && (
                <div className="bg-blue-600 text-white px-4 py-1.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Install as app: <strong>{installInfo.instructions}</strong></span>
                    </div>
                    <button
                        onClick={dismissHint}
                        className="p-1 hover:bg-blue-500 rounded"
                        title="Dismiss"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* View tabs */}
            <ViewTabs />

            {/* Main content - Horizontal layout with collapsible watch panel on right */}
            <main className="flex-1 flex overflow-hidden">
                {/* Left side: Grid/Streams + Details (stacked vertically) */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Filter bar - only show for logs mode, inside left content area */}
                    {!isStreamsMode && <FilterBar />}

                    {/* Content area - both views mounted, visibility controlled by CSS to prevent remount animations */}
                    <div className="flex-1 min-h-0 overflow-hidden relative">
                        <div className={`absolute inset-0 ${isStreamsMode ? '' : 'invisible'}`}>
                            <StreamsView
                                onSelectEntry={handleStreamEntrySelect}
                                selectedEntryId={selectedStreamEntryId}
                            />
                        </div>
                        <div className={`absolute inset-0 ${isStreamsMode ? 'invisible' : ''}`}>
                            <LogGrid
                                onColumnStateChange={handleColumnStateChange}
                                initialColumnState={layout.columnState}
                            />
                        </div>
                    </div>

                    {/* Stream Panel (if visible, only in logs mode) */}
                    {!isStreamsMode && showStreamPanel && (
                        <div className="h-48 border-t border-slate-300 dark:border-slate-700 flex-shrink-0">
                            <StreamPanel />
                        </div>
                    )}

                    {/* Detail Panel below grid (resizable) */}
                    {showDetailPanel && (
                        <>
                            {/* Resize handle */}
                            <div
                                className="h-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-blue-400 cursor-ns-resize flex-shrink-0 flex items-center justify-center group"
                                onMouseDown={(e) => startResize('detail', e)}
                            >
                                <div className="w-8 h-0.5 bg-slate-400 dark:bg-slate-500 group-hover:bg-blue-600 rounded" />
                            </div>
                            <div
                                className="flex-shrink-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 overflow-hidden"
                                style={{ height: getDetailPanelHeightPx() }}
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
                            className="w-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-blue-400 cursor-ew-resize flex-shrink-0 flex items-center justify-center group"
                            onMouseDown={(e) => startResize('watch', e)}
                        >
                            <div className="h-8 w-0.5 bg-slate-400 dark:bg-slate-500 group-hover:bg-blue-600 rounded" />
                        </div>
                        <div
                            className="flex-shrink-0 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 overflow-hidden"
                            style={{ width: getWatchPanelWidthPx() }}
                        >
                            <WatchPanel />
                        </div>
                    </>
                )}
            </main>

            {/* Status bar */}
            <StatusBar
                onServerInfoClick={() => setShowServerInfo(true)}
            />


            {/* Server info modal */}
            <ServerInfoModal
                isOpen={showServerInfo}
                onClose={() => setShowServerInfo(false)}
            />

            {/* Settings modal */}
            <SettingsPanel
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                onExportLayout={exportLayout}
                onImportLayout={handleImportClick}
                onResetLayout={resetLayout}
                // Preset management props
                activePreset={activePreset}
                ownPresets={ownPresets}
                sharedPresets={sharedPresets}
                presetsLoading={presetsLoading}
                onLoadPreset={loadPreset}
                onSavePreset={updateActivePreset}
                onSaveAsNewPreset={saveAsNewPreset}
                onDeletePreset={deletePreset}
                onRenamePreset={async (id, name) => updatePresetMetadata(id, { name })}
                onSetDefaultPreset={setAsDefault}
                onToggleShared={async (id, isShared) => updatePresetMetadata(id, { isShared })}
                onCopyPreset={copyPreset}
            />
        </div>
    );
}

export default App;
