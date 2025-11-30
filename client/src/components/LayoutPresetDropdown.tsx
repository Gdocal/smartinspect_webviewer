/**
 * LayoutPresetDropdown - Header dropdown for quick preset selection
 *
 * Features:
 * - Shows current preset name
 * - Quick preset switching
 * - Save current state
 * - Visual indicators for default and shared presets
 * - Copy shared presets
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { PresetSummary } from '../store/logStore';

interface LayoutPresetDropdownProps {
    activePreset: PresetSummary | null;
    ownPresets: PresetSummary[];
    sharedPresets: PresetSummary[];
    loading: boolean;
    onSelectPreset: (presetId: string) => void;
    onSaveNew: (name: string, description?: string) => void;
    onCopyPreset: (presetId: string, newName: string) => void;
    onSetDefault: (presetId: string) => void;
    onOpenSettings: () => void;
}

export function LayoutPresetDropdown({
    activePreset,
    ownPresets,
    sharedPresets,
    loading,
    onSelectPreset,
    onSaveNew,
    onCopyPreset,
    onSetDefault,
    onOpenSettings
}: LayoutPresetDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showCopyModal, setShowCopyModal] = useState<PresetSummary | null>(null);
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSave = useCallback(() => {
        if (newName.trim()) {
            onSaveNew(newName.trim(), newDescription.trim() || undefined);
            setNewName('');
            setNewDescription('');
            setShowSaveModal(false);
            setIsOpen(false);
        }
    }, [newName, newDescription, onSaveNew]);

    const handleCopy = useCallback(() => {
        if (showCopyModal && newName.trim()) {
            onCopyPreset(showCopyModal.id, newName.trim());
            setNewName('');
            setShowCopyModal(null);
            setIsOpen(false);
        }
    }, [showCopyModal, newName, onCopyPreset]);

    const handleSelectPreset = useCallback((presetId: string) => {
        onSelectPreset(presetId);
        setIsOpen(false);
    }, [onSelectPreset]);

    const handleSetDefault = useCallback((presetId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onSetDefault(presetId);
    }, [onSetDefault]);

    const openCopyModal = useCallback((preset: PresetSummary, e: React.MouseEvent) => {
        e.stopPropagation();
        setShowCopyModal(preset);
        setNewName(`${preset.name} (Copy)`);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Dropdown trigger button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={loading}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Layout presets"
            >
                {/* Layout icon */}
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
                <span className="max-w-24 truncate">
                    {activePreset?.name || 'Default'}
                </span>
                {/* Dropdown arrow */}
                <svg className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown menu */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1 text-sm">
                    {/* Header */}
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Layout Presets
                    </div>

                    {/* Save current button */}
                    <button
                        onClick={() => setShowSaveModal(true)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-emerald-400 hover:bg-slate-700"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Save Current Layout
                    </button>

                    <div className="border-t border-slate-700 my-1" />

                    {/* Own presets */}
                    {ownPresets.length > 0 ? (
                        ownPresets.map(preset => (
                            <button
                                key={preset.id}
                                onClick={() => handleSelectPreset(preset.id)}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 ${
                                    activePreset?.id === preset.id ? 'bg-slate-700/50 text-blue-400' : 'text-slate-300'
                                }`}
                            >
                                {/* Default star or bullet */}
                                <span className="w-4 text-center">
                                    {preset.isDefault ? (
                                        <span className="text-amber-400" title="Default">*</span>
                                    ) : (
                                        <span className="text-slate-600">-</span>
                                    )}
                                </span>
                                <span className="flex-1 truncate text-left">{preset.name}</span>
                                {/* Set as default button */}
                                {!preset.isDefault && (
                                    <button
                                        onClick={(e) => handleSetDefault(preset.id, e)}
                                        className="p-0.5 text-slate-500 hover:text-amber-400"
                                        title="Set as default"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                        </svg>
                                    </button>
                                )}
                            </button>
                        ))
                    ) : (
                        <div className="px-3 py-2 text-slate-500 text-xs italic">
                            No saved layouts
                        </div>
                    )}

                    {/* Shared presets */}
                    {sharedPresets.length > 0 && (
                        <>
                            <div className="border-t border-slate-700 my-1" />
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                Shared
                            </div>
                            {sharedPresets.map(preset => (
                                <button
                                    key={preset.id}
                                    onClick={() => handleSelectPreset(preset.id)}
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 ${
                                        activePreset?.id === preset.id ? 'bg-slate-700/50 text-blue-400' : 'text-slate-300'
                                    }`}
                                >
                                    <span className="w-4 text-center text-slate-600">-</span>
                                    <span className="flex-1 truncate text-left">{preset.name}</span>
                                    {/* Copy button */}
                                    <button
                                        onClick={(e) => openCopyModal(preset, e)}
                                        className="p-0.5 text-slate-500 hover:text-blue-400"
                                        title="Copy to my layouts"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                    </button>
                                </button>
                            ))}
                        </>
                    )}

                    <div className="border-t border-slate-700 my-1" />

                    {/* Manage link */}
                    <button
                        onClick={() => {
                            setIsOpen(false);
                            onOpenSettings();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Manage Layouts...
                    </button>
                </div>
            )}

            {/* Save modal */}
            {showSaveModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-80 p-4">
                        <h3 className="text-white font-semibold mb-3">Save Current Layout</h3>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Layout name"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm mb-2 focus:outline-none focus:border-blue-500"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                        />
                        <input
                            type="text"
                            value={newDescription}
                            onChange={e => setNewDescription(e.target.value)}
                            placeholder="Description (optional)"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm mb-3 focus:outline-none focus:border-blue-500"
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowSaveModal(false);
                                    setNewName('');
                                    setNewDescription('');
                                }}
                                className="px-3 py-1.5 text-slate-400 hover:text-white text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!newName.trim()}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-slate-400 text-white rounded text-sm"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Copy modal */}
            {showCopyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-80 p-4">
                        <h3 className="text-white font-semibold mb-3">Copy Layout</h3>
                        <p className="text-slate-400 text-sm mb-3">
                            Copy "{showCopyModal.name}" to your layouts
                        </p>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="New layout name"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm mb-3 focus:outline-none focus:border-blue-500"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleCopy()}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowCopyModal(null);
                                    setNewName('');
                                }}
                                className="px-3 py-1.5 text-slate-400 hover:text-white text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCopy}
                                disabled={!newName.trim()}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-slate-400 text-white rounded text-sm"
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
