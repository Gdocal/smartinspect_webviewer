/**
 * useSettings - Client settings management with localStorage persistence
 */

import { useState, useCallback } from 'react';

export interface AppSettings {
    serverUrl: string;           // WebSocket server URL (auto-detect or custom)
    authToken: string | null;    // Optional auth token
    maxDisplayEntries: number;   // Max entries to load in client
}

const STORAGE_KEY = 'smartinspect-settings';

// Get default server URL based on current window location
function getDefaultServerUrl(): string {
    if (typeof window === 'undefined') return 'ws://localhost:3000';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
}

const defaultSettings: AppSettings = {
    serverUrl: '',  // Empty means auto-detect
    authToken: null,
    maxDisplayEntries: 10000,
};

function loadSettings(): AppSettings {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...defaultSettings, ...parsed };
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return defaultSettings;
}

function saveSettings(settings: AppSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

export function useSettings() {
    const [settings, setSettings] = useState<AppSettings>(loadSettings);

    // Get effective server URL (auto-detect if empty)
    const getServerUrl = useCallback((): string => {
        return settings.serverUrl || getDefaultServerUrl();
    }, [settings.serverUrl]);

    const updateSettings = useCallback((partial: Partial<AppSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...partial };
            saveSettings(next);
            return next;
        });
    }, []);

    const resetSettings = useCallback(() => {
        setSettings(defaultSettings);
        saveSettings(defaultSettings);
    }, []);

    return {
        settings,
        updateSettings,
        resetSettings,
        getServerUrl,
        defaultSettings,
    };
}

// Singleton for settings access outside of React components
let cachedSettings: AppSettings | null = null;

export function getSettings(): AppSettings {
    if (!cachedSettings) {
        cachedSettings = loadSettings();
    }
    return cachedSettings;
}

export function getEffectiveServerUrl(): string {
    const settings = getSettings();
    return settings.serverUrl || getDefaultServerUrl();
}
