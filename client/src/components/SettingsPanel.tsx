/**
 * SettingsPanel - Client settings configuration modal
 */

import { useState, useEffect } from 'react';
import { useSettings, AppSettings } from '../hooks/useSettings';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onServerUrlChange?: () => void;  // Callback when server URL changes (to reconnect)
}

const MAX_ENTRIES_OPTIONS = [
    { value: 1000, label: '1,000' },
    { value: 5000, label: '5,000' },
    { value: 10000, label: '10,000' },
    { value: 50000, label: '50,000' },
    { value: 100000, label: '100,000 (All)' },
];

export function SettingsPanel({ isOpen, onClose, onServerUrlChange }: SettingsPanelProps) {
    const { settings, updateSettings, getServerUrl, defaultSettings } = useSettings();

    // Local form state
    const [formState, setFormState] = useState<AppSettings>(settings);
    const [showToken, setShowToken] = useState(false);

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

        // Save client settings
        updateSettings(formState);

        // Notify about URL change
        if (urlChanged && onServerUrlChange) {
            onServerUrlChange();
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
            <div className="bg-white rounded-lg shadow-xl w-[450px] max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Client Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(90vh-130px)]">
                    {/* Connection Section */}
                    <div>
                        <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            Connection
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">
                                    Server URL (leave empty for auto-detect)
                                </label>
                                <input
                                    type="text"
                                    value={formState.serverUrl}
                                    onChange={(e) => setFormState(prev => ({ ...prev, serverUrl: e.target.value }))}
                                    placeholder={getServerUrl()}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">
                                    Auth Token (optional)
                                </label>
                                <div className="relative">
                                    <input
                                        type={showToken ? 'text' : 'password'}
                                        value={formState.authToken || ''}
                                        onChange={(e) => setFormState(prev => ({ ...prev, authToken: e.target.value || null }))}
                                        placeholder="Enter auth token..."
                                        className="w-full px-3 py-2 pr-10 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowToken(!showToken)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showToken ? (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Display Section */}
                    <div>
                        <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                            </svg>
                            Display
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">
                                    Max entries to display in browser
                                </label>
                                <select
                                    value={formState.maxDisplayEntries}
                                    onChange={(e) => setFormState(prev => ({ ...prev, maxDisplayEntries: parseInt(e.target.value) }))}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                                >
                                    {MAX_ENTRIES_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-400 mt-1">
                                    Limits memory usage in browser. Older entries are dropped when limit is reached.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-between">
                    <button
                        onClick={handleReset}
                        className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
                    >
                        Reset to Defaults
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
