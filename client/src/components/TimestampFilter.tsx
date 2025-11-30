/**
 * TimestampFilter - Custom AG Grid filter for timestamp column
 * Provides quick presets and user-friendly date/time input
 */

import { forwardRef, useImperativeHandle, useState, useCallback, useEffect, useRef } from 'react';
import { IFilterParams, IDoesFilterPassParams } from 'ag-grid-community';
import { format, subMinutes, subHours, startOfDay, endOfDay, subDays, parseISO, isValid } from 'date-fns';

type FilterMode = 'none' | 'after' | 'before' | 'between';
type Preset = 'last5min' | 'last15min' | 'last30min' | 'last1hour' | 'last4hours' | 'today' | 'yesterday';

interface TimestampFilterState {
    mode: FilterMode;
    preset: Preset | null;
    afterDate: string;
    afterTime: string;
    beforeDate: string;
    beforeTime: string;
}

const PRESETS: { value: Preset; label: string }[] = [
    { value: 'last5min', label: '5m' },
    { value: 'last15min', label: '15m' },
    { value: 'last30min', label: '30m' },
    { value: 'last1hour', label: '1h' },
    { value: 'last4hours', label: '4h' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yest.' },
];

function getPresetRange(preset: Preset): { from: Date; to: Date } {
    const now = new Date();
    switch (preset) {
        case 'last5min':
            return { from: subMinutes(now, 5), to: now };
        case 'last15min':
            return { from: subMinutes(now, 15), to: now };
        case 'last30min':
            return { from: subMinutes(now, 30), to: now };
        case 'last1hour':
            return { from: subHours(now, 1), to: now };
        case 'last4hours':
            return { from: subHours(now, 4), to: now };
        case 'today':
            return { from: startOfDay(now), to: endOfDay(now) };
        case 'yesterday':
            const yesterday = subDays(now, 1);
            return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
}

function parseDateTime(dateStr: string, timeStr: string): Date | null {
    if (!dateStr) return null;
    const time = timeStr || '00:00:00.000';
    const fullStr = `${dateStr}T${time}`;
    const date = parseISO(fullStr);
    return isValid(date) ? date : null;
}

export const TimestampFilter = forwardRef((props: IFilterParams, ref) => {
    const [state, setState] = useState<TimestampFilterState>({
        mode: 'none',
        preset: null,
        afterDate: '',
        afterTime: '',
        beforeDate: '',
        beforeTime: '',
    });

    // Calculate effective date range based on state
    const getEffectiveRange = useCallback((): { from: Date | null; to: Date | null } => {
        if (state.mode === 'none') {
            return { from: null, to: null };
        }
        if (state.mode === 'after') {
            return { from: parseDateTime(state.afterDate, state.afterTime), to: null };
        }
        if (state.mode === 'before') {
            return { from: null, to: parseDateTime(state.beforeDate, state.beforeTime) };
        }
        if (state.mode === 'between') {
            return {
                from: parseDateTime(state.afterDate, state.afterTime),
                to: parseDateTime(state.beforeDate, state.beforeTime)
            };
        }
        return { from: null, to: null };
    }, [state]);

    // Track if this is the initial mount (to avoid calling filterChangedCallback on first render)
    const isInitialMount = useRef(true);

    // Notify AG Grid when filter changes
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        // filterChangedCallback is provided by AG Grid to notify filter changes
        if (typeof props.filterChangedCallback === 'function') {
            props.filterChangedCallback();
        }
    }, [state, props.filterChangedCallback]);

    // Expose filter API to AG Grid
    useImperativeHandle(ref, () => ({
        isFilterActive() {
            return state.mode !== 'none';
        },
        doesFilterPass(params: IDoesFilterPassParams) {
            const { from, to } = getEffectiveRange();
            const value = props.getValue(params.node);
            if (!value) return false;

            const rowDate = new Date(value);
            if (!isValid(rowDate)) return false;

            if (from && rowDate < from) return false;
            if (to && rowDate > to) return false;
            return true;
        },
        getModel() {
            if (state.mode === 'none') return null;
            return { ...state };
        },
        setModel(model: TimestampFilterState | null) {
            if (model) {
                setState(model);
            } else {
                setState({
                    mode: 'none',
                    preset: null,
                    afterDate: '',
                    afterTime: '',
                    beforeDate: '',
                    beforeTime: '',
                });
            }
        },
    }));

    const handleModeChange = (mode: FilterMode) => {
        setState(prev => ({ ...prev, mode, preset: null }));
    };

    const handlePresetClick = (preset: Preset) => {
        // Calculate the range and populate the fields so user can modify
        const range = getPresetRange(preset);
        setState({
            mode: 'between',
            preset: preset, // Track which preset was used
            afterDate: format(range.from, 'yyyy-MM-dd'),
            afterTime: format(range.from, 'HH:mm:ss.SSS'),
            beforeDate: format(range.to, 'yyyy-MM-dd'),
            beforeTime: format(range.to, 'HH:mm:ss.SSS'),
        });
    };

    const handleClear = () => {
        setState({
            mode: 'none',
            preset: null,
            afterDate: '',
            afterTime: '',
            beforeDate: '',
            beforeTime: '',
        });
    };

    const handleSetNow = (field: 'after' | 'before') => {
        const now = new Date();
        const dateStr = format(now, 'yyyy-MM-dd');
        const timeStr = format(now, 'HH:mm:ss.SSS');
        if (field === 'after') {
            setState(prev => ({ ...prev, afterDate: dateStr, afterTime: timeStr }));
        } else {
            setState(prev => ({ ...prev, beforeDate: dateStr, beforeTime: timeStr }));
        }
    };

    return (
        <div className="p-2 bg-white dark:bg-slate-800 w-[170px]" style={{ fontFamily: 'inherit' }}>
            {/* Quick Presets */}
            <div className="mb-2">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Quick</div>
                <div className="flex flex-wrap gap-1">
                    {PRESETS.map(p => (
                        <button
                            key={p.value}
                            onClick={() => handlePresetClick(p.value)}
                            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                                state.preset === p.value
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-200 dark:border-slate-600 my-2" />

            {/* Mode Selection */}
            <div className="mb-2">
                <div className="flex gap-1">
                    {[
                        { mode: 'after' as FilterMode, label: 'After' },
                        { mode: 'before' as FilterMode, label: 'Before' },
                        { mode: 'between' as FilterMode, label: 'Range' },
                    ].map(({ mode, label }) => (
                        <button
                            key={mode}
                            onClick={() => handleModeChange(mode)}
                            className={`px-2 py-0.5 text-xs rounded transition-colors ${
                                state.mode === mode
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Date/Time Inputs */}
            {(state.mode === 'after' || state.mode === 'between') && (
                <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {state.mode === 'between' ? 'From' : 'After'}
                        </span>
                        <button
                            onClick={() => handleSetNow('after')}
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                            Now
                        </button>
                    </div>
                    <div className="space-y-1">
                        <input
                            type="date"
                            value={state.afterDate}
                            onChange={(e) => setState(prev => ({ ...prev, afterDate: e.target.value }))}
                            className="w-full px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                        />
                        <input
                            type="text"
                            value={state.afterTime}
                            onChange={(e) => setState(prev => ({ ...prev, afterTime: e.target.value }))}
                            placeholder="HH:mm:ss"
                            className="w-full px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                        />
                    </div>
                </div>
            )}

            {(state.mode === 'before' || state.mode === 'between') && (
                <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {state.mode === 'between' ? 'To' : 'Before'}
                        </span>
                        <button
                            onClick={() => handleSetNow('before')}
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                            Now
                        </button>
                    </div>
                    <div className="space-y-1">
                        <input
                            type="date"
                            value={state.beforeDate}
                            onChange={(e) => setState(prev => ({ ...prev, beforeDate: e.target.value }))}
                            className="w-full px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                        />
                        <input
                            type="text"
                            value={state.beforeTime}
                            onChange={(e) => setState(prev => ({ ...prev, beforeTime: e.target.value }))}
                            placeholder="HH:mm:ss"
                            className="w-full px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                        />
                    </div>
                </div>
            )}

            {/* Clear Button */}
            {state.mode !== 'none' && (
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-600">
                    <button
                        onClick={handleClear}
                        className="w-full px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                        Clear
                    </button>
                </div>
            )}
        </div>
    );
});

TimestampFilter.displayName = 'TimestampFilter';
