/**
 * FilterBar - Quick filter controls for log entries with playback controls
 * Enterprise-grade unified toolbar matching StreamsView layout
 */

import { useState, useRef, useEffect } from 'react';
import { useLogStore, Level, getLevelName } from '../store/logStore';

const LEVELS = [
    { level: Level.Debug, color: 'bg-slate-400', activeColor: 'bg-slate-500' },
    { level: Level.Verbose, color: 'bg-slate-400', activeColor: 'bg-slate-500' },
    { level: Level.Message, color: 'bg-blue-400', activeColor: 'bg-blue-500' },
    { level: Level.Warning, color: 'bg-amber-400', activeColor: 'bg-amber-500' },
    { level: Level.Error, color: 'bg-red-400', activeColor: 'bg-red-500' },
    { level: Level.Fatal, color: 'bg-red-600', activeColor: 'bg-red-700' }
];

// Multi-select dropdown for sessions
interface SessionMultiSelectProps {
    sessions: Record<string, number>;
    selected: string[];
    onChange: (selected: string[]) => void;
}

function SessionMultiSelect({ sessions, selected, onChange }: SessionMultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const sessionNames = Object.keys(sessions);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredSessions = sessionNames.filter(s =>
        s.toLowerCase().includes(search.toLowerCase())
    );

    const toggleSession = (session: string) => {
        if (selected.includes(session)) {
            onChange(selected.filter(s => s !== session));
        } else {
            onChange([...selected, session]);
        }
    };

    const selectAll = () => onChange([...sessionNames]);
    const clearAll = () => onChange([]);

    // Display text
    const displayText = selected.length === 0
        ? `All (${sessionNames.length})`
        : selected.length === 1
            ? selected[0]
            : `${selected.length} sessions`;

    return (
        <div ref={dropdownRef} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-2 py-1 h-[28px] text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[130px]"
            >
                <span className={`flex-1 text-left truncate ${selected.length === 0 ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                    {displayText}
                </span>
                <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-80 overflow-hidden">
                    {/* Search */}
                    <div className="p-2 border-b border-slate-100 dark:border-slate-700">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search sessions..."
                            className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            autoFocus
                        />
                    </div>

                    {/* Quick actions */}
                    <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-700 flex gap-2 items-center">
                        <button
                            type="button"
                            onClick={selectAll}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                        >
                            Select All
                        </button>
                        <button
                            type="button"
                            onClick={clearAll}
                            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                        >
                            Clear
                        </button>
                        <span className="text-xs text-slate-400 ml-auto">
                            {selected.length} of {sessionNames.length}
                        </span>
                    </div>

                    {/* Session list */}
                    <div className="overflow-auto max-h-48">
                        {filteredSessions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-slate-400">
                                {sessionNames.length === 0 ? 'No sessions available' : 'No matches'}
                            </div>
                        ) : (
                            filteredSessions.map(session => (
                                <label
                                    key={session}
                                    className="flex items-center px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(session)}
                                        onChange={() => toggleSession(session)}
                                        className="rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500 mr-2"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-200 truncate flex-1">{session}</span>
                                    <span className="text-xs text-slate-400 ml-2">{sessions[session]}</span>
                                </label>
                            ))
                        )}
                    </div>

                    {/* Selected tags */}
                    {selected.length > 0 && (
                        <div className="px-2 py-1.5 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-1 max-h-16 overflow-auto">
                            {selected.slice(0, 5).map(s => (
                                <span
                                    key={s}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded"
                                >
                                    {s}
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); toggleSession(s); }}
                                        className="hover:text-blue-900 dark:hover:text-blue-100"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </span>
                            ))}
                            {selected.length > 5 && (
                                <span className="text-xs text-slate-400">+{selected.length - 5} more</span>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function FilterBar() {
    const {
        filter,
        setFilter,
        sessions,
        paused,
        setPaused,
        autoScroll,
        setAutoScroll,
        clearEntries,
        activeViewId,
        setEditingViewId
    } = useLogStore();

    const toggleLevel = (level: number) => {
        const levels = filter.levels.includes(level)
            ? filter.levels.filter(l => l !== level)
            : [...filter.levels, level];
        setFilter({ levels });
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
            {/* Level filters - compact toggle buttons */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Level</span>
                <div className="flex rounded overflow-hidden border border-slate-200 dark:border-slate-600">
                    {LEVELS.map(({ level, activeColor }) => {
                        const isActive = filter.levels.length === 0 || filter.levels.includes(level);
                        return (
                            <button
                                key={level}
                                onClick={() => toggleLevel(level)}
                                className={`px-2 py-1 text-xs font-medium transition-all border-r last:border-r-0 border-slate-200 dark:border-slate-600 ${
                                    isActive
                                        ? `${activeColor} text-white`
                                        : 'bg-slate-50 dark:bg-slate-700 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                                }`}
                            >
                                {getLevelName(level)}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Session multi-select */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Session</span>
                <SessionMultiSelect
                    sessions={sessions}
                    selected={filter.sessions}
                    onChange={(sessions) => setFilter({ sessions })}
                />
            </div>

            {/* Filter input with Exclude grouped together */}
            <div className="flex items-center gap-2">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Filter entries..."
                        value={filter.messagePattern}
                        onChange={(e) => setFilter({ messagePattern: e.target.value })}
                        className="w-48 text-sm border border-slate-200 dark:border-slate-600 rounded pl-8 pr-3 py-1 h-[28px] bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <svg className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer" title="Hide entries matching the filter instead of showing only matches">
                    <input
                        type="checkbox"
                        checked={filter.inverseMatch}
                        onChange={(e) => setFilter({ inverseMatch: e.target.checked })}
                        className="rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    Exclude
                </label>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Control buttons - icon only */}
            <div className="flex items-center gap-1">
                {/* Pause button */}
                <button
                    onClick={() => setPaused(!paused)}
                    className={`p-1.5 rounded transition-colors ${
                        paused
                            ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
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
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                    title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                </button>

                {/* Clear button */}
                <button
                    onClick={handleClear}
                    className="p-1.5 rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                    title="Clear all logs"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
