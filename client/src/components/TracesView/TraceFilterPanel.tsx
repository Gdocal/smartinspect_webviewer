/**
 * TraceFilterPanel - Professional filter UI for traces
 * Features:
 * - Service/App dropdown
 * - Operation dropdown (filtered by selected service)
 * - Status toggle (All/OK/Error)
 * - Duration range slider
 * - Tag key-value filters
 * - Search input
 */

import { useState, useCallback, useMemo } from 'react';
import { useTraceStore } from '../../store/traceStore';

interface TraceFilterPanelProps {
    /** Collapse to compact mode */
    compact?: boolean;
}

export function TraceFilterPanel({ compact = false }: TraceFilterPanelProps) {
    const {
        filter,
        filterOptions,
        setFilter
    } = useTraceStore();

    // Local state for tag input
    const [tagKey, setTagKey] = useState('');
    const [tagValue, setTagValue] = useState('');
    const [expanded, setExpanded] = useState(!compact);

    // Count active filters
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filter.status !== 'all') count++;
        if (filter.search) count++;
        if (filter.minDuration !== undefined) count++;
        if (filter.maxDuration !== undefined) count++;
        if (filter.services?.length) count++;
        if (filter.operations?.length) count++;
        if (filter.tags && Object.keys(filter.tags).length > 0) count += Object.keys(filter.tags).length;
        return count;
    }, [filter]);

    // Handle service selection
    const handleServiceChange = useCallback((service: string) => {
        const currentServices = filter.services || [];
        if (service === '__all__') {
            setFilter({ services: [] });
        } else if (currentServices.includes(service)) {
            setFilter({ services: currentServices.filter(s => s !== service) });
        } else {
            setFilter({ services: [...currentServices, service] });
        }
    }, [filter.services, setFilter]);

    // Handle operation selection
    const handleOperationChange = useCallback((operation: string) => {
        const currentOps = filter.operations || [];
        if (operation === '__all__') {
            setFilter({ operations: [] });
        } else if (currentOps.includes(operation)) {
            setFilter({ operations: currentOps.filter(o => o !== operation) });
        } else {
            setFilter({ operations: [...currentOps, operation] });
        }
    }, [filter.operations, setFilter]);

    // Handle tag addition
    const handleAddTag = useCallback(() => {
        if (tagKey.trim() && tagValue.trim()) {
            const currentTags = filter.tags || {};
            setFilter({
                tags: { ...currentTags, [tagKey.trim()]: tagValue.trim() }
            });
            setTagKey('');
            setTagValue('');
        }
    }, [tagKey, tagValue, filter.tags, setFilter]);

    // Handle tag removal
    const handleRemoveTag = useCallback((key: string) => {
        const currentTags = { ...(filter.tags || {}) };
        delete currentTags[key];
        setFilter({ tags: currentTags });
    }, [filter.tags, setFilter]);

    // Handle duration change
    const handleMinDurationChange = useCallback((value: string) => {
        const num = value ? parseInt(value, 10) : undefined;
        setFilter({ minDuration: num && num > 0 ? num : undefined });
    }, [setFilter]);

    const handleMaxDurationChange = useCallback((value: string) => {
        const num = value ? parseInt(value, 10) : undefined;
        setFilter({ maxDuration: num && num > 0 ? num : undefined });
    }, [setFilter]);

    // Clear all filters
    const handleClearFilters = useCallback(() => {
        setFilter({
            status: 'all',
            search: '',
            minDuration: undefined,
            maxDuration: undefined,
            services: [],
            operations: [],
            tags: {}
        });
    }, [setFilter]);

    // Common styles
    const selectClass = "px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200";
    const inputClass = "px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400";
    const buttonClass = "px-2 py-1 text-xs rounded transition-colors";

    if (compact && !expanded) {
        // Compact collapsed view
        return (
            <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <button
                    onClick={() => setExpanded(true)}
                    className={`${buttonClass} bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 flex items-center gap-1`}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    Filters
                    {activeFilterCount > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded-full">
                            {activeFilterCount}
                        </span>
                    )}
                </button>

                {/* Quick status toggle */}
                <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700 rounded p-0.5">
                    {(['all', 'ok', 'error'] as const).map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter({ status })}
                            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                                filter.status === status
                                    ? status === 'error'
                                        ? 'bg-red-500 text-white'
                                        : status === 'ok'
                                        ? 'bg-green-500 text-white'
                                        : 'bg-blue-500 text-white'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            {status === 'all' ? 'All' : status === 'ok' ? 'OK' : 'Errors'}
                        </button>
                    ))}
                </div>

                {/* Quick search */}
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search traces..."
                        value={filter.search}
                        onChange={(e) => setFilter({ search: e.target.value })}
                        className={`${inputClass} w-full`}
                    />
                </div>

                {/* Active tags indicator */}
                {filter.tags && Object.keys(filter.tags).length > 0 && (
                    <div className="flex items-center gap-1">
                        {Object.entries(filter.tags).slice(0, 2).map(([key, value]) => (
                            <span
                                key={key}
                                className="px-1.5 py-0.5 text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded flex items-center gap-1"
                            >
                                {key}={value}
                                <button
                                    onClick={() => handleRemoveTag(key)}
                                    className="hover:text-purple-900 dark:hover:text-purple-100"
                                >
                                    x
                                </button>
                            </span>
                        ))}
                        {Object.keys(filter.tags).length > 2 && (
                            <span className="text-[10px] text-slate-500">
                                +{Object.keys(filter.tags).length - 2}
                            </span>
                        )}
                    </div>
                )}

                {/* Clear filters */}
                {activeFilterCount > 0 && (
                    <button
                        onClick={handleClearFilters}
                        className={`${buttonClass} text-slate-500 hover:text-slate-700 dark:hover:text-slate-300`}
                        title="Clear all filters"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        );
    }

    // Full expanded view
    return (
        <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Filters</span>
                    {activeFilterCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded-full">
                            {activeFilterCount} active
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {activeFilterCount > 0 && (
                        <button
                            onClick={handleClearFilters}
                            className={`${buttonClass} text-slate-500 hover:text-red-500`}
                        >
                            Clear all
                        </button>
                    )}
                    {compact && (
                        <button
                            onClick={() => setExpanded(false)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Filter rows */}
            <div className="p-3 space-y-3">
                {/* Row 1: Status, Search */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Status toggle */}
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Status</label>
                        <div className="flex items-center gap-0.5 bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 p-0.5">
                            {(['all', 'ok', 'error'] as const).map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setFilter({ status })}
                                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                                        filter.status === status
                                            ? status === 'error'
                                                ? 'bg-red-500 text-white'
                                                : status === 'ok'
                                                ? 'bg-green-500 text-white'
                                                : 'bg-blue-500 text-white'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                                    }`}
                                >
                                    {status === 'all' ? 'All' : status === 'ok' ? 'OK' : 'Errors'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Search */}
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search traces..."
                                value={filter.search}
                                onChange={(e) => setFilter({ search: e.target.value })}
                                className={`${inputClass} w-full pl-7`}
                            />
                        </div>
                    </div>
                </div>

                {/* Row 2: Service, Operation dropdowns */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Service filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Service</label>
                        <select
                            value={filter.services?.length === 1 ? filter.services[0] : '__all__'}
                            onChange={(e) => handleServiceChange(e.target.value)}
                            className={selectClass}
                        >
                            <option value="__all__">All Services</option>
                            {filterOptions.services.map(service => (
                                <option key={service} value={service}>{service}</option>
                            ))}
                        </select>
                        {filter.services && filter.services.length > 0 && (
                            <div className="flex items-center gap-1">
                                {filter.services.map(service => (
                                    <span
                                        key={service}
                                        className="px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded flex items-center gap-1"
                                    >
                                        {service}
                                        <button
                                            onClick={() => handleServiceChange(service)}
                                            className="hover:text-blue-900 dark:hover:text-blue-100"
                                        >
                                            x
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Operation filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Operation</label>
                        <select
                            value={filter.operations?.length === 1 ? filter.operations[0] : '__all__'}
                            onChange={(e) => handleOperationChange(e.target.value)}
                            className={selectClass}
                        >
                            <option value="__all__">All Operations</option>
                            {filterOptions.operations.map(op => (
                                <option key={op} value={op}>{op}</option>
                            ))}
                        </select>
                        {filter.operations && filter.operations.length > 0 && (
                            <div className="flex items-center gap-1">
                                {filter.operations.map(op => (
                                    <span
                                        key={op}
                                        className="px-1.5 py-0.5 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded flex items-center gap-1"
                                    >
                                        {op}
                                        <button
                                            onClick={() => handleOperationChange(op)}
                                            className="hover:text-green-900 dark:hover:text-green-100"
                                        >
                                            x
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 3: Duration, Tags */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Duration range */}
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Duration</label>
                        <input
                            type="number"
                            placeholder="Min (ms)"
                            value={filter.minDuration ?? ''}
                            onChange={(e) => handleMinDurationChange(e.target.value)}
                            className={`${inputClass} w-20`}
                            min={0}
                        />
                        <span className="text-slate-400">-</span>
                        <input
                            type="number"
                            placeholder="Max (ms)"
                            value={filter.maxDuration ?? ''}
                            onChange={(e) => handleMaxDurationChange(e.target.value)}
                            className={`${inputClass} w-20`}
                            min={0}
                        />
                    </div>

                    {/* Tag filter input */}
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Tag</label>
                        <input
                            type="text"
                            placeholder="key"
                            value={tagKey}
                            onChange={(e) => setTagKey(e.target.value)}
                            className={`${inputClass} w-20`}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                        />
                        <span className="text-slate-400">=</span>
                        <input
                            type="text"
                            placeholder="value"
                            value={tagValue}
                            onChange={(e) => setTagValue(e.target.value)}
                            className={`${inputClass} w-24`}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                        />
                        <button
                            onClick={handleAddTag}
                            disabled={!tagKey.trim() || !tagValue.trim()}
                            className={`${buttonClass} bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            + Add
                        </button>
                    </div>
                </div>

                {/* Active tags */}
                {filter.tags && Object.keys(filter.tags).length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Active tags:</span>
                        {Object.entries(filter.tags).map(([key, value]) => (
                            <span
                                key={key}
                                className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full flex items-center gap-1.5"
                            >
                                <span className="font-medium">{key}</span>
                                <span>=</span>
                                <span>{value}</span>
                                <button
                                    onClick={() => handleRemoveTag(key)}
                                    className="ml-1 hover:text-purple-900 dark:hover:text-purple-100"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
