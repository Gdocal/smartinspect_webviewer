/**
 * Metrics Store - Zustand state management for Metrics View dashboards
 * Provides per-room dashboard configuration with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ==================== Types ====================

export interface TimeRange {
    mode: 'relative' | 'absolute';
    relative?: 'last5m' | 'last15m' | 'last30m' | 'last1h' | 'last3h';
    from?: number;  // Unix timestamp (ms)
    to?: number;    // Unix timestamp (ms)
}

export interface Threshold {
    value: number;
    color: string;    // CSS color
    label?: string;   // Optional label
}

export interface PanelQuery {
    id: string;
    watchName: string;           // Watch name or pattern
    alias?: string;              // Display name override
    color?: string;              // Series color
    expression?: string;         // Transform expression: "rate($value)", "$value / 1000"
}

export type PanelType = 'timeseries' | 'stat' | 'gauge' | 'bar' | 'table' | 'statetimeline';

// State mapping for StateTimeline panel
export interface StateMapping {
    value: string | number;  // The value to match
    text: string;            // Display text for this state
    color: string;           // Color for this state
}

export interface PanelOptions {
    // Time series options
    fillArea?: boolean;
    showPoints?: boolean;
    lineWidth?: number;
    stepped?: boolean;
    legendPosition?: 'bottom' | 'right' | 'none';

    // Stat panel options
    showSparkline?: boolean;
    fontSize?: 'auto' | 'small' | 'medium' | 'large';

    // Gauge options
    min?: number;
    max?: number;
    showMinMax?: boolean;

    // Bar chart options
    orientation?: 'horizontal' | 'vertical';
    sortBy?: 'value' | 'name';

    // Table options
    columns?: string[];  // Which columns to show

    // State Timeline options
    stateMappings?: StateMapping[];  // Value-to-color/text mappings
    rowHeight?: number;              // Row height as ratio (0-1), 1 = no gap between rows
    showValue?: boolean;             // Show value text in timeline segments
    mergeAdjacentStates?: boolean;   // Merge consecutive same-state segments
    fillOpacity?: number;            // Fill opacity (0-1)

    // Common options
    unit?: string;       // ms, %, bytes, req/s, etc.
    decimals?: number;   // Number of decimal places
}

export interface MetricsPanel {
    id: string;
    title: string;
    type: PanelType;
    queries: PanelQuery[];
    options: PanelOptions;
    timeRange: TimeRange;
    liveMode: boolean;
    thresholds?: Threshold[];
}

export interface GridLayoutItem {
    i: string;        // Panel ID
    x: number;        // Grid column (0-11)
    y: number;        // Grid row
    w: number;        // Width in columns
    h: number;        // Height in rows
}

export interface MetricsDashboard {
    id: string;
    name: string;
    roomId: string;
    panels: MetricsPanel[];
    layout: GridLayoutItem[];
    createdAt: string;
    updatedAt: string;
}

// ==================== Store State ====================

interface MetricsState {
    // Per-room dashboards
    dashboardsByRoom: Record<string, MetricsDashboard[]>;

    // Active dashboard per room
    activeDashboardByRoom: Record<string, string | null>;

    // Global UI state
    editMode: boolean;
    fullscreenPanelId: string | null;
    settingsDrawerPanelId: string | null;

    // Actions - Dashboard management
    createDashboard: (roomId: string, name: string) => string;
    deleteDashboard: (roomId: string, dashboardId: string) => void;
    duplicateDashboard: (roomId: string, dashboardId: string) => string;
    renameDashboard: (roomId: string, dashboardId: string, name: string) => void;

    // Actions - Panel management
    addPanel: (roomId: string, dashboardId: string, panel: Omit<MetricsPanel, 'id'>) => string;
    updatePanel: (roomId: string, dashboardId: string, panelId: string, updates: Partial<MetricsPanel>) => void;
    deletePanel: (roomId: string, dashboardId: string, panelId: string) => void;
    duplicatePanel: (roomId: string, dashboardId: string, panelId: string) => string;

    // Actions - Layout
    updateLayout: (roomId: string, dashboardId: string, layout: GridLayoutItem[]) => void;

    // Actions - UI state
    setActiveDashboard: (roomId: string, dashboardId: string | null) => void;
    setEditMode: (enabled: boolean) => void;
    setFullscreenPanel: (panelId: string | null) => void;
    openPanelSettings: (panelId: string | null) => void;

    // Actions - Import/Export
    exportDashboard: (roomId: string, dashboardId: string) => string | null;
    importDashboard: (roomId: string, json: string) => string | null;

    // Helpers
    getDashboard: (roomId: string, dashboardId: string) => MetricsDashboard | null;
    getActiveDashboard: (roomId: string) => MetricsDashboard | null;
    getRoomDashboards: (roomId: string) => MetricsDashboard[];
}

// ==================== Helpers ====================

function generateId(): string {
    return Math.random().toString(36).substring(2, 11);
}

// Default state colors for StateTimeline
export const STATE_COLORS = [
    '#22c55e', // green - success/ok
    '#ef4444', // red - error/fail
    '#f59e0b', // amber - warning
    '#3b82f6', // blue - info
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#f97316', // orange
    '#6b7280', // gray - unknown
];

function createDefaultPanel(type: PanelType): Omit<MetricsPanel, 'id'> {
    return {
        title: `New ${type === 'statetimeline' ? 'State Timeline' : type.charAt(0).toUpperCase() + type.slice(1)} Panel`,
        type,
        queries: [],
        options: {
            fillArea: type === 'timeseries',
            showPoints: false,
            lineWidth: 2,
            legendPosition: 'bottom',
            showSparkline: true,
            fontSize: 'auto',
            min: 0,
            max: 100,
            orientation: 'vertical',
            sortBy: 'value',
            decimals: 2,
            // State Timeline defaults
            stateMappings: type === 'statetimeline' ? [
                { value: 'up', text: 'Up', color: STATE_COLORS[0] },
                { value: 'down', text: 'Down', color: STATE_COLORS[1] },
                { value: 'warning', text: 'Warning', color: STATE_COLORS[2] },
            ] : undefined,
            rowHeight: 0.9, // 0-1, ratio of row fill (1 = no gap)
            showValue: true,
            mergeAdjacentStates: true,
            fillOpacity: 0.9,
        },
        timeRange: {
            mode: 'relative',
            relative: 'last5m'
        },
        liveMode: true,
        thresholds: []
    };
}

// Default colors for series
export const SERIES_COLORS = [
    '#3b82f6', // blue-500
    '#22c55e', // green-500
    '#f59e0b', // amber-500
    '#ef4444', // red-500
    '#8b5cf6', // violet-500
    '#06b6d4', // cyan-500
    '#f97316', // orange-500
    '#ec4899', // pink-500
];

// ==================== Store ====================

// Migration version - stable, no more migrations needed
// With rowHeight=5: h=40 = 200px, h=60 = 300px
const LAYOUT_VERSION = 15;

// Idempotent migration - normalizes heights to sane range for rowHeight=5
// If h is too small (<20 = <100px), scale up. If too big (>100), scale down.
// This is safe to run multiple times.
function migrateLayout(dashboardsByRoom: Record<string, MetricsDashboard[]>): Record<string, MetricsDashboard[]> {
    const migrated: Record<string, MetricsDashboard[]> = {};

    for (const [roomId, dashboards] of Object.entries(dashboardsByRoom)) {
        migrated[roomId] = dashboards.map(dashboard => ({
            ...dashboard,
            layout: dashboard.layout.map(item => {
                // Target range: 20-80 grid units (100px - 400px with rowHeight=5)
                // If already in range, leave it alone
                if (item.h >= 20 && item.h <= 80) {
                    return item;
                }
                // If too small, set to reasonable default
                if (item.h < 20) {
                    return { ...item, h: 40 }; // ~200px default
                }
                // If too big, cap it
                return { ...item, h: 80 }; // ~400px max
            })
        }));
    }

    return migrated;
}

export const useMetricsStore = create<MetricsState>()(
    persist(
        (set, get) => ({
            // Initial state
            dashboardsByRoom: {},
            activeDashboardByRoom: {},
            editMode: false,
            fullscreenPanelId: null,
            settingsDrawerPanelId: null,

            // Dashboard management
            createDashboard: (roomId, name) => {
                const id = generateId();
                const now = new Date().toISOString();
                const dashboard: MetricsDashboard = {
                    id,
                    name,
                    roomId,
                    panels: [],
                    layout: [],
                    createdAt: now,
                    updatedAt: now
                };

                set((state) => ({
                    dashboardsByRoom: {
                        ...state.dashboardsByRoom,
                        [roomId]: [...(state.dashboardsByRoom[roomId] || []), dashboard]
                    },
                    activeDashboardByRoom: {
                        ...state.activeDashboardByRoom,
                        [roomId]: id
                    }
                }));

                return id;
            },

            deleteDashboard: (roomId, dashboardId) => {
                set((state) => {
                    const dashboards = state.dashboardsByRoom[roomId] || [];
                    const filtered = dashboards.filter(d => d.id !== dashboardId);
                    const wasActive = state.activeDashboardByRoom[roomId] === dashboardId;

                    return {
                        dashboardsByRoom: {
                            ...state.dashboardsByRoom,
                            [roomId]: filtered
                        },
                        activeDashboardByRoom: {
                            ...state.activeDashboardByRoom,
                            [roomId]: wasActive ? (filtered[0]?.id || null) : state.activeDashboardByRoom[roomId]
                        }
                    };
                });
            },

            duplicateDashboard: (roomId, dashboardId) => {
                const source = get().getDashboard(roomId, dashboardId);
                if (!source) return '';

                const id = generateId();
                const now = new Date().toISOString();
                const dashboard: MetricsDashboard = {
                    ...source,
                    id,
                    name: `${source.name} (Copy)`,
                    panels: source.panels.map(p => ({ ...p, id: generateId() })),
                    layout: source.layout.map(l => ({ ...l, i: generateId() })),
                    createdAt: now,
                    updatedAt: now
                };

                // Fix layout IDs to match new panel IDs
                const oldToNew = new Map<string, string>();
                source.panels.forEach((p, i) => {
                    oldToNew.set(p.id, dashboard.panels[i].id);
                });
                dashboard.layout = source.layout.map(l => ({
                    ...l,
                    i: oldToNew.get(l.i) || l.i
                }));

                set((state) => ({
                    dashboardsByRoom: {
                        ...state.dashboardsByRoom,
                        [roomId]: [...(state.dashboardsByRoom[roomId] || []), dashboard]
                    }
                }));

                return id;
            },

            renameDashboard: (roomId, dashboardId, name) => {
                set((state) => ({
                    dashboardsByRoom: {
                        ...state.dashboardsByRoom,
                        [roomId]: (state.dashboardsByRoom[roomId] || []).map(d =>
                            d.id === dashboardId
                                ? { ...d, name, updatedAt: new Date().toISOString() }
                                : d
                        )
                    }
                }));
            },

            // Panel management
            addPanel: (roomId, dashboardId, panel) => {
                const id = generateId();
                const newPanel: MetricsPanel = { ...panel, id };

                // Calculate position for new panel (add to bottom)
                const dashboard = get().getDashboard(roomId, dashboardId);
                const maxY = dashboard?.layout.reduce((max, l) => Math.max(max, l.y + l.h), 0) || 0;

                const layoutItem: GridLayoutItem = {
                    i: id,
                    x: 0,
                    y: maxY,
                    w: 6,  // Half width
                    h: 30  // Default height: 30 * 5px = 150px + margins ≈ 270px
                };

                set((state) => ({
                    dashboardsByRoom: {
                        ...state.dashboardsByRoom,
                        [roomId]: (state.dashboardsByRoom[roomId] || []).map(d =>
                            d.id === dashboardId
                                ? {
                                    ...d,
                                    panels: [...d.panels, newPanel],
                                    layout: [...d.layout, layoutItem],
                                    updatedAt: new Date().toISOString()
                                }
                                : d
                        )
                    },
                    settingsDrawerPanelId: id  // Open settings for new panel
                }));

                return id;
            },

            updatePanel: (roomId, dashboardId, panelId, updates) => {
                set((state) => ({
                    dashboardsByRoom: {
                        ...state.dashboardsByRoom,
                        [roomId]: (state.dashboardsByRoom[roomId] || []).map(d =>
                            d.id === dashboardId
                                ? {
                                    ...d,
                                    panels: d.panels.map(p =>
                                        p.id === panelId ? { ...p, ...updates } : p
                                    ),
                                    updatedAt: new Date().toISOString()
                                }
                                : d
                        )
                    }
                }));
            },

            deletePanel: (roomId, dashboardId, panelId) => {
                set((state) => ({
                    dashboardsByRoom: {
                        ...state.dashboardsByRoom,
                        [roomId]: (state.dashboardsByRoom[roomId] || []).map(d =>
                            d.id === dashboardId
                                ? {
                                    ...d,
                                    panels: d.panels.filter(p => p.id !== panelId),
                                    layout: d.layout.filter(l => l.i !== panelId),
                                    updatedAt: new Date().toISOString()
                                }
                                : d
                        )
                    },
                    settingsDrawerPanelId: state.settingsDrawerPanelId === panelId ? null : state.settingsDrawerPanelId,
                    fullscreenPanelId: state.fullscreenPanelId === panelId ? null : state.fullscreenPanelId
                }));
            },

            duplicatePanel: (roomId, dashboardId, panelId) => {
                const dashboard = get().getDashboard(roomId, dashboardId);
                const sourcePanel = dashboard?.panels.find(p => p.id === panelId);
                const sourceLayout = dashboard?.layout.find(l => l.i === panelId);
                if (!sourcePanel || !sourceLayout) return '';

                const id = generateId();
                const newPanel: MetricsPanel = {
                    ...sourcePanel,
                    id,
                    title: `${sourcePanel.title} (Copy)`,
                    queries: sourcePanel.queries.map(q => ({ ...q, id: generateId() }))
                };

                const layoutItem: GridLayoutItem = {
                    ...sourceLayout,
                    i: id,
                    y: sourceLayout.y + sourceLayout.h  // Place below original
                };

                set((state) => ({
                    dashboardsByRoom: {
                        ...state.dashboardsByRoom,
                        [roomId]: (state.dashboardsByRoom[roomId] || []).map(d =>
                            d.id === dashboardId
                                ? {
                                    ...d,
                                    panels: [...d.panels, newPanel],
                                    layout: [...d.layout, layoutItem],
                                    updatedAt: new Date().toISOString()
                                }
                                : d
                        )
                    }
                }));

                return id;
            },

            // Layout
            updateLayout: (roomId, dashboardId, layout) => {
                set((state) => ({
                    dashboardsByRoom: {
                        ...state.dashboardsByRoom,
                        [roomId]: (state.dashboardsByRoom[roomId] || []).map(d =>
                            d.id === dashboardId
                                ? { ...d, layout, updatedAt: new Date().toISOString() }
                                : d
                        )
                    }
                }));
            },

            // UI state
            setActiveDashboard: (roomId, dashboardId) => {
                set((state) => ({
                    activeDashboardByRoom: {
                        ...state.activeDashboardByRoom,
                        [roomId]: dashboardId
                    }
                }));
            },

            setEditMode: (enabled) => set({ editMode: enabled }),
            setFullscreenPanel: (panelId) => set({ fullscreenPanelId: panelId }),
            openPanelSettings: (panelId) => set({ settingsDrawerPanelId: panelId }),

            // Import/Export
            exportDashboard: (roomId, dashboardId) => {
                const dashboard = get().getDashboard(roomId, dashboardId);
                if (!dashboard) return null;

                const exportData = {
                    version: 1,
                    dashboard: {
                        ...dashboard,
                        id: undefined,  // Will be regenerated on import
                        roomId: undefined  // Will be set on import
                    }
                };

                return JSON.stringify(exportData, null, 2);
            },

            importDashboard: (roomId, json) => {
                try {
                    const data = JSON.parse(json);
                    if (data.version !== 1 || !data.dashboard) {
                        console.error('Invalid dashboard export format');
                        return null;
                    }

                    const id = generateId();
                    const now = new Date().toISOString();
                    const dashboard: MetricsDashboard = {
                        ...data.dashboard,
                        id,
                        roomId,
                        createdAt: now,
                        updatedAt: now,
                        // Regenerate all IDs
                        panels: data.dashboard.panels.map((p: MetricsPanel) => ({
                            ...p,
                            id: generateId(),
                            queries: p.queries.map(q => ({ ...q, id: generateId() }))
                        }))
                    };

                    // Fix layout IDs
                    const oldToNew = new Map<string, string>();
                    data.dashboard.panels.forEach((p: MetricsPanel, i: number) => {
                        oldToNew.set(p.id, dashboard.panels[i].id);
                    });
                    dashboard.layout = data.dashboard.layout.map((l: GridLayoutItem) => ({
                        ...l,
                        i: oldToNew.get(l.i) || l.i
                    }));

                    set((state) => ({
                        dashboardsByRoom: {
                            ...state.dashboardsByRoom,
                            [roomId]: [...(state.dashboardsByRoom[roomId] || []), dashboard]
                        }
                    }));

                    return id;
                } catch (e) {
                    console.error('Failed to import dashboard:', e);
                    return null;
                }
            },

            // Helpers
            getDashboard: (roomId, dashboardId) => {
                const dashboards = get().dashboardsByRoom[roomId] || [];
                return dashboards.find(d => d.id === dashboardId) || null;
            },

            getActiveDashboard: (roomId) => {
                const activeId = get().activeDashboardByRoom[roomId];
                if (!activeId) return null;
                return get().getDashboard(roomId, activeId);
            },

            getRoomDashboards: (roomId) => {
                return get().dashboardsByRoom[roomId] || [];
            }
        }),
        {
            name: 'smartinspect-metrics',
            version: LAYOUT_VERSION,
            migrate: (persistedState: unknown, version: number) => {
                const state = persistedState as MetricsState;

                // Always migrate if version is different
                if (version < LAYOUT_VERSION && state.dashboardsByRoom) {
                    console.log('[metricsStore] Migrating layouts from version', version, 'to', LAYOUT_VERSION);
                    return {
                        ...state,
                        dashboardsByRoom: migrateLayout(state.dashboardsByRoom)
                    };
                }

                return state;
            }
        }
    )
);

// Export helper for creating default panels
export { createDefaultPanel };
