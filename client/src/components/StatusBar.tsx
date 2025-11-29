/**
 * StatusBar - Enterprise-style connection status and stats
 */

import { useLogStore } from '../store/logStore';

export function StatusBar() {
    const { connected, connecting, error, stats, entries, paused } = useLogStore();

    return (
        <div className="bg-slate-800 text-white px-4 py-1.5 flex items-center gap-4 text-xs font-medium">
            {/* Connection status */}
            <div className="flex items-center gap-2">
                <span
                    className={`w-2 h-2 rounded-full ${
                        connected ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : connecting ? 'bg-amber-400 animate-pulse' : 'bg-red-400'
                    }`}
                />
                <span className="text-slate-300">
                    {connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}
                </span>
            </div>

            {paused && (
                <div className="flex items-center gap-1.5 text-amber-400">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                    <span>Paused</span>
                </div>
            )}

            {error && (
                <span className="text-red-400 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {error}
                </span>
            )}

            <div className="flex-1" />

            {/* Stats */}
            <div className="flex items-center gap-4">
                <span className="text-slate-400">
                    View: <span className="text-slate-200">{entries.length.toLocaleString()}</span>
                </span>
                <span className="text-slate-400">
                    Buffer: <span className="text-slate-200">{stats.size.toLocaleString()}</span>
                    <span className="text-slate-500"> / {stats.maxEntries.toLocaleString()}</span>
                </span>
            </div>
        </div>
    );
}
