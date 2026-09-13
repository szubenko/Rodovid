import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import './styles/global.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Не знайдено кореневий елемент застосунку.')
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}><App /></BrowserRouter>
  </StrictMode>,
)
