import { defineConfig, mergeConfig, type Plugin } from 'vite'
import original from './vite.config.ts'

// A separate entry and output, sharing the validated data pipeline and archive viewers.
const editionEntry: Plugin = {
  name: 'rodovid-react-svg-entry',
  transformIndexHtml: {
    order: 'pre',
    handler: html => html
      .replace('/src/main.tsx', '/src/edition/main.tsx')
      .replace('<title>Мій родовід</title>', '<title>Родовід — сімейний атлас</title>')
      .replace('content="#f5f1e8"', 'content="#f6f7f3"'),
  },
}

export default mergeConfig(original, defineConfig({
  plugins: [editionEntry],
  build: { outDir: 'dist-react-svg' },
  server: { port: 5175 },
  preview: { port: 4175 },
}))
