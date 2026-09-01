import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { reportFailure } from './core/report'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Offline support. Registered in production only — in dev the cache would serve
// stale modules over Vite's HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      // Offline is an enhancement; the app still runs without it.
      reportFailure('serviceworker', err instanceof Error ? err.message : 'Could not register')
    })
  })
}
