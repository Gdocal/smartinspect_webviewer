/**
 * Grid test using react-grid-layout v2 API (hooks-based)
 * Testing resize granularity
 */

import { useState, useMemo, useCallback } from 'react';
import {
    Responsive,
    useContainerWidth,
    verticalCompactor,
    horizontalCompactor,
    noCompactor,
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './grid-layout.css';

const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };

interface LayoutItem {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

function generateLayout(): LayoutItem[] {
    return Array.from({ length: 12 }, (_, i) => ({
        i: i.toString(),
        x: (i % 6) * 2,
        y: Math.floor(i / 6) * 4,
        w: 2,
        h: Math.ceil(Math.random() * 3) + 2,
    }));
}

export function GridTest() {
    // v2: Use the useContainerWidth hook for responsive width
    const { width, containerRef, mounted } = useContainerWidth();

    const [layouts, setLayouts] = useState<{ lg: LayoutItem[] }>({ lg: generateLayout() });
    const [rowHeight, setRowHeight] = useState(30);
    const [compactor, setCompactor] = useState(() => verticalCompactor);

    const handleLayoutChange = useCallback((_layout: LayoutItem[], allLayouts: { lg: LayoutItem[] }) => {
        console.log('[GridTest] Layout changed:', allLayouts.lg?.map(l => ({ i: l.i, h: l.h })));
        setLayouts(allLayouts);
    }, []);

    const cycleCompactor = useCallback(() => {
        setCompactor(prev => {
            if (prev === verticalCompactor) return horizontalCompactor;
            if (prev === horizontalCompactor) return noCompactor;
            return verticalCompactor;
        });
    }, []);

    const regenerateLayout = () => {
        setLayouts({ lg: generateLayout() });
    };

    // Get compactor name for display
    const compactorName = compactor === verticalCompactor ? 'vertical' :
                          compactor === horizontalCompactor ? 'horizontal' : 'none';

    // Memoize children for performance
    const children = useMemo(() => {
        return layouts.lg.map((item, idx) => (
            <div
                key={item.i}
                style={{
                    background: `hsl(${(idx * 37) % 360}, 70%, 45%)`,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column'
                }}
            >
                <span className="text-white text-2xl font-bold">{item.i}</span>
                <span className="text-white/70 text-sm">h={item.h}</span>
            </div>
        ));
    }, [layouts.lg]);

    return (
        <div className="h-full overflow-auto bg-slate-900">
            {/* Control Panel */}
            <div className="sticky top-0 z-20 bg-slate-800 p-4 border-b border-slate-700">
                <h2 className="text-xl font-bold text-white mb-3">Grid Layout Test (v2 API)</h2>

                <div className="flex flex-wrap gap-4 items-center mb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm">Row Height:</span>
                        <input
                            type="range"
                            min="1"
                            max="50"
                            value={rowHeight}
                            onChange={(e) => setRowHeight(parseInt(e.target.value))}
                            className="w-32"
                        />
                        <span className="text-emerald-400 font-mono w-12">{rowHeight}px</span>
                    </div>

                    <button
                        onClick={cycleCompactor}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                        Compact: {compactorName}
                    </button>

                    <button
                        onClick={regenerateLayout}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                    >
                        New Layout
                    </button>
                </div>

                <div className="text-sm text-slate-400">
                    Heights (h units): {layouts.lg.slice(0, 6).map(l => `${l.i}=${l.h}`).join(', ')}...
                </div>
                <div className="text-sm text-emerald-400">
                    Actual pixels: {layouts.lg.slice(0, 6).map(l => `${l.i}=${l.h * rowHeight}px`).join(', ')}...
                </div>
                <div className="text-sm text-blue-400">
                    Container width: {width}px
                </div>
            </div>

            {/* Grid - v2: Container ref for width measurement */}
            <div ref={containerRef} className="p-4">
                {mounted && (
                    <Responsive
                        className="layout"
                        layouts={layouts}
                        breakpoints={BREAKPOINTS}
                        cols={COLS}
                        width={width}
                        rowHeight={rowHeight}
                        onLayoutChange={handleLayoutChange}
                        compactor={compactor}
                        margin={[8, 8]}
                        containerPadding={[0, 0]}
                        useCSSTransforms={true}
                    >
                        {children}
                    </Responsive>
                )}
            </div>
        </div>
    );
}
