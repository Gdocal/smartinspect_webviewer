# SmartInspect Web Viewer

## Starting Development Server

Use `./start-dev.sh` - it handles the workspace structure correctly.

**Issue**: `npm run dev` starts vite from root (no proxy config). Must start vite from `client/` dir.

**Details**:
- Server runs on port 5174, vite on 5173
- Vite proxy config is in `client/vite.config.ts`
- Vite needs `--host 0.0.0.0` for WSL access
- Access via network IP: `http://172.17.67.169:5173/`
