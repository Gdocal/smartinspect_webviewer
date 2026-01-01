/**
 * Panel - Generic panel wrapper with title bar, menu, and content
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { MetricsPanel } from '../../store/metricsStore';
import { TimeSeriesPanel, StatPanel, GaugePanel, BarPanel, TablePanel } from './panels';

interface PanelProps {
    panel: MetricsPanel;
    width: number;
    height: number;
    editMode: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onFullscreen: () => void;
}

export function Panel({
    panel,
    width,
    height,
    editMode,
    onEdit,
    onDelete,
    onDuplicate,
    onFullscreen
}: PanelProps) {
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu on outside click
    useEffect(() => {
        if (!showMenu) return;

        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showMenu]);

    const handleMenuAction = useCallback((action: () => void) => {
        action();
        setShowMenu(false);
    }, []);

    // Calculate content dimensions (subtract header height)
    const headerHeight = 32;
    const contentHeight = height - headerHeight;

    // Render appropriate panel type
    const renderContent = () => {
        const props = { panel, width, height: contentHeight };

        switch (panel.type) {
            case 'timeseries':
                return <TimeSeriesPanel {...props} />;
            case 'stat':
                return <StatPanel {...props} />;
            case 'gauge':
                return <GaugePanel {...props} />;
            case 'bar':
                return <BarPanel {...props} />;
            case 'table':
                return <TablePanel {...props} />;
            default:
                return (
                    <div className="h-full flex items-center justify-center text-slate-400">
                        Unknown panel type
                    </div>
                );
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-900 rounded border border-slate-700/50 overflow-hidden">
            {/* Header - Grafana-style */}
            <div
                className={`flex items-center justify-between px-3 h-8 bg-slate-800/50 border-b border-slate-700/50 flex-shrink-0 ${
                    editMode ? 'cursor-move' : ''
                }`}
            >
                <h3 className="text-sm font-medium text-slate-200 truncate">
                    {panel.title}
                </h3>

                <div className="flex items-center gap-1">
                    {/* Live indicator */}
                    {panel.liveMode && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Live" />
                    )}

                    {/* Menu button */}
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-700"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                        </button>

                        {/* Dropdown menu - dark theme */}
                        {showMenu && (
                            <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 rounded shadow-lg border border-slate-600 py-1 min-w-[140px]">
                                <button
                                    onClick={() => handleMenuAction(onEdit)}
                                    className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleMenuAction(onFullscreen)}
                                    className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                    </svg>
                                    Fullscreen
                                </button>
                                <button
                                    onClick={() => handleMenuAction(onDuplicate)}
                                    className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    Duplicate
                                </button>
                                <div className="my-1 border-t border-slate-600" />
                                <button
                                    onClick={() => handleMenuAction(onDelete)}
                                    className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30 flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Content - double-click for fullscreen */}
            <div
                className="flex-1 overflow-hidden p-1"
                onDoubleClick={onFullscreen}
            >
                {renderContent()}
            </div>
        </div>
    );
}
