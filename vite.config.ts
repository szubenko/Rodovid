import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { staticDataPlugin } from './scripts/static-data-plugin.ts'
import { pdfAssetsPlugin } from './scripts/pdf-assets-plugin.ts'

export default defineConfig({
  plugins: [react(), staticDataPlugin(), pdfAssetsPlugin()],
  // Only declared, validated files are emitted by staticDataPlugin.
  publicDir: false,
  build: {
    assetsDir: 'app-assets',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})
