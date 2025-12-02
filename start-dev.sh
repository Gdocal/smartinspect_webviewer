#!/bin/bash
# Start SmartInspect Web Viewer in development mode
# Server on port 5174, Vite client on port 5173

cd "$(dirname "$0")"

# Kill existing processes
lsof -ti:5173 | xargs -r kill -9 2>/dev/null
lsof -ti:5174 | xargs -r kill -9 2>/dev/null
sleep 1

# Start server
npm run dev:server &
sleep 2

# Start vite client from client directory with --host for WSL access
cd client && npx vite --host 0.0.0.0

