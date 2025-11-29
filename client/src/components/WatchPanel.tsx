/**
 * WatchPanel - Table-based watch values display with filtering
 */

import { useState, useMemo } from 'react';
import { useLogStore } from '../store/logStore';
import { format } from 'date-fns';

export function WatchPanel() {
    const { watches, clearWatches, setShowWatchPanel } = useLogStore();
    const [filterText, setFilterText] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'value' | 'timestamp'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const watchEntries = useMemo(() => {
        let entries = Object.entries(watches).map(([name, watch]) => ({
            name,
            ...watch
        }));

        // Apply filter
        if (filterText) {
            const lower = filterText.toLowerCase();
            entries = entries.filter(w =>
                w.name.toLowerCase().includes(lower) ||
                w.value.toLowerCase().includes(lower)
            );
        }

        // Apply sort
        entries.sort((a, b) => {
            let cmp = 0;
            switch (sortBy) {
                case 'name':
                    cmp = a.name.localeCompare(b.name);
                    break;
                case 'value':
                    cmp = a.value.localeCompare(b.value);
                    break;
                case 'timestamp':
                    cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return entries;
    }, [watches, filterText, sortBy, sortDir]);

    const handleSort = (field: 'name' | 'value' | 'timestamp') => {
        if (sortBy === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ field }: { field: 'name' | 'value' | 'timestamp' }) => {
        if (sortBy !== field) return null;
        return (
            <svg className="w-3 h-3 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {sortDir === 'asc' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                )}
            </svg>
        );
    };

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Watches
                    <span className="text-xs font-normal text-slate-400">({Object.keys(watches).length})</span>
                </span>
                <button
                    onClick={() => setShowWatchPanel(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    title="Close watch panel"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Filter */}
            <div className="px-3 py-2 border-b border-slate-100">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Filter watches..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Content */}
            {watchEntries.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <p className="text-slate-500 text-sm">
                            {filterText ? 'No matches found' : 'No watches'}
                        </p>
                        {!filterText && (
                            <p className="text-slate-400 text-xs mt-1">
                                Use <code className="bg-slate-100 px-1.5 py-0.5 rounded">log.watch()</code>
                            </p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                                <th
                                    onClick={() => handleSort('name')}
                                    className="px-3 py-2 text-left font-semibold text-slate-600 uppercase tracking-wide border-b border-slate-200 cursor-pointer hover:bg-slate-100"
                                >
                                    Name <SortIcon field="name" />
                                </th>
                                <th
                                    onClick={() => handleSort('value')}
                                    className="px-3 py-2 text-left font-semibold text-slate-600 uppercase tracking-wide border-b border-slate-200 cursor-pointer hover:bg-slate-100"
                                >
                                    Value <SortIcon field="value" />
                                </th>
                                <th
                                    onClick={() => handleSort('timestamp')}
                                    className="px-3 py-2 text-left font-semibold text-slate-600 uppercase tracking-wide border-b border-slate-200 cursor-pointer hover:bg-slate-100"
                                >
                                    Updated <SortIcon field="timestamp" />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {watchEntries.map((watch) => (
                                <tr
                                    key={watch.name}
                                    className="hover:bg-blue-50/50 transition-colors"
                                >
                                    <td className="px-3 py-2">
                                        <span className="font-mono text-blue-600 font-medium">{watch.name}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                                            {watch.value}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-400 tabular-nums">
                                        {format(new Date(watch.timestamp), 'HH:mm:ss.SSS')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Footer */}
            <div className="border-t border-slate-200 px-3 py-2 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                    {watchEntries.length} of {Object.keys(watches).length} watch{Object.keys(watches).length !== 1 ? 'es' : ''}
                </span>
                <button
                    onClick={() => clearWatches()}
                    className="text-xs text-slate-500 hover:text-red-500 transition-colors flex items-center gap-1"
                    title="Clear all watches"
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
