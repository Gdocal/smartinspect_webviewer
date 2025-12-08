/**
 * StatusBar - Enterprise-style connection status and stats
 */

import { useLogStore } from '../store/logStore';
import { RoomSelector } from './RoomSelector';
import { Tooltip } from './Tooltip';
import { useProjectPersistence } from '../hooks/useProjectPersistence';

interface StatusBarProps {
    onServerInfoClick?: () => void;
    onClientsClick?: () => void;
}

export function StatusBar({ onServerInfoClick, onClientsClick }: StatusBarProps) {
    const { connected, connecting, error, paused, reconnectIn, serverUrl, stats, limits, roomSwitching, authRequired, currentUser, theme, toggleTheme, tcpClientCount } = useLogStore();
    const { markDirty } = useProjectPersistence();

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
        <div className="bg-slate-900 text-white px-4 py-1.5 flex items-center text-xs font-medium border-t border-slate-700/50">
            {/* Left side: Connection status */}
            <Tooltip content={serverUrl || ''} position="top">
                <div className="flex items-center gap-2 min-w-[100px] cursor-default">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                    <span className="text-slate-300">{statusText}</span>
                </div>
            </Tooltip>

            {paused && (
                <Tooltip content="Log streaming is paused" position="top">
                    <div className="flex items-center gap-1.5 text-amber-400 ml-3 cursor-default">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                        <span>Paused</span>
                    </div>
                </Tooltip>
            )}

            {/* Show error only when not reconnecting or switching rooms (to avoid clutter) */}
            {error && reconnectIn === null && !roomSwitching && (
                <Tooltip content={error} position="top">
                    <span className="text-red-400 flex items-center gap-1 ml-3 cursor-default">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="max-w-[200px] truncate">{error}</span>
                    </span>
                </Tooltip>
            )}

            {/* Center spacer */}
            <div className="flex-1" />

            {/* Right side: Server info, Room, User, Stats - grouped together */}
            <div className="flex items-center gap-4">
                {/* Server info button */}
                {showServerInfo && (
                    <Tooltip content={serverUrl || ''} position="top">
                        <button
                            onClick={onServerInfoClick}
                            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                            </svg>
                            <span className="text-slate-300">Server</span>
                        </button>
                    </Tooltip>
                )}

                {/* Separator */}
                {showServerInfo && <span className="text-slate-700">|</span>}

                {/* Room selector */}
                <RoomSelector />

                {/* Separator */}
                <span className="text-slate-700">|</span>

                {/* User display */}
                <Tooltip content="Current user" position="top">
                    <div className="flex items-center gap-1.5 text-slate-400 cursor-default">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-slate-300">{currentUser || 'default'}</span>
                    </div>
                </Tooltip>

                {/* Separator */}
                <span className="text-slate-700">|</span>

                {/* TCP Client count (log sources) - clickable to show details */}
                <Tooltip content="Click to view connected log sources" position="top">
                    <button
                        onClick={onClientsClick}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="text-slate-300 font-mono tabular-nums">{tcpClientCount}</span>
                        <span className="text-slate-500">{tcpClientCount === 1 ? 'source' : 'sources'}</span>
                    </button>
                </Tooltip>

                {/* Separator */}
                <span className="text-slate-700">|</span>

                {/* Stats - use tabular-nums and min-width to prevent layout shift when count changes digits */}
                <Tooltip content="Entries loaded in browser / maximum display limit (configurable in Settings)" position="top">
                    <span className="text-slate-400 cursor-default whitespace-nowrap font-mono tabular-nums">
                        Entries: <span className="text-slate-200">{stats.size.toLocaleString()}</span>
                        <span className="text-slate-500"> / {limits.maxBufferEntries.toLocaleString()}</span>
                    </span>
                </Tooltip>

                {/* Separator */}
                <span className="text-slate-700">|</span>

                {/* Theme toggle */}
                <Tooltip content={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} position="top">
                    <button
                        onClick={() => { toggleTheme(); markDirty(); }}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        {theme === 'light' ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        )}
                    </button>
                </Tooltip>
            </div>
        </div>
    );
}
