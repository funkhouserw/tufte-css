// Turns each demo/*.mdx page into complete HTML. Shared by the dev server and the build.
import { renderToStaticMarkup } from 'react-dom/server'
import { Article, mdxComponents } from '../src/tufte/react/index.jsx'
import stylesheet from './site.css?url'
import slideScript from '../src/tufte/tufte-slide.js?url'

const files = import.meta.glob('./*.mdx', { eager: true })
const slugOf = (path) => path.slice(2, -'.mdx'.length)

const escapeHtml = (text) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Notes and drawers inside a heading are not part of its text. Spans nest, so this has
// to count them rather than match up to the first closing tag.
function withoutNotes(html) {
  let depth = 0
  return html
    .split(/(<\/?span\b[^>]*>)/)
    .filter((part) => {
      if (depth) {
        if (part.startsWith('</span')) depth--
        else if (part.startsWith('<span')) depth++
        return false
      }
      if (/^<span\b[^>]*class="tufte-(note|drawer-wrap)"/.test(part)) {
        depth = 1
        return false
      }
      return true
    })
    .join('')
}

export const slugs = () => Object.keys(files).map(slugOf)

function index() {
  const links = slugs().map((slug) => `<li><a href="/${slug}/">${slug}</a></li>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tufte kit demos</title><link rel="stylesheet" href="${stylesheet}"></head><body><main><article class="tufte"><h1>Tufte kit demos</h1><ul>${links}</ul></article></main></body></html>\n`
}

// A page may `export const meta = { title, description, marker }`. Without a title, the
// first h1 is used.
export function renderPage(slug) {
  if (slug === '') return index()
  const file = files[`./${slug}.mdx`]
  if (!file) return null
  const { default: Content, meta = {} } = file
  // React adds a preload <link> per eager image, which would fetch images in closed
  // drawers ahead of everything else. The browser can schedule them on its own.
  const body = renderToStaticMarkup(
    <Article marker={meta.marker}>
      <Content components={mdxComponents} />
    </Article>,
  ).replace(/<link rel="preload" as="image"[^>]*>/g, '')
  const h1 = withoutNotes(body.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1] ?? '').replace(/<[^>]+>/g, '').trim()
  const title = meta.title ? escapeHtml(meta.title) : h1 || slug
  const description = meta.description ? `<meta name="description" content="${escapeHtml(meta.description)}">\n` : ''
  // The one script the kit has, and only where there is a note to slide to.
  const script = /class="tufte-note-(ref|edge)"/.test(body) ? `<script src="${slideScript}" defer></script>\n` : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${description}<link rel="stylesheet" href="${stylesheet}">
${script}</head>
<body>
<main>
${body}
</main>
</body>
</html>
`
}
