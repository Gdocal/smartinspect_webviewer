import React from 'react'
import ReactDOM from 'react-dom/client'

// AG Grid styles - must load before any AG Grid components
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-balham.css'

// Start WebSocket connection early, before heavy AG Grid modules load
import { initializeWebSocket } from './services/earlyWebSocket'
initializeWebSocket()

import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
