/**
 * PanelSettingsDrawer - Right-side drawer for panel configuration
 */

import { useState, useCallback } from 'react';
import { useLogStore, useWatchNames } from '../../store/logStore';
import { useMetricsStore, MetricsPanel, PanelQuery, Threshold, SERIES_COLORS, StateMapping, STATE_COLORS } from '../../store/metricsStore';
import { getAvailableFunctions, validateExpression } from './hooks/useTransformEngine';
import { SearchableSelect } from './SearchableSelect';

interface PanelSettingsDrawerProps {
    panelId: string | null;
    dashboardId: string;
    onClose: () => void;
}

type TabId = 'queries' | 'display' | 'thresholds';

export function PanelSettingsDrawer({ panelId, dashboardId, onClose }: PanelSettingsDrawerProps) {
    const currentRoom = useLogStore(state => state.currentRoom);
    // Use selector - only re-renders when watches are added/removed
    const watchNames = useWatchNames();
    const { getDashboard, updatePanel } = useMetricsStore();
    const [activeTab, setActiveTab] = useState<TabId>('queries');

    const dashboard = getDashboard(currentRoom, dashboardId);
    const panel = panelId ? dashboard?.panels.find(p => p.id === panelId) : null;

    // Update panel helper
    const update = useCallback((updates: Partial<MetricsPanel>) => {
        if (!panelId) return;
        updatePanel(currentRoom, dashboardId, panelId, updates);
    }, [currentRoom, dashboardId, panelId, updatePanel]);

    // Query management
    const addQuery = useCallback(() => {
        if (!panel) return;
        const newQuery: PanelQuery = {
            id: Math.random().toString(36).substring(2, 9),
            watchName: '',
            alias: '',
            color: SERIES_COLORS[panel.queries.length % SERIES_COLORS.length]
        };
        update({ queries: [...panel.queries, newQuery] });
    }, [panel, update]);

    const updateQuery = useCallback((queryId: string, updates: Partial<PanelQuery>) => {
        if (!panel) return;
        update({
            queries: panel.queries.map(q =>
                q.id === queryId ? { ...q, ...updates } : q
            )
        });
    }, [panel, update]);

    const removeQuery = useCallback((queryId: string) => {
        if (!panel) return;
        update({ queries: panel.queries.filter(q => q.id !== queryId) });
    }, [panel, update]);

    // Threshold management
    const addThreshold = useCallback(() => {
        if (!panel) return;
        const newThreshold: Threshold = {
            value: 50,
            color: '#ef4444', // red
            label: ''
        };
        update({ thresholds: [...(panel.thresholds || []), newThreshold] });
    }, [panel, update]);

    const updateThreshold = useCallback((index: number, updates: Partial<Threshold>) => {
        if (!panel?.thresholds) return;
        const newThresholds = [...panel.thresholds];
        newThresholds[index] = { ...newThresholds[index], ...updates };
        update({ thresholds: newThresholds });
    }, [panel, update]);

    const removeThreshold = useCallback((index: number) => {
        if (!panel?.thresholds) return;
        update({ thresholds: panel.thresholds.filter((_, i) => i !== index) });
    }, [panel, update]);

    // Early return AFTER all hooks
    if (!panelId || !panel) {
        return null;
    }

    const tabs: { id: TabId; label: string }[] = [
        { id: 'queries', label: 'Queries' },
        { id: 'display', label: 'Display' },
        { id: 'thresholds', label: 'Thresholds' }
    ];

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white dark:bg-slate-800 shadow-xl border-l border-slate-200 dark:border-slate-700 flex flex-col z-50">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">
                    Panel Settings
                </h3>
                <button
                    onClick={onClose}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Title input */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Title
                </label>
                <input
                    type="text"
                    value={panel.title}
                    onChange={(e) => update({ title: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                />
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                            activeTab === tab.id
                                ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto">
                {activeTab === 'queries' && (
                    <QueriesTab
                        queries={panel.queries}
                        watchNames={watchNames}
                        onAdd={addQuery}
                        onUpdate={updateQuery}
                        onRemove={removeQuery}
                    />
                )}

                {activeTab === 'display' && (
                    <DisplayTab
                        panel={panel}
                        onUpdate={update}
                    />
                )}

                {activeTab === 'thresholds' && (
                    <ThresholdsTab
                        thresholds={panel.thresholds || []}
                        onAdd={addThreshold}
                        onUpdate={updateThreshold}
                        onRemove={removeThreshold}
                    />
                )}
            </div>
        </div>
    );
}

// Queries Tab
interface QueriesTabProps {
    queries: PanelQuery[];
    watchNames: string[];
    onAdd: () => void;
    onUpdate: (id: string, updates: Partial<PanelQuery>) => void;
    onRemove: (id: string) => void;
}

function QueriesTab({ queries, watchNames, onAdd, onUpdate, onRemove }: QueriesTabProps) {
    return (
        <div className="p-4 space-y-4">
            {queries.map((query, i) => (
                <div key={query.id} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Query {String.fromCharCode(65 + i)}
                        </span>
                        <button
                            onClick={() => onRemove(query.id)}
                            className="text-slate-400 hover:text-red-500"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Watch selector */}
                    <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                            Watch
                        </label>
                        <SearchableSelect
                            options={watchNames}
                            value={query.watchName}
                            onChange={(value) => onUpdate(query.id, { watchName: value })}
                            placeholder="Type to search watches..."
                        />
                    </div>

                    {/* Alias */}
                    <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                            Alias (optional)
                        </label>
                        <input
                            type="text"
                            value={query.alias || ''}
                            onChange={(e) => onUpdate(query.id, { alias: e.target.value })}
                            placeholder="Display name"
                            className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                        />
                    </div>

                    {/* Color */}
                    <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                            Color
                        </label>
                        <div className="flex gap-1">
                            {SERIES_COLORS.map(color => (
                                <button
                                    key={color}
                                    onClick={() => onUpdate(query.id, { color })}
                                    className={`w-6 h-6 rounded ${
                                        query.color === color ? 'ring-2 ring-offset-1 ring-slate-400' : ''
                                    }`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Expression Transform */}
                    <ExpressionInput
                        value={query.expression || ''}
                        onChange={(expr) => onUpdate(query.id, { expression: expr })}
                    />
                </div>
            ))}

            <button
                onClick={onAdd}
                className="w-full py-2 text-sm text-emerald-600 dark:text-emerald-400 border border-dashed border-emerald-300 dark:border-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
                + Add Query
            </button>
        </div>
    );
}

// Expression Input with autocomplete
interface ExpressionInputProps {
    value: string;
    onChange: (value: string) => void;
}

function ExpressionInput({ value, onChange }: ExpressionInputProps) {
    const [showHelp, setShowHelp] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        onChange(newValue);

        // Validate expression
        const validationError = validateExpression(newValue);
        setError(validationError);
    };

    const functions = getAvailableFunctions();

    const insertFunction = (signature: string) => {
        onChange(value ? `${value} ${signature}` : signature);
        setShowHelp(false);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-slate-500 dark:text-slate-400">
                    Transform (optional)
                </label>
                <button
                    type="button"
                    onClick={() => setShowHelp(!showHelp)}
                    className="text-xs text-blue-500 hover:text-blue-600"
                >
                    {showHelp ? 'Hide help' : 'Functions'}
                </button>
            </div>
            <input
                type="text"
                value={value}
                onChange={handleChange}
                placeholder="e.g., rate($value) * 60"
                className={`w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-mono ${
                    error
                        ? 'border-red-400 dark:border-red-500'
                        : 'border-slate-300 dark:border-slate-600'
                }`}
            />
            {error && (
                <p className="text-xs text-red-500 mt-1">{error}</p>
            )}

            {/* Function help dropdown */}
            {showHelp && (
                <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-700 rounded text-xs space-y-1">
                    <p className="text-slate-500 dark:text-slate-400 mb-2">
                        Click to insert:
                    </p>
                    {functions.map(fn => (
                        <button
                            key={fn.name}
                            onClick={() => insertFunction(fn.signature)}
                            className="block w-full text-left p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                        >
                            <code className="text-emerald-600 dark:text-emerald-400">
                                {fn.signature}
                            </code>
                            <span className="text-slate-500 dark:text-slate-400 ml-2">
                                - {fn.description}
                            </span>
                        </button>
                    ))}
                    <div className="mt-2 pt-2 border-t border-slate-300 dark:border-slate-600">
                        <p className="text-slate-500 dark:text-slate-400">
                            Operators: + - * / % ( )
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">
                            Example: <code className="text-slate-600 dark:text-slate-300">errors / requests * 100</code>
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

// Display Tab
interface DisplayTabProps {
    panel: MetricsPanel;
    onUpdate: (updates: Partial<MetricsPanel>) => void;
}

function DisplayTab({ panel, onUpdate }: DisplayTabProps) {
    const updateOption = (key: string, value: unknown) => {
        onUpdate({ options: { ...panel.options, [key]: value } });
    };

    return (
        <div className="p-4 space-y-4">
            {/* Unit */}
            <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Unit
                </label>
                <select
                    value={panel.options.unit || ''}
                    onChange={(e) => updateOption('unit', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                >
                    <option value="">None</option>
                    <option value="percent">Percent (%)</option>
                    <option value="ms">Milliseconds (ms)</option>
                    <option value="bytes">Bytes</option>
                    <option value="req/s">Requests/sec</option>
                </select>
            </div>

            {/* Decimals */}
            <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Decimals
                </label>
                <input
                    type="number"
                    min="0"
                    max="10"
                    value={panel.options.decimals ?? 2}
                    onChange={(e) => updateOption('decimals', parseInt(e.target.value))}
                    className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                />
            </div>

            {/* Time series options */}
            {panel.type === 'timeseries' && (
                <>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-slate-300">Fill area</span>
                        <input
                            type="checkbox"
                            checked={panel.options.fillArea || false}
                            onChange={(e) => updateOption('fillArea', e.target.checked)}
                            className="w-4 h-4 accent-emerald-500"
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-slate-300">Show points</span>
                        <input
                            type="checkbox"
                            checked={panel.options.showPoints || false}
                            onChange={(e) => updateOption('showPoints', e.target.checked)}
                            className="w-4 h-4 accent-emerald-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            Line width
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="5"
                            value={panel.options.lineWidth || 2}
                            onChange={(e) => updateOption('lineWidth', parseInt(e.target.value))}
                            className="w-full"
                        />
                    </div>
                </>
            )}

            {/* Stat options */}
            {panel.type === 'stat' && (
                <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Show sparkline</span>
                    <input
                        type="checkbox"
                        checked={panel.options.showSparkline ?? true}
                        onChange={(e) => updateOption('showSparkline', e.target.checked)}
                        className="w-4 h-4 accent-emerald-500"
                    />
                </div>
            )}

            {/* Gauge options */}
            {panel.type === 'gauge' && (
                <>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            Min value
                        </label>
                        <input
                            type="number"
                            value={panel.options.min ?? 0}
                            onChange={(e) => updateOption('min', parseFloat(e.target.value))}
                            className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            Max value
                        </label>
                        <input
                            type="number"
                            value={panel.options.max ?? 100}
                            onChange={(e) => updateOption('max', parseFloat(e.target.value))}
                            className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                        />
                    </div>
                </>
            )}

            {/* Bar options */}
            {panel.type === 'bar' && (
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Orientation
                    </label>
                    <select
                        value={panel.options.orientation || 'vertical'}
                        onChange={(e) => updateOption('orientation', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                    >
                        <option value="vertical">Vertical</option>
                        <option value="horizontal">Horizontal</option>
                    </select>
                </div>
            )}

            {/* State Timeline options */}
            {panel.type === 'statetimeline' && (
                <>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-slate-300">Show value text</span>
                        <input
                            type="checkbox"
                            checked={panel.options.showValue ?? true}
                            onChange={(e) => updateOption('showValue', e.target.checked)}
                            className="w-4 h-4 accent-emerald-500"
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-slate-300">Merge adjacent states</span>
                        <input
                            type="checkbox"
                            checked={panel.options.mergeAdjacentStates ?? true}
                            onChange={(e) => updateOption('mergeAdjacentStates', e.target.checked)}
                            className="w-4 h-4 accent-emerald-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            Row height (1 = no space, 0.5 = 50% space)
                        </label>
                        <input
                            type="range"
                            min="0.3"
                            max="1"
                            step="0.05"
                            value={panel.options.rowHeight ?? 0.9}
                            onChange={(e) => updateOption('rowHeight', parseFloat(e.target.value))}
                            className="w-full"
                        />
                        <span className="text-xs text-slate-400">{((panel.options.rowHeight ?? 0.9) * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            Fill opacity
                        </label>
                        <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.05"
                            value={panel.options.fillOpacity ?? 0.9}
                            onChange={(e) => updateOption('fillOpacity', parseFloat(e.target.value))}
                            className="w-full"
                        />
                        <span className="text-xs text-slate-400">{((panel.options.fillOpacity ?? 0.9) * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            Line width
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="4"
                            step="1"
                            value={panel.options.lineWidth ?? 0}
                            onChange={(e) => updateOption('lineWidth', parseInt(e.target.value))}
                            className="w-full"
                        />
                        <span className="text-xs text-slate-400">{panel.options.lineWidth ?? 0}px</span>
                    </div>

                    {/* State Mappings */}
                    <StateMappingsEditor
                        mappings={panel.options.stateMappings || []}
                        onChange={(mappings) => updateOption('stateMappings', mappings)}
                    />
                </>
            )}
        </div>
    );
}

// Thresholds Tab
interface ThresholdsTabProps {
    thresholds: Threshold[];
    onAdd: () => void;
    onUpdate: (index: number, updates: Partial<Threshold>) => void;
    onRemove: (index: number) => void;
}

function ThresholdsTab({ thresholds, onAdd, onUpdate, onRemove }: ThresholdsTabProps) {
    const colorPresets = ['#22c55e', '#f59e0b', '#ef4444']; // green, amber, red

    return (
        <div className="p-4 space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Thresholds change the color based on value. Higher thresholds take priority.
            </p>

            {thresholds.map((threshold, i) => (
                <div key={i} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Threshold {i + 1}
                        </span>
                        <button
                            onClick={() => onRemove(i)}
                            className="text-slate-400 hover:text-red-500"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                            Value ≥
                        </label>
                        <input
                            type="number"
                            value={threshold.value}
                            onChange={(e) => onUpdate(i, { value: parseFloat(e.target.value) })}
                            className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                            Color
                        </label>
                        <div className="flex gap-1">
                            {colorPresets.map(color => (
                                <button
                                    key={color}
                                    onClick={() => onUpdate(i, { color })}
                                    className={`w-6 h-6 rounded ${
                                        threshold.color === color ? 'ring-2 ring-offset-1 ring-slate-400' : ''
                                    }`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                            <input
                                type="color"
                                value={threshold.color}
                                onChange={(e) => onUpdate(i, { color: e.target.value })}
                                className="w-6 h-6 rounded cursor-pointer"
                            />
                        </div>
                    </div>
                </div>
            ))}

            <button
                onClick={onAdd}
                className="w-full py-2 text-sm text-emerald-600 dark:text-emerald-400 border border-dashed border-emerald-300 dark:border-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
                + Add Threshold
            </button>
        </div>
    );
}

// State Mappings Editor for StateTimeline panel
interface StateMappingsEditorProps {
    mappings: StateMapping[];
    onChange: (mappings: StateMapping[]) => void;
}

function StateMappingsEditor({ mappings, onChange }: StateMappingsEditorProps) {
    const addMapping = () => {
        const newMapping: StateMapping = {
            value: '',
            text: '',
            color: STATE_COLORS[mappings.length % STATE_COLORS.length]
        };
        onChange([...mappings, newMapping]);
    };

    const updateMapping = (index: number, updates: Partial<StateMapping>) => {
        const newMappings = [...mappings];
        newMappings[index] = { ...newMappings[index], ...updates };
        onChange(newMappings);
    };

    const removeMapping = (index: number) => {
        onChange(mappings.filter((_, i) => i !== index));
    };

    return (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    State Mappings
                </label>
            </div>

            <p className="text-xs text-slate-400 mb-3">
                Map values to colors and display text
            </p>

            <div className="space-y-2">
                {mappings.map((mapping, i) => (
                    <div key={i} className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Mapping {i + 1}
                            </span>
                            <button
                                onClick={() => removeMapping(i)}
                                className="text-slate-400 hover:text-red-500"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">Value</label>
                                <input
                                    type="text"
                                    value={String(mapping.value)}
                                    onChange={(e) => updateMapping(i, { value: e.target.value })}
                                    placeholder="e.g., ok, error, 1"
                                    className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">Display Text</label>
                                <input
                                    type="text"
                                    value={mapping.text}
                                    onChange={(e) => updateMapping(i, { text: e.target.value })}
                                    placeholder="e.g., OK, Error"
                                    className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Color</label>
                            <div className="flex gap-1 flex-wrap">
                                {STATE_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => updateMapping(i, { color })}
                                        className={`w-5 h-5 rounded ${
                                            mapping.color === color ? 'ring-2 ring-offset-1 ring-slate-400 dark:ring-offset-slate-800' : ''
                                        }`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                                <input
                                    type="color"
                                    value={mapping.color}
                                    onChange={(e) => updateMapping(i, { color: e.target.value })}
                                    className="w-5 h-5 rounded cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={addMapping}
                className="w-full mt-2 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 border border-dashed border-emerald-300 dark:border-emerald-600 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
                + Add Mapping
            </button>
        </div>
    );
}
