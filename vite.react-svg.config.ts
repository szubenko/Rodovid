import { defineConfig, mergeConfig } from 'vite'
import atlas from './vite.config.ts'

// Preserve the alternate ports and output for the existing react-svg commands.
export default mergeConfig(atlas, defineConfig({
  build: { outDir: 'dist-react-svg' },
  server: { port: 5175 },
  preview: { port: 4175 },
}))
