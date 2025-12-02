# SmartInspect Web Viewer

> A modern, web-based log viewer for SmartInspect that replaces the Windows desktop application with real-time streaming, advanced filtering, and enterprise-grade performance.

![SmartInspect Web Viewer - Main Interface](docs/images/main-interface-screenshot.png)

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

### Connect Your Application

```javascript
const { SmartInspect } = require('smartinspect');
const si = new SmartInspect('My Application');

await si.connect({
    host: 'localhost',
    port: 4229,
    appName: 'My App'
});

si.log('Hello from my app!');
si.warn('Warning message');
si.error('Error message');

// Stream high-frequency data with optional type
si.stream('metrics', { cpu: 45.2, memory: 2048 }, 'json');
si.stream('events', 'User logged in', 'text');
```

## Key Features

- **High-performance virtual grid** - Custom-built in-house grid with TanStack Virtual for smooth rendering of 100K+ entries
- **Real-time streaming** via WebSocket with batched updates
- **Advanced filtering** by sessions, levels, text patterns, time ranges
- **Customizable views** with tabs for different filter combinations
- **Smart auto-scroll** - Smooth scrolling with automatic rate detection (lerp for slow updates, instant for high-speed)
- **Watch panel** for live variable monitoring
- **Stream panel** for high-frequency data channels with type categorization
- **Highlighting rules** with custom styling and priority system
- **Project management** with save/load/export/import
- **Multi-room support** for team isolation
- **Dark/Light theme** with customizable layouts

## Technology Stack

**Frontend:** React 18, TypeScript 5.3, Zustand, TanStack Virtual, Tailwind CSS, Vite

**Backend:** Node.js 18+, Express, WebSocket, SQLite, SmartInspect TCP Protocol

## Documentation

- **[Features Overview](docs/FEATURES.md)** - Complete feature list with descriptions
- **[Architecture](docs/ARCHITECTURE.md)** - System design, components, and data flow
- **[API Reference](docs/API.md)** - REST endpoints and WebSocket protocol
- **[Configuration](docs/CONFIGURATION.md)** - Environment variables, scripts, and settings
- **[Implementation Status](IMPLEMENTATION_STATUS.md)** - Development progress checklist
- **[Virtual Grid Implementation](docs/VIRTUAL_GRID.md)** - Custom high-performance grid architecture

## Production Build

```bash
# Build client
cd client
npm run build

# Start production server
cd ../server
npm start
```

Server runs on **http://localhost:3000**

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | 3000 | Web UI and WebSocket port |
| `TCP_PORT` | 4229 | TCP port for log intake |
| `MAX_ENTRIES` | 100000 | Maximum log entries in memory buffer |
| `SI_AUTH_TOKEN` | - | Optional auth token for TCP clients |

## WSL Users

When running in WSL with Windows browser:

```bash
# Start with network binding
npm run dev -- --host 0.0.0.0

# Find your WSL IP
ip addr show eth0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}'

# Access from Windows
http://<your-wsl-ip>:5173
```

## Project Structure

```
web-viewer/
├── client/          # React frontend (TypeScript, Zustand, custom Virtual Grid)
│   └── src/
│       ├── components/
│       │   ├── VirtualLogGrid/   # High-performance custom grid
│       │   │   ├── VirtualLogGrid.tsx      # Main grid component
│       │   │   ├── VirtualLogGridRow.tsx   # Row renderer
│       │   │   ├── VirtualLogGridHeader.tsx
│       │   │   ├── useAutoScroll.ts        # Smart scroll hook
│       │   │   └── useScrollDetection.ts   # Scroll state detection
│       │   └── [20+ other components]
│       ├── hooks/        # 7 custom hooks
│       └── store/        # Zustand state management
├── server/          # Node.js backend (Express, WebSocket, SQLite)
│   └── src/
│       ├── index.js           # Main server
│       ├── tcp-server.js      # SmartInspect TCP protocol
│       ├── packet-parser.js   # Binary protocol parser
│       ├── storage.js         # Ring buffer & data structures
│       ├── room-manager.js    # Multi-room isolation
│       └── settings-db.js     # SQLite persistence
└── docs/            # Documentation
```

## License

[Add license information here]

---

**Built with ❤️ using React, Node.js, and TanStack Virtual**
