import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { UiFeedbackProvider, UiToastHost, UiConfirmHost } from './app/ui-feedback'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <UiFeedbackProvider>
      <App />
      <UiToastHost />
      <UiConfirmHost />
    </UiFeedbackProvider>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => console.log('SW registrado', registration.scope))
      .catch((error) => console.error('SW error', error))
  })
}
