/**
 * MetricsView - Main container for metrics dashboards
 * Provides Grafana-like visualization of watch data with configurable panels
 */

import { useState, useCallback, useEffect } from 'react';
import { useLogStore } from '../../store/logStore';
import { useMetricsStore, createDefaultPanel, PanelType } from '../../store/metricsStore';
import { DashboardTabs } from './DashboardTabs';
import { DashboardToolbar } from './DashboardToolbar';
import { PanelGrid } from './PanelGrid';
import { PanelSettingsDrawer } from './PanelSettingsDrawer';
import { Panel } from './Panel';
import { GridTest } from './GridTest';

export function MetricsView() {
    const { currentRoom, watches } = useLogStore();
    const {
        getRoomDashboards,
        getActiveDashboard,
        createDashboard,
        addPanel,
        fullscreenPanelId,
        setFullscreenPanel
    } = useMetricsStore();

    const dashboards = getRoomDashboards(currentRoom);
    const activeDashboard = getActiveDashboard(currentRoom);
    const [showPanelPicker, setShowPanelPicker] = useState(false);
    const [settingsPanelId, setSettingsPanelId] = useState<string | null>(null);
    const [showGridTest, setShowGridTest] = useState(false);

    // Get fullscreen panel
    const fullscreenPanelData = fullscreenPanelId
        ? activeDashboard?.panels.find(p => p.id === fullscreenPanelId) || null
        : null;

    // Create first dashboard if none exist
    const handleCreateFirstDashboard = useCallback(() => {
        createDashboard(currentRoom, 'Dashboard 1');
    }, [currentRoom, createDashboard]);

    // Add panel to current dashboard
    const handleAddPanel = useCallback((type: PanelType) => {
        if (!activeDashboard) return;
        const panel = createDefaultPanel(type);
        addPanel(currentRoom, activeDashboard.id, panel);
        setShowPanelPicker(false);
    }, [currentRoom, activeDashboard, addPanel]);

    // Check if we have watches
    const hasWatches = Object.keys(watches).length > 0;

    // Keyboard shortcuts for fullscreen and grid test
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+Shift+G to toggle grid test
            if (e.ctrlKey && e.shiftKey && e.key === 'G') {
                e.preventDefault();
                setShowGridTest(prev => !prev);
                return;
            }
            // Escape to exit fullscreen
            if (e.key === 'Escape' && fullscreenPanelId) {
                setFullscreenPanel(null);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [fullscreenPanelId, setFullscreenPanel]);

    // Show grid test page (for debugging react-grid-layout)
    if (showGridTest) {
        return (
            <div className="h-full relative">
                <button
                    onClick={() => setShowGridTest(false)}
                    className="absolute top-4 right-4 z-50 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                    Exit Test (Ctrl+Shift+G)
                </button>
                <GridTest />
            </div>
        );
    }

    // Empty state: No dashboards
    if (dashboards.length === 0) {
        return (
            <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center p-8">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                            <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                            No dashboards yet
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
                            Create your first dashboard to visualize watch metrics with charts, gauges, and more.
                        </p>
                        <button
                            onClick={handleCreateFirstDashboard}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Create Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Empty state: No watches available
    if (!hasWatches) {
        return (
            <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
                <DashboardTabs />
                <DashboardToolbar onAddPanel={() => setShowPanelPicker(true)} />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center p-8">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                            No watch data available
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                            Watches will appear here when your application sends watch values.
                            Add panels after watch data is received.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Empty dashboard: No panels
    if (activeDashboard && activeDashboard.panels.length === 0) {
        return (
            <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
                <DashboardTabs />
                <DashboardToolbar onAddPanel={() => setShowPanelPicker(true)} />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center p-8">
                        <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-12 max-w-lg">
                            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-4">
                                Add your first panel
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                                Choose a visualization type:
                            </p>
                            <div className="grid grid-cols-3 gap-3">
                                <PanelTypeButton
                                    type="timeseries"
                                    icon={<TimeSeriesIcon />}
                                    label="Time Series"
                                    onClick={() => handleAddPanel('timeseries')}
                                />
                                <PanelTypeButton
                                    type="stat"
                                    icon={<StatIcon />}
                                    label="Stat"
                                    onClick={() => handleAddPanel('stat')}
                                />
                                <PanelTypeButton
                                    type="gauge"
                                    icon={<GaugeIcon />}
                                    label="Gauge"
                                    onClick={() => handleAddPanel('gauge')}
                                />
                                <PanelTypeButton
                                    type="bar"
                                    icon={<BarIcon />}
                                    label="Bar"
                                    onClick={() => handleAddPanel('bar')}
                                />
                                <PanelTypeButton
                                    type="table"
                                    icon={<TableIcon />}
                                    label="Table"
                                    onClick={() => handleAddPanel('table')}
                                />
                                <PanelTypeButton
                                    type="statetimeline"
                                    icon={<StateTimelineIcon />}
                                    label="State Timeline"
                                    onClick={() => handleAddPanel('statetimeline')}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Normal view with panels
    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
            <DashboardTabs />
            <DashboardToolbar onAddPanel={() => setShowPanelPicker(true)} />

            {/* Panel grid with react-grid-layout */}
            <div className="flex-1 overflow-hidden">
                <PanelGrid
                    dashboard={activeDashboard!}
                    onOpenSettings={setSettingsPanelId}
                />
            </div>

            {/* Panel settings drawer */}
            <PanelSettingsDrawer
                panelId={settingsPanelId}
                dashboardId={activeDashboard?.id || ''}
                onClose={() => setSettingsPanelId(null)}
            />

            {/* Fullscreen panel modal */}
            {fullscreenPanelData && (
                <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
                        <h2 className="text-lg font-medium text-white">
                            {fullscreenPanelData.title}
                        </h2>
                        <button
                            onClick={() => setFullscreenPanel(null)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="flex-1 p-4">
                        <div className="h-full bg-slate-800 rounded-lg">
                            <Panel
                                panel={fullscreenPanelData}
                                width={window.innerWidth - 32}
                                height={window.innerHeight - 100}
                                editMode={false}
                                onEdit={() => {}}
                                onDelete={() => {}}
                                onDuplicate={() => {}}
                                onFullscreen={() => setFullscreenPanel(null)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Panel picker modal */}
            {showPanelPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">
                                Add Panel
                            </h3>
                            <button
                                onClick={() => setShowPanelPicker(false)}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                            >
                                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <PanelTypeButton
                                type="timeseries"
                                icon={<TimeSeriesIcon />}
                                label="Time Series"
                                onClick={() => handleAddPanel('timeseries')}
                                large
                            />
                            <PanelTypeButton
                                type="stat"
                                icon={<StatIcon />}
                                label="Stat"
                                onClick={() => handleAddPanel('stat')}
                                large
                            />
                            <PanelTypeButton
                                type="gauge"
                                icon={<GaugeIcon />}
                                label="Gauge"
                                onClick={() => handleAddPanel('gauge')}
                                large
                            />
                            <PanelTypeButton
                                type="bar"
                                icon={<BarIcon />}
                                label="Bar"
                                onClick={() => handleAddPanel('bar')}
                                large
                            />
                            <PanelTypeButton
                                type="table"
                                icon={<TableIcon />}
                                label="Table"
                                onClick={() => handleAddPanel('table')}
                                large
                            />
                            <PanelTypeButton
                                type="statetimeline"
                                icon={<StateTimelineIcon />}
                                label="State Timeline"
                                onClick={() => handleAddPanel('statetimeline')}
                                large
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Panel type button component
interface PanelTypeButtonProps {
    type: PanelType;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    large?: boolean;
}

function PanelTypeButton({ icon, label, onClick, large }: PanelTypeButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors ${
                large ? 'p-4' : ''
            }`}
        >
            <div className={`text-slate-500 dark:text-slate-400 ${large ? 'w-8 h-8' : 'w-6 h-6'}`}>
                {icon}
            </div>
            <span className={`text-slate-600 dark:text-slate-300 ${large ? 'text-sm' : 'text-xs'}`}>
                {label}
            </span>
        </button>
    );
}

// Icons
function TimeSeriesIcon() {
    return (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3v18h18" />
        </svg>
    );
}

function StatIcon() {
    return (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
    );
}

function GaugeIcon() {
    return (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}

function BarIcon() {
    return (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2" />
        </svg>
    );
}

function TableIcon() {
    return (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
    );
}

function StateTimelineIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" className="w-full h-full">
            {/* Three horizontal bars representing state timeline rows */}
            <rect x="3" y="5" width="6" height="3" rx="1" fill="currentColor" opacity="0.8" />
            <rect x="9" y="5" width="4" height="3" rx="1" fill="currentColor" opacity="0.4" />
            <rect x="13" y="5" width="8" height="3" rx="1" fill="currentColor" opacity="0.6" />

            <rect x="3" y="10" width="8" height="3" rx="1" fill="currentColor" opacity="0.6" />
            <rect x="11" y="10" width="3" height="3" rx="1" fill="currentColor" opacity="0.8" />
            <rect x="14" y="10" width="7" height="3" rx="1" fill="currentColor" opacity="0.4" />

            <rect x="3" y="15" width="4" height="3" rx="1" fill="currentColor" opacity="0.4" />
            <rect x="7" y="15" width="10" height="3" rx="1" fill="currentColor" opacity="0.8" />
            <rect x="17" y="15" width="4" height="3" rx="1" fill="currentColor" opacity="0.6" />
        </svg>
    );
}
