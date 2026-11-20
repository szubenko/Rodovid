import { defineConfig } from '@playwright/test'
import base from './playwright.react-svg.config'
export default defineConfig(base, { use: { launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } } })
