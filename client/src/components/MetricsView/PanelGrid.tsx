/**
 * PanelGrid - Draggable/resizable grid layout for panels
 */

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import GridLayout from 'react-grid-layout';
const RGL = GridLayout as any;
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './grid-layout.css';
import { useLogStore } from '../../store/logStore';
import { useMetricsStore, MetricsDashboard, GridLayoutItem } from '../../store/metricsStore';
import { Panel } from './Panel';

interface PanelGridProps {
    dashboard: MetricsDashboard;
    onOpenSettings: (panelId: string) => void;
}

export function PanelGrid({ dashboard, onOpenSettings }: PanelGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(1200);
    const { currentRoom } = useLogStore();
    const {
        updateLayout,
        deletePanel,
        duplicatePanel,
        editMode,
        setFullscreenPanel
    } = useMetricsStore();

    // Track container width for responsive layout
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Convert our layout format to react-grid-layout format
    const layout = useMemo(() => {
        return dashboard.layout.map(item => ({
            i: item.i,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            minW: 1,
            minH: 1  // Minimum ~30px height
        }));
    }, [dashboard.layout]);

    // Handle layout change - using any[] due to react-grid-layout type inconsistencies
    const handleLayoutChange = useCallback((newLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => {
        // With rowHeight=5, each h unit = 5px + 4px margin = 9px step
        console.log('[PanelGrid] Heights (grid units):', newLayout.map(l => l.h),
            'Pixel heights:', newLayout.map(l => l.h * 5 + (l.h - 1) * 4));
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

    // Row height controls resize granularity - smaller = finer control
    // Each resize step = rowHeight + vertical margin
    // With rowHeight=5 and margin=[4,4], step = 9px (very fine control)
    const rowHeight = 5;
    const cols = 12;

    if (dashboard.panels.length === 0) {
        return null;
    }

    return (
        <div ref={containerRef} className="h-full overflow-auto p-4">
            <RGL
                className="layout"
                layout={layout}
                cols={cols}
                rowHeight={rowHeight}
                width={containerWidth - 32}
                onLayoutChange={handleLayoutChange}
                isDraggable={editMode}
                isResizable={editMode}
                draggableHandle=".cursor-move"
                margin={[4, 4]}
                containerPadding={[0, 0]}
                useCSSTransforms={true}
                compactType={null}
                preventCollision={false}
            >
                {dashboard.panels.map(panel => {
                    const layoutItem = dashboard.layout.find(l => l.i === panel.id);
                    const h = layoutItem?.h || 30;
                    const panelWidth = ((containerWidth - 32) / cols) * (layoutItem?.w || 6) - 8;
                    // Height = (rowHeight * h) + (margin * (h-1)) - padding
                    const panelHeight = (rowHeight * h) + (4 * (h - 1)) - 8;

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
                })}
            </RGL>
        </div>
    );
}
