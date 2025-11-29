/**
 * FilterBar - Quick filter controls for log entries with playback controls
 * Now placed inside left content area (above grid, not above watches)
 */

import { useLogStore, Level, getLevelName } from '../store/logStore';

const LEVELS = [
    { level: Level.Debug, color: 'bg-slate-400', activeColor: 'bg-slate-500' },
    { level: Level.Verbose, color: 'bg-slate-400', activeColor: 'bg-slate-500' },
    { level: Level.Message, color: 'bg-blue-400', activeColor: 'bg-blue-500' },
    { level: Level.Warning, color: 'bg-amber-400', activeColor: 'bg-amber-500' },
    { level: Level.Error, color: 'bg-red-400', activeColor: 'bg-red-500' },
    { level: Level.Fatal, color: 'bg-red-600', activeColor: 'bg-red-700' }
];

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
        stats
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

    const sessionNames = Object.keys(sessions);

    return (
        <div className="h-[42px] bg-white border-b border-slate-200 px-3 flex items-center gap-4 flex-shrink-0">
            {/* Level filters */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">Level</span>
                <div className="flex rounded overflow-hidden border border-slate-200">
                    {LEVELS.map(({ level, activeColor }) => {
                        const isActive = filter.levels.length === 0 || filter.levels.includes(level);
                        return (
                            <button
                                key={level}
                                onClick={() => toggleLevel(level)}
                                className={`px-2 py-1 text-xs font-medium transition-all border-r last:border-r-0 border-slate-200 ${
                                    isActive
                                        ? `${activeColor} text-white`
                                        : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                                }`}
                            >
                                {getLevelName(level)}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Session filter dropdown */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">Session</span>
                <select
                    value={filter.sessions[0] || ''}
                    onChange={(e) => {
                        setFilter({ sessions: e.target.value ? [e.target.value] : [] });
                    }}
                    className="text-sm border border-slate-200 rounded px-2 py-1 h-[28px] bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[120px]"
                >
                    <option value="">All ({sessionNames.length})</option>
                    {sessionNames.map(session => (
                        <option key={session} value={session}>
                            {session} ({sessions[session]})
                        </option>
                    ))}
                </select>
            </div>

            {/* Text filter */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                    <input
                        type="text"
                        placeholder="Filter entries..."
                        value={filter.messagePattern}
                        onChange={(e) => setFilter({ messagePattern: e.target.value })}
                        className="w-full text-sm border border-slate-200 rounded pl-8 pr-3 py-1 h-[28px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <svg className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={filter.inverseMatch}
                        onChange={(e) => setFilter({ inverseMatch: e.target.checked })}
                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    Exclude
                </label>
            </div>

            <div className="w-px h-5 bg-slate-200" />

            {/* Spacer */}
            <div className="flex-1" />

            {/* Stats */}
            <div className="text-xs text-slate-500 font-medium">
                <span className="text-slate-700">{stats.size.toLocaleString()}</span>
                <span className="mx-1">/</span>
                <span>{stats.maxEntries.toLocaleString()}</span>
            </div>

            {/* Control buttons - matching StreamsView style */}
            <div className="flex items-center gap-1">
                {/* Pause button */}
                <button
                    onClick={() => setPaused(!paused)}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                        paused
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    title={paused ? 'Resume' : 'Pause'}
                >
                    {paused ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                    {paused ? 'Resume' : 'Pause'}
                </button>

                {/* AutoScroll button */}
                <button
                    onClick={() => setAutoScroll(!autoScroll)}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
                        autoScroll
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    Auto-scroll
                </button>

                <div className="w-px h-5 bg-slate-200" />

                {/* Clear button */}
                <button
                    onClick={handleClear}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                    title="Clear all logs"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear
                </button>
            </div>
        </div>
    );
}
