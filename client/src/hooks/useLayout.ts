/**
 * Layout Hook - Persists layout settings to localStorage
 */

import { useState, useCallback, useEffect } from 'react';
import { ColumnState } from 'ag-grid-community';

export interface LayoutSettings {
    columnState: ColumnState[];
    showWatches: boolean;
    watchPanelWidth: number;
    sidebarOpen: boolean;
}

const STORAGE_KEY = 'smartinspect-layout';

const defaultLayout: LayoutSettings = {
    columnState: [],
    showWatches: true,
    watchPanelWidth: 320,
    sidebarOpen: false
};

export function useLayout() {
    const [layout, setLayout] = useState<LayoutSettings>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return { ...defaultLayout, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.error('Failed to load layout:', e);
        }
        return defaultLayout;
    });

    // Save layout to localStorage
    const saveLayout = useCallback((updates: Partial<LayoutSettings>) => {
        setLayout(prev => {
            const next = { ...prev, ...updates };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch (e) {
                console.error('Failed to save layout:', e);
            }
            return next;
        });
    }, []);

    // Reset to defaults
    const resetLayout = useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.error('Failed to reset layout:', e);
        }
        setLayout(defaultLayout);
    }, []);

    // Export layout as JSON
    const exportLayout = useCallback(() => {
        const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'smartinspect-layout.json';
        a.click();
        URL.revokeObjectURL(url);
    }, [layout]);

    // Import layout from JSON
    const importLayout = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target?.result as string);
                saveLayout(imported);
            } catch (err) {
                console.error('Failed to import layout:', err);
            }
        };
        reader.readAsText(file);
    }, [saveLayout]);

    return {
        layout,
        saveLayout,
        resetLayout,
        exportLayout,
        importLayout
    };
}
