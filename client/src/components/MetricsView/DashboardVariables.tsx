/**
 * DashboardVariables - Display variable dropdowns for label filtering (Grafana-style)
 */

import { useEffect, useCallback } from 'react';
import { useLogStore } from '../../store/logStore';
import { useMetricsStore, useVariableValues, DashboardVariable } from '../../store/metricsStore';
import { useLabelValues } from './hooks/useWatchHistory';

interface VariableDropdownProps {
    variable: DashboardVariable;
    dashboardId: string;
    density: { py: string; px: string; text: string };
}

function VariableDropdown({ variable, dashboardId, density }: VariableDropdownProps) {
    const { values: labelValues } = useLabelValues(variable.type === 'label' ? variable.labelName || variable.name : '');
    const { setVariableValue, setVariableOptions, getVariableValue } = useVariableValues();

    // Get options: either from label API or custom options
    const options = variable.type === 'label' ? labelValues : (variable.options || []);

    // Current selected value
    const currentValue = getVariableValue(dashboardId, variable.name);

    // Initialize variable with default or first option
    useEffect(() => {
        if (!currentValue && options.length > 0) {
            const defaultVal = variable.defaultValue || (variable.includeAll ? '__all__' : options[0]);
            setVariableValue(dashboardId, variable.name, defaultVal as string);
        }
        // Update available options
        setVariableOptions(dashboardId, variable.name, options);
    }, [dashboardId, variable.name, variable.defaultValue, variable.includeAll, options, currentValue, setVariableValue, setVariableOptions]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        if (variable.multi) {
            // For multi-select, gather all selected options
            const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
            setVariableValue(dashboardId, variable.name, selectedOptions);
        } else {
            setVariableValue(dashboardId, variable.name, e.target.value);
        }
    }, [dashboardId, variable.name, variable.multi, setVariableValue]);

    const displayLabel = variable.label || variable.name;

    return (
        <div className="flex items-center gap-2">
            <label className={`${density.text} text-slate-400 font-medium`}>
                {displayLabel}:
            </label>
            <select
                value={Array.isArray(currentValue) ? currentValue[0] : (currentValue || '')}
                onChange={handleChange}
                multiple={variable.multi}
                className={`${density.px} ${density.py} ${density.text} bg-slate-700 border border-slate-600 rounded text-slate-200 hover:border-slate-500 focus:border-blue-500 focus:outline-none transition-colors min-w-[120px]`}
            >
                {variable.includeAll && (
                    <option value="__all__">All</option>
                )}
                {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        </div>
    );
}

interface DashboardVariablesProps {
    onAddVariable?: () => void;
}

export function DashboardVariables({ onAddVariable }: DashboardVariablesProps) {
    const { currentRoom, rowDensity } = useLogStore();
    const { getActiveDashboard, editMode } = useMetricsStore();

    const activeDashboard = getActiveDashboard(currentRoom);
    const variables = activeDashboard?.variables || [];

    // Density-based sizing
    const density = {
        compact: { py: 'py-0.5', px: 'px-2', text: 'text-xs', gap: 'gap-3' },
        default: { py: 'py-1', px: 'px-2.5', text: 'text-sm', gap: 'gap-4' },
        comfortable: { py: 'py-1.5', px: 'px-3', text: 'text-sm', gap: 'gap-5' }
    }[rowDensity];

    // Don't render if no variables and not in edit mode
    if (variables.length === 0 && !editMode) {
        return null;
    }

    return (
        <div className={`flex items-center flex-wrap ${density.gap} ${density.py} px-3 bg-slate-800/50 border-b border-slate-700/50`}>
            {variables.map(variable => (
                <VariableDropdown
                    key={variable.name}
                    variable={variable}
                    dashboardId={activeDashboard!.id}
                    density={density}
                />
            ))}

            {/* Add variable button (only in edit mode) */}
            {editMode && (
                <button
                    onClick={onAddVariable}
                    className={`flex items-center gap-1 ${density.px} ${density.py} ${density.text} rounded border border-dashed border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors`}
                    title="Add variable"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Add Variable</span>
                </button>
            )}
        </div>
    );
}
