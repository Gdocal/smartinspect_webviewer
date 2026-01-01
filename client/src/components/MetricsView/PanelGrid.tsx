/**
 * PanelGrid - Draggable/resizable grid layout for panels
 * Uses react-grid-layout v2 API with hooks (same pattern as working GridTest)
 */

import { useCallback, useMemo, useState, useEffect } from 'react';
import {
    Responsive,
    useContainerWidth,
    verticalCompactor,
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './grid-layout.css';
import { useLogStore } from '../../store/logStore';
import { useMetricsStore, MetricsDashboard, GridLayoutItem } from '../../store/metricsStore';
import { Panel } from './Panel';

const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };

interface PanelGridProps {
    dashboard: MetricsDashboard;
    onOpenSettings: (panelId: string) => void;
}

export function PanelGrid({ dashboard, onOpenSettings }: PanelGridProps) {
    // v2: Use the useContainerWidth hook for responsive width
    const { width, containerRef, mounted } = useContainerWidth();

    const { currentRoom } = useLogStore();
    const {
        updateLayout,
        deletePanel,
        duplicatePanel,
        editMode,
        setFullscreenPanel
    } = useMetricsStore();

    // Row height - larger for better usability (30px per unit)
    const rowHeight = 30;

    // Local state for layouts - sync from dashboard
    const [layouts, setLayouts] = useState<{ lg: GridLayoutItem[] }>(() => ({
        lg: dashboard.layout.map(item => ({
            ...item,
            minW: 2,
            minH: 3  // 3 * 30px = 90px minimum
        }))
    }));

    // Sync layouts when dashboard changes externally
    useEffect(() => {
        setLayouts({
            lg: dashboard.layout.map(item => ({
                ...item,
                minW: 2,
                minH: 3
            }))
        });
    }, [dashboard.id]); // Only reset when dashboard ID changes

    // Handle layout change - v2 API passes (currentLayout, allLayouts)
    const handleLayoutChange = useCallback((_currentLayout: GridLayoutItem[], allLayouts: { lg: GridLayoutItem[] }) => {
        const newLayout = allLayouts.lg;
        if (!newLayout) return;

        console.log('[PanelGrid] Layout changed, heights:', newLayout.map(l => l.h));

        // Update local state
        setLayouts(allLayouts);

        // Persist to store
        const converted: GridLayoutItem[] = newLayout.map(item => ({
            i: item.i,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h
        }));
        updateLayout(currentRoom, dashboard.id, converted);
    }, [currentRoom, dashboard.id, updateLayout]);

    // Panel action handlers
    const handleEdit = useCallback((panelId: string) => {
        onOpenSettings(panelId);
    }, [onOpenSettings]);

    const handleDelete = useCallback((panelId: string) => {
        deletePanel(currentRoom, dashboard.id, panelId);
    }, [currentRoom, dashboard.id, deletePanel]);

    const handleDuplicate = useCallback((panelId: string) => {
        duplicatePanel(currentRoom, dashboard.id, panelId);
    }, [currentRoom, dashboard.id, duplicatePanel]);

    const handleFullscreen = useCallback((panelId: string) => {
        setFullscreenPanel(panelId);
    }, [setFullscreenPanel]);

    // Memoize children for performance (same pattern as working example)
    const children = useMemo(() => {
        return dashboard.panels.map(panel => {
            const layoutItem = layouts.lg.find(l => l.i === panel.id);
            const h = layoutItem?.h || 5;
            const cols = 12;
            const panelWidth = ((width - 32) / cols) * (layoutItem?.w || 6) - 8;
            const panelHeight = (rowHeight * h) + (8 * (h - 1)) - 8;

            return (
                <div key={panel.id} className="h-full">
                    <Panel
                        panel={panel}
                        width={panelWidth}
                        height={panelHeight}
                        editMode={editMode}
                        onEdit={() => handleEdit(panel.id)}
                        onDelete={() => handleDelete(panel.id)}
                        onDuplicate={() => handleDuplicate(panel.id)}
                        onFullscreen={() => handleFullscreen(panel.id)}
                    />
                </div>
            );
        });
    }, [dashboard.panels, layouts.lg, width, rowHeight, editMode, handleEdit, handleDelete, handleDuplicate, handleFullscreen]);

    if (dashboard.panels.length === 0) {
        return null;
    }

    return (
        <div ref={containerRef} className="h-full overflow-auto p-4">
            {mounted && (
                <Responsive
                    className="layout"
                    layouts={layouts}
                    breakpoints={BREAKPOINTS}
                    cols={COLS}
                    rowHeight={rowHeight}
                    width={width - 32}
                    onLayoutChange={handleLayoutChange}
                    compactor={verticalCompactor}
                    margin={[8, 8]}
                    containerPadding={[0, 0]}
                    useCSSTransforms={true}
                >
                    {children}
                </Responsive>
            )}
        </div>
    );
}
