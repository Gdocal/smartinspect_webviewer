/**
 * ServerInfoModal - Displays server stats and provides controls
 */

import { useState, useEffect, useCallback } from 'react';
import { getEffectiveServerUrl } from '../hooks/useSettings';

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
    };
    uptime: number;
    logs: {
        count: number;
        maxEntries: number;
    };
    connections: {
        viewers: number;
        clients: number;
    };
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

export function ServerInfoModal({ isOpen, onClose }: ServerInfoModalProps) {
    const [stats, setStats] = useState<ServerStats | null>(null);
    const [error, setError] = useState<string | null>(null);

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

    const handleClearLogs = async () => {
        if (!confirm('Clear all logs on server?')) return;
        try {
            const baseUrl = getEffectiveServerUrl().replace(/^ws/, 'http');
            await fetch(`${baseUrl}/api/logs`, { method: 'DELETE' });
            fetchStats();
        } catch (e) {
            alert('Failed to clear logs');
        }
    };

    const handleClearWatches = async () => {
        if (!confirm('Clear all watches on server?')) return;
        try {
            const baseUrl = getEffectiveServerUrl().replace(/^ws/, 'http');
            await fetch(`${baseUrl}/api/watches`, { method: 'DELETE' });
            fetchStats();
        } catch (e) {
            alert('Failed to clear watches');
        }
    };

    // Fetch stats on open and every 2 seconds
    useEffect(() => {
        if (!isOpen) return;

        fetchStats();
        const interval = setInterval(fetchStats, 2000);
        return () => clearInterval(interval);
    }, [isOpen, fetchStats]);

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
    const bufferPercent = stats
        ? (stats.logs.count / stats.logs.maxEntries) * 100
        : 0;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-[400px] max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                        </svg>
                        Server Information
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {error ? (
                        <div className="text-red-500 text-sm bg-red-50 p-3 rounded">
                            Error: {error}
                        </div>
                    ) : !stats ? (
                        <div className="text-slate-500 text-sm text-center py-4">
                            Loading...
                        </div>
                    ) : (
                        <>
                            {/* Memory Usage */}
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-slate-600 font-medium">Memory Usage</span>
                                    <span className="text-slate-500">
                                        {formatBytes(stats.memory.heapUsed)} / {formatBytes(stats.memory.heapTotal)}
                                    </span>
                                </div>
                                <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-300"
                                        style={{ width: `${Math.min(memoryPercent, 100)}%` }}
                                    />
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    RSS: {formatBytes(stats.memory.rss)}
                                </div>
                            </div>

                            {/* Log Buffer */}
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-slate-600 font-medium">Log Buffer</span>
                                    <span className="text-slate-500">
                                        {formatNumber(stats.logs.count)} / {formatNumber(stats.logs.maxEntries)}
                                    </span>
                                </div>
                                <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-300 ${
                                            bufferPercent > 90 ? 'bg-red-500' :
                                            bufferPercent > 70 ? 'bg-amber-500' : 'bg-green-500'
                                        }`}
                                        style={{ width: `${Math.min(bufferPercent, 100)}%` }}
                                    />
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    {bufferPercent.toFixed(1)}% full
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="bg-slate-50 rounded p-3">
                                    <div className="text-xs text-slate-500 uppercase tracking-wide">Uptime</div>
                                    <div className="text-lg font-semibold text-slate-700">
                                        {formatUptime(stats.uptime)}
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded p-3">
                                    <div className="text-xs text-slate-500 uppercase tracking-wide">Viewers</div>
                                    <div className="text-lg font-semibold text-slate-700">
                                        {stats.connections.viewers}
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded p-3">
                                    <div className="text-xs text-slate-500 uppercase tracking-wide">Log Sources</div>
                                    <div className="text-lg font-semibold text-slate-700">
                                        {stats.connections.clients}
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded p-3">
                                    <div className="text-xs text-slate-500 uppercase tracking-wide">Buffer Size</div>
                                    <div className="text-lg font-semibold text-slate-700">
                                        {(stats.logs.maxEntries / 1000).toFixed(0)}K
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex gap-2">
                    <button
                        onClick={handleClearLogs}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Clear Logs
                    </button>
                    <button
                        onClick={handleClearWatches}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Clear Watches
                    </button>
                </div>
            </div>
        </div>
    );
}
