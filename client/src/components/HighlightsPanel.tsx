/**
 * HighlightsPanel - Side panel for managing highlight rules
 *
 * Panel workflow (NOT modal):
 * - Inline editing with auto-save
 * - Color popup on swatch click
 * - Priority up/down arrows
 * - Expand chevron for match conditions
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    HighlightRule,
    ListTextFilter,
    TextFilter,
    defaultHighlightFilter,
    defaultListTextFilter,
    Level,
    LogEntryType,
    useLogStore
} from '../store/logStore';

// ============================================================================
// DENSITY CONFIG
// ============================================================================

const HIGHLIGHTS_DENSITY_CONFIG = {
    compact: {
        headerHeight: 'h-[28px]',
        headerPx: 'px-2',
        headerText: 'text-[11px]',
        headerIconSize: 'w-3 h-3',
        rowPy: 'py-0.5',
        rowPx: 'px-2',
        rowText: 'text-xs',
        rowIconSize: 'w-3 h-3',
        buttonPadding: 'px-1 py-0.5',
        buttonText: 'text-[10px]',
        inputHeight: 'h-[20px]',
        inputText: 'text-xs',
        gap: 'gap-1',
        checkboxSize: 'w-3 h-3',
        colorSwatchSize: 'w-4 h-4',
        smallIconSize: 'w-2.5 h-2.5',
    },
    default: {
        headerHeight: 'h-[32px]',
        headerPx: 'px-3',
        headerText: 'text-xs',
        headerIconSize: 'w-3.5 h-3.5',
        rowPy: 'py-1',
        rowPx: 'px-2',
        rowText: 'text-sm',
        rowIconSize: 'w-3.5 h-3.5',
        buttonPadding: 'px-1.5 py-0.5',
        buttonText: 'text-xs',
        inputHeight: 'h-[22px]',
        inputText: 'text-xs',
        gap: 'gap-1.5',
        checkboxSize: 'w-3.5 h-3.5',
        colorSwatchSize: 'w-5 h-5',
        smallIconSize: 'w-3 h-3',
    },
    comfortable: {
        headerHeight: 'h-[38px]',
        headerPx: 'px-4',
        headerText: 'text-sm',
        headerIconSize: 'w-4 h-4',
        rowPy: 'py-1.5',
        rowPx: 'px-3',
        rowText: 'text-sm',
        rowIconSize: 'w-4 h-4',
        buttonPadding: 'px-2 py-1',
        buttonText: 'text-sm',
        inputHeight: 'h-[26px]',
        inputText: 'text-sm',
        gap: 'gap-2',
        checkboxSize: 'w-4 h-4',
        colorSwatchSize: 'w-6 h-6',
        smallIconSize: 'w-3.5 h-3.5',
    },
};

// ============================================================================
// COLOR PALETTE
// ============================================================================

const colorPalette = {
    red: { light: { bg: '#fef2f2', text: '#991b1b' }, medium: { bg: '#fecaca', text: '#991b1b' }, dark: { bg: '#dc2626', text: '#ffffff' } },
    orange: { light: { bg: '#fff7ed', text: '#9a3412' }, medium: { bg: '#fed7aa', text: '#9a3412' }, dark: { bg: '#ea580c', text: '#ffffff' } },
    amber: { light: { bg: '#fffbeb', text: '#92400e' }, medium: { bg: '#fde68a', text: '#78350f' }, dark: { bg: '#d97706', text: '#ffffff' } },
    green: { light: { bg: '#ecfdf5', text: '#065f46' }, medium: { bg: '#a7f3d0', text: '#065f46' }, dark: { bg: '#16a34a', text: '#ffffff' } },
    blue: { light: { bg: '#eff6ff', text: '#1e40af' }, medium: { bg: '#bfdbfe', text: '#1e40af' }, dark: { bg: '#2563eb', text: '#ffffff' } },
    purple: { light: { bg: '#f5f3ff', text: '#5b21b6' }, medium: { bg: '#ddd6fe', text: '#5b21b6' }, dark: { bg: '#7c3aed', text: '#ffffff' } },
    gray: { light: { bg: '#f8fafc', text: '#334155' }, medium: { bg: '#e2e8f0', text: '#1e293b' }, dark: { bg: '#475569', text: '#ffffff' } },
};

type ColorFamily = keyof typeof colorPalette;
type Intensity = 'light' | 'medium' | 'dark';

// Get all possible colors for random selection
const ALL_COLORS: { bg: string; text: string }[] = [];
Object.values(colorPalette).forEach(intensities => {
    Object.values(intensities).forEach(colors => {
        ALL_COLORS.push(colors);
    });
});

// Get a random unique color not used by existing rules
function getRandomUniqueColor(existingRules: HighlightRule[]): { backgroundColor: string; textColor: string } {
    const usedColors = new Set(existingRules.map(r => r.style.backgroundColor).filter(Boolean));
    const availableColors = ALL_COLORS.filter(c => !usedColors.has(c.bg));

    // If all colors are used, just pick a random one
    const colorPool = availableColors.length > 0 ? availableColors : ALL_COLORS;
    const randomColor = colorPool[Math.floor(Math.random() * colorPool.length)];

    return { backgroundColor: randomColor.bg, textColor: randomColor.text };
}

// ============================================================================
// FILTER CONSTANTS
// ============================================================================

const LEVEL_LABELS: Record<number, string> = {
    [Level.Debug]: 'Debug',
    [Level.Verbose]: 'Verbose',
    [Level.Message]: 'Info',
    [Level.Warning]: 'Warning',
    [Level.Error]: 'Error',
    [Level.Fatal]: 'Fatal',
};

const LEVEL_VALUES = Object.keys(LEVEL_LABELS).map(k => parseInt(k));

// Entry type labels (grouped for display)
const ENTRY_TYPE_LABELS: Record<number, string> = {
    [LogEntryType.Separator]: 'Separator',
    [LogEntryType.EnterMethod]: 'Enter',
    [LogEntryType.LeaveMethod]: 'Leave',
    [LogEntryType.Message]: 'Message',
    [LogEntryType.Warning]: 'Warning',
    [LogEntryType.Error]: 'Error',
    [LogEntryType.Text]: 'Text',
    [LogEntryType.Binary]: 'Binary',
    [LogEntryType.Graphic]: 'Graphic',
    [LogEntryType.Source]: 'Source',
    [LogEntryType.Object]: 'Object',
    [LogEntryType.Checkpoint]: 'Checkpoint',
    [LogEntryType.Comment]: 'Comment',
    [LogEntryType.VariableValue]: 'Variable',
};

const ENTRY_TYPE_VALUES = Object.keys(ENTRY_TYPE_LABELS).map(k => parseInt(k));

// ============================================================================
// CHECKBOX COMPONENT
// ============================================================================

function Checkbox({ checked, onChange, size = 'w-4 h-4' }: { checked: boolean; onChange: (v: boolean) => void; size?: string }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`${size} rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                checked ? 'bg-blue-500 border-blue-500' : 'bg-slate-100 dark:bg-slate-600 border-slate-300 dark:border-slate-500'
            }`}
        >
            {checked && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            )}
        </button>
    );
}

// ============================================================================
// COLOR POPUP (floating portal)
// ============================================================================

interface ColorPopupProps {
    anchorRect: DOMRect;
    bgColor?: string;
    textColor?: string;
    fontWeight?: 'normal' | 'bold';
    onChange: (style: { backgroundColor?: string; textColor?: string; fontWeight?: 'normal' | 'bold' }) => void;
    onClose: () => void;
}

function ColorPopup({ anchorRect, bgColor, textColor, fontWeight = 'normal', onChange, onClose }: ColorPopupProps) {
    const popupRef = useRef<HTMLDivElement>(null);

    // Detect current selection
    const currentSelection = useMemo(() => {
        if (!bgColor) return null;
        for (const [family, intensities] of Object.entries(colorPalette)) {
            for (const [intensity, colors] of Object.entries(intensities)) {
                if (colors.bg === bgColor) {
                    return { family: family as ColorFamily, intensity: intensity as Intensity };
                }
            }
        }
        return null;
    }, [bgColor]);

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleColorClick = (family: ColorFamily, intensity: Intensity = 'medium') => {
        const colors = colorPalette[family][intensity];
        onChange({ backgroundColor: colors.bg, textColor: colors.text, fontWeight });
    };

    const handleIntensityClick = (intensity: Intensity) => {
        if (currentSelection) {
            const colors = colorPalette[currentSelection.family][intensity];
            onChange({ backgroundColor: colors.bg, textColor: colors.text, fontWeight });
        }
    };

    const handleClearColor = () => {
        onChange({ backgroundColor: undefined, textColor: undefined, fontWeight });
    };

    return createPortal(
        <div
            ref={popupRef}
            className="fixed z-[9999] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl p-2"
            style={{ top: anchorRect.bottom + 4, left: anchorRect.left }}
        >
            {/* Color grid */}
            <div className="flex gap-1 mb-2">
                {Object.entries(colorPalette).map(([family, intensities]) => {
                    const isSelected = currentSelection?.family === family;
                    const displayIntensity = isSelected && currentSelection ? currentSelection.intensity : 'medium';
                    const colors = intensities[displayIntensity];
                    return (
                        <button
                            key={family}
                            type="button"
                            onClick={() => handleColorClick(family as ColorFamily)}
                            className={`w-6 h-6 rounded text-[9px] font-bold transition-all ${
                                isSelected ? 'ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'
                            }`}
                            style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                            A
                        </button>
                    );
                })}
                {/* Clear button */}
                <button
                    type="button"
                    onClick={handleClearColor}
                    className={`w-6 h-6 rounded border border-slate-300 dark:border-slate-500 text-[9px] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-600 ${
                        !bgColor ? 'ring-2 ring-offset-1 ring-slate-400' : ''
                    }`}
                    title="No color"
                >
                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Intensity selector */}
            {currentSelection && (
                <div className="flex items-center gap-1 mb-2">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">Intensity:</span>
                    {(['light', 'medium', 'dark'] as const).map(intensity => {
                        const isActive = currentSelection.intensity === intensity;
                        const colors = colorPalette[currentSelection.family][intensity];
                        return (
                            <button
                                key={intensity}
                                type="button"
                                onClick={() => handleIntensityClick(intensity)}
                                className={`w-5 h-5 rounded text-[8px] font-bold ${
                                    isActive ? 'ring-1 ring-offset-1 ring-slate-400' : 'hover:scale-110'
                                }`}
                                style={{ backgroundColor: colors.bg, color: colors.text }}
                            >
                                A
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Font weight */}
            <div className="flex gap-1 border-t border-slate-200 dark:border-slate-600 pt-2">
                <button
                    type="button"
                    onClick={() => onChange({ backgroundColor: bgColor, textColor, fontWeight: 'normal' })}
                    className={`px-2 py-0.5 text-[10px] rounded ${
                        fontWeight === 'normal' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                    }`}
                >
                    Normal
                </button>
                <button
                    type="button"
                    onClick={() => onChange({ backgroundColor: bgColor, textColor, fontWeight: 'bold' })}
                    className={`px-2 py-0.5 text-[10px] rounded font-bold ${
                        fontWeight === 'bold' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                    }`}
                >
                    Bold
                </button>
            </div>

            {/* Confirm button */}
            <div className="flex justify-end border-t border-slate-200 dark:border-slate-600 pt-2 mt-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1 text-[11px] rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                >
                    Done
                </button>
            </div>
        </div>,
        document.body
    );
}

// ============================================================================
// LIST/TEXT FILTER DROPDOWN
// ============================================================================

interface ListTextFilterDropdownProps {
    label: string;
    filter: ListTextFilter;
    onChange: (filter: ListTextFilter) => void;
    availableValues?: string[];  // For list mode autocomplete
}

function ListTextFilterDropdown({ label, filter, onChange, availableValues = [] }: ListTextFilterDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Position dropdown
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 2, left: rect.left });
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [isOpen]);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    const isActive = filter.mode === 'list' ? filter.values.length > 0 : filter.textValue.trim() !== '';

    // Summary text for button
    const getSummary = () => {
        if (!isActive) return <span className="text-slate-400 dark:text-slate-500 italic">any</span>;
        if (filter.mode === 'list') {
            const prefix = filter.inverse ? '−' : '+';
            return <span className={filter.inverse ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                {prefix}{filter.values.length} {filter.values.length === 1 ? 'item' : 'items'}
            </span>;
        } else {
            const prefix = filter.inverse ? '−' : '+';
            const op = filter.textOperator === 'contains' ? '≈' : filter.textOperator === 'equals' ? '=' : '.*';
            return <span className={filter.inverse ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                {prefix}{op}"{filter.textValue.slice(0, 15)}{filter.textValue.length > 15 ? '…' : ''}"
            </span>;
        }
    };

    const addValue = () => {
        const trimmed = inputValue.trim();
        if (trimmed && !filter.values.includes(trimmed)) {
            onChange({ ...filter, values: [...filter.values, trimmed] });
            setInputValue('');
        }
    };

    const removeValue = (val: string) => {
        onChange({ ...filter, values: filter.values.filter(v => v !== val) });
    };

    // Filter available values for autocomplete
    const suggestions = useMemo(() => {
        if (!inputValue.trim()) return availableValues.filter(v => !filter.values.includes(v)).slice(0, 8);
        const lower = inputValue.toLowerCase();
        return availableValues.filter(v => v.toLowerCase().includes(lower) && !filter.values.includes(v)).slice(0, 8);
    }, [availableValues, inputValue, filter.values]);

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                    isOpen
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 bg-white dark:bg-slate-700'
                }`}
            >
                <span className="text-slate-500 dark:text-slate-400">{label}:</span>
                {getSummary()}
                <svg className={`w-2.5 h-2.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-[9999] w-64 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl"
                    style={{ top: dropdownPos.top, left: Math.min(dropdownPos.left, window.innerWidth - 270) }}
                >
                    {/* Mode toggle */}
                    <div className="flex border-b border-slate-100 dark:border-slate-600">
                        <button
                            type="button"
                            onClick={() => onChange({ ...filter, mode: 'list' })}
                            className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                                filter.mode === 'list'
                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600'
                            }`}
                        >
                            List
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange({ ...filter, mode: 'text' })}
                            className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                                filter.mode === 'text'
                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600'
                            }`}
                        >
                            Text
                        </button>
                    </div>

                    {/* List mode */}
                    {filter.mode === 'list' && (
                        <div className="p-2 space-y-2">
                            {/* Current values */}
                            {filter.values.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {filter.values.map(v => (
                                        <span key={v} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded ${
                                            filter.inverse ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                        }`}>
                                            {v}
                                            <button type="button" onClick={() => removeValue(v)} className="hover:opacity-70 ml-0.5">×</button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            {/* Add input */}
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addValue(); } }}
                                placeholder="Type to add..."
                                className="w-full h-7 px-2 text-[11px] border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 outline-none focus:border-blue-400"
                            />
                            {/* Suggestions */}
                            {suggestions.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {suggestions.map(v => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => onChange({ ...filter, values: [...filter.values, v] })}
                                            className="px-1.5 py-0.5 text-[9px] bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-500"
                                        >
                                            + {v}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Text mode */}
                    {filter.mode === 'text' && (
                        <div className="p-2 space-y-2">
                            <div className="flex gap-1">
                                <select
                                    value={filter.textOperator}
                                    onChange={(e) => onChange({ ...filter, textOperator: e.target.value as ListTextFilter['textOperator'] })}
                                    className="h-7 px-1 text-[10px] border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-600"
                                >
                                    <option value="contains">Contains</option>
                                    <option value="equals">Equals</option>
                                    <option value="starts">Starts with</option>
                                    <option value="ends">Ends with</option>
                                    <option value="regex">Regex</option>
                                </select>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={filter.textValue}
                                    onChange={(e) => onChange({ ...filter, textValue: e.target.value })}
                                    placeholder="Enter text..."
                                    className="flex-1 h-7 px-2 text-[11px] border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 outline-none focus:border-blue-400"
                                />
                            </div>
                            {/* Case sensitive checkbox */}
                            <label className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={filter.caseSensitive || false}
                                    onChange={(e) => onChange({ ...filter, caseSensitive: e.target.checked })}
                                    className="w-3.5 h-3.5 rounded"
                                />
                                Case sensitive
                            </label>
                        </div>
                    )}

                    {/* Include/Exclude toggle - only when filter has value */}
                    {isActive && (
                        <div className="flex border-t border-slate-100 dark:border-slate-600">
                            <button
                                type="button"
                                onClick={() => onChange({ ...filter, inverse: false })}
                                className={`flex-1 py-1.5 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
                                    !filter.inverse
                                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600'
                                }`}
                            >
                                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M6 2v8M2 6h8" />
                                </svg>
                                Include
                            </button>
                            <button
                                type="button"
                                onClick={() => onChange({ ...filter, inverse: true })}
                                className={`flex-1 py-1.5 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
                                    filter.inverse
                                        ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600'
                                }`}
                            >
                                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M2 6h8" />
                                </svg>
                                Exclude
                            </button>
                        </div>
                    )}

                    {/* Done button */}
                    <div className="p-2 border-t border-slate-100 dark:border-slate-600">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="w-full py-1 text-[10px] font-medium bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                            Done
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

// ============================================================================
// MULTI-SELECT FILTER DROPDOWN (for Levels and Entry Types)
// ============================================================================

interface MultiSelectFilterDropdownProps {
    label: string;
    values: number[];
    inverse: boolean;
    onChange: (values: number[], inverse: boolean) => void;
    options: { value: number; label: string }[];
}

function MultiSelectFilterDropdown({ label, values, inverse, onChange, options }: MultiSelectFilterDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 2, left: rect.left });
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    const toggleValue = (val: number) => {
        const newValues = values.includes(val) ? values.filter(v => v !== val) : [...values, val];
        onChange(newValues, inverse);
    };

    const isActive = values.length > 0;

    const getSummary = () => {
        if (!isActive) return <span className="text-slate-400 dark:text-slate-500 italic">any</span>;
        const prefix = inverse ? '−' : '+';
        const labels = values.map(v => options.find(o => o.value === v)?.label || v).slice(0, 2);
        const more = values.length > 2 ? ` +${values.length - 2}` : '';
        return <span className={inverse ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
            {prefix}{labels.join(', ')}{more}
        </span>;
    };

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                    isOpen
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 bg-white dark:bg-slate-700'
                }`}
            >
                <span className="text-slate-500 dark:text-slate-400">{label}:</span>
                {getSummary()}
                <svg className={`w-2.5 h-2.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-[9999] w-56 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl"
                    style={{ top: dropdownPos.top, left: Math.min(dropdownPos.left, window.innerWidth - 230) }}
                >
                    {/* Options grid */}
                    <div className="p-2">
                        <div className="flex flex-wrap gap-1">
                            {options.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => toggleValue(opt.value)}
                                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                                        values.includes(opt.value)
                                            ? inverse ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                                            : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Include/Exclude toggle */}
                    {isActive && (
                        <div className="flex border-t border-slate-100 dark:border-slate-600">
                            <button
                                type="button"
                                onClick={() => onChange(values, false)}
                                className={`flex-1 py-1.5 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
                                    !inverse
                                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600'
                                }`}
                            >
                                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M6 2v8M2 6h8" />
                                </svg>
                                Include
                            </button>
                            <button
                                type="button"
                                onClick={() => onChange(values, true)}
                                className={`flex-1 py-1.5 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
                                    inverse
                                        ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600'
                                }`}
                            >
                                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M2 6h8" />
                                </svg>
                                Exclude
                            </button>
                        </div>
                    )}

                    {/* Done button */}
                    <div className="p-2 border-t border-slate-100 dark:border-slate-600">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="w-full py-1 text-[10px] font-medium bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                            Done
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

// Build options arrays for levels and entry types
const LEVEL_OPTIONS = LEVEL_VALUES.map(v => ({ value: v, label: LEVEL_LABELS[v] }));
const ENTRY_TYPE_OPTIONS = ENTRY_TYPE_VALUES.map(v => ({ value: v, label: ENTRY_TYPE_LABELS[v] }));

// ============================================================================
// HIGHLIGHT RULE ROW
// ============================================================================

interface HighlightRuleRowProps {
    rule: HighlightRule;
    onUpdate: (updates: Partial<HighlightRule>) => void;
    onDelete: () => void;
    onPriorityUp: () => void;
    onPriorityDown: () => void;
    density: typeof HIGHLIGHTS_DENSITY_CONFIG.default;
    defaultExpanded?: boolean;
    availableSessions: string[];
    availableAppNames: string[];
    availableHostNames: string[];
}

function HighlightRuleRow({ rule, onUpdate, onDelete, onPriorityUp, onPriorityDown, density, defaultExpanded = false, availableSessions, availableAppNames, availableHostNames }: HighlightRuleRowProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [colorPopupOpen, setColorPopupOpen] = useState(false);
    const [nameEditing, setNameEditing] = useState(false);
    const [editingName, setEditingName] = useState(rule.name);
    const colorSwatchRef = useRef<HTMLButtonElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);

    // Sync editing name when rule changes
    useEffect(() => {
        setEditingName(rule.name);
    }, [rule.name]);

    // Focus name input when editing
    useEffect(() => {
        if (nameEditing && nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
        }
    }, [nameEditing]);

    const handleNameBlur = () => {
        setNameEditing(false);
        if (editingName.trim() && editingName !== rule.name) {
            onUpdate({ name: editingName.trim() });
        } else {
            setEditingName(rule.name);
        }
    };

    const handleNameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleNameBlur();
        } else if (e.key === 'Escape') {
            setEditingName(rule.name);
            setNameEditing(false);
        }
    };

    const handleColorChange = (style: { backgroundColor?: string; textColor?: string; fontWeight?: 'normal' | 'bold' }) => {
        onUpdate({ style: { ...rule.style, ...style } });
    };

    // Filter update helpers
    const updateSessionFilter = (sessionFilter: ListTextFilter) => {
        onUpdate({ filter: { ...rule.filter, sessionFilter } });
    };

    const updateAppNameFilter = (appNameFilter: ListTextFilter) => {
        onUpdate({ filter: { ...rule.filter, appNameFilter } });
    };

    const updateHostNameFilter = (hostNameFilter: ListTextFilter) => {
        onUpdate({ filter: { ...rule.filter, hostNameFilter } });
    };

    const updateLevels = (levels: number[], levelsInverse: boolean) => {
        onUpdate({ filter: { ...rule.filter, levels, levelsInverse } });
    };

    const updateEntryTypes = (entryTypes: number[], entryTypesInverse: boolean) => {
        onUpdate({ filter: { ...rule.filter, entryTypes, entryTypesInverse } });
    };

    const updateTitleFilter = (titleFilter: TextFilter) => {
        onUpdate({ filter: { ...rule.filter, titleFilter } });
    };

    // Get filter values with defaults
    const sessionFilter = rule.filter.sessionFilter || defaultListTextFilter;
    const appNameFilter = rule.filter.appNameFilter || defaultListTextFilter;
    const hostNameFilter = rule.filter.hostNameFilter || defaultListTextFilter;
    const titleFilter = rule.filter.titleFilter || { value: '', operator: 'contains' as const, inverse: false, caseSensitive: false };

    // Check if filter has any value (for list/text filter)
    const isListTextFilterActive = (f: ListTextFilter) =>
        f.mode === 'list' ? f.values.length > 0 : f.textValue.trim() !== '';

    // Check if has active filters
    const hasFilters = titleFilter.value.trim() !== '';
    const hasAdvancedFilters =
        isListTextFilterActive(sessionFilter) ||
        isListTextFilterActive(appNameFilter) ||
        isListTextFilterActive(hostNameFilter) ||
        (rule.filter.levels?.length || 0) > 0 ||
        (rule.filter.entryTypes?.length || 0) > 0;

    return (
        <div className={`border-b border-slate-200 dark:border-slate-700 ${!rule.enabled ? 'opacity-50' : ''}`}>
            {/* Main row */}
            <div className={`flex items-center ${density.gap} ${density.rowPx} ${density.rowPy}`}>
                {/* Checkbox */}
                <Checkbox
                    checked={rule.enabled}
                    onChange={(v) => onUpdate({ enabled: v })}
                    size={density.checkboxSize}
                />

                {/* Color swatch */}
                <button
                    ref={colorSwatchRef}
                    type="button"
                    onClick={() => setColorPopupOpen(true)}
                    className={`${density.colorSwatchSize} rounded border border-slate-300 dark:border-slate-500 flex-shrink-0 transition-all hover:scale-110`}
                    style={{ backgroundColor: rule.style.backgroundColor || 'transparent' }}
                    title="Click to change color"
                >
                    {!rule.style.backgroundColor && (
                        <svg className="w-full h-full text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    )}
                </button>

                {/* Name (inline editable) */}
                {nameEditing ? (
                    <input
                        ref={nameInputRef}
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={handleNameBlur}
                        onKeyDown={handleNameKeyDown}
                        className={`flex-1 min-w-0 ${density.inputHeight} ${density.inputText} px-1 border border-blue-400 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none`}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => setNameEditing(true)}
                        className={`flex-1 min-w-0 text-left ${density.rowText} text-slate-700 dark:text-slate-200 truncate hover:text-blue-600 dark:hover:text-blue-400`}
                        style={{ fontWeight: rule.style.fontWeight }}
                    >
                        {rule.name}
                    </button>
                )}

                {/* Priority up/down */}
                <div className="flex flex-col">
                    <button
                        type="button"
                        onClick={onPriorityUp}
                        className="p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        title="Increase priority"
                    >
                        <svg className={density.smallIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={onPriorityDown}
                        className="p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        title="Decrease priority"
                    >
                        <svg className={density.smallIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>

                {/* Delete */}
                <button
                    type="button"
                    onClick={onDelete}
                    className="p-0.5 text-slate-400 hover:text-red-500 transition-colors"
                    title="Delete rule"
                >
                    <svg className={density.smallIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Expand chevron */}
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={`p-0.5 text-slate-400 hover:text-slate-600 transition-transform relative ${isExpanded ? 'rotate-180' : ''}`}
                    title={isExpanded ? 'Collapse' : 'Expand match conditions'}
                >
                    <svg className={density.smallIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    {(hasFilters || hasAdvancedFilters) && !isExpanded && (
                        <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    )}
                </button>
            </div>

            {/* Color popup */}
            {colorPopupOpen && colorSwatchRef.current && (
                <ColorPopup
                    anchorRect={colorSwatchRef.current.getBoundingClientRect()}
                    bgColor={rule.style.backgroundColor}
                    textColor={rule.style.textColor}
                    fontWeight={rule.style.fontWeight}
                    onChange={handleColorChange}
                    onClose={() => setColorPopupOpen(false)}
                />
            )}

            {/* Expanded match conditions */}
            {isExpanded && (
                <div className={`${density.rowPx} pb-2 pt-1 bg-slate-50 dark:bg-slate-800/50`}>
                    {/* Title filter - compact inline with operator prefix */}
                    <div className="flex items-center gap-1 mb-2">
                        <select
                            value={titleFilter.operator}
                            onChange={(e) => updateTitleFilter({ ...titleFilter, operator: e.target.value as TextFilter['operator'] })}
                            className="h-6 px-1 text-[10px] bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded outline-none cursor-pointer flex-shrink-0"
                        >
                            <option value="contains">Contains</option>
                            <option value="equals">Equals</option>
                            <option value="starts">Starts with</option>
                            <option value="ends">Ends with</option>
                            <option value="regex">Regex</option>
                        </select>
                        <input
                            type="text"
                            value={titleFilter.value}
                            onChange={(e) => updateTitleFilter({ ...titleFilter, value: e.target.value })}
                            placeholder="Filter by title..."
                            className="flex-1 h-6 px-2 text-[11px] border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 outline-none focus:border-blue-400 min-w-0"
                        />
                        <button
                            type="button"
                            onClick={() => updateTitleFilter({ ...titleFilter, caseSensitive: !titleFilter.caseSensitive })}
                            className={`h-6 px-1.5 text-[10px] rounded border transition-colors flex-shrink-0 ${
                                titleFilter.caseSensitive
                                    ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                                    : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                            }`}
                            title="Case sensitive"
                        >
                            Aa
                        </button>
                    </div>

                    {/* Advanced filters toggle */}
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 mb-1.5"
                    >
                        <svg className={`w-2.5 h-2.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        More filters
                        {hasAdvancedFilters && (
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                        )}
                    </button>

                    {/* Advanced filters - hidden by default */}
                    {showAdvanced && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <ListTextFilterDropdown label="Session" filter={sessionFilter} onChange={updateSessionFilter} availableValues={availableSessions} />
                            <ListTextFilterDropdown label="App" filter={appNameFilter} onChange={updateAppNameFilter} availableValues={availableAppNames} />
                            <ListTextFilterDropdown label="Host" filter={hostNameFilter} onChange={updateHostNameFilter} availableValues={availableHostNames} />
                            <MultiSelectFilterDropdown
                                label="Levels"
                                values={rule.filter.levels || []}
                                inverse={rule.filter.levelsInverse || false}
                                onChange={updateLevels}
                                options={LEVEL_OPTIONS}
                            />
                            <MultiSelectFilterDropdown
                                label="Types"
                                values={rule.filter.entryTypes || []}
                                inverse={rule.filter.entryTypesInverse || false}
                                onChange={updateEntryTypes}
                                options={ENTRY_TYPE_OPTIONS}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// MAIN HIGHLIGHTS PANEL
// ============================================================================

interface HighlightsPanelProps {
    onClose: () => void;
}

export function HighlightsPanel({ onClose }: HighlightsPanelProps) {
    const {
        globalHighlightRules,
        addHighlightRule,
        updateHighlightRule,
        deleteHighlightRule,
        rowDensity,
        sessions,
        appNames,
        hostNames
    } = useLogStore();

    // Convert to arrays for dropdown suggestions
    const availableSessions = useMemo(() => Object.keys(sessions), [sessions]);
    const availableAppNames = useMemo(() => Object.keys(appNames), [appNames]);
    const availableHostNames = useMemo(() => Object.keys(hostNames), [hostNames]);

    // Track newly added rule ID for auto-expand
    const [newlyAddedRuleId, setNewlyAddedRuleId] = useState<string | null>(null);

    const density = HIGHLIGHTS_DENSITY_CONFIG[rowDensity];
    const enabledCount = globalHighlightRules.filter(r => r.enabled).length;

    const handleAddRule = () => {
        // Get a random unique color
        const randomColor = getRandomUniqueColor(globalHighlightRules);

        const newRule: Omit<HighlightRule, 'id'> = {
            name: 'New Rule',
            enabled: true,
            priority: globalHighlightRules.length + 1,
            filter: { ...defaultHighlightFilter },
            style: {
                backgroundColor: randomColor.backgroundColor,
                textColor: randomColor.textColor,
                fontWeight: 'normal'
            }
        };
        const newId = addHighlightRule(newRule);
        setNewlyAddedRuleId(newId);
    };

    const handlePriorityUp = (id: string) => {
        const rule = globalHighlightRules.find(r => r.id === id);
        if (rule) {
            updateHighlightRule(id, { priority: rule.priority + 1 });
        }
    };

    const handlePriorityDown = (id: string) => {
        const rule = globalHighlightRules.find(r => r.id === id);
        if (rule && rule.priority > 1) {
            updateHighlightRule(id, { priority: rule.priority - 1 });
        }
    };

    // Sort rules by priority (highest first)
    const sortedRules = useMemo(() =>
        [...globalHighlightRules].sort((a, b) => b.priority - a.priority),
        [globalHighlightRules]
    );

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
            {/* Header */}
            <div className={`${density.headerHeight} ${density.headerPx} flex items-center justify-between border-b border-slate-200 dark:border-slate-700 flex-shrink-0`}>
                <div className="flex items-center gap-2">
                    <svg className={`${density.headerIconSize} text-amber-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    <span className={`${density.headerText} font-semibold text-slate-700 dark:text-slate-200`}>
                        Highlights
                    </span>
                    {enabledCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                            {enabledCount}
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                    <svg className={density.headerIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Rules list */}
            <div className="flex-1 overflow-auto">
                {sortedRules.map(rule => (
                    <HighlightRuleRow
                        key={rule.id}
                        rule={rule}
                        onUpdate={(updates) => updateHighlightRule(rule.id, updates)}
                        onDelete={() => deleteHighlightRule(rule.id)}
                        onPriorityUp={() => handlePriorityUp(rule.id)}
                        onPriorityDown={() => handlePriorityDown(rule.id)}
                        density={density}
                        defaultExpanded={rule.id === newlyAddedRuleId}
                        availableSessions={availableSessions}
                        availableAppNames={availableAppNames}
                        availableHostNames={availableHostNames}
                    />
                ))}

                {globalHighlightRules.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                        <p className={`${density.rowText} text-slate-400 dark:text-slate-500`}>
                            No highlight rules
                        </p>
                    </div>
                )}
            </div>

            {/* Add button (panel style) */}
            <div className={`${density.rowPx} ${density.rowPy} border-t border-slate-200 dark:border-slate-700`}>
                <button
                    onClick={handleAddRule}
                    className={`${density.buttonText} text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1`}
                >
                    <svg className={density.smallIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add highlight rule
                </button>
            </div>
        </div>
    );
}
