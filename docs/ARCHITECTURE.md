# Architecture

System design, components, and data flow for SmartInspect Web Viewer.

## Technology Stack

### Frontend
- **React 18.2** - Component-based UI framework
- **TypeScript 5.3** - Type-safe development
- **Zustand 4.4** - Lightweight state management
- **AG Grid Community + Enterprise 34.3** - High-performance data grid with virtual scrolling
- **Tailwind CSS 3.4** - Utility-first styling with dark mode support
- **Vite 5.0** - Fast development server and build tool
- **date-fns 3.2** - Date formatting and manipulation
- **WebSocket API** - Real-time bidirectional communication

### Backend
- **Node.js 18+** - JavaScript runtime
- **Express 4.18** - HTTP server and REST API
- **ws (WebSocket) 8.16** - WebSocket server for real-time updates
- **better-sqlite3 12.5** - SQLite database for settings persistence
- **SmartInspect TCP Protocol** - Binary protocol parser for log intake

## Frontend Architecture

### Components (22 total, 8,300+ lines)

| Component | Lines | Purpose |
|-----------|-------|---------|
| `LogGrid.tsx` | 800+ | AG Grid log entry display with custom renderers |
| `FilterBar.tsx` | 600+ | Filter controls and playback buttons |
| `ViewTabs.tsx` | 550+ | Tab bar for predefined views with editor |
| `DetailPanel.tsx` | 500+ | Entry details with syntax-highlighted data viewer |
| `WatchPanel.tsx` | 450+ | Watch values table with live updates |
| `StreamPanel.tsx` | 400+ | High-frequency data streams display |
| `HighlightRulesPanel.tsx` | 380+ | Highlighting rules management UI |
| `HighlightRuleEditor.tsx` | 650+ | Rule editor with filter and style components |
| `ProjectDropdown.tsx` | 450+ | Project save/load/manage dropdown |
| `ViewEditor.tsx` | 400+ | View configuration modal |
| `RoomSelector.tsx` | 200+ | Room/project selection dropdown |
| `ServerInfoModal.tsx` | 450+ | Server information dialog with tabs |
| `SettingsPanel.tsx` | 300+ | Application settings UI |
| `StatusBar.tsx` | 250+ | Connection and stats display |
| `TimestampFilter.tsx` | 200+ | Date/time range picker |
| `ConfirmDialog.tsx` | 150+ | Reusable confirmation dialog |
| `Tooltip.tsx` | 100+ | Hover tooltips |
| `ContextMenu.tsx` | 150+ | Right-click context menu |
| Plus 4 more utility components | | |

### Custom Hooks (7 hooks)

- **`useWebSocket.ts`** - WebSocket connection with reconnection and batching
- **`useLayout.ts`** - Layout persistence to localStorage
- **`useViewsSync.ts`** - Sync views with server
- **`useProjectPersistence.ts`** - Project save/load logic
- **`useSettings.ts`** - Client settings management
- **`useServerSettings.ts`** - Server settings sync
- **`usePWAInstall.ts`** - Progressive Web App installation prompt

### State Management (Zustand)

**`logStore.ts`** (500+ lines) - Central state containing:
- Log entries array
- Filter state
- Highlight rules
- Views collection
- Watch values
- Stream channels
- Theme and layout settings
- All state setters and derived selectors

## Backend Architecture

### Modules (7 modules, 4,100+ lines)

| Module | Lines | Purpose |
|--------|-------|---------|
| `index.js` | 1100+ | Main server: HTTP API, WebSocket server, static file serving |
| `tcp-server.js` | 289 | SmartInspect TCP protocol listener (port 4229) |
| `packet-parser.js` | 427 | Binary protocol parsing and log entry construction |
| `storage.js` | 520 | In-memory data structures (ring buffer, watch store, stream store) |
| `room-manager.js` | 285 | Multi-room isolation and client tracking |
| `connection-manager.js` | 466 | WebSocket client registry and message broadcasting |
| `settings-db.js` | 584 | SQLite persistence for settings and projects |
| `query-api.js` | 431 | REST API endpoints with filter execution |

## Data Flow

```
┌──────────────────┐
│  Node.js Apps    │
│  (Logger Clients)│
└────────┬─────────┘
         │ TCP (SmartInspect binary protocol, port 4229)
         ▼
┌──────────────────┐
│  TCP Server      │ ← Accepts connections, authenticates clients
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Packet Parser   │ ← Decodes binary packets, constructs LogEntry objects
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Room Manager    │ ← Routes to correct room namespace
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│         Storage              │
│  ┌────────────────────────┐ │
│  │  LogRingBuffer         │ │ ← Circular buffer with indexes
│  │  WatchStore            │ │ ← Watch value storage
│  │  StreamStore           │ │ ← Stream channel data
│  │  MethodContextTracker │ │ ← Call stack tracking
│  └────────────────────────┘ │
└──────────┬───────────────────┘
           │
           │ Broadcast via WebSocket
           ▼
┌──────────────────────┐
│ Connection Manager   │ ← Manages WebSocket clients
└──────────┬───────────┘
           │
           │ Batched messages every 100ms
           ▼
┌──────────────────────┐
│   Web Browsers       │
│   (React App)        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Zustand Store      │ ← Central state management
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  React Components    │ ← UI rendering
│  (AG Grid, Panels)   │
└──────────────────────┘
```

## Key Data Structures

### LogEntry

```typescript
{
  id: number,                    // Unique entry ID
  type: number,                  // Packet type
  logEntryType: number,          // LogEntryType enum (Message, Warning, etc.)
  appName: string,               // Application name
  sessionName: string,           // Session name
  title: string,                 // Entry title
  hostName: string,              // Host name
  processId: number,             // Process ID
  threadId: number,              // Thread ID
  timestamp: string,             // ISO 8601 timestamp
  receivedAt: string,            // Server received timestamp
  level: number,                 // 0-5 (Debug to Fatal)
  color: number,                 // RGBA color value
  data: string | object,         // Entry data (varies by type)
  dataEncoding: string,          // Data encoding type
  processFlowType: number,       // Process flow type
  depth: number,                 // Call stack depth
  parentId: number | null,       // Parent entry ID
  context: string[],             // Method call chain
}
```

### Filter

```typescript
{
  sessions: { mode: 'list' | 'text', list: string[], text: TextFilter },
  levels: { selected: number[], inverse: boolean },
  title: TextFilter,
  message: TextFilter,
  timeRange: { from: Date | null, to: Date | null },
  appNames: string[],
  hostNames: string[],
  processIds: number[],
  threadIds: number[],
}
```

### View

```typescript
{
  id: string,
  name: string,
  description: string,
  filter: Filter,
  highlightRules: HighlightRule[],
  autoScroll: boolean,
  color: string,
  layout: object,
}
```

### HighlightRule

```typescript
{
  id: string,
  name: string,
  enabled: boolean,
  priority: number,
  filters: HighlightFilter[],
  style: {
    backgroundColor: string,
    color: string,
    fontWeight: 'normal' | 'bold',
  },
}
```

### Project

```typescript
{
  id: string,
  name: string,
  description: string,
  createdBy: string,
  createdAt: string,
  updatedAt: string,
  isShared: boolean,
  views: View[],
  activeViewId: string,
  panelSizes: object,
  panelVisibility: object,
  limits: object,
  theme: 'light' | 'dark',
}
```

## Storage Mechanisms

### Client-Side (Browser)
- **localStorage** - Layout settings, working project state, user preferences
- **sessionStorage** - Temporary UI state
- **In-memory** - Log entries, filters, current view state

### Server-Side
- **SQLite** - Persistent storage for:
  - Projects (per room, per user)
  - Server settings
  - User preferences
- **In-memory** - Active log buffers, watch values, stream data (per room)

## Performance Optimizations

### Frontend
- **Virtual scrolling** - AG Grid renders only visible rows
- **Batched updates** - WebSocket messages batched every 100ms
- **Memoization** - React.memo and useMemo for expensive computations
- **Debounced filters** - Filter inputs debounced to reduce re-renders
- **Code splitting** - Lazy-loaded components where appropriate

### Backend
- **Ring buffer** - O(1) insertions with configurable size limit
- **Indexed storage** - Fast lookups by session, level, timestamp
- **Message batching** - WebSocket broadcasts batched to reduce network overhead
- **Connection pooling** - Efficient WebSocket client management
