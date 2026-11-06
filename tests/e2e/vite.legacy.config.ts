import { defineConfig, mergeConfig } from 'vite'
import atlas from '../../vite.config.ts'

export default mergeConfig(atlas, defineConfig({
  plugins: [{
    name: 'rodovid-legacy-test-entry',
    transformIndexHtml: {
      order: 'pre',
      handler: html => html.replace('/src/edition/main.tsx', '/src/main.tsx'),
    },
  }],
  build: { outDir: 'tmp/legacy-e2e' },
  preview: { port: 4174 },
}))
