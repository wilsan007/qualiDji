import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { warmUpApi } from '@/lib/api'

// Les fichiers de l'interface sont servis sans réveiller le Worker : on le réveille tout de suite
// (démarrage à froid de plusieurs secondes), pendant que l'utilisateur lit la page de connexion.
if (import.meta.env.PROD) warmUpApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// §13 — PWA légère : service worker enregistré en production uniquement
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW indisponible : l'app reste fonctionnelle, sans cache shell */
    })
  })
}

