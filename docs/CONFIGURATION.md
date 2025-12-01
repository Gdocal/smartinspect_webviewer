# Configuration

Environment variables, scripts, and configuration options.

## Environment Variables

Configure the server with these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | 3000 | Web UI and WebSocket port |
| `TCP_PORT` | 4229 | TCP port for log intake from applications |
| `SI_AUTH_TOKEN` | (none) | Optional auth token for TCP client connections |
| `SI_AUTH_REQUIRED` | false | Require authentication for all TCP connections |
| `MAX_ENTRIES` | 100000 | Maximum log entries in memory buffer (per room) |
| `NODE_ENV` | development | Environment mode (development/production) |

### Usage Examples

**Set custom ports:**
```bash
HTTP_PORT=8080 TCP_PORT=4230 npm run dev
```

**Require authentication:**
```bash
SI_AUTH_TOKEN=my-secret-token SI_AUTH_REQUIRED=true npm start
```

**Production with custom buffer:**
```bash
NODE_ENV=production MAX_ENTRIES=50000 npm start
```

## Package.json Scripts

### Root Workspace

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

**Commands:**
- `npm run dev` - Start both server and client in development mode
- `npm run dev:server` - Start only the server
- `npm run dev:client` - Start only the client
- `npm run build` - Build both client and server for production
- `npm start` - Start production server (serves built client)

### Server Scripts

```json
{
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js"
  }
}
```

**Commands:**
- `npm run dev` - Start server with hot reload (Node.js --watch)
- `npm start` - Start production server

### Client Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  }
}
```

**Commands:**
- `npm run dev` - Start Vite development server (http://localhost:5173)
- `npm run build` - Build for production (TypeScript + Vite)
- `npm run preview` - Preview production build locally

## Log Levels

SmartInspect log level values and their meanings:

| Level | Value | Name | Description |
|-------|-------|------|-------------|
| 0 | Debug | Debug | Detailed debug information for development |
| 1 | Verbose | Verbose | Verbose output for diagnostics |
| 2 | Message | Message | Regular informational messages |
| 3 | Warning | Warning | Warning messages that need attention |
| 4 | Error | Error | Error messages indicating failures |
| 5 | Fatal | Fatal | Fatal error messages (critical failures) |
| 6 | Control | Control | Internal control messages |

**Usage in filters:**
```javascript
// Filter for warnings and errors only
filter.levels.selected = [3, 4];

// Filter for everything except debug
filter.levels.selected = [1, 2, 3, 4, 5];
filter.levels.inverse = false;

// Inverse filtering (show only debug)
filter.levels.selected = [1, 2, 3, 4, 5];
filter.levels.inverse = true;
```

## Log Entry Types

SmartInspect entry type values:

| Value | Name | Description |
|-------|------|-------------|
| 0 | Separator | Visual separator in log view |
| 1 | EnterMethod | Method entry point (call tracking) |
| 2 | LeaveMethod | Method exit point (call tracking) |
| 3 | ResetCallstack | Reset call stack tracking |
| 100 | Message | Regular message entry |
| 101 | Warning | Warning message entry |
| 102 | Error | Error message entry |
| 103 | InternalError | Internal error (viewer/library) |
| 104 | Comment | Comment entry |
| 105 | VariableValue | Variable value display |
| 106 | Checkpoint | Checkpoint marker |
| 107 | Debug | Debug message entry |
| 108 | Verbose | Verbose message entry |
| 109 | Fatal | Fatal error entry |
| 110 | Conditional | Conditional entry |
| 111 | Assert | Assertion entry |
| 200 | Text | Text data entry |
| 201 | Binary | Binary data entry |
| 202 | Graphic | Graphic/image data entry |
| 203 | Source | Source code entry |
| 204 | Object | Object/JSON data entry |
| 205 | WebContent | Web content entry |
| 206 | System | System information entry |
| 207 | MemoryStatistic | Memory statistics entry |
| 208 | DatabaseResult | Database query result entry |
| 209 | DatabaseStructure | Database structure entry |

## Client Configuration

### localStorage Keys

The client stores configuration in browser localStorage:

| Key | Description |
|-----|-------------|
| `si-layout` | Panel sizes and column widths |
| `si-theme` | Dark/light theme preference |
| `si-working-project-{room}-{user}` | Current working project state |
| `si-column-state` | AG Grid column configuration |

### Settings (Stored on Server)

User settings synchronized with server via `/api/settings`:

- `autoSaveProject` - Auto-save project on changes
- `defaultRoom` - Default room on login
- `maxEntriesPerView` - Max entries to display per view
- Custom user preferences

## WSL Configuration

When running server in WSL but accessing from Windows:

### Server Configuration

**vite.config.ts:**
```typescript
export default defineConfig({
  server: {
    host: '0.0.0.0',  // Bind to all interfaces
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
```

### Finding WSL IP

```bash
# Get eth0 IP address
ip addr show eth0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}'

# Or use hostname -I
hostname -I | awk '{print $1}'
```

### Windows Access

Access the viewer from Windows browser using WSL network IP:
```
http://172.17.67.169:5173/  (replace with your actual IP)
```

## Production Configuration

### Nginx Reverse Proxy

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name smartinspect.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

### PM2 Process Manager

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [{
    name: 'smartinspect-viewer',
    script: './server/src/index.js',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      HTTP_PORT: 3000,
      TCP_PORT: 4229,
      MAX_ENTRIES: 100000
    }
  }]
};
```

**Start with PM2:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Test Scripts

Development test scripts for generating log data:

| Script | Location | Purpose |
|--------|----------|---------|
| `test-continuous.js` | `server/` | Continuous realistic log generation (~30 msg/min) |
| `test-logging.js` | Root | Basic logging test with various levels |
| `test-live.js` | Root | Live streaming test with multiple sessions |
| `test-stream.js` | Root | Stream data test for high-frequency channels |

**Usage:**
```bash
# Continuous log generation
cd server
node test-continuous.js

# Basic test
node test-logging.js

# Live streaming test
node test-live.js

# Stream test
node test-stream.js
```
