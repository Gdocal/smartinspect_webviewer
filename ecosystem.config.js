/**
 * PM2 Ecosystem Configuration for SmartInspect Web Viewer
 *
 * This config manages both the Express backend and Vite frontend with hot reload.
 *
 * Usage:
 *   npm run pm2:start    - Start both server and client
 *   npm run pm2:stop     - Stop all processes
 *   npm run pm2:restart  - Manual restart
 *   npm run pm2:logs     - View logs in real-time
 *   npm run pm2:status   - Check process status
 *
 * For WSL, access via network IP (not localhost):
 *   http://<wsl-ip>:5173  (Vite client)
 *   http://<wsl-ip>:5174  (Express API)
 */
module.exports = {
  apps: [
    {
      name: 'smartinspect-server',
      cwd: './server',
      script: 'src/index.js',

      // Hot reload: restart when files in src/ change
      watch: ['src'],
      ignore_watch: ['node_modules', 'logs', '*.log'],
      watch_options: {
        followSymlinks: false
      },

      // Environment variables
      env: {
        NODE_ENV: 'development',
        HTTP_PORT: 5174,    // Express API + WebSocket
        TCP_PORT: 4229      // SmartInspect log intake
      }
    },
    {
      name: 'smartinspect-client',
      cwd: './client',
      script: 'node_modules/.bin/vite',
      args: '--host 0.0.0.0',

      // Vite has its own HMR, no need for PM2 watch
      watch: false,

      env: {
        NODE_ENV: 'development'
      }
    }
  ]
}
