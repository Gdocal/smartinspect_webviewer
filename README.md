# SmartInspect Web Viewer

> **The modern, web-based real-time log viewer and metrics dashboard** - A powerful replacement for the Windows desktop application with real-time streaming, advanced filtering, Prometheus-style metrics, and enterprise-grade performance.

![SmartInspect Web Viewer - Main Interface](docs/images/main-interface-screenshot.png)

## Why SmartInspect Web Viewer?

Traditional logging tools force you to choose between **power** and **usability**. SmartInspect Web Viewer gives you both:

- **Real-time visibility** - See logs as they happen, not minutes later
- **Cross-platform** - Works in any modern browser, no installation required
- **Team collaboration** - Multi-room isolation for different projects and teams
- **High performance** - Handles 100,000+ log entries without breaking a sweat
- **Metrics & Dashboards** - Prometheus-style metrics with Grafana-inspired visualizations
- **Zero configuration** - Connect your app and start logging in seconds

---

## Table of Contents

- [Quick Start](#quick-start)
- [Core Features](#core-features)
  - [Real-Time Log Viewing](#1-real-time-log-viewing)
  - [Advanced Filtering & Views](#2-advanced-filtering--views)
  - [Watch Panel - Live Variable Monitoring](#3-watch-panel---live-variable-monitoring)
  - [Prometheus-Style Labels](#4-prometheus-style-labels)
  - [Metrics Dashboards](#5-metrics-dashboards)
  - [Stream Channels](#6-stream-channels---high-frequency-data)
  - [Context Tracking & Thread Lines](#7-context-tracking--thread-lines)
  - [Highlighting Rules](#8-highlighting-rules)
  - [Project Management](#9-project-management)
  - [Multi-Room Support](#10-multi-room-support)
- [Integration Methods](#integration-methods)
- [Technology Stack](#technology-stack)
- [Configuration](#configuration)
- [Documentation](#documentation)

---

## Quick Start

### Installation

```bash
# Clone and install dependencies
git clone <repository-url>
cd smartinspect-web-viewer
npm install
```

### Development

```bash
# Start both server and client
npm run dev
```

Then open **http://localhost:5173** in your browser.

### Connect Your First Application

```javascript
const { SmartInspect } = require('smartinspect');
const si = new SmartInspect('My Application');

await si.connect({
    host: 'localhost',
    port: 4229,
    appName: 'My App'
});

// Basic logging
si.log('Application started');
si.warn('Cache miss detected');
si.error('Connection timeout', { retries: 3 });

// Watch values (live monitoring)
si.watch('activeUsers', 1542);
si.watch('queueDepth', 23);

// Metrics with labels (Prometheus-style)
si.watch('http_requests_total', 1847, {
    labels: { method: 'GET', status: '200', endpoint: '/api/users' }
});

// Stream high-frequency data
si.stream('trades', { symbol: 'BTC', price: 94521.50, volume: 125.3 });
```

---

## Core Features

### 1. Real-Time Log Viewing

The heart of SmartInspect Web Viewer is a **high-performance virtual grid** built with TanStack Virtual that renders 100,000+ entries smoothly.

#### Virtual Log Grid
- **Instant rendering** - Custom virtualization shows only visible rows
- **Smooth scrolling** - Rate-adaptive auto-scroll (lerp for slow updates, instant for bursts)
- **WebSocket streaming** - Logs appear in milliseconds via batched updates (100ms intervals)
- **Zero lag** - Server-side throttling prevents UI overload

#### Selection & Interaction
- **Multi-cell selection** - Click and drag to select ranges
- **Ctrl+Click** - Add or toggle individual entries
- **Shift+Click** - Select range from last selection
- **Smart copy (Ctrl+C)** - Intelligent formatting with headers and gap indicators for non-contiguous selections

#### Grid Customization
- **Column reordering** - Drag columns to preferred positions
- **Column resizing** - Adjust widths by dragging borders
- **Column pinning** - Pin important columns to left or right
- **Show/hide columns** - Toggle visibility via sidebar
- **Row density** - Choose compact, default, or comfortable spacing

#### Auto-Pause
The viewer automatically pauses updates when you switch browser tabs, saving resources. Updates resume instantly when you return.

---

### 2. Advanced Filtering & Views

Find exactly what you need with powerful multi-field filtering and save your favorite filter combinations as reusable views.

#### Filter Capabilities

| Filter Type | Description |
|-------------|-------------|
| **Sessions** | List selection OR text pattern matching |
| **Log Levels** | Debug, Info, Warning, Error, Fatal |
| **Text Search** | Title, message content with multiple operators |
| **Time Range** | Date picker with from/to timestamps |
| **App Names** | Filter by application name |
| **Host Names** | Filter by originating host |
| **Process IDs** | Filter by PID |
| **Thread IDs** | Filter by TID |

#### Text Search Operators
- **Contains** (case-sensitive or insensitive)
- **Equals** (exact match)
- **Regex** (full regular expression support)
- **Inverse** (exclude matches)

#### Views (Saved Filters)
Create custom views to save your filter combinations:

- **Tabbed interface** - Click tabs to switch instantly between perspectives
- **Color-coded tabs** - Assign colors for visual organization
- **View editor** - Double-click to edit name, filters, and settings
- **Persistent** - Views saved per room and synced across sessions
- **Default "All Logs"** - Always available, shows unfiltered stream

**Example Views:**
- "Errors Only" - Level = Error, Fatal
- "Auth Service" - Session = "Authentication"
- "Slow Queries" - Title contains "slow" + Level = Warning
- "Production Hosts" - HostName matches "prod-*"

---

### 3. Watch Panel - Live Variable Monitoring

Monitor application state in real-time with the **Watch Panel** - a table showing live values that update as your application runs.

#### Features
- **Live updates** - Values refresh instantly via WebSocket
- **Flash animation** - Visual pulse when values change
- **Sortable columns** - Name, Value, Updated timestamp
- **Filterable** - Search by name or content
- **History tracking** - Track value changes over time
- **Resizable panel** - Drag borders to adjust size

#### Use Cases
- Active user counts
- Queue depths
- Cache hit rates
- Connection pool status
- Memory usage
- Custom metrics

```javascript
// Send watch values from your app
si.watch('activeConnections', 47);
si.watch('cacheHitRate', '94.2%');
si.watch('lastOrderId', 'ORD-2024-001847');
```

---

### 4. Prometheus-Style Labels

Take your metrics to the next level with **multi-dimensional labels** - the same powerful tagging system used by Prometheus, now in your logs.

#### Label Syntax
```javascript
// Metric with labels
si.watch('http_requests_total', 1847, {
    labels: { method: 'GET', status: '200', endpoint: '/api/users' }
});

// Displayed as: http_requests_total{method="GET", status="200", endpoint="/api/users"}
```

#### Label Features
- **Series key format** - `metricName{label1="value1", label2="value2"}`
- **Label-based filtering** - Filter watches by label matchers
- **Auto-populated dropdowns** - Available label values shown in selectors
- **Dashboard variables** - Use labels in dashboard variable definitions
- **Cardinality tracking** - Track unique values per label

#### Protocol Versions
| Version | Features |
|---------|----------|
| v1 (legacy) | Basic watch with name/value |
| v2 | Added `group` field for instance identification |
| v3 (current) | Full native labels support |

---

### 5. Metrics Dashboards

Build beautiful, real-time dashboards with **Grafana-inspired visualization panels**.

#### Dashboard Features
- **Multi-dashboard support** - Create multiple dashboards per room
- **Tabbed navigation** - Switch between dashboards instantly
- **Drag-and-drop layout** - Reorder panels using react-grid-layout
- **Fullscreen mode** - Maximize individual panels (Escape to exit)
- **Live mode toggle** - Real-time updates vs. time-range based queries
- **Edit mode** - Visual panel picker and layout editor

#### Dashboard Variables
Use Grafana-style template variables for dynamic dashboards:

```
$instance    - Dropdown populated from label values
$environment - Switch between prod/staging/dev views
$service     - Filter all panels by selected service
```

#### Panel Types

| Panel Type | Description | Best For |
|------------|-------------|----------|
| **Time Series** | Line/area charts with multiple series | Trends over time |
| **Stat** | Large single value with optional sparkline | Key metrics |
| **Gauge** | Circular gauge with min/max/thresholds | Capacity, percentages |
| **Bar Chart** | Horizontal or vertical bars | Comparisons |
| **Table** | Columnar data display | Detailed breakdowns |
| **State Timeline** | Grafana-style state transitions | Service status, deployments |

#### Panel Configuration
- **Multiple queries** - Combine multiple metrics per panel
- **Label filtering** - Query specific series by labels
- **Unit formatting** - ms, %, bytes, req/s, and more
- **Decimal precision** - Configure decimal places
- **Color thresholds** - Color-coded warning/critical levels
- **Legend position** - Bottom, right, or hidden
- **Time ranges** - Last 5m/15m/30m/1h/3h or custom

---

### 6. Stream Channels - High-Frequency Data

Dedicated panel for **high-frequency streaming data** - perfect for trades, telemetry, events, or any rapid-fire data.

#### Features
- **Multi-channel support** - Separate streams for different data types
- **Channel tabs** - Switch between trade streams, event logs, telemetry
- **Per-channel auto-scroll** - Enable/disable independently
- **Configurable buffer** - Default 1000 entries per stream
- **Text filtering** - Filter stream data by content
- **Fullscreen view** - Dedicated StreamsView for deep analysis
- **Real-time updates** - Instant data arrival

```javascript
// Different stream channels
si.stream('trades', { symbol: 'BTC', price: 94521.50, action: 'BUY' });
si.stream('events', { type: 'user_login', user: 'alice@example.com' });
si.stream('telemetry', { cpu: 45.2, memory: 2048, disk: 78.4 });
```

---

### 7. Context Tracking & Thread Lines

Visualize **async execution flows** across your application with context tracking - see how requests flow through microservices, track async operations, and debug distributed systems.

#### Context Tracking Panel
- **Context keys listing** - All context keys with statistics
- **Expandable keys** - Show values with entry counts
- **Click to filter** - Filter log entries by context value
- **Search within values** - Quick search for specific context values

#### Thread Lines Visualization
- **Vertical swimlanes** - Colored lines for each active context value
- **Lifecycle visualization** - See when contexts spawn, continue, and end
- **Configurable columns** - Select which context keys to display
- **Click interactions** - Click to fade or filter by context value
- **Synced scrolling** - Synchronized with the log grid

```javascript
// Set context for async tracking
si.setContext('requestId', 'req-12345');
si.setContext('userId', 'user-789');

si.log('Processing request');
// All subsequent logs carry this context

si.clearContext('requestId');
```

---

### 8. Highlighting Rules

Make important log entries stand out with **customizable highlighting rules** - no automatic styling, you control everything.

#### Rule Conditions
- **Fields** - Level, session, app, title, entry type, process ID, host name
- **Operators** - Equals, contains, regex, inverse
- **Combinations** - Multiple conditions per rule

#### Styling Options
- **Background color** - 8 presets + custom color picker
- **Text color** - 8 presets + custom color picker
- **Font weight** - Normal or bold
- **Font style** - Italic support

#### Rule Management
- **Priority system** - Rules execute in order, first match wins
- **Enable/disable** - Toggle rules without deleting
- **Visual editor** - Live preview while editing
- **Import/Export** - Share rules via JSON

**Example Rules:**
- Errors: Red background, white text, bold
- Slow queries: Yellow background
- Authentication: Blue text
- Production: Orange border indicator

---

### 9. Project Management

Save your entire workspace configuration and switch between setups instantly.

#### What's Saved in a Project
- All views and their filters
- Highlighting rules
- Panel sizes and visibility
- Column widths and order
- Theme preference
- Active view selection

#### Project Features
- **Save/Load** - Named project configurations
- **Save As** - Create new project from current state
- **Auto-save** - Optional automatic saving on changes
- **Export/Import** - Share projects as `.siwv` JSON files
- **Default reset** - Restore to original state
- **Unsaved indicator** - Header shows when changes are pending
- **Change warning** - Prompts to save before switching

---

### 10. Multi-Room Support

Isolate logs from different projects, teams, or environments with **room-based separation**.

#### Room Features
- **Independent buffers** - Each room has its own log storage
- **Isolated projects** - Views, highlights, settings per room
- **Easy switching** - Header dropdown for room selection
- **Room statistics** - Connections, entries, activity per room
- **Permission ready** - Architecture supports future access control

#### Use Cases
- Separate dev/staging/production logs
- Per-team log isolation
- Per-project monitoring
- Multi-tenant logging

---

## Integration Methods

### Node.js / TypeScript SDK

```javascript
const { SmartInspect } = require('smartinspect');

const si = new SmartInspect('My Service');
await si.connect({ host: 'localhost', port: 4229 });

si.log('Info message');
si.warn('Warning message');
si.error('Error message', { details: 'Stack trace here' });

// Watches with labels
si.watch('api_latency_ms', 45, {
    labels: { endpoint: '/users', method: 'GET' }
});

// High-frequency streams
si.stream('events', eventData);
```

### HTTP API (Any Language)

```bash
# Simple logging via curl
curl -X POST "http://localhost:5174/api/log" \
  -H "Content-Type: application/json" \
  -d '{"level":"info","message":"Task completed","app":"my-service"}'

# With query parameters
curl -X POST "http://localhost:5174/api/log?level=error&app=cron-job&room=production" \
  -d "Backup failed: disk full"
```

### Shell Scripts (No Library Required)

```bash
# HTTP method
curl -s -X POST "http://localhost:5174/api/log?level=info&app=backup-script" \
  -d "Backup completed: 1.2GB" > /dev/null 2>&1

# Named pipe method (fastest, no network)
echo "INFO: Job started" > /tmp/smartinspect.pipe
echo "[myproject] ERROR: Connection failed" > /tmp/smartinspect.pipe

# JSON for full control
echo '{"level":"info","message":"Done","app":"script","room":"ops","session":"Cron"}' \
  > /tmp/smartinspect.pipe
```

See [SMARTINSPECT_SHELL.md](../SMARTINSPECT_SHELL.md) for complete shell integration documentation.

### Python SDK

```python
from smartinspect import SmartInspect

si = SmartInspect('My Python App')
si.connect(host='localhost', port=4229)

si.log('Processing started')
si.watch('items_processed', 1542)
si.error('Failed to connect', exc_info=True)
```

### C# SDK

```csharp
using SmartInspect;

var si = new SmartInspect("My C# App");
si.Connect("localhost", 4229);

si.Log("Application started");
si.Watch("activeThreads", Thread.CurrentThread.ManagedThreadId);
si.Error("Unhandled exception", ex);
```

---

## Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript 5.3 | Type safety |
| Zustand | State management |
| TanStack Virtual | High-performance virtualization |
| Tailwind CSS | Styling |
| Recharts | Dashboard charts |
| react-grid-layout | Dashboard layouts |
| Vite | Build tool & dev server |

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js 18+ | Runtime |
| Express | HTTP server |
| ws | WebSocket server |
| SQLite (better-sqlite3) | Settings & project persistence |
| Custom TCP server | SmartInspect binary protocol |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | 5174 | Web UI and API port |
| `TCP_PORT` | 4229 | SmartInspect TCP protocol port |
| `MAX_ENTRIES` | 100000 | Maximum log entries in memory |
| `SI_AUTH_TOKEN` | - | Optional auth token for TCP clients |
| `SI_AUTH_REQUIRED` | false | Require authentication for TCP |
| `SI_PIPE_PATH` | `/tmp/smartinspect.pipe` | Named pipe file path |
| `SI_PIPE_ENABLED` | true | Enable named pipe listener |
| `SI_PIPE_ROOM` | default | Default room for pipe messages |

### Production Deployment

```bash
# Build client
cd client && npm run build

# Start production server
cd ../server && npm start
# Server runs on http://localhost:5174
```

For PM2, Nginx reverse proxy, and Docker configurations, see [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

### WSL Users

When running in WSL with Windows browser:

```bash
# Start with network binding
npm run dev -- --host 0.0.0.0

# Find your WSL IP
ip addr show eth0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}'

# Access from Windows browser
http://<your-wsl-ip>:5173
```

---

## Project Structure

```
web-viewer/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # UI components
│       │   ├── VirtualLogGrid/     # High-performance log grid
│       │   ├── WatchPanel/         # Live variable monitoring
│       │   ├── StreamPanel/        # High-frequency data
│       │   ├── FilterPanel/        # Advanced filtering
│       │   ├── ViewTabs/           # Saved view management
│       │   ├── HighlightRules/     # Styling rule editor
│       │   ├── ContextTracking/    # Async context visualization
│       │   └── MetricsDashboard/   # Grafana-style dashboards
│       ├── panels/         # Dashboard panel types
│       │   ├── TimeSeriesPanel/
│       │   ├── StatPanel/
│       │   ├── GaugePanel/
│       │   ├── BarChartPanel/
│       │   ├── TablePanel/
│       │   └── StateTimelinePanel/
│       ├── hooks/          # Custom React hooks
│       └── store/          # Zustand state management
│
├── server/                 # Node.js backend
│   └── src/
│       ├── index.js        # Main server & WebSocket
│       ├── tcp-server.js   # SmartInspect TCP protocol
│       ├── packet-parser.js # Binary protocol parser
│       ├── storage.js      # Ring buffer & indices
│       ├── room-manager.js # Multi-room isolation
│       ├── watch-store.js  # Watch values & labels
│       └── settings-db.js  # SQLite persistence
│
└── docs/                   # Documentation
    ├── FEATURES.md
    ├── ARCHITECTURE.md
    ├── API.md
    └── CONFIGURATION.md
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Features Overview](docs/FEATURES.md) | Complete feature list with descriptions |
| [Architecture](docs/ARCHITECTURE.md) | System design, components, and data flow |
| [API Reference](docs/API.md) | REST endpoints and WebSocket protocol |
| [Configuration](docs/CONFIGURATION.md) | Environment variables and deployment |
| [Virtual Grid](docs/VIRTUAL_GRID.md) | Custom high-performance grid architecture |
| [Shell Integration](../SMARTINSPECT_SHELL.md) | Logging from shell scripts |

---

## License

[Add license information here]

---

**Built with React, Node.js, and TanStack Virtual**
