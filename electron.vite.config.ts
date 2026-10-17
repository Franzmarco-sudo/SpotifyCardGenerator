import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"
// Dev needs websockets + inline preamble for hot reload
const DEV_CSP =
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: http://localhost:*; img-src 'self' data: blob:"

/** Swaps the __CSP__ placeholder in index.html: strict in builds, relaxed for the dev server. */
function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        return html.replace('__CSP__', ctx.server ? DEV_CSP : PROD_CSP)
      }
    }
  }
}

const shared = resolve('src/shared')

export default defineConfig({
  main: { resolve: { alias: { '@shared': shared } } },
  preload: { resolve: { alias: { '@shared': shared } } },
  renderer: {
    resolve: { alias: { '@shared': shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), cspPlugin()]
  }
})
