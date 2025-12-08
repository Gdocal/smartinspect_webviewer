/**
 * ClientsModal - Shows connected log sources and viewers with connection history
 *
 * Tabs:
 * - Active: Currently connected sources and viewers
 * - History: Connection/disconnection event log
 *
 * Uses WebSocket for live updates
 */

import { useState, useEffect, useCallback } from 'react';
import { getEffectiveServerUrl } from '../hooks/useSettings';
import { useLogStore } from '../store/logStore';

interface Client {
    id: string;
    address: string;
    port: number;
    connectedAt: string;
    appName: string;
    room: string;
    authenticated: boolean;
    packetsReceived: number;
    bytesReceived: number;
}

interface Viewer {
    id: string;
    address: string;
    connectedAt: string;
    room: string;
    user: string;
}

interface ConnectionEvent {
    eventId: number;
    timestamp: string;
    type: 'source' | 'viewer';
    event: 'connect' | 'disconnect';
    id: string;
    address: string;
    port?: number;
    name?: string;
    room: string;
    duration?: number;
}

interface ClientsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

function formatUptime(connectedAt: string): string {
    const connectedTime = new Date(connectedAt).getTime();
    const now = Date.now();
    const ms = now - connectedTime;

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString();
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClientsModal({ isOpen, onClose }: ClientsModalProps) {
    const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
    const [clients, setClients] = useState<Client[]>([]);
    const [viewers, setViewers] = useState<Viewer[]>([]);
    const [history, setHistory] = useState<ConnectionEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [roomFilter, setRoomFilter] = useState<string>('all');

    // Get available rooms from store
    const availableRooms = useLogStore(state => state.availableRooms);

    // Fetch all data
    const fetchData = useCallback(async () => {
        try {
            const baseUrl = getEffectiveServerUrl().replace(/^ws/, 'http');
            const [clientsRes, viewersRes, historyRes] = await Promise.all([
                fetch(`${baseUrl}/api/clients`),
                fetch(`${baseUrl}/api/viewers`),
                fetch(`${baseUrl}/api/connections/history`)
            ]);

            if (!clientsRes.ok || !viewersRes.ok || !historyRes.ok) {
                throw new Error('Failed to fetch data');
            }

            const [clientsData, viewersData, historyData] = await Promise.all([
                clientsRes.json(),
                viewersRes.json(),
                historyRes.json()
            ]);

            setClients(clientsData);
            setViewers(viewersData);
            setHistory(historyData);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch on open
    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        fetchData();
    }, [isOpen, fetchData]);

    // Listen for live connection events via the existing WebSocket
    useEffect(() => {
        if (!isOpen) return;

        // Create a handler for connection events
        const handleMessage = (event: MessageEvent) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'connectionEvent') {
                    const connEvent = msg.data as ConnectionEvent;

                    // Add to history (prepend, keep max 100)
                    setHistory(prev => [connEvent, ...prev].slice(0, 100));

                    // Update active connections
                    if (connEvent.event === 'connect') {
                        if (connEvent.type === 'source') {
                            // Refetch clients to get full data
                            fetchData();
                        } else {
                            // Refetch viewers
                            fetchData();
                        }
                    } else {
                        // Disconnect - remove from active lists
                        if (connEvent.type === 'source') {
                            setClients(prev => prev.filter(c => c.id !== connEvent.id));
                        } else {
                            setViewers(prev => prev.filter(v => v.id !== connEvent.id));
                        }
                    }
                }
            } catch {
                // Ignore non-JSON messages
            }
        };

        // Get the WebSocket from the global scope (set by useWebSocket hook)
        const ws = (window as unknown as { __siWebSocket?: WebSocket }).__siWebSocket;
        if (ws) {
            ws.addEventListener('message', handleMessage);
            return () => ws.removeEventListener('message', handleMessage);
        }
    }, [isOpen, fetchData]);

    // Update uptime every second
    useEffect(() => {
        if (!isOpen) return;
        const interval = setInterval(() => {
            // Force re-render to update uptime displays
            setClients(prev => [...prev]);
            setViewers(prev => [...prev]);
        }, 1000);
        return () => clearInterval(interval);
    }, [isOpen]);

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

    // Filter by room
    const filteredClients = roomFilter === 'all' ? clients : clients.filter(c => c.room === roomFilter);
    const filteredViewers = roomFilter === 'all' ? viewers : viewers.filter(v => v.room === roomFilter);
    const filteredHistory = roomFilter === 'all' ? history : history.filter(h => h.room === roomFilter);

    // Get unique rooms from data
    const allRooms = [...new Set([
        ...clients.map(c => c.room),
        ...viewers.map(v => v.room),
        ...availableRooms
    ])].sort();

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[800px] h-[600px] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-slate-100 dark:bg-slate-700 px-4 py-3 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between flex-shrink-0">
                    <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                        </svg>
                        Connections
                    </h2>
                    <div className="flex items-center gap-3">
                        {/* Room filter */}
                        <select
                            value={roomFilter}
                            onChange={(e) => setRoomFilter(e.target.value)}
                            className="text-xs px-2 py-1 border border-slate-300 dark:border-slate-500 rounded bg-white dark:bg-slate-600 text-slate-700 dark:text-slate-200"
                        >
                            <option value="all">All Rooms</option>
                            {allRooms.map(room => (
                                <option key={room} value={room}>{room}</option>
                            ))}
                        </select>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-600 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                            activeTab === 'active'
                                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                    >
                        Active
                        <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-slate-200 dark:bg-slate-600">
                            {filteredClients.length + filteredViewers.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                            activeTab === 'history'
                                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                    >
                        History
                        <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-slate-200 dark:bg-slate-600">
                            {filteredHistory.length}
                        </span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    {loading ? (
                        <div className="text-slate-500 dark:text-slate-400 text-sm text-center py-8">
                            Loading...
                        </div>
                    ) : error ? (
                        <div className="text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/30 p-3 rounded">
                            Error: {error}
                        </div>
                    ) : activeTab === 'active' ? (
                        <div className="space-y-4">
                            {/* Sources section */}
                            <div>
                                <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    Log Sources ({filteredClients.length})
                                </h3>
                                {filteredClients.length === 0 ? (
                                    <div className="text-slate-400 dark:text-slate-500 text-sm py-4 text-center bg-slate-50 dark:bg-slate-700/30 rounded">
                                        No log sources connected
                                    </div>
                                ) : (
                                    <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-slate-700/50 text-left">
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">IP</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">App Name</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Room</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Connected</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400 text-right">Uptime</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400 text-right">Data</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                {filteredClients.map((client) => (
                                                    <tr key={client.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                        <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200 text-xs">
                                                            {client.address}:{client.port}
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                                            {client.appName || <span className="text-slate-400 italic">Unknown</span>}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                                                {client.room}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">
                                                            {formatTimestamp(client.connectedAt)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-mono text-green-600 dark:text-green-400 font-medium">
                                                            {formatUptime(client.connectedAt)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 text-xs font-mono">
                                                            {formatBytes(client.bytesReceived)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Viewers section */}
                            <div>
                                <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    Viewers ({filteredViewers.length})
                                </h3>
                                {filteredViewers.length === 0 ? (
                                    <div className="text-slate-400 dark:text-slate-500 text-sm py-4 text-center bg-slate-50 dark:bg-slate-700/30 rounded">
                                        No viewers connected
                                    </div>
                                ) : (
                                    <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-slate-700/50 text-left">
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">IP</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">User</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Room</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Connected</th>
                                                    <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400 text-right">Uptime</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                {filteredViewers.map((viewer) => (
                                                    <tr key={viewer.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                        <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200 text-xs">
                                                            {viewer.address}
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                                            {viewer.user || <span className="text-slate-400 italic">default</span>}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                                                                {viewer.room}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">
                                                            {formatTimestamp(viewer.connectedAt)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-mono text-green-600 dark:text-green-400 font-medium">
                                                            {formatUptime(viewer.connectedAt)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* History tab */
                        filteredHistory.length === 0 ? (
                            <div className="text-center py-12">
                                <svg className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-slate-500 dark:text-slate-400 text-sm">No connection events recorded</p>
                            </div>
                        ) : (
                            <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-700/50 text-left">
                                            <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Time</th>
                                            <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Event</th>
                                            <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Type</th>
                                            <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">IP</th>
                                            <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Name</th>
                                            <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Room</th>
                                            <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400 text-right">Duration</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {filteredHistory.map((event) => (
                                            <tr key={event.eventId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                                                    {formatTimestamp(event.timestamp)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                                        event.event === 'connect'
                                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                                            : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                                                    }`}>
                                                        {event.event === 'connect' ? 'Connected' : 'Disconnected'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                                        event.type === 'source'
                                                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                                                    }`}>
                                                        {event.type === 'source' ? 'Source' : 'Viewer'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200 text-xs">
                                                    {event.address}{event.port ? `:${event.port}` : ''}
                                                </td>
                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                                    {event.name || <span className="text-slate-400 italic">-</span>}
                                                </td>
                                                <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">
                                                    {event.room}
                                                </td>
                                                <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 text-xs font-mono">
                                                    {event.duration ? formatDuration(event.duration) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 dark:bg-slate-700/50 px-4 py-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span>Live updates</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="px-3 py-1 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded text-slate-700 dark:text-slate-200 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
