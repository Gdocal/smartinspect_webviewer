/**
 * DashboardToolbar - Toolbar with time range, live toggle, edit mode, and add panel
 */

import { useState, useCallback, useRef } from 'react';
import { useLogStore } from '../../store/logStore';
import { useMetricsStore, TimeRange } from '../../store/metricsStore';

interface DashboardToolbarProps {
    onAddPanel: () => void;
}

const TIME_PRESETS: { label: string; value: TimeRange['relative'] }[] = [
    { label: 'Last 5m', value: 'last5m' },
    { label: 'Last 15m', value: 'last15m' },
    { label: 'Last 30m', value: 'last30m' },
    { label: 'Last 1h', value: 'last1h' },
    { label: 'Last 3h', value: 'last3h' },
];

export function DashboardToolbar({ onAddPanel }: DashboardToolbarProps) {
    const { currentRoom, rowDensity } = useLogStore();
    const { getActiveDashboard, editMode, setEditMode, updatePanel, exportDashboard, importDashboard } = useMetricsStore();

    const activeDashboard = getActiveDashboard(currentRoom);
    const [showTimeDropdown, setShowTimeDropdown] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [globalTimeRange, setGlobalTimeRange] = useState<TimeRange['relative']>('last5m');
    const [liveMode, setLiveMode] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Export dashboard as JSON download
    const handleExport = useCallback(() => {
        if (!activeDashboard) return;

        const json = exportDashboard(currentRoom, activeDashboard.id);
        if (!json) return;

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeDashboard.name.replace(/[^a-z0-9]/gi, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setShowMoreMenu(false);
    }, [currentRoom, activeDashboard, exportDashboard]);

    // Import dashboard from JSON file
    const handleImport = useCallback(() => {
        fileInputRef.current?.click();
        setShowMoreMenu(false);
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const json = event.target?.result as string;
            const id = importDashboard(currentRoom, json);
            if (id) {
                console.log('Dashboard imported:', id);
            } else {
                alert('Failed to import dashboard. Check console for details.');
            }
        };
        reader.readAsText(file);

        // Reset input
        e.target.value = '';
    }, [currentRoom, importDashboard]);

    // Apply time range to all panels
    const handleTimeRangeChange = useCallback((relative: TimeRange['relative']) => {
        setGlobalTimeRange(relative);
        setShowTimeDropdown(false);

        // Update all panels with new time range
        if (activeDashboard) {
            activeDashboard.panels.forEach(panel => {
                updatePanel(currentRoom, activeDashboard.id, panel.id, {
                    timeRange: { mode: 'relative', relative }
                });
            });
        }
    }, [currentRoom, activeDashboard, updatePanel]);

    const handleLiveToggle = useCallback(() => {
        const newLiveMode = !liveMode;
        setLiveMode(newLiveMode);

        // Update all panels with new live mode
        if (activeDashboard) {
            activeDashboard.panels.forEach(panel => {
                updatePanel(currentRoom, activeDashboard.id, panel.id, {
                    liveMode: newLiveMode
                });
            });
        }
    }, [currentRoom, activeDashboard, liveMode, updatePanel]);

    // Density-based sizing
    const density = {
        compact: { py: 'py-1', px: 'px-2', text: 'text-xs', gap: 'gap-2', iconSize: 'w-3.5 h-3.5' },
        default: { py: 'py-1.5', px: 'px-3', text: 'text-sm', gap: 'gap-3', iconSize: 'w-4 h-4' },
        comfortable: { py: 'py-2', px: 'px-4', text: 'text-sm', gap: 'gap-4', iconSize: 'w-5 h-5' }
    }[rowDensity];

    const currentPreset = TIME_PRESETS.find(p => p.value === globalTimeRange);

    return (
        <div className={`flex items-center justify-between ${density.py} px-3 bg-slate-800 border-b border-slate-700`}>
            <div className={`flex items-center ${density.gap}`}>
                {/* Time range selector */}
                <div className="relative">
                    <button
                        onClick={() => setShowTimeDropdown(!showTimeDropdown)}
                        className={`flex items-center gap-1.5 ${density.px} ${density.py} rounded bg-slate-700 border border-slate-600 hover:border-slate-500 transition-colors`}
                    >
                        <svg className={`${density.iconSize} text-slate-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className={`${density.text} text-slate-300`}>
                            {currentPreset?.label || 'Select time'}
                        </span>
                        <svg className={`${density.iconSize} text-slate-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {showTimeDropdown && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowTimeDropdown(false)}
                            />
                            <div className="absolute left-0 top-full mt-1 z-50 bg-slate-800 rounded shadow-lg border border-slate-600 py-1 min-w-[120px]">
                                {TIME_PRESETS.map(preset => (
                                    <button
                                        key={preset.value}
                                        onClick={() => handleTimeRangeChange(preset.value)}
                                        className={`w-full text-left ${density.px} ${density.py} ${density.text} hover:bg-slate-700 transition-colors ${
                                            globalTimeRange === preset.value
                                                ? 'text-emerald-400 bg-emerald-900/20'
                                                : 'text-slate-300'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Live toggle */}
                <button
                    onClick={handleLiveToggle}
                    className={`flex items-center gap-1.5 ${density.px} ${density.py} rounded transition-colors ${
                        liveMode
                            ? 'bg-red-500 text-white'
                            : 'bg-slate-700 border border-slate-600 text-slate-300 hover:border-slate-500'
                    }`}
                    title={liveMode ? 'Pause live updates' : 'Enable live updates'}
                >
                    <div className={`${density.iconSize} flex items-center justify-center`}>
                        {liveMode ? (
                            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        ) : (
                            <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            </svg>
                        )}
                    </div>
                    <span className={density.text}>
                        {liveMode ? 'Live' : 'Paused'}
                    </span>
                </button>
            </div>

            <div className={`flex items-center ${density.gap}`}>
                {/* More menu (export/import) */}
                <div className="relative">
                    <button
                        onClick={() => setShowMoreMenu(!showMoreMenu)}
                        className={`flex items-center gap-1.5 ${density.px} ${density.py} rounded bg-slate-700 border border-slate-600 hover:border-slate-500 transition-colors`}
                        title="More options"
                    >
                        <svg className={density.iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                    </button>

                    {showMoreMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowMoreMenu(false)}
                            />
                            <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 rounded shadow-lg border border-slate-600 py-1 min-w-[140px]">
                                <button
                                    onClick={handleExport}
                                    className={`w-full text-left ${density.px} ${density.py} ${density.text} text-slate-300 hover:bg-slate-700 flex items-center gap-2`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Export JSON
                                </button>
                                <button
                                    onClick={handleImport}
                                    className={`w-full text-left ${density.px} ${density.py} ${density.text} text-slate-300 hover:bg-slate-700 flex items-center gap-2`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    Import JSON
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Hidden file input for import */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                />

                {/* Edit mode toggle */}
                <button
                    onClick={() => setEditMode(!editMode)}
                    className={`flex items-center gap-1.5 ${density.px} ${density.py} rounded transition-colors ${
                        editMode
                            ? 'bg-blue-500 text-white'
                            : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                    }`}
                    title={editMode ? 'Exit edit mode' : 'Enter edit mode'}
                >
                    <svg className={density.iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className={density.text}>Edit</span>
                </button>

                {/* Add panel button */}
                <button
                    onClick={onAddPanel}
                    className={`flex items-center gap-1.5 ${density.px} ${density.py} rounded bg-emerald-500 hover:bg-emerald-600 text-white transition-colors`}
                >
                    <svg className={density.iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className={density.text}>Add Panel</span>
                </button>
            </div>
        </div>
    );
}
