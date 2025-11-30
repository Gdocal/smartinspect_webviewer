import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
    ColDef,
    GridReadyEvent,
    GridApi,
    ModuleRegistry,
    AllCommunityModule,
} from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

interface TestRow {
    id: number;
    name: string;
    value: number;
    timestamp: string;
}

type AddMethod = 'transaction' | 'rowData' | 'asyncTransaction';
type ScrollMethod = 'ensureIndexVisible' | 'ensureNodeVisible' | 'scrollToBottom' | 'none';

// Initial rows count
const INITIAL_ROWS = 50;

export function AgGridTest() {
    const gridApiRef = useRef<GridApi | null>(null);
    const gridRef = useRef<AgGridReact>(null);
    const [rowCount, setRowCount] = useState(0);
    const nextIdRef = useRef(1);
    const intervalRef = useRef<number | null>(null);
    const rowDataRef = useRef<TestRow[]>([]);

    // Key to force grid recreation
    const [gridKey, setGridKey] = useState(0);

    // Grid options state
    const [options, setOptions] = useState({
        // Row animation
        animateRows: true,

        // Scroll options
        debounceVerticalScrollbar: true,
        suppressScrollOnNewData: true,
        alwaysShowVerticalScroll: false,

        // Virtualization
        suppressRowVirtualisation: false,
        suppressColumnVirtualisation: false,

        // Buffer - larger buffer helps with fast scrolling
        rowBuffer: 100,

        // Add method
        addMethod: 'transaction' as AddMethod,
        scrollMethod: 'ensureIndexVisible' as ScrollMethod,

        // Timing
        addInterval: 1000,
        rowsPerAdd: 1,

        // Transaction options
        asyncTransactionWaitMillis: 50,

        // Scroll behavior (CSS)
        smoothScroll: true,

        // ensureIndexVisible position
        scrollPosition: 'bottom' as 'top' | 'middle' | 'bottom' | null,

        // Delay before scroll
        scrollDelay: 0,

        // Use requestAnimationFrame before scroll
        useRAF: true,
    });

    const columnDefs = useRef<ColDef<TestRow>[]>([
        { headerName: 'ID', field: 'id', width: 80 },
        { headerName: 'Name', field: 'name', flex: 1 },
        { headerName: 'Value', field: 'value', width: 100 },
        { headerName: 'Timestamp', field: 'timestamp', width: 200 },
    ]);

    const defaultColDef = useRef<ColDef>({
        resizable: true,
        sortable: true,
    });

    const getRowId = useCallback((params: { data: TestRow }) => String(params.data.id), []);

    // Generate rows (moved before onGridReady)
    const generateRows = useCallback((count: number): TestRow[] => {
        const rows: TestRow[] = [];
        for (let i = 0; i < count; i++) {
            rows.push({
                id: nextIdRef.current++,
                name: `Row ${nextIdRef.current - 1}`,
                value: Math.floor(Math.random() * 1000),
                timestamp: new Date().toISOString(),
            });
        }
        return rows;
    }, []);

    const onGridReady = useCallback((params: GridReadyEvent) => {
        gridApiRef.current = params.api;

        // Reset state for new grid
        nextIdRef.current = 1;
        rowDataRef.current = [];

        // Add initial 50 rows
        const initialRows = generateRows(INITIAL_ROWS);
        rowDataRef.current = initialRows;

        if (options.addMethod === 'rowData') {
            params.api.setGridOption('rowData', initialRows);
        } else if (options.addMethod === 'asyncTransaction') {
            params.api.applyTransactionAsync({ add: initialRows });
        } else {
            params.api.applyTransaction({ add: initialRows });
        }

        setRowCount(INITIAL_ROWS);

        // Scroll to bottom after initial rows
        requestAnimationFrame(() => {
            const rowCount = params.api.getDisplayedRowCount();
            if (rowCount > 0) {
                params.api.ensureIndexVisible(rowCount - 1, 'bottom');
            }
        });
    }, [options.addMethod, generateRows]);

    // Scroll to bottom using selected method
    const scrollToBottom = useCallback(() => {
        if (!gridApiRef.current) return;

        const doScroll = () => {
            if (!gridApiRef.current) return;

            const rowCount = gridApiRef.current.getDisplayedRowCount();
            if (rowCount === 0) return;

            switch (options.scrollMethod) {
                case 'ensureIndexVisible':
                    gridApiRef.current.ensureIndexVisible(rowCount - 1, options.scrollPosition);
                    break;
                case 'ensureNodeVisible':
                    const lastNode = gridApiRef.current.getDisplayedRowAtIndex(rowCount - 1);
                    if (lastNode) {
                        gridApiRef.current.ensureNodeVisible(lastNode, options.scrollPosition);
                    }
                    break;
                case 'scrollToBottom':
                    // Direct DOM manipulation
                    const viewport = document.querySelector('.ag-body-viewport') as HTMLElement;
                    if (viewport) {
                        viewport.scrollTop = viewport.scrollHeight;
                    }
                    break;
                case 'none':
                    // Don't scroll
                    break;
            }
        };

        const executeScroll = () => {
            if (options.scrollDelay > 0) {
                setTimeout(doScroll, options.scrollDelay);
            } else {
                doScroll();
            }
        };

        if (options.useRAF) {
            requestAnimationFrame(executeScroll);
        } else {
            executeScroll();
        }
    }, [options.scrollMethod, options.scrollPosition, options.scrollDelay, options.useRAF]);

    // Add rows via transaction
    const addViaTransaction = useCallback((newRows: TestRow[]) => {
        if (!gridApiRef.current) return;
        gridApiRef.current.applyTransaction({ add: newRows });
        rowDataRef.current = [...rowDataRef.current, ...newRows];
    }, []);

    // Add rows via async transaction
    const addViaAsyncTransaction = useCallback((newRows: TestRow[]) => {
        if (!gridApiRef.current) return;
        gridApiRef.current.applyTransactionAsync({ add: newRows });
        rowDataRef.current = [...rowDataRef.current, ...newRows];
    }, []);

    // Add rows via rowData (setGridOption)
    const addViaRowData = useCallback((newRows: TestRow[]) => {
        if (!gridApiRef.current) return;
        rowDataRef.current = [...rowDataRef.current, ...newRows];
        gridApiRef.current.setGridOption('rowData', rowDataRef.current);
    }, []);

    // Ref to track if we should stick to bottom
    const stickToBottomRef = useRef(true);
    // Track if we're programmatically scrolling (to ignore those scroll events)
    const isProgrammaticScrollRef = useRef(false);
    // Track when user last interacted - don't auto-scroll for a bit after
    const userInteractionTimeRef = useRef(0);
    // Track when user explicitly disabled auto-scroll (longer grace period)
    const userDisabledAutoScrollTimeRef = useRef(0);

    // Simple snap to bottom - no animation, just keep scrollbar at bottom
    const snapToBottom = useCallback((viewport: HTMLElement, fakeScroll: HTMLElement | null) => {
        isProgrammaticScrollRef.current = true;
        const maxScroll = viewport.scrollHeight - viewport.clientHeight;
        viewport.scrollTop = maxScroll;
        if (fakeScroll) fakeScroll.scrollTop = maxScroll;
        // Reset after a short delay
        setTimeout(() => {
            isProgrammaticScrollRef.current = false;
        }, 50);
    }, []);

    // Main add rows function
    const addRows = useCallback(() => {
        const newRows = generateRows(options.rowsPerAdd);
        const viewport = document.querySelector('.ag-body-viewport') as HTMLElement;
        const fakeScroll = document.querySelector('.ag-body-vertical-scroll-viewport') as HTMLElement;

        // Don't update stick-to-bottom state here - let the scroll event handler do it
        // This prevents rapid row adds from interfering with user's scroll intent

        switch (options.addMethod) {
            case 'transaction':
                addViaTransaction(newRows);
                break;
            case 'asyncTransaction':
                addViaAsyncTransaction(newRows);
                break;
            case 'rowData':
                addViaRowData(newRows);
                break;
        }

        setRowCount(prev => prev + newRows.length);

        // If we should stick to bottom, snap there immediately after DOM updates
        // But skip if user recently interacted or explicitly disabled auto-scroll
        const timeSinceInteraction = Date.now() - userInteractionTimeRef.current;
        const timeSinceDisabled = Date.now() - userDisabledAutoScrollTimeRef.current;

        // Don't auto-scroll if:
        // 1. stickToBottom is false (user explicitly disabled)
        // 2. User interacted within last 500ms
        // 3. User disabled auto-scroll within last 5 seconds (longer grace period)
        if (stickToBottomRef.current && viewport && timeSinceInteraction > 500 && timeSinceDisabled > 5000) {
            // Snap multiple times to catch all AG Grid internal updates
            snapToBottom(viewport, fakeScroll);
            queueMicrotask(() => snapToBottom(viewport, fakeScroll));
            requestAnimationFrame(() => {
                snapToBottom(viewport, fakeScroll);
                requestAnimationFrame(() => snapToBottom(viewport, fakeScroll));
            });
        }
    }, [options.addMethod, options.rowsPerAdd, generateRows, addViaTransaction, addViaAsyncTransaction, addViaRowData, snapToBottom]);

    // Clear all rows
    const clearRows = useCallback(() => {
        if (!gridApiRef.current) return;

        if (options.addMethod === 'rowData') {
            rowDataRef.current = [];
            gridApiRef.current.setGridOption('rowData', []);
        } else {
            const allData: TestRow[] = [];
            gridApiRef.current.forEachNode(node => {
                if (node.data) allData.push(node.data);
            });
            gridApiRef.current.applyTransaction({ remove: allData });
            rowDataRef.current = [];
        }

        setRowCount(0);
        nextIdRef.current = 1;
    }, [options.addMethod]);

    // Auto-add toggle
    const [isAutoAdding, setIsAutoAdding] = useState(false);

    useEffect(() => {
        if (isAutoAdding) {
            intervalRef.current = window.setInterval(addRows, options.addInterval);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isAutoAdding, options.addInterval, addRows]);

    // Apply smooth scroll CSS and add event listeners to track user scroll intent
    useEffect(() => {
        const viewport = document.querySelector('.ag-body-viewport') as HTMLElement;
        const fakeScroll = document.querySelector('.ag-body-vertical-scroll-viewport') as HTMLElement;

        if (viewport) {
            viewport.style.scrollBehavior = options.smoothScroll ? 'smooth' : 'auto';
        }

        // Wheel event - user is scrolling with mouse wheel
        const handleWheel = (e: WheelEvent) => {
            userInteractionTimeRef.current = Date.now();
            // Scrolling up (negative deltaY) = user wants to leave auto-scroll
            if (e.deltaY < 0) {
                stickToBottomRef.current = false;
                userDisabledAutoScrollTimeRef.current = Date.now();
            }
        };

        // Mousedown on scrollbar track - user is dragging scrollbar
        const handleMouseDown = () => {
            userInteractionTimeRef.current = Date.now();
            // User is interacting with scrollbar, disable stick-to-bottom
            stickToBottomRef.current = false;
            userDisabledAutoScrollTimeRef.current = Date.now();
        };

        // Scroll event - check if user scrolled to bottom to re-enable
        const handleScroll = () => {
            if (!viewport || isProgrammaticScrollRef.current) return;

            const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

            // If user scrolled to bottom (within 10px), enable stick-to-bottom
            if (distanceFromBottom < 10) {
                stickToBottomRef.current = true;
                // Reset the disabled timer so auto-scroll can resume immediately
                userDisabledAutoScrollTimeRef.current = 0;
            }
        };

        viewport?.addEventListener('wheel', handleWheel, { passive: true });
        viewport?.addEventListener('mousedown', handleMouseDown);
        fakeScroll?.addEventListener('mousedown', handleMouseDown);
        viewport?.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            viewport?.removeEventListener('wheel', handleWheel);
            viewport?.removeEventListener('mousedown', handleMouseDown);
            fakeScroll?.removeEventListener('mousedown', handleMouseDown);
            viewport?.removeEventListener('scroll', handleScroll);
        };
    }, [options.smoothScroll, gridKey]);

    // Options that require grid recreation
    const gridRecreationOptions = new Set([
        'animateRows',
        'debounceVerticalScrollbar',
        'suppressScrollOnNewData',
        'suppressRowVirtualisation',
        'suppressColumnVirtualisation',
        'alwaysShowVerticalScroll',
        'rowBuffer',
        'addMethod',
        'asyncTransactionWaitMillis',
    ]);

    const updateOption = <K extends keyof typeof options>(key: K, value: typeof options[K]) => {
        setOptions(prev => ({ ...prev, [key]: value }));

        // Recreate grid for options that require it
        if (gridRecreationOptions.has(key)) {
            // Stop auto-add if running
            setIsAutoAdding(false);
            // Increment key to force grid recreation
            setGridKey(prev => prev + 1);
        }
    };

    return (
        <div className="h-screen flex flex-col bg-slate-900 text-white p-4 overflow-auto">
            {/* CSS to prevent white flash on new rows */}
            <style>{`
                /* Set explicit background colors for all rows to prevent white flash */
                .ag-theme-balham-dark .ag-row {
                    background-color: #0f172a !important;
                }
                .ag-theme-balham-dark .ag-row-odd {
                    background-color: #1e293b !important;
                }
                .ag-theme-balham-dark .ag-row-even {
                    background-color: #0f172a !important;
                }
                /* Ensure cells also have background to prevent flash */
                .ag-theme-balham-dark .ag-cell {
                    background-color: inherit;
                }
                /* Row animation - only animate transform, not background */
                .ag-theme-balham-dark .ag-row-animation {
                    transition: transform 0.3s ease-out !important;
                }
                .ag-theme-balham-dark .ag-row-no-animation {
                    transition: none !important;
                }
                /* Prevent flash during virtualization */
                .ag-theme-balham-dark .ag-center-cols-viewport {
                    overflow-anchor: none;
                    background-color: #0f172a;
                }
                .ag-theme-balham-dark .ag-body-viewport {
                    background-color: #0f172a;
                }
                /* Ensure pinned rows don't flash either */
                .ag-theme-balham-dark .ag-floating-top-viewport,
                .ag-theme-balham-dark .ag-floating-bottom-viewport {
                    background-color: #0f172a;
                }
            `}</style>
            <h1 className="text-xl font-bold mb-4">AG Grid Transaction Test</h1>

            {/* Controls */}
            <div className="flex flex-wrap gap-4 mb-4 p-4 bg-slate-800 rounded">
                <div className="flex gap-2">
                    <button
                        onClick={addRows}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                    >
                        Add {options.rowsPerAdd} Row(s)
                    </button>
                    <button
                        onClick={() => setIsAutoAdding(!isAutoAdding)}
                        className={`px-4 py-2 rounded ${isAutoAdding ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                        {isAutoAdding ? 'Stop Auto-Add' : 'Start Auto-Add'}
                    </button>
                    <button
                        onClick={clearRows}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                    >
                        Clear All
                    </button>
                    <button
                        onClick={scrollToBottom}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded"
                    >
                        Scroll to Bottom
                    </button>
                </div>
                <div className="text-sm flex items-center gap-4">
                    <span>Rows: <span className="font-mono text-green-400">{rowCount}</span></span>
                    <span>Method: <span className="font-mono text-yellow-400">{options.addMethod}</span></span>
                </div>
            </div>

            {/* Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                {/* Add Method */}
                <div className="p-4 bg-slate-800 rounded">
                    <h3 className="font-semibold mb-2 text-blue-400">Add Method</h3>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="addMethod"
                                checked={options.addMethod === 'transaction'}
                                onChange={() => updateOption('addMethod', 'transaction')}
                            />
                            applyTransaction (sync)
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="addMethod"
                                checked={options.addMethod === 'asyncTransaction'}
                                onChange={() => updateOption('addMethod', 'asyncTransaction')}
                            />
                            applyTransactionAsync
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="addMethod"
                                checked={options.addMethod === 'rowData'}
                                onChange={() => updateOption('addMethod', 'rowData')}
                            />
                            setGridOption('rowData')
                        </label>
                    </div>
                </div>

                {/* Scroll Method */}
                <div className="p-4 bg-slate-800 rounded">
                    <h3 className="font-semibold mb-2 text-blue-400">Scroll Method</h3>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="scrollMethod"
                                checked={options.scrollMethod === 'ensureIndexVisible'}
                                onChange={() => updateOption('scrollMethod', 'ensureIndexVisible')}
                            />
                            ensureIndexVisible
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="scrollMethod"
                                checked={options.scrollMethod === 'ensureNodeVisible'}
                                onChange={() => updateOption('scrollMethod', 'ensureNodeVisible')}
                            />
                            ensureNodeVisible
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="scrollMethod"
                                checked={options.scrollMethod === 'scrollToBottom'}
                                onChange={() => updateOption('scrollMethod', 'scrollToBottom')}
                            />
                            DOM scrollTop
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="scrollMethod"
                                checked={options.scrollMethod === 'none'}
                                onChange={() => updateOption('scrollMethod', 'none')}
                            />
                            None (no scroll)
                        </label>
                    </div>
                </div>

                {/* Scroll Position */}
                <div className="p-4 bg-slate-800 rounded">
                    <h3 className="font-semibold mb-2 text-blue-400">Scroll Position</h3>
                    <div className="space-y-2">
                        {(['top', 'middle', 'bottom', null] as const).map(pos => (
                            <label key={String(pos)} className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="scrollPosition"
                                    checked={options.scrollPosition === pos}
                                    onChange={() => updateOption('scrollPosition', pos)}
                                />
                                {pos === null ? 'null (default)' : pos}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Animation & Virtualization */}
                <div className="p-4 bg-slate-800 rounded">
                    <h3 className="font-semibold mb-2 text-blue-400">Animation & Virtualization</h3>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={options.animateRows}
                                onChange={e => updateOption('animateRows', e.target.checked)}
                            />
                            animateRows
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={options.suppressRowVirtualisation}
                                onChange={e => updateOption('suppressRowVirtualisation', e.target.checked)}
                            />
                            suppressRowVirtualisation
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={options.suppressColumnVirtualisation}
                                onChange={e => updateOption('suppressColumnVirtualisation', e.target.checked)}
                            />
                            suppressColumnVirtualisation
                        </label>
                    </div>
                </div>

                {/* Scroll Options */}
                <div className="p-4 bg-slate-800 rounded">
                    <h3 className="font-semibold mb-2 text-blue-400">Scroll Options</h3>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={options.debounceVerticalScrollbar}
                                onChange={e => updateOption('debounceVerticalScrollbar', e.target.checked)}
                            />
                            debounceVerticalScrollbar
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={options.suppressScrollOnNewData}
                                onChange={e => updateOption('suppressScrollOnNewData', e.target.checked)}
                            />
                            suppressScrollOnNewData
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={options.alwaysShowVerticalScroll}
                                onChange={e => updateOption('alwaysShowVerticalScroll', e.target.checked)}
                            />
                            alwaysShowVerticalScroll
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={options.smoothScroll}
                                onChange={e => updateOption('smoothScroll', e.target.checked)}
                            />
                            CSS smooth scroll
                        </label>
                    </div>
                </div>

                {/* Timing Options */}
                <div className="p-4 bg-slate-800 rounded">
                    <h3 className="font-semibold mb-2 text-blue-400">Timing & RAF</h3>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={options.useRAF}
                                onChange={e => updateOption('useRAF', e.target.checked)}
                            />
                            Use requestAnimationFrame
                        </label>
                        <label className="flex items-center gap-2">
                            Scroll delay (ms):
                            <input
                                type="number"
                                value={options.scrollDelay}
                                onChange={e => updateOption('scrollDelay', parseInt(e.target.value) || 0)}
                                className="w-20 px-2 py-1 bg-slate-700 rounded"
                            />
                        </label>
                        <label className="flex items-center gap-2">
                            Async wait (ms):
                            <input
                                type="number"
                                value={options.asyncTransactionWaitMillis}
                                onChange={e => updateOption('asyncTransactionWaitMillis', parseInt(e.target.value) || 50)}
                                className="w-20 px-2 py-1 bg-slate-700 rounded"
                            />
                        </label>
                    </div>
                </div>

                {/* Numeric Options */}
                <div className="p-4 bg-slate-800 rounded">
                    <h3 className="font-semibold mb-2 text-blue-400">Buffer & Intervals</h3>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2">
                            rowBuffer:
                            <input
                                type="number"
                                value={options.rowBuffer}
                                onChange={e => updateOption('rowBuffer', parseInt(e.target.value) || 10)}
                                className="w-20 px-2 py-1 bg-slate-700 rounded"
                            />
                        </label>
                        <label className="flex items-center gap-2">
                            Add interval (ms):
                            <input
                                type="number"
                                value={options.addInterval}
                                onChange={e => updateOption('addInterval', parseInt(e.target.value) || 1000)}
                                className="w-24 px-2 py-1 bg-slate-700 rounded"
                            />
                        </label>
                        <label className="flex items-center gap-2">
                            Rows per add:
                            <input
                                type="number"
                                value={options.rowsPerAdd}
                                onChange={e => updateOption('rowsPerAdd', parseInt(e.target.value) || 1)}
                                className="w-16 px-2 py-1 bg-slate-700 rounded"
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 min-h-[400px] ag-theme-balham-dark">
                <AgGridReact
                    key={gridKey}
                    ref={gridRef}
                    columnDefs={columnDefs.current}
                    defaultColDef={defaultColDef.current}
                    getRowId={getRowId}
                    onGridReady={onGridReady}
                    animateRows={options.animateRows}
                    rowBuffer={options.rowBuffer}
                    debounceVerticalScrollbar={options.debounceVerticalScrollbar}
                    suppressScrollOnNewData={options.suppressScrollOnNewData}
                    suppressRowVirtualisation={options.suppressRowVirtualisation}
                    suppressColumnVirtualisation={options.suppressColumnVirtualisation}
                    alwaysShowVerticalScroll={options.alwaysShowVerticalScroll}
                    asyncTransactionWaitMillis={options.asyncTransactionWaitMillis}
                />
            </div>

            {/* Current options display */}
            <div className="mt-4 p-4 bg-slate-800 rounded text-xs">
                <details>
                    <summary className="cursor-pointer text-slate-400 hover:text-white">Current Options (click to expand)</summary>
                    <pre className="mt-2 text-green-400 overflow-auto">{JSON.stringify(options, null, 2)}</pre>
                </details>
            </div>
        </div>
    );
}
