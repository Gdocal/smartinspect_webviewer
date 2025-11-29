/**
 * StatusBar - Enterprise-style connection status and stats
 */

import { useLogStore } from '../store/logStore';
import { RoomSelector } from './RoomSelector';

interface StatusBarProps {
    onServerInfoClick?: () => void;
}

export function StatusBar({ onServerInfoClick }: StatusBarProps) {
    const { connected, connecting, error, entries, paused, reconnectIn, serverUrl, stats, roomSwitching, authRequired } = useLogStore();

    // Get connection status text and style
    // During room switching, show "Switching room..." to avoid layout shift
    const getConnectionStatus = () => {
        if (roomSwitching) {
            return { text: 'Switching room...', dotClass: 'bg-blue-400 animate-pulse' };
        }
        if (connected) {
            return { text: 'Connected', dotClass: 'bg-emerald-400 shadow-sm shadow-emerald-400/50' };
        }
        if (connecting) {
            return { text: 'Connecting...', dotClass: 'bg-amber-400 animate-pulse' };
        }
        if (authRequired) {
            return { text: 'Auth Required', dotClass: 'bg-red-400' };
        }
        if (reconnectIn !== null && reconnectIn > 0) {
            return { text: `Reconnecting in ${reconnectIn}s`, dotClass: 'bg-amber-400 animate-pulse' };
        }
        return { text: 'Disconnected', dotClass: 'bg-red-400' };
    };

    const { text: statusText, dotClass } = getConnectionStatus();

    // Show server info during room switching to prevent layout shift
    const showServerInfo = (connected || roomSwitching) && serverUrl && onServerInfoClick;

    return (
        <div className="bg-slate-800 text-white px-4 py-1.5 flex items-center gap-4 text-xs font-medium">
            {/* Connection status - fixed width to prevent layout shift */}
            <div className="flex items-center gap-2 min-w-[120px]">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                <span className="text-slate-300">{statusText}</span>
            </div>

            {/* Server info button with URL - keep visible during room switch */}
            {showServerInfo && (
                <button
                    onClick={onServerInfoClick}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                    title="Server Information"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                    <span className="text-slate-500">{serverUrl}</span>
                </button>
            )}

            {/* Room selector - next to server info */}
            <RoomSelector />

            {paused && (
                <div className="flex items-center gap-1.5 text-amber-400">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                    <span>Paused</span>
                </div>
            )}

            {/* Show error only when not reconnecting or switching rooms (to avoid clutter) */}
            {error && reconnectIn === null && !roomSwitching && (
                <span className="text-red-400 flex items-center gap-1" title={error}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="max-w-[200px] truncate">{error}</span>
                </span>
            )}

            <div className="flex-1" />

            {/* Stats */}
            <div className="flex items-center gap-3">
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
