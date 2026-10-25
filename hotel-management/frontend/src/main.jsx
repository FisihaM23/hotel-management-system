import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/theme.css'
import './index.css'

// Global error guardian for mobile simulator extensions & sandboxed iframes
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[HMS Mobile/Simulator Runtime Error]:', event.error || event.message)
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
