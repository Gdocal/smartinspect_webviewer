/**
 * Layout Hook - Persists layout settings to localStorage per (room, user)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ColumnState } from 'ag-grid-community';
import { useLogStore } from '../store/logStore';

export interface LayoutSettings {
    columnState: ColumnState[];
    showWatches: boolean;
    watchPanelWidth: number;
    sidebarOpen: boolean;
}

const STORAGE_KEY_PREFIX = 'smartinspect-layout';

const defaultLayout: LayoutSettings = {
    columnState: [],
    showWatches: true,
    watchPanelWidth: 320,
    sidebarOpen: false
};

// Build storage key based on room and user
function getStorageKey(room: string, user: string): string {
    return `${STORAGE_KEY_PREFIX}-${room}-${user}`;
}

// Load layout from localStorage
function loadLayout(room: string, user: string): LayoutSettings {
    try {
        const key = getStorageKey(room, user);
        const stored = localStorage.getItem(key);
        if (stored) {
            return { ...defaultLayout, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.error('[Layout] Failed to load layout:', e);
    }
    return defaultLayout;
}

export function useLayout() {
    const currentRoom = useLogStore(state => state.currentRoom);
    const currentUser = useLogStore(state => state.currentUser);

    // Track previous room/user to detect changes
    const prevRoomRef = useRef(currentRoom);
    const prevUserRef = useRef(currentUser);

    const [layout, setLayout] = useState<LayoutSettings>(() =>
        loadLayout(currentRoom, currentUser)
    );

    // Reload layout when room or user changes
    useEffect(() => {
        if (prevRoomRef.current !== currentRoom || prevUserRef.current !== currentUser) {
            prevRoomRef.current = currentRoom;
            prevUserRef.current = currentUser;

            const newLayout = loadLayout(currentRoom, currentUser);
            setLayout(newLayout);
            console.log('[Layout] Loaded layout for', currentRoom, currentUser);
        }
    }, [currentRoom, currentUser]);

    // Save layout to localStorage
    const saveLayout = useCallback((updates: Partial<LayoutSettings>) => {
        setLayout(prev => {
            const next = { ...prev, ...updates };
            try {
                const key = getStorageKey(currentRoom, currentUser);
                localStorage.setItem(key, JSON.stringify(next));
            } catch (e) {
                console.error('[Layout] Failed to save layout:', e);
            }
            return next;
        });
    }, [currentRoom, currentUser]);

    // Reset to defaults
    const resetLayout = useCallback(() => {
        try {
            const key = getStorageKey(currentRoom, currentUser);
            localStorage.removeItem(key);
        } catch (e) {
            console.error('[Layout] Failed to reset layout:', e);
        }
        setLayout(defaultLayout);
    }, [currentRoom, currentUser]);

    // Export layout as JSON
    const exportLayout = useCallback(() => {
        const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartinspect-layout-${currentRoom}-${currentUser}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [layout, currentRoom, currentUser]);

    // Import layout from JSON
    const importLayout = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target?.result as string);
                saveLayout(imported);
            } catch (err) {
                console.error('[Layout] Failed to import layout:', err);
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
