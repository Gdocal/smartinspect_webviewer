/**
 * useViewsSync - Syncs views and global highlight rules to/from server
 *
 * Views and highlights are stored per (room, user) on the server.
 * Changes are auto-saved with debouncing.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLogStore, View, HighlightRule } from '../store/logStore';

// Debounce delay for auto-save (ms)
const SAVE_DEBOUNCE_MS = 1000;

// Settings keys
const VIEWS_KEY = 'views';
const HIGHLIGHTS_KEY = 'globalHighlightRules';
const ACTIVE_VIEW_KEY = 'activeViewId';

interface ViewsData {
    views: View[];
    globalHighlightRules: HighlightRule[];
    activeViewId: string | null;
}

/**
 * Hook to sync views and highlights with server
 * Should be used once at app level
 */
export function useViewsSync() {
    const currentRoom = useLogStore(state => state.currentRoom);
    const currentUser = useLogStore(state => state.currentUser);
    const connected = useLogStore(state => state.connected);
    const views = useLogStore(state => state.views);
    const globalHighlightRules = useLogStore(state => state.globalHighlightRules);
    const activeViewId = useLogStore(state => state.activeViewId);

    // Refs for tracking state
    const mountedRef = useRef(true);
    const saveTimeoutRef = useRef<number | null>(null);
    const lastSavedRef = useRef<string>('');
    const loadedRef = useRef(false);
    const skipNextSaveRef = useRef(false);

    // Build API URL with room/user params
    const getApiUrl = useCallback((key?: string) => {
        const base = `/api/settings${key ? `/${key}` : ''}`;
        return `${base}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`;
    }, [currentRoom, currentUser]);

    // Load views data from server
    const loadFromServer = useCallback(async () => {
        try {
            const response = await fetch(getApiUrl());
            if (!response.ok) {
                console.error('[ViewsSync] Failed to load settings:', response.statusText);
                return;
            }

            const data = await response.json();
            if (!mountedRef.current) return;

            const settings = data.settings || {};

            // Skip next save to avoid saving what we just loaded
            skipNextSaveRef.current = true;

            // Load views
            if (settings[VIEWS_KEY] && Array.isArray(settings[VIEWS_KEY])) {
                useLogStore.getState().setViews(settings[VIEWS_KEY]);
            }

            // Load global highlights
            if (settings[HIGHLIGHTS_KEY] && Array.isArray(settings[HIGHLIGHTS_KEY])) {
                useLogStore.getState().setGlobalHighlightRules(settings[HIGHLIGHTS_KEY]);
            }

            // Load active view
            if (settings[ACTIVE_VIEW_KEY] !== undefined) {
                useLogStore.getState().setActiveView(settings[ACTIVE_VIEW_KEY]);
            }

            // Update last saved ref to prevent immediate re-save
            const currentData: ViewsData = {
                views: settings[VIEWS_KEY] || [],
                globalHighlightRules: settings[HIGHLIGHTS_KEY] || [],
                activeViewId: settings[ACTIVE_VIEW_KEY] ?? null
            };
            lastSavedRef.current = JSON.stringify(currentData);
            loadedRef.current = true;

            console.log('[ViewsSync] Loaded from server:', {
                views: (settings[VIEWS_KEY] || []).length,
                highlights: (settings[HIGHLIGHTS_KEY] || []).length,
                activeViewId: settings[ACTIVE_VIEW_KEY]
            });
        } catch (err) {
            console.error('[ViewsSync] Load error:', err);
        }
    }, [getApiUrl]);

    // Save views data to server
    const saveToServer = useCallback(async (data: ViewsData) => {
        try {
            const response = await fetch(getApiUrl(), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    settings: {
                        [VIEWS_KEY]: data.views,
                        [HIGHLIGHTS_KEY]: data.globalHighlightRules,
                        [ACTIVE_VIEW_KEY]: data.activeViewId
                    }
                })
            });

            if (!response.ok) {
                console.error('[ViewsSync] Failed to save settings:', response.statusText);
                return;
            }

            lastSavedRef.current = JSON.stringify(data);
            console.log('[ViewsSync] Saved to server');
        } catch (err) {
            console.error('[ViewsSync] Save error:', err);
        }
    }, [getApiUrl]);

    // Schedule debounced save
    const scheduleSave = useCallback((data: ViewsData) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            saveTimeoutRef.current = null;
            saveToServer(data);
        }, SAVE_DEBOUNCE_MS);
    }, [saveToServer]);

    // Load on mount and when room/user changes
    useEffect(() => {
        if (connected) {
            loadedRef.current = false;
            loadFromServer();
        }
    }, [connected, currentRoom, currentUser, loadFromServer]);

    // Auto-save when views/highlights change
    useEffect(() => {
        // Don't save if not loaded yet or if we should skip
        if (!loadedRef.current || skipNextSaveRef.current) {
            skipNextSaveRef.current = false;
            return;
        }

        const currentData: ViewsData = {
            views,
            globalHighlightRules,
            activeViewId
        };

        const currentJson = JSON.stringify(currentData);

        // Only save if actually changed
        if (currentJson !== lastSavedRef.current) {
            scheduleSave(currentData);
        }
    }, [views, globalHighlightRules, activeViewId, scheduleSave]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return {
        loadFromServer,
        isLoaded: loadedRef.current
    };
}
