/**
 * useLayoutPresets - Manages layout presets with server persistence
 *
 * Features:
 * - Load presets list (own + shared in room)
 * - Save current state as new preset
 * - Load and apply specific preset
 * - Auto-save active preset with debounce
 * - Delete, copy, set-as-default operations
 * - Load default/last-used preset on startup
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useLogStore, View, HighlightRule } from '../store/logStore';
import { ColumnState } from 'ag-grid-community';

// Debounce delay for auto-save (ms)
const SAVE_DEBOUNCE_MS = 1500;

// localStorage key for last used preset
const LAST_PRESET_KEY = 'si-last-preset';

// Full preset data structure (for saving/loading)
export interface LayoutPreset {
    id: string;
    name: string;
    description?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    isDefault: boolean;
    isShared: boolean;

    // Layout state
    layout: {
        sizes: {
            detailPanelHeightPercent: number;
            watchPanelWidthPercent: number;
        };
        visibility: {
            showDetailPanel: boolean;
            showWatchPanel: boolean;
            showStreamPanel: boolean;
        };
        columnState: ColumnState[];
        sidebarOpen: boolean;
    };

    // Data state
    views: View[];
    globalHighlightRules: HighlightRule[];
    activeViewId: string | null;
    maxDisplayEntries: number;
    theme: 'light' | 'dark';
}

/**
 * Hook to manage layout presets
 */
export function useLayoutPresets() {
    const currentRoom = useLogStore(state => state.currentRoom);
    const currentUser = useLogStore(state => state.currentUser);
    const connected = useLogStore(state => state.connected);

    // State from store
    const layoutPresets = useLogStore(state => state.layoutPresets);
    const activePresetId = useLogStore(state => state.activePresetId);
    const setLayoutPresets = useLogStore(state => state.setLayoutPresets);
    const setActivePresetId = useLogStore(state => state.setActivePresetId);

    // Layout state
    const detailPanelHeightPercent = useLogStore(state => state.detailPanelHeightPercent);
    const watchPanelWidthPercent = useLogStore(state => state.watchPanelWidthPercent);
    const showDetailPanel = useLogStore(state => state.showDetailPanel);
    const showWatchPanel = useLogStore(state => state.showWatchPanel);
    const showStreamPanel = useLogStore(state => state.showStreamPanel);

    // Data state
    const views = useLogStore(state => state.views);
    const globalHighlightRules = useLogStore(state => state.globalHighlightRules);
    const activeViewId = useLogStore(state => state.activeViewId);
    const maxDisplayEntries = useLogStore(state => state.maxDisplayEntries);
    const theme = useLogStore(state => state.theme);

    // Local state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refs
    const mountedRef = useRef(true);
    const saveTimeoutRef = useRef<number | null>(null);
    const lastSavedRef = useRef<string>('');
    const loadedRef = useRef(false);
    const skipNextSaveRef = useRef(false);
    const columnStateRef = useRef<ColumnState[]>([]);
    const sidebarOpenRef = useRef(false);

    // Build API URL
    const getApiUrl = useCallback((path: string = '') => {
        const base = `/api/presets${path}`;
        return `${base}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`;
    }, [currentRoom, currentUser]);

    // Get last used preset ID from localStorage
    const getLastPresetId = useCallback((): string | null => {
        try {
            const key = `${LAST_PRESET_KEY}-${currentRoom}-${currentUser}`;
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }, [currentRoom, currentUser]);

    // Save last used preset ID to localStorage
    const setLastPresetId = useCallback((id: string | null) => {
        try {
            const key = `${LAST_PRESET_KEY}-${currentRoom}-${currentUser}`;
            if (id) {
                localStorage.setItem(key, id);
            } else {
                localStorage.removeItem(key);
            }
        } catch {
            // Ignore localStorage errors
        }
    }, [currentRoom, currentUser]);

    // Update column state ref (called from parent component)
    const updateColumnState = useCallback((columnState: ColumnState[]) => {
        columnStateRef.current = columnState;
    }, []);

    // Update sidebar state ref (called from parent component)
    const updateSidebarOpen = useCallback((open: boolean) => {
        sidebarOpenRef.current = open;
    }, []);

    // Gather current state into preset data
    const gatherCurrentState = useCallback((): Omit<LayoutPreset, 'id' | 'name' | 'description' | 'createdBy' | 'createdAt' | 'updatedAt' | 'isDefault' | 'isShared'> => {
        return {
            layout: {
                sizes: {
                    detailPanelHeightPercent,
                    watchPanelWidthPercent
                },
                visibility: {
                    showDetailPanel,
                    showWatchPanel,
                    showStreamPanel
                },
                columnState: columnStateRef.current,
                sidebarOpen: sidebarOpenRef.current
            },
            views,
            globalHighlightRules,
            activeViewId,
            maxDisplayEntries,
            theme
        };
    }, [
        detailPanelHeightPercent, watchPanelWidthPercent,
        showDetailPanel, showWatchPanel, showStreamPanel,
        views, globalHighlightRules, activeViewId, maxDisplayEntries, theme
    ]);

    // Apply preset state to store
    const applyPresetState = useCallback((preset: LayoutPreset) => {
        const store = useLogStore.getState();

        // Apply layout sizes
        if (preset.layout?.sizes) {
            store.setDetailPanelHeightPercent(preset.layout.sizes.detailPanelHeightPercent);
            store.setWatchPanelWidthPercent(preset.layout.sizes.watchPanelWidthPercent);
        }

        // Apply panel visibility
        if (preset.layout?.visibility) {
            store.setShowDetailPanel(preset.layout.visibility.showDetailPanel);
            store.setShowWatchPanel(preset.layout.visibility.showWatchPanel);
            store.setShowStreamPanel(preset.layout.visibility.showStreamPanel);
        }

        // Apply column state (via ref for external component to use)
        if (preset.layout?.columnState) {
            columnStateRef.current = preset.layout.columnState;
        }

        // Apply sidebar state
        if (preset.layout?.sidebarOpen !== undefined) {
            sidebarOpenRef.current = preset.layout.sidebarOpen;
        }

        // Apply views
        if (preset.views) {
            store.setViews(preset.views);
        }

        // Apply global highlight rules
        if (preset.globalHighlightRules) {
            store.setGlobalHighlightRules(preset.globalHighlightRules);
        }

        // Apply active view
        if (preset.activeViewId !== undefined) {
            store.setActiveView(preset.activeViewId);
        }

        // Apply theme
        if (preset.theme) {
            store.setTheme(preset.theme);
        }
    }, []);

    // Load presets list from server
    const loadPresetsList = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(getApiUrl());
            if (!response.ok) {
                throw new Error(`Failed to load presets: ${response.statusText}`);
            }

            const data = await response.json();
            if (!mountedRef.current) return;

            setLayoutPresets(data.presets || []);
            setError(null);
            console.log('[LayoutPresets] Loaded presets list:', (data.presets || []).length);
        } catch (err) {
            console.error('[LayoutPresets] Load error:', err);
            setError(err instanceof Error ? err.message : 'Failed to load presets');
        } finally {
            setLoading(false);
        }
    }, [getApiUrl, setLayoutPresets]);

    // Load and apply a specific preset
    const loadPreset = useCallback(async (presetId: string) => {
        try {
            setLoading(true);
            skipNextSaveRef.current = true;

            const response = await fetch(getApiUrl(`/${presetId}`));
            if (!response.ok) {
                throw new Error(`Failed to load preset: ${response.statusText}`);
            }

            const preset: LayoutPreset = await response.json();
            if (!mountedRef.current) return;

            // Apply preset state
            applyPresetState(preset);

            // Update active preset
            setActivePresetId(presetId);
            setLastPresetId(presetId);

            // Update last saved ref
            lastSavedRef.current = JSON.stringify(gatherCurrentState());

            setError(null);
            console.log('[LayoutPresets] Loaded preset:', preset.name);

            return preset;
        } catch (err) {
            console.error('[LayoutPresets] Load preset error:', err);
            setError(err instanceof Error ? err.message : 'Failed to load preset');
            return null;
        } finally {
            setLoading(false);
        }
    }, [getApiUrl, setActivePresetId, setLastPresetId, applyPresetState, gatherCurrentState]);

    // Load default preset on startup
    const loadDefaultPreset = useCallback(async () => {
        try {
            // First try last used preset
            const lastPresetId = getLastPresetId();
            if (lastPresetId) {
                const preset = await loadPreset(lastPresetId);
                if (preset) {
                    loadedRef.current = true;
                    return preset;
                }
            }

            // Then try default preset
            const response = await fetch(getApiUrl('/default'));
            if (response.ok) {
                const preset: LayoutPreset = await response.json();
                if (preset && preset.id) {
                    skipNextSaveRef.current = true;
                    applyPresetState(preset);
                    setActivePresetId(preset.id);
                    setLastPresetId(preset.id);
                    lastSavedRef.current = JSON.stringify(gatherCurrentState());
                    loadedRef.current = true;
                    console.log('[LayoutPresets] Loaded default preset:', preset.name);
                    return preset;
                }
            }

            loadedRef.current = true;
            return null;
        } catch (err) {
            console.error('[LayoutPresets] Load default error:', err);
            loadedRef.current = true;
            return null;
        }
    }, [getApiUrl, getLastPresetId, loadPreset, applyPresetState, setActivePresetId, setLastPresetId, gatherCurrentState]);

    // Save current state as new preset
    const saveAsNewPreset = useCallback(async (name: string, description?: string, isShared: boolean = false) => {
        try {
            setLoading(true);
            const presetData = gatherCurrentState();

            const response = await fetch(getApiUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    description,
                    isShared,
                    presetData
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to save preset: ${response.statusText}`);
            }

            const result = await response.json();
            if (!mountedRef.current) return null;

            // Reload presets list
            await loadPresetsList();

            // Set as active preset
            setActivePresetId(result.id);
            setLastPresetId(result.id);
            lastSavedRef.current = JSON.stringify(presetData);

            setError(null);
            console.log('[LayoutPresets] Saved new preset:', name);
            return result;
        } catch (err) {
            console.error('[LayoutPresets] Save error:', err);
            setError(err instanceof Error ? err.message : 'Failed to save preset');
            return null;
        } finally {
            setLoading(false);
        }
    }, [getApiUrl, gatherCurrentState, loadPresetsList, setActivePresetId, setLastPresetId]);

    // Update active preset (auto-save)
    const updateActivePreset = useCallback(async () => {
        if (!activePresetId) return;

        try {
            const presetData = gatherCurrentState();

            const response = await fetch(getApiUrl(`/${activePresetId}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ presetData })
            });

            if (!response.ok) {
                console.error('[LayoutPresets] Failed to update preset:', response.statusText);
                return;
            }

            lastSavedRef.current = JSON.stringify(presetData);
            console.log('[LayoutPresets] Auto-saved preset');
        } catch (err) {
            console.error('[LayoutPresets] Update error:', err);
        }
    }, [getApiUrl, activePresetId, gatherCurrentState]);

    // Schedule debounced auto-save
    const scheduleAutoSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            saveTimeoutRef.current = null;
            updateActivePreset();
        }, SAVE_DEBOUNCE_MS);
    }, [updateActivePreset]);

    // Delete preset
    const deletePreset = useCallback(async (presetId: string) => {
        try {
            setLoading(true);

            const response = await fetch(getApiUrl(`/${presetId}`), {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`Failed to delete preset: ${response.statusText}`);
            }

            // Reload presets list
            await loadPresetsList();

            // Clear active preset if deleted
            if (activePresetId === presetId) {
                setActivePresetId(null);
                setLastPresetId(null);
            }

            setError(null);
            console.log('[LayoutPresets] Deleted preset:', presetId);
            return true;
        } catch (err) {
            console.error('[LayoutPresets] Delete error:', err);
            setError(err instanceof Error ? err.message : 'Failed to delete preset');
            return false;
        } finally {
            setLoading(false);
        }
    }, [getApiUrl, loadPresetsList, activePresetId, setActivePresetId, setLastPresetId]);

    // Copy shared preset to own
    const copyPreset = useCallback(async (presetId: string, newName: string) => {
        try {
            setLoading(true);

            const response = await fetch(getApiUrl(`/${presetId}/copy`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newName })
            });

            if (!response.ok) {
                throw new Error(`Failed to copy preset: ${response.statusText}`);
            }

            const result = await response.json();
            if (!mountedRef.current) return null;

            // Reload presets list
            await loadPresetsList();

            setError(null);
            console.log('[LayoutPresets] Copied preset:', newName);
            return result;
        } catch (err) {
            console.error('[LayoutPresets] Copy error:', err);
            setError(err instanceof Error ? err.message : 'Failed to copy preset');
            return null;
        } finally {
            setLoading(false);
        }
    }, [getApiUrl, loadPresetsList]);

    // Set preset as default
    const setAsDefault = useCallback(async (presetId: string) => {
        try {
            setLoading(true);

            const response = await fetch(getApiUrl(`/${presetId}/default`), {
                method: 'PUT'
            });

            if (!response.ok) {
                throw new Error(`Failed to set default: ${response.statusText}`);
            }

            // Reload presets list
            await loadPresetsList();

            setError(null);
            console.log('[LayoutPresets] Set default preset:', presetId);
            return true;
        } catch (err) {
            console.error('[LayoutPresets] Set default error:', err);
            setError(err instanceof Error ? err.message : 'Failed to set default');
            return false;
        } finally {
            setLoading(false);
        }
    }, [getApiUrl, loadPresetsList]);

    // Update preset metadata (name, description, isShared)
    const updatePresetMetadata = useCallback(async (presetId: string, updates: { name?: string; description?: string; isShared?: boolean }) => {
        try {
            setLoading(true);

            const response = await fetch(getApiUrl(`/${presetId}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            if (!response.ok) {
                throw new Error(`Failed to update preset: ${response.statusText}`);
            }

            // Reload presets list
            await loadPresetsList();

            setError(null);
            return true;
        } catch (err) {
            console.error('[LayoutPresets] Update metadata error:', err);
            setError(err instanceof Error ? err.message : 'Failed to update preset');
            return false;
        } finally {
            setLoading(false);
        }
    }, [getApiUrl, loadPresetsList]);

    // Load presets on connect
    useEffect(() => {
        if (connected) {
            loadedRef.current = false;
            loadPresetsList().then(() => {
                loadDefaultPreset();
            });
        }
    }, [connected, currentRoom, currentUser, loadPresetsList, loadDefaultPreset]);

    // Auto-save when state changes
    useEffect(() => {
        if (!loadedRef.current || skipNextSaveRef.current || !activePresetId) {
            skipNextSaveRef.current = false;
            return;
        }

        const currentData = gatherCurrentState();
        const currentJson = JSON.stringify(currentData);

        if (currentJson !== lastSavedRef.current) {
            scheduleAutoSave();
        }
    }, [
        detailPanelHeightPercent, watchPanelWidthPercent,
        showDetailPanel, showWatchPanel, showStreamPanel,
        views, globalHighlightRules, activeViewId, theme,
        activePresetId, gatherCurrentState, scheduleAutoSave
    ]);

    // Cleanup
    useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    // Get active preset summary
    const activePreset = layoutPresets.find(p => p.id === activePresetId) || null;

    // Separate own and shared presets
    const ownPresets = layoutPresets.filter(p => p.createdBy === currentUser);
    const sharedPresets = layoutPresets.filter(p => p.createdBy !== currentUser && p.isShared);

    return {
        // State
        layoutPresets,
        activePreset,
        activePresetId,
        ownPresets,
        sharedPresets,
        loading,
        error,
        isLoaded: loadedRef.current,

        // Actions
        loadPresetsList,
        loadPreset,
        loadDefaultPreset,
        saveAsNewPreset,
        updateActivePreset,
        deletePreset,
        copyPreset,
        setAsDefault,
        updatePresetMetadata,

        // State update helpers
        updateColumnState,
        updateSidebarOpen,
        columnStateRef,
        sidebarOpenRef
    };
}
