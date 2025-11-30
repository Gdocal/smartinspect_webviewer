/**
 * StatusBar - Enterprise-style connection status and stats
 */

import { useLogStore } from '../store/logStore';
import { RoomSelector } from './RoomSelector';

interface StatusBarProps {
    onServerInfoClick?: () => void;
}

export function StatusBar({ onServerInfoClick }: StatusBarProps) {
    const { connected, connecting, error, paused, reconnectIn, serverUrl, stats, roomSwitching, authRequired, currentUser, theme, toggleTheme } = useLogStore();

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
        <div className="bg-slate-800 text-white px-4 py-1.5 flex items-center text-xs font-medium">
            {/* Left side: Connection status */}
            <div className="flex items-center gap-2 min-w-[100px]">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                <span className="text-slate-300">{statusText}</span>
            </div>

            {paused && (
                <div className="flex items-center gap-1.5 text-amber-400 ml-3">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                    <span>Paused</span>
                </div>
            )}

            {/* Show error only when not reconnecting or switching rooms (to avoid clutter) */}
            {error && reconnectIn === null && !roomSwitching && (
                <span className="text-red-400 flex items-center gap-1 ml-3" title={error}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="max-w-[200px] truncate">{error}</span>
                </span>
            )}

            {/* Center spacer */}
            <div className="flex-1" />

            {/* Right side: Server info, Room, User, Stats - grouped together */}
            <div className="flex items-center gap-4">
                {/* Server info button with URL */}
                {showServerInfo && (
                    <button
                        onClick={onServerInfoClick}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                        title="Server Information"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                        </svg>
                        <span className="text-slate-500">{serverUrl}</span>
                    </button>
                )}

                {/* Separator */}
                {showServerInfo && <span className="text-slate-600">|</span>}

                {/* Room selector */}
                <RoomSelector />

                {/* Separator */}
                <span className="text-slate-600">|</span>

                {/* User display */}
                <div className="flex items-center gap-1.5 text-slate-400" title="Current user">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-slate-300">{currentUser || 'default'}</span>
                </div>

                {/* Separator */}
                <span className="text-slate-600">|</span>

                {/* Stats */}
                <span className="text-slate-400">
                    Buffer: <span className="text-slate-200">{stats.size.toLocaleString()}</span>
                    <span className="text-slate-500"> / {stats.maxEntries.toLocaleString()}</span>
                </span>

                {/* Separator */}
                <span className="text-slate-600">|</span>

                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                    title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                    {theme === 'light' ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                    ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
}
