/**
 * Layout Hook - Handles layout settings with percentage-based panel sizes
 *
 * Panel sizes are stored as percentages for cross-screen compatibility.
 * Provides conversion utilities for rendering (% -> px) and resize handlers (px -> %).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ColumnState } from 'ag-grid-community';
import { useLogStore } from '../store/logStore';

// Header height + status bar + tabs (approx)
const HEADER_HEIGHT = 130;

export interface LayoutSettings {
    columnState: ColumnState[];
    sidebarOpen: boolean;
    // Legacy pixel values (for migration)
    watchPanelWidth?: number;
}

const STORAGE_KEY_PREFIX = 'smartinspect-layout';

const defaultLayout: LayoutSettings = {
    columnState: [],
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

// Check if migration is needed
function checkMigration(room: string, user: string): { detailPercent?: number; watchPercent?: number } {
    try {
        const key = getStorageKey(room, user);
        const stored = localStorage.getItem(key);
        if (stored) {
            const data = JSON.parse(stored);
            // Legacy pixel values need migration
            if (data.watchPanelWidth && !data.migrated) {
                const contentHeight = window.innerHeight - HEADER_HEIGHT;
                // Assume old detail panel was ~200px
                const detailPercent = Math.round((200 / contentHeight) * 100);
                const watchPercent = Math.round((data.watchPanelWidth / window.innerWidth) * 100);
                return {
                    detailPercent: Math.max(10, Math.min(60, detailPercent)),
                    watchPercent: Math.max(10, Math.min(40, watchPercent))
                };
            }
        }
    } catch (e) {
        console.error('[Layout] Migration check failed:', e);
    }
    return {};
}

export function useLayout() {
    const currentRoom = useLogStore(state => state.currentRoom);
    const currentUser = useLogStore(state => state.currentUser);

    // Percentage state from store
    const detailPanelHeightPercent = useLogStore(state => state.detailPanelHeightPercent);
    const watchPanelWidthPercent = useLogStore(state => state.watchPanelWidthPercent);
    const setDetailPanelHeightPercent = useLogStore(state => state.setDetailPanelHeightPercent);
    const setWatchPanelWidthPercent = useLogStore(state => state.setWatchPanelWidthPercent);

    // Track window dimensions to trigger re-renders on resize
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    // Listen for window resize events
    useEffect(() => {
        const handleResize = () => {
            setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Track previous room/user to detect changes
    const prevRoomRef = useRef(currentRoom);
    const prevUserRef = useRef(currentUser);
    const migratedRef = useRef(false);

    const [layout, setLayout] = useState<LayoutSettings>(() =>
        loadLayout(currentRoom, currentUser)
    );

    // Perform migration on first load
    useEffect(() => {
        if (!migratedRef.current) {
            const migration = checkMigration(currentRoom, currentUser);
            if (migration.detailPercent !== undefined) {
                setDetailPanelHeightPercent(migration.detailPercent);
            }
            if (migration.watchPercent !== undefined) {
                setWatchPanelWidthPercent(migration.watchPercent);
            }

            // Mark as migrated
            if (migration.detailPercent !== undefined || migration.watchPercent !== undefined) {
                const key = getStorageKey(currentRoom, currentUser);
                try {
                    const stored = localStorage.getItem(key);
                    if (stored) {
                        const data = JSON.parse(stored);
                        data.migrated = true;
                        delete data.watchPanelWidth;
                        localStorage.setItem(key, JSON.stringify(data));
                        console.log('[Layout] Migrated pixel values to percentages');
                    }
                } catch (e) {
                    console.error('[Layout] Migration save failed:', e);
                }
            }
            migratedRef.current = true;
        }
    }, [currentRoom, currentUser, setDetailPanelHeightPercent, setWatchPanelWidthPercent]);

    // Reload layout when room or user changes
    useEffect(() => {
        if (prevRoomRef.current !== currentRoom || prevUserRef.current !== currentUser) {
            prevRoomRef.current = currentRoom;
            prevUserRef.current = currentUser;
            migratedRef.current = false; // Re-check migration for new room/user

            const newLayout = loadLayout(currentRoom, currentUser);
            setLayout(newLayout);
            console.log('[Layout] Loaded layout for', currentRoom, currentUser);
        }
    }, [currentRoom, currentUser]);

    // Save layout to localStorage (only columnState and sidebarOpen)
    const saveLayout = useCallback((updates: Partial<LayoutSettings>) => {
        setLayout(prev => {
            const next = { ...prev, ...updates };
            try {
                const key = getStorageKey(currentRoom, currentUser);
                // Don't save pixel values anymore
                const toSave = {
                    columnState: next.columnState,
                    sidebarOpen: next.sidebarOpen,
                    migrated: true
                };
                localStorage.setItem(key, JSON.stringify(toSave));
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
        // Reset percentages to defaults
        setDetailPanelHeightPercent(25);
        setWatchPanelWidthPercent(20);
    }, [currentRoom, currentUser, setDetailPanelHeightPercent, setWatchPanelWidthPercent]);

    // Convert percentage to pixels for detail panel height
    // Uses tracked windowSize for reactivity on window resize
    const getDetailPanelHeightPx = useCallback((containerHeight?: number): number => {
        const height = containerHeight ?? (windowSize.height - HEADER_HEIGHT);
        return Math.round((detailPanelHeightPercent / 100) * height);
    }, [detailPanelHeightPercent, windowSize.height]);

    // Convert percentage to pixels for watch panel width
    // Uses tracked windowSize for reactivity on window resize
    const getWatchPanelWidthPx = useCallback((containerWidth?: number): number => {
        const width = containerWidth ?? windowSize.width;
        return Math.round((watchPanelWidthPercent / 100) * width);
    }, [watchPanelWidthPercent, windowSize.width]);

    // Update detail panel height from pixel value (for resize handlers)
    const updateDetailPanelHeightFromPx = useCallback((heightPx: number, containerHeight?: number) => {
        const height = containerHeight ?? (window.innerHeight - HEADER_HEIGHT);
        const percent = Math.round((heightPx / height) * 100);
        setDetailPanelHeightPercent(percent);
    }, [setDetailPanelHeightPercent]);

    // Update watch panel width from pixel value (for resize handlers)
    const updateWatchPanelWidthFromPx = useCallback((widthPx: number, containerWidth?: number) => {
        const width = containerWidth ?? window.innerWidth;
        const percent = Math.round((widthPx / width) * 100);
        setWatchPanelWidthPercent(percent);
    }, [setWatchPanelWidthPercent]);

    // Export layout as JSON
    const exportLayout = useCallback(() => {
        const exportData = {
            ...layout,
            detailPanelHeightPercent,
            watchPanelWidthPercent
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartinspect-layout-${currentRoom}-${currentUser}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [layout, currentRoom, currentUser, detailPanelHeightPercent, watchPanelWidthPercent]);

    // Import layout from JSON
    const importLayout = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target?.result as string);
                if (imported.columnState) {
                    saveLayout({ columnState: imported.columnState, sidebarOpen: imported.sidebarOpen });
                }
                if (imported.detailPanelHeightPercent !== undefined) {
                    setDetailPanelHeightPercent(imported.detailPanelHeightPercent);
                }
                if (imported.watchPanelWidthPercent !== undefined) {
                    setWatchPanelWidthPercent(imported.watchPanelWidthPercent);
                }
            } catch (err) {
                console.error('[Layout] Failed to import layout:', err);
            }
        };
        reader.readAsText(file);
    }, [saveLayout, setDetailPanelHeightPercent, setWatchPanelWidthPercent]);

    return {
        layout,
        saveLayout,
        resetLayout,
        exportLayout,
        importLayout,

        // Percentage values from store
        detailPanelHeightPercent,
        watchPanelWidthPercent,

        // Conversion utilities
        getDetailPanelHeightPx,
        getWatchPanelWidthPx,
        updateDetailPanelHeightFromPx,
        updateWatchPanelWidthFromPx,

        // Direct setters (for external use)
        setDetailPanelHeightPercent,
        setWatchPanelWidthPercent
    };
}
