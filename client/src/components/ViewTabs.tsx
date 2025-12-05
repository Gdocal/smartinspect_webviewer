/**
 * ViewTabs - Tab bar for switching between predefined views
 * Uses the same filter components as HighlightRuleEditor for consistency
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLogStore, View, Filter, HighlightRule, ListTextFilter, TextFilter, defaultListTextFilter, VlgColumnConfig } from '../store/logStore';
import { useProjectPersistence } from '../hooks/useProjectPersistence';
import { HighlightRuleEditor, Checkbox, ListTextFilterInput, LevelSelect, TextFilterInput, EntryTypeSelect } from './HighlightRuleEditor';
import { ViewGrid } from './ViewGrid';
import { ContextMenu, ContextMenuItem, useContextMenu } from './ContextMenu';
import { ConfirmDialog, useConfirmDialog } from './ConfirmDialog';

// Tab header color palette - darker, muted colors for better text contrast
const tabColorPalette = [
    { name: 'Rose', color: '#be185d' },      // pink-700
    { name: 'Orange', color: '#c2410c' },    // orange-700
    { name: 'Amber', color: '#b45309' },     // amber-700
    { name: 'Green', color: '#15803d' },     // green-700
    { name: 'Teal', color: '#0f766e' },      // teal-700
    { name: 'Blue', color: '#1d4ed8' },      // blue-700
    { name: 'Violet', color: '#6d28d9' },    // violet-700
    { name: 'Slate', color: '#475569' }      // slate-600
];

// Checkbox is imported from HighlightRuleEditor

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

interface ViewEditorProps {
    view?: View;
    onSave: (view: Omit<View, 'id'>) => void;
    onCancel: () => void;
}

function ViewEditor({ view, onSave, onCancel }: ViewEditorProps) {
    const { sessions, appNames, hostNames, globalHighlightRules, views } = useLogStore();
    const [name, setName] = useState(view?.name || generateViewName(views));
    const [tabColor, setTabColor] = useState(view?.tabColor || '');
    const [alternatingRows, setAlternatingRows] = useState(view?.alternatingRows ?? false);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const confirmDialog = useConfirmDialog();

    // Session filter state using ListTextFilter (same as HighlightRuleEditor)
    const [sessionFilter, setSessionFilter] = useState<ListTextFilter>(() => {
        // Use extended sessionFilter if available
        if (view?.filter.sessionFilter) {
            return { ...view.filter.sessionFilter };
        }
        // Migrate old sessions array to new ListTextFilter format
        if (view?.filter.sessions && view.filter.sessions.length > 0) {
            return {
                ...defaultListTextFilter,
                mode: 'list',
                values: view.filter.sessions,
                inverse: false
            };
        }
        return { ...defaultListTextFilter };
    });

    // Level filter state
    const [filterLevels, setFilterLevels] = useState<number[]>(view?.filter.levels || []);
    const [levelsInverse, setLevelsInverse] = useState(view?.filter.levelsInverse || false);

    // Title filter using TextFilter (in Advanced section)
    const defaultTextFilter: TextFilter = { operator: 'contains', value: '', caseSensitive: false, inverse: false };
    const [titleFilter, setTitleFilter] = useState<TextFilter>(() => {
        // Use extended titleFilter if available
        if (view?.filter.titleFilter) {
            return { ...view.filter.titleFilter };
        }
        // Migrate old titlePattern to new TextFilter format
        if (view?.filter.titlePattern) {
            return {
                ...defaultTextFilter,
                operator: 'regex',
                value: view.filter.titlePattern,
                inverse: view.filter.inverseMatch || false
            };
        }
        return { ...defaultTextFilter };
    });

    // App Name filter using ListTextFilter
    const [appNameFilter, setAppNameFilter] = useState<ListTextFilter>(() => {
        // Use extended appNameFilter if available
        if (view?.filter.appNameFilter) {
            return { ...view.filter.appNameFilter };
        }
        // Migrate old appNames array to new ListTextFilter format
        if (view?.filter.appNames && view.filter.appNames.length > 0) {
            return {
                ...defaultListTextFilter,
                mode: 'list',
                values: view.filter.appNames,
                inverse: false
            };
        }
        return { ...defaultListTextFilter };
    });

    // Host Name filter using ListTextFilter
    const [hostNameFilter, setHostNameFilter] = useState<ListTextFilter>(() => {
        // Use extended hostNameFilter if available
        if (view?.filter.hostNameFilter) {
            return { ...view.filter.hostNameFilter };
        }
        // Migrate old hostNames array to new ListTextFilter format
        if (view?.filter.hostNames && view.filter.hostNames.length > 0) {
            return {
                ...defaultListTextFilter,
                mode: 'list',
                values: view.filter.hostNames,
                inverse: false
            };
        }
        return { ...defaultListTextFilter };
    });

    // Entry Types filter
    const [entryTypes, setEntryTypes] = useState<number[]>(view?.filter.entryTypes || []);
    const [entryTypesInverse, setEntryTypesInverse] = useState(view?.filter.entryTypesInverse || false);

    // Advanced filters expanded state
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [useGlobalHighlights, setUseGlobalHighlights] = useState(view?.useGlobalHighlights ?? true);
    const [highlightRules, setHighlightRules] = useState(view?.highlightRules || []);
    const [activeTab, setActiveTab] = useState<'general' | 'filters' | 'highlights'>('general');
    const [showHighlightEditor, setShowHighlightEditor] = useState(false);
    const [editingHighlightRule, setEditingHighlightRule] = useState<HighlightRule | undefined>(undefined);

    const handleSave = () => {
        // Convert session filter to legacy format for backwards compatibility
        const sessions = sessionFilter.mode === 'list' ? sessionFilter.values : [];
        // Convert app name filter to legacy format
        const appNamesArray = appNameFilter.mode === 'list' ? appNameFilter.values : [];
        // Convert host name filter to legacy format
        const hostNamesArray = hostNameFilter.mode === 'list' ? hostNameFilter.values : [];
        // For title filter, convert operator to regex pattern if needed
        let titlePattern = '';
        if (titleFilter.value) {
            if (titleFilter.operator === 'regex') {
                titlePattern = titleFilter.value;
            } else if (titleFilter.operator === 'contains') {
                titlePattern = titleFilter.value; // Will be used as contains pattern
            } else if (titleFilter.operator === 'equals') {
                titlePattern = `^${titleFilter.value}$`;
            }
        }

        onSave({
            name,
            tabColor: tabColor || undefined,
            filter: {
                ...defaultFilter,
                // Legacy format arrays (for backwards compatibility)
                sessions,
                levels: filterLevels,
                titlePattern,
                inverseMatch: titleFilter.inverse,
                appNames: appNamesArray,
                hostNames: hostNamesArray,
                entryTypes,
                // Extended filter format (full text mode support)
                sessionFilter: { ...sessionFilter },
                appNameFilter: { ...appNameFilter },
                hostNameFilter: { ...hostNameFilter },
                titleFilter: { ...titleFilter },
                levelsInverse,
                entryTypesInverse
            },
            highlightRules,
            useGlobalHighlights,
            autoScroll: view?.autoScroll ?? true,
            alternatingRows
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

    const handleDeleteHighlightRule = async (id: string) => {
        const confirmed = await confirmDialog.confirm({
            title: 'Delete Highlight Rule',
            message: 'Are you sure you want to delete this highlight rule?',
            confirmText: 'OK',
            cancelText: 'Cancel',
            danger: true
        });
        if (confirmed) {
            setHighlightRules(highlightRules.filter(r => r.id !== id));
        }
    };

    const handleToggleHighlightRule = (rule: HighlightRule) => {
        setHighlightRules(highlightRules.map(r =>
            r.id === rule.id ? { ...r, enabled: !r.enabled } : r
        ));
    };

    const sessionNames = Object.keys(sessions);
    const appNameList = Object.keys(appNames);
    const hostNameList = Object.keys(hostNames);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[600px] h-[600px] flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex-shrink-0">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                        {view ? 'Edit View' : 'Create New View'}
                    </h3>
                </div>

                {/* Tab bar */}
                <div className="flex border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'general'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        General
                    </button>
                    <button
                        onClick={() => setActiveTab('filters')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'filters'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
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
                    {activeTab === 'general' ? (
                        <div className="space-y-4">
                            {/* View Name */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    View Name
                                </label>
                                <input
                                    ref={nameInputRef}
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                    placeholder="Enter view name..."
                                    autoFocus={!view}
                                />
                            </div>

                            {/* Appearance Section */}
                            <div className="pt-2">
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">
                                    Appearance
                                </label>
                                <div className="space-y-2">
                                    {/* Tab Header Color */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm text-slate-700 dark:text-slate-200">Tab header color</span>
                                            {tabColor && (
                                                <button
                                                    type="button"
                                                    onClick={() => setTabColor('')}
                                                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {/* None option */}
                                            <button
                                                type="button"
                                                onClick={() => setTabColor('')}
                                                className={`w-7 h-7 rounded border-2 flex items-center justify-center transition-all ${
                                                    !tabColor
                                                        ? 'border-blue-500 ring-2 ring-blue-500/30'
                                                        : 'border-slate-300 dark:border-slate-500 hover:border-slate-400 dark:hover:border-slate-400'
                                                }`}
                                                title="No color"
                                            >
                                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                            {/* Color palette */}
                                            {tabColorPalette.map((c) => (
                                                <button
                                                    key={c.name}
                                                    type="button"
                                                    onClick={() => setTabColor(c.color)}
                                                    className={`w-7 h-7 rounded border-2 transition-all ${
                                                        tabColor === c.color
                                                            ? 'border-blue-500 ring-2 ring-blue-500/30'
                                                            : 'border-slate-300 dark:border-slate-500 hover:border-slate-400 dark:hover:border-slate-400'
                                                    }`}
                                                    style={{ backgroundColor: c.color }}
                                                    title={c.name}
                                                />
                                            ))}
                                            {/* Custom color picker */}
                                            <div
                                                className={`w-7 h-7 rounded border-2 flex items-center justify-center transition-all relative overflow-hidden cursor-pointer ${
                                                    tabColor && !tabColorPalette.some(c => c.color === tabColor)
                                                        ? 'border-blue-500 ring-2 ring-blue-500/30'
                                                        : 'border-slate-300 dark:border-slate-500 hover:border-slate-400 dark:hover:border-slate-400'
                                                }`}
                                                style={tabColor && !tabColorPalette.some(c => c.color === tabColor) ? { backgroundColor: tabColor } : { background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                                                title="Custom color"
                                            >
                                                <input
                                                    type="color"
                                                    value={tabColor || '#808080'}
                                                    onChange={(e) => setTabColor(e.target.value)}
                                                    className="absolute inset-0 w-[200%] h-[200%] cursor-pointer opacity-0"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Alternating Row Colors */}
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <Checkbox
                                            checked={alternatingRows}
                                            onChange={setAlternatingRows}
                                        />
                                        <span className="text-sm text-slate-700 dark:text-slate-200">
                                            Alternating row colors
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'filters' ? (
                        <>
                            {/* Session Filter - using shared component */}
                            <ListTextFilterInput
                                label="Sessions"
                                filter={sessionFilter}
                                onChange={setSessionFilter}
                                availableOptions={sessionNames}
                            />

                            {/* Level Filter - using shared component */}
                            <LevelSelect
                                selected={filterLevels}
                                onChange={setFilterLevels}
                                inverse={levelsInverse}
                                onInverseChange={setLevelsInverse}
                            />

                            {/* Advanced Filters Section */}
                            <div className="mt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    className="flex items-center gap-2 w-full text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                                >
                                    <svg
                                        className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                                    </svg>
                                    Advanced Filters
                                </button>

                                {showAdvanced && (
                                    <div className="mt-3">
                                        {/* Title Filter */}
                                        <TextFilterInput
                                            label="Title Pattern"
                                            filter={titleFilter}
                                            onChange={setTitleFilter}
                                        />

                                        {/* App Names Filter */}
                                        <ListTextFilterInput
                                            label="Application Names"
                                            filter={appNameFilter}
                                            onChange={setAppNameFilter}
                                            availableOptions={appNameList}
                                        />

                                        {/* Host Names Filter */}
                                        <ListTextFilterInput
                                            label="Host Names"
                                            filter={hostNameFilter}
                                            onChange={setHostNameFilter}
                                            availableOptions={hostNameList}
                                        />

                                        {/* Entry Types Filter */}
                                        <EntryTypeSelect
                                            selected={entryTypes}
                                            onChange={setEntryTypes}
                                            inverse={entryTypesInverse}
                                            onInverseChange={setEntryTypesInverse}
                                        />
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Use Global Highlights */}
                            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <Checkbox
                                        checked={useGlobalHighlights}
                                        onChange={setUseGlobalHighlights}
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
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Rule
                                    </button>
                                </div>

                                {highlightRules.length === 0 ? (
                                    <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-600 rounded-lg">
                                        <svg className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                        </svg>
                                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">No view-specific highlight rules</p>
                                        <p className="text-slate-400 dark:text-slate-500 text-xs">Click "Add Rule" to create one</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {highlightRules.map((rule) => (
                                            <div
                                                key={rule.id}
                                                className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-colors"
                                            >
                                                <Checkbox
                                                    checked={rule.enabled}
                                                    onChange={() => handleToggleHighlightRule(rule)}
                                                />
                                                <div
                                                    className="w-5 h-5 rounded border dark:border-slate-500 flex-shrink-0"
                                                    style={{ backgroundColor: rule.style.backgroundColor }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{rule.name}</div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                        {getFilterSummary(rule)}
                                                    </div>
                                                </div>
                                                <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">P{rule.priority}</span>
                                                <button
                                                    onClick={() => handleEditHighlightRule(rule)}
                                                    className="p-1 text-slate-400 hover:text-blue-500 transition-colors flex-shrink-0"
                                                    title="Edit rule"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteHighlightRule(rule.id)}
                                                    className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                                                    title="Delete rule"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

            {/* Confirm Dialog for ViewEditor */}
            {confirmDialog.dialogProps && (
                <ConfirmDialog
                    isOpen={confirmDialog.isOpen}
                    title={confirmDialog.dialogProps.title}
                    message={confirmDialog.dialogProps.message}
                    confirmText={confirmDialog.dialogProps.confirmText}
                    cancelText={confirmDialog.dialogProps.cancelText}
                    danger={confirmDialog.dialogProps.danger}
                    onConfirm={confirmDialog.handleConfirm}
                    onCancel={confirmDialog.handleCancel}
                />
            )}
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

// Density-based sizing configuration for tabs
const TAB_DENSITY_CONFIG = {
    compact: {
        containerPy: 'py-0.5',
        tabPx: 'px-2',
        tabPy: 'py-1',
        tabText: 'text-xs',
        iconSize: 'w-3 h-3',
        closeIconSize: 'w-3 h-3',
        gap: 'gap-1',
        addButtonPx: 'px-1.5',
        separatorH: 'h-3',
    },
    default: {
        containerPy: 'py-0.5',
        tabPx: 'px-2.5',
        tabPy: 'py-1',
        tabText: 'text-xs',
        iconSize: 'w-3.5 h-3.5',
        closeIconSize: 'w-3 h-3',
        gap: 'gap-1',
        addButtonPx: 'px-1.5',
        separatorH: 'h-3.5',
    },
    comfortable: {
        containerPy: 'py-1',
        tabPx: 'px-3',
        tabPy: 'py-1.5',
        tabText: 'text-sm',
        iconSize: 'w-4 h-4',
        closeIconSize: 'w-3.5 h-3.5',
        gap: 'gap-1.5',
        addButtonPx: 'px-2',
        separatorH: 'h-4',
    },
};

export function ViewTabs() {
    const { views, activeViewId, setActiveView, addView, updateView, deleteView, isStreamsMode, setStreamsMode, editingViewId, setEditingViewId, rowDensity } = useLogStore();
    const { markDirty } = useProjectPersistence();
    const density = TAB_DENSITY_CONFIG[rowDensity];
    const [showEditor, setShowEditor] = useState(false);
    const [editingView, setEditingView] = useState<View | undefined>(undefined);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Context menu for tab headers
    const contextMenu = useContextMenu<View>();

    // Confirm dialog for delete operations
    const confirmDialog = useConfirmDialog();

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
            // When creating a new view, automatically activate it
            addView(viewData, true);
        }
        markDirty(); // Mark project as dirty when view is added/edited
        setShowEditor(false);
        setEditingView(undefined);
    };

    const handleDeleteView = useCallback(async (e: React.MouseEvent, viewId: string) => {
        e.stopPropagation();
        if (viewId === 'all') return; // Can't delete default view

        const viewToDelete = views.find(v => v.id === viewId);
        const viewName = viewToDelete?.name || 'this view';

        const confirmed = await confirmDialog.confirm({
            title: 'Close View',
            message: `Are you sure you want to close "${viewName}"?`,
            confirmText: 'OK',
            cancelText: 'Cancel',
            danger: true
        });

        if (confirmed) {
            deleteView(viewId);
            markDirty(); // Mark project as dirty when view is deleted
        }
    }, [views, confirmDialog, deleteView, markDirty]);

    const handleStreamsClick = () => {
        setStreamsMode(true);
    };

    const handleViewClick = (viewId: string) => {
        setStreamsMode(false);
        setActiveView(viewId);
    };

    // Clone a view with all its settings
    const handleCloneView = useCallback((view: View) => {
        const clonedViewData: Omit<View, 'id'> = {
            name: `${view.name} (Copy)`,
            tabColor: view.tabColor,
            filter: { ...view.filter },
            highlightRules: view.highlightRules.map(r => ({ ...r, id: Math.random().toString(36).substring(2, 9) })),
            useGlobalHighlights: view.useGlobalHighlights,
            autoScroll: view.autoScroll,
            alternatingRows: view.alternatingRows,
            columnConfig: view.columnConfig ? [...view.columnConfig] : undefined
        };
        addView(clonedViewData, true); // Activate the cloned view
        markDirty(); // Mark project as dirty when view is cloned
    }, [addView, markDirty]);

    // Close all views except the specified one
    const handleCloseOtherViews = useCallback((keepViewId: string) => {
        const viewsToClose = views.filter(v => v.id !== keepViewId && v.id !== 'all');
        if (viewsToClose.length > 0) {
            viewsToClose.forEach(v => deleteView(v.id));
            markDirty(); // Mark project as dirty when views are closed
        }
        // Activate the kept view
        setActiveView(keepViewId);
        setStreamsMode(false);
    }, [views, deleteView, setActiveView, setStreamsMode, markDirty]);

    // Close view via context menu (with confirmation)
    const handleCloseViewFromMenu = useCallback(async (view: View) => {
        if (view.id === 'all') return; // Can't delete default view

        const confirmed = await confirmDialog.confirm({
            title: 'Close View',
            message: `Are you sure you want to close "${view.name}"?`,
            confirmText: 'OK',
            cancelText: 'Cancel',
            danger: true
        });

        if (confirmed) {
            deleteView(view.id);
            markDirty(); // Mark project as dirty when view is closed
        }
    }, [confirmDialog, deleteView, markDirty]);

    // Build context menu items for a view
    const getContextMenuItems = useCallback((view: View): ContextMenuItem[] => {
        const isDefaultView = view.id === 'all';
        const otherClosableViews = views.filter(v => v.id !== view.id && v.id !== 'all');

        return [
            {
                id: 'edit',
                label: 'Edit View',
                icon: (
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                ),
                onClick: () => handleEditView(view)
            },
            {
                id: 'clone',
                label: 'Clone View',
                icon: (
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                ),
                onClick: () => handleCloneView(view)
            },
            { id: 'sep1', label: '', separator: true },
            {
                id: 'close-others',
                label: 'Close Other Views',
                icon: (
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ),
                disabled: otherClosableViews.length === 0,
                onClick: () => handleCloseOtherViews(view.id)
            },
            { id: 'sep2', label: '', separator: true },
            {
                id: 'close',
                label: 'Close View',
                icon: (
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ),
                disabled: isDefaultView,
                danger: !isDefaultView,
                onClick: () => handleCloseViewFromMenu(view)
            }
        ];
    }, [views, handleEditView, handleCloneView, handleCloseOtherViews, handleCloseViewFromMenu]);

    // Handle right-click on tab
    const handleTabContextMenu = useCallback((e: React.MouseEvent, view: View) => {
        contextMenu.open(e, view);
    }, [contextMenu]);

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
                        <svg className={`${density.iconSize} text-slate-500 dark:text-slate-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                )}

                {/* Scrollable tabs container */}
                <div
                    ref={scrollContainerRef}
                    onWheel={handleWheel}
                    onScroll={updateScrollState}
                    className={`flex items-center ${density.gap} px-2 ${density.containerPy} overflow-x-auto scrollbar-hide`}
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {/* Streams tab - pinned first, different styling */}
                    <div
                        onClick={handleStreamsClick}
                        className={`flex-shrink-0 flex items-center ${density.gap} ${density.tabPx} ${density.tabPy} rounded cursor-pointer transition-colors ${
                            isStreamsMode
                                ? 'bg-purple-500 text-white'
                                : 'bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                        }`}
                    >
                        <svg className={`${density.iconSize} ${isStreamsMode ? 'text-purple-200' : 'text-purple-500 dark:text-purple-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className={`${density.tabText} font-medium whitespace-nowrap ${isStreamsMode ? 'text-white' : 'text-purple-700 dark:text-purple-300'}`}>
                            Streams
                        </span>
                    </div>

                    {/* Separator */}
                    <div className={`w-px ${density.separatorH} bg-slate-300 dark:bg-slate-600 mx-1 flex-shrink-0`} />

                    {/* Regular view tabs */}
                    {views.map(view => {
                        const isActiveTab = !isStreamsMode && activeViewId === view.id;

                        // For colored tabs: active = solid color + white text
                        // inactive = light tinted background + colored text (like Streams tab)
                        const getTabStyle = () => {
                            if (!view.tabColor) return undefined;

                            if (isActiveTab) {
                                // Active: solid color background
                                return { backgroundColor: view.tabColor };
                            } else {
                                // Inactive: light tint of the color (20% opacity in light mode, 30% in dark mode)
                                return { backgroundColor: `${view.tabColor}33` }; // 20% opacity (hex 33)
                            }
                        };

                        return (
                        <div
                            key={view.id}
                            onClick={() => handleViewClick(view.id)}
                            onDoubleClick={() => handleEditView(view)}
                            onContextMenu={(e) => handleTabContextMenu(e, view)}
                            className={`flex-shrink-0 group flex items-center ${density.gap} ${density.tabPx} ${density.tabPy} rounded cursor-pointer transition-all relative ${
                                view.tabColor
                                    ? isActiveTab
                                        ? 'text-white'
                                        : 'hover:brightness-110'
                                    : isActiveTab
                                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                            style={getTabStyle()}
                            title={view.name}
                        >
                            <span
                                className={`${density.tabText} whitespace-nowrap ${isActiveTab ? 'font-medium' : ''}`}
                                style={view.tabColor && !isActiveTab ? { color: view.tabColor } : undefined}
                            >
                                {view.name}
                            </span>
                            {view.id !== 'all' && (
                                <button
                                    onClick={(e) => handleDeleteView(e, view.id)}
                                    className={`transition-colors ${
                                        view.tabColor
                                            ? isActiveTab
                                                ? 'text-white/70 hover:text-white'
                                                : 'opacity-60 hover:opacity-100'
                                            : 'text-slate-400 hover:text-red-500 dark:hover:text-red-400'
                                    }`}
                                    style={view.tabColor && !isActiveTab ? { color: view.tabColor } : undefined}
                                    title="Close tab"
                                >
                                    <svg className={density.closeIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                            {/* Active indicator - bottom border */}
                            {isActiveTab && (
                                <div
                                    className={`absolute bottom-0 left-1 right-1 h-0.5 rounded-full ${view.tabColor ? '' : 'bg-blue-500 dark:bg-blue-400'}`}
                                    style={view.tabColor ? { backgroundColor: 'rgba(255,255,255,0.9)' } : undefined}
                                />
                            )}
                        </div>
                    );})}

                    {/* Add View Button */}
                    <button
                        onClick={handleAddView}
                        className={`flex-shrink-0 flex items-center ${density.gap} ${density.addButtonPx} ${density.tabPy} text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors`}
                        title="Create new view"
                    >
                        <svg className={density.iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
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
                        <svg className={`${density.iconSize} text-slate-500 dark:text-slate-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
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

            {/* Context menu for tabs */}
            {contextMenu.state.isOpen && contextMenu.state.data && (
                <ContextMenu
                    items={getContextMenuItems(contextMenu.state.data)}
                    position={contextMenu.state.position}
                    onClose={contextMenu.close}
                />
            )}

            {/* Confirm Dialog for ViewTabs */}
            {confirmDialog.dialogProps && (
                <ConfirmDialog
                    isOpen={confirmDialog.isOpen}
                    title={confirmDialog.dialogProps.title}
                    message={confirmDialog.dialogProps.message}
                    confirmText={confirmDialog.dialogProps.confirmText}
                    cancelText={confirmDialog.dialogProps.cancelText}
                    danger={confirmDialog.dialogProps.danger}
                    onConfirm={confirmDialog.handleConfirm}
                    onCancel={confirmDialog.handleCancel}
                />
            )}
        </>
    );
}

/**
 * ViewGridContainer - Renders all view grids, each in its own tab panel
 *
 * Each view gets its own ViewGrid component that:
 * - Stays mounted but hidden when not active (CSS visibility)
 * - Maintains its own column state
 * - Preserves scroll position when switching tabs
 */
interface ViewGridContainerProps {
    onColumnStateChange?: (viewId: string, columns: VlgColumnConfig[]) => void;
}

export function ViewGridContainer({
    onColumnStateChange
}: ViewGridContainerProps) {
    const { views, activeViewId, isStreamsMode } = useLogStore();
    const [mountedViews, setMountedViews] = useState<Set<string>>(new Set());

    // Track which views have been mounted (lazy mounting)
    useEffect(() => {
        if (activeViewId && !isStreamsMode && !mountedViews.has(activeViewId)) {
            setMountedViews(prev => new Set([...prev, activeViewId]));
        }
    }, [activeViewId, isStreamsMode, mountedViews]);

    // When in streams mode, don't render any grids as active
    if (isStreamsMode) {
        // Still render mounted views but all hidden
        return (
            <div className="relative h-full w-full">
                {views.filter(view => mountedViews.has(view.id)).map(view => (
                    <ViewGrid
                        key={view.id}
                        view={view}
                        isActive={false}
                        onColumnStateChange={onColumnStateChange}
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="relative h-full w-full">
            {views.map(view => {
                const isMounted = mountedViews.has(view.id);
                const isActive = view.id === activeViewId;

                // Only render if mounted (lazy loading)
                if (!isMounted) return null;

                return (
                    <ViewGrid
                        key={view.id}
                        view={view}
                        isActive={isActive}
                        onColumnStateChange={onColumnStateChange}
                    />
                );
            })}
        </div>
    );
}
