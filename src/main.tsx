import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { requestPersistence } from './db/db.ts'
import { App } from './ui/App.tsx'
import './ui/styles.css'

void requestPersistence()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Hash routing: GitHub Pages has no fallback, so a deep link like
        /Wigwam531/settings would 404 on a cold launch. */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
