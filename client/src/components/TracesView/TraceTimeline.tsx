/**
 * TraceTimeline - Interactive timeline with zoom/pan, time range selection
 * Features:
 * - Gantt-chart style: X-axis is time, Y-axis is traces (older at top, newer at bottom)
 * - Auto-follow mode: automatically scrolls to show newest traces
 * - Pause auto-follow when user interacts (zoom/pan/click)
 * - Resume button to re-enable auto-follow
 * - Zoom in/out with scroll wheel or buttons
 * - Pan by dragging
 * - Range slider to select time window
 * - Virtual scrolling for traces in vertical axis
 */

import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import {
    useTraceStore,
    TraceSummary,
    formatDuration
} from '../../store/traceStore';

interface TraceTimelineProps {
    onSelectTrace: (trace: TraceSummary) => void;
    /** Minimum height for the chart. Default: 120px */
    minHeight?: number;
    /** Maximum height for the chart (scrollbar appears above this). Default: 300px */
    maxHeight?: number;
}

// Format time based on the range we're viewing
function formatTimeLabel(time: number, rangeDuration: number): string {
    const date = new Date(time);

    // Less than 1 minute - show seconds.ms
    if (rangeDuration < 60000) {
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            minute: '2-digit',
            second: '2-digit'
        }) + '.' + String(date.getMilliseconds()).padStart(3, '0').substring(0, 1);
    }
    // Less than 1 hour - show HH:MM:SS
    if (rangeDuration < 3600000) {
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
    // Less than 1 day - show HH:MM
    if (rangeDuration < 86400000) {
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    // More than 1 day - show date + time
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    }) + ' ' + date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Format duration for display
function formatRangeDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
    return `${(ms / 86400000).toFixed(1)}d`;
}

export function TraceTimeline({ onSelectTrace, minHeight = 120, maxHeight = 300 }: TraceTimelineProps) {
    const { traces, selectedTraceId, autoScroll, setAutoScroll } = useTraceStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Use ref for "now" timestamp to avoid re-renders - only used for drawing
    const nowRef = useRef(Date.now());

    const [containerWidth, setContainerWidth] = useState(800);

    // Vertical scroll offset for virtualized rendering
    const [scrollTop, setScrollTop] = useState(0);

    // View state - what portion of the full time range are we viewing
    const [viewStart, setViewStart] = useState<number | null>(null);
    const [viewEnd, setViewEnd] = useState<number | null>(null);

    // Interaction state
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, viewStart: 0 });
    const [hoveredTrace, setHoveredTrace] = useState<TraceSummary | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    // Track if user has manually interacted with the timeline
    const userInteractedRef = useRef(false);

    // Row height - fixed for consistency
    const ROW_HEIGHT = 14;

    // Calculate full data range - memoize heavily to avoid recalcs
    const dataRange = useMemo(() => {
        const now = Date.now();
        if (traces.length === 0) {
            return { min: now - 60000, max: now };
        }

        let min = Infinity;
        let max = -Infinity;

        for (const trace of traces) {
            const start = new Date(trace.startTime).getTime();
            const end = trace.endTime
                ? new Date(trace.endTime).getTime()
                : start + (trace.duration || 1000);

            if (start < min) min = start;
            if (end > max) max = end;
        }

        return { min, max };
    }, [traces]);

    // Initialize view
    useEffect(() => {
        if (viewStart === null || viewEnd === null) {
            // Initial view: show last 60 seconds + 10% future
            const now = Date.now();
            const viewRange = 60000; // 1 minute
            setViewStart(now - viewRange);
            setViewEnd(now + viewRange * 0.1);
        }
    }, [viewStart, viewEnd]);

    // Auto-follow effect - runs on interval, not on every render
    useEffect(() => {
        if (!autoScroll || userInteractedRef.current) return;

        const interval = setInterval(() => {
            const now = Date.now();
            nowRef.current = now;

            setViewEnd(prevEnd => {
                if (prevEnd === null) return null;
                // Get current range
                setViewStart(prevStart => {
                    if (prevStart === null) return null;
                    const currentRange = prevEnd - prevStart;
                    // Shift view so "now" is at 90% position
                    const newEnd = now + currentRange * 0.1;
                    const newStart = newEnd - currentRange;
                    return newStart;
                });
                const prevStart = viewStart ?? now - 60000;
                const currentRange = prevEnd - prevStart;
                return now + currentRange * 0.1;
            });
        }, 500); // Update every 500ms when auto-following

        return () => clearInterval(interval);
    }, [autoScroll, viewStart]);

    // Current view range - debounce for smoother updates during drag
    const viewRange = useMemo(() => {
        const start = viewStart ?? dataRange.min;
        const end = viewEnd ?? dataRange.max;
        return { start, end, duration: end - start };
    }, [viewStart, viewEnd, dataRange]);

    // Update width on resize
    useEffect(() => {
        const updateWidth = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setContainerWidth(rect.width);
            }
        };

        updateWidth();
        const observer = new ResizeObserver(updateWidth);
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Filter and sort traces in view (oldest first = top, newest last = bottom)
    const visibleTraces = useMemo(() => {
        return traces.filter(trace => {
            const start = new Date(trace.startTime).getTime();
            const end = trace.endTime
                ? new Date(trace.endTime).getTime()
                : start + (trace.duration || 1000);
            return end >= viewRange.start && start <= viewRange.end;
        }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }, [traces, viewRange]);

    // Chart dimensions - with dynamic height based on trace count
    const chartPadding = { top: 20, right: 16, bottom: 24, left: 8 };
    const chartWidth = containerWidth - chartPadding.left - chartPadding.right;

    // Calculate required height - clamp between min and max
    const requiredChartHeight = visibleTraces.length * ROW_HEIGHT + chartPadding.top + chartPadding.bottom;
    const displayHeight = Math.max(minHeight, Math.min(maxHeight, requiredChartHeight));
    const chartHeight = displayHeight - chartPadding.top - chartPadding.bottom;

    // Total content height for scrolling
    const totalContentHeight = visibleTraces.length * ROW_HEIGHT;
    const needsScroll = totalContentHeight > chartHeight;

    // Calculate visible range based on scroll position
    const visibleStartIndex = Math.floor(scrollTop / ROW_HEIGHT);
    const visibleEndIndex = Math.min(
        visibleTraces.length,
        Math.ceil((scrollTop + chartHeight) / ROW_HEIGHT) + 2 // +2 for buffer
    );

    // Time to X position
    const timeToX = useCallback((time: number) => {
        return ((time - viewRange.start) / viewRange.duration) * chartWidth;
    }, [viewRange, chartWidth]);

    // X position to time
    const xToTime = useCallback((x: number) => {
        return viewRange.start + (x / chartWidth) * viewRange.duration;
    }, [viewRange, chartWidth]);

    // Draw canvas - virtualized rendering
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const canvasHeight = displayHeight - 32;
        canvas.width = containerWidth * dpr;
        canvas.height = canvasHeight * dpr;
        ctx.scale(dpr, dpr);

        // Clear
        ctx.clearRect(0, 0, containerWidth, canvasHeight);

        // Background
        ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#1e293b' : '#f8fafc';
        ctx.fillRect(chartPadding.left, chartPadding.top, chartWidth, chartHeight);

        // Grid lines
        const gridCount = Math.min(10, Math.max(4, Math.floor(chartWidth / 80)));
        ctx.strokeStyle = document.documentElement.classList.contains('dark') ? '#334155' : '#e2e8f0';
        ctx.lineWidth = 0.5;

        for (let i = 0; i <= gridCount; i++) {
            const x = chartPadding.left + (i / gridCount) * chartWidth;
            ctx.beginPath();
            ctx.moveTo(x, chartPadding.top);
            ctx.lineTo(x, chartPadding.top + chartHeight);
            ctx.stroke();
        }

        // Time labels at top
        ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';

        for (let i = 0; i <= gridCount; i++) {
            const time = viewRange.start + (i / gridCount) * viewRange.duration;
            const x = chartPadding.left + (i / gridCount) * chartWidth;
            ctx.fillText(formatTimeLabel(time, viewRange.duration), x, chartPadding.top - 6);
        }

        // Draw only visible traces (virtualized)
        for (let i = visibleStartIndex; i < visibleEndIndex; i++) {
            const trace = visibleTraces[i];
            if (!trace) continue;

            const startTime = new Date(trace.startTime).getTime();
            const duration = trace.duration || 100;
            const endTime = startTime + duration;

            const x = chartPadding.left + timeToX(startTime);
            const width = Math.max(3, timeToX(endTime) - timeToX(startTime));
            // Position relative to scroll - calculate where this trace appears in the visible window
            const y = chartPadding.top + (i * ROW_HEIGHT - scrollTop) + 1;
            const height = ROW_HEIGHT - 2;

            // Skip if outside visible area
            if (y + height < chartPadding.top || y > chartPadding.top + chartHeight) continue;

            // Clip to visible area horizontally
            const clipX = Math.max(chartPadding.left, x);
            const clipWidth = Math.min(x + width, chartPadding.left + chartWidth) - clipX;

            if (clipWidth <= 0) continue;

            // Selection highlight
            if (selectedTraceId === trace.traceId) {
                ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#1e40af' : '#bfdbfe';
                ctx.beginPath();
                ctx.roundRect(clipX - 1, y - 1, clipWidth + 2, height + 2, 3);
                ctx.fill();
            }

            // Trace bar
            const isActive = trace.isActive ?? (!trace.endTime);
            const isHovered = hoveredTrace?.traceId === trace.traceId;

            if (trace.hasError) {
                ctx.fillStyle = isHovered ? '#f87171' : '#ef4444';
            } else if (isActive) {
                ctx.fillStyle = isHovered ? '#fbbf24' : '#f59e0b';
            } else {
                ctx.fillStyle = isHovered ? '#60a5fa' : '#3b82f6';
            }

            ctx.beginPath();
            ctx.roundRect(clipX, y, clipWidth, height, 2);
            ctx.fill();

            // Trace name (if fits)
            if (clipWidth > 40 && height >= 10) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `${Math.min(10, height - 2)}px system-ui, sans-serif`;
                ctx.textAlign = 'left';
                const name = trace.rootSpanName || trace.traceId.substring(0, 8);
                const maxChars = Math.floor((clipWidth - 6) / 5);
                const displayName = name.length > maxChars ? name.substring(0, maxChars - 1) + '...' : name;
                ctx.fillText(displayName, clipX + 3, y + height / 2 + 3);
            }
        }

        // "Now" line - use current time
        const now = Date.now();
        nowRef.current = now;
        if (now >= viewRange.start && now <= viewRange.end) {
            const nowX = chartPadding.left + timeToX(now);
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(nowX, chartPadding.top);
            ctx.lineTo(nowX, chartPadding.top + chartHeight);
            ctx.stroke();

            // "Now" triangle at top
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.moveTo(nowX, chartPadding.top);
            ctx.lineTo(nowX - 4, chartPadding.top - 6);
            ctx.lineTo(nowX + 4, chartPadding.top - 6);
            ctx.closePath();
            ctx.fill();
        }

    }, [containerWidth, displayHeight, viewRange, visibleTraces, visibleStartIndex, visibleEndIndex, selectedTraceId, hoveredTrace, timeToX, chartWidth, chartHeight, scrollTop]);


    // Pause auto-follow on user interaction
    const pauseAutoFollow = useCallback(() => {
        if (autoScroll) {
            userInteractedRef.current = true;
            setAutoScroll(false);
        }
    }, [autoScroll, setAutoScroll]);

    // Resume auto-follow
    const handleResumeAutoFollow = useCallback(() => {
        userInteractedRef.current = false;
        setAutoScroll(true);
        // Jump to now
        const now = Date.now();
        const currentRange = viewRange.duration || 60000;
        setViewStart(now - currentRange * 0.9);
        setViewEnd(now + currentRange * 0.1);
        // Also scroll to bottom in vertical
        if (needsScroll && scrollContainerRef.current) {
            setScrollTop(Math.max(0, totalContentHeight - chartHeight));
        }
    }, [setAutoScroll, viewRange.duration, needsScroll, totalContentHeight, chartHeight]);

    // Handle vertical scroll
    const handleVerticalScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        pauseAutoFollow();
        setScrollTop((e.target as HTMLDivElement).scrollTop);
    }, [pauseAutoFollow]);

    // Mouse handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        pauseAutoFollow();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;

        setIsDragging(true);
        setDragStart({ x, viewStart: viewRange.start });
    }, [viewRange.start, pauseAutoFollow]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left - chartPadding.left;
        const y = e.clientY - rect.top - chartPadding.top;

        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

        if (isDragging) {
            const dx = e.clientX - rect.left - dragStart.x;
            const timeDelta = -(dx / chartWidth) * viewRange.duration;
            const newStart = dragStart.viewStart + timeDelta;
            setViewStart(newStart);
            setViewEnd(newStart + viewRange.duration);
        } else {
            // Check for hovered trace - account for scroll offset
            const actualY = y + scrollTop;
            const rowIndex = Math.floor(actualY / ROW_HEIGHT);

            if (rowIndex >= 0 && rowIndex < visibleTraces.length && x >= 0 && x <= chartWidth) {
                const trace = visibleTraces[rowIndex];
                const startTime = new Date(trace.startTime).getTime();
                const duration = trace.duration || 100;
                const traceX = timeToX(startTime);
                const traceWidth = Math.max(3, timeToX(startTime + duration) - traceX);

                if (x >= traceX && x <= traceX + traceWidth) {
                    setHoveredTrace(trace);
                } else {
                    setHoveredTrace(null);
                }
            } else {
                setHoveredTrace(null);
            }
        }
    }, [isDragging, dragStart, chartWidth, viewRange.duration, visibleTraces, timeToX, scrollTop]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setIsDragging(false);
        setHoveredTrace(null);
    }, []);

    const handleClick = useCallback(() => {
        if (hoveredTrace && !isDragging) {
            pauseAutoFollow();
            onSelectTrace(hoveredTrace);
        }
    }, [hoveredTrace, isDragging, onSelectTrace, pauseAutoFollow]);

    // Zoom with wheel
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        pauseAutoFollow();

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left - chartPadding.left;
        const mouseTime = xToTime(x);

        const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
        const newDuration = Math.max(1000, Math.min(viewRange.duration * zoomFactor, 30 * 86400000)); // 1s to 30 days

        // Zoom centered on mouse position
        const mouseRatio = x / chartWidth;
        const newStart = mouseTime - mouseRatio * newDuration;

        setViewStart(newStart);
        setViewEnd(newStart + newDuration);
    }, [viewRange.duration, chartWidth, xToTime, pauseAutoFollow]);

    // Zoom controls
    const handleZoomIn = useCallback(() => {
        pauseAutoFollow();
        const center = viewRange.start + viewRange.duration / 2;
        const newDuration = Math.max(1000, viewRange.duration * 0.5);
        setViewStart(center - newDuration / 2);
        setViewEnd(center + newDuration / 2);
    }, [viewRange, pauseAutoFollow]);

    const handleZoomOut = useCallback(() => {
        pauseAutoFollow();
        const center = viewRange.start + viewRange.duration / 2;
        const newDuration = Math.min(30 * 86400000, viewRange.duration * 2);
        setViewStart(center - newDuration / 2);
        setViewEnd(center + newDuration / 2);
    }, [viewRange, pauseAutoFollow]);

    const handleZoomFit = useCallback(() => {
        pauseAutoFollow();
        const padding = (dataRange.max - dataRange.min) * 0.05;
        setViewStart(dataRange.min - padding);
        setViewEnd(dataRange.max + padding);
    }, [dataRange, pauseAutoFollow]);

    // Range slider handlers
    const sliderRange = useMemo(() => {
        const total = dataRange.max - dataRange.min || 60000;
        const startPct = Math.max(0, Math.min(100, ((viewRange.start - dataRange.min) / total) * 100));
        const endPct = Math.max(0, Math.min(100, ((viewRange.end - dataRange.min) / total) * 100));
        return { startPct, endPct, widthPct: endPct - startPct };
    }, [dataRange, viewRange]);

    const handleSliderMouseDown = useCallback((e: React.MouseEvent, type: 'start' | 'end' | 'middle') => {
        e.stopPropagation();
        pauseAutoFollow();
        const sliderRect = e.currentTarget.parentElement?.getBoundingClientRect();
        if (!sliderRect) return;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const x = moveEvent.clientX - sliderRect.left;
            const pct = Math.max(0, Math.min(100, (x / sliderRect.width) * 100));
            const time = dataRange.min + (pct / 100) * (dataRange.max - dataRange.min);

            if (type === 'start') {
                setViewStart(Math.min(time, viewRange.end - 1000));
            } else if (type === 'end') {
                setViewEnd(Math.max(time, viewRange.start + 1000));
            } else {
                const duration = viewRange.end - viewRange.start;
                const newStart = time - duration / 2;
                setViewStart(newStart);
                setViewEnd(newStart + duration);
            }
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [dataRange, viewRange, pauseAutoFollow]);

    return (
        <div ref={containerRef} className="w-full flex flex-col bg-slate-50 dark:bg-slate-900" style={{ height: displayHeight + 32 }}>
            {/* Main chart area with optional vertical scrollbar */}
            <div className="flex-1 relative flex">
                {/* Scrollable content area */}
                <div
                    ref={scrollContainerRef}
                    className={`flex-1 relative ${needsScroll ? 'overflow-y-auto' : 'overflow-hidden'}`}
                    style={{ height: displayHeight - 32 }}
                    onScroll={handleVerticalScroll}
                >
                    {/* Canvas container - if scrollable, set full content height */}
                    <div style={{ height: needsScroll ? totalContentHeight + chartPadding.top + chartPadding.bottom : '100%', position: 'relative' }}>
                        <canvas
                            ref={canvasRef}
                            className={`absolute top-0 left-0 w-full ${isDragging ? 'cursor-grabbing' : hoveredTrace ? 'cursor-pointer' : 'cursor-grab'}`}
                            style={{ height: displayHeight - 32, position: 'sticky', top: 0 }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseLeave}
                            onClick={handleClick}
                            onWheel={handleWheel}
                        />
                    </div>
                </div>

                {/* Vertical scroll indicator */}
                {needsScroll && (
                    <div className="absolute right-0 top-0 w-1 bg-slate-200 dark:bg-slate-700" style={{ height: displayHeight - 32 }}>
                        <div
                            className="bg-slate-400 dark:bg-slate-500 rounded-full"
                            style={{
                                height: `${Math.max(20, (chartHeight / totalContentHeight) * 100)}%`,
                                marginTop: `${(scrollTop / totalContentHeight) * 100}%`
                            }}
                        />
                    </div>
                )}

                {/* Tooltip */}
                {hoveredTrace && !isDragging && (
                    <div
                        className="absolute pointer-events-none bg-slate-800 dark:bg-slate-700 text-white text-xs rounded-lg shadow-xl px-3 py-2 z-10"
                        style={{
                            left: Math.min(mousePos.x + 10, containerWidth - 200),
                            top: Math.min(mousePos.y + 10, displayHeight - 100)
                        }}
                    >
                        <div className="font-semibold mb-1">{hoveredTrace.rootSpanName || 'Unknown'}</div>
                        <div className="text-slate-300 space-y-0.5">
                            <div>Duration: <span className="text-white">{formatDuration(hoveredTrace.duration)}</span></div>
                            <div>Spans: <span className="text-white">{hoveredTrace.spanCount}</span></div>
                            {hoveredTrace.hasError && <div className="text-red-400">Has Error</div>}
                            {hoveredTrace.isActive && <div className="text-amber-400">In Progress</div>}
                        </div>
                    </div>
                )}
            </div>

            {/* Controls bar */}
            <div className="h-8 flex items-center gap-2 px-2 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {/* Resume button when auto-follow is paused */}
                {!autoScroll && (
                    <button
                        onClick={handleResumeAutoFollow}
                        className="px-2 py-1 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1"
                        title="Resume auto-follow"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Live
                    </button>
                )}

                {/* Auto-follow indicator */}
                {autoScroll && (
                    <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Live
                    </div>
                )}

                {/* Zoom buttons */}
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={handleZoomIn}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
                        title="Zoom In"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                    </button>
                    <button
                        onClick={handleZoomOut}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
                        title="Zoom Out"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                        </svg>
                    </button>
                    <button
                        onClick={handleZoomFit}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
                        title="Fit All"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                    </button>
                </div>

                <div className="w-px h-4 bg-slate-300 dark:bg-slate-600" />

                {/* Range slider */}
                <div className="flex-1 h-3 relative bg-slate-200 dark:bg-slate-700 rounded cursor-pointer">
                    {/* Full range background ticks */}
                    <div className="absolute inset-0 flex justify-between px-1">
                        {Array.from({ length: 20 }).map((_, i) => (
                            <div key={i} className="w-px h-full bg-slate-300 dark:bg-slate-600" />
                        ))}
                    </div>

                    {/* Visible range indicator */}
                    <div
                        className="absolute top-0 h-full bg-blue-500/30 dark:bg-blue-400/30 rounded"
                        style={{
                            left: `${sliderRange.startPct}%`,
                            width: `${sliderRange.widthPct}%`
                        }}
                    />

                    {/* Draggable handles */}
                    <div
                        className="absolute top-0 h-full w-1.5 bg-blue-500 rounded-l cursor-ew-resize hover:bg-blue-600"
                        style={{ left: `calc(${sliderRange.startPct}% - 3px)` }}
                        onMouseDown={(e) => handleSliderMouseDown(e, 'start')}
                    />
                    <div
                        className="absolute top-0 h-full bg-blue-500/50 cursor-grab hover:bg-blue-500/70"
                        style={{
                            left: `calc(${sliderRange.startPct}% + 3px)`,
                            width: `calc(${sliderRange.widthPct}% - 6px)`
                        }}
                        onMouseDown={(e) => handleSliderMouseDown(e, 'middle')}
                    />
                    <div
                        className="absolute top-0 h-full w-1.5 bg-blue-500 rounded-r cursor-ew-resize hover:bg-blue-600"
                        style={{ left: `calc(${sliderRange.startPct}% + ${sliderRange.widthPct}% - 3px)` }}
                        onMouseDown={(e) => handleSliderMouseDown(e, 'end')}
                    />
                </div>

                <div className="w-px h-4 bg-slate-300 dark:bg-slate-600" />

                {/* Info */}
                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{formatRangeDuration(viewRange.duration)}</span>
                    <span>{visibleTraces.length}/{traces.length}</span>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-1.5 text-[9px]">
                    <span className="flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-sm bg-blue-500" /> Ok
                    </span>
                    <span className="flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-sm bg-amber-500" /> Active
                    </span>
                    <span className="flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-sm bg-red-500" /> Error
                    </span>
                </div>
            </div>
        </div>
    );
}
