/**
 * SettingsPanel - Client settings configuration modal with tabs
 */

import { useState, useEffect, useCallback } from 'react';
import { useSettings, AppSettings } from '../hooks/useSettings';
import { useLogStore, HighlightRule, PresetSummary } from '../store/logStore';
import { reconnect } from '../services/earlyWebSocket';
import { HighlightRuleEditor } from './HighlightRuleEditor';

// Custom checkbox component that works properly in dark mode
interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    className?: string;
}

function Checkbox({ checked, onChange, className = '' }: CheckboxProps) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                checked
                    ? 'bg-blue-500 border-blue-500'
                    : 'bg-slate-100 dark:bg-slate-600 border-slate-300 dark:border-slate-500'
            } ${className}`}
        >
            {checked && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            )}
        </button>
    );
}

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

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onServerUrlChange?: () => void;  // Callback when server URL changes (to reconnect)
    onExportLayout?: () => void;
    onImportLayout?: () => void;
    onResetLayout?: () => void;
    // Preset management props
    activePreset?: PresetSummary | null;
    ownPresets?: PresetSummary[];
    sharedPresets?: PresetSummary[];
    presetsLoading?: boolean;
    onLoadPreset?: (presetId: string) => void;
    onSavePreset?: () => void;  // Save current state to active preset
    onSaveAsNewPreset?: (name: string, description?: string, isShared?: boolean) => void;
    onDeletePreset?: (presetId: string) => Promise<boolean>;
    onRenamePreset?: (presetId: string, newName: string) => Promise<boolean>;
    onSetDefaultPreset?: (presetId: string) => Promise<boolean>;
    onToggleShared?: (presetId: string, isShared: boolean) => Promise<boolean>;
    onCopyPreset?: (presetId: string, newName: string) => void;
}

const MAX_ENTRIES_OPTIONS = [
    { value: 1000, label: '1,000' },
    { value: 5000, label: '5,000' },
    { value: 10000, label: '10,000' },
    { value: 50000, label: '50,000' },
    { value: 100000, label: '100,000 (All)' },
];

export function SettingsPanel({
    isOpen,
    onClose,
    onServerUrlChange: _,
    onExportLayout,
    onImportLayout,
    onResetLayout,
    // Preset management props
    activePreset,
    ownPresets = [],
    sharedPresets = [],
    presetsLoading = false,
    onLoadPreset,
    onSavePreset,
    onSaveAsNewPreset,
    onDeletePreset,
    onRenamePreset,
    onSetDefaultPreset,
    onToggleShared,
    onCopyPreset
}: SettingsPanelProps) {
    const { settings, updateSettings, getServerUrl, defaultSettings } = useSettings();
    const setCurrentUser = useLogStore(state => state.setCurrentUser);
    const { globalHighlightRules, addHighlightRule, updateHighlightRule, deleteHighlightRule, sessions, appNames, hostNames } = useLogStore();

    // Local form state
    const [formState, setFormState] = useState<AppSettings>(settings);
    const [showToken, setShowToken] = useState(false);
    const [activeTab, setActiveTab] = useState<'connection' | 'display' | 'layout' | 'highlights'>('connection');

    // Highlight rule editor state
    const [showRuleEditor, setShowRuleEditor] = useState(false);
    const [editingRule, setEditingRule] = useState<HighlightRule | undefined>(undefined);

    // Preset management state
    const [showSavePresetModal, setShowSavePresetModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState<PresetSummary | null>(null);
    const [showCopyModal, setShowCopyModal] = useState<PresetSummary | null>(null);
    const [newPresetName, setNewPresetName] = useState('');
    const [newPresetDescription, setNewPresetDescription] = useState('');
    const [newPresetShared, setNewPresetShared] = useState(false);

    // Get available values for dropdowns from store
    const availableSessions = Object.keys(sessions);
    const availableAppNames = Object.keys(appNames);
    const availableHostNames = Object.keys(hostNames);

    const handleAddRule = () => {
        setEditingRule(undefined);
        setShowRuleEditor(true);
    };

    const handleEditRule = (rule: HighlightRule) => {
        setEditingRule(rule);
        setShowRuleEditor(true);
    };

    const handleSaveRule = (ruleData: Omit<HighlightRule, 'id'>) => {
        if (editingRule) {
            updateHighlightRule(editingRule.id, ruleData);
        } else {
            addHighlightRule(ruleData);
        }
        setShowRuleEditor(false);
        setEditingRule(undefined);
    };

    const handleDeleteRule = (id: string) => {
        if (confirm('Delete this rule?')) {
            deleteHighlightRule(id);
        }
    };

    const handleToggleRule = (rule: HighlightRule) => {
        updateHighlightRule(rule.id, { enabled: !rule.enabled });
    };

    // Preset handlers
    const handleSaveNewPreset = useCallback(() => {
        if (newPresetName.trim() && onSaveAsNewPreset) {
            onSaveAsNewPreset(newPresetName.trim(), newPresetDescription.trim() || undefined, newPresetShared);
            setNewPresetName('');
            setNewPresetDescription('');
            setNewPresetShared(false);
            setShowSavePresetModal(false);
        }
    }, [newPresetName, newPresetDescription, newPresetShared, onSaveAsNewPreset]);

    const handleRenamePreset = useCallback(async () => {
        if (showRenameModal && newPresetName.trim() && onRenamePreset) {
            await onRenamePreset(showRenameModal.id, newPresetName.trim());
            setNewPresetName('');
            setShowRenameModal(null);
        }
    }, [showRenameModal, newPresetName, onRenamePreset]);

    const handleCopyPreset = useCallback(() => {
        if (showCopyModal && newPresetName.trim() && onCopyPreset) {
            onCopyPreset(showCopyModal.id, newPresetName.trim());
            setNewPresetName('');
            setShowCopyModal(null);
        }
    }, [showCopyModal, newPresetName, onCopyPreset]);

    const handleDeletePreset = useCallback(async (preset: PresetSummary) => {
        if (onDeletePreset && confirm(`Delete "${preset.name}"? This cannot be undone.`)) {
            await onDeletePreset(preset.id);
        }
    }, [onDeletePreset]);

    const handleSetDefault = useCallback(async (preset: PresetSummary) => {
        if (onSetDefaultPreset) {
            await onSetDefaultPreset(preset.id);
        }
    }, [onSetDefaultPreset]);

    const handleToggleShared = useCallback(async (preset: PresetSummary) => {
        if (onToggleShared) {
            await onToggleShared(preset.id, !preset.isShared);
        }
    }, [onToggleShared]);

    const openRenameModal = useCallback((preset: PresetSummary) => {
        setShowRenameModal(preset);
        setNewPresetName(preset.name);
    }, []);

    const openCopyModal = useCallback((preset: PresetSummary) => {
        setShowCopyModal(preset);
        setNewPresetName(`${preset.name} (Copy)`);
    }, []);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormState(settings);
        }
    }, [isOpen, settings]);

    // Close on escape
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleSave = () => {
        // Check if server URL changed
        const urlChanged = formState.serverUrl !== settings.serverUrl;
        // Check if username changed
        const usernameChanged = formState.username !== settings.username;
        // Check if auth token changed
        const authTokenChanged = formState.authToken !== settings.authToken;

        // Save client settings
        updateSettings(formState);

        // Update logStore currentUser if username changed
        if (usernameChanged) {
            setCurrentUser(formState.username || 'default');
        }

        // Reconnect if URL, auth token, or username changed
        if (urlChanged || authTokenChanged || usernameChanged) {
            // Small delay to let settings save to localStorage first
            setTimeout(() => {
                reconnect();
            }, 100);
        }

        onClose();
    };

    const handleReset = () => {
        if (confirm('Reset all settings to defaults?')) {
            setFormState(defaultSettings);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[500px] h-[480px] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-slate-100 dark:bg-slate-700 px-4 py-3 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between flex-shrink-0">
                    <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Client Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tab bar */}
                <div className="flex border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('connection')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'connection'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Connection
                    </button>
                    <button
                        onClick={() => setActiveTab('display')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'display'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                        </svg>
                        Display
                    </button>
                    <button
                        onClick={() => setActiveTab('layout')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'layout'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                        </svg>
                        Layout
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
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto flex-1 min-h-0">
                    {activeTab === 'connection' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Server URL
                                </label>
                                <input
                                    type="text"
                                    value={formState.serverUrl}
                                    onChange={(e) => setFormState(prev => ({ ...prev, serverUrl: e.target.value }))}
                                    placeholder={getServerUrl()}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Leave empty for auto-detect based on browser URL.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Auth Token
                                </label>
                                <div className="relative">
                                    <input
                                        type={showToken ? 'text' : 'password'}
                                        value={formState.authToken || ''}
                                        onChange={(e) => setFormState(prev => ({ ...prev, authToken: e.target.value || null }))}
                                        placeholder="Enter auth token..."
                                        className="w-full px-3 py-2 pr-10 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowToken(!showToken)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    >
                                        {showToken ? (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Optional. Required if server has SI_AUTH_TOKEN set.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    value={formState.username}
                                    onChange={(e) => setFormState(prev => ({ ...prev, username: e.target.value || 'default' }))}
                                    placeholder="default"
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Settings like filters and views are saved per user per room.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'display' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Max Entries to Display
                                </label>
                                <select
                                    value={formState.maxDisplayEntries}
                                    onChange={(e) => setFormState(prev => ({ ...prev, maxDisplayEntries: parseInt(e.target.value) }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                >
                                    {MAX_ENTRIES_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Limits memory usage in browser. Older entries are dropped when limit is reached.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'layout' && (
                        <div className="space-y-4">
                            {/* Active preset info */}
                            {activePreset && (
                                <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="text-sm text-blue-700 dark:text-blue-300">
                                            Active: <strong>{activePreset.name}</strong>
                                        </span>
                                        {activePreset.isDefault && (
                                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    {onSavePreset && (
                                        <button
                                            onClick={onSavePreset}
                                            disabled={presetsLoading}
                                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                                        >
                                            Save Changes
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowSavePresetModal(true)}
                                    disabled={presetsLoading}
                                    className="flex-1 px-3 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-400 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Save As New
                                </button>
                                <button
                                    onClick={() => { onExportLayout?.(); }}
                                    className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors dark:text-slate-200"
                                    title="Export to file"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => { onImportLayout?.(); }}
                                    className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors dark:text-slate-200"
                                    title="Import from file"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => { onResetLayout?.(); }}
                                    className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors dark:text-slate-200"
                                    title="Reset to defaults"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </button>
                            </div>

                            {/* My Presets */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                                        My Layouts ({ownPresets.length})
                                    </label>
                                </div>
                                {ownPresets.length === 0 ? (
                                    <div className="text-center py-4 border border-dashed border-slate-200 dark:border-slate-600 rounded-lg">
                                        <p className="text-slate-500 dark:text-slate-400 text-sm">No saved layouts yet</p>
                                        <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Click "Save As New" to create one</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                                        {ownPresets.map(preset => (
                                            <div
                                                key={preset.id}
                                                className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                                                    activePreset?.id === preset.id
                                                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                                                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                                                }`}
                                            >
                                                {/* Load button / name */}
                                                <button
                                                    onClick={() => onLoadPreset?.(preset.id)}
                                                    disabled={presetsLoading || activePreset?.id === preset.id}
                                                    className="flex-1 text-left"
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`font-medium text-sm ${activePreset?.id === preset.id ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                                                            {preset.name}
                                                        </span>
                                                        {preset.isDefault && (
                                                            <span className="text-amber-500" title="Default">*</span>
                                                        )}
                                                        {preset.isShared && (
                                                            <span title="Shared">
                                                                <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                                                </svg>
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                                {/* Action buttons */}
                                                <div className="flex items-center gap-0.5">
                                                    {!preset.isDefault && (
                                                        <button
                                                            onClick={() => handleSetDefault(preset)}
                                                            className="p-1 text-slate-400 hover:text-amber-500 transition-colors"
                                                            title="Set as default"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleToggleShared(preset)}
                                                        className={`p-1 transition-colors ${preset.isShared ? 'text-blue-500 hover:text-blue-600' : 'text-slate-400 hover:text-blue-500'}`}
                                                        title={preset.isShared ? "Stop sharing" : "Share with room"}
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => openRenameModal(preset)}
                                                        className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                                                        title="Rename"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePreset(preset)}
                                                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Shared Presets */}
                            {sharedPresets.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                        </svg>
                                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                                            Shared ({sharedPresets.length})
                                        </label>
                                    </div>
                                    <div className="space-y-1.5 max-h-28 overflow-y-auto">
                                        {sharedPresets.map(preset => (
                                            <div
                                                key={preset.id}
                                                className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                                                    activePreset?.id === preset.id
                                                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                                                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                                                }`}
                                            >
                                                <button
                                                    onClick={() => onLoadPreset?.(preset.id)}
                                                    disabled={presetsLoading || activePreset?.id === preset.id}
                                                    className="flex-1 text-left"
                                                >
                                                    <span className={`font-medium text-sm ${activePreset?.id === preset.id ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                                                        {preset.name}
                                                    </span>
                                                    <span className="text-xs text-slate-400 ml-1.5">by {preset.createdBy}</span>
                                                </button>
                                                <button
                                                    onClick={() => openCopyModal(preset)}
                                                    className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                                                    title="Copy to my layouts"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'highlights' && (
                        <div className="space-y-3">
                            {/* Header with Add Rule button */}
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                                    Global Highlight Rules
                                </label>
                                <button
                                    onClick={handleAddRule}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add Rule
                                </button>
                            </div>

                            {globalHighlightRules.length === 0 ? (
                                <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-600 rounded-lg">
                                    <svg className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                    </svg>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">No highlight rules defined</p>
                                    <p className="text-slate-400 dark:text-slate-500 text-xs">Create rules to customize how log entries are displayed</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {globalHighlightRules.map(rule => (
                                        <div
                                            key={rule.id}
                                            className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-colors"
                                        >
                                            <Checkbox
                                                checked={rule.enabled}
                                                onChange={() => handleToggleRule(rule)}
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
                                                onClick={() => handleEditRule(rule)}
                                                className="p-1 text-slate-400 hover:text-blue-500 transition-colors flex-shrink-0"
                                                title="Edit rule"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteRule(rule.id)}
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
                    )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 dark:bg-slate-700 px-4 py-3 border-t border-slate-200 dark:border-slate-600 flex justify-between flex-shrink-0">
                    <button
                        onClick={handleReset}
                        className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
                    >
                        Reset to Defaults
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm bg-white dark:bg-slate-600 border border-slate-300 dark:border-slate-500 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500 transition-colors dark:text-slate-200"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>

            {/* Highlight rule editor modal */}
            {showRuleEditor && (
                <HighlightRuleEditor
                    rule={editingRule}
                    onSave={handleSaveRule}
                    onCancel={() => {
                        setShowRuleEditor(false);
                        setEditingRule(undefined);
                    }}
                    availableSessions={availableSessions}
                    availableAppNames={availableAppNames}
                    availableHostNames={availableHostNames}
                />
            )}

            {/* Save as new preset modal */}
            {showSavePresetModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                    <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl w-80 p-4">
                        <h3 className="text-slate-800 dark:text-white font-semibold mb-3">Save Layout Preset</h3>
                        <input
                            type="text"
                            value={newPresetName}
                            onChange={e => setNewPresetName(e.target.value)}
                            placeholder="Preset name"
                            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-white text-sm mb-2 focus:outline-none focus:border-blue-500"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleSaveNewPreset()}
                        />
                        <input
                            type="text"
                            value={newPresetDescription}
                            onChange={e => setNewPresetDescription(e.target.value)}
                            placeholder="Description (optional)"
                            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-white text-sm mb-3 focus:outline-none focus:border-blue-500"
                            onKeyDown={e => e.key === 'Enter' && handleSaveNewPreset()}
                        />
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mb-4">
                            <Checkbox checked={newPresetShared} onChange={setNewPresetShared} />
                            Share with others in this room
                        </label>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowSavePresetModal(false);
                                    setNewPresetName('');
                                    setNewPresetDescription('');
                                    setNewPresetShared(false);
                                }}
                                className="px-3 py-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveNewPreset}
                                disabled={!newPresetName.trim()}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-400 text-white rounded text-sm"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rename preset modal */}
            {showRenameModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                    <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl w-80 p-4">
                        <h3 className="text-slate-800 dark:text-white font-semibold mb-3">Rename Layout</h3>
                        <input
                            type="text"
                            value={newPresetName}
                            onChange={e => setNewPresetName(e.target.value)}
                            placeholder="New name"
                            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-white text-sm mb-3 focus:outline-none focus:border-blue-500"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleRenamePreset()}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowRenameModal(null);
                                    setNewPresetName('');
                                }}
                                className="px-3 py-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRenamePreset}
                                disabled={!newPresetName.trim()}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-400 text-white rounded text-sm"
                            >
                                Rename
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Copy preset modal */}
            {showCopyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                    <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl w-80 p-4">
                        <h3 className="text-slate-800 dark:text-white font-semibold mb-3">Copy Layout</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">
                            Copy "{showCopyModal.name}" to your layouts
                        </p>
                        <input
                            type="text"
                            value={newPresetName}
                            onChange={e => setNewPresetName(e.target.value)}
                            placeholder="New layout name"
                            className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-white text-sm mb-3 focus:outline-none focus:border-blue-500"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleCopyPreset()}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowCopyModal(null);
                                    setNewPresetName('');
                                }}
                                className="px-3 py-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCopyPreset}
                                disabled={!newPresetName.trim()}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-400 text-white rounded text-sm"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
