// Static build: dist/<slug>/index.html for each demo page, plus hashed CSS and fonts.
// Vite bundles demo/render.jsx for Node, emitting the assets as it goes. We then run that
// bundle to render the pages and delete it, so the only JavaScript in dist/ is the
// optional tufte-slide script, referenced only by pages with notes (see DESIGN.md).
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'vite'

const dist = resolve(import.meta.dirname, '../dist')
const bundle = '.ssr'

await build({
  logLevel: 'warn',
  build: {
    ssr: 'demo/render.jsx',
    ssrEmitAssets: true,
    emptyOutDir: true,
    copyPublicDir: true,
    outDir: dist,
    rolldownOptions: { output: { entryFileNames: `${bundle}/[name].js`, chunkFileNames: `${bundle}/[name].js` } },
  },
})

const { slugs, renderPage } = await import(join(dist, bundle, 'render.js'))
for (const slug of ['', ...slugs()]) {
  const dir = join(dist, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'index.html'), renderPage(slug))
  console.log(join('dist', slug, 'index.html'))
}
await rm(join(dist, bundle), { recursive: true })
