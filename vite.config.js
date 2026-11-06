import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import rehypeTufte from './src/tufte/react/rehype-tufte.js'

const RENDERER = '/demo/render.jsx'

// Dev preview: renders the same pages as scripts/build.mjs, on request. Pages are
// server-rendered only, so a change to a post or component reloads the browser. CSS
// arrives through a <link> and hot-swaps on its own.
function devPages() {
  return {
    name: 'tufte-dev-pages',
    apply: 'serve',
    configureServer(server) {
      server.watcher.on('all', (_event, file) => {
        if (/\/(demo|src)\/.*\.(mdx|jsx?)$/.test(file)) server.ws.send({ type: 'full-reload' })
      })
      server.middlewares.use(async (req, res, next) => {
        const url = req.url.split('?')[0]
        const match = url.match(/^\/((?:[\w-]+\/)*?[\w-]*)\/?$/)
        if (!match) return next()
        try {
          const { renderPage } = await server.ssrLoadModule(RENDERER)
          const html = renderPage(match[1])
          if (!html) return next()
          res.setHeader('Content-Type', 'text/html')
          res.end(await server.transformIndexHtml(url, html))
        } catch (error) {
          server.ssrFixStacktrace(error)
          next(error)
        }
      })
    },
  }
}

export default defineConfig({
  root: import.meta.dirname,
  appType: 'mpa',
  publicDir: 'public',
  build: {
    assetsInlineLimit: 0,
    // Keep light-dark() native. Older targets rewrite it into a form that ignores
    // the kit's --tufte-color-scheme setting.
    cssTarget: ['chrome123', 'firefox120', 'safari17.5'],
  },
  plugins: [
    { enforce: 'pre', ...mdx({ rehypePlugins: [rehypeTufte] }) },
    tailwindcss(),
    devPages(),
  ],
})
