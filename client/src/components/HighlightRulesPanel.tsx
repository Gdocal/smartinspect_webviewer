/**
 * HighlightRulesPanel - Configure highlighting rules for log entries
 */

import { useState } from 'react';
import { useLogStore, HighlightRule } from '../store/logStore';
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

interface HighlightRulesPanelProps {
    onClose: () => void;
}

export function HighlightRulesPanel({ onClose }: HighlightRulesPanelProps) {
    const { globalHighlightRules, addHighlightRule, updateHighlightRule, deleteHighlightRule, sessions, appNames, hostNames } = useLogStore();
    const [showEditor, setShowEditor] = useState(false);
    const [editingRule, setEditingRule] = useState<HighlightRule | undefined>(undefined);

    // Get available values for dropdowns from store
    const availableSessions = Object.keys(sessions);
    const availableAppNames = Object.keys(appNames);
    const availableHostNames = Object.keys(hostNames);

    const handleAddRule = () => {
        setEditingRule(undefined);
        setShowEditor(true);
    };

    const handleEditRule = (rule: HighlightRule) => {
        setEditingRule(rule);
        setShowEditor(true);
    };

    const handleSaveRule = (ruleData: Omit<HighlightRule, 'id'>) => {
        if (editingRule) {
            updateHighlightRule(editingRule.id, ruleData);
        } else {
            addHighlightRule(ruleData);
        }
        setShowEditor(false);
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

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[600px] max-h-[80vh] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <svg className="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                        </svg>
                        Highlight Rules
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-4 overflow-auto max-h-[60vh]">
                    {globalHighlightRules.length === 0 ? (
                        <div className="text-center py-8">
                            <svg className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">No highlight rules defined</p>
                            <p className="text-slate-400 dark:text-slate-500 text-xs">Create rules to customize how log entries are displayed</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {globalHighlightRules.map(rule => (
                                <div
                                    key={rule.id}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={rule.enabled}
                                        onChange={() => handleToggleRule(rule)}
                                        className="rounded border-slate-300 dark:border-slate-500 text-blue-500 focus:ring-blue-500"
                                    />
                                    <div
                                        className="w-6 h-6 rounded border dark:border-slate-500"
                                        style={{ backgroundColor: rule.style.backgroundColor }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm text-slate-800 dark:text-slate-200">{rule.name}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                            {getFilterSummary(rule)}
                                        </div>
                                    </div>
                                    <span className="text-xs text-slate-400 dark:text-slate-500">Priority: {rule.priority}</span>
                                    <button
                                        onClick={() => handleEditRule(rule)}
                                        className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors"
                                        title="Edit rule"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDeleteRule(rule.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
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

                <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex justify-between">
                    <button
                        onClick={handleAddRule}
                        className="px-4 py-2 text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Rule
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>

            {showEditor && (
                <HighlightRuleEditor
                    rule={editingRule}
                    onSave={handleSaveRule}
                    onCancel={() => {
                        setShowEditor(false);
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
