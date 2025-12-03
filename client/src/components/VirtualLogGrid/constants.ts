// Row density configuration
export type RowDensity = 'compact' | 'default' | 'comfortable';

// VirtualLogGrid row heights by density
export const ROW_HEIGHTS: Record<RowDensity, number> = {
  compact: 16,
  default: 24,
  comfortable: 28,
};

// StreamsView row heights by density (slightly larger for multi-column layout)
export const STREAM_ROW_HEIGHTS: Record<RowDensity, number> = {
  compact: 18,
  default: 26,
  comfortable: 32,
};

// Font sizes by density
export const FONT_SIZES: Record<RowDensity, number> = {
  compact: 11,
  default: 12,
  comfortable: 13,
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
export const OVERSCAN = 10;
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
