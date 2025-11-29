# SmartInspect Web Viewer

A web-based viewer for SmartInspect logs that replaces the Windows desktop application. Features real-time streaming, filtering, and AG Grid Enterprise for high-performance log display.

## Features

- **Real-time streaming**: Logs appear instantly as they are sent
- **Session filtering**: Filter by session name (Database, API, Authentication, etc.)
- **Level filtering**: Toggle Debug, Info, Warning, Error, Fatal levels
- **Text search**: Filter by title/message with regex support
- **Watch panel**: View current watch values with live updates
- **AG Grid Enterprise**: Virtual scrolling for 100K+ entries
- **Multi-client**: Multiple apps can send logs simultaneously

## Quick Start

### 1. Start the Server

```bash
cd web-viewer/server
npm install
npm run dev
```

The server will start on:
- **HTTP/WebSocket**: http://localhost:3000 (Web UI)
- **TCP**: port 4229 (Log intake from Node.js apps)

### 2. Start the Client (Development)

```bash
cd web-viewer/client
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### 3. Send Logs from Your Application

Update your SmartInspect connection to point to the web viewer:

```javascript
const si = require('smartinspect');

await si.connect({
    host: 'localhost',
    port: 4229,           // Web viewer TCP port
    appName: 'My App'
});

si.log('Hello from my app!');
si.warn('This is a warning');
si.error('This is an error');

const dbLog = si.createLogger('Database');
dbLog.info('Connected to database');
dbLog.sql('Query', 'SELECT * FROM users');
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | 3000 | Web UI and WebSocket port |
| `TCP_PORT` | 4229 | TCP port for log intake |
| `SI_AUTH_TOKEN` | (none) | Optional auth token for clients |
| `MAX_ENTRIES` | 100000 | Maximum log entries in memory |

### Authentication

To require authentication, set `SI_AUTH_TOKEN`:

```bash
SI_AUTH_TOKEN=my-secret-token npm run dev
```

## API Endpoints

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Server status and stats |
| `/api/logs` | GET | Query logs with filters |
| `/api/logs/since/:id` | GET | Get logs since a given ID |
| `/api/sessions` | GET | List of sessions with counts |
| `/api/watches` | GET | Current watch values |
| `/api/logs` | DELETE | Clear all logs |

### Query Parameters for `/api/logs`

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessions` | string | Comma-separated session names |
| `levels` | string | Comma-separated level numbers (0-5) |
| `from` | ISO date | Start time filter |
| `to` | ISO date | End time filter |
| `title` | string | Title regex pattern |
| `message` | string | Message regex pattern |
| `inverse` | boolean | Invert pattern matching |
| `offset` | number | Pagination offset |
| `limit` | number | Max results (default: 100, max: 1000) |

### WebSocket

Connect to `ws://localhost:3000/ws` for real-time streaming.

**Messages from server:**
- `{ type: 'init', data: { stats, watches, sessions } }` - Initial state
- `{ type: 'entries', data: [...] }` - New log entries
- `{ type: 'watch', data: { name, value, timestamp } }` - Watch update
- `{ type: 'control', data: { command } }` - Control command

**Messages to server:**
- `{ type: 'pause' }` - Pause streaming
- `{ type: 'resume' }` - Resume streaming
- `{ type: 'getSince', sinceId: number }` - Get entries since ID

## Project Structure

```
web-viewer/
├── server/
│   ├── src/
│   │   ├── index.js           # Main server entry
│   │   ├── tcp-server.js      # TCP log receiver
│   │   ├── packet-parser.js   # Binary packet parsing
│   │   ├── storage.js         # Ring buffer & watch store
│   │   └── connection-manager.js
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.tsx            # Main React app
│   │   ├── components/
│   │   │   ├── LogGrid.tsx    # AG Grid log display
│   │   │   ├── FilterBar.tsx  # Filter controls
│   │   │   ├── WatchPanel.tsx # Watch values
│   │   │   └── StatusBar.tsx  # Connection status
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   └── store/
│   │       └── logStore.ts    # Zustand state
│   └── package.json
├── test-logging.js            # Test script
└── README.md
```

## Level Values

| Level | Value | Description |
|-------|-------|-------------|
| Debug | 0 | Debug information |
| Verbose | 1 | Verbose output |
| Message | 2 | Regular log messages |
| Warning | 3 | Warnings |
| Error | 4 | Errors |
| Fatal | 5 | Fatal errors |

## Production Build

```bash
# Build client
cd client && npm run build

# Start server (serves built client)
cd ../server && npm start
```

## Future Enhancements

- [ ] LLM Query API for natural language log search
- [ ] MCP server for Claude Code integration
- [ ] Multi-tab interface
- [ ] Layout save/load
- [ ] EnterMethod/LeaveMethod context breadcrumbs
- [ ] Stream panel for high-frequency data
