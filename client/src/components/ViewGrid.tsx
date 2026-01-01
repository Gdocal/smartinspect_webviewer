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
import { useLogStore, LogEntry, View, Filter, FilterV2, ListTextFilter, TextFilter, VlgColumnConfig, passesFilterRules, hasActiveFilterRules } from '../store/logStore';
import { VirtualLogGrid, MultiSelection } from './VirtualLogGrid/VirtualLogGrid';
import { ColumnConfig, DEFAULT_COLUMNS } from './VirtualLogGrid/types';

// Debug logging for scroll issues
const DEBUG_SCROLL = true; // Enable scroll debugging
const scrollLog = {
  debug: (msg: string) => DEBUG_SCROLL && console.debug(`[ViewGrid:Scroll] ${msg}`),
  info: (msg: string) => DEBUG_SCROLL && console.log(`[ViewGrid:Scroll] ${msg}`),
  warn: (msg: string) => DEBUG_SCROLL && console.warn(`[ViewGrid:Scroll] ${msg}`),
  enter: (method: string) => DEBUG_SCROLL && console.group(`[ViewGrid:Scroll] >>> ${method}`),
  leave: () => DEBUG_SCROLL && console.groupEnd(),
};

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

// Apply FilterV2 (new rules-based filter) to entries
function filterEntriesForViewV2(entries: LogEntry[], filter: FilterV2): LogEntry[] {
    // Check if any filters are active
    const hasSessionFilter = hasActiveFilterRules(filter.sessions);
    const hasLevelFilter = hasActiveFilterRules(filter.levels);
    const hasAppNameFilter = hasActiveFilterRules(filter.appNames);
    const hasHostNameFilter = hasActiveFilterRules(filter.hostNames);
    const hasTitleFilter = hasActiveFilterRules(filter.titles);
    const hasEntryTypeFilter = hasActiveFilterRules(filter.entryTypes);
    const hasCorrelationFilter = filter.correlations && hasActiveFilterRules(filter.correlations);
    const hasMessageFilter = !!filter.messagePattern;

    // Fast path: no filters active
    if (!hasSessionFilter && !hasLevelFilter && !hasAppNameFilter &&
        !hasHostNameFilter && !hasTitleFilter && !hasEntryTypeFilter &&
        !hasCorrelationFilter && !hasMessageFilter) {
        return entries;
    }

    // Pre-compile message regex if needed
    let messageRegex: RegExp | null = null;
    if (hasMessageFilter) {
        try {
            messageRegex = new RegExp(filter.messagePattern, 'i');
        } catch {
            // Invalid regex
        }
    }

    return entries.filter(e => {
        // Session filter
        if (hasSessionFilter && !passesFilterRules(filter.sessions, e.sessionName)) {
            return false;
        }

        // Level filter (convert level number to string for matching)
        if (hasLevelFilter && !passesFilterRules(filter.levels, e.level !== undefined ? String(e.level) : undefined)) {
            return false;
        }

        // App name filter
        if (hasAppNameFilter && !passesFilterRules(filter.appNames, e.appName)) {
            return false;
        }

        // Host name filter
        if (hasHostNameFilter && !passesFilterRules(filter.hostNames, e.hostName)) {
            return false;
        }

        // Title filter
        if (hasTitleFilter && !passesFilterRules(filter.titles, e.title)) {
            return false;
        }

        // Entry type filter (convert type number to string for matching)
        if (hasEntryTypeFilter && !passesFilterRules(filter.entryTypes, e.logEntryType !== undefined ? String(e.logEntryType) : undefined)) {
            return false;
        }

        // Trace ID filter (for trace grouping)
        if (hasCorrelationFilter && !passesFilterRules(filter.correlations, e.ctx?._traceId)) {
            return false;
        }

        // Message pattern filter (searches title and data)
        if (messageRegex) {
            const titleMatch = messageRegex.test(e.title || '');
            const dataMatch = messageRegex.test(e.data || '');
            if (!titleMatch && !dataMatch) {
                return false;
            }
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
    const [freezeKey, setFreezeKey] = useState(0); // Trigger re-render on freeze/unfreeze
    const displayCountRefForFreeze = useRef<React.MutableRefObject<number> | null>(null);
    // Ref to access current targetEntries in mouseDown handler (updated later after targetEntries is defined)
    const targetEntriesRef = useRef<LogEntry[]>([]);

    useEffect(() => {
        const handleMouseDown = () => {
            isMouseDownRef.current = true;
            // IMPORTANT: Set global flag FIRST, before any React state updates
            // This ensures VirtualLogGrid's React.memo can block re-renders
            // We use window to share state with VirtualLogGrid
            (window as unknown as { __vlgMouseDown?: boolean }).__vlgMouseDown = true;

            if (displayCountRefForFreeze.current) {
                frozenDisplayCountRef.current = displayCountRefForFreeze.current.current;
                // CRITICAL: Also freeze the entries array to prevent re-renders during drag
                frozenEntriesRef.current = targetEntriesRef.current.slice(0, frozenDisplayCountRef.current);
                scrollLog.enter('MouseFreeze');
                scrollLog.info(`FREEZE: count=${frozenDisplayCountRef.current}, entries=${frozenEntriesRef.current.length}`);
                setFreezeKey(k => k + 1); // Trigger re-render to use frozen entries
            }
        };
        const handleMouseUp = () => {
            if (isMouseDownRef.current && frozenDisplayCountRef.current !== null) {
                scrollLog.info(`UNFREEZE: was count=${frozenDisplayCountRef.current}, entries=${frozenEntriesRef.current?.length}`);
                scrollLog.leave();
            }
            isMouseDownRef.current = false;
            frozenEntriesRef.current = null;
            frozenSliceOffsetRef.current = 0;
            frozenDisplayCountRef.current = null;
            (window as unknown as { __vlgMouseDown?: boolean }).__vlgMouseDown = false;
            setFreezeKey(k => k + 1); // Trigger re-render to use live entries
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

    // Merge saved column config with DEFAULT_COLUMNS to pick up new columns
    const mergeColumns = useCallback((savedConfig: VlgColumnConfig[] | undefined): ColumnConfig[] => {
        if (!savedConfig || savedConfig.length === 0) {
            return DEFAULT_COLUMNS;
        }
        const converted = savedConfig.map(toColumnConfig);
        // Add any new columns from DEFAULT_COLUMNS that aren't in saved config
        const savedIds = new Set(converted.map(c => c.id));
        const newColumns = DEFAULT_COLUMNS.filter(c => !savedIds.has(c.id));
        return [...converted, ...newColumns];
    }, []);

    // Column state - use view's column state merged with defaults
    const [columns, setColumns] = useState<ColumnConfig[]>(() => mergeColumns(view.columnConfig));

    // Update columns when view.columnConfig changes (e.g., when switching views)
    const viewColumnConfigRef = useRef(view.columnConfig);
    useEffect(() => {
        if (view.columnConfig !== viewColumnConfigRef.current) {
            viewColumnConfigRef.current = view.columnConfig;
            setColumns(mergeColumns(view.columnConfig));
        }
    }, [view.columnConfig, mergeColumns]);

    // Get combined highlight rules for this view
    const highlightRules = useMemo(() => {
        const viewRules = view.highlightRules || [];
        if (view.useGlobalHighlights) {
            return [...viewRules, ...globalHighlightRules];
        }
        return viewRules;
    }, [view.highlightRules, view.useGlobalHighlights, globalHighlightRules]);

    // Filter entries based on view filter
    // Use filterV2 (new rules-based filter) if available, otherwise fall back to legacy filter
    const filteredEntries = useMemo(() => {
        if (view.filterV2) {
            return filterEntriesForViewV2(entries, view.filterV2);
        }
        return filterEntriesForView(entries, view.filter);
    }, [entries, view.filter, view.filterV2, entriesVersion]);

    // Track first visible row from VirtualLogGrid for safe trimming
    const firstVisibleRowRef = useRef(0);
    const handleFirstVisibleRowChange = useCallback((row: number) => {
        firstVisibleRowRef.current = row;
    }, []);

    // Track cumulative trim count for scroll compensation
    const cumulativeTrimCountRef = useRef(0);
    const prevSliceOffsetRef = useRef(0);

    // BATCH TRIM STATE: Track the slice start index we're currently showing
    // When user scrolls up, we stop trimming and let this grow up to maxGridRows + BATCH_TRIM_BUFFER
    // When it exceeds that, we batch trim back to maxGridRows
    const [displayStartIndex, setDisplayStartIndex] = useState(0);
    // Track previous filteredEntries length to detect store-level trim
    const prevFilteredLengthRef = useRef(filteredEntries.length);

    // Detect when store trimmed entries and adjust displayStartIndex
    // If filteredEntries.length dropped significantly, the store trimmed from the front
    useEffect(() => {
        const prevLen = prevFilteredLengthRef.current;
        const currLen = filteredEntries.length;

        // If length dropped by more than a small delta, store trimmed
        // (Small increases/decreases from filtering are normal)
        if (prevLen > currLen + 100) {
            const trimmedByStore = prevLen - currLen;
            // Adjust our displayStartIndex down by the amount trimmed
            const newStartIdx = Math.max(0, displayStartIndex - trimmedByStore);
            scrollLog.warn(`STORE TRIM detected: ${prevLen} -> ${currLen}, adjusting displayStartIndex ${displayStartIndex} -> ${newStartIdx}`);
            setDisplayStartIndex(newStartIdx);
        }

        prevFilteredLengthRef.current = currLen;
    }, [filteredEntries.length, displayStartIndex]);

    // Check if view is stuck to bottom (for aggressive vs safe trimming)
    const isStuckToBottom = getViewStuckToBottom(view.id);

    // Apply maxGridRows cap with BATCH TRIMMING
    // Instead of continuous trimming, let buffer grow and trim in batches
    const maxGridRows = limits.maxGridRows;
    const batchTrimThreshold = maxGridRows + BATCH_TRIM_BUFFER;

    // Calculate what to display
    const { cappedEntries, sliceOffset, debugTrim, newDisplayStartIndex } = useMemo(() => {
        const totalEntries = filteredEntries.length;
        const safeToTrim = Math.max(0, firstVisibleRowRef.current - 50);

        // Case 1: Under maxGridRows - show everything
        if (totalEntries <= maxGridRows) {
            return {
                cappedEntries: filteredEntries,
                sliceOffset: 0,
                debugTrim: { excessRows: 0, safeToTrim, mustTrim: 0, actualTrim: 0, batchPending: false },
                newDisplayStartIndex: null as number | null
            };
        }

        // Case 2: When stuck to bottom - trim aggressively
        if (isStuckToBottom) {
            const startIdx = totalEntries - maxGridRows;
            return {
                cappedEntries: filteredEntries.slice(startIdx),
                sliceOffset: startIdx,
                debugTrim: { excessRows: startIdx, safeToTrim, mustTrim: 0, actualTrim: startIdx, batchPending: false },
                newDisplayStartIndex: startIdx
            };
        }

        // Case 3: Scrolled up - use BATCH TRIMMING
        // Show from displayStartIndex to end, capped at batchTrimThreshold rows
        const availableFromStart = totalEntries - displayStartIndex;

        // If we have more than threshold, time to batch trim
        if (availableFromStart > batchTrimThreshold) {
            const newStartIdx = totalEntries - maxGridRows;
            const trimAmount = newStartIdx - displayStartIndex;
            const firstVisibleRow = firstVisibleRowRef.current;

            scrollLog.warn(`BATCH TRIM: moving start ${displayStartIndex} -> ${newStartIdx}, trimming ${trimAmount} rows`);

            return {
                cappedEntries: filteredEntries.slice(newStartIdx),
                sliceOffset: newStartIdx,
                debugTrim: {
                    excessRows: availableFromStart - maxGridRows,
                    safeToTrim,
                    mustTrim: trimAmount,
                    actualTrim: trimAmount,
                    batchPending: false,
                    firstVisibleRow,
                },
                newDisplayStartIndex: newStartIdx
            };
        }

        // Under threshold - keep all from displayStartIndex, buffering new entries
        return {
            cappedEntries: filteredEntries.slice(displayStartIndex),
            sliceOffset: displayStartIndex,
            debugTrim: {
                excessRows: Math.max(0, availableFromStart - maxGridRows),
                safeToTrim,
                mustTrim: 0,
                actualTrim: 0,
                batchPending: availableFromStart > maxGridRows
            },
            newDisplayStartIndex: null
        };
    }, [filteredEntries, maxGridRows, batchTrimThreshold, isStuckToBottom, displayStartIndex]);

    // Update displayStartIndex when batch trim happened or when stuck to bottom
    useEffect(() => {
        if (newDisplayStartIndex !== null && newDisplayStartIndex !== displayStartIndex) {
            setDisplayStartIndex(newDisplayStartIndex);
        }
    }, [newDisplayStartIndex, displayStartIndex]);

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

    // Update ref for mouse freeze handler to access current entries
    targetEntriesRef.current = targetEntries;

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
    // CRITICAL: Also freeze entries during mouse drag to prevent scroll jumps
    // Using a ref to store the frozen entries array reference to maintain identity
    const displayedEntriesRef = useRef<LogEntry[]>([]);

    const displayedEntries = useMemo(() => {
        // During freeze, return the SAME frozen array reference to prevent re-renders
        if (frozenEntriesRef.current !== null) {
            // Only update ref if it's a different freeze
            if (displayedEntriesRef.current !== frozenEntriesRef.current) {
                displayedEntriesRef.current = frozenEntriesRef.current;
            }
            return displayedEntriesRef.current;
        }

        // Normal case: slice from target entries
        const count = displayCountRef.current;
        const newEntries = targetEntries.slice(0, count);
        displayedEntriesRef.current = newEntries;
        return newEntries;
    }, [targetEntries, displayCount, freezeKey]); // freezeKey triggers update on freeze/unfreeze


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
