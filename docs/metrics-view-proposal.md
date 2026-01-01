# Metrics View - Detailed Specification

## Overview

A dedicated **Metrics View** for SmartInspect Web Viewer - a lightweight, built-in alternative to Grafana for visualizing watch data. Users can create configurable dashboards with multiple visualization panels.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Room scope | Per-room dashboards | Each room has its own dashboard set |
| Non-numeric watches | Count occurrences | Convert to numeric by counting unique values over time |
| Panel time sync | Independent | Each panel has its own time range |
| Live data mode | Explicit Live toggle | Like Grafana - Live auto-scrolls, pause when viewing history |
| Template variables | No | Keep it simple - no template variables |
| Panel editor UI | Side drawer | Click panel → settings drawer slides from right |
| Multi Y-axis | Later phase | Single Y-axis for MVP, add dual-axis later |
| Calculated fields | Full transform pipeline | Text expressions with functions: `rate(A) + rate(B)` |
| Transform UI | Text expression | Type expressions with autocomplete, not visual blocks |
| Alerts | Visual only | Threshold colors on panels, no notifications |
| Panel sizing | Flexible | No minimum size - user controls layout |
| Fullscreen mode | Essential | Click to expand panel, Esc to return |
| Click on data | Show tooltip | Detailed tooltip with timestamp and all values |
| Auto-save | Yes | Changes saved immediately to browser storage |
| Watch selector | Current only | Show only watches that exist now, grouped view |
| Export format | Config only | No data snapshots in exports |
| Time presets | Short focus | 5m, 15m, 30m, 1h, 3h |
| State persistence | Full restore | Remember dashboard, time range, panel sizes |
| Stat panel | Value + sparkline | Big number with mini trend chart behind |
| Gauge overflow | Like Grafana | Show in color zones, clamp at extremes |
| Dashboard limit | Unlimited | No restrictions |
| New dashboard | Empty canvas | Start blank, user builds from scratch |
| Keyboard shortcuts | Basic navigation | Esc, Arrows for edit mode |
| Time comparison | Not needed | User can open multiple windows |
| Table drill-down | Popup chart | Click row to see watch history chart |
| Core priority | Visual polish | Must look professional and match UI quality |

---

## Architecture

### View Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Header                                                           │
├─────────────────────────────────────────────────────────────────┤
│ [All Logs] [Errors Only] [Streams] [Traces] [📊 Metrics]       │  ← View Tabs
├─────────────────────────────────────────────────────────────────┤
│ Dashboard Tabs: [Overview] [Performance] [Errors] [+]           │  ← Per-room dashboards
├─────────────────────────────────────────────────────────────────┤
│ Toolbar: [⏱ Last 5m ▼] [🔴 Live] [⚙ Edit] [+ Add Panel]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │ Response Time       │  │ Error Count         │               │
│  │ ═══════════════════ │  │ ═══════════════════ │               │
│  │     [Line Chart]    │  │   [Stat + Spark]    │               │
│  │    ╱╲    ╱╲        │  │                     │               │
│  │   ╱  ╲  ╱  ╲       │  │       127           │               │
│  │  ╱    ╲╱    ╲      │  │    ~~~~~~~~         │               │
│  └─────────────────────┘  └─────────────────────┘               │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Request Metrics (Multi-series)                             │  │
│  │ ─ requests/sec  ─ errors  ─ latency                       │  │
│  │     [Combined Line Chart with Legend]                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│                    [Panel Settings Drawer] ──────────────────►  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Watch Updates (WebSocket)
         │
         ▼
┌─────────────────────┐
│  Watch Store        │ ← Current values + unlimited history (in-memory)
│  (logStore.ts)      │   Clear with /api/watches/history DELETE
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Metrics Store      │ ← Per-room dashboard configs
│  (metricsStore.ts)  │   Panel definitions, layout, time range
│                     │   Stored in browser localStorage
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Transform Engine   │ ← Expression parser: rate(A) + rate(B)
│                     │   Aggregations: avg, min, max, sum
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Panel Renderers    │ ← uPlot (time series), Canvas (gauges)
│  (Canvas-based)     │   Optimized for 60fps real-time updates
└─────────────────────┘
```

---

## Panel Types

### 1. Time Series (Line/Area Chart)
- Multiple watches on same chart
- Configurable colors per series
- Y-axis: auto-scale (single axis for MVP, dual-axis later)
- Hover tooltip with all values at time point
- Options: fill area, show points, line width, stepped line
- Legend: bottom or right, click to toggle series visibility

### 2. Stat Panel
- Single large value display
- **Sparkline background** showing recent trend
- Color thresholds (green/yellow/red based on value)
- Unit formatting (ms, %, bytes, req/s, etc.)
- Font size auto-adjusts to panel size

### 3. Gauge
- Circular gauge with arc segments
- Min/max/current value display
- Threshold color zones (like Grafana)
- Values outside range clamp to edges with color indication
- Percentage or absolute mode

### 4. Bar Chart
- Compare current values of multiple watches
- Horizontal or vertical orientation
- Sorted by value or alphabetical
- Color per bar or by threshold

### 5. Table
- Tabular view of selected watches
- Columns: Name, Current, Min, Max, Avg, Last Update
- Sortable by any column
- **Click row → popup mini chart** showing that watch's history
- Color cells by threshold

---

## Data Model

### Dashboard Configuration

```typescript
interface MetricsDashboard {
  id: string;
  name: string;
  roomId: string;                // Dashboards are per-room
  panels: MetricsPanel[];
  layout: GridLayoutItem[];      // react-grid-layout format
  createdAt: string;
  updatedAt: string;
}

interface MetricsPanel {
  id: string;
  title: string;
  type: 'timeseries' | 'stat' | 'gauge' | 'bar' | 'table';

  // Data queries
  queries: PanelQuery[];

  // Panel-specific options
  options: PanelOptions;

  // Time range (independent per panel)
  timeRange: TimeRange;

  // Live mode toggle
  liveMode: boolean;

  // Visual thresholds
  thresholds?: Threshold[];
}

interface PanelQuery {
  id: string;
  watchName: string;           // Watch name or pattern
  alias?: string;              // Display name override
  color?: string;              // Series color

  // Transform expression (optional)
  // Examples: "rate($value)", "$value / 1000", "avg($value, 5m)"
  expression?: string;
}

interface TimeRange {
  mode: 'relative' | 'absolute';
  relative?: 'last5m' | 'last15m' | 'last30m' | 'last1h' | 'last3h';
  from?: number;  // Unix timestamp
  to?: number;    // Unix timestamp
}

interface Threshold {
  value: number;
  color: string;    // CSS color
  label?: string;   // Optional label
}

interface GridLayoutItem {
  i: string;        // Panel ID
  x: number;        // Grid column (0-11)
  y: number;        // Grid row
  w: number;        // Width in columns
  h: number;        // Height in rows
}
```

### Transform Expression Language

```
Supported functions:
  rate($value)              - Rate of change per second
  delta($value)             - Difference from previous value
  avg($value, window)       - Moving average (window: 1m, 5m, etc.)
  min($value, window)       - Minimum in window
  max($value, window)       - Maximum in window
  sum($value, window)       - Sum over window
  abs($value)               - Absolute value
  round($value, decimals)   - Round to N decimals

Operators:
  + - * / %                 - Arithmetic
  ( )                       - Grouping

Examples:
  rate(requests) * 60                    - Requests per minute
  errors / requests * 100                - Error percentage
  avg(response_time, 1m)                 - 1-minute moving average
  (memory_used / memory_total) * 100     - Memory usage %
```

### Metrics Store (Zustand)

```typescript
interface MetricsState {
  // Per-room dashboards
  dashboardsByRoom: Record<string, MetricsDashboard[]>;

  // Active dashboard per room
  activeDashboardByRoom: Record<string, string | null>;

  // Global UI state
  editMode: boolean;
  fullscreenPanelId: string | null;
  settingsDrawerPanelId: string | null;

  // Actions
  createDashboard: (roomId: string, name: string) => string;
  deleteDashboard: (roomId: string, dashboardId: string) => void;
  duplicateDashboard: (roomId: string, dashboardId: string) => string;
  renameDashboard: (roomId: string, dashboardId: string, name: string) => void;

  addPanel: (roomId: string, dashboardId: string, panel: Omit<MetricsPanel, 'id'>) => string;
  updatePanel: (roomId: string, dashboardId: string, panelId: string, updates: Partial<MetricsPanel>) => void;
  deletePanel: (roomId: string, dashboardId: string, panelId: string) => void;
  duplicatePanel: (roomId: string, dashboardId: string, panelId: string) => string;

  updateLayout: (roomId: string, dashboardId: string, layout: GridLayoutItem[]) => void;

  setActiveDashboard: (roomId: string, dashboardId: string | null) => void;
  setEditMode: (enabled: boolean) => void;
  setFullscreenPanel: (panelId: string | null) => void;
  openPanelSettings: (panelId: string | null) => void;

  // Persistence
  exportDashboard: (roomId: string, dashboardId: string) => string;  // JSON
  importDashboard: (roomId: string, json: string) => string;
  saveDashboardsToProject: (roomId: string) => object;
  loadDashboardsFromProject: (roomId: string, data: object) => void;
}
```

---

## UI Components

### File Structure

```
client/src/components/MetricsView/
├── index.ts                      # Exports
├── MetricsView.tsx               # Main view component
├── DashboardTabs.tsx             # Dashboard tab bar with +/rename/delete
├── DashboardToolbar.tsx          # Time presets, Live toggle, Edit mode, Add panel
├── PanelGrid.tsx                 # react-grid-layout container
├── Panel.tsx                     # Generic panel wrapper (title, menu, resize)
├── PanelSettingsDrawer.tsx       # Right-side settings drawer
├── FullscreenPanel.tsx           # Fullscreen overlay for expanded panel
├── panels/
│   ├── TimeSeriesPanel.tsx       # uPlot line/area chart
│   ├── StatPanel.tsx             # Big number + sparkline
│   ├── GaugePanel.tsx            # Circular gauge
│   ├── BarPanel.tsx              # Bar chart
│   └── TablePanel.tsx            # Data table with drill-down
├── editors/
│   ├── QueryEditor.tsx           # Watch selector + expression editor
│   ├── ThresholdEditor.tsx       # Color threshold config
│   ├── TimeRangeEditor.tsx       # Per-panel time range
│   └── DisplayOptionsEditor.tsx  # Panel-specific display options
├── common/
│   ├── WatchAutocomplete.tsx     # Watch name input with autocomplete
│   ├── ColorPicker.tsx           # Color selection
│   ├── UnitSelector.tsx          # Unit format dropdown
│   └── MiniChart.tsx             # Popup chart for table drill-down
├── hooks/
│   ├── useWatchHistory.ts        # Fetch watch history from API
│   ├── useTransformEngine.ts     # Parse and execute expressions
│   ├── usePanelData.ts           # Combine queries into panel data
│   └── useLiveUpdates.ts         # Subscribe to real-time watch updates
└── store/
    └── metricsStore.ts           # Zustand store for dashboards
```

### Key Interactions

#### Adding a Panel
1. Click "+ Add Panel" in toolbar
2. Panel type picker modal appears
3. Select type → new panel added to grid
4. Settings drawer opens automatically
5. Configure watches, expression, display options
6. Drawer closes → panel shows data

#### Editing a Panel
1. Click panel header menu (⋮) → "Edit"
   OR: Click panel when in Edit Mode
2. Settings drawer slides in from right
3. Tabs: Queries | Display | Thresholds
4. Changes apply immediately (auto-save)
5. Close drawer when done

#### Fullscreen Mode
1. Click panel header menu (⋮) → "View fullscreen"
   OR: Double-click panel
2. Panel expands to fill dashboard area
3. Press Esc or click X to return
4. All interactions work in fullscreen

#### Table Drill-Down
1. Click any row in Table panel
2. Popup appears showing mini time series chart
3. Chart shows that watch's history for current time range
4. Click outside or press Esc to close

---

## Charting: uPlot

### Why uPlot
- **48KB** bundle (vs 200KB+ for Chart.js/Recharts)
- **10% CPU** at 60fps (vs 40-70% for others)
- Canvas-based - handles 10K+ points smoothly
- Time-series focused - built for this exact use case
- No dependencies

### Real-time Update Pattern

```typescript
function useTimeSeriesPanel(queries: PanelQuery[], timeRange: TimeRange, liveMode: boolean) {
  const chartRef = useRef<uPlot | null>(null);
  const dataRef = useRef<uPlot.AlignedData>([[], []]);

  // Fetch initial history
  useEffect(() => {
    const fetchHistory = async () => {
      const history = await Promise.all(
        queries.map(q => api.getWatchHistory(q.watchName, timeRange))
      );
      dataRef.current = transformToUplotData(history, queries);
      chartRef.current?.setData(dataRef.current, false);
    };
    fetchHistory();
  }, [queries, timeRange]);

  // Subscribe to live updates
  useEffect(() => {
    if (!liveMode) return;

    const unsubscribe = subscribeToWatches(queries.map(q => q.watchName), (updates) => {
      // Append new points
      appendPoints(dataRef.current, updates);
      // Trim old points outside time range
      trimToTimeRange(dataRef.current, timeRange);
      // Update chart without animation
      chartRef.current?.setData(dataRef.current, false);
    });

    return unsubscribe;
  }, [queries, liveMode, timeRange]);

  return { chartRef, dataRef };
}
```

---

## High-Frequency Data Handling

### The Problem
Watches can update every 5ms (200 updates/sec/watch). Without mitigation:
- 10 watches × 200/sec × 3600 sec = **7.2 million points/hour**
- RAM exhaustion + UI death

### Solution: Tiered Aggregation + Throttling

#### Already Implemented (server/src/index.js)
- **Watch broadcast throttling**: 3 updates/sec max per watch via WebSocket
- **Entry broadcast batching**: 3 batches/sec per room
- **Performance metrics**: Track entries/watches per second

#### Tiered Storage (To Implement)

```javascript
// server/src/storage.js - WatchStore with downsampling
class WatchStore {
  constructor() {
    this.current = new Map();     // name -> latest value

    // Tiered history with automatic rollup
    this.raw = new Map();         // name -> RingBuffer(100)     - last 100 raw points
    this.secondly = new Map();    // name -> RingBuffer(3600)    - 1 hour of 1s averages
    this.minutely = new Map();    // name -> RingBuffer(1440)    - 24h of 1m averages
    this.hourly = new Map();      // name -> RingBuffer(168)     - 7 days of 1h averages

    // Aggregation state per watch
    this.aggregators = new Map(); // name -> { secondBucket, minuteBucket, hourBucket }
  }

  set(name, value, timestamp) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      // Non-numeric: count occurrences (tracked separately)
      return this.setNonNumeric(name, value, timestamp);
    }

    // Store current
    this.current.set(name, { value, timestamp });

    // Add to raw ring buffer
    this.getRaw(name).push({ value: numValue, timestamp });

    // Aggregate into time buckets
    this.aggregateToSecond(name, numValue, timestamp);
  }

  aggregateToSecond(name, value, timestamp) {
    const secondKey = Math.floor(new Date(timestamp).getTime() / 1000);
    const agg = this.getAggregator(name);

    if (agg.currentSecond !== secondKey) {
      // New second - flush previous bucket
      if (agg.secondBucket.count > 0) {
        this.getSecondly(name).push({
          timestamp: new Date(agg.currentSecond * 1000).toISOString(),
          avg: agg.secondBucket.sum / agg.secondBucket.count,
          min: agg.secondBucket.min,
          max: agg.secondBucket.max,
          count: agg.secondBucket.count
        });
        // Check if we need to roll up to minutely
        this.maybeRollupToMinute(name, agg.currentSecond);
      }
      // Reset bucket
      agg.currentSecond = secondKey;
      agg.secondBucket = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
    }

    // Accumulate into current bucket
    agg.secondBucket.sum += value;
    agg.secondBucket.min = Math.min(agg.secondBucket.min, value);
    agg.secondBucket.max = Math.max(agg.secondBucket.max, value);
    agg.secondBucket.count++;
  }
}
```

#### Memory Budget (100 watches, 24 hours)

| Tier | Points/Watch | Total Points | Estimated RAM |
|------|--------------|--------------|---------------|
| Raw (last 100) | 100 | 10,000 | ~1 MB |
| Secondly (1 hour) | 3,600 | 360,000 | ~36 MB |
| Minutely (24 hours) | 1,440 | 144,000 | ~14 MB |
| Hourly (7 days) | 168 | 16,800 | ~2 MB |
| **Total** | | **530,800** | **~53 MB** |

vs. unlimited raw: 200/sec × 3600 × 24 × 100 = **1.7 billion points** = **170 GB**

#### Query API with Resolution

```
GET /api/watches/:name/history?from=&to=&resolution=auto

resolution options:
  - raw      : Return raw points (only for < 1 min ranges)
  - 1s       : Return secondly aggregates
  - 1m       : Return minutely aggregates
  - 1h       : Return hourly aggregates
  - auto     : Auto-select based on time range (default)

Auto-resolution logic:
  - < 5 min   → raw (if available) or 1s
  - < 1 hour  → 1s
  - < 24 hour → 1m
  - > 24 hour → 1h
```

---

## Performance Strategies

### 1. Server-Side: Throttled Broadcasts (Already Implemented)
```javascript
// WATCH_THROTTLE_MS = 333 (~3 updates/sec per watch)
// Stores all values, broadcasts throttled
function throttledWatchBroadcast(roomId, packet) {
  // Store immediately to watchStore
  room.watchStore.set(packet.name, packet.value, packet.timestamp);

  // Throttle WebSocket broadcast
  if (timeSinceLast >= WATCH_THROTTLE_MS) {
    connectionManager.broadcastWatchToRoom(roomId, packet);
  }
}
```

### 2. Client-Side: RAF-Throttled Rendering
```typescript
// Coalesce updates, render at display refresh rate
const pendingUpdates = useRef(new Map());

useEffect(() => {
  let rafId: number;

  const flush = () => {
    if (pendingUpdates.current.size > 0) {
      updateCharts(pendingUpdates.current);
      pendingUpdates.current.clear();
    }
    rafId = requestAnimationFrame(flush);
  };

  rafId = requestAnimationFrame(flush);
  return () => cancelAnimationFrame(rafId);
}, []);
```

### 3. Data Decimation (LTTB Algorithm)
For large datasets, reduce points to match pixel width:
```typescript
const MAX_POINTS_PER_SERIES = 1000; // ~2x typical chart width

function getDisplayData(history: Point[], chartWidth: number) {
  const targetPoints = Math.min(chartWidth * 2, MAX_POINTS_PER_SERIES);
  return history.length > targetPoints
    ? lttb(history, targetPoints)
    : history;
}
```

### 4. Lazy Panel Rendering
Only fully render visible panels:
```typescript
function Panel({ panel }) {
  const { ref, inView } = useInView({ threshold: 0 });

  return (
    <div ref={ref}>
      {inView ? <FullPanel panel={panel} /> : <PanelPlaceholder />}
    </div>
  );
}
```

### 5. Expression Caching
Cache parsed expressions:
```typescript
const expressionCache = new Map<string, CompiledExpression>();

function evaluate(expr: string, values: Record<string, number>) {
  if (!expressionCache.has(expr)) {
    expressionCache.set(expr, compileExpression(expr));
  }
  return expressionCache.get(expr)!(values);
}

---

## Storage & Persistence

### Browser Storage (Auto-save)
```typescript
// localStorage keys per room
`smartinspect:metrics:${roomId}:dashboards`  // Dashboard configs
`smartinspect:metrics:${roomId}:active`       // Active dashboard ID
`smartinspect:metrics:ui`                     // Edit mode, etc.
```

### Project File Export
```typescript
// Added to project file structure
{
  "metrics": {
    "dashboards": [...],
    "activeDashboardId": "..."
  }
}
```

### Import/Export
- Export: Download dashboard JSON (config only, no data)
- Import: Upload JSON, validate, add to room

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Close drawer, exit fullscreen, cancel edit |
| `Arrow keys` | Move between panels (in edit mode) |

---

## Time Range Presets

| Label | Value |
|-------|-------|
| Last 5 minutes | `last5m` |
| Last 15 minutes | `last15m` |
| Last 30 minutes | `last30m` |
| Last 1 hour | `last1h` |
| Last 3 hours | `last3h` |

Custom absolute range picker available via "Custom" option.

---

## Empty States

### No Dashboards
```
┌─────────────────────────────────────────┐
│                                         │
│     📊 No dashboards yet                │
│                                         │
│     Create your first dashboard to      │
│     visualize watch metrics.            │
│                                         │
│     [+ Create Dashboard]                │
│                                         │
└─────────────────────────────────────────┘
```

### No Watches in Room
```
┌─────────────────────────────────────────┐
│                                         │
│     📭 No watch data available          │
│                                         │
│     Watches will appear here when your  │
│     application sends watch values.     │
│                                         │
│     See documentation for how to send   │
│     watch data from your app.           │
│                                         │
└─────────────────────────────────────────┘
```

### Empty Dashboard (no panels)
```
┌─────────────────────────────────────────┐
│                                         │
│     ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐     │
│     │                             │     │
│     │   + Add your first panel    │     │
│     │                             │     │
│     └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘     │
│                                         │
│     Choose a visualization type:        │
│     [📈 Time Series] [🔢 Stat]         │
│     [⏱ Gauge] [📊 Bar] [📋 Table]      │
│                                         │
└─────────────────────────────────────────┘
```

---

## Dependencies

```json
{
  "dependencies": {
    "uplot": "^1.6.30",
    "react-grid-layout": "^1.4.4"
  }
}
```

Total additional bundle: ~90KB minified

---

## Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Add Metrics tab to ViewTabs (always visible)
- [ ] Create metricsStore with localStorage persistence
- [ ] DashboardTabs component (create, rename, delete dashboards)
- [ ] DashboardToolbar (time presets, Live toggle, Edit mode)
- [ ] PanelGrid with react-grid-layout
- [ ] Panel wrapper (title bar, menu, resize handles)
- [ ] TimeSeriesPanel with uPlot
- [ ] Basic WatchAutocomplete (current watches only)
- [ ] PanelSettingsDrawer (slides from right)
- [ ] Fullscreen panel mode
- [ ] Auto-save to localStorage
- [ ] Visual polish to match existing UI quality

### Phase 2: All Panel Types
- [ ] StatPanel with sparkline background
- [ ] GaugePanel (circular)
- [ ] BarPanel (horizontal/vertical)
- [ ] TablePanel with popup chart drill-down
- [ ] Display options per panel type
- [ ] Unit formatting (ms, %, bytes, etc.)

### Phase 3: Transforms & Thresholds
- [ ] Expression parser and evaluator
- [ ] QueryEditor with expression input
- [ ] Function autocomplete (rate, avg, etc.)
- [ ] ThresholdEditor UI
- [ ] Threshold colors on all panel types
- [ ] Multi-series support in expressions

### Phase 4: Polish & Export
- [ ] Project file save/load
- [ ] Dashboard export/import (JSON)
- [ ] Dual Y-axis for time series
- [ ] Panel duplicate action
- [ ] Dashboard duplicate action
- [ ] Responsive layout for smaller screens
- [ ] Performance optimizations (lazy loading, decimation)

---

## Visual Design Notes

**Priority: Visual polish is the #1 requirement for v1.**

- Match existing SmartInspect UI patterns (colors, spacing, typography)
- Use existing Tailwind classes and CSS variables
- Panel headers should be subtle, not dominant
- Charts should feel integrated, not "embedded widgets"
- Smooth transitions for drawer, fullscreen, panel resize
- Loading states for data fetching
- Error states for failed queries
- Consistent iconography with rest of app

---

## Summary

This spec defines a "domestic Grafana" with:

1. **Per-room dashboards** stored in browser, exportable to project
2. **5 panel types**: Time Series, Stat, Gauge, Bar, Table
3. **Full transform pipeline** with text expressions (`rate(A) + rate(B)`)
4. **Independent time ranges** per panel with Live toggle
5. **Side drawer** for panel configuration
6. **Fullscreen mode** for detailed analysis
7. **Table drill-down** with popup charts
8. **Auto-save** with project export option
9. **Visual polish** as top priority

Built on uPlot (48KB) + react-grid-layout (40KB) for performance.
