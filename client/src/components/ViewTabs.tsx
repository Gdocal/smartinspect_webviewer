/**
 * ViewTabs - Tab bar for switching between predefined views
 * With searchable multi-select dropdown for sessions
 */

import { useState, useRef, useEffect } from 'react';
import { useLogStore, View, Filter, Level, HighlightRule } from '../store/logStore';

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
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-left bg-white hover:border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none flex items-center justify-between"
            >
                <span className={selected.length === 0 ? 'text-slate-400' : 'text-slate-700'}>
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
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
                    {/* Search input */}
                    <div className="p-2 border-b border-slate-100">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search sessions..."
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            autoFocus
                        />
                    </div>

                    {/* Quick actions */}
                    <div className="px-2 py-1.5 border-b border-slate-100 flex gap-2">
                        <button
                            type="button"
                            onClick={selectAll}
                            className="text-xs text-blue-600 hover:text-blue-700"
                        >
                            Select All
                        </button>
                        <button
                            type="button"
                            onClick={clearAll}
                            className="text-xs text-slate-500 hover:text-slate-700"
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
                                    className="flex items-center px-3 py-1.5 hover:bg-slate-50 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(option)}
                                        onChange={() => toggleOption(option)}
                                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500 mr-2"
                                    />
                                    <span className="text-sm text-slate-700 truncate">{option}</span>
                                </label>
                            ))
                        )}
                    </div>

                    {/* Selected tags */}
                    {selected.length > 0 && (
                        <div className="px-2 py-1.5 border-t border-slate-100 flex flex-wrap gap-1 max-h-20 overflow-auto">
                            {selected.map(s => (
                                <span
                                    key={s}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded"
                                >
                                    {s}
                                    <button
                                        type="button"
                                        onClick={() => toggleOption(s)}
                                        className="hover:text-blue-900"
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
    const { sessions, globalHighlightRules } = useLogStore();
    const [name, setName] = useState(view?.name || 'New View');
    const [filterSessions, setFilterSessions] = useState<string[]>(view?.filter.sessions || []);
    const [filterLevels, setFilterLevels] = useState<number[]>(view?.filter.levels || []);
    const [titlePattern, setTitlePattern] = useState(view?.filter.titlePattern || '');
    const [messagePattern, setMessagePattern] = useState(view?.filter.messagePattern || '');
    const [inverseMatch, setInverseMatch] = useState(view?.filter.inverseMatch || false);
    const [useGlobalHighlights, setUseGlobalHighlights] = useState(view?.useGlobalHighlights ?? true);
    const [highlightRules, setHighlightRules] = useState(view?.highlightRules || []);
    const [activeTab, setActiveTab] = useState<'filters' | 'highlights'>('filters');

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

    const addHighlightRule = () => {
        const newRule: HighlightRule = {
            id: Math.random().toString(36).substring(2, 9),
            name: 'New Rule',
            enabled: true,
            priority: highlightRules.length,
            conditions: [{ field: 'level', operator: 'equals', value: Level.Error }],
            style: { backgroundColor: '#fee2e2', textColor: '#dc2626' }
        };
        setHighlightRules([...highlightRules, newRule]);
    };

    const removeHighlightRule = (id: string) => {
        setHighlightRules(highlightRules.filter(r => r.id !== id));
    };

    const updateHighlightRule = (id: string, updates: Partial<HighlightRule>) => {
        setHighlightRules(highlightRules.map(r => r.id === id ? { ...r, ...updates } : r));
    };

    const toggleLevel = (level: number) => {
        setFilterLevels(prev =>
            prev.includes(level)
                ? prev.filter(l => l !== level)
                : [...prev, level]
        );
    };

    const sessionNames = Object.keys(sessions);
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
            <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[85vh] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-semibold text-slate-800">
                        {view ? 'Edit View' : 'Create New View'}
                    </h3>
                </div>

                {/* Name field */}
                <div className="px-4 pt-4">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                        View Name
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Enter view name..."
                    />
                </div>

                {/* Tab bar */}
                <div className="px-4 pt-4 border-b border-slate-200">
                    <div className="flex gap-1">
                        <button
                            onClick={() => setActiveTab('filters')}
                            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                                activeTab === 'filters'
                                    ? 'bg-white border-t border-l border-r border-slate-200 -mb-px text-blue-600'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Filters
                        </button>
                        <button
                            onClick={() => setActiveTab('highlights')}
                            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-1.5 ${
                                activeTab === 'highlights'
                                    ? 'bg-white border-t border-l border-r border-slate-200 -mb-px text-blue-600'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Highlights
                            {highlightRules.length > 0 && (
                                <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded">
                                    {highlightRules.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                <div className="p-4 overflow-auto max-h-[50vh]">
                    {activeTab === 'filters' ? (
                        <>
                            {/* Session Filter - Searchable Multi-Select */}
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                                    Filter by Sessions
                                </label>
                                <MultiSelectDropdown
                                    options={sessionNames}
                                    selected={filterSessions}
                                    onChange={setFilterSessions}
                                    placeholder="All sessions (none selected)"
                                />
                                <p className="text-xs text-slate-400 mt-1">
                                    {filterSessions.length === 0
                                        ? 'All sessions shown when none selected'
                                        : `Showing ${filterSessions.length} of ${sessionNames.length} sessions`}
                                </p>
                            </div>

                            {/* Level Filter */}
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
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
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>
                                {filterLevels.length === 0 && (
                                    <p className="text-xs text-slate-400 mt-1">All levels shown when none selected</p>
                                )}
                            </div>

                            {/* Title Pattern */}
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                                    Title Pattern (regex)
                                </label>
                                <input
                                    type="text"
                                    value={titlePattern}
                                    onChange={(e) => setTitlePattern(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="e.g., ^Error.*"
                                />
                            </div>

                            {/* Message Pattern */}
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                                    Message Pattern (regex)
                                </label>
                                <input
                                    type="text"
                                    value={messagePattern}
                                    onChange={(e) => setMessagePattern(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-slate-700">Inverse match (exclude matching entries)</span>
                                </label>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Use Global Highlights */}
                            <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={useGlobalHighlights}
                                        onChange={(e) => setUseGlobalHighlights(e.target.checked)}
                                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-slate-700">
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
                                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                        View Highlight Rules
                                    </label>
                                    <button
                                        onClick={addHighlightRule}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Rule
                                    </button>
                                </div>

                                {highlightRules.length === 0 ? (
                                    <div className="text-center py-6 text-slate-400 text-sm">
                                        No view-specific highlight rules.
                                        <br />
                                        <span className="text-xs">Click "Add Rule" to create one.</span>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {highlightRules.map((rule) => (
                                            <div
                                                key={rule.id}
                                                className="border border-slate-200 rounded-lg p-3 bg-white"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <input
                                                        type="text"
                                                        value={rule.name}
                                                        onChange={(e) => updateHighlightRule(rule.id, { name: e.target.value })}
                                                        className="text-sm font-medium text-slate-700 border-0 bg-transparent focus:ring-0 p-0"
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        <label className="flex items-center gap-1 text-xs text-slate-500">
                                                            <input
                                                                type="checkbox"
                                                                checked={rule.enabled}
                                                                onChange={(e) => updateHighlightRule(rule.id, { enabled: e.target.checked })}
                                                                className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                                                            />
                                                            Enabled
                                                        </label>
                                                        <button
                                                            onClick={() => removeHighlightRule(rule.id)}
                                                            className="text-slate-400 hover:text-red-500"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="text-slate-500">Match:</span>
                                                    <select
                                                        value={rule.conditions[0]?.field || 'level'}
                                                        onChange={(e) => updateHighlightRule(rule.id, {
                                                            conditions: [{ ...rule.conditions[0], field: e.target.value as 'level' | 'sessionName' | 'appName' | 'title' | 'logEntryType' }]
                                                        })}
                                                        className="border border-slate-200 rounded px-2 py-1"
                                                    >
                                                        <option value="level">Level</option>
                                                        <option value="sessionName">Session</option>
                                                        <option value="appName">App Name</option>
                                                        <option value="title">Title</option>
                                                        <option value="logEntryType">Entry Type</option>
                                                    </select>
                                                    <select
                                                        value={rule.conditions[0]?.operator || 'equals'}
                                                        onChange={(e) => updateHighlightRule(rule.id, {
                                                            conditions: [{ ...rule.conditions[0], operator: e.target.value as 'equals' | 'contains' | 'regex' }]
                                                        })}
                                                        className="border border-slate-200 rounded px-2 py-1"
                                                    >
                                                        <option value="equals">equals</option>
                                                        <option value="contains">contains</option>
                                                        <option value="regex">regex</option>
                                                    </select>
                                                    {rule.conditions[0]?.field === 'level' ? (
                                                        <select
                                                            value={String(rule.conditions[0]?.value || Level.Error)}
                                                            onChange={(e) => updateHighlightRule(rule.id, {
                                                                conditions: [{ ...rule.conditions[0], value: Number(e.target.value) }]
                                                            })}
                                                            className="border border-slate-200 rounded px-2 py-1"
                                                        >
                                                            <option value={Level.Debug}>Debug</option>
                                                            <option value={Level.Verbose}>Verbose</option>
                                                            <option value={Level.Message}>Info</option>
                                                            <option value={Level.Warning}>Warning</option>
                                                            <option value={Level.Error}>Error</option>
                                                            <option value={Level.Fatal}>Fatal</option>
                                                        </select>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            value={String(rule.conditions[0]?.value || '')}
                                                            onChange={(e) => updateHighlightRule(rule.id, {
                                                                conditions: [{ ...rule.conditions[0], value: e.target.value }]
                                                            })}
                                                            className="border border-slate-200 rounded px-2 py-1 flex-1"
                                                            placeholder="Value..."
                                                        />
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-2 text-xs">
                                                    <span className="text-slate-500">Style:</span>
                                                    <label className="flex items-center gap-1">
                                                        <span>BG:</span>
                                                        <input
                                                            type="color"
                                                            value={rule.style.backgroundColor || '#ffffff'}
                                                            onChange={(e) => updateHighlightRule(rule.id, {
                                                                style: { ...rule.style, backgroundColor: e.target.value }
                                                            })}
                                                            className="w-6 h-6 rounded cursor-pointer"
                                                        />
                                                    </label>
                                                    <label className="flex items-center gap-1">
                                                        <span>Text:</span>
                                                        <input
                                                            type="color"
                                                            value={rule.style.textColor || '#000000'}
                                                            onChange={(e) => updateHighlightRule(rule.id, {
                                                                style: { ...rule.style, textColor: e.target.value }
                                                            })}
                                                            className="w-6 h-6 rounded cursor-pointer"
                                                        />
                                                    </label>
                                                    <div
                                                        className="ml-2 px-2 py-0.5 rounded text-xs"
                                                        style={{
                                                            backgroundColor: rule.style.backgroundColor,
                                                            color: rule.style.textColor
                                                        }}
                                                    >
                                                        Preview
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
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

export function ViewTabs() {
    const { views, activeViewId, setActiveView, addView, updateView, deleteView, isStreamsMode, setStreamsMode } = useLogStore();
    const [showEditor, setShowEditor] = useState(false);
    const [editingView, setEditingView] = useState<View | undefined>(undefined);

    const handleAddView = () => {
        setEditingView(undefined);
        setShowEditor(true);
    };

    const handleEditView = (view: View) => {
        setEditingView(view);
        setShowEditor(true);
    };

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
            <div className="bg-slate-100 border-b border-slate-200 px-2 py-1 flex items-center gap-1 overflow-x-auto">
                {/* Streams tab - pinned first, different styling */}
                <div
                    onClick={handleStreamsClick}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg cursor-pointer transition-colors ${
                        isStreamsMode
                            ? 'bg-gradient-to-b from-purple-500 to-purple-600 text-white border-t border-l border-r border-purple-400 -mb-px shadow-sm'
                            : 'bg-purple-100 hover:bg-purple-200 text-purple-700'
                    }`}
                >
                    <svg className={`w-4 h-4 ${isStreamsMode ? 'text-purple-200' : 'text-purple-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className={`text-sm font-medium ${isStreamsMode ? 'text-white' : 'text-purple-700'}`}>
                        Streams
                    </span>
                </div>

                {/* Separator */}
                <div className="w-px h-5 bg-slate-300 mx-1" />

                {/* Regular view tabs */}
                {views.map(view => (
                    <div
                        key={view.id}
                        onClick={() => handleViewClick(view.id)}
                        onDoubleClick={() => handleEditView(view)}
                        className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg cursor-pointer transition-colors ${
                            !isStreamsMode && activeViewId === view.id
                                ? 'bg-white border-t border-l border-r border-slate-200 -mb-px'
                                : 'hover:bg-slate-200'
                        }`}
                        title={view.name}
                    >
                        <span className={`text-sm ${!isStreamsMode && activeViewId === view.id ? 'font-medium text-slate-800' : 'text-slate-600'}`}>
                            {view.name}
                        </span>
                        {view.filter.sessions.length > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                                {view.filter.sessions.length}
                            </span>
                        )}
                        {view.highlightRules.length > 0 && (
                            <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded" title="Has highlight rules">
                                {view.highlightRules.length}
                            </span>
                        )}
                        {view.id !== 'all' && (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleEditView(view); }}
                                    className="text-slate-400 hover:text-blue-500 transition-colors"
                                    title="Edit view settings"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={(e) => handleDeleteView(e, view.id)}
                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                    title="Close tab"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </>
                        )}
                    </div>
                ))}

                {/* Add View Button */}
                <button
                    onClick={handleAddView}
                    className="flex items-center gap-1 px-2 py-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                    title="Create new view"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-xs font-medium">New View</span>
                </button>
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
