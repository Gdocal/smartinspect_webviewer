/**
 * useServerSettings - Hook for persisting settings to server
 * Settings are stored per (room, user) combination in SQLite on the server
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLogStore } from '../store/logStore';

// Debounce delay for auto-save (ms)
const SAVE_DEBOUNCE_MS = 500;

interface UseServerSettingsOptions {
    autoLoad?: boolean; // Load settings on mount
    autoSave?: boolean; // Auto-save when settings change
}

interface ServerSettingsState<T> {
    settings: T | null;
    loading: boolean;
    saving: boolean;
    error: string | null;
    lastSaved: Date | null;
}

/**
 * Hook to sync settings with server
 * @param defaultSettings Default settings to use when none exist on server
 * @param options Configuration options
 */
export function useServerSettings<T extends Record<string, unknown>>(
    defaultSettings: T,
    options: UseServerSettingsOptions = {}
) {
    const { autoLoad = true, autoSave = true } = options;

    const currentRoom = useLogStore(state => state.currentRoom);
    const currentUser = useLogStore(state => state.currentUser);

    const [state, setState] = useState<ServerSettingsState<T>>({
        settings: null,
        loading: false,
        saving: false,
        error: null,
        lastSaved: null
    });

    // Ref to track if component is mounted
    const mountedRef = useRef(true);
    // Ref for debounced save timeout
    const saveTimeoutRef = useRef<number | null>(null);
    // Ref for pending settings to save (for debouncing)
    const pendingSettingsRef = useRef<Partial<T> | null>(null);

    // Load settings from server
    const loadSettings = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const url = `/api/settings?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to load settings: ${response.statusText}`);
            }

            const data = await response.json();

            if (mountedRef.current) {
                // Merge server settings with defaults
                const merged = { ...defaultSettings, ...data.settings } as T;
                setState(prev => ({
                    ...prev,
                    settings: merged,
                    loading: false
                }));
            }
        } catch (err) {
            console.error('[useServerSettings] Load error:', err);
            if (mountedRef.current) {
                setState(prev => ({
                    ...prev,
                    settings: defaultSettings, // Fall back to defaults
                    loading: false,
                    error: err instanceof Error ? err.message : 'Failed to load settings'
                }));
            }
        }
    }, [currentRoom, currentUser, defaultSettings]);

    // Save settings to server
    const saveSettings = useCallback(async (updates: Partial<T>) => {
        setState(prev => ({ ...prev, saving: true, error: null }));

        try {
            const url = `/api/settings?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`;
            const response = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: updates })
            });

            if (!response.ok) {
                throw new Error(`Failed to save settings: ${response.statusText}`);
            }

            if (mountedRef.current) {
                setState(prev => ({
                    ...prev,
                    settings: prev.settings ? { ...prev.settings, ...updates } : updates as T,
                    saving: false,
                    lastSaved: new Date()
                }));
            }
        } catch (err) {
            console.error('[useServerSettings] Save error:', err);
            if (mountedRef.current) {
                setState(prev => ({
                    ...prev,
                    saving: false,
                    error: err instanceof Error ? err.message : 'Failed to save settings'
                }));
            }
        }
    }, [currentRoom, currentUser]);

    // Save a single setting
    const saveSetting = useCallback(async (key: keyof T, value: T[keyof T]) => {
        setState(prev => ({ ...prev, saving: true, error: null }));

        try {
            const url = `/api/settings/${String(key)}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`;
            const response = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value })
            });

            if (!response.ok) {
                throw new Error(`Failed to save setting: ${response.statusText}`);
            }

            if (mountedRef.current) {
                setState(prev => ({
                    ...prev,
                    settings: prev.settings ? { ...prev.settings, [key]: value } : { [key]: value } as T,
                    saving: false,
                    lastSaved: new Date()
                }));
            }
        } catch (err) {
            console.error('[useServerSettings] Save setting error:', err);
            if (mountedRef.current) {
                setState(prev => ({
                    ...prev,
                    saving: false,
                    error: err instanceof Error ? err.message : 'Failed to save setting'
                }));
            }
        }
    }, [currentRoom, currentUser]);

    // Delete a setting
    const deleteSetting = useCallback(async (key: keyof T) => {
        try {
            const url = `/api/settings/${String(key)}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`;
            const response = await fetch(url, { method: 'DELETE' });

            if (!response.ok) {
                throw new Error(`Failed to delete setting: ${response.statusText}`);
            }

            if (mountedRef.current) {
                setState(prev => {
                    if (!prev.settings) return prev;
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { [key]: _, ...rest } = prev.settings;
                    return {
                        ...prev,
                        settings: { ...defaultSettings, ...rest } as T
                    };
                });
            }
        } catch (err) {
            console.error('[useServerSettings] Delete setting error:', err);
            if (mountedRef.current) {
                setState(prev => ({
                    ...prev,
                    error: err instanceof Error ? err.message : 'Failed to delete setting'
                }));
            }
        }
    }, [currentRoom, currentUser, defaultSettings]);

    // Clear all settings for current room/user
    const clearSettings = useCallback(async () => {
        try {
            const url = `/api/settings?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`;
            const response = await fetch(url, { method: 'DELETE' });

            if (!response.ok) {
                throw new Error(`Failed to clear settings: ${response.statusText}`);
            }

            if (mountedRef.current) {
                setState(prev => ({
                    ...prev,
                    settings: defaultSettings
                }));
            }
        } catch (err) {
            console.error('[useServerSettings] Clear settings error:', err);
            if (mountedRef.current) {
                setState(prev => ({
                    ...prev,
                    error: err instanceof Error ? err.message : 'Failed to clear settings'
                }));
            }
        }
    }, [currentRoom, currentUser, defaultSettings]);

    // Update local settings (with optional auto-save)
    const updateSettings = useCallback((updates: Partial<T>) => {
        setState(prev => ({
            ...prev,
            settings: prev.settings ? { ...prev.settings, ...updates } : updates as T
        }));

        if (autoSave) {
            // Debounce the save
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            pendingSettingsRef.current = {
                ...pendingSettingsRef.current,
                ...updates
            };
            saveTimeoutRef.current = window.setTimeout(() => {
                if (pendingSettingsRef.current) {
                    saveSettings(pendingSettingsRef.current);
                    pendingSettingsRef.current = null;
                }
            }, SAVE_DEBOUNCE_MS);
        }
    }, [autoSave, saveSettings]);

    // Load settings on mount and when room/user changes
    useEffect(() => {
        if (autoLoad) {
            loadSettings();
        }
    }, [autoLoad, loadSettings]);

    // Reload settings when room changes
    useEffect(() => {
        loadSettings();
    }, [currentRoom, currentUser, loadSettings]);

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
        // State
        settings: state.settings ?? defaultSettings,
        loading: state.loading,
        saving: state.saving,
        error: state.error,
        lastSaved: state.lastSaved,

        // Actions
        loadSettings,
        saveSettings,
        saveSetting,
        updateSettings,
        deleteSetting,
        clearSettings
    };
}

/**
 * Simple hook to get/set a single setting value
 * @param key Setting key
 * @param defaultValue Default value
 */
export function useServerSetting<T>(key: string, defaultValue: T) {
    const currentRoom = useLogStore(state => state.currentRoom);
    const currentUser = useLogStore(state => state.currentUser);

    const [value, setValue] = useState<T>(defaultValue);
    const [loading, setLoading] = useState(false);

    // Load on mount
    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const url = `/api/settings/${key}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.value !== null && data.value !== undefined) {
                        setValue(data.value as T);
                    }
                }
            } catch (err) {
                console.error(`[useServerSetting] Load error for ${key}:`, err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [key, currentRoom, currentUser]);

    // Update function that also saves to server
    const updateValue = useCallback(async (newValue: T) => {
        setValue(newValue);
        try {
            const url = `/api/settings/${key}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`;
            await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: newValue })
            });
        } catch (err) {
            console.error(`[useServerSetting] Save error for ${key}:`, err);
        }
    }, [key, currentRoom, currentUser]);

    return [value, updateValue, loading] as const;
}
