/**
 * useSettings - Client settings management with localStorage persistence
 */

import { useState, useCallback } from 'react';

export interface AppSettings {
    serverUrl: string;           // WebSocket server URL (auto-detect or custom)
    authToken: string | null;    // Optional auth token
    username: string;            // User identifier for per-user settings
    autoSaveProject: boolean;    // Auto-save project changes to server
}

export interface PerformanceSettings {
    // Auto-pause settings for streams
    autoPauseEnabled: boolean;              // Enable auto-pause for high-frequency streams
    autoPauseStreamCountThreshold: number;  // Pause when more than N streams are active
    autoPauseRateThreshold: number;         // Pause streams exceeding N messages/sec
    autoPauseGracePeriod: number;           // Seconds to wait before auto-pausing

    // Watch update throttling
    watchThrottleMode: 'realtime' | 'throttled';  // realtime = immediate updates, throttled = limited
    watchMaxUpdatesPerSecond: number;             // Max watch UI updates per second when throttled
}

const STORAGE_KEY = 'smartinspect-settings';
const PERFORMANCE_STORAGE_KEY = 'smartinspect-performance-settings';

// Default performance settings
const defaultPerformanceSettings: PerformanceSettings = {
    autoPauseEnabled: true,
    autoPauseStreamCountThreshold: 1,  // Legacy setting, no longer used for blocking
    autoPauseRateThreshold: 10,  // Pause streams exceeding 10 msg/s
    autoPauseGracePeriod: 10,    // Wait 10 seconds before auto-pausing
    watchThrottleMode: 'realtime',
    watchMaxUpdatesPerSecond: 10,
};

// Get default server URL based on current window location
function getDefaultServerUrl(): string {
    if (typeof window === 'undefined') return 'ws://localhost:3000';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
}

const defaultSettings: AppSettings = {
    serverUrl: '',  // Empty means auto-detect
    authToken: null,
    username: 'default',  // Default user identifier
    autoSaveProject: false,  // Auto-save project changes to server
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

// Get settings directly from localStorage (always fresh, no caching)
// This ensures changes to settings are immediately visible everywhere
export function getSettings(): AppSettings {
    return loadSettings();
}

export function getEffectiveServerUrl(): string {
    const settings = getSettings();
    return settings.serverUrl || getDefaultServerUrl();
}

// Performance settings management
function loadPerformanceSettings(): PerformanceSettings {
    try {
        const saved = localStorage.getItem(PERFORMANCE_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...defaultPerformanceSettings, ...parsed };
        }
    } catch (e) {
        console.error('Failed to load performance settings:', e);
    }
    return defaultPerformanceSettings;
}

function savePerformanceSettings(settings: PerformanceSettings): void {
    try {
        localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save performance settings:', e);
    }
}

export function usePerformanceSettings() {
    const [settings, setSettings] = useState<PerformanceSettings>(loadPerformanceSettings);

    const updateSettings = useCallback((partial: Partial<PerformanceSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...partial };
            savePerformanceSettings(next);
            return next;
        });
    }, []);

    const resetSettings = useCallback(() => {
        setSettings(defaultPerformanceSettings);
        savePerformanceSettings(defaultPerformanceSettings);
    }, []);

    return {
        settings,
        updateSettings,
        resetSettings,
        defaultSettings: defaultPerformanceSettings,
    };
}

// Get performance settings directly from localStorage (always fresh)
export function getPerformanceSettings(): PerformanceSettings {
    return loadPerformanceSettings();
}
