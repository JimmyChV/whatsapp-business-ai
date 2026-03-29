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
