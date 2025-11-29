/**
 * HighlightRulesPanel - Configure highlighting rules for log entries
 */

import { useState } from 'react';
import { useLogStore, HighlightRule, Level } from '../store/logStore';

interface RuleEditorProps {
    rule?: HighlightRule;
    onSave: (rule: Omit<HighlightRule, 'id'>) => void;
    onCancel: () => void;
}

const fieldOptions = [
    { value: 'level', label: 'Level' },
    { value: 'sessionName', label: 'Session Name' },
    { value: 'appName', label: 'Application Name' },
    { value: 'title', label: 'Title' },
    { value: 'logEntryType', label: 'Entry Type' }
];

const operatorOptions = [
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'regex', label: 'Matches Regex' }
];

const levelOptions = [
    { value: Level.Debug, label: 'Debug' },
    { value: Level.Verbose, label: 'Verbose' },
    { value: Level.Message, label: 'Info' },
    { value: Level.Warning, label: 'Warning' },
    { value: Level.Error, label: 'Error' },
    { value: Level.Fatal, label: 'Fatal' }
];

const colorPresets = [
    { bg: '#fef2f2', text: '#991b1b', name: 'Red' },
    { bg: '#fffbeb', text: '#92400e', name: 'Amber' },
    { bg: '#ecfdf5', text: '#065f46', name: 'Green' },
    { bg: '#eff6ff', text: '#1e40af', name: 'Blue' },
    { bg: '#f5f3ff', text: '#5b21b6', name: 'Purple' },
    { bg: '#fdf4ff', text: '#86198f', name: 'Pink' },
    { bg: '#f8fafc', text: '#475569', name: 'Gray' }
];

function RuleEditor({ rule, onSave, onCancel }: RuleEditorProps) {
    const [name, setName] = useState(rule?.name || 'New Rule');
    const [enabled, setEnabled] = useState(rule?.enabled ?? true);
    const [priority, setPriority] = useState(rule?.priority ?? 1);
    const [field, setField] = useState<string>(rule?.conditions[0]?.field || 'level');
    const [operator, setOperator] = useState<string>(rule?.conditions[0]?.operator || 'equals');
    const [value, setValue] = useState<string>(String(rule?.conditions[0]?.value ?? ''));
    const [bgColor, setBgColor] = useState(rule?.style.backgroundColor || '#eff6ff');
    const [textColor, setTextColor] = useState(rule?.style.textColor || '#1e40af');
    const [fontWeight, setFontWeight] = useState<'normal' | 'bold'>(rule?.style.fontWeight || 'normal');

    const handleSave = () => {
        let parsedValue: string | number = value;
        if (field === 'level' && operator === 'equals') {
            parsedValue = parseInt(value);
        }

        onSave({
            name,
            enabled,
            priority,
            conditions: [{
                field: field as 'level' | 'sessionName' | 'appName' | 'title' | 'logEntryType',
                operator: operator as 'equals' | 'contains' | 'regex' | 'in',
                value: parsedValue
            }],
            style: {
                backgroundColor: bgColor,
                textColor: textColor,
                fontWeight
            }
        });
    };

    const applyPreset = (preset: typeof colorPresets[0]) => {
        setBgColor(preset.bg);
        setTextColor(preset.text);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-[450px] max-h-[80vh] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-semibold text-slate-800">
                        {rule ? 'Edit Highlight Rule' : 'Create Highlight Rule'}
                    </h3>
                </div>

                <div className="p-4 overflow-auto max-h-[60vh]">
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

                    {/* Condition */}
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                            Condition
                        </label>
                        <div className="flex gap-2">
                            <select
                                value={field}
                                onChange={(e) => setField(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                                {fieldOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <select
                                value={operator}
                                onChange={(e) => setOperator(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                                {operatorOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mt-2">
                            {field === 'level' && operator === 'equals' ? (
                                <select
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                >
                                    {levelOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    placeholder={operator === 'regex' ? 'Enter regex pattern...' : 'Enter value...'}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                            )}
                        </div>
                    </div>

                    {/* Style */}
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                            Style Presets
                        </label>
                        <div className="flex gap-1.5 mb-3">
                            {colorPresets.map(preset => (
                                <button
                                    key={preset.name}
                                    onClick={() => applyPreset(preset)}
                                    className="w-8 h-8 rounded border-2 border-transparent hover:border-slate-300 transition-colors"
                                    style={{ backgroundColor: preset.bg }}
                                    title={preset.name}
                                >
                                    <span className="text-xs font-bold" style={{ color: preset.text }}>A</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-4">
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
                    </div>

                    {/* Preview */}
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                            Preview
                        </label>
                        <div
                            className="px-3 py-2 rounded border border-slate-200 text-sm"
                            style={{
                                backgroundColor: bgColor,
                                color: textColor,
                                fontWeight
                            }}
                        >
                            Sample log entry text
                        </div>
                    </div>
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
                        {rule ? 'Save Changes' : 'Create Rule'}
                    </button>
                </div>
            </div>
        </div>
    );
}

interface HighlightRulesPanelProps {
    onClose: () => void;
}

export function HighlightRulesPanel({ onClose }: HighlightRulesPanelProps) {
    const { globalHighlightRules, addHighlightRule, updateHighlightRule, deleteHighlightRule } = useLogStore();
    const [showEditor, setShowEditor] = useState(false);
    const [editingRule, setEditingRule] = useState<HighlightRule | undefined>(undefined);

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
            <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[80vh] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                        </svg>
                        Highlight Rules
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-4 overflow-auto max-h-[60vh]">
                    {globalHighlightRules.length === 0 ? (
                        <div className="text-center py-8">
                            <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                            <p className="text-slate-500 text-sm mb-2">No highlight rules defined</p>
                            <p className="text-slate-400 text-xs">Create rules to customize how log entries are displayed</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {globalHighlightRules.map(rule => (
                                <div
                                    key={rule.id}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={rule.enabled}
                                        onChange={() => handleToggleRule(rule)}
                                        className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                                    />
                                    <div
                                        className="w-6 h-6 rounded border"
                                        style={{ backgroundColor: rule.style.backgroundColor }}
                                    />
                                    <div className="flex-1">
                                        <div className="font-medium text-sm text-slate-800">{rule.name}</div>
                                        <div className="text-xs text-slate-500">
                                            {rule.conditions[0]?.field} {rule.conditions[0]?.operator} "{rule.conditions[0]?.value}"
                                        </div>
                                    </div>
                                    <span className="text-xs text-slate-400">Priority: {rule.priority}</span>
                                    <button
                                        onClick={() => handleEditRule(rule)}
                                        className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors"
                                        title="Edit rule"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDeleteRule(rule.id)}
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

                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-between">
                    <button
                        onClick={handleAddRule}
                        className="px-4 py-2 text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Rule
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>

            {showEditor && (
                <RuleEditor
                    rule={editingRule}
                    onSave={handleSaveRule}
                    onCancel={() => {
                        setShowEditor(false);
                        setEditingRule(undefined);
                    }}
                />
            )}
        </div>
    );
}
