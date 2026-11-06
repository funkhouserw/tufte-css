// Shared helpers for the Tufte kit QA suite. Everything that runs in the page is plain
// DOM, so these work the same in all three engines, and most of it with JS disabled
// (Playwright's evaluate does not depend on page scripts being allowed).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect } from '@playwright/test'

export const PAGES = ['kitchen-sink', 'plain']
export const SWEEP = [320, 360, 390, 480, 600, 700, 767, 768, 800, 820, 900, 1024, 1280, 1440, 1920, 2560]
export const WIDE = SWEEP.filter((w) => w >= 768)
export const NARROW = SWEEP.filter((w) => w < 768)

// The kitchen sink embeds YouTube. Nothing in this suite may depend on the network.
export async function goto(page, slug, { width, height = 900, media } = {}) {
  if (width) await page.setViewportSize({ width, height })
  if (media) await page.emulateMedia(media)
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort())
  await page.goto(`/${slug}/`, { waitUntil: 'load' })
  await settle(page)
}

// Polled from Node with a synchronous evaluate. Firefox with JavaScript disabled never
// resolves an async evaluate, so `await document.fonts.ready` in the page would hang.
export async function settle(page, timeout = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const idle = await page.evaluate(
      () => document.fonts.status === 'loaded' && document.getAnimations().every((a) => a.playState !== 'running' && a.playState !== 'pending'),
    )
    if (idle) return
    await page.waitForTimeout(30)
  }
}

// macOS WebKit follows Safari's default, where plain Tab only stops at text fields and
// Option-Tab walks everything. A keyboard user on Safari presses the latter (or turns
// on full keyboard access), so that is the fair test of what the kit controls.
export const pressTab = (page) =>
  page.keyboard.press(process.platform === 'darwin' && page.context().browser().browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab')

// Serves `body` as static HTML under the kit's built stylesheet, like a real page: the
// browser's parser sees it, no DOM injection. For inputs the demos don't contain.
export function stylesheetHref() {
  const html = readFileSync(resolve(import.meta.dirname, '../dist/kitchen-sink/index.html'), 'utf8')
  return html.match(/<link rel="stylesheet" href="([^"]+)"/)[1]
}

export async function fixture(page, body, { width, height = 900, head = '', dir, media } = {}) {
  if (width) await page.setViewportSize({ width, height })
  if (media) await page.emulateMedia(media)
  const html = `<!doctype html><html lang="en"${dir ? ` dir="${dir}"` : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>fixture</title>
<link rel="stylesheet" href="${stylesheetHref()}">${head}</head><body>${body}</body></html>`
  await page.route('**/__fixture__', (route) => route.fulfill({ contentType: 'text/html', body: html }))
  await page.goto('/__fixture__', { waitUntil: 'load' })
  await settle(page)
}

export const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

// The article is the sideways scroller. Everything here works without page scripts.
export const scrollState = (page) =>
  page.evaluate(() => {
    const s = document.querySelector('.tufte')
    return { left: s.scrollLeft, max: s.scrollWidth - s.clientWidth, width: s.clientWidth }
  })

export const slideTo = (page, left) =>
  page.evaluate((left) => document.querySelector('.tufte').scrollTo({ left, behavior: 'instant' }), left)

// Every note that lives in the margin, as opposed to in place in a caption, a block note,
// a scrolling table or a drawer.
export const MARGIN_ITEMS = `:is(.tufte-sidenote, .tufte-marginnote, .tufte-margin-block, .tufte-figure[data-size="margin"]):not(.tufte-margin-block *, figcaption *, .tufte-table *, pre *, [popover] *)`

// Everything in the margin plus what it must not collide with. Rects are page-relative.
export const marginReport = (page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const describe = (el) => {
      const r = el.getBoundingClientRect()
      const cls = el.className.baseVal ?? el.className
      return {
        name: `${el.tagName.toLowerCase()}.${cls} "${el.textContent.trim().slice(0, 30)}"`,
        l: r.left, r: r.right, t: r.top + scrollY, b: r.bottom + scrollY,
      }
    }
    const shown = (el) => el.getClientRects().length && !el.closest('[popover]')
    const margin = [...document.querySelectorAll(`.tufte-sidenote, .tufte-marginnote, .tufte-margin-block,
      .tufte-figure[data-size="margin"], .tufte-drawer-tab,
      .tufte-figure:not([data-size="margin"], [data-size="full"]) > figcaption`)].filter(shown)
    // A margin figure contains its own caption, a figcaption is checked as itself.
    const obstacles = [...document.querySelectorAll('.tufte-full, .tufte-figure[data-size="full"], .tufte-figure > img, .tufte-figure > svg')]
      .filter(shown).filter((el) => !el.closest('.tufte-figure[data-size="margin"], .tufte-margin-block, .tufte-marginnote'))
    const items = margin.map(describe)
    // A note nested in another margin item, such as a block note, sits inside it by design.
    const nested = (i, j) => margin[i].contains(margin[j]) || margin[j].contains(margin[i])
    const blocks = obstacles.map(describe)
    const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1
    const collisions = []
    items.forEach((a, i) => {
      items.slice(i + 1).forEach((b, k) => !nested(i, i + 1 + k) && hit(a, b) && collisions.push(`${a.name} x ${b.name}`))
      blocks.forEach((b, k) => !obstacles[k].contains(margin[i]) && hit(a, b) && collisions.push(`${a.name} x ${b.name}`))
    })
    // On a narrow screen the margin runs past the viewport on purpose, inside the article's
    // own scroller. "Off screen" is out of the scroller's reach.
    const scroller = document.querySelector('.tufte')
    const article = scroller.getBoundingClientRect()
    const reach = Math.max(vw, article.left + scroller.scrollWidth - scroller.scrollLeft)
    const offscreen = items.filter((a) => a.r > reach + 1 || a.l < -1).map((a) => `${a.name} ${Math.round(a.l)}..${Math.round(a.r)} of ${Math.round(reach)}`)
    const escaped = items.filter((a) => a.b > article.bottom + scrollY + 1).map((a) => a.name)
    return { count: items.length, collisions, offscreen, escaped }
  })

// Characters per rendered line of body text, leaving out each paragraph's short last line.
export const lineLengths = (page, limit = 4) =>
  page.evaluate((limit) => {
    const inNote = (n) => n.parentElement.closest('.tufte-note, .tufte-drawer-wrap, code')
    const paras = [...document.querySelectorAll('.tufte section p')]
      .filter((p) => !p.closest('.tufte-note, .tufte-margin-block, [popover]') && !p.querySelector('.tufte-drawer-tab') && p.textContent.length > 180)
      .slice(0, limit)
    const lines = []
    for (const p of paras) {
      const counts = new Map()
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      for (let node; (node = walker.nextNode()); ) {
        if (inNote(node)) continue
        for (let i = 0; i < node.length; i++) {
          range.setStart(node, i)
          range.setEnd(node, i + 1)
          const rect = range.getClientRects()[0]
          if (!rect || !rect.width) continue
          // Group by the line's middle: inline fonts of other sizes share a line.
          const key = Math.round((rect.top + rect.bottom) / 2 / 8)
          const near = counts.has(key - 1) ? key - 1 : counts.has(key + 1) ? key + 1 : key
          counts.set(near, (counts.get(near) ?? 0) + 1)
        }
      }
      lines.push(...[...counts.entries()].sort((a, b) => a[0] - b[0]).slice(0, -1).map(([, n]) => n))
    }
    return lines
  }, limit)

export const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

// Reads the real counter values. Counters aren't exposed to script, and computed `content`
// gives back the unevaluated counter(). So render each value in unary, in a monospace
// font, and read it from the box's width. The kit's own counter is used untouched.
export async function counterValues(page) {
  await page.addStyleTag({
    content: `
      @counter-style qa-unary { system: additive; additive-symbols: 10 "XXXXXXXXXX", 1 "X"; }
      .tufte-note-ref {
        display: inline-block !important; padding: 0 !important; margin: 0 !important; font: 0/1 monospace !important;
      }
      .tufte-note-ref::after {
        content: counter(tufte-sidenote, qa-unary) !important; position: static !important;
        font: 10px/1 monospace !important; letter-spacing: 0 !important; white-space: nowrap !important;
      }
      .tufte-sidenote {
        display: inline-block !important; float: none !important; inline-size: max-content !important;
        margin: 0 !important; padding: 0 !important; border: 0 !important; font: 0/1 monospace !important;
      }
      .tufte-sidenote > * { display: none !important; }
      .tufte-sidenote::before {
        content: counter(tufte-sidenote, qa-unary) !important; position: static !important;
        font: 10px/1 monospace !important; letter-spacing: 0 !important; white-space: nowrap !important;
      }
      .tufte-sr { display: none !important; }
      /* Probe: one known count, to convert width to n. */
      .qa-ruler { font: 10px/1 monospace; position: absolute; visibility: hidden; white-space: nowrap; }
    `,
  })
  return page.evaluate(() => {
    const ruler = document.createElement('span')
    ruler.className = 'qa-ruler'
    ruler.textContent = 'X'.repeat(100)
    document.body.append(ruler)
    const unit = ruler.getBoundingClientRect().width / 100
    ruler.remove()
    const n = (el) => Math.round(el.getBoundingClientRect().width / unit)
    const skip = (el) => el.closest('[popover]')
    return {
      refs: [...document.querySelectorAll('.tufte-note-ref')].filter((e) => !skip(e)).map(n),
      notes: [...document.querySelectorAll('.tufte-sidenote')].filter((e) => !skip(e)).map(n),
    }
  })
}

// Drawers ---------------------------------------------------------------------------
export const drawerIds = (page) =>
  page.evaluate(() => [...document.querySelectorAll('.tufte-drawer')].map((d) => d.id))

export const tabFor = (page, id) => page.locator(`[popovertarget="${id}"].tufte-drawer-tab`)
export const panel = (page, id) => page.locator(`#${id}`)

export const isOpen = (page, id) => page.locator(`#${id}`).evaluate((el) => el.matches(':popover-open'))

export async function waitOpen(page, id, open = true) {
  await expect.poll(() => isOpen(page, id)).toBe(open)
  await settle(page)
}

export const rectOf = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, vw: document.documentElement.clientWidth, vh: innerHeight }
  })

export function offScreenBy(r) {
  return Math.max(0, -r.left, -r.top, r.right - r.vw, r.bottom - r.vh)
}

export const activeId = (page) =>
  page.evaluate(() => {
    const a = document.activeElement
    return a ? `${a.tagName.toLowerCase()}${a.getAttribute('popovertarget') ? `[popovertarget=${a.getAttribute('popovertarget')}]` : ''}.${a.className}` : ''
  })

// Press Tab until `predicate(element)` holds, or give up. Returns the number of presses.
export async function tabUntil(page, selector, max = 300) {
  for (let i = 0; i < max; i++) {
    await pressTab(page)
    if (await page.evaluate((s) => document.activeElement?.matches(s), selector)) return i + 1
  }
  return -1
}
