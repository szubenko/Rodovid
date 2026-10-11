import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AtlasApp } from './AtlasApp'
import '../styles/global.css'
import './theme.css'

const root = document.getElementById('root')
if (!root) throw new Error('Не знайдено кореневий елемент застосунку.')

createRoot(root).render(<StrictMode>
  <BrowserRouter basename={import.meta.env.BASE_URL}><AtlasApp /></BrowserRouter>
</StrictMode>)
