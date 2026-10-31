import { defineConfig, mergeConfig } from 'vite'
import edition from './vite.react-svg.config.ts'
import deployment from './vercel.json' with { type: 'json' }

// Local compatibility check of CSP/cache headers, not a Vercel access emulator.
export default mergeConfig(edition, defineConfig({
  build: { outDir: 'dist-vercel' },
  preview: {
    port: 4180,
    headers: Object.fromEntries(deployment.headers[0]!.headers.map(({ key, value }) => [key, value])),
  },
}))
