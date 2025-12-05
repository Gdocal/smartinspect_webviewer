/**
 * SettingsPanel - Client settings configuration modal with tabs
 */

import { useState, useEffect, useCallback } from 'react';
import { useSettings, AppSettings, usePerformanceSettings, PerformanceSettings } from '../hooks/useSettings';
import { useLogStore, HighlightRule, ProjectLimits, defaultLimits } from '../store/logStore';
import { useProjectPersistence } from '../hooks/useProjectPersistence';
import { reconnect } from '../services/earlyWebSocket';
import { HighlightRuleEditor } from './HighlightRuleEditor';

interface ServerConfig {
    maxEntries: number;
    maxStreamEntries: number;
}

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
}

export function SettingsPanel({
    isOpen,
    onClose
}: SettingsPanelProps) {
    const { settings, updateSettings, getServerUrl, defaultSettings } = useSettings();
    const setCurrentUser = useLogStore(state => state.setCurrentUser);
    const { globalHighlightRules, addHighlightRule, updateHighlightRule, deleteHighlightRule, sessions, appNames, hostNames, limits, setLimits, rowDensity, setRowDensity } = useLogStore();
    const { markDirty } = useProjectPersistence();

    // Local form state
    const [formState, setFormState] = useState<AppSettings>(settings);
    const [limitsFormState, setLimitsFormState] = useState<ProjectLimits>(limits);
    const [serverConfig, setServerConfig] = useState<ServerConfig>({ maxEntries: 100000, maxStreamEntries: 1000 });
    const [showToken, setShowToken] = useState(false);
    const [activeTab, setActiveTab] = useState<'connection' | 'display' | 'highlights' | 'performance'>('connection');

    // Performance settings
    const { settings: perfSettings, updateSettings: updatePerfSettings, defaultSettings: defaultPerfSettings } = usePerformanceSettings();
    const [perfFormState, setPerfFormState] = useState<PerformanceSettings>(perfSettings);

    // Convert WebSocket URL to HTTP URL
    const getHttpUrl = useCallback((): string => {
        const wsUrl = getServerUrl();
        return wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
    }, [getServerUrl]);

    // Fetch server config
    const fetchServerConfig = useCallback(async () => {
        try {
            const baseUrl = getHttpUrl();
            const response = await fetch(`${baseUrl}/api/server/config`);
            if (response.ok) {
                const data = await response.json();
                setServerConfig({
                    maxEntries: data.maxEntries || 100000,
                    maxStreamEntries: data.maxStreamEntries || 1000
                });
            }
        } catch (err) {
            console.error('Failed to fetch server config:', err);
        }
    }, [getHttpUrl]);

    // Highlight rule editor state
    const [showRuleEditor, setShowRuleEditor] = useState(false);
    const [editingRule, setEditingRule] = useState<HighlightRule | undefined>(undefined);

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
        markDirty();
        setShowRuleEditor(false);
        setEditingRule(undefined);
    };

    const handleDeleteRule = (id: string) => {
        if (confirm('Delete this rule?')) {
            deleteHighlightRule(id);
            markDirty();
        }
    };

    const handleToggleRule = (rule: HighlightRule) => {
        updateHighlightRule(rule.id, { enabled: !rule.enabled });
        markDirty();
    };

    // Reset form when modal opens and fetch server config
    useEffect(() => {
        if (isOpen) {
            setFormState(settings);
            setLimitsFormState(limits);
            setPerfFormState(perfSettings);
            fetchServerConfig();
        }
    }, [isOpen, settings, limits, perfSettings, fetchServerConfig]);

    // Close on escape
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleSave = async () => {
        // Check if server URL changed
        const urlChanged = formState.serverUrl !== settings.serverUrl;
        // Check if username changed
        const usernameChanged = formState.username !== settings.username;
        // Check if auth token changed
        const authTokenChanged = formState.authToken !== settings.authToken;

        // Save client settings
        updateSettings(formState);

        // Save project limits
        setLimits(limitsFormState);

        // Save performance settings
        updatePerfSettings(perfFormState);

        // Save server config if changed
        try {
            const baseUrl = getHttpUrl();
            await fetch(`${baseUrl}/api/server/config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    maxEntries: serverConfig.maxEntries,
                    maxStreamEntries: serverConfig.maxStreamEntries
                })
            });
        } catch (err) {
            console.error('Failed to save server config:', err);
        }

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
            setLimitsFormState(defaultLimits);
            setPerfFormState(defaultPerfSettings);
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
                    <button
                        onClick={() => setActiveTab('performance')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            activeTab === 'performance'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Performance
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
                            {/* Appearance section */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Row Density
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setRowDensity('compact')}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            rowDensity === 'compact'
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                                        }`}
                                    >
                                        Compact
                                    </button>
                                    <button
                                        onClick={() => setRowDensity('default')}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            rowDensity === 'default'
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                                        }`}
                                    >
                                        Default
                                    </button>
                                    <button
                                        onClick={() => setRowDensity('comfortable')}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            rowDensity === 'comfortable'
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                                        }`}
                                    >
                                        Comfortable
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Controls row height and font size in log grids. Compact shows more rows.
                                </p>
                            </div>

                            {/* Project limits section */}
                            <div className="pt-3 border-t border-slate-200 dark:border-slate-600">
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                    Project limits - saved with current project
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Initial Load Limit
                                </label>
                                <input
                                    type="number"
                                    min="100"
                                    max="1000000"
                                    step="1000"
                                    value={limitsFormState.initialLoadLimit}
                                    onChange={(e) => setLimitsFormState(prev => ({ ...prev, initialLoadLimit: Math.max(100, parseInt(e.target.value) || 5000) }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    How many log entries to fetch from server on connect.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Max Buffer Entries
                                </label>
                                <input
                                    type="number"
                                    min="1000"
                                    max="10000000"
                                    step="10000"
                                    value={limitsFormState.maxBufferEntries}
                                    onChange={(e) => setLimitsFormState(prev => ({ ...prev, maxBufferEntries: Math.max(1000, parseInt(e.target.value) || 50000) }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Total entries to keep in client memory. Older entries are dropped when limit is reached.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Max Grid Rows
                                </label>
                                <input
                                    type="number"
                                    min="1000"
                                    max="1000000"
                                    step="5000"
                                    value={limitsFormState.maxGridRows}
                                    onChange={(e) => setLimitsFormState(prev => ({ ...prev, maxGridRows: Math.max(1000, parseInt(e.target.value) || 10000) }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Maximum rows each grid view can display. Higher values may affect performance.
                                </p>
                            </div>

                            {/* Server-side settings */}
                            <div className="pt-3 border-t border-slate-200 dark:border-slate-600">
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                    Server-side limits (affects all viewers)
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    Max Stream Entries (per channel)
                                </label>
                                <input
                                    type="number"
                                    min="100"
                                    max="100000"
                                    step="100"
                                    value={serverConfig.maxStreamEntries}
                                    onChange={(e) => setServerConfig(prev => ({ ...prev, maxStreamEntries: Math.max(100, Math.min(100000, parseInt(e.target.value) || 1000)) }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Maximum stream entries per channel on server (100-100,000). Higher values use more server memory.
                                </p>
                            </div>
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

                    {activeTab === 'performance' && (
                        <div className="space-y-4">
                            {/* Auto-pause section */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">
                                    Stream Auto-Pause
                                </label>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                    Automatically pause high-frequency streams to prevent performance issues.
                                </p>

                                <div className="space-y-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <Checkbox
                                            checked={perfFormState.autoPauseEnabled}
                                            onChange={(checked) => setPerfFormState(prev => ({ ...prev, autoPauseEnabled: checked }))}
                                        />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">Enable auto-pause for high-frequency streams</span>
                                    </label>

                                    <div className={perfFormState.autoPauseEnabled ? '' : 'opacity-50 pointer-events-none'}>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                                                    Stream Count
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="50"
                                                    value={perfFormState.autoPauseStreamCountThreshold}
                                                    onChange={(e) => setPerfFormState(prev => ({
                                                        ...prev,
                                                        autoPauseStreamCountThreshold: Math.max(1, Math.min(50, parseInt(e.target.value) || 3))
                                                    }))}
                                                    className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                                />
                                                <p className="text-[10px] text-slate-400 mt-0.5">Active streams</p>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                                                    Rate Threshold
                                                </label>
                                                <input
                                                    type="number"
                                                    min="10"
                                                    max="500"
                                                    value={perfFormState.autoPauseRateThreshold}
                                                    onChange={(e) => setPerfFormState(prev => ({
                                                        ...prev,
                                                        autoPauseRateThreshold: Math.max(10, Math.min(500, parseInt(e.target.value) || 50))
                                                    }))}
                                                    className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                                />
                                                <p className="text-[10px] text-slate-400 mt-0.5">Messages/sec</p>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                                                    Grace Period
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="30"
                                                    value={perfFormState.autoPauseGracePeriod}
                                                    onChange={(e) => setPerfFormState(prev => ({
                                                        ...prev,
                                                        autoPauseGracePeriod: Math.max(1, Math.min(30, parseInt(e.target.value) || 5))
                                                    }))}
                                                    className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                                />
                                                <p className="text-[10px] text-slate-400 mt-0.5">Seconds</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Watch throttling section */}
                            <div className="pt-3 border-t border-slate-200 dark:border-slate-600">
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">
                                    Watch Updates
                                </label>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                    Control how frequently watch values are updated in the UI.
                                </p>

                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setPerfFormState(prev => ({ ...prev, watchThrottleMode: 'realtime' }))}
                                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                perfFormState.watchThrottleMode === 'realtime'
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                                            }`}
                                        >
                                            Realtime
                                        </button>
                                        <button
                                            onClick={() => setPerfFormState(prev => ({ ...prev, watchThrottleMode: 'throttled' }))}
                                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                perfFormState.watchThrottleMode === 'throttled'
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                                            }`}
                                        >
                                            Throttled
                                        </button>
                                    </div>

                                    <div className={perfFormState.watchThrottleMode === 'throttled' ? '' : 'opacity-50 pointer-events-none'}>
                                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                                            Max Updates Per Second
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="range"
                                                min="1"
                                                max="30"
                                                value={perfFormState.watchMaxUpdatesPerSecond}
                                                onChange={(e) => setPerfFormState(prev => ({
                                                    ...prev,
                                                    watchMaxUpdatesPerSecond: parseInt(e.target.value) || 10
                                                }))}
                                                className="flex-1"
                                            />
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-8 text-right">
                                                {perfFormState.watchMaxUpdatesPerSecond}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            Lower values reduce CPU usage but may delay showing latest values.
                                        </p>
                                    </div>
                                </div>
                            </div>
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
        </div>
    );
}
