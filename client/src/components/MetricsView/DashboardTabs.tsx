/**
 * DashboardTabs - Tab bar for switching between dashboards within a room
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLogStore } from '../../store/logStore';
import { useMetricsStore } from '../../store/metricsStore';

export function DashboardTabs() {
    const { currentRoom, rowDensity } = useLogStore();
    const {
        getRoomDashboards,
        activeDashboardByRoom,
        setActiveDashboard,
        createDashboard,
        deleteDashboard,
        renameDashboard
    } = useMetricsStore();

    const dashboards = getRoomDashboards(currentRoom);
    const activeId = activeDashboardByRoom[currentRoom];

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when editing starts
    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingId]);

    const handleTabClick = useCallback((id: string) => {
        setActiveDashboard(currentRoom, id);
    }, [currentRoom, setActiveDashboard]);

    const handleDoubleClick = useCallback((id: string, name: string) => {
        setEditingId(id);
        setEditingName(name);
    }, []);

    const handleRename = useCallback(() => {
        if (editingId && editingName.trim()) {
            renameDashboard(currentRoom, editingId, editingName.trim());
        }
        setEditingId(null);
    }, [currentRoom, editingId, editingName, renameDashboard]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRename();
        } else if (e.key === 'Escape') {
            setEditingId(null);
        }
    }, [handleRename]);

    const handleAddDashboard = useCallback(() => {
        const name = `Dashboard ${dashboards.length + 1}`;
        createDashboard(currentRoom, name);
    }, [currentRoom, dashboards.length, createDashboard]);

    const handleDeleteDashboard = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (dashboards.length > 1) {
            deleteDashboard(currentRoom, id);
        }
    }, [currentRoom, dashboards.length, deleteDashboard]);

    // Density-based sizing
    const density = {
        compact: { tabPy: 'py-1', tabPx: 'px-2', text: 'text-xs', gap: 'gap-1', containerPy: 'py-1' },
        default: { tabPy: 'py-1.5', tabPx: 'px-3', text: 'text-sm', gap: 'gap-1.5', containerPy: 'py-1.5' },
        comfortable: { tabPy: 'py-2', tabPx: 'px-4', text: 'text-sm', gap: 'gap-2', containerPy: 'py-2' }
    }[rowDensity];

    if (dashboards.length === 0) {
        return null;
    }

    return (
        <div className={`flex items-center ${density.gap} ${density.containerPy} px-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700`}>
            {dashboards.map(dashboard => {
                const isActive = dashboard.id === activeId;
                const isEditing = dashboard.id === editingId;

                return (
                    <div
                        key={dashboard.id}
                        onClick={() => handleTabClick(dashboard.id)}
                        onDoubleClick={() => handleDoubleClick(dashboard.id, dashboard.name)}
                        className={`group flex items-center ${density.gap} ${density.tabPx} ${density.tabPy} rounded cursor-pointer transition-colors ${
                            isActive
                                ? 'bg-emerald-500 text-white'
                                : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300'
                        }`}
                    >
                        {isEditing ? (
                            <input
                                ref={inputRef}
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={handleRename}
                                onKeyDown={handleKeyDown}
                                className={`${density.text} bg-transparent border-none outline-none w-24`}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <>
                                <span className={`${density.text} font-medium whitespace-nowrap`}>
                                    {dashboard.name}
                                </span>
                                {dashboards.length > 1 && (
                                    <button
                                        onClick={(e) => handleDeleteDashboard(e, dashboard.id)}
                                        className={`opacity-0 group-hover:opacity-100 transition-opacity ${
                                            isActive ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-red-500'
                                        }`}
                                        title="Delete dashboard"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                );
            })}

            {/* Add dashboard button */}
            <button
                onClick={handleAddDashboard}
                className={`flex items-center justify-center ${density.tabPx} ${density.tabPy} rounded text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors`}
                title="Add dashboard"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
            </button>
        </div>
    );
}
