/**
 * ViewTabs - Tab bar for switching between predefined views
 * With searchable multi-select dropdown for sessions
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLogStore, View, Filter, Level, HighlightRule } from '../store/logStore';
import { HighlightRuleEditor } from './HighlightRuleEditor';

// Helper to get a summary of the filter for display
function getFilterSummary(rule: HighlightRule): string {
    const parts: string[] = [];
    const f = rule.filter;

    // Session filter
    const sf = f.sessionFilter;
    if (sf.mode === 'list' && sf.values.length > 0) {
        const prefix = sf.inverse ? 'not ' : '';
        parts.push(`${prefix}session: ${sf.values.slice(0, 2).join(', ')}${sf.values.length > 2 ? '...' : ''}`);
    } else if (sf.mode === 'text' && sf.textValue) {
        const prefix = sf.inverse ? 'not ' : '';
        parts.push(`${prefix}session ${sf.textOperator}: "${sf.textValue.slice(0, 15)}..."`);
    }

    // Levels
    if (f.levels.length > 0) {
        const levelNames = ['Debug', 'Verbose', 'Info', 'Warning', 'Error', 'Fatal'];
        const prefix = f.levelsInverse ? 'not ' : '';
        parts.push(`${prefix}level: ${f.levels.map(l => levelNames[l] || l).slice(0, 2).join(', ')}${f.levels.length > 2 ? '...' : ''}`);
    }

    // Title filter
    if (f.titleFilter.value) {
        const prefix = f.titleFilter.inverse ? 'not ' : '';
        parts.push(`${prefix}title ${f.titleFilter.operator}: "${f.titleFilter.value.slice(0, 15)}..."`);
    }

    // App name filter
    const af = f.appNameFilter;
    if (af.mode === 'list' && af.values.length > 0) {
        const prefix = af.inverse ? 'not ' : '';
        parts.push(`${prefix}app: ${af.values[0]}${af.values.length > 1 ? '...' : ''}`);
    } else if (af.mode === 'text' && af.textValue) {
        const prefix = af.inverse ? 'not ' : '';
        parts.push(`${prefix}app ${af.textOperator}: "${af.textValue.slice(0, 15)}..."`);
    }

    // Host name filter
    const hf = f.hostNameFilter;
    if (hf.mode === 'list' && hf.values.length > 0) {
        const prefix = hf.inverse ? 'not ' : '';
        parts.push(`${prefix}host: ${hf.values[0]}${hf.values.length > 1 ? '...' : ''}`);
    } else if (hf.mode === 'text' && hf.textValue) {
        const prefix = hf.inverse ? 'not ' : '';
        parts.push(`${prefix}host ${hf.textOperator}: "${hf.textValue.slice(0, 15)}..."`);
    }

    return parts.length > 0 ? parts.join(' & ') : 'No conditions (matches all)';
}

const defaultFilter: Filter = {
    sessions: [],
    levels: [],
    titlePattern: '',
    messagePattern: '',
    inverseMatch: false,
    from: null,
    to: null,
    appNames: [],
    hostNames: [],
    entryTypes: []
};

// Searchable multi-select dropdown component
interface MultiSelectDropdownProps {
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
}

function MultiSelectDropdown({ options, selected, onChange, placeholder = 'Select...' }: MultiSelectDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt =>
        opt.toLowerCase().includes(search.toLowerCase())
    );

    const toggleOption = (option: string) => {
        if (selected.includes(option)) {
            onChange(selected.filter(s => s !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    const selectAll = () => onChange([...options]);
    const clearAll = () => onChange([]);

    return (
        <div ref={dropdownRef} className="relative">
            {/* Trigger button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-left bg-white dark:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none flex items-center justify-between"
            >
                <span className={selected.length === 0 ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}>
                    {selected.length === 0
                        ? placeholder
                        : selected.length === 1
                            ? selected[0]
                            : `${selected.length} sessions selected`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-64 overflow-hidden">
                    {/* Search input */}
                    <div className="p-2 border-b border-slate-100 dark:border-slate-600">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search sessions..."
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-600 dark:text-slate-100"
                            autoFocus
                        />
                    </div>

                    {/* Quick actions */}
                    <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-600 flex gap-2">
                        <button
                            type="button"
                            onClick={selectAll}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                            Select All
                        </button>
                        <button
                            type="button"
                            onClick={clearAll}
                            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                            Clear
                        </button>
                        <span className="text-xs text-slate-400 ml-auto">
                            {options.length} total
                        </span>
                    </div>

                    {/* Options list */}
                    <div className="overflow-auto max-h-40">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-slate-400">
                                {options.length === 0 ? 'No sessions available' : 'No matches found'}
                            </div>
                        ) : (
                            filteredOptions.map(option => (
                                <label
                                    key={option}
                                    className="flex items-center px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(option)}
                                        onChange={() => toggleOption(option)}
                                        className="rounded border-slate-300 dark:border-slate-500 text-blue-500 focus:ring-blue-500 mr-2"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{option}</span>
                                </label>
                            ))
                        )}
                    </div>

                    {/* Selected tags */}
                    {selected.length > 0 && (
                        <div className="px-2 py-1.5 border-t border-slate-100 dark:border-slate-600 flex flex-wrap gap-1 max-h-20 overflow-auto">
                            {selected.map(s => (
                                <span
                                    key={s}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs rounded"
                                >
                                    {s}
                                    <button
                                        type="button"
                                        onClick={() => toggleOption(s)}
                                        className="hover:text-blue-900 dark:hover:text-blue-100"
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
            )}
        </div>
    );
}

interface ViewEditorProps {
    view?: View;
    onSave: (view: Omit<View, 'id'>) => void;
    onCancel: () => void;
}

function ViewEditor({ view, onSave, onCancel }: ViewEditorProps) {
    const { sessions, appNames, hostNames, globalHighlightRules, views } = useLogStore();
    const [name, setName] = useState(view?.name || generateViewName(views));
    const [filterSessions, setFilterSessions] = useState<string[]>(view?.filter.sessions || []);
    const [filterLevels, setFilterLevels] = useState<number[]>(view?.filter.levels || []);
    const [titlePattern, setTitlePattern] = useState(view?.filter.titlePattern || '');
    const [messagePattern, setMessagePattern] = useState(view?.filter.messagePattern || '');
    const [inverseMatch, setInverseMatch] = useState(view?.filter.inverseMatch || false);
    const [useGlobalHighlights, setUseGlobalHighlights] = useState(view?.useGlobalHighlights ?? true);
    const [highlightRules, setHighlightRules] = useState(view?.highlightRules || []);
    const [activeTab, setActiveTab] = useState<'filters' | 'highlights'>('filters');
    const [showHighlightEditor, setShowHighlightEditor] = useState(false);
    const [editingHighlightRule, setEditingHighlightRule] = useState<HighlightRule | undefined>(undefined);

    const handleSave = () => {
        onSave({
            name,
            filter: {
                ...defaultFilter,
                sessions: filterSessions,
                levels: filterLevels,
                titlePattern,
                messagePattern,
                inverseMatch
            },
            highlightRules,
            useGlobalHighlights,
            autoScroll: view?.autoScroll ?? true
        });
    };

    const handleAddHighlightRule = () => {
        setEditingHighlightRule(undefined);
        setShowHighlightEditor(true);
    };

    const handleEditHighlightRule = (rule: HighlightRule) => {
        setEditingHighlightRule(rule);
        setShowHighlightEditor(true);
    };

    const handleSaveHighlightRule = (ruleData: Omit<HighlightRule, 'id'>) => {
        if (editingHighlightRule) {
            setHighlightRules(highlightRules.map(r =>
                r.id === editingHighlightRule.id ? { ...ruleData, id: editingHighlightRule.id } : r
            ));
        } else {
            const newRule: HighlightRule = {
                ...ruleData,
                id: Math.random().toString(36).substring(2, 9)
            };
            setHighlightRules([...highlightRules, newRule]);
        }
        setShowHighlightEditor(false);
        setEditingHighlightRule(undefined);
    };

    const handleDeleteHighlightRule = (id: string) => {
        if (confirm('Delete this highlight rule?')) {
            setHighlightRules(highlightRules.filter(r => r.id !== id));
        }
    };

    const handleToggleHighlightRule = (rule: HighlightRule) => {
        setHighlightRules(highlightRules.map(r =>
            r.id === rule.id ? { ...r, enabled: !r.enabled } : r
        ));
    };

    const toggleLevel = (level: number) => {
        setFilterLevels(prev =>
            prev.includes(level)
                ? prev.filter(l => l !== level)
                : [...prev, level]
        );
    };

    const sessionNames = Object.keys(sessions);
    const appNameList = Object.keys(appNames);
    const hostNameList = Object.keys(hostNames);
    const levels = [
        { level: Level.Debug, name: 'Debug' },
        { level: Level.Verbose, name: 'Verbose' },
        { level: Level.Message, name: 'Info' },
        { level: Level.Warning, name: 'Warning' },
        { level: Level.Error, name: 'Error' },
        { level: Level.Fatal, name: 'Fatal' }
    ];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[600px] h-[600px] flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex-shrink-0">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                        {view ? 'Edit View' : 'Create New View'}
                    </h3>
                </div>

                {/* Name field */}
                <div className="px-4 pt-4 flex-shrink-0">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                        View Name
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                        placeholder="Enter view name..."
                    />
                </div>

                {/* Tab bar */}
                <div className="flex border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('filters')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'filters'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        Filters
                    </button>
                    <button
                        onClick={() => setActiveTab('highlights')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'highlights'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                        </svg>
                        Highlights
                        {highlightRules.length > 0 && (
                            <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                                {highlightRules.length}
                            </span>
                        )}
                    </button>
                </div>

                <div className="p-4 overflow-auto flex-1 min-h-0">
                    {activeTab === 'filters' ? (
                        <>
                            {/* Session Filter - Searchable Multi-Select */}
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Filter by Sessions
                                </label>
                                <MultiSelectDropdown
                                    options={sessionNames}
                                    selected={filterSessions}
                                    onChange={setFilterSessions}
                                    placeholder="All sessions (none selected)"
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    {filterSessions.length === 0
                                        ? 'All sessions shown when none selected'
                                        : `Showing ${filterSessions.length} of ${sessionNames.length} sessions`}
                                </p>
                            </div>

                            {/* Level Filter */}
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Filter by Levels
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {levels.map(({ level, name }) => (
                                        <button
                                            key={level}
                                            onClick={() => toggleLevel(level)}
                                            className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                                                filterLevels.includes(level)
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                            }`}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>
                                {filterLevels.length === 0 && (
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">All levels shown when none selected</p>
                                )}
                            </div>

                            {/* Title Pattern */}
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Title Pattern (regex)
                                </label>
                                <input
                                    type="text"
                                    value={titlePattern}
                                    onChange={(e) => setTitlePattern(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                    placeholder="e.g., ^Error.*"
                                />
                            </div>

                            {/* Message Pattern */}
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Message Pattern (regex)
                                </label>
                                <input
                                    type="text"
                                    value={messagePattern}
                                    onChange={(e) => setMessagePattern(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                    placeholder="e.g., database|connection"
                                />
                            </div>

                            {/* Inverse Match */}
                            <div className="mb-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={inverseMatch}
                                        onChange={(e) => setInverseMatch(e.target.checked)}
                                        className="rounded border-slate-300 dark:border-slate-500 text-blue-500 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-200">Inverse match (exclude matching entries)</span>
                                </label>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Use Global Highlights */}
                            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={useGlobalHighlights}
                                        onChange={(e) => setUseGlobalHighlights(e.target.checked)}
                                        className="rounded border-slate-300 dark:border-slate-500 text-blue-500 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-200">
                                        Also apply global highlight rules
                                        {globalHighlightRules.length > 0 && (
                                            <span className="text-xs text-slate-400 ml-1">
                                                ({globalHighlightRules.length} global rules)
                                            </span>
                                        )}
                                    </span>
                                </label>
                            </div>

                            {/* View-specific highlight rules */}
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                                        View Highlight Rules
                                    </label>
                                    <button
                                        onClick={handleAddHighlightRule}
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Rule
                                    </button>
                                </div>

                                {highlightRules.length === 0 ? (
                                    <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">
                                        No view-specific highlight rules.
                                        <br />
                                        <span className="text-xs">Click "Add Rule" to create one.</span>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {highlightRules.map((rule) => (
                                            <div
                                                key={rule.id}
                                                className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-colors"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={rule.enabled}
                                                    onChange={() => handleToggleHighlightRule(rule)}
                                                    className="rounded border-slate-300 dark:border-slate-500 text-blue-500 focus:ring-blue-500"
                                                />
                                                <div
                                                    className="w-6 h-6 rounded border dark:border-slate-500 flex-shrink-0"
                                                    style={{ backgroundColor: rule.style.backgroundColor }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm text-slate-800 dark:text-slate-200">{rule.name}</div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                        {getFilterSummary(rule)}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleEditHighlightRule(rule)}
                                                    className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors"
                                                    title="Edit rule"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteHighlightRule(rule.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                                                    title="Delete rule"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Highlight Rule Editor Modal */}
                            {showHighlightEditor && (
                                <HighlightRuleEditor
                                    rule={editingHighlightRule}
                                    onSave={handleSaveHighlightRule}
                                    onCancel={() => {
                                        setShowHighlightEditor(false);
                                        setEditingHighlightRule(undefined);
                                    }}
                                    availableSessions={sessionNames}
                                    availableAppNames={appNameList}
                                    availableHostNames={hostNameList}
                                />
                            )}
                        </>
                    )}
                </div>

                <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex justify-end gap-2 flex-shrink-0">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors"
                    >
                        {view ? 'Save Changes' : 'Create View'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Generate unique view name
function generateViewName(views: View[]): string {
    const existingNumbers = views
        .map(v => {
            const match = v.name.match(/^View (\d+)$/);
            return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);

    let num = 1;
    while (existingNumbers.includes(num)) {
        num++;
    }
    return `View ${num}`;
}

export function ViewTabs() {
    const { views, activeViewId, setActiveView, addView, updateView, deleteView, isStreamsMode, setStreamsMode, editingViewId, setEditingViewId } = useLogStore();
    const [showEditor, setShowEditor] = useState(false);
    const [editingView, setEditingView] = useState<View | undefined>(undefined);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Check scroll state
    const updateScrollState = useCallback(() => {
        const container = scrollContainerRef.current;
        if (container) {
            setCanScrollLeft(container.scrollLeft > 0);
            setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
        }
    }, []);

    // Update scroll state on mount and when views change
    useEffect(() => {
        updateScrollState();
        window.addEventListener('resize', updateScrollState);
        return () => window.removeEventListener('resize', updateScrollState);
    }, [views, updateScrollState]);

    // Handle wheel scroll on tab bar
    const handleWheel = useCallback((e: React.WheelEvent) => {
        const container = scrollContainerRef.current;
        if (container) {
            e.preventDefault();
            container.scrollLeft += e.deltaY;
            updateScrollState();
        }
    }, [updateScrollState]);

    // Scroll left/right buttons
    const scrollTabs = useCallback((direction: 'left' | 'right') => {
        const container = scrollContainerRef.current;
        if (container) {
            const scrollAmount = 150;
            container.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
            setTimeout(updateScrollState, 300);
        }
    }, [updateScrollState]);

    // Watch for external editingViewId changes (e.g., from FilterBar button)
    useEffect(() => {
        if (editingViewId) {
            const view = views.find(v => v.id === editingViewId);
            if (view) {
                setEditingView(view);
                setShowEditor(true);
            }
            // Clear the editingViewId after handling
            setEditingViewId(null);
        }
    }, [editingViewId, views, setEditingViewId]);

    const handleAddView = () => {
        setEditingView(undefined);
        setShowEditor(true);
    };

    const handleEditView = useCallback((view: View) => {
        setEditingView(view);
        setShowEditor(true);
    }, []);

    const handleSaveView = (viewData: Omit<View, 'id'>) => {
        if (editingView) {
            updateView(editingView.id, viewData);
        } else {
            addView(viewData);
        }
        setShowEditor(false);
        setEditingView(undefined);
    };

    const handleDeleteView = (e: React.MouseEvent, viewId: string) => {
        e.stopPropagation();
        if (viewId === 'all') return; // Can't delete default view
        if (confirm('Delete this view?')) {
            deleteView(viewId);
        }
    };

    const handleStreamsClick = () => {
        setStreamsMode(true);
    };

    const handleViewClick = (viewId: string) => {
        setStreamsMode(false);
        setActiveView(viewId);
    };

    return (
        <>
            <div className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center relative">
                {/* Left scroll indicator */}
                {canScrollLeft && (
                    <button
                        onClick={() => scrollTabs('left')}
                        className="absolute left-0 z-10 h-full px-1 bg-gradient-to-r from-slate-100 dark:from-slate-800 via-slate-100 dark:via-slate-800 to-transparent flex items-center"
                        title="Scroll left"
                    >
                        <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                )}

                {/* Scrollable tabs container */}
                <div
                    ref={scrollContainerRef}
                    onWheel={handleWheel}
                    onScroll={updateScrollState}
                    className="flex items-center gap-1 px-2 py-1 overflow-x-auto scrollbar-hide"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {/* Streams tab - pinned first, different styling */}
                    <div
                        onClick={handleStreamsClick}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg cursor-pointer transition-colors ${
                            isStreamsMode
                                ? 'bg-gradient-to-b from-purple-500 to-purple-600 text-white border-t border-l border-r border-purple-400 -mb-px shadow-sm'
                                : 'bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                        }`}
                    >
                        <svg className={`w-4 h-4 ${isStreamsMode ? 'text-purple-200' : 'text-purple-500 dark:text-purple-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className={`text-sm font-medium whitespace-nowrap ${isStreamsMode ? 'text-white' : 'text-purple-700 dark:text-purple-300'}`}>
                            Streams
                        </span>
                    </div>

                    {/* Separator */}
                    <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1 flex-shrink-0" />

                    {/* Regular view tabs */}
                    {views.map(view => (
                        <div
                            key={view.id}
                            onClick={() => handleViewClick(view.id)}
                            onDoubleClick={() => handleEditView(view)}
                            className={`flex-shrink-0 group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg cursor-pointer transition-colors ${
                                !isStreamsMode && activeViewId === view.id
                                    ? 'bg-white dark:bg-slate-700 border-t border-l border-r border-slate-200 dark:border-slate-600 -mb-px'
                                    : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                            title={view.name}
                        >
                            <span className={`text-sm whitespace-nowrap ${!isStreamsMode && activeViewId === view.id ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400'}`}>
                                {view.name}
                            </span>
                            {view.filter.sessions.length > 0 && (
                                <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                                    {view.filter.sessions.length}
                                </span>
                            )}
                            {view.id !== 'all' && (
                                <button
                                    onClick={(e) => handleDeleteView(e, view.id)}
                                    className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                    title="Close tab"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    ))}

                    {/* Add View Button */}
                    <button
                        onClick={handleAddView}
                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        title="Create new view"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>

                {/* Right scroll indicator */}
                {canScrollRight && (
                    <button
                        onClick={() => scrollTabs('right')}
                        className="absolute right-0 z-10 h-full px-1 bg-gradient-to-l from-slate-100 dark:from-slate-800 via-slate-100 dark:via-slate-800 to-transparent flex items-center"
                        title="Scroll right"
                    >
                        <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                )}
            </div>

            {showEditor && (
                <ViewEditor
                    view={editingView}
                    onSave={handleSaveView}
                    onCancel={() => {
                        setShowEditor(false);
                        setEditingView(undefined);
                    }}
                />
            )}
        </>
    );
}
