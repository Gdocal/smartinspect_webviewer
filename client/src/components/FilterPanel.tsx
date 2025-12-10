/**
 * FilterPanel - Side panel for managing view filters
 *
 * Features:
 * - Multiple rules per field (sessions, levels, apps, hosts, titles, entry types)
 * - Each rule can be enabled/disabled, include/exclude
 * - Operators: list, contains, starts, ends, regex, equals
 * - Vertical list layout with inline editing
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    FilterRule,
    FilterRules,
    FilterV2,
    FilterOperator,
    createFilterRule,
    createDefaultFilterV2,
    countActiveRules,
    Level,
    LogEntryType,
    useLogStore
} from '../store/logStore';

// ============================================================================
// CONSTANTS
// ============================================================================

// Level labels for display
const LEVEL_LABELS: Record<number, string> = {
    [Level.Debug]: 'Debug',
    [Level.Verbose]: 'Verbose',
    [Level.Message]: 'Info',
    [Level.Warning]: 'Warning',
    [Level.Error]: 'Error',
    [Level.Fatal]: 'Fatal',
};

const LEVEL_VALUES = Object.keys(LEVEL_LABELS).map(k => parseInt(k));

// Entry type labels grouped
const ENTRY_TYPE_GROUPS: Record<string, { value: number; label: string }[]> = {
    'Control': [
        { value: LogEntryType.Separator, label: 'Separator' },
        { value: LogEntryType.EnterMethod, label: 'Enter Method' },
        { value: LogEntryType.LeaveMethod, label: 'Leave Method' },
        { value: LogEntryType.ResetCallstack, label: 'Reset Callstack' },
    ],
    'Messages': [
        { value: LogEntryType.Message, label: 'Message' },
        { value: LogEntryType.Warning, label: 'Warning' },
        { value: LogEntryType.Error, label: 'Error' },
        { value: LogEntryType.InternalError, label: 'Internal Error' },
        { value: LogEntryType.Comment, label: 'Comment' },
        { value: LogEntryType.VariableValue, label: 'Variable' },
        { value: LogEntryType.Checkpoint, label: 'Checkpoint' },
        { value: LogEntryType.Debug, label: 'Debug' },
        { value: LogEntryType.Verbose, label: 'Verbose' },
        { value: LogEntryType.Fatal, label: 'Fatal' },
    ],
    'Data': [
        { value: LogEntryType.Text, label: 'Text' },
        { value: LogEntryType.Binary, label: 'Binary' },
        { value: LogEntryType.Graphic, label: 'Graphic' },
        { value: LogEntryType.Source, label: 'Source' },
        { value: LogEntryType.Object, label: 'Object' },
        { value: LogEntryType.WebContent, label: 'Web Content' },
        { value: LogEntryType.System, label: 'System' },
    ],
};

const ALL_ENTRY_TYPES = Object.values(ENTRY_TYPE_GROUPS).flat();

// Operator labels for display
const OPERATOR_LABELS: Record<FilterOperator, string> = {
    list: 'is',
    contains: 'contains',
    starts: 'starts with',
    ends: 'ends with',
    regex: 'regex',
    equals: 'equals',
};

// ============================================================================
// DENSITY CONFIG
// ============================================================================

type RowDensity = 'compact' | 'default' | 'comfortable';

const FILTER_DENSITY_CONFIG = {
    compact: {
        headerHeight: 'h-[28px]',
        headerPx: 'px-2',
        headerText: 'text-[11px]',
        headerIconSize: 'w-3 h-3',
        sectionPy: 'py-1',
        sectionPx: 'px-2',
        sectionText: 'text-[11px]',
        sectionIconSize: 'w-3 h-3',
        rowPy: 'py-1',
        rowPx: 'px-2',
        rowText: 'text-xs',
        rowIconSize: 'w-3 h-3',
        buttonPadding: 'px-1.5 py-0.5',
        buttonText: 'text-[10px]',
        inputHeight: 'h-[22px]',
        inputText: 'text-xs',
        gap: 'gap-1',
        dropdownWidth: 'w-56',
        checkboxSize: 'w-3 h-3',
    },
    default: {
        headerHeight: 'h-[32px]',
        headerPx: 'px-3',
        headerText: 'text-xs',
        headerIconSize: 'w-3.5 h-3.5',
        sectionPy: 'py-1.5',
        sectionPx: 'px-3',
        sectionText: 'text-xs',
        sectionIconSize: 'w-3.5 h-3.5',
        rowPy: 'py-1.5',
        rowPx: 'px-2',
        rowText: 'text-sm',
        rowIconSize: 'w-3.5 h-3.5',
        buttonPadding: 'px-2 py-1',
        buttonText: 'text-xs',
        inputHeight: 'h-[24px]',
        inputText: 'text-xs',
        gap: 'gap-1.5',
        dropdownWidth: 'w-64',
        checkboxSize: 'w-3.5 h-3.5',
    },
    comfortable: {
        headerHeight: 'h-[38px]',
        headerPx: 'px-4',
        headerText: 'text-sm',
        headerIconSize: 'w-4 h-4',
        sectionPy: 'py-2',
        sectionPx: 'px-4',
        sectionText: 'text-sm',
        sectionIconSize: 'w-4 h-4',
        rowPy: 'py-2',
        rowPx: 'px-3',
        rowText: 'text-sm',
        rowIconSize: 'w-4 h-4',
        buttonPadding: 'px-2.5 py-1.5',
        buttonText: 'text-sm',
        inputHeight: 'h-[28px]',
        inputText: 'text-sm',
        gap: 'gap-2',
        dropdownWidth: 'w-72',
        checkboxSize: 'w-4 h-4',
    },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Format rule value for display
function formatRuleValue(rule: FilterRule, labelMap?: Record<string, string>): string {
    if (rule.operator === 'list') {
        if (rule.values.length === 0) return '(none)';
        const labels = rule.values.map(v => labelMap?.[v] || v);
        if (labels.length <= 3) {
            return labels.join(', ');
        }
        return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
    }
    return rule.value || '(empty)';
}

// Validate regex pattern
function validateRegex(pattern: string): { valid: boolean; error?: string } {
    if (!pattern) return { valid: true };
    try {
        new RegExp(pattern);
        return { valid: true };
    } catch (e) {
        return { valid: false, error: (e as Error).message };
    }
}

// ============================================================================
// CHECKBOX COMPONENT
// ============================================================================

interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
    size?: string;  // Tailwind size class like 'w-3 h-3'
}

function Checkbox({ checked, onChange, disabled, className = '', size = 'w-4 h-4' }: CheckboxProps) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={`${size} rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                disabled ? 'opacity-50 cursor-not-allowed' : ''
            } ${
                checked
                    ? 'bg-blue-500 border-blue-500'
                    : 'bg-slate-100 dark:bg-slate-600 border-slate-300 dark:border-slate-500'
            } ${className}`}
        >
            {checked && (
                <svg className="w-3/4 h-3/4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            )}
        </button>
    );
}

// ============================================================================
// INCLUDE/EXCLUDE TOGGLE
// ============================================================================

interface IncludeExcludeToggleProps {
    include: boolean;
    onChange: (include: boolean) => void;
    disabled?: boolean;
    size?: string;  // Tailwind size class like 'w-3.5 h-3.5'
}

function IncludeExcludeToggle({ include, onChange, disabled, size = 'w-5 h-5' }: IncludeExcludeToggleProps) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(!include)}
            className={`${size} rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            } ${
                include
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-red-500 text-white hover:bg-red-600'
            }`}
            title={include ? 'Include (show matching) - click to toggle' : 'Exclude (hide matching) - click to toggle'}
        >
            {include ? (
                <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 1v8M1 5h8" />
                </svg>
            ) : (
                <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M1 5h8" />
                </svg>
            )}
        </button>
    );
}

// ============================================================================
// FILTER RULE ROW COMPONENT
// ============================================================================

interface FilterRuleRowProps {
    rule: FilterRule;
    onChange: (rule: FilterRule) => void;
    onDelete: () => void;
    labelMap?: Record<string, string>;  // Map values to display labels (e.g., level numbers to names)
    density: RowDensity;
}

function FilterRuleRow({ rule, onChange, onDelete, labelMap, density }: FilterRuleRowProps) {
    const d = FILTER_DENSITY_CONFIG[density];
    const operatorLabel = rule.operator === 'list' ? '' : `${OPERATOR_LABELS[rule.operator]}: `;
    const valueDisplay = formatRuleValue(rule, labelMap);

    return (
        <div
            className={`flex items-center ${d.gap} ${d.rowPx} ${d.rowPy} rounded-md transition-colors ${
                rule.enabled
                    ? 'bg-white dark:bg-slate-700'
                    : 'bg-slate-100 dark:bg-slate-800 opacity-60'
            }`}
        >
            {/* Enable/Disable checkbox */}
            <Checkbox
                checked={rule.enabled}
                onChange={(enabled) => onChange({ ...rule, enabled })}
                size={d.checkboxSize}
            />

            {/* Include/Exclude toggle */}
            <IncludeExcludeToggle
                include={rule.include}
                onChange={(include) => onChange({ ...rule, include })}
                disabled={!rule.enabled}
                size={d.rowIconSize}
            />

            {/* Rule value display */}
            <div className={`flex-1 min-w-0 ${d.rowText} truncate ${
                !rule.enabled ? 'text-slate-400 dark:text-slate-500' :
                rule.include ? 'text-slate-700 dark:text-slate-200' : 'text-red-600 dark:text-red-400'
            }`}>
                <span className="text-slate-400 dark:text-slate-500">{operatorLabel}</span>
                <span className="font-medium">{valueDisplay}</span>
            </div>

            {/* Delete button */}
            <button
                type="button"
                onClick={onDelete}
                className={`${d.rowIconSize} flex-shrink-0 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors`}
                title="Remove this filter"
            >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

// ============================================================================
// ADD FILTER DROPDOWN (for list-based selection)
// ============================================================================

interface AddFilterDropdownProps {
    availableOptions: { value: string; label: string }[];
    existingValues: string[];  // Values already in rules (to show checkmarks)
    onAdd: (values: string[], include: boolean) => void;
    placeholder?: string;
    density: RowDensity;
    panelRef?: React.RefObject<HTMLDivElement>;
}

function AddFilterDropdown({
    availableOptions,
    existingValues,
    onAdd,
    placeholder = 'Add from list',
    density,
    panelRef
}: AddFilterDropdownProps) {
    const d = FILTER_DENSITY_CONFIG[density];
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedValues, setSelectedValues] = useState<string[]>([]);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Calculate dropdown position when opening - align with panel container
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const buttonRect = buttonRef.current.getBoundingClientRect();
            // Find the panel container and align dropdown with it
            const panelEl = panelRef?.current || buttonRef.current.closest('[data-filter-panel]') as HTMLElement;
            const panelRect = panelEl?.getBoundingClientRect();

            setDropdownPos({
                top: buttonRect.bottom + 4,
                left: panelRect ? panelRect.left + 8 : buttonRect.left,  // 8px padding from panel edge
                width: panelRect ? panelRect.width - 16 : 0  // Full panel width minus padding
            });
        }
    }, [isOpen, panelRef]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                dropdownRef.current && !dropdownRef.current.contains(target) &&
                buttonRef.current && !buttonRef.current.contains(target)
            ) {
                handleClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const filteredOptions = useMemo(() => {
        if (!search) return availableOptions;
        const lowerSearch = search.toLowerCase();
        return availableOptions.filter(opt =>
            opt.label.toLowerCase().includes(lowerSearch) ||
            opt.value.toLowerCase().includes(lowerSearch)
        );
    }, [availableOptions, search]);

    const handleClose = () => {
        setIsOpen(false);
        setSearch('');
        setSelectedValues([]);
    };

    const handleToggle = (value: string) => {
        setSelectedValues(prev =>
            prev.includes(value)
                ? prev.filter(v => v !== value)
                : [...prev, value]
        );
    };

    const handleAddAsInclude = () => {
        if (selectedValues.length > 0) {
            onAdd(selectedValues, true);
            handleClose();
        }
    };

    const handleAddAsExclude = () => {
        if (selectedValues.length > 0) {
            onAdd(selectedValues, false);
            handleClose();
        }
    };

    // Dropdown width in pixels for portal
    const dropdownWidthPx = density === 'compact' ? 224 : density === 'default' ? 256 : 288;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center ${d.gap} ${d.buttonPadding} ${d.buttonText} text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors`}
            >
                <svg className={d.rowIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                {placeholder}
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-[9999] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl overflow-hidden"
                    style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width || dropdownWidthPx }}
                >
                    {/* Search input */}
                    <div className="p-2 border-b border-slate-100 dark:border-slate-600">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search..."
                            className={`w-full px-2 ${d.rowPy} ${d.rowText} border border-slate-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white dark:bg-slate-600 dark:text-slate-100`}
                            autoFocus
                        />
                    </div>

                    {/* Options list */}
                    <div className="max-h-48 overflow-auto">
                        {filteredOptions.length === 0 ? (
                            <div className={`${d.rowPx} ${d.rowPy} ${d.rowText} text-slate-400`}>No matches</div>
                        ) : (
                            filteredOptions.map(opt => {
                                const isSelected = selectedValues.includes(opt.value);
                                const isExisting = existingValues.includes(opt.value);
                                return (
                                    <label
                                        key={opt.value}
                                        className={`flex items-center ${d.rowPx} ${d.rowPy} transition-colors ${
                                            isExisting
                                                ? 'opacity-50 cursor-not-allowed'
                                                : isSelected
                                                    ? 'bg-blue-50 dark:bg-blue-900/30 cursor-pointer'
                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer'
                                        }`}
                                    >
                                        <Checkbox
                                            checked={isSelected || isExisting}
                                            onChange={() => !isExisting && handleToggle(opt.value)}
                                            disabled={isExisting}
                                            className="mr-2"
                                            size={d.checkboxSize}
                                        />
                                        <span className={`${d.rowText} ${
                                            isExisting
                                                ? 'text-slate-400 dark:text-slate-500'
                                                : 'text-slate-700 dark:text-slate-200'
                                        }`}>
                                            {opt.label}
                                            {isExisting && ' (active)'}
                                        </span>
                                    </label>
                                );
                            })
                        )}
                    </div>

                    {/* Action buttons - always visible, disabled when no selection */}
                    <div className={`p-2 border-t border-slate-100 dark:border-slate-600 flex ${d.gap}`}>
                        <button
                            type="button"
                            onClick={handleAddAsInclude}
                            disabled={selectedValues.length === 0}
                            className={`flex-1 ${d.buttonPadding} ${d.buttonText} font-medium bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1`}
                        >
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M6 2v8M2 6h8" />
                            </svg>
                            Include
                        </button>
                        <button
                            type="button"
                            onClick={handleAddAsExclude}
                            disabled={selectedValues.length === 0}
                            className={`flex-1 ${d.buttonPadding} ${d.buttonText} font-medium bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1`}
                        >
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M2 6h8" />
                            </svg>
                            Exclude
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

// ============================================================================
// ADD TEXT FILTER (for pattern-based filtering) - Dropdown style
// ============================================================================

// Wider dropdown widths for text filter (needs more space for input)
const TEXT_FILTER_DROPDOWN_WIDTH_PX = {
    compact: 256,    // px
    default: 288,    // px
    comfortable: 320, // px
};

interface AddTextFilterProps {
    onAdd: (operator: FilterOperator, value: string, include: boolean, caseSensitive: boolean) => void;
    density: RowDensity;
    panelRef?: React.RefObject<HTMLDivElement>;
}

function AddTextFilter({ onAdd, density, panelRef }: AddTextFilterProps) {
    const d = FILTER_DENSITY_CONFIG[density];
    const dropdownWidthPx = TEXT_FILTER_DROPDOWN_WIDTH_PX[density];
    const [isOpen, setIsOpen] = useState(false);
    const [operator, setOperator] = useState<FilterOperator>('contains');
    const [value, setValue] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Calculate dropdown position when opening - align with panel container
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const buttonRect = buttonRef.current.getBoundingClientRect();
            // Find the panel container and align dropdown with it
            const panelEl = panelRef?.current || buttonRef.current.closest('[data-filter-panel]') as HTMLElement;
            const panelRect = panelEl?.getBoundingClientRect();

            setDropdownPos({
                top: buttonRect.bottom + 4,
                left: panelRect ? panelRect.left + 8 : buttonRect.left,  // 8px padding from panel edge
                width: panelRect ? panelRect.width - 16 : 0  // Full panel width minus padding
            });
            // Auto-focus input when opening
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [isOpen, panelRef]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                dropdownRef.current && !dropdownRef.current.contains(target) &&
                buttonRef.current && !buttonRef.current.contains(target)
            ) {
                handleClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const regexValidation = useMemo(() => {
        if (operator === 'regex') {
            return validateRegex(value);
        }
        return { valid: true };
    }, [operator, value]);

    const handleClose = () => {
        setIsOpen(false);
        setOperator('contains');
        setValue('');
        setCaseSensitive(false);
    };

    const handleAdd = (include: boolean) => {
        if (value.trim() && regexValidation.valid) {
            onAdd(operator, value.trim(), include, caseSensitive);
            handleClose();
        }
    };

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center ${d.gap} ${d.buttonPadding} ${d.buttonText} text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors`}
            >
                <svg className={d.rowIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                Add text filter
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-[9999] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl overflow-hidden"
                    style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width || dropdownWidthPx }}
                >
                    {/* Operator + Input row */}
                    <div className={`p-2 flex ${d.gap}`}>
                        <select
                            value={operator}
                            onChange={(e) => setOperator(e.target.value as FilterOperator)}
                            className={`${d.buttonPadding} ${d.buttonText} border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-600 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none`}
                        >
                            <option value="contains">Contains</option>
                            <option value="starts">Starts with</option>
                            <option value="ends">Ends with</option>
                            <option value="equals">Equals</option>
                            <option value="regex">Regex</option>
                        </select>
                        <input
                            ref={inputRef}
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && value.trim() && regexValidation.valid) {
                                    handleAdd(true);
                                } else if (e.key === 'Escape') {
                                    handleClose();
                                }
                            }}
                            placeholder={operator === 'regex' ? 'Enter regex' : 'Enter text'}
                            className={`flex-1 min-w-0 px-2 ${d.rowPy} ${d.rowText} border rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white dark:bg-slate-600 dark:text-slate-100 ${
                                !regexValidation.valid
                                    ? 'border-red-300 bg-red-50 dark:bg-red-900/30'
                                    : 'border-slate-200 dark:border-slate-500'
                            }`}
                        />
                    </div>

                    {/* Regex error */}
                    {!regexValidation.valid && (
                        <div className={`px-2 pb-2 ${d.buttonText} text-red-500 dark:text-red-400 flex items-center gap-1`}>
                            <svg className={d.rowIconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            {regexValidation.error}
                        </div>
                    )}

                    {/* Case sensitive option */}
                    <div className={`px-2 pb-2`}>
                        <label className={`flex items-center ${d.gap} ${d.buttonText} text-slate-500 dark:text-slate-400 cursor-pointer`}>
                            <Checkbox checked={caseSensitive} onChange={setCaseSensitive} size={d.checkboxSize} />
                            Case sensitive
                        </label>
                    </div>

                    {/* Action buttons */}
                    <div className={`p-2 border-t border-slate-100 dark:border-slate-600 flex ${d.gap}`}>
                        <button
                            type="button"
                            onClick={() => handleAdd(true)}
                            disabled={!value.trim() || !regexValidation.valid}
                            className={`flex-1 ${d.buttonPadding} ${d.buttonText} font-medium bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1`}
                        >
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M6 2v8M2 6h8" />
                            </svg>
                            Include
                        </button>
                        <button
                            type="button"
                            onClick={() => handleAdd(false)}
                            disabled={!value.trim() || !regexValidation.valid}
                            className={`flex-1 ${d.buttonPadding} ${d.buttonText} font-medium bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1`}
                        >
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M2 6h8" />
                            </svg>
                            Exclude
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

// ============================================================================
// FILTER SECTION COMPONENT
// ============================================================================

interface FilterSectionProps {
    title: string;
    filterRules: FilterRules;
    onChange: (rules: FilterRules) => void;
    availableOptions?: { value: string; label: string }[];  // For list-based selection
    labelMap?: Record<string, string>;  // Map values to display labels
    showTextFilter?: boolean;  // Whether to show text filter option
    defaultExpanded?: boolean;  // If undefined, auto-expand based on whether has rules
    density: RowDensity;
}

function FilterSection({
    title,
    filterRules,
    onChange,
    availableOptions,
    labelMap,
    showTextFilter = true,
    defaultExpanded,
    density
}: FilterSectionProps) {
    const d = FILTER_DENSITY_CONFIG[density];
    // Auto-expand if has rules, collapse if no rules (unless explicitly overridden)
    const [isExpanded, setIsExpanded] = useState(
        defaultExpanded !== undefined ? defaultExpanded : filterRules.rules.length > 0
    );

    // Track previous rule count to auto-expand when first filter is added
    const prevRuleCount = useRef(filterRules.rules.length);
    useEffect(() => {
        // Auto-expand when going from 0 to >0 rules
        if (prevRuleCount.current === 0 && filterRules.rules.length > 0) {
            setIsExpanded(true);
        }
        prevRuleCount.current = filterRules.rules.length;
    }, [filterRules.rules.length]);

    const activeCount = countActiveRules(filterRules);
    const totalActive = activeCount.includes + activeCount.excludes;

    const handleRuleChange = useCallback((index: number, rule: FilterRule) => {
        const newRules = [...filterRules.rules];
        newRules[index] = rule;
        onChange({ rules: newRules });
    }, [filterRules.rules, onChange]);

    const handleRuleDelete = useCallback((index: number) => {
        const newRules = filterRules.rules.filter((_, i) => i !== index);
        onChange({ rules: newRules });
    }, [filterRules.rules, onChange]);

    const handleAddFromList = useCallback((values: string[], include: boolean) => {
        // Get existing values to prevent duplicates
        const existingSet = new Set<string>();
        filterRules.rules.forEach(rule => {
            if (rule.operator === 'list') {
                rule.values.forEach(v => existingSet.add(v));
            }
        });

        // Filter out values that already exist
        const newValues = values.filter(v => !existingSet.has(v));
        if (newValues.length === 0) return; // Nothing new to add

        // Create separate rule for each selected value
        const newRules = newValues.map(value => createFilterRule({
            include,
            operator: 'list',
            values: [value]
        }));
        onChange({ rules: [...filterRules.rules, ...newRules] });
    }, [filterRules.rules, onChange]);

    const handleAddTextFilter = useCallback((
        operator: FilterOperator,
        value: string,
        include: boolean,
        caseSensitive: boolean
    ) => {
        const newRule = createFilterRule({
            include,
            operator,
            value,
            caseSensitive
        });
        onChange({ rules: [...filterRules.rules, newRule] });
    }, [filterRules.rules, onChange]);

    // Get all values currently in rules (for showing active state in dropdown)
    const existingValues = useMemo(() => {
        const values = new Set<string>();
        filterRules.rules.forEach(rule => {
            if (rule.operator === 'list') {
                rule.values.forEach(v => values.add(v));
            }
        });
        return Array.from(values);
    }, [filterRules.rules]);

    return (
        <div className="border-b border-slate-200 dark:border-slate-600">
            {/* Section header */}
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-full flex items-center justify-between ${d.sectionPx} ${d.sectionPy} hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors`}
            >
                <div className={`flex items-center ${d.gap}`}>
                    <svg
                        className={`${d.sectionIconSize} text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className={`${d.sectionText} font-medium text-slate-700 dark:text-slate-200`}>{title}</span>
                </div>
                {totalActive > 0 && (
                    <div className="flex items-center gap-1">
                        {activeCount.includes > 0 && (
                            <span className={`px-1.5 py-0.5 ${d.buttonText} bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded`}>
                                +{activeCount.includes}
                            </span>
                        )}
                        {activeCount.excludes > 0 && (
                            <span className={`px-1.5 py-0.5 ${d.buttonText} bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded`}>
                                −{activeCount.excludes}
                            </span>
                        )}
                    </div>
                )}
            </button>

            {/* Section content */}
            {isExpanded && (
                <div className={`${d.sectionPx} pb-2`}>
                    {/* Rules list */}
                    {filterRules.rules.length > 0 ? (
                        <div className="space-y-1 mb-2">
                            {filterRules.rules.map((rule, index) => (
                                <FilterRuleRow
                                    key={rule.id}
                                    rule={rule}
                                    onChange={(r) => handleRuleChange(index, r)}
                                    onDelete={() => handleRuleDelete(index)}
                                    labelMap={labelMap}
                                    density={density}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className={`${d.buttonText} text-slate-400 dark:text-slate-500 py-2 px-2`}>
                            No filters (showing all)
                        </div>
                    )}

                    {/* Add buttons */}
                    <div className={`flex flex-wrap ${d.gap}`}>
                        {availableOptions && availableOptions.length > 0 && (
                            <AddFilterDropdown
                                availableOptions={availableOptions}
                                existingValues={existingValues}
                                onAdd={handleAddFromList}
                                placeholder="Add from list"
                                density={density}
                            />
                        )}
                        {showTextFilter && (
                            <AddTextFilter onAdd={handleAddTextFilter} density={density} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// MAIN FILTER PANEL COMPONENT
// ============================================================================

interface FilterPanelProps {
    filter: FilterV2;
    onChange: (filter: FilterV2) => void;
    onClose: () => void;
}

export function FilterPanel({ filter, onChange, onClose }: FilterPanelProps) {
    const { sessions, appNames, hostNames, rowDensity } = useLogStore();
    const d = FILTER_DENSITY_CONFIG[rowDensity];

    // Convert store data to options format
    const sessionOptions = useMemo(() =>
        Object.keys(sessions).sort().map(name => ({ value: name, label: name })),
        [sessions]
    );

    const appNameOptions = useMemo(() =>
        Object.keys(appNames).sort().map(name => ({ value: name, label: name })),
        [appNames]
    );

    const hostNameOptions = useMemo(() =>
        Object.keys(hostNames).sort().map(name => ({ value: name, label: name })),
        [hostNames]
    );

    const levelOptions = useMemo(() =>
        LEVEL_VALUES.map(v => ({ value: String(v), label: LEVEL_LABELS[v] })),
        []
    );

    const entryTypeOptions = useMemo(() =>
        ALL_ENTRY_TYPES.map(t => ({ value: String(t.value), label: t.label })),
        []
    );

    // Label maps for display
    const levelLabelMap = useMemo(() => {
        const map: Record<string, string> = {};
        LEVEL_VALUES.forEach(v => { map[String(v)] = LEVEL_LABELS[v]; });
        return map;
    }, []);

    const entryTypeLabelMap = useMemo(() => {
        const map: Record<string, string> = {};
        ALL_ENTRY_TYPES.forEach(t => { map[String(t.value)] = t.label; });
        return map;
    }, []);

    // Count total active rules
    const totalActiveRules = useMemo(() => {
        let total = 0;
        [filter.sessions, filter.levels, filter.appNames, filter.hostNames, filter.titles, filter.entryTypes].forEach(fr => {
            const count = countActiveRules(fr);
            total += count.includes + count.excludes;
        });
        return total;
    }, [filter]);

    const handleClearAll = () => {
        onChange(createDefaultFilterV2());
    };

    return (
        <div data-filter-panel className="flex flex-col h-full bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
            {/* Header */}
            <div className={`${d.headerHeight} ${d.headerPx} flex items-center justify-between border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex-shrink-0`}>
                <div className={`flex items-center ${d.gap}`}>
                    <svg className={`${d.headerIconSize} text-slate-500 dark:text-slate-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <span className={`${d.headerText} font-medium text-slate-700 dark:text-slate-200`}>Filters</span>
                    {totalActiveRules > 0 && (
                        <span className={`px-1.5 py-0.5 ${d.buttonText} bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded`}>
                            {totalActiveRules}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className={`${d.headerIconSize} text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors`}
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Sections */}
            <div className="flex-1 overflow-auto">
                <FilterSection
                    title="Sessions"
                    filterRules={filter.sessions}
                    onChange={(rules) => onChange({ ...filter, sessions: rules })}
                    availableOptions={sessionOptions}
                    density={rowDensity}
                />

                <FilterSection
                    title="Levels"
                    filterRules={filter.levels}
                    onChange={(rules) => onChange({ ...filter, levels: rules })}
                    availableOptions={levelOptions}
                    labelMap={levelLabelMap}
                    showTextFilter={false}
                    density={rowDensity}
                />

                <FilterSection
                    title="Application"
                    filterRules={filter.appNames}
                    onChange={(rules) => onChange({ ...filter, appNames: rules })}
                    availableOptions={appNameOptions}
                    density={rowDensity}
                />

                <FilterSection
                    title="Host"
                    filterRules={filter.hostNames}
                    onChange={(rules) => onChange({ ...filter, hostNames: rules })}
                    availableOptions={hostNameOptions}
                    density={rowDensity}
                />

                <FilterSection
                    title="Title"
                    filterRules={filter.titles}
                    onChange={(rules) => onChange({ ...filter, titles: rules })}
                    density={rowDensity}
                />

                <FilterSection
                    title="Entry Type"
                    filterRules={filter.entryTypes}
                    onChange={(rules) => onChange({ ...filter, entryTypes: rules })}
                    availableOptions={entryTypeOptions}
                    labelMap={entryTypeLabelMap}
                    showTextFilter={false}
                    defaultExpanded={false}
                    density={rowDensity}
                />
            </div>

            {/* Footer */}
            {totalActiveRules > 0 && (
                <div className={`${d.sectionPx} ${d.sectionPy} border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex-shrink-0`}>
                    <button
                        type="button"
                        onClick={handleClearAll}
                        className={`w-full ${d.buttonPadding} ${d.rowText} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors`}
                    >
                        Clear All Filters
                    </button>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// ACTIVE FILTERS BAR COMPONENT
// ============================================================================

interface ActiveFiltersBarProps {
    filter: FilterV2;
    onChange: (filter: FilterV2) => void;
    onOpenPanel: () => void;
}

export function ActiveFiltersBar({ filter, onChange, onOpenPanel }: ActiveFiltersBarProps) {
    // Build list of active filter chips
    const chips = useMemo(() => {
        const result: { key: string; label: string; field: keyof FilterV2; ruleId: string; include: boolean }[] = [];

        const processField = (
            field: keyof FilterV2,
            rules: FilterRules,
            labelPrefix: string,
            labelMap?: Record<string, string>
        ) => {
            rules.rules.forEach(rule => {
                if (!rule.enabled) return;
                if (rule.operator === 'list' && rule.values.length === 0) return;
                if (rule.operator !== 'list' && !rule.value.trim()) return;

                let label: string;
                if (rule.operator === 'list') {
                    const labels = rule.values.slice(0, 2).map(v => labelMap?.[v] || v);
                    if (rule.values.length > 2) {
                        label = `${labels.join(', ')} +${rule.values.length - 2}`;
                    } else {
                        label = labels.join(', ');
                    }
                } else {
                    const opLabel = OPERATOR_LABELS[rule.operator];
                    label = `${opLabel}: ${rule.value.length > 15 ? rule.value.slice(0, 15) + '...' : rule.value}`;
                }

                result.push({
                    key: `${field}-${rule.id}`,
                    label: `${labelPrefix}: ${label}`,
                    field,
                    ruleId: rule.id,
                    include: rule.include
                });
            });
        };

        const levelLabelMap: Record<string, string> = {};
        LEVEL_VALUES.forEach(v => { levelLabelMap[String(v)] = LEVEL_LABELS[v]; });

        const entryTypeLabelMap: Record<string, string> = {};
        ALL_ENTRY_TYPES.forEach(t => { entryTypeLabelMap[String(t.value)] = t.label; });

        processField('sessions', filter.sessions, 'Session');
        processField('levels', filter.levels, 'Level', levelLabelMap);
        processField('appNames', filter.appNames, 'App');
        processField('hostNames', filter.hostNames, 'Host');
        processField('titles', filter.titles, 'Title');
        processField('entryTypes', filter.entryTypes, 'Type', entryTypeLabelMap);

        return result;
    }, [filter]);

    const handleRemoveChip = (field: keyof FilterV2, ruleId: string) => {
        const fieldRules = filter[field] as FilterRules;
        const newRules = fieldRules.rules.filter(r => r.id !== ruleId);
        onChange({ ...filter, [field]: { rules: newRules } });
    };

    const handleClearAll = () => {
        onChange(createDefaultFilterV2());
    };

    if (chips.length === 0) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">Filters:</span>

            {chips.map(chip => (
                <span
                    key={chip.key}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full cursor-pointer ${
                        chip.include
                            ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                            : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                    }`}
                    onClick={() => onOpenPanel()}
                    title="Click to edit filters"
                >
                    <span className="font-medium">{chip.include ? '+' : '−'}</span>
                    {chip.label}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveChip(chip.field, chip.ruleId);
                        }}
                        className="ml-0.5 hover:opacity-70"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </span>
            ))}

            <button
                type="button"
                onClick={handleClearAll}
                className="flex-shrink-0 text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400"
                title="Clear all filters"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

// Export components and types
export { FilterSection, FilterRuleRow, AddFilterDropdown, AddTextFilter };
