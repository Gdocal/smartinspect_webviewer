/**
 * FilterBar - Quick filter controls for log entries with playback controls
 * Enterprise-grade unified toolbar matching StreamsView layout
 */

import { useLogStore } from '../store/logStore';

export function FilterBar() {
    const {
        filter,
        setFilter,
        viewPausedState,
        setViewPaused,
        clearEntries,
        activeViewId,
        setEditingViewId,
        views,
        updateView,
        viewStuckToBottom
    } = useLogStore();

    // Get the active view's autoScroll setting
    const activeView = views.find(v => v.id === activeViewId);
    const autoScroll = activeView?.autoScroll ?? true;

    // Per-view pause state
    const isPaused = activeViewId ? (viewPausedState[activeViewId] ?? false) : false;

    // Get the stuckToBottom state for the active view (for 3-state button)
    const stuckToBottom = activeViewId ? (viewStuckToBottom.get(activeViewId) ?? true) : true;

    const setAutoScroll = (value: boolean) => {
        if (activeViewId) {
            updateView(activeViewId, { autoScroll: value });
        }
    };

    const handleClear = async () => {
        try {
            await fetch('/api/logs', { method: 'DELETE' });
            clearEntries();
        } catch (err) {
            console.error('Failed to clear logs:', err);
        }
    };

    return (
        <div className="h-[42px] bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-3 flex items-center gap-3 flex-shrink-0">
            {/* Filter input */}
            <div className="relative">
                <input
                    type="text"
                    placeholder="Filter entries..."
                    value={filter.messagePattern}
                    onChange={(e) => setFilter({ messagePattern: e.target.value })}
                    className="w-64 text-sm border border-slate-200 dark:border-slate-600 rounded pl-8 pr-3 py-1 h-[28px] bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Control buttons - icon only */}
            <div className="flex items-center gap-1">
                {/* Pause button - per-view pause */}
                <button
                    onClick={() => activeViewId && setViewPaused(activeViewId, !isPaused)}
                    disabled={!activeViewId}
                    className={`p-1.5 rounded transition-colors ${
                        isPaused
                            ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                    title={isPaused ? 'Resume' : 'Pause'}
                >
                    {isPaused ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                </button>

                {/* AutoScroll button - 3 states: disabled (gray), active (blue), paused (amber) */}
                <button
                    onClick={() => setAutoScroll(!autoScroll)}
                    disabled={!activeViewId}
                    className={`p-1.5 rounded transition-colors ${
                        !autoScroll
                            ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                            : stuckToBottom
                                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800'
                                : 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800'
                    }`}
                    title={
                        !autoScroll
                            ? 'Enable auto-scroll'
                            : stuckToBottom
                                ? 'Auto-scroll active (click to disable)'
                                : 'Auto-scroll paused - scroll to bottom to resume (click to disable)'
                    }
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                </button>

                {/* Clear button */}
                <button
                    onClick={handleClear}
                    className="p-1.5 rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                    title="Clear all logs"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>

            {/* Settings button - separated */}
            <div className="ml-2 pl-2 border-l border-slate-200 dark:border-slate-700">
                <button
                    onClick={() => activeViewId && setEditingViewId(activeViewId)}
                    className="p-1.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    title="Edit view settings"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
