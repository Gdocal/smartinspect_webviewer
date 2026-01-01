// Row density configuration
export type RowDensity = 'compact' | 'default' | 'comfortable';

// VirtualLogGrid row heights by density (+7% from original)
export const ROW_HEIGHTS: Record<RowDensity, number> = {
  compact: 17,
  default: 26,
  comfortable: 30,
};

// StreamsView row heights by density (+7% from original)
export const STREAM_ROW_HEIGHTS: Record<RowDensity, number> = {
  compact: 19,
  default: 28,
  comfortable: 34,
};

// TracesView row heights by density
export const TRACE_ROW_HEIGHTS: Record<RowDensity, number> = {
  compact: 56,
  default: 72,
  comfortable: 88,
};

// TraceWaterfall span row heights by density
export const WATERFALL_ROW_HEIGHTS: Record<RowDensity, number> = {
  compact: 24,
  default: 32,
  comfortable: 40,
};

// Font sizes by density (+7% from original)
export const FONT_SIZES: Record<RowDensity, number> = {
  compact: 12,
  default: 13,
  comfortable: 14,
};

// Header heights by density
export const HEADER_HEIGHTS: Record<RowDensity, number> = {
  compact: 24,
  default: 28,
  comfortable: 32,
};

export function getHeaderHeight(density: RowDensity): number {
  return HEADER_HEIGHTS[density];
}

// Default row height (for backwards compatibility)
export const ROW_HEIGHT = 28;
// Overscan = number of rows to render above/below visible viewport
// Higher values = smoother scrolling but more DOM nodes
export const OVERSCAN = 50; // Base overscan for smooth scrolling
export const OVERSCAN_FAST = 80; // Higher overscan during fast scrolling (mouse wheel)
export const OVERSCAN_DRAG = 200; // Maximum overscan during scrollbar drag
export const MAX_ROWS = 50000;

// Helper to get row height by density
export function getRowHeight(density: RowDensity): number {
  return ROW_HEIGHTS[density];
}

// Get effective row height considering custom override
export function getEffectiveRowHeight(density: RowDensity, customHeight: number | null): number {
  return customHeight !== null ? customHeight : ROW_HEIGHTS[density];
}

// Row height constraints for custom height slider
export const MIN_ROW_HEIGHT = 14;
export const MAX_ROW_HEIGHT = 48;

export function getStreamRowHeight(density: RowDensity): number {
  return STREAM_ROW_HEIGHTS[density];
}

export function getTraceRowHeight(density: RowDensity): number {
  return TRACE_ROW_HEIGHTS[density];
}

export function getWaterfallRowHeight(density: RowDensity): number {
  return WATERFALL_ROW_HEIGHTS[density];
}

export function getFontSize(density: RowDensity): number {
  return FONT_SIZES[density];
}
