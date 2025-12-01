import React from 'react'
import ReactDOM from 'react-dom/client'

// AG Grid styles - must load before any AG Grid components
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-balham.css'

import './index.css'

// Check if we're on a test page
const isAgGridTestPage = window.location.pathname === '/ag-grid-test' || window.location.search.includes('test=ag-grid')
const isVirtualGridTestPage = window.location.pathname === '/virtual-grid-test' || window.location.search.includes('test=virtual-grid')

if (isAgGridTestPage) {
  // Load AG Grid test page without WebSocket
  import('./AgGridTest').then(({ AgGridTest }) => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <AgGridTest />
      </React.StrictMode>,
    )
  })
} else if (isVirtualGridTestPage) {
  // Load Virtual Grid test page without WebSocket
  import('./VirtualLogGridTest').then(({ VirtualLogGridTest }) => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <VirtualLogGridTest />
      </React.StrictMode>,
    )
  })
} else {
  // Normal app - Start WebSocket connection early, before heavy AG Grid modules load
  import('./services/earlyWebSocket').then(({ initializeWebSocket }) => {
    initializeWebSocket()
  })

  import('./App').then(({ default: App }) => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  })
}
