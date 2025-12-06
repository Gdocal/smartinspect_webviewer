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
export const OVERSCAN = 40; // Base overscan (increased from 20 for smoother scrolling)
export const OVERSCAN_FAST = 60; // Higher overscan during fast scrolling
export const MAX_ROWS = 50000;

// Helper to get row height by density
export function getRowHeight(density: RowDensity): number {
  return ROW_HEIGHTS[density];
}

export function getStreamRowHeight(density: RowDensity): number {
  return STREAM_ROW_HEIGHTS[density];
}

export function getFontSize(density: RowDensity): number {
  return FONT_SIZES[density];
}
