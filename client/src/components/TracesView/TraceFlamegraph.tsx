/**
 * TraceFlamegraph - True flame graph visualization for trace spans
 *
 * Key differences from flame chart:
 * - X-axis: Width represents total time consumed (not timeline position)
 * - Aggregation: Merges identical call paths into single frames
 * - Sort: Frames sorted alphabetically at each level (not by time)
 * - Direction: Root at bottom, callees above (icicle is inverted)
 *
 * Features:
 * - Canvas-based rendering for performance
 * - Color by service/kind or by self-time (heat map)
 * - Zoom into subtrees (double-click)
 * - Hover tooltips with aggregated stats
 * - Click to select/highlight matching spans
 */

import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import {
    useTraceStore,
    SpanNode,
    formatDuration
} from '../../store/traceStore';

// Service color palette (distinct colors)
const SERVICE_COLORS = [
    '#3b82f6', // blue
    '#22c55e', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
    '#6366f1', // indigo
];

// Error color
const ERROR_COLOR = '#ef4444';

// Aggregated flame graph frame
interface FlameFrame {
    // Aggregation key - unique identifier for this call path
    key: string;
    // Display name (span name or operation)
    name: string;
    // Service/kind for coloring
    service: string;
    // Total duration across all instances
    totalDuration: number;
    // Self time (total - children)
    selfTime: number;
    // Number of span instances aggregated
    count: number;
    // Has any error in aggregated spans
    hasError: boolean;
    // Depth in the call stack
    depth: number;
    // Children frames (aggregated)
    children: FlameFrame[];
    // Original span IDs for selection
    spanIds: string[];
    // Position in parent (for layout calculation)
    x: number;
    width: number;
}

export function TraceFlamegraph() {
    const {
        traceTree,
        selectedSpanId,
        loadingTree,
        setSelectedSpanId
    } = useTraceStore();

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
    const [hoveredFrame, setHoveredFrame] = useState<FlameFrame | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [colorBy, setColorBy] = useState<'service' | 'self-time'>('service');
    const [zoomFrame, setZoomFrame] = useState<FlameFrame | null>(null);

    // Row height for flamegraph
    const ROW_HEIGHT = 22;
    const PADDING = { top: 10, right: 10, bottom: 10, left: 10 };

    // Build aggregated flame graph data structure
    const { rootFrame, serviceIndex, totalDuration } = useMemo(() => {
        if (!traceTree || traceTree.roots.length === 0) {
            return { rootFrame: null, maxDepth: 0, serviceIndex: new Map<string, number>(), totalDuration: 0 };
        }

        const serviceIndex = new Map<string, number>();

        // Helper to get a unique key for aggregation
        // We aggregate spans with the same name at the same call stack position
        const getFrameKey = (span: SpanNode, parentKey: string): string => {
            return `${parentKey}>${span.name}`;
        };

        // Recursively build aggregated frames
        const buildAggregatedFrame = (
            spans: SpanNode[],
            parentKey: string,
            depth: number
        ): FlameFrame[] => {
            // Group spans by name for aggregation
            const frameMap = new Map<string, FlameFrame>();

            for (const span of spans) {
                const frameKey = getFrameKey(span, parentKey);
                const service = span.kind || 'Unknown';

                // Track service for coloring
                if (!serviceIndex.has(service)) {
                    serviceIndex.set(service, serviceIndex.size);
                }

                const duration = span.duration || 0;

                if (frameMap.has(frameKey)) {
                    // Aggregate into existing frame
                    const frame = frameMap.get(frameKey)!;
                    frame.totalDuration += duration;
                    frame.count += 1;
                    frame.hasError = frame.hasError || span.hasError || span.status === 'Error';
                    frame.spanIds.push(span.spanId);

                    // Recursively aggregate children
                    const childFrames = buildAggregatedFrame(span.children, frameKey, depth + 1);
                    mergeChildren(frame, childFrames);
                } else {
                    // Create new frame
                    const childFrames = buildAggregatedFrame(span.children, frameKey, depth + 1);

                    // Calculate self time (total - children)
                    const childrenDuration = childFrames.reduce((sum, c) => sum + c.totalDuration, 0);
                    const selfTime = Math.max(0, duration - childrenDuration);

                    const frame: FlameFrame = {
                        key: frameKey,
                        name: span.name,
                        service,
                        totalDuration: duration,
                        selfTime,
                        count: 1,
                        hasError: span.hasError || span.status === 'Error',
                        depth,
                        children: childFrames,
                        spanIds: [span.spanId],
                        x: 0,
                        width: 0
                    };

                    frameMap.set(frameKey, frame);
                }
            }

            // Sort frames alphabetically by name
            const frames = Array.from(frameMap.values());
            frames.sort((a, b) => a.name.localeCompare(b.name));

            return frames;
        };

        // Merge children from another span into existing frame
        const mergeChildren = (frame: FlameFrame, newChildren: FlameFrame[]) => {
            for (const newChild of newChildren) {
                const existing = frame.children.find(c => c.key === newChild.key);
                if (existing) {
                    // Merge
                    existing.totalDuration += newChild.totalDuration;
                    existing.selfTime += newChild.selfTime;
                    existing.count += newChild.count;
                    existing.hasError = existing.hasError || newChild.hasError;
                    existing.spanIds.push(...newChild.spanIds);
                    mergeChildren(existing, newChild.children);
                } else {
                    frame.children.push(newChild);
                }
            }
            // Re-sort after merge
            frame.children.sort((a, b) => a.name.localeCompare(b.name));
        };

        // Build root frames from trace roots
        const rootChildren = buildAggregatedFrame(traceTree.roots, '', 0);

        // Calculate total duration
        const total = rootChildren.reduce((sum, f) => sum + f.totalDuration, 0);

        // Create virtual root frame
        const rootFrame: FlameFrame = {
            key: 'root',
            name: 'all',
            service: 'root',
            totalDuration: total,
            selfTime: 0,
            count: traceTree.roots.length,
            hasError: rootChildren.some(c => c.hasError),
            depth: -1, // Not rendered
            children: rootChildren,
            spanIds: [],
            x: 0,
            width: 1
        };

        // Calculate layout (x positions and widths)
        const calculateLayout = (frame: FlameFrame) => {
            let currentX = frame.x;
            const parentWidth = frame.width;
            const parentDuration = frame.totalDuration || 1;

            for (const child of frame.children) {
                child.x = currentX;
                child.width = (child.totalDuration / parentDuration) * parentWidth;
                currentX += child.width;
                calculateLayout(child);
            }
        };

        calculateLayout(rootFrame);

        // Calculate max depth
        const getMaxDepth = (frame: FlameFrame): number => {
            if (frame.children.length === 0) return frame.depth;
            return Math.max(...frame.children.map(getMaxDepth));
        };

        const maxDepth = getMaxDepth(rootFrame);

        return { rootFrame, maxDepth, serviceIndex, totalDuration: total };
    }, [traceTree]);

    // Get the frame to display (root or zoomed)
    const displayFrame = zoomFrame || rootFrame;

    // Flatten frames for rendering (depth-first, but we render bottom-up)
    const flatFrames = useMemo(() => {
        if (!displayFrame) return [];

        const frames: FlameFrame[] = [];

        const collect = (frame: FlameFrame) => {
            // Don't collect the virtual root or zoom root frame itself
            if (frame.depth >= 0) {
                frames.push(frame);
            }
            for (const child of frame.children) {
                collect(child);
            }
        };

        for (const child of displayFrame.children) {
            collect(child);
        }

        // Adjust depths if zoomed
        if (zoomFrame) {
            const depthOffset = zoomFrame.depth + 1;
            for (const frame of frames) {
                frame.depth -= depthOffset;
            }
        }

        return frames;
    }, [displayFrame, zoomFrame]);

    // Calculate required canvas height (root at bottom)
    const visibleMaxDepth = flatFrames.length > 0
        ? Math.max(...flatFrames.map(f => f.depth))
        : 0;
    const canvasHeight = Math.max(150, (visibleMaxDepth + 1) * ROW_HEIGHT + PADDING.top + PADDING.bottom + 30);

    // Update dimensions on resize
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setDimensions({ width: rect.width, height: Math.max(canvasHeight, rect.height) });
            }
        };

        updateDimensions();
        const observer = new ResizeObserver(updateDimensions);
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [canvasHeight]);

    // Draw flamegraph
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = dimensions.width * dpr;
        canvas.height = dimensions.height * dpr;
        ctx.scale(dpr, dpr);

        const chartWidth = dimensions.width - PADDING.left - PADDING.right;
        const isDark = document.documentElement.classList.contains('dark');

        // Clear
        ctx.fillStyle = isDark ? '#1e293b' : '#f8fafc';
        ctx.fillRect(0, 0, dimensions.width, dimensions.height);

        if (flatFrames.length === 0) return;

        // Calculate max self-time ratio for heat map coloring
        const maxSelfTimeRatio = Math.max(
            0.01,
            ...flatFrames.map(f => f.selfTime / (f.totalDuration || 1))
        );

        // Draw frames (bottom-up: depth 0 at bottom)
        for (const frame of flatFrames) {
            const x = PADDING.left + frame.x * chartWidth;
            // Invert Y: depth 0 at bottom
            const y = dimensions.height - PADDING.bottom - (frame.depth + 1) * ROW_HEIGHT;
            const width = Math.max(1, frame.width * chartWidth - 1);
            const height = ROW_HEIGHT - 2;

            if (width < 0.5) continue; // Skip very small frames

            // Determine color
            let color: string;
            if (frame.hasError) {
                color = ERROR_COLOR;
            } else if (colorBy === 'service') {
                const idx = serviceIndex.get(frame.service) || 0;
                color = SERVICE_COLORS[idx % SERVICE_COLORS.length];
            } else {
                // Self-time heat map (warm colors)
                const selfRatio = frame.selfTime / (frame.totalDuration || 1);
                const normalized = selfRatio / maxSelfTimeRatio;
                // Use warm flame colors: low self-time = yellow, high = red
                const hue = 60 - normalized * 60; // 60 (yellow) to 0 (red)
                const saturation = 70 + normalized * 20;
                const lightness = 55 - normalized * 10;
                color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
            }

            // Highlight if selected or hovered
            const isSelected = frame.spanIds.includes(selectedSpanId || '');
            const isHovered = hoveredFrame?.key === frame.key;

            // Draw selection highlight
            if (isSelected) {
                ctx.fillStyle = isDark ? '#3b82f6' : '#2563eb';
                ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
            }

            // Draw frame rectangle
            ctx.fillStyle = isHovered ? adjustBrightness(color, 1.15) : color;
            ctx.fillRect(x, y, width, height);

            // Draw border for better definition
            ctx.strokeStyle = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)';
            ctx.strokeRect(x, y, width, height);

            // Draw frame name if wide enough
            if (width > 35) {
                ctx.fillStyle = isDark ? '#ffffff' : '#1e293b';
                ctx.font = '11px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                // Show count if aggregated
                let displayName = frame.name;
                if (frame.count > 1) {
                    displayName = `${frame.name} (${frame.count})`;
                }

                const maxChars = Math.floor((width - 8) / 6.5);
                if (displayName.length > maxChars) {
                    displayName = displayName.substring(0, maxChars - 2) + '..';
                }

                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, width, height);
                ctx.clip();
                ctx.fillText(displayName, x + 4, y + height / 2 + 1);
                ctx.restore();
            }
        }

        // Draw "root" label at bottom
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(
            zoomFrame ? `Zoomed: ${zoomFrame.name}` : 'all spans',
            dimensions.width / 2,
            dimensions.height - PADDING.bottom + 5
        );

    }, [dimensions, flatFrames, selectedSpanId, hoveredFrame, colorBy, serviceIndex, zoomFrame]);

    // Find frame at position
    const findFrameAtPosition = useCallback((clientX: number, clientY: number): FlameFrame | null => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return null;

        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const chartWidth = dimensions.width - PADDING.left - PADDING.right;

        for (const frame of flatFrames) {
            const frameX = PADDING.left + frame.x * chartWidth;
            const frameY = dimensions.height - PADDING.bottom - (frame.depth + 1) * ROW_HEIGHT;
            const frameWidth = Math.max(1, frame.width * chartWidth - 1);
            const frameHeight = ROW_HEIGHT - 2;

            if (x >= frameX && x <= frameX + frameWidth && y >= frameY && y <= frameY + frameHeight) {
                return frame;
            }
        }

        return null;
    }, [dimensions, flatFrames]);

    // Mouse handlers
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const frame = findFrameAtPosition(e.clientX, e.clientY);
        setHoveredFrame(frame);
        setMousePos({ x: e.clientX, y: e.clientY });
    }, [findFrameAtPosition]);

    const handleClick = useCallback(() => {
        if (hoveredFrame && hoveredFrame.spanIds.length > 0) {
            // If clicking same frame, deselect
            const currentlySelected = hoveredFrame.spanIds.includes(selectedSpanId || '');
            if (currentlySelected) {
                setSelectedSpanId(null);
            } else {
                // Select first span in the aggregated frame
                setSelectedSpanId(hoveredFrame.spanIds[0]);
            }
        }
    }, [hoveredFrame, selectedSpanId, setSelectedSpanId]);

    const handleDoubleClick = useCallback(() => {
        if (hoveredFrame && hoveredFrame.children.length > 0) {
            // Find the original frame in the tree (not from flatFrames with adjusted depth)
            const findOriginalFrame = (frame: FlameFrame): FlameFrame | null => {
                if (frame.key === hoveredFrame.key) return frame;
                for (const child of frame.children) {
                    const found = findOriginalFrame(child);
                    if (found) return found;
                }
                return null;
            };

            if (rootFrame) {
                const original = findOriginalFrame(rootFrame);
                if (original) {
                    setZoomFrame(original);
                }
            }
        }
    }, [hoveredFrame, rootFrame]);

    const handleMouseLeave = useCallback(() => {
        setHoveredFrame(null);
    }, []);

    // Reset zoom
    const handleResetZoom = useCallback(() => {
        setZoomFrame(null);
    }, []);

    if (loadingTree) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400">
                <div className="flex flex-col items-center gap-3">
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-sm">Loading trace...</span>
                </div>
            </div>
        );
    }

    if (!traceTree) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                <div className="flex flex-col items-center gap-3">
                    <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
                    </svg>
                    <span>Select a trace to view flame graph</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 bg-white dark:bg-slate-800">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Flame Graph
                    </h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                        {flatFrames.length} frames
                    </span>
                    {zoomFrame && (
                        <button
                            onClick={handleResetZoom}
                            className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                            </svg>
                            Reset zoom
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Color by toggle */}
                    <div className="flex items-center gap-1 text-xs">
                        <span className="text-slate-500">Color:</span>
                        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700 rounded p-0.5">
                            <button
                                onClick={() => setColorBy('service')}
                                className={`px-2 py-0.5 rounded transition-colors ${
                                    colorBy === 'service'
                                        ? 'bg-blue-500 text-white'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                                }`}
                            >
                                Kind
                            </button>
                            <button
                                onClick={() => setColorBy('self-time')}
                                className={`px-2 py-0.5 rounded transition-colors ${
                                    colorBy === 'self-time'
                                        ? 'bg-blue-500 text-white'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                                }`}
                            >
                                Self-time
                            </button>
                        </div>
                    </div>

                    {/* Total duration */}
                    <div className="text-sm font-mono text-slate-600 dark:text-slate-400">
                        Total: <span className="font-semibold">{formatDuration(totalDuration)}</span>
                    </div>
                </div>
            </div>

            {/* Canvas */}
            <div ref={containerRef} className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900 relative">
                <canvas
                    ref={canvasRef}
                    className="cursor-pointer"
                    style={{ width: dimensions.width, height: dimensions.height }}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                />

                {/* Tooltip */}
                {hoveredFrame && (
                    <div
                        className="fixed pointer-events-none bg-slate-900 dark:bg-slate-700 text-white text-xs rounded-lg shadow-xl px-3 py-2 z-50 max-w-sm"
                        style={{
                            left: Math.min(mousePos.x + 12, window.innerWidth - 280),
                            top: mousePos.y + 12
                        }}
                    >
                        <div className="font-semibold mb-1.5 text-sm break-all">{hoveredFrame.name}</div>
                        <div className="text-slate-300 space-y-1">
                            <div className="flex justify-between gap-4">
                                <span>Total time:</span>
                                <span className="text-white font-mono">{formatDuration(hoveredFrame.totalDuration)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span>Self time:</span>
                                <span className="text-amber-300 font-mono">{formatDuration(hoveredFrame.selfTime)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span>% of trace:</span>
                                <span className="text-white font-mono">
                                    {totalDuration > 0 ? ((hoveredFrame.totalDuration / totalDuration) * 100).toFixed(1) : 0}%
                                </span>
                            </div>
                            {hoveredFrame.count > 1 && (
                                <div className="flex justify-between gap-4">
                                    <span>Samples:</span>
                                    <span className="text-blue-300">{hoveredFrame.count} calls</span>
                                </div>
                            )}
                            {hoveredFrame.service && hoveredFrame.service !== 'Unknown' && (
                                <div className="flex justify-between gap-4">
                                    <span>Kind:</span>
                                    <span className="text-white">{hoveredFrame.service}</span>
                                </div>
                            )}
                            {hoveredFrame.hasError && (
                                <div className="text-red-400 font-medium mt-1">⚠ Has errors</div>
                            )}
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-slate-600 text-[10px] text-slate-400">
                            Click to select • Double-click to zoom
                        </div>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="flex-shrink-0 px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs bg-white dark:bg-slate-800">
                {colorBy === 'service' ? (
                    <>
                        <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">Span kind:</span>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {Array.from(serviceIndex.entries()).map(([service, index]) => (
                                <div key={service} className="flex items-center gap-1.5">
                                    <div
                                        className="w-3 h-2.5 rounded-sm"
                                        style={{ backgroundColor: SERVICE_COLORS[index % SERVICE_COLORS.length] }}
                                    />
                                    <span className="text-slate-600 dark:text-slate-400">{service}</span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">Self-time:</span>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">Low</span>
                            <div className="w-24 h-3 rounded" style={{ background: 'linear-gradient(to right, hsl(60, 70%, 55%), hsl(30, 80%, 50%), hsl(0, 90%, 45%))' }} />
                            <span className="text-slate-400">High</span>
                        </div>
                        <span className="text-slate-400 ml-2">(wider = more total time, hotter = more self time)</span>
                    </>
                )}
            </div>
        </div>
    );
}

// Helper to adjust color brightness
function adjustBrightness(color: string, factor: number): string {
    if (color.startsWith('#')) {
        const hex = color.slice(1);
        const r = Math.min(255, Math.floor(parseInt(hex.slice(0, 2), 16) * factor));
        const g = Math.min(255, Math.floor(parseInt(hex.slice(2, 4), 16) * factor));
        const b = Math.min(255, Math.floor(parseInt(hex.slice(4, 6), 16) * factor));
        return `rgb(${r}, ${g}, ${b})`;
    }
    if (color.startsWith('hsl')) {
        // For HSL, increase lightness
        const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (match) {
            const h = parseInt(match[1]);
            const s = parseInt(match[2]);
            const l = Math.min(90, Math.floor(parseInt(match[3]) * factor));
            return `hsl(${h}, ${s}%, ${l}%)`;
        }
    }
    return color;
}
