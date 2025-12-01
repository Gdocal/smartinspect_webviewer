# SmartInspect Web Viewer

## Starting Background Processes - IMPORTANT

**ALWAYS use the `run_in_background: true` parameter** when starting long-running processes like servers. Do NOT use shell `&` operator - it doesn't work reliably with npm/node processes that spawn children.

### Correct way to start services:

```javascript
// Vite dev server
Bash({
    command: "cd /home/gdocal/smartinspect/web-viewer/client && npx vite --host 0.0.0.0",
    run_in_background: true
})

// Backend server
Bash({
    command: "cd /home/gdocal/smartinspect/web-viewer && node server/src/index.js",
    run_in_background: true
})

// Continuous log writer (for testing)
Bash({
    command: "cd /home/gdocal/smartinspect/web-viewer && node continuous-writer.js",
    run_in_background: true
})
```

### WRONG way (will hang/block):
```bash
# DO NOT use & in shell - it doesn't work properly with npm/concurrently
cd /home/gdocal/smartinspect/web-viewer && npm run dev &  # WRONG - will hang
```

**Important:** Vite must be started from the `client` folder, not the `web-viewer` root folder.

Access the UI at: http://172.17.67.169:5173/ or http://100.117.25.12:5173/

## Ports
- **5173** - Vite dev server (frontend)
- **3000** - Backend API/WebSocket server
- **4229** - SmartInspect TCP receiver (for log data)
