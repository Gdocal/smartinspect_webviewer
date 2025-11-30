# SmartInspect Web Viewer

## Starting the Web UI

To start the web viewer correctly:

```bash
# 1. Start backend server (from server folder)
cd /home/gdocal/smartinspect/web-viewer/server && node src/index.js &

# 2. Start Vite dev server (from client folder, NOT web-viewer root)
cd /home/gdocal/smartinspect/web-viewer/client && npx vite --host 0.0.0.0 &
```

**Important:** Vite must be started from the `client` folder, not the `web-viewer` root folder.

Access the UI at: http://172.17.67.169:5173/

## Ports
- **5173** - Vite dev server (frontend)
- **3001** - Backend API server
- **4229** - SmartInspect TCP receiver (for log data)
