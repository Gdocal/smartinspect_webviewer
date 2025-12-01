#!/bin/bash
# Start the SmartInspect Web Viewer server
# TCP port 4229 for log intake, HTTP port 3000 for API/WebSocket

cd "$(dirname "$0")/server"
node src/index.js
