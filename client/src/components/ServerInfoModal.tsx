/**
 * ServerInfoModal - Displays server stats and provides controls
 */

import { useState, useEffect, useCallback } from 'react';
import { getEffectiveServerUrl } from '../hooks/useSettings';
import { useLogStore } from '../store/logStore';

interface ServerStats {
    memory: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
        external: number;
    };
    cpu: {
        user: number;
        system: number;
        percent: number;
    };
    uptime: number;
    rooms: {
        totalLogs: number;
        maxEntriesPerRoom: number;
        roomCount: number;
    };
    connections: {
        viewers: number;
        clients: number;
    };
    performance?: {
        entriesPerSec: number;
        watchesPerSec: number;
        entriesBroadcastPerSec: number;
        watchesBroadcastPerSec: number;
        totalEntriesReceived: number;
        totalWatchesReceived: number;
    };
}

interface ConnectionInfo {
    tcpPort: number;
    httpPort: number;
    hostname: string;
    connections: {
        interface: string;
        address: string;
        family: string;
        port: number;
        connectionString: string;
    }[];
}

interface RoomDetail {
    id: string;
    logStats: { size: number; maxEntries: number };
    watchCount: number;
    streamStats: { channelCount: number; totalEntries: number };
    clientCount: number;
    viewerCount: number;
    lastActivity: string | null;
}

interface RoomsInfo {
    rooms: string[];
    details: RoomDetail[];
    lastActivity: Record<string, string>;
}

interface ServerInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
        return `${hours}h ${mins}m ${secs}s`;
    }
    if (mins > 0) {
        return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
}

function formatNumber(num: number): string {
    return num.toLocaleString();
}

function formatThroughput(bytesPerSec: number): string {
    if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

const BUFFER_SIZE_OPTIONS = [
    { value: 10000, label: '10K' },
    { value: 50000, label: '50K' },
    { value: 100000, label: '100K' },
    { value: 500000, label: '500K' },
];

export function ServerInfoModal({ isOpen, onClose }: ServerInfoModalProps) {
    const [stats, setStats] = useState<ServerStats | null>(null);
    const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
    const [roomsInfo, setRoomsInfo] = useState<RoomsInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [changingBuffer, setChangingBuffer] = useState(false);
    const [activeTab, setActiveTab] = useState<'stats' | 'rooms' | 'connection'>('stats');
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [clearingRoom, setClearingRoom] = useState<string | null>(null);
    const [clearingAll, setClearingAll] = useState<'logs' | 'watches' | 'streams' | null>(null);

    // Get state from store
    const currentRoom = useLogStore(state => state.currentRoom);
    const clearEntries = useLogStore(state => state.clearEntries);
    const wsLatency = useLogStore(state => state.wsLatency);
    const wsThroughput = useLogStore(state => state.wsThroughput);

    const fetchStats = useCallback(async () => {
        try {
            const baseUrl = getEffectiveServerUrl().replace(/^ws/, 'http');
            const res = await fetch(`${baseUrl}/api/server/stats`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setStats(data);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch stats');
        }
    }, []);

    const fetchConnectionInfo = useCallback(async () => {
        try {
            const baseUrl = getEffectiveServerUrl().replace(/^ws/, 'http');
            const res = await fetch(`${baseUrl}/api/server/connection-info`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setConnectionInfo(data);
        } catch (e) {
            console.error('Failed to fetch connection info:', e);
        }
    }, []);

    const fetchRoomsInfo = useCallback(async () => {
        try {
            const baseUrl = getEffectiveServerUrl().replace(/^ws/, 'http');
            const res = await fetch(`${baseUrl}/api/rooms`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setRoomsInfo(data);
        } catch (e) {
            console.error('Failed to fetch rooms info:', e);
        }
    }, []);


    const handleCopyConnectionString = useCallback((text: string, index: number) => {
        const copyToClipboard = (str: string): boolean => {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(str);
                return true;
            }
            const textArea = document.createElement('textarea');
            textArea.value = str;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                return true;
            } catch (err) {
                return false;
            } finally {
                textArea.remove();
            }
        };

        if (copyToClipboard(text)) {
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        }
    }, []);

    const handleClearRoomLogs = async (roomId: string) => {
        setClearingRoom(roomId);
        try {
            const baseUrl = getEffectiveServerUrl().replace(/^ws/, 'http');
            const roomParam = `room=${encodeURIComponent(roomId)}`;
            await fetch(`${baseUrl}/api/logs?${roomParam}`, { method: 'DELETE' });
            if (roomId === currentRoom) clearEntries();
            fetchRoomsInfo();
            fetchStats();
        } catch (e) {
            alert('Failed to clear logs');
        } finally {
            setClearingRoom(null);
        }
    };

    const handleClearAllLogs = async () => {
        if (!confirm('Clear ALL logs from ALL rooms?')) return;
        setClearingAll('logs');
        try {
            const baseUrl = getEffectiveServerUrl().replace(/^ws/, 'http');
            await fetch(`${baseUrl}/api/all/logs`, { method: 'DELETE' });
            clearEntries();
            fetchRoomsInfo();
            fetchStats();
        } catch (e) {
            alert('Failed to clear all logs');
        } finally {
            setClearingAll(null);
        }
    };

    const handleBufferSizeChange = async (newSize: number) => {
        setChangingBuffer(true);
        try {
            const baseUrl = getEffectiveServerUrl().replace(/^ws/, 'http');
            const res = await fetch(`${baseUrl}/api/server/config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maxEntries: newSize }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            fetchStats();
        } catch (e) {
            alert(`Failed to change buffer size: ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setChangingBuffer(false);
        }
    };

    // Fetch stats on open and every 2 seconds
    useEffect(() => {
        if (!isOpen) return;

        fetchStats();
        fetchConnectionInfo();
        fetchRoomsInfo();
        const interval = setInterval(() => {
            fetchStats();
            fetchRoomsInfo();
        }, 2000);
        return () => clearInterval(interval);
    }, [isOpen, fetchStats, fetchConnectionInfo, fetchRoomsInfo]);

    // Close on escape
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const memoryPercent = stats
        ? (stats.memory.heapUsed / stats.memory.heapTotal) * 100
        : 0;
    const bufferPercent = stats?.rooms
        ? (stats.rooms.totalLogs / (stats.rooms.maxEntriesPerRoom * stats.rooms.roomCount)) * 100
        : 0;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[480px] max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-slate-100 dark:bg-slate-700 px-4 py-3 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between flex-shrink-0">
                    <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                        </svg>
                        Server Information
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-slate-200 dark:border-slate-600 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('stats')}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                            activeTab === 'stats'
                                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                    >
                        Status
                    </button>
                    <button
                        onClick={() => setActiveTab('rooms')}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                            activeTab === 'rooms'
                                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                    >
                        Rooms
                    </button>
                    <button
                        onClick={() => setActiveTab('connection')}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                            activeTab === 'connection'
                                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                    >
                        Connection
                    </button>
                </div>

                {/* Content - fixed height to prevent resizing when switching tabs */}
                <div className="h-[360px] overflow-y-auto">
                    {activeTab === 'stats' && (
                        <div className="p-4 space-y-4">
                            {error ? (
                                <div className="text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/30 p-3 rounded">
                                    Error: {error}
                                </div>
                            ) : !stats ? (
                                <div className="text-slate-500 dark:text-slate-400 text-sm text-center py-4">
                                    Loading...
                                </div>
                            ) : (
                                <>
                                    {/* CPU & Memory side by side */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* CPU Usage */}
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-slate-600 dark:text-slate-300 font-medium">CPU</span>
                                                <span className="text-slate-500 dark:text-slate-400">
                                                    {stats.cpu.percent.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-300 ${
                                                        stats.cpu.percent > 80 ? 'bg-red-500' :
                                                        stats.cpu.percent > 50 ? 'bg-amber-500' : 'bg-green-500'
                                                    }`}
                                                    style={{ width: `${Math.min(stats.cpu.percent, 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Memory Usage */}
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-slate-600 dark:text-slate-300 font-medium">Memory</span>
                                                <span className="text-slate-500 dark:text-slate-400">
                                                    {formatBytes(stats.memory.heapUsed)}
                                                </span>
                                            </div>
                                            <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 transition-all duration-300"
                                                    style={{ width: `${Math.min(memoryPercent, 100)}%` }}
                                                />
                                            </div>
                                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                                RSS: {formatBytes(stats.memory.rss)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Log Buffer */}
                                    <div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-slate-600 dark:text-slate-300 font-medium">Log Buffer</span>
                                            <span className="text-slate-500 dark:text-slate-400">
                                                {formatNumber(stats.rooms.totalLogs)} / {formatNumber(stats.rooms.maxEntriesPerRoom * stats.rooms.roomCount)}
                                            </span>
                                        </div>
                                        <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-300 ${
                                                    bufferPercent > 90 ? 'bg-red-500' :
                                                    bufferPercent > 70 ? 'bg-amber-500' : 'bg-green-500'
                                                }`}
                                                style={{ width: `${Math.min(bufferPercent, 100)}%` }}
                                            />
                                        </div>
                                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                            {bufferPercent.toFixed(1)}% full
                                        </div>
                                    </div>

                                    {/* Stats in 2 columns */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {/* Connections group */}
                                        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                                            <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Connections</div>
                                            <div className="space-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Viewers</span>
                                                    <span className="font-medium text-slate-700 dark:text-slate-200">{stats.connections.viewers}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Rooms</span>
                                                    <span className="font-medium text-slate-700 dark:text-slate-200">{stats.rooms.roomCount}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Sources</span>
                                                    <span className="font-medium text-slate-700 dark:text-slate-200">{stats.connections.clients}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Performance group */}
                                        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                                            <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Client</div>
                                            <div className="space-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Uptime</span>
                                                    <span className="font-medium font-mono text-slate-700 dark:text-slate-200">{formatUptime(stats.uptime)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Latency</span>
                                                    <span className="font-medium font-mono text-slate-700 dark:text-slate-200">{wsLatency != null ? `${wsLatency}ms` : '-'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Throughput</span>
                                                    <span className="font-medium font-mono text-slate-700 dark:text-slate-200">{formatThroughput(wsThroughput)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Server Throughput - full width */}
                                    {stats.performance && (
                                        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                                            <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Server Throughput</div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Entries received</span>
                                                    <span className="font-medium font-mono text-slate-700 dark:text-slate-200">{stats.performance.entriesPerSec}/s</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Entries broadcast</span>
                                                    <span className="font-medium font-mono text-slate-700 dark:text-slate-200">{stats.performance.entriesBroadcastPerSec}/s</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Watches received</span>
                                                    <span className="font-medium font-mono text-slate-700 dark:text-slate-200">{stats.performance.watchesPerSec}/s</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-500 dark:text-slate-400">Watches broadcast</span>
                                                    <span className="font-medium font-mono text-slate-700 dark:text-slate-200">{stats.performance.watchesBroadcastPerSec}/s</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'rooms' && (
                        <div className="p-4 space-y-3">
                            {!roomsInfo ? (
                                <div className="text-slate-500 dark:text-slate-400 text-sm text-center py-4">
                                    Loading...
                                </div>
                            ) : (
                                <>
                                    {/* Rooms table */}
                                    <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-slate-700/50 text-left">
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Room</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400 text-right w-16">Logs</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400 text-right w-16">Watch</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400 text-right w-16">Stream</th>
                                                    <th className="px-3 py-2 w-12"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                {roomsInfo.details.map((room) => (
                                                    <tr
                                                        key={room.id}
                                                        className={room.id === currentRoom ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}
                                                    >
                                                        <td className="px-3 py-2">
                                                            <div className="flex items-center gap-2">
                                                                {room.id === currentRoom && (
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                                                                )}
                                                                <span className="text-slate-700 dark:text-slate-200 truncate max-w-[180px]">
                                                                    {room.id}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300">
                                                            {formatNumber(room.logStats.size)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300">
                                                            {room.watchCount}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300">
                                                            {room.streamStats.channelCount}
                                                        </td>
                                                        <td className="px-2 py-2 text-center">
                                                            <button
                                                                onClick={() => handleClearRoomLogs(room.id)}
                                                                disabled={clearingRoom === room.id}
                                                                className="p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                                                                title="Clear room data"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Footer controls */}
                                    <div className="flex items-center justify-between">
                                        {/* Buffer Size */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-500 dark:text-slate-400">Buffer per room</span>
                                            <select
                                                value={stats?.rooms.maxEntriesPerRoom ?? 100000}
                                                onChange={(e) => handleBufferSizeChange(parseInt(e.target.value))}
                                                disabled={changingBuffer}
                                                className="text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-600 border border-slate-300 dark:border-slate-500 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50"
                                            >
                                                {BUFFER_SIZE_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Clear All button */}
                                        <button
                                            onClick={handleClearAllLogs}
                                            disabled={clearingAll !== null}
                                            className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-500 text-slate-600 dark:text-slate-300 hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:text-red-400 dark:hover:border-red-600 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                        >
                                            {clearingAll === 'logs' ? 'Clearing...' : 'Clear All'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'connection' && (
                        <div className="p-4">
                            {!connectionInfo ? (
                                <div className="text-slate-500 dark:text-slate-400 text-sm text-center py-4">
                                    Loading...
                                </div>
                            ) : (
                                <>
                                    {/* Compact table */}
                                    <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                                        {/* Table header */}
                                        <div className="grid grid-cols-[1fr_100px_50px_28px] gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                            <div>
                                                Address
                                                <span className="ml-2 normal-case tracking-normal text-slate-400 dark:text-slate-500">
                                                    ({connectionInfo.hostname})
                                                </span>
                                            </div>
                                            <div className="text-right">Interface</div>
                                            <div className="text-center">Type</div>
                                            <div></div>
                                        </div>

                                        {/* Table body */}
                                        <div>
                                            {connectionInfo.connections.map((conn, index) => (
                                                <div
                                                    key={index}
                                                    className={`grid grid-cols-[1fr_100px_50px_28px] gap-2 px-3 py-1.5 items-center hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group ${
                                                        index !== connectionInfo.connections.length - 1 ? 'border-b border-slate-100 dark:border-slate-700' : ''
                                                    }`}
                                                    onClick={() => handleCopyConnectionString(conn.connectionString, index)}
                                                    title={conn.connectionString}
                                                >
                                                    {/* Address:Port */}
                                                    <div className="font-mono text-xs text-slate-700 dark:text-slate-200 truncate">
                                                        {conn.address}:{conn.port}
                                                    </div>

                                                    {/* Interface */}
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate text-right">
                                                        {conn.interface}
                                                    </div>

                                                    {/* IPv4/IPv6 badge */}
                                                    <div className="text-center">
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                            conn.family === 'IPv4'
                                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                                : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                                                        }`}>
                                                            {conn.family}
                                                        </span>
                                                    </div>

                                                    {/* Copy button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCopyConnectionString(conn.connectionString, index);
                                                        }}
                                                        className={`p-1 rounded transition-colors ${
                                                            copiedIndex === index
                                                                ? 'text-green-600 dark:text-green-400'
                                                                : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100'
                                                        }`}
                                                        title="Copy connection string"
                                                    >
                                                        {copiedIndex === index ? (
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
