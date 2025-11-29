/**
 * HighlightRuleEditor - Unified component for editing highlight rules
 * Supports dual-mode filters (list selection OR text matching) for string fields
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { HighlightRule, HighlightFilter, TextFilter, ListTextFilter, Level, LogEntryType, defaultHighlightFilter } from '../store/logStore';

// Color presets for quick styling
const colorPresets = [
    { bg: '#fef2f2', text: '#991b1b', name: 'Red' },
    { bg: '#fffbeb', text: '#92400e', name: 'Amber' },
    { bg: '#ecfdf5', text: '#065f46', name: 'Green' },
    { bg: '#eff6ff', text: '#1e40af', name: 'Blue' },
    { bg: '#f5f3ff', text: '#5b21b6', name: 'Purple' },
    { bg: '#fdf4ff', text: '#86198f', name: 'Pink' },
    { bg: '#f8fafc', text: '#475569', name: 'Gray' }
];

// Level options
const levelOptions = [
    { value: Level.Debug, label: 'Debug' },
    { value: Level.Verbose, label: 'Verbose' },
    { value: Level.Message, label: 'Info' },
    { value: Level.Warning, label: 'Warning' },
    { value: Level.Error, label: 'Error' },
    { value: Level.Fatal, label: 'Fatal' }
];

// Entry type options grouped
const entryTypeGroups = {
    'Control': [
        { value: LogEntryType.Separator, label: 'Separator' },
        { value: LogEntryType.EnterMethod, label: 'Enter Method' },
        { value: LogEntryType.LeaveMethod, label: 'Leave Method' },
        { value: LogEntryType.ResetCallstack, label: 'Reset Callstack' }
    ],
    'Messages': [
        { value: LogEntryType.Message, label: 'Message' },
        { value: LogEntryType.Warning, label: 'Warning' },
        { value: LogEntryType.Error, label: 'Error' },
        { value: LogEntryType.InternalError, label: 'Internal Error' },
        { value: LogEntryType.Comment, label: 'Comment' },
        { value: LogEntryType.VariableValue, label: 'Variable Value' },
        { value: LogEntryType.Checkpoint, label: 'Checkpoint' },
        { value: LogEntryType.Debug, label: 'Debug' },
        { value: LogEntryType.Verbose, label: 'Verbose' },
        { value: LogEntryType.Fatal, label: 'Fatal' },
        { value: LogEntryType.Conditional, label: 'Conditional' },
        { value: LogEntryType.Assert, label: 'Assert' }
    ],
    'Data': [
        { value: LogEntryType.Text, label: 'Text' },
        { value: LogEntryType.Binary, label: 'Binary' },
        { value: LogEntryType.Graphic, label: 'Graphic' },
        { value: LogEntryType.Source, label: 'Source' },
        { value: LogEntryType.Object, label: 'Object' },
        { value: LogEntryType.WebContent, label: 'Web Content' },
        { value: LogEntryType.System, label: 'System' },
        { value: LogEntryType.MemoryStatistic, label: 'Memory Statistic' },
        { value: LogEntryType.DatabaseResult, label: 'Database Result' },
        { value: LogEntryType.DatabaseStructure, label: 'Database Structure' }
    ]
};

// Validate regex pattern
function validateRegex(pattern: string): { valid: boolean; error?: string } {
    if (!pattern) return { valid: true };
    try {
        new RegExp(pattern);
        return { valid: true };
    } catch (e) {
        return { valid: false, error: (e as Error).message };
    }
}

// Dual-mode filter component: Select from list OR use text filter
interface ListTextFilterInputProps {
    label: string;
    filter: ListTextFilter;
    onChange: (filter: ListTextFilter) => void;
    availableOptions: string[]; // Options from current logs
}

function ListTextFilterInput({ label, filter, onChange, availableOptions }: ListTextFilterInputProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [manualValue, setManualValue] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Combine available options with selected values that might not be in current logs
    const allOptions = useMemo(() => {
        const set = new Set([...availableOptions, ...filter.values]);
        return Array.from(set).sort();
    }, [availableOptions, filter.values]);

    const filteredOptions = allOptions.filter(opt =>
        opt.toLowerCase().includes(search.toLowerCase())
    );

    const toggleOption = (option: string) => {
        const newValues = filter.values.includes(option)
            ? filter.values.filter(v => v !== option)
            : [...filter.values, option];
        onChange({ ...filter, values: newValues });
    };

    const addManualValue = () => {
        const trimmed = manualValue.trim();
        if (trimmed && !filter.values.includes(trimmed)) {
            onChange({ ...filter, values: [...filter.values, trimmed] });
        }
        setManualValue('');
    };

    const regexError = useMemo(() => {
        if (filter.mode === 'text' && filter.textOperator === 'regex' && filter.textValue) {
            const result = validateRegex(filter.textValue);
            return result.valid ? null : result.error;
        }
        return null;
    }, [filter.mode, filter.textOperator, filter.textValue]);

    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    {label}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={filter.inverse}
                        onChange={(e) => onChange({ ...filter, inverse: e.target.checked })}
                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    Exclude
                </label>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1 mb-2">
                <button
                    type="button"
                    onClick={() => onChange({ ...filter, mode: 'list' })}
                    className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        filter.mode === 'list'
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    Select from list
                </button>
                <button
                    type="button"
                    onClick={() => onChange({ ...filter, mode: 'text' })}
                    className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        filter.mode === 'text'
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    Text filter
                </button>
            </div>

            {filter.mode === 'list' ? (
                /* List mode */
                <div ref={dropdownRef} className="relative">
                    <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={`w-full px-3 py-2 border rounded-lg text-sm text-left bg-white hover:border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none flex items-center justify-between ${
                            filter.inverse && filter.values.length > 0 ? 'border-red-300 bg-red-50' : 'border-slate-200'
                        }`}
                    >
                        <span className={filter.values.length === 0 ? 'text-slate-400' : filter.inverse ? 'text-red-600' : 'text-slate-700'}>
                            {filter.values.length === 0
                                ? `All ${label.toLowerCase()}`
                                : filter.inverse
                                    ? `Excluding ${filter.values.length} item${filter.values.length > 1 ? 's' : ''}`
                                    : filter.values.length === 1
                                        ? filter.values[0]
                                        : `${filter.values.length} items selected`}
                        </span>
                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-hidden">
                            {/* Search input */}
                            <div className="p-2 border-b border-slate-100">
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search..."
                                    className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    autoFocus
                                />
                            </div>

                            {/* Quick actions */}
                            <div className="px-2 py-1.5 border-b border-slate-100 flex gap-2">
                                <button type="button" onClick={() => onChange({ ...filter, values: [...allOptions] })} className="text-xs text-blue-600 hover:text-blue-700">
                                    Select All
                                </button>
                                <button type="button" onClick={() => onChange({ ...filter, values: [] })} className="text-xs text-slate-500 hover:text-slate-700">
                                    Clear
                                </button>
                            </div>

                            {/* Add manual value */}
                            <div className="px-2 py-1.5 border-b border-slate-100 flex gap-1">
                                <input
                                    type="text"
                                    value={manualValue}
                                    onChange={(e) => setManualValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addManualValue()}
                                    placeholder="Add custom value..."
                                    className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={addManualValue}
                                    disabled={!manualValue.trim()}
                                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed"
                                >
                                    Add
                                </button>
                            </div>

                            {/* Options list */}
                            <div className="overflow-auto max-h-40">
                                {filteredOptions.length === 0 ? (
                                    <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
                                ) : (
                                    filteredOptions.map(option => (
                                        <label key={option} className="flex items-center px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={filter.values.includes(option)}
                                                onChange={() => toggleOption(option)}
                                                className="rounded border-slate-300 text-blue-500 focus:ring-blue-500 mr-2"
                                            />
                                            <span className={`text-sm truncate ${!availableOptions.includes(option) ? 'text-slate-400 italic' : 'text-slate-700'}`}>
                                                {option}
                                                {!availableOptions.includes(option) && ' (saved)'}
                                            </span>
                                        </label>
                                    ))
                                )}
                            </div>

                            {/* Selected tags */}
                            {filter.values.length > 0 && (
                                <div className="px-2 py-1.5 border-t border-slate-100 flex flex-wrap gap-1 max-h-20 overflow-auto">
                                    {filter.values.map(v => (
                                        <span key={v} className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${filter.inverse ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {v}
                                            <button type="button" onClick={() => toggleOption(v)} className="hover:opacity-70">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                /* Text mode */
                <div>
                    <div className="flex gap-2">
                        <select
                            value={filter.textOperator}
                            onChange={(e) => onChange({ ...filter, textOperator: e.target.value as ListTextFilter['textOperator'] })}
                            className="px-2 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        >
                            <option value="contains">Contains</option>
                            <option value="equals">Equals</option>
                            <option value="regex">Regex</option>
                        </select>
                        <input
                            type="text"
                            value={filter.textValue}
                            onChange={(e) => onChange({ ...filter, textValue: e.target.value })}
                            placeholder={filter.textOperator === 'regex' ? 'Enter regex pattern...' : 'Enter text...'}
                            className={`flex-1 px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${
                                regexError ? 'border-red-300 bg-red-50' : filter.inverse && filter.textValue ? 'border-red-300 bg-red-50' : 'border-slate-200'
                            }`}
                        />
                    </div>
                    {regexError && (
                        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            {regexError}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// Level multi-select with toggles
interface LevelSelectProps {
    selected: number[];
    onChange: (selected: number[]) => void;
    inverse: boolean;
    onInverseChange: (inverse: boolean) => void;
}

function LevelSelect({ selected, onChange, inverse, onInverseChange }: LevelSelectProps) {
    const toggleLevel = (level: number) => {
        if (selected.includes(level)) {
            onChange(selected.filter(l => l !== level));
        } else {
            onChange([...selected, level]);
        }
    };

    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Levels
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={inverse}
                        onChange={(e) => onInverseChange(e.target.checked)}
                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    Exclude
                </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {levelOptions.map(({ value, label }) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => toggleLevel(value)}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                            selected.includes(value)
                                ? inverse
                                    ? 'bg-red-500 text-white'
                                    : 'bg-blue-500 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {selected.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">All levels when none selected</p>
            )}
        </div>
    );
}

// Entry type multi-select with groups
interface EntryTypeSelectProps {
    selected: number[];
    onChange: (selected: number[]) => void;
    inverse: boolean;
    onInverseChange: (inverse: boolean) => void;
}

function EntryTypeSelect({ selected, onChange, inverse, onInverseChange }: EntryTypeSelectProps) {
    const [expanded, setExpanded] = useState(false);

    const toggleType = (type: number) => {
        if (selected.includes(type)) {
            onChange(selected.filter(t => t !== type));
        } else {
            onChange([...selected, type]);
        }
    };

    const allTypes = Object.values(entryTypeGroups).flat();
    const selectedLabels = selected.map(v => allTypes.find(t => t.value === v)?.label || `Type ${v}`);

    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Entry Types
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={inverse}
                        onChange={(e) => onInverseChange(e.target.checked)}
                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    Exclude
                </label>
            </div>
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className={`w-full px-3 py-2 border rounded-lg text-sm text-left bg-white hover:border-slate-300 flex items-center justify-between ${
                    inverse && selected.length > 0 ? 'border-red-300 bg-red-50' : 'border-slate-200'
                }`}
            >
                <span className={selected.length === 0 ? 'text-slate-400' : inverse ? 'text-red-600' : 'text-slate-700'}>
                    {selected.length === 0
                        ? 'All entry types'
                        : inverse
                            ? `Excluding ${selected.length} type${selected.length > 1 ? 's' : ''}`
                            : `${selected.length} type${selected.length > 1 ? 's' : ''} selected`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {expanded && (
                <div className="mt-2 border border-slate-200 rounded-lg p-2 max-h-48 overflow-auto">
                    {Object.entries(entryTypeGroups).map(([group, types]) => (
                        <div key={group} className="mb-2 last:mb-0">
                            <div className="text-xs font-semibold text-slate-500 mb-1">{group}</div>
                            <div className="flex flex-wrap gap-1">
                                {types.map(({ value, label }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => toggleType(value)}
                                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
                                            selected.includes(value)
                                                ? inverse ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {selectedLabels.map((label, i) => (
                        <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${inverse ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// Text filter with operator (for title)
interface TextFilterInputProps {
    label: string;
    filter: TextFilter;
    onChange: (filter: TextFilter) => void;
}

function TextFilterInput({ label, filter, onChange }: TextFilterInputProps) {
    const regexError = useMemo(() => {
        if (filter.operator === 'regex' && filter.value) {
            const result = validateRegex(filter.value);
            return result.valid ? null : result.error;
        }
        return null;
    }, [filter.operator, filter.value]);

    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    {label}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={filter.inverse}
                        onChange={(e) => onChange({ ...filter, inverse: e.target.checked })}
                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    Exclude
                </label>
            </div>
            <div className="flex gap-2">
                <select
                    value={filter.operator}
                    onChange={(e) => onChange({ ...filter, operator: e.target.value as TextFilter['operator'] })}
                    className="px-2 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                    <option value="contains">Contains</option>
                    <option value="equals">Equals</option>
                    <option value="regex">Regex</option>
                </select>
                <input
                    type="text"
                    value={filter.value}
                    onChange={(e) => onChange({ ...filter, value: e.target.value })}
                    placeholder={filter.operator === 'regex' ? 'Enter regex pattern...' : 'Enter text...'}
                    className={`flex-1 px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${
                        regexError ? 'border-red-300 bg-red-50' : filter.inverse && filter.value ? 'border-red-300 bg-red-50' : 'border-slate-200'
                    }`}
                />
            </div>
            {regexError && (
                <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {regexError}
                </p>
            )}
        </div>
    );
}

// Main editor props
export interface HighlightRuleEditorProps {
    rule?: HighlightRule;
    onSave: (rule: Omit<HighlightRule, 'id'>) => void;
    onCancel: () => void;
    availableSessions?: string[];
    availableAppNames?: string[];
    availableHostNames?: string[];
}

export function HighlightRuleEditor({
    rule,
    onSave,
    onCancel,
    availableSessions = [],
    availableAppNames = [],
    availableHostNames = []
}: HighlightRuleEditorProps) {
    const [name, setName] = useState(rule?.name || 'New Rule');
    const [enabled, setEnabled] = useState(rule?.enabled ?? true);
    const [priority, setPriority] = useState(rule?.priority ?? 1);
    const [filter, setFilter] = useState<HighlightFilter>(rule?.filter || { ...defaultHighlightFilter });
    const [bgColor, setBgColor] = useState(rule?.style.backgroundColor || '#eff6ff');
    const [textColor, setTextColor] = useState(rule?.style.textColor || '#1e40af');
    const [fontWeight, setFontWeight] = useState<'normal' | 'bold'>(rule?.style.fontWeight || 'normal');

    // Check if filter is valid (no regex errors)
    const isValid = useMemo(() => {
        // Check title filter
        if (filter.titleFilter.operator === 'regex' && filter.titleFilter.value) {
            if (!validateRegex(filter.titleFilter.value).valid) return false;
        }
        // Check session filter in text mode
        if (filter.sessionFilter.mode === 'text' && filter.sessionFilter.textOperator === 'regex' && filter.sessionFilter.textValue) {
            if (!validateRegex(filter.sessionFilter.textValue).valid) return false;
        }
        // Check app name filter in text mode
        if (filter.appNameFilter.mode === 'text' && filter.appNameFilter.textOperator === 'regex' && filter.appNameFilter.textValue) {
            if (!validateRegex(filter.appNameFilter.textValue).valid) return false;
        }
        // Check host name filter in text mode
        if (filter.hostNameFilter.mode === 'text' && filter.hostNameFilter.textOperator === 'regex' && filter.hostNameFilter.textValue) {
            if (!validateRegex(filter.hostNameFilter.textValue).valid) return false;
        }
        return true;
    }, [filter]);

    const handleSave = () => {
        if (!isValid) return;
        onSave({
            name,
            enabled,
            priority,
            filter,
            style: {
                backgroundColor: bgColor,
                textColor,
                fontWeight
            }
        });
    };

    const applyPreset = (preset: typeof colorPresets[0]) => {
        setBgColor(preset.bg);
        setTextColor(preset.text);
    };

    const updateFilter = <K extends keyof HighlightFilter>(key: K, value: HighlightFilter[K]) => {
        setFilter(f => ({ ...f, [key]: value }));
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-lg shadow-xl w-[600px] h-[700px] flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                    <h3 className="font-semibold text-slate-800">
                        {rule ? 'Edit Highlight Rule' : 'Create Highlight Rule'}
                    </h3>
                </div>

                <div className="p-4 overflow-auto flex-1 min-h-0">
                    {/* Name */}
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                            Rule Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>

                    {/* Enabled & Priority */}
                    <div className="flex gap-4 mb-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) => setEnabled(e.target.checked)}
                                className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">Enabled</span>
                        </label>
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-slate-600">Priority:</label>
                            <input
                                type="number"
                                value={priority}
                                onChange={(e) => setPriority(parseInt(e.target.value) || 1)}
                                className="w-16 px-2 py-1 border border-slate-200 rounded text-sm"
                                min={1}
                                max={100}
                            />
                        </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4 mt-4">
                        <h4 className="text-sm font-semibold text-slate-700 mb-3">Filter Conditions</h4>
                        <p className="text-xs text-slate-500 mb-4">
                            Log entries must match ALL conditions to be highlighted. Empty filters match everything.
                        </p>

                        {/* Sessions - dual mode */}
                        <ListTextFilterInput
                            label="Sessions"
                            filter={filter.sessionFilter}
                            onChange={(v) => updateFilter('sessionFilter', v)}
                            availableOptions={availableSessions}
                        />

                        {/* Levels */}
                        <LevelSelect
                            selected={filter.levels}
                            onChange={(v) => updateFilter('levels', v)}
                            inverse={filter.levelsInverse}
                            onInverseChange={(v) => updateFilter('levelsInverse', v)}
                        />

                        {/* App Names - dual mode */}
                        <ListTextFilterInput
                            label="Application Names"
                            filter={filter.appNameFilter}
                            onChange={(v) => updateFilter('appNameFilter', v)}
                            availableOptions={availableAppNames}
                        />

                        {/* Host Names - dual mode */}
                        <ListTextFilterInput
                            label="Host Names"
                            filter={filter.hostNameFilter}
                            onChange={(v) => updateFilter('hostNameFilter', v)}
                            availableOptions={availableHostNames}
                        />

                        {/* Entry Types */}
                        <EntryTypeSelect
                            selected={filter.entryTypes}
                            onChange={(v) => updateFilter('entryTypes', v)}
                            inverse={filter.entryTypesInverse}
                            onInverseChange={(v) => updateFilter('entryTypesInverse', v)}
                        />

                        {/* Process ID */}
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                    Process ID
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={filter.processIdInverse}
                                        onChange={(e) => updateFilter('processIdInverse', e.target.checked)}
                                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5"
                                    />
                                    Exclude
                                </label>
                            </div>
                            <input
                                type="number"
                                value={filter.processId ?? ''}
                                onChange={(e) => updateFilter('processId', e.target.value ? parseInt(e.target.value) : null)}
                                placeholder="Any process"
                                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${
                                    filter.processIdInverse && filter.processId !== null ? 'border-red-300 bg-red-50' : 'border-slate-200'
                                }`}
                            />
                        </div>

                        {/* Title Filter */}
                        <TextFilterInput
                            label="Title"
                            filter={filter.titleFilter}
                            onChange={(v) => updateFilter('titleFilter', v)}
                        />
                    </div>

                    {/* Style Section */}
                    <div className="border-t border-slate-200 pt-4 mt-4">
                        <h4 className="text-sm font-semibold text-slate-700 mb-3">Style</h4>

                        {/* Presets */}
                        <div className="mb-3">
                            <label className="block text-xs text-slate-500 mb-1.5">Quick Presets</label>
                            <div className="flex gap-1.5">
                                {colorPresets.map(preset => (
                                    <button
                                        key={preset.name}
                                        type="button"
                                        onClick={() => applyPreset(preset)}
                                        className="w-8 h-8 rounded border-2 border-transparent hover:border-slate-300 transition-colors"
                                        style={{ backgroundColor: preset.bg }}
                                        title={preset.name}
                                    >
                                        <span className="text-xs font-bold" style={{ color: preset.text }}>A</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-4 mb-4">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Background</label>
                                <input
                                    type="color"
                                    value={bgColor}
                                    onChange={(e) => setBgColor(e.target.value)}
                                    className="w-16 h-8 rounded cursor-pointer"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Text</label>
                                <input
                                    type="color"
                                    value={textColor}
                                    onChange={(e) => setTextColor(e.target.value)}
                                    className="w-16 h-8 rounded cursor-pointer"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Font</label>
                                <select
                                    value={fontWeight}
                                    onChange={(e) => setFontWeight(e.target.value as 'normal' | 'bold')}
                                    className="px-2 py-1.5 border border-slate-200 rounded text-sm"
                                >
                                    <option value="normal">Normal</option>
                                    <option value="bold">Bold</option>
                                </select>
                            </div>
                        </div>

                        {/* Preview */}
                        <div>
                            <label className="block text-xs text-slate-500 mb-1.5">Preview</label>
                            <div
                                className="px-3 py-2 rounded border border-slate-200 text-sm"
                                style={{
                                    backgroundColor: bgColor,
                                    color: textColor,
                                    fontWeight
                                }}
                            >
                                Sample log entry text with this highlight style
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 flex-shrink-0">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isValid}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            isValid
                                ? 'bg-blue-500 text-white hover:bg-blue-600'
                                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        }`}
                    >
                        {rule ? 'Save Changes' : 'Create Rule'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Export for utility
export { colorPresets };
