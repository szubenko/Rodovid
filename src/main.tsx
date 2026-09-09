import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/global.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Не знайдено кореневий елемент застосунку.')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
