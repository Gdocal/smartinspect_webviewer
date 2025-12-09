/**
 * ViewGrid - Per-view grid wrapper using VirtualLogGrid
 *
 * Each view gets its own ViewGrid component that:
 * - Applies the view's filter to entries before passing to VirtualLogGrid
 * - Maintains its own column state
 * - Preserves scroll position when switching tabs
 * - Stays mounted but hidden when not active (CSS visibility)
 */

import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { useLogStore, LogEntry, View, Filter, ListTextFilter, TextFilter, VlgColumnConfig } from '../store/logStore';
import { VirtualLogGrid, MultiSelection } from './VirtualLogGrid/VirtualLogGrid';
import { ColumnConfig, DEFAULT_COLUMNS } from './VirtualLogGrid/types';

// Debug flicker logging
const DEBUG_FLICKER = false;

// Batch trimming constant - instead of continuous trimming, accumulate and trim in batches
const BATCH_TRIM_BUFFER = 5000;  // Allow 5K extra rows before triggering batch trim
const flickerLog = (msg: string, data?: Record<string, unknown>) => {
  if (!DEBUG_FLICKER) return;
  const ts = performance.now().toFixed(2);
  if (data) {
    console.log(`[ViewGrid:${ts}] ${msg}`, data);
  } else {
    console.log(`[ViewGrid:${ts}] ${msg}`);
  }
};

// Debug overlay section header
const DebugSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginTop: 6, borderTop: '1px solid #333', paddingTop: 4 }}>
        <div style={{ color: '#888', fontSize: 9, marginBottom: 2 }}>{title}</div>
        {children}
    </div>
);

// Debug overlay component
interface GridDebugOverlayProps {
    // Buffer
    storeRowCount: number;
    filteredCount: number;
    rowsPerSec: number;
    // Grid
    cappedCount: number;
    maxGridRows: number;
    hardMaxRows: number;
    // Trim
    trimStrategy: 'aggressive' | 'batch-pending' | 'batch-trim' | 'none';
    sliceOffset: number;
    cumulativeTrimCount: number;
    safeToTrim: number;
    excessRows: number;
    // Scroll
    isStuckToBottom: boolean;
    firstVisibleRow: number;
    // Scroll mode
    scrollMode: { isAnimating: boolean; wouldUseSmooth: boolean; rate: number };
    // Display
    displayLag: number;
    targetLen: number;
    displayCount: number;
    // Content tracking
    lastEntryId: number | null;
    entriesVersion: number;
    // Control
    onClose: () => void;
}

function GridDebugOverlay({
    storeRowCount,
    filteredCount,
    rowsPerSec,
    cappedCount,
    maxGridRows,
    hardMaxRows,
    trimStrategy,
    sliceOffset,
    cumulativeTrimCount,
    safeToTrim,
    excessRows,
    isStuckToBottom,
    firstVisibleRow,
    scrollMode,
    displayLag,
    targetLen,
    displayCount,
    lastEntryId,
    entriesVersion,
    onClose,
}: GridDebugOverlayProps) {
    const isOverflow = cappedCount > maxGridRows;
    const utilizationPct = ((cappedCount / maxGridRows) * 100).toFixed(0);

    return (
        <div
            style={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                color: '#0f0',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 10,
                fontFamily: 'monospace',
                zIndex: 9999,
                minWidth: 220,
                maxWidth: 280,
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 'bold', color: '#fff', fontSize: 11 }}>Grid Debug</span>
                <button
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#888',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 14,
                        lineHeight: 1,
                    }}
                >
                    ×
                </button>
            </div>

            <DebugSection title="BUFFER">
                <div>store: <span style={{ color: '#fff' }}>{storeRowCount.toLocaleString()}</span></div>
                <div>filtered: <span style={{ color: '#fff' }}>{filteredCount.toLocaleString()}</span></div>
                <div>rate: <span style={{ color: rowsPerSec > 50 ? '#ff0' : '#fff' }}>{rowsPerSec.toFixed(1)}/s</span></div>
            </DebugSection>

            <DebugSection title="GRID">
                <div>
                    capped: <span style={{ color: isOverflow ? '#f00' : '#fff' }}>{cappedCount.toLocaleString()}</span>
                    <span style={{ color: '#666' }}> / {maxGridRows.toLocaleString()}</span>
                    <span style={{ color: isOverflow ? '#f00' : '#888' }}> ({utilizationPct}%)</span>
                </div>
                <div>batchThreshold: <span style={{ color: '#888' }}>{hardMaxRows.toLocaleString()}</span></div>
                <div>excess: <span style={{ color: excessRows > 0 ? '#ff0' : '#888' }}>{excessRows.toLocaleString()}</span></div>
            </DebugSection>

            <DebugSection title="TRIM">
                <div>
                    strategy: <span style={{
                        color: trimStrategy === 'aggressive' ? '#f80' :
                               trimStrategy === 'batch-pending' ? '#0ff' :
                               trimStrategy === 'batch-trim' ? '#f0f' : '#888'
                    }}>{trimStrategy}</span>
                </div>
                <div>sliceOffset: <span style={{ color: '#fff' }}>{sliceOffset.toLocaleString()}</span></div>
                <div>cumulative: <span style={{ color: '#fff' }}>{cumulativeTrimCount.toLocaleString()}</span></div>
                <div>safeToTrim: <span style={{ color: '#888' }}>{safeToTrim.toLocaleString()}</span></div>
            </DebugSection>

            <DebugSection title="SCROLL">
                <div>
                    position: <span style={{ color: isStuckToBottom ? '#0f0' : '#f80' }}>
                        {isStuckToBottom ? 'bottom (autoscroll)' : `row ${firstVisibleRow}`}
                    </span>
                </div>
                <div>stuckToBottom: <span style={{ color: isStuckToBottom ? '#0f0' : '#f80' }}>{isStuckToBottom ? 'true' : 'false'}</span></div>
                <div>
                    mode: <span style={{ color: scrollMode.isAnimating ? '#0ff' : (scrollMode.wouldUseSmooth ? '#0f0' : '#f80') }}>
                        {scrollMode.isAnimating ? 'SMOOTH (active)' : (scrollMode.wouldUseSmooth ? 'smooth' : 'instant')}
                    </span>
                    <span style={{ color: '#888' }}> ({scrollMode.rate.toFixed(1)}/s)</span>
                </div>
            </DebugSection>

            <DebugSection title="DISPLAY">
                <div>target: <span style={{ color: '#fff' }}>{targetLen.toLocaleString()}</span></div>
                <div>showing: <span style={{ color: '#fff' }}>{displayCount.toLocaleString()}</span></div>
                <div>
                    lag: <span style={{ color: displayLag > 10 ? '#ff0' : displayLag > 0 ? '#0f0' : '#888' }}>
                        {displayLag > 0 ? `+${displayLag}` : '0'}
                    </span>
                </div>
            </DebugSection>

            <DebugSection title="CONTENT">
                <div>lastId: <span style={{ color: '#fff' }}>{lastEntryId ?? 'null'}</span></div>
                <div>version: <span style={{ color: '#fff' }}>{entriesVersion}</span></div>
            </DebugSection>

            <div style={{ marginTop: 6, color: '#555', fontSize: 8 }}>Ctrl+Shift+G to toggle</div>
        </div>
    );
}

// Track stuckToBottom per view

// Type compatibility - VlgColumnConfig is structurally compatible with ColumnConfig
const toColumnConfig = (cfg: VlgColumnConfig): ColumnConfig => cfg as ColumnConfig;
const toVlgColumnConfig = (cfg: ColumnConfig): VlgColumnConfig => cfg as VlgColumnConfig;

// Helper to match a string value against a ListTextFilter
function matchesListTextFilter(value: string | undefined, filter: ListTextFilter | undefined): boolean {
    if (!filter) return true;

    const hasListValues = filter.mode === 'list' && filter.values.length > 0;
    const hasTextValue = filter.mode === 'text' && filter.textValue;

    if (!hasListValues && !hasTextValue) return true;

    const val = value || '';
    let matches = false;

    if (filter.mode === 'list') {
        matches = filter.values.includes(val);
    } else {
        const textVal = filter.textValue.toLowerCase();
        const valLower = val.toLowerCase();

        if (filter.textOperator === 'contains') {
            matches = valLower.includes(textVal);
        } else if (filter.textOperator === 'equals') {
            matches = valLower === textVal;
        } else if (filter.textOperator === 'regex') {
            try {
                const regex = new RegExp(filter.textValue, 'i');
                matches = regex.test(val);
            } catch {
                matches = false;
            }
        }
    }

    return filter.inverse ? !matches : matches;
}

// Helper to match a string value against a TextFilter
function matchesTextFilter(value: string | undefined, filter: TextFilter | undefined): boolean {
    if (!filter || !filter.value) return true;

    const val = value || '';
    let matches = false;

    const compareVal = filter.caseSensitive ? val : val.toLowerCase();
    const filterVal = filter.caseSensitive ? filter.value : filter.value.toLowerCase();

    if (filter.operator === 'contains') {
        matches = compareVal.includes(filterVal);
    } else if (filter.operator === 'equals') {
        matches = compareVal === filterVal;
    } else if (filter.operator === 'regex') {
        try {
            const flags = filter.caseSensitive ? '' : 'i';
            const regex = new RegExp(filter.value, flags);
            matches = regex.test(val);
        } catch {
            matches = false;
        }
    }

    return filter.inverse ? !matches : matches;
}

// Apply view filter to entries
function filterEntriesForView(entries: LogEntry[], filter: Filter): LogEntry[] {
    const hasExtendedSessionFilter = filter.sessionFilter && (
        (filter.sessionFilter.mode === 'list' && filter.sessionFilter.values.length > 0) ||
        (filter.sessionFilter.mode === 'text' && filter.sessionFilter.textValue)
    );
    const hasExtendedAppNameFilter = filter.appNameFilter && (
        (filter.appNameFilter.mode === 'list' && filter.appNameFilter.values.length > 0) ||
        (filter.appNameFilter.mode === 'text' && filter.appNameFilter.textValue)
    );
    const hasExtendedHostNameFilter = filter.hostNameFilter && (
        (filter.hostNameFilter.mode === 'list' && filter.hostNameFilter.values.length > 0) ||
        (filter.hostNameFilter.mode === 'text' && filter.hostNameFilter.textValue)
    );
    const hasExtendedTitleFilter = filter.titleFilter && filter.titleFilter.value;

    const hasSessionFilter = hasExtendedSessionFilter || filter.sessions.length > 0;
    const hasLevelFilter = filter.levels.length > 0;
    const hasTitleFilter = hasExtendedTitleFilter || !!filter.titlePattern;
    const hasMessageFilter = !!filter.messagePattern;
    const hasAppNameFilter = hasExtendedAppNameFilter || filter.appNames.length > 0;
    const hasHostNameFilter = hasExtendedHostNameFilter || filter.hostNames.length > 0;
    const hasEntryTypeFilter = filter.entryTypes.length > 0;

    // Fast path: no filters active
    if (!hasSessionFilter && !hasLevelFilter && !hasTitleFilter && !hasMessageFilter &&
        !hasAppNameFilter && !hasHostNameFilter && !hasEntryTypeFilter) {
        return entries;
    }

    // Pre-compile regex patterns for legacy filters
    let titleRegex: RegExp | null = null;
    let messageRegex: RegExp | null = null;

    if (filter.titlePattern && !hasExtendedTitleFilter) {
        try {
            titleRegex = new RegExp(filter.titlePattern, 'i');
        } catch {
            // Invalid regex
        }
    }

    if (hasMessageFilter) {
        try {
            messageRegex = new RegExp(filter.messagePattern, 'i');
        } catch {
            // Invalid regex
        }
    }

    // Pre-create Sets for O(1) lookup (legacy filters)
    const sessionSet = (!hasExtendedSessionFilter && filter.sessions.length > 0) ? new Set(filter.sessions) : null;
    const levelSet = hasLevelFilter ? new Set(filter.levels) : null;
    const appNameSet = (!hasExtendedAppNameFilter && filter.appNames.length > 0) ? new Set(filter.appNames) : null;
    const hostNameSet = (!hasExtendedHostNameFilter && filter.hostNames.length > 0) ? new Set(filter.hostNames) : null;
    const entryTypeSet = hasEntryTypeFilter ? new Set(filter.entryTypes) : null;

    return entries.filter(e => {
        // Session filter
        if (hasExtendedSessionFilter) {
            if (!matchesListTextFilter(e.sessionName, filter.sessionFilter)) {
                return false;
            }
        } else if (sessionSet && (!e.sessionName || !sessionSet.has(e.sessionName))) {
            return false;
        }

        // Level filter
        if (levelSet) {
            const matches = e.level !== undefined && levelSet.has(e.level);
            const result = filter.levelsInverse ? !matches : matches;
            if (!result) return false;
        }

        // Title filter
        if (hasExtendedTitleFilter) {
            if (!matchesTextFilter(e.title, filter.titleFilter)) {
                return false;
            }
        } else if (titleRegex) {
            const matches = titleRegex.test(e.title || '');
            if (filter.inverseMatch ? matches : !matches) {
                return false;
            }
        }

        // Message pattern filter
        if (messageRegex) {
            const titleMatch = messageRegex.test(e.title || '');
            const dataMatch = messageRegex.test(e.data || '');
            const matches = titleMatch || dataMatch;
            if (filter.inverseMatch ? matches : !matches) {
                return false;
            }
        }

        // App name filter
        if (hasExtendedAppNameFilter) {
            if (!matchesListTextFilter(e.appName, filter.appNameFilter)) {
                return false;
            }
        } else if (appNameSet && (!e.appName || !appNameSet.has(e.appName))) {
            return false;
        }

        // Host name filter
        if (hasExtendedHostNameFilter) {
            if (!matchesListTextFilter(e.hostName, filter.hostNameFilter)) {
                return false;
            }
        } else if (hostNameSet && (!e.hostName || !hostNameSet.has(e.hostName))) {
            return false;
        }

        // Entry type filter
        if (entryTypeSet) {
            const matches = e.logEntryType !== undefined && entryTypeSet.has(e.logEntryType);
            const result = filter.entryTypesInverse ? !matches : matches;
            if (!result) return false;
        }

        return true;
    });
}

interface ViewGridProps {
    view: View;
    isActive: boolean;
    onColumnStateChange?: (viewId: string, columns: VlgColumnConfig[]) => void;
}

export function ViewGrid({
    view,
    isActive,
    onColumnStateChange
}: ViewGridProps) {
    flickerLog(`RENDER view=${view.name}`, { isActive, viewId: view.id });

    const {
        entries,
        viewPausedState,
        setSelectedEntryId,
        selectedEntryId,
        globalHighlightRules,
        entriesVersion,
        theme,
        setViewStuckToBottom,
        getViewStuckToBottom,
        limits
    } = useLogStore();

    // Per-view pause state
    const isPaused = viewPausedState[view.id] ?? false;

    // Cell selection state (multi-selection support)
    const [selection, setSelection] = useState<MultiSelection | null>(null);

    // Debug overlay state
    const [showDebug, setShowDebug] = useState(false);
    const [rowsPerSec, setRowsPerSec] = useState(0);
    const lastRowCountRef = useRef(0);
    const lastRateTimeRef = useRef(Date.now());
    // Scroll mode info from VirtualLogGrid
    const [scrollModeInfo, setScrollModeInfo] = useState({ isAnimating: false, wouldUseSmooth: true, rate: 0 });

    // Mouse-freeze logic for scroll stability during drag
    // Freezes entries/displayCount during mouse down to prevent scrollHeight changes
    const isMouseDownRef = useRef(false);
    const frozenEntriesRef = useRef<LogEntry[] | null>(null);
    const frozenSliceOffsetRef = useRef(0);
    const frozenDisplayCountRef = useRef<number | null>(null);
    const [, forceUpdate] = useState(0);
    const displayCountRefForFreeze = useRef<React.MutableRefObject<number> | null>(null);
    useEffect(() => {
        const handleMouseDown = () => {
            isMouseDownRef.current = true;
            if (displayCountRefForFreeze.current) {
                frozenDisplayCountRef.current = displayCountRefForFreeze.current.current;
            }
        };
        const handleMouseUp = () => {
            isMouseDownRef.current = false;
            frozenEntriesRef.current = null;
            frozenSliceOffsetRef.current = 0;
            frozenDisplayCountRef.current = null;
            forceUpdate(n => n + 1);
        };
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // Keyboard handler for Ctrl+Shift+G
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'g') {
                e.preventDefault();
                setShowDebug(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Column state - use view's column state or defaults
    const [columns, setColumns] = useState<ColumnConfig[]>(() => {
        // If view has saved column config, use it
        if (view.columnConfig && view.columnConfig.length > 0) {
            return view.columnConfig.map(toColumnConfig);
        }
        return DEFAULT_COLUMNS;
    });

    // Update columns when view.columnConfig changes (e.g., when switching views)
    const viewColumnConfigRef = useRef(view.columnConfig);
    useEffect(() => {
        if (view.columnConfig !== viewColumnConfigRef.current) {
            viewColumnConfigRef.current = view.columnConfig;
            if (view.columnConfig && view.columnConfig.length > 0) {
                setColumns(view.columnConfig.map(toColumnConfig));
            }
        }
    }, [view.columnConfig]);

    // Get combined highlight rules for this view
    const highlightRules = useMemo(() => {
        const viewRules = view.highlightRules || [];
        if (view.useGlobalHighlights) {
            return [...viewRules, ...globalHighlightRules];
        }
        return viewRules;
    }, [view.highlightRules, view.useGlobalHighlights, globalHighlightRules]);

    // Filter entries based on view filter
    const filteredEntries = useMemo(() => {
        return filterEntriesForView(entries, view.filter);
    }, [entries, view.filter, entriesVersion]);

    // Track first visible row from VirtualLogGrid for safe trimming
    const firstVisibleRowRef = useRef(0);
    const handleFirstVisibleRowChange = useCallback((row: number) => {
        firstVisibleRowRef.current = row;
    }, []);

    // Track cumulative trim count for scroll compensation
    const cumulativeTrimCountRef = useRef(0);
    const prevSliceOffsetRef = useRef(0);

    // Check if view is stuck to bottom (for aggressive vs safe trimming)
    const isStuckToBottom = getViewStuckToBottom(view.id);

    // Apply maxGridRows cap with BATCH TRIMMING
    // Instead of continuous trimming, let buffer grow and trim in batches
    const maxGridRows = limits.maxGridRows;
    const batchTrimThreshold = maxGridRows + BATCH_TRIM_BUFFER; // e.g., 15K for 10K limit

    const { cappedEntries, sliceOffset, debugTrim } = useMemo(() => {
        const excessRows = Math.max(0, filteredEntries.length - maxGridRows);
        const safeToTrim = Math.max(0, firstVisibleRowRef.current - 50);

        // Case 1: Under maxGridRows - no trimming needed
        if (filteredEntries.length <= maxGridRows) {
            return {
                cappedEntries: filteredEntries,
                sliceOffset: 0,
                debugTrim: { excessRows: 0, safeToTrim, mustTrim: 0, actualTrim: 0, batchPending: false }
            };
        }

        // Case 2: When stuck to bottom - trim aggressively (user doesn't care about old rows)
        if (isStuckToBottom) {
            return {
                cappedEntries: filteredEntries.slice(-maxGridRows),
                sliceOffset: excessRows,
                debugTrim: { excessRows, safeToTrim, mustTrim: 0, actualTrim: excessRows, batchPending: false }
            };
        }

        // Case 3: Scrolled up - use BATCH TRIMMING
        // Display always capped at maxGridRows
        // Store accumulates until batchTrimThreshold, then batch trim happens

        // Track cumulative offset for scroll compensation
        // Only apply scroll compensation when batch trim happens (excess >= BATCH_TRIM_BUFFER)
        const shouldBatchTrim = excessRows >= BATCH_TRIM_BUFFER;

        if (shouldBatchTrim) {
            // Batch trim time - trim back to maxGridRows and apply scroll compensation
            const trimAmount = excessRows;
            const firstVisibleRow = firstVisibleRowRef.current;

            return {
                cappedEntries: filteredEntries.slice(-maxGridRows),
                sliceOffset: trimAmount,
                debugTrim: {
                    excessRows,
                    safeToTrim,
                    mustTrim: trimAmount,
                    actualTrim: trimAmount,
                    batchPending: false,
                    firstVisibleRow,
                    viewportCase: firstVisibleRow >= trimAmount + 50 ? 'safe' :
                                  firstVisibleRow >= trimAmount ? 'partial' : 'full-overlap'
                }
            };
        }

        // Under threshold - cap display to maxGridRows, no scroll compensation yet
        // Store accumulates but display stays at 10K (batch-pending state)
        return {
            cappedEntries: filteredEntries.slice(-maxGridRows),
            sliceOffset: 0,
            debugTrim: { excessRows, safeToTrim, mustTrim: 0, actualTrim: 0, batchPending: true }
        };
    }, [filteredEntries, maxGridRows, batchTrimThreshold, isStuckToBottom]);

    // Track cumulative trim count by monitoring slice offset changes
    if (sliceOffset > prevSliceOffsetRef.current) {
        const trimmed = sliceOffset - prevSliceOffsetRef.current;
        cumulativeTrimCountRef.current += trimmed;
    }
    prevSliceOffsetRef.current = sliceOffset;

    // Calculate trim strategy for debug display
    const trimStrategy: 'aggressive' | 'batch-pending' | 'batch-trim' | 'none' = useMemo(() => {
        if (filteredEntries.length <= maxGridRows) return 'none';
        if (isStuckToBottom) return 'aggressive';
        if (debugTrim.batchPending) return 'batch-pending';
        return 'batch-trim';
    }, [filteredEntries.length, maxGridRows, isStuckToBottom, debugTrim.batchPending]);

    // Track filtered entries length in ref for rate calculation
    const filteredLenRef = useRef(filteredEntries.length);
    filteredLenRef.current = filteredEntries.length;

    // Rate calculation effect (only when debug is shown)
    useEffect(() => {
        if (!showDebug) return;

        // Initialize on first show
        lastRowCountRef.current = filteredLenRef.current;
        lastRateTimeRef.current = Date.now();

        const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - lastRateTimeRef.current) / 1000;
            const currentCount = filteredLenRef.current;
            const delta = currentCount - lastRowCountRef.current;

            if (elapsed > 0 && delta >= 0) {
                // Smooth the rate with exponential moving average
                setRowsPerSec(prev => prev * 0.3 + (delta / elapsed) * 0.7);
            }

            lastRowCountRef.current = currentCount;
            lastRateTimeRef.current = now;
        }, 500);

        return () => clearInterval(interval);
    }, [showDebug]);

    const lastTrimCount = cumulativeTrimCountRef.current;

    // Paused entries snapshot - freeze display when paused
    const [pausedEntries, setPausedEntries] = useState<LogEntry[]>([]);
    const wasPausedRef = useRef(false);

    // Update paused entries ONLY when transitioning from unpaused to paused
    useEffect(() => {
        if (isPaused && !wasPausedRef.current) {
            // Just paused - capture current capped entries
            setPausedEntries(cappedEntries);
        }
        wasPausedRef.current = isPaused;
    }, [isPaused, cappedEntries]);

    // Get target entries (use capped entries with maxGridRows limit applied)
    const targetEntries = isPaused ? pausedEntries : cappedEntries;
    const targetLen = targetEntries.length;

    flickerLog('targetEntries', { targetLen, entriesLen: entries.length, viewName: view.name });

    // Progressive display for smooth scrolling
    // Key insight: show existing entries immediately, only animate NEW entries
    // Use a ref to track the "intended" display count synchronously to prevent flicker
    const targetLenRef = useRef(targetLen);
    const displayCountRef = useRef(targetLen); // Sync ref for immediate reads
    const rafIdRef = useRef<number | null>(null);
    const needsStateSyncRef = useRef(false); // Track when render-time snap needs state sync
    const [displayCount, setDisplayCount] = useState(targetLen);

    // Link displayCountRef for freeze mechanism
    displayCountRefForFreeze.current = displayCountRef;

    flickerLog('displayCount state', {
        displayCount,
        displayCountRef: displayCountRef.current,
        targetLen,
        viewName: view.name,
    });

    // Keep target length ref updated
    targetLenRef.current = targetLen;

    // Progressive catch-up effect
    // Only animate small deltas (up to ~2 seconds worth at 60fps = 120 entries)
    const MAX_ANIMATE_DELTA = 120;

    // Synchronize displayCountRef with targetLen when it changes dramatically
    // This handles cases where state hasn't caught up yet (e.g., component re-mount)
    // Also snap immediately when displayCountRef is 0 (fresh load after room switch)
    const isInitialLoad = displayCountRef.current === 0 && targetLen > 0;
    if (isInitialLoad || Math.abs(targetLen - displayCountRef.current) > MAX_ANIMATE_DELTA) {
        flickerLog('SNAP: initial load or large delta', { delta: targetLen - displayCountRef.current, targetLen, isInitialLoad, viewName: view.name });
        displayCountRef.current = targetLen;
        needsStateSyncRef.current = true; // Flag for useEffect to sync state
    } else if (displayCountRef.current > targetLen) {
        // Target shrunk - sync immediately
        flickerLog('SNAP: target shrunk', { displayCountRef: displayCountRef.current, targetLen, viewName: view.name });
        displayCountRef.current = targetLen;
        needsStateSyncRef.current = true; // Flag for useEffect to sync state
    }

    useEffect(() => {
        // Mouse drag check - pause progressive display during drag
        if (isMouseDownRef.current) return;

        // If render-time snap occurred, sync state immediately
        if (needsStateSyncRef.current) {
            needsStateSyncRef.current = false;
            flickerLog('STATE SYNC: render-time snap', { displayCountRef: displayCountRef.current, viewName: view.name });
            setDisplayCount(displayCountRef.current);
            return;
        }

        const delta = targetLen - displayCountRef.current;
        flickerLog('progressive effect', { delta, targetLen, displayCountRef: displayCountRef.current, viewName: view.name });

        // If target shrunk, snap immediately
        if (displayCountRef.current > targetLen) {
            displayCountRef.current = targetLen; // Update ref synchronously
            setDisplayCount(targetLen);
            return;
        }

        // If delta is too large (initial load or big batch), snap immediately
        if (delta > MAX_ANIMATE_DELTA) {
            displayCountRef.current = targetLen; // Update ref synchronously
            setDisplayCount(targetLen);
            return;
        }

        // If we have new entries to animate and no animation running
        if (delta > 0 && rafIdRef.current === null) {
            const animate = () => {
                // Mouse drag pause - keep animation alive but don't increment
                if (isMouseDownRef.current) {
                    rafIdRef.current = requestAnimationFrame(animate);
                    return;
                }

                const currentTarget = targetLenRef.current;
                const currentDisplay = displayCountRef.current;
                if (currentDisplay >= currentTarget) {
                    rafIdRef.current = null;
                    return;
                }
                const next = currentDisplay + 1;
                displayCountRef.current = next; // Update ref synchronously
                setDisplayCount(next);
                if (next < currentTarget) {
                    rafIdRef.current = requestAnimationFrame(animate);
                } else {
                    rafIdRef.current = null;
                }
            };
            rafIdRef.current = requestAnimationFrame(animate);
        }
    }, [targetLen, displayCount, view.id]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, []);

    // Displayed entries: use ref for immediate accurate count, state for re-render trigger
    // This prevents flicker when state update is async
    const displayedEntries = useMemo(() => {
        // Use frozen count during mouse drag to prevent scrollHeight changes
        const count = frozenDisplayCountRef.current !== null
            ? frozenDisplayCountRef.current
            : displayCountRef.current;
        return targetEntries.slice(0, count);
    }, [targetEntries, displayCount]);

    // Handle column changes
    const handleColumnsChange = useCallback((newColumns: ColumnConfig[]) => {
        setColumns(newColumns);
        if (onColumnStateChange) {
            onColumnStateChange(view.id, newColumns.map(toVlgColumnConfig));
        }
    }, [onColumnStateChange, view.id]);

    // Handle row click - select for detail panel
    const handleRowClick = useCallback((entry: LogEntry) => {
        setSelectedEntryId(entry.id);
    }, [setSelectedEntryId]);

    // Handle stuckToBottom state change - store per view for FilterBar UI
    const handleStuckToBottomChange = useCallback((stuckToBottom: boolean) => {
        setViewStuckToBottom(view.id, stuckToBottom);
    }, [setViewStuckToBottom, view.id]);

    // Effective autoscroll - NOT affected by pause (pause freezes entries, not scroll)
    const effectiveAutoScroll = view.autoScroll;

    // How many entries are pending display (progressive display lag)
    const displayLag = Math.max(0, targetLen - displayCount);

    return (
        <div
            className="h-full w-full"
            style={{
                visibility: isActive ? 'visible' : 'hidden',
                position: isActive ? 'relative' : 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
            }}
        >
            <VirtualLogGrid
                entries={displayedEntries}
                autoScroll={effectiveAutoScroll}
                selection={selection}
                onSelectionChange={setSelection}
                theme={theme}
                alternatingRows={view.alternatingRows}
                columns={columns}
                onColumnsChange={handleColumnsChange}
                highlightRules={highlightRules}
                onRowClick={handleRowClick}
                selectedRowId={selectedEntryId}
                onStuckToBottomChange={handleStuckToBottomChange}
                actualEntryCount={targetLen}
                lastTrimCount={lastTrimCount}
                onFirstVisibleRowChange={handleFirstVisibleRowChange}
                onScrollModeChange={setScrollModeInfo}
            />
            {showDebug && isActive && (
                <GridDebugOverlay
                    storeRowCount={entries.length}
                    filteredCount={filteredEntries.length}
                    rowsPerSec={rowsPerSec}
                    cappedCount={cappedEntries.length}
                    maxGridRows={maxGridRows}
                    hardMaxRows={batchTrimThreshold}
                    trimStrategy={trimStrategy}
                    sliceOffset={sliceOffset}
                    cumulativeTrimCount={cumulativeTrimCountRef.current}
                    safeToTrim={debugTrim.safeToTrim}
                    excessRows={debugTrim.excessRows}
                    isStuckToBottom={isStuckToBottom}
                    firstVisibleRow={firstVisibleRowRef.current}
                    scrollMode={scrollModeInfo}
                    displayLag={displayLag}
                    targetLen={targetLen}
                    displayCount={displayCount}
                    lastEntryId={displayedEntries.length > 0 ? displayedEntries[displayedEntries.length - 1]?.id : null}
                    entriesVersion={entriesVersion}
                    onClose={() => setShowDebug(false)}
                />
            )}
        </div>
    );
}
