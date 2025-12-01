# SmartInspect Web Viewer

> A modern, web-based log viewer for SmartInspect that replaces the Windows desktop application with real-time streaming, advanced filtering, and enterprise-grade performance.

![SmartInspect Web Viewer - Main Interface](docs/images/main-interface-screenshot.png)
*Real-time log viewing with multi-session support, advanced filtering, watch values panel, and customizable views*

---

## Overview

SmartInspect Web Viewer is a **production-ready, enterprise-grade log viewing application** built with React and Node.js. It provides real-time log streaming from multiple applications, advanced filtering capabilities, customizable views, and high-performance rendering of 100K+ log entries using AG Grid Enterprise.

**Key Highlights:**
- 🚀 Real-time streaming via WebSocket with batched updates
- 📊 AG Grid Enterprise for virtual scrolling and high performance
- 🎯 Advanced filtering: sessions, levels, text patterns, time ranges
- 🎨 Customizable highlighting rules with priority system
- 💾 Project persistence with save/load/export/import
- 🌓 Dark/light theme support
- 🔍 Watch panel for live variable monitoring
- 📡 Stream panel for high-frequency data channels
- 🏢 Multi-room support for project isolation
- 🔧 Resizable panels and customizable layouts

---

## Features

### Core Log Viewing
- **Real-time streaming**: Logs appear instantly as applications send them via TCP
- **AG Grid Enterprise display**: Virtual scrolling handles 100K+ log entries with smooth performance
- **Multi-client support**: Multiple applications can send logs simultaneously
- **Auto-scroll control**: Automatically scroll to bottom, disable by scrolling up
- **Pause/Resume**: Control log streaming without losing connection
- **Circular buffer**: Configurable maximum entries (default: 100,000)

### Filtering & Search
- **Session filtering**: Filter by session name (Database, API, Authentication, UI, etc.)
- **Level filtering**: Toggle Debug, Verbose, Message, Warning, Error, Fatal levels with inverse option
- **Text search**: Filter by title and message with multiple operators:
  - Contains (case-sensitive or insensitive)
  - Equals (exact match)
  - Regex (with pattern support)
  - Inverse matching (exclude matches)
- **Time range filtering**: Filter by date/timestamp range with date picker
- **Multi-field filtering**: Filter by app name, host name, process ID, thread ID
- **List + Text dual mode**: Session filter supports both list selection AND text pattern
- **Advanced operators**: Supports contains, equals, regex, inverse for all text fields

### View Management
- **Predefined Views (Tabs)**: Create custom views with saved filter combinations
- **Quick switching**: Click view tabs for instant access to filtered perspectives
- **View editor**: Double-click tabs to edit name, filters, and settings
- **View persistence**: Views saved per room and synced across sessions
- **Default "All Logs" view**: Always available, shows unfiltered logs
- **Color-coded tabs**: Assign colors to tabs for visual organization
- **Drag-to-reorder**: Reorder view tabs by dragging (planned)
- **Per-view settings**: Each view can have its own auto-scroll and highlight rules

### Entry Details & Data Visualization
- **Detail Panel**: Click any log entry to see full details in side panel
- **Rich data display**:
  - **JSON**: Syntax highlighting and pretty-printing for Object entries
  - **Source code**: Formatted display for Source entries with language detection
  - **Binary data**: Hex dump view for Binary entries
  - **Plain text**: Readable display for Text entries
- **Metadata display**: Timestamp, type, level, session, app, host, PID, TID
- **Call context tracking**: Shows method call chain for EnterMethod/LeaveMethod entries
- **Entry type badges**: Visual indicators for entry types (Message, Warning, Error, etc.)
- **Copy to clipboard**: Copy entry data with one click

### Watch Values Monitoring
- **Watch Panel**: Dedicated panel showing real-time watch values from applications
- **Live updates**: Values update instantly as applications send new data
- **Flash animation**: Visual feedback when values change (color pulse)
- **Table view**: Columns for Name, Value, Updated timestamp
- **Filterable**: Search watch values by name or content
- **Sortable**: Click column headers to sort by any field
- **Clear function**: Clear all watches with one click
- **Resizable**: Drag panel border to resize
- **Collapsible**: Toggle panel visibility

### Stream Panel (High-Frequency Data)
- **Separate panel**: Dedicated space for streaming data channels
- **Multi-channel support**: Multiple independent data streams (e.g., metrics, telemetry)
- **Channel tabs**: Switch between different stream channels
- **Auto-scroll option**: Enable/disable auto-scroll to bottom per channel
- **Text filtering**: Filter stream data by content
- **Configurable buffer**: Default 1000 entries per stream
- **Clear controls**: Clear individual channels or all streams
- **Dedicated view**: Full-screen stream view available

### Highlighting & Styling Rules
- **User-controlled highlighting**: No automatic styling, all rules are explicitly defined
- **Flexible filter conditions**:
  - **Fields**: level, session, app, title, entry type, process ID, host name
  - **Operators**: equals, contains, regex, inverse
  - **Logical combinations**: Multiple conditions per rule
- **Custom styling per rule**:
  - Background color (8 preset colors + custom)
  - Text color (8 preset colors + custom)
  - Font weight (normal, bold)
  - Font style (italic support)
- **Priority system**: Rules execute in order, first match wins
- **Enable/disable**: Toggle individual rules without deleting
- **Rule editor**: Visual editor with color pickers and live preview
- **Import/Export**: Share highlighting rules via JSON

### Layout & Customization
- **Resizable panels**: Drag borders to resize detail panel and watch panel
- **Collapsible panels**: Show/hide panels to maximize log viewing area
- **Column chooser**: AG Grid sidebar for show/hide log grid columns
- **Column ordering**: Reorder and resize columns with drag-and-drop
- **Column pinning**: Pin columns to left/right for fixed visibility
- **Dark/Light theme**: Toggle between dark and light modes with smooth transition
- **Layout persistence**: Panel sizes and column widths saved to localStorage
- **Export/Import/Reset**: Save complete layout configurations to JSON and restore them
- **Responsive design**: Adapts to different screen sizes

### Project Management
- **Project persistence**: Save complete project state (views, settings, layouts, highlights)
- **Save as new**: Save current configuration with a new project name
- **Load project**: Switch between saved projects from dropdown
- **Auto-save**: Optional automatic project saving on changes
- **Export to JSON**: Export projects as `.siwv` files
- **Import from file**: Import projects from JSON files
- **Default reset**: Restore to original default state
- **Project indicator**: Header shows current project name with unsaved changes indicator
- **Unsaved changes warning**: Prompts to save when switching projects with unsaved changes

### Room/Isolation
- **Multi-room support**: Separate log namespaces for different projects or teams
- **Room selection**: Switch between rooms via header dropdown
- **Project-per-room**: Each room maintains independent project configurations
- **Isolated storage**: Views, highlights, watches, and streams are per-room
- **Room statistics**: Track connections, entries, and activity per room

### Control Features
- **Pause/Resume streaming**: Stop incoming logs without disconnecting
- **Clear logs**: Remove all entries from buffer with confirmation
- **Status bar**: Shows connection status, entry count, and server stats
- **Server info modal**: Display server version, uptime, memory usage, connection details
- **Settings panel**: Configure application behavior and preferences
- **Connection indicator**: Visual feedback for WebSocket connection state

---

## Architecture

### Technology Stack

**Frontend:**
- **React 18.2** - Component-based UI framework
- **TypeScript 5.3** - Type-safe development
- **Zustand 4.4** - Lightweight state management
- **AG Grid Community + Enterprise 34.3** - High-performance data grid with virtual scrolling
- **Tailwind CSS 3.4** - Utility-first styling with dark mode support
- **Vite 5.0** - Fast development server and build tool
- **date-fns 3.2** - Date formatting and manipulation
- **WebSocket API** - Real-time bidirectional communication

**Backend:**
- **Node.js 18+** - JavaScript runtime
- **Express 4.18** - HTTP server and REST API
- **ws (WebSocket) 8.16** - WebSocket server for real-time updates
- **better-sqlite3 12.5** - SQLite database for settings persistence
- **SmartInspect TCP Protocol** - Binary protocol parser for log intake

### Frontend Components

The client application consists of **22 React components** totaling over **8,300 lines of TypeScript code**:

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

**Key Hooks (7 custom hooks):**
- `useWebSocket.ts` - WebSocket connection with reconnection and batching
- `useLayout.ts` - Layout persistence to localStorage
- `useViewsSync.ts` - Sync views with server
- `useProjectPersistence.ts` - Project save/load logic
- `useSettings.ts` - Client settings management
- `useServerSettings.ts` - Server settings sync
- `usePWAInstall.ts` - Progressive Web App installation prompt

**State Management (Zustand):**
- `logStore.ts` (500+ lines) - Central state with:
  - Log entries array
  - Filter state
  - Highlight rules
  - Views collection
  - Watch values
  - Stream channels
  - Theme and layout settings
  - All state setters and derived selectors

### Backend Architecture

The server consists of **7 core modules** totaling over **4,100 lines of JavaScript code**:

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

### Data Flow

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

### Key Data Structures

**LogEntry:**
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

**Filter:**
```typescript
{
  sessions: { mode: 'list' | 'text', list: string[], text: TextFilter },
  levels: { selected: number[], inverse: boolean },
  title: TextFilter,
  message: TextFilter,
  timeRange: { from: Date | null, to: Date | null },
  appNames: string[],
  hostNames: string[],
  // ... other fields
}
```

**View:**
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

**HighlightRule:**
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

---

## Getting Started

### Requirements

- **Node.js 18+** (for both server and client)
- **npm or yarn**
- Modern web browser with WebSocket support (Chrome, Firefox, Safari, Edge)

### Installation

1. **Clone the repository** (or navigate to the project directory):
   ```bash
   cd /path/to/smartinspect-web-viewer
   ```

2. **Install dependencies**:
   ```bash
   # Install all dependencies (root, server, client)
   npm install
   ```

### Development Setup

**Option 1: Start both server and client together (recommended)**

```bash
npm run dev
```

This will start both the backend server and frontend development server concurrently.

**Option 2: Start server and client separately**

**1. Start the Backend Server:**
```bash
cd server
npm install
npm run dev
```

Server will start on:
- **HTTP/WebSocket**: `http://localhost:3000` (Web UI)
- **TCP**: port `4229` (Log intake from applications)

**2. Start the Frontend Development Server:**
```bash
cd client
npm install
npm run dev
```

Frontend will start on: `http://localhost:5173`

**3. Open in browser:**
```
http://localhost:5173
```

### Connecting Logger Applications

Update your SmartInspect logger to connect to the web viewer:

**JavaScript/Node.js:**
```javascript
const { SmartInspect } = require('smartinspect');

const si = new SmartInspect('My Application');

await si.connect({
    host: 'localhost',  // Web viewer host
    port: 4229,         // Web viewer TCP port
    appName: 'My App'   // Application name
});

// Send logs
si.log('Application started');
si.warn('This is a warning');
si.error('An error occurred');

// Create named sessions
const dbSession = si.getSession('Database');
dbSession.logMessage('Connected to database');
dbSession.logDebug('Query executed: SELECT * FROM users');

// Send watch values
si.mainSession.watch('config.timeout', 5000);
si.mainSession.watch('app.version', '2.3.1');
si.mainSession.watch('users.active', 42);
```

**Other Languages:**
Use the SmartInspect library for your language and configure the TCP connection to point to `localhost:4229`.

### WSL (Windows Subsystem for Linux) Notes

When running the server in WSL but accessing from Windows browser:

1. **Server must bind to all interfaces:**
   ```bash
   npm run dev -- --host 0.0.0.0
   ```

2. **Find WSL network IP:**
   ```bash
   ip addr show eth0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}'
   ```

3. **Access via network IP** (NOT `localhost`):
   ```
   http://172.17.67.169:5173/  (use your actual IP)
   ```

### Production Build

**1. Build the client:**
```bash
cd client
npm run build
```

This creates optimized production files in `client/dist/`.

**2. Start the production server:**
```bash
cd ../server
npm start
```

The server will serve the built client on port 3000:
```
http://localhost:3000
```

### Environment Variables

Configure the server with environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | 3000 | Web UI and WebSocket port |
| `TCP_PORT` | 4229 | TCP port for log intake |
| `SI_AUTH_TOKEN` | (none) | Optional auth token for TCP clients |
| `SI_AUTH_REQUIRED` | false | Require auth for all TCP connections |
| `MAX_ENTRIES` | 100000 | Maximum log entries in memory buffer |
| `NODE_ENV` | development | Environment (development/production) |

**Example:**
```bash
HTTP_PORT=8080 TCP_PORT=4230 MAX_ENTRIES=50000 npm run dev
```

---

## API Reference

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Server status, uptime, memory, connections |
| `/api/logs` | GET | Query logs with filters (paginated) |
| `/api/logs` | DELETE | Clear all logs from buffer |
| `/api/logs/since/:id` | GET | Get logs since a given entry ID |
| `/api/sessions` | GET | List sessions with entry counts |
| `/api/watches` | GET | Current watch values |
| `/api/watches` | DELETE | Clear all watches |
| `/api/streams` | GET | List stream channels |
| `/api/streams/:channel` | GET | Get stream data for channel |
| `/api/rooms` | GET | List available rooms |
| `/api/server/connection-info` | GET | Network interfaces and connection strings |
| `/api/settings/:room/:user/:key` | GET | Get setting value |
| `/api/settings/:room/:user/:key` | POST | Set setting value |
| `/api/projects/:room/:user` | GET | List user projects |
| `/api/projects/:room/:user/:id` | GET | Get project by ID |
| `/api/projects/:room/:user` | POST | Create new project |
| `/api/projects/:room/:user/:id` | PUT | Update project |
| `/api/projects/:room/:user/:id` | DELETE | Delete project |

### Query Parameters for `/api/logs`

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `sessions` | string | Comma-separated session names | `sessions=Database,API` |
| `levels` | string | Comma-separated level numbers (0-5) | `levels=3,4` (Warning, Error) |
| `levelInverse` | boolean | Invert level matching | `levelInverse=true` |
| `from` | ISO date | Start time filter | `from=2024-01-01T00:00:00Z` |
| `to` | ISO date | End time filter | `to=2024-01-31T23:59:59Z` |
| `between` | string | Date range "from,to" | `between=2024-01-01,2024-01-31` |
| `title` | string | Title exact/contains match | `title=Error` |
| `titlePattern` | string | Title regex pattern | `titlePattern=^Error.*timeout` |
| `titleOperator` | string | Title operator (contains/equals/regex) | `titleOperator=contains` |
| `titleCaseSensitive` | boolean | Case-sensitive title matching | `titleCaseSensitive=true` |
| `message` | string | Message contains search | `message=database` |
| `messagePattern` | string | Message regex pattern | `messagePattern=SELECT.*FROM` |
| `messageOperator` | string | Message operator | `messageOperator=regex` |
| `inverse` | boolean | Invert pattern matching | `inverse=true` |
| `appNames` | string | Comma-separated app names | `appNames=WebApp,MobileApp` |
| `hostNames` | string | Comma-separated host names | `hostNames=server-01,server-02` |
| `processIds` | string | Comma-separated process IDs | `processIds=1234,5678` |
| `offset` | number | Pagination offset | `offset=100` |
| `limit` | number | Max results (default: 100, max: 1000) | `limit=500` |

**Example query:**
```bash
curl "http://localhost:3000/api/logs?sessions=Database&levels=3,4&from=2024-01-01T00:00:00Z&limit=50"
```

### WebSocket Protocol

**Connect to:** `ws://localhost:3000/ws`

**Messages from server:**

| Type | Data | Description |
|------|------|-------------|
| `init` | `{ stats, watches, sessions, rooms, ... }` | Initial state on connection |
| `entries` | `LogEntry[]` | New log entries (batched every 100ms) |
| `watch` | `{ name, value, timestamp }` | Watch value update |
| `stream` | `{ channel, data, timestamp, index }` | Stream data entry |
| `control` | `{ command, ... }` | Control message (clear, pause, etc.) |
| `stats` | `{ entryCount, sessionCount, ... }` | Server statistics update |

**Messages to server:**

| Type | Data | Description |
|------|------|-------------|
| `pause` | - | Pause log streaming |
| `resume` | - | Resume log streaming |
| `getSince` | `{ sinceId }` | Request entries since ID |
| `selectRoom` | `{ room }` | Switch to different room |

**Example WebSocket client:**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  console.log('Connected to SmartInspect viewer');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'init':
      console.log('Initial state:', message.data);
      break;
    case 'entries':
      console.log('New entries:', message.data);
      break;
    case 'watch':
      console.log('Watch update:', message.data);
      break;
  }
};

// Pause streaming
ws.send(JSON.stringify({ type: 'pause' }));

// Resume streaming
ws.send(JSON.stringify({ type: 'resume' }));
```

---

## Configuration

### Package.json Scripts

**Root workspace:**
```json
{
  "scripts": {
    "dev": "concurrently npm:dev:server npm:dev:client",
    "dev:server": "npm run dev -w server",
    "dev:client": "npm run dev -w client",
    "build": "npm run build -w client && npm run build -w server",
    "start": "npm run start -w server"
  }
}
```

**Server:**
```json
{
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js"
  }
}
```

**Client:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  }
}
```

### Log Level Values

| Level | Value | Name | Description |
|-------|-------|------|-------------|
| 0 | Debug | Debug | Detailed debug information |
| 1 | Verbose | Verbose | Verbose output for diagnostics |
| 2 | Message | Message | Regular informational messages |
| 3 | Warning | Warning | Warning messages |
| 4 | Error | Error | Error messages |
| 5 | Fatal | Fatal | Fatal error messages |
| 6 | Control | Control | Control messages (internal) |

### Log Entry Type Values

| Value | Name | Description |
|-------|------|-------------|
| 0 | Separator | Visual separator |
| 1 | EnterMethod | Method entry point |
| 2 | LeaveMethod | Method exit point |
| 3 | ResetCallstack | Reset call stack tracking |
| 100 | Message | Regular message |
| 101 | Warning | Warning message |
| 102 | Error | Error message |
| 103 | InternalError | Internal error |
| 104 | Comment | Comment entry |
| 105 | VariableValue | Variable value |
| 106 | Checkpoint | Checkpoint marker |
| 107 | Debug | Debug message |
| 108 | Verbose | Verbose message |
| 109 | Fatal | Fatal error |
| 110 | Conditional | Conditional entry |
| 111 | Assert | Assertion entry |
| 200 | Text | Text data |
| 201 | Binary | Binary data |
| 202 | Graphic | Graphic/image data |
| 203 | Source | Source code |
| 204 | Object | Object/JSON data |
| 205 | WebContent | Web content |
| 206 | System | System information |
| 207 | MemoryStatistic | Memory statistics |
| 208 | DatabaseResult | Database result |
| 209 | DatabaseStructure | Database structure |

---

## Project Structure

```
web-viewer/
├── client/                         # React frontend application
│   ├── src/
│   │   ├── App.tsx                # Main application layout with panels
│   │   ├── main.tsx               # Application entry point
│   │   ├── components/            # 22 React components
│   │   │   ├── LogGrid.tsx        # AG Grid log display
│   │   │   ├── FilterBar.tsx      # Filter controls
│   │   │   ├── ViewTabs.tsx       # View tab bar
│   │   │   ├── DetailPanel.tsx    # Entry details panel
│   │   │   ├── WatchPanel.tsx     # Watch values panel
│   │   │   ├── StreamPanel.tsx    # Stream data panel
│   │   │   ├── HighlightRulesPanel.tsx
│   │   │   ├── HighlightRuleEditor.tsx
│   │   │   ├── ProjectDropdown.tsx
│   │   │   ├── RoomSelector.tsx
│   │   │   ├── ServerInfoModal.tsx
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   └── ... (9 more components)
│   │   ├── hooks/                 # Custom React hooks
│   │   │   ├── useWebSocket.ts    # WebSocket connection
│   │   │   ├── useLayout.ts       # Layout persistence
│   │   │   ├── useViewsSync.ts    # View synchronization
│   │   │   ├── useProjectPersistence.ts
│   │   │   ├── useSettings.ts
│   │   │   ├── useServerSettings.ts
│   │   │   └── usePWAInstall.ts
│   │   ├── store/
│   │   │   └── logStore.ts        # Zustand state management
│   │   └── services/
│   │       ├── earlyWebSocket.ts  # Early WebSocket init
│   │       └── colorUtils.ts      # Color manipulation
│   ├── public/                     # Static assets
│   ├── index.html                  # HTML template
│   ├── package.json
│   ├── tsconfig.json               # TypeScript configuration
│   ├── vite.config.ts              # Vite build configuration
│   └── tailwind.config.js          # Tailwind CSS configuration
├── server/                         # Node.js backend application
│   ├── src/
│   │   ├── index.js               # Main server entry (HTTP, WebSocket)
│   │   ├── tcp-server.js          # TCP protocol listener (port 4229)
│   │   ├── packet-parser.js       # SmartInspect binary protocol parser
│   │   ├── storage.js             # Ring buffer and data structures
│   │   ├── room-manager.js        # Multi-room isolation
│   │   ├── connection-manager.js  # WebSocket client management
│   │   ├── settings-db.js         # SQLite settings persistence
│   │   └── query-api.js           # REST API endpoints
│   ├── data/                       # SQLite database files
│   │   └── smartinspect.db
│   ├── package.json
│   ├── test-continuous.js         # Continuous log generator
│   ├── test-logging.js            # Basic logging test
│   ├── test-live.js               # Live streaming test
│   └── test-stream.js             # Stream data test
├── patches/                        # Package patches (if any)
├── package.json                    # Root workspace configuration
├── README.md                       # This file
├── IMPLEMENTATION_STATUS.md        # Feature implementation status
└── AG_GRID_PATCHES.md             # AG Grid customization notes
```

---

## Testing & Development

### Test Scripts

The project includes several test scripts for development:

| Script | Location | Purpose |
|--------|----------|---------|
| `test-continuous.js` | `server/` | Generates continuous realistic log data (~30 msg/min) |
| `test-logging.js` | Root | Basic logging test with various levels |
| `test-live.js` | Root | Live streaming test with multiple sessions |
| `test-stream.js` | Root | Stream data test for high-frequency channels |

**Running tests:**

```bash
# Continuous log generation (runs indefinitely)
cd server
node test-continuous.js

# Basic logging test
node test-logging.js

# Live streaming test
node test-live.js

# Stream data test
node test-stream.js
```

### Development Tools

**Recommended:**
- **React Developer Tools** - Browser extension for React debugging
- **Redux DevTools** - For Zustand state inspection (compatible)
- **AG Grid DevTools** - Optional AG Grid debugging extension
- **VS Code** with TypeScript and Tailwind CSS extensions

**Browser DevTools:**
- Use Network tab to monitor WebSocket messages
- Use Console for application logs
- Use React DevTools to inspect component tree

---

## Additional Documentation

- **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - Feature implementation checklist and status
- **[AG_GRID_PATCHES.md](AG_GRID_PATCHES.md)** - AG Grid scroll behavior customizations

---

## License

[Add license information here]

---

## Contributing

[Add contribution guidelines here]

---

**Built with ❤️ using React, Node.js, and AG Grid Enterprise**
