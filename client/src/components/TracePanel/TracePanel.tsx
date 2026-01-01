/**
 * TracePanel - Main container for trace visualization
 * @deprecated Use TracesView instead (new tab-based implementation)
 * This component is kept for reference but not actively used.
 */

import { useTraceStore } from '../../store/traceStore';
import { TraceListPanel } from './TraceListPanel';
import { WaterfallView } from './WaterfallView';
import { SpanDetail } from './SpanDetail';

export function TracePanel() {
    const { selectedTraceId, selectedSpanId } = useTraceStore();

    return (
        <div className="h-full flex bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
            {/* Left: Trace list */}
            <div className="w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-700">
                <TraceListPanel />
            </div>

            {/* Center: Waterfall view */}
            <div className="flex-1 min-w-0">
                <WaterfallView />
            </div>

            {/* Right: Span detail (shown when span is selected) */}
            {selectedTraceId && selectedSpanId && (
                <div className="w-80 flex-shrink-0 border-l border-slate-200 dark:border-slate-700">
                    <SpanDetail />
                </div>
            )}
        </div>
    );
}
