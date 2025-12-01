#!/bin/bash
# Start the SmartInspect Web Viewer client (Vite dev server)
# Binds to 0.0.0.0 for WSL access from Windows

cd "$(dirname "$0")/client"
npm run dev -- --host 0.0.0.0
