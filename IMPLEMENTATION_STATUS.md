# SmartInspect Web Viewer - Implementation Status

## Current Implementation (Updated)

### COMPLETED

| Feature | Status | Notes |
|---------|--------|-------|
| Web-based viewer server | Done | TCP 4229, HTTP/WS 3000 |
| Ring buffer storage | Done | 100K entries default |
| Basic filtering (session, level, text) | Done | Works in UI |
| Inverse filter matching | Done | Checkbox in filter bar |
| Time range filtering | Done | API supports from/to |
| Watch values display | Done | Table with filter & sort |
| Real-time streaming | Done | WebSocket to browsers |
| Multiple client connections | Done | TCP + WebSocket |
| AG Grid Enterprise setup | Done | Virtual scrolling ready |
| REST API for queries | Done | /api/logs, /api/watches |
| Auto-scroll option | Done | Toggle button |
| Clear logs button | Done | In filter bar |
| Pause/Resume streaming | Done | Toggle button |
| Entry type icons | Done | All types have colored icons |
| All columns (App, Host, PID, TID) | Done | Can show/hide via sidebar |
| Column chooser | Done | AG Grid sidebar |
| Layout save/load | Done | Export/Import/Reset |
| **Views (predefined filters)** | Done | Tab system with create/edit/delete |
| **Detail panel** | Done | Shows full entry details when selected |
| **Stream panel** | Done | Separate panel for high-frequency data |
| **Highlight rules** | Done | User-configurable styling rules |
| **Watch table with filter** | Done | Sortable, filterable table |
| **User-controlled styling** | Done | No auto-styling, only user rules |

### NOT YET IMPLEMENTED

| Feature | Priority | Effort |
|---------|----------|--------|
| WebSocket/HTTPS client library | High | Medium |
| MCP server for LLM agents | Medium | Medium |
| EnterMethod/LeaveMethod context UI | High | Medium |
| Views persistence to localStorage | Low | Low |
| Highlight rules persistence | Low | Low |

---

## Feature Details

### Views System
- Create custom views with predefined filters
- Each view can filter by: sessions, levels, title pattern, message pattern
- Views appear as tabs for quick switching
- Double-click to edit a view
- "All Logs" default view shows everything

### Detail Panel
- Shows when a log entry is clicked
- Displays all metadata: timestamp, type, level, session, app, host, PID, TID
- Shows full data content with proper formatting:
  - JSON highlighting for Object type
  - Code highlighting for Source type
  - Hex dump for Binary type
  - Plain text for others
- Shows call context for EnterMethod/LeaveMethod

### Stream Panel
- Separate panel for high-frequency streaming data
- Multiple channels supported
- Auto-scroll with toggle
- Filter stream data by text
- Configurable buffer size (default 1000)
- Clear individual channels or all streams

### Highlight Rules
- User-controlled row styling (no automatic styling)
- Create rules with conditions:
  - Field: level, session, app, title, entry type
  - Operator: equals, contains, regex
- Custom styling:
  - Background color
  - Text color
  - Font weight (normal/bold)
- Priority system for rule ordering
- Enable/disable individual rules
- Color presets for quick setup

### Watch Panel
- Table view with columns: Name, Value, Updated
- Filter by watch name or value
- Sortable by any column
- Clear all watches button
- Shows total and filtered count

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web Browser                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     React Client                          │  │
│  │  ┌─────────┐  ┌────────┐  ┌────────┐  ┌───────────────┐  │  │
│  │  │ ViewTabs│  │FilterBar│ │LogGrid │  │ Right Panels  │  │  │
│  │  └─────────┘  └────────┘  └────────┘  │ ┌───────────┐ │  │  │
│  │                                        │ │DetailPanel│ │  │  │
│  │  ┌────────────────────────────────┐   │ └───────────┘ │  │  │
│  │  │        Stream Panel            │   │ ┌───────────┐ │  │  │
│  │  └────────────────────────────────┘   │ │WatchPanel │ │  │  │
│  │                                        │ └───────────┘ │  │  │
│  │                                        └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                               │                                 │
│                          WebSocket                              │
└───────────────────────────────┼─────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                          Server                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ HTTP Server  │  │   WS Server  │  │    TCP Server        │  │
│  │ (REST API)   │  │ (Real-time)  │  │ (SmartInspect Proto) │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                │                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Log Ring Buffer                        │  │
│  │  - Session indexing                                       │  │
│  │  - Level indexing                                         │  │
│  │  - Method context tracking                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                               TCP
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                    Node.js Applications                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Backend    │  │   Worker     │  │      Service         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Start the Server
```bash
cd web-viewer/server
npm install
npm run dev
```

### Start the Client (Development)
```bash
cd web-viewer/client
npm install
npm run dev
```

### Test with Live Logs
```bash
cd web-viewer
node test-live.js
```

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| HTTP_PORT | 3000 | Web UI and WebSocket port |
| TCP_PORT | 4229 | TCP port for log intake |
| SI_AUTH_TOKEN | (none) | Optional auth token |
| MAX_ENTRIES | 100000 | Maximum log entries |

---

## Files Structure

```
web-viewer/
├── server/
│   └── src/
│       ├── index.js              # Main server entry
│       ├── tcp-server.js         # SmartInspect TCP protocol
│       ├── packet-parser.js      # Binary packet parsing
│       ├── storage.js            # Ring buffer & watch store
│       └── connection-manager.js # WebSocket management
├── client/
│   └── src/
│       ├── App.tsx               # Main React app
│       ├── components/
│       │   ├── LogGrid.tsx       # AG Grid log display
│       │   ├── FilterBar.tsx     # Filter controls
│       │   ├── ViewTabs.tsx      # View tab management
│       │   ├── DetailPanel.tsx   # Entry detail view
│       │   ├── WatchPanel.tsx    # Watch values table
│       │   ├── StreamPanel.tsx   # Stream data panel
│       │   ├── HighlightRulesPanel.tsx # Rule configuration
│       │   └── StatusBar.tsx     # Connection status
│       ├── hooks/
│       │   ├── useWebSocket.ts   # WebSocket connection
│       │   └── useLayout.ts      # Layout persistence
│       └── store/
│           └── logStore.ts       # Zustand state (Views, Rules, etc.)
├── test-live.js                  # Live logging test script
└── README.md
```
