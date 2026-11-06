// The static output itself: the one optional script, what was written is what the parser builds,
// images load, print keeps the notes.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { PAGES, drawerIds, goto, overflow, settle } from './helpers.js'

const dist = resolve(import.meta.dirname, '../dist')
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
const htmlOf = (slug) => readFileSync(join(dist, slug, 'index.html'), 'utf8')

test('the only JavaScript in dist is the small optional tap-to-slide script', () => {
  const scripts = walk(dist).filter((f) => /\.(m?js|cjs)(\.map)?$/.test(f))
  expect(scripts.map((f) => f.replace(/.*\/assets\//, '').replace(/-[\w-]{8}\.js$/, '.js'))).toEqual(['tufte-slide.js'])
  expect(statSync(scripts[0]).size).toBeLessThan(1024)
})

test('only a page with notes loads it, deferred; a page without has no script at all', () => {
  expect([...htmlOf('kitchen-sink').matchAll(/<script\b[^>]*>/gi)].map(([tag]) => tag.replace(/-[\w-]{8}\.js/, '.js'))).toEqual(['<script src="/assets/tufte-slide.js" defer>'])
  expect(htmlOf('plain')).not.toMatch(/<script\b/i)
})

for (const slug of PAGES) {
  test(`${slug}: no inline scripts, inline handlers or script preloads`, () => {
    const html = htmlOf(slug)
    expect(html).not.toMatch(/<script\b(?![^>]*\ssrc=)/i)
    expect(html).not.toMatch(/<link[^>]+rel="modulepreload"/i)
    expect(html).not.toMatch(/\son[a-z]+="/i)
    expect(html).not.toMatch(/href="javascript:/i)
  })

  test(`${slug}: the parser builds what the HTML says, with nothing reparented`, async ({ page }) => {
    const raw = htmlOf(slug)
    const body = raw.slice(raw.indexOf('<body>'))
    const written = {}
    for (const [, tag] of body.matchAll(/<([a-z][a-z0-9]*)[\s>/]/g)) written[tag] = (written[tag] ?? 0) + 1
    delete written.body
    await goto(page, slug, { width: 1280 })
    const report = await page.evaluate((tags) => {
      const parsed = {}
      for (const tag of tags) parsed[tag] = document.querySelector('body').querySelectorAll(tag).length
      const blockInP = [...document.querySelectorAll('p :is(address, article, aside, blockquote, details, div, dl, figure, footer, form, h1, h2, h3, header, hr, main, nav, ol, p, pre, section, table, ul)')]
        .map((e) => e.tagName)
      const emptyP = [...document.querySelectorAll('p')].filter((p) => !p.childNodes.length).length
      const orphans = [...document.querySelectorAll('.tufte-note')].filter((n) => {
        const note = n.querySelector(':scope > :is(.tufte-sidenote, .tufte-marginnote)')
        const ref = n.querySelector(':scope > .tufte-note-ref')
        if (!note || !note.querySelector(':scope > .tufte-note-edge')) return true
        return note.matches('.tufte-sidenote') ? ref?.hash !== `#${note.id}` : !!ref
      }).length
      return { parsed, blockInP, emptyP, orphans, strayOutsideArticle: [...document.body.children].filter((e) => !e.matches('article.tufte, main:has(> article.tufte)')).length }
    }, Object.keys(written))
    // tbody is the one element the parser may add; nothing here relies on that.
    expect(report.parsed).toEqual(written)
    expect(report.blockInP).toEqual([])
    expect(report.emptyP).toBe(0)
    expect(report.orphans).toBe(0)
    expect(report.strayOutsideArticle).toBe(0)
  })

  test(`${slug}: every image loads, including those in closed notes and drawers`, async ({ page }) => {
    const failed = []
    page.on('response', (r) => { if (r.url().includes('localhost') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
    await goto(page, slug, { width: 390 })
    const srcs = await page.evaluate(() => [...document.images].map((i) => i.getAttribute('src')))
    expect(srcs.length).toBeGreaterThan(0)
    // Hidden images may be deferred, so check them in a fresh load of each file too.
    for (const src of new Set(srcs)) {
      const r = await page.request.get(src)
      expect(r.ok(), src).toBe(true)
      expect(r.headers()['content-type']).toMatch(/^image\//)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.evaluate(() => Promise.all([...document.images].filter((i) => i.getClientRects().length).map((i) => i.complete ? null : i.decode().catch(() => {}))))
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.getClientRects().length && !i.naturalWidth).map((i) => i.src))
    expect(broken).toEqual([])
    expect(failed).toEqual([])
  })
}

test('every image has an alt attribute, and hard-coded dimensions so the page does not jump', async ({ page }) => {
  await goto(page, 'kitchen-sink', { width: 1280 })
  const bad = await page.evaluate(() =>
    [...document.images].filter((i) => !i.hasAttribute('alt') || !i.hasAttribute('width') || !i.hasAttribute('height')).map((i) => i.getAttribute('src')),
  )
  expect(bad).toEqual([])
})

test.describe('print', () => {
  // 718px is A4 less Chromium's default margins, 500px a phone-sized sheet: both modes.
  for (const width of [718, 500]) {
    test(`all notes and drawers are shown at ${width}`, async ({ page }) => {
      await goto(page, 'kitchen-sink', { width, media: { media: 'print' } })
      await settle(page)
      const report = await page.evaluate(() => {
        const hidden = (sel) => [...document.querySelectorAll(sel)].filter((n) => !n.getClientRects().length || getComputedStyle(n).visibility === 'hidden').map((n) => n.textContent.slice(0, 30))
        const vw = document.documentElement.clientWidth
        const notes = [...document.querySelectorAll('.tufte-sidenote, .tufte-marginnote, .tufte-margin-block')]
        return {
          hidden: hidden('.tufte-sidenote, .tufte-marginnote, .tufte-margin-block, .tufte-drawer, .tufte-drawer-body'),
          tabs: [...document.querySelectorAll('.tufte-drawer-tab, .tufte-drawer-close')].filter((t) => t.getClientRects().length).length,
          off: notes.filter((n) => n.getBoundingClientRect().right > vw + 1).map((n) => n.textContent.slice(0, 30)),
          count: notes.length,
        }
      })
      expect(report.count).toBeGreaterThan(10)
      expect(report.hidden).toEqual([])
      expect(report.tabs).toBe(0)
      expect(report.off).toEqual([])
      expect(await overflow(page)).toBeLessThanOrEqual(0)
    })
  }

  test('a phone-sized sheet keeps each note where it was written, with no scroller and no marker', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 500, media: { media: 'print' } })
    const r = await page.evaluate(() => {
      const s = document.querySelector('.tufte')
      const p = [...document.querySelectorAll('section > p')].find((e) => e.querySelector('.tufte-sidenote'))
      const note = p.querySelector('.tufte-sidenote').getBoundingClientRect()
      const para = p.getBoundingClientRect()
      return {
        overflow: getComputedStyle(s).overflowX,
        scrolls: s.scrollWidth - s.clientWidth,
        markers: [...document.querySelectorAll('.tufte-note-edge')].filter((e) => e.getClientRects().length).length,
        inColumn: note.left >= para.left - 1 && note.right <= para.right + 1,
        inPara: note.top >= para.top - 1 && note.bottom <= para.bottom + 1,
      }
    })
    expect(r).toEqual({ overflow: 'visible', scrolls: 0, markers: 0, inColumn: true, inPara: true })
  })

  test('a paper-sized sheet keeps notes in the margin, with their numbers and no marker', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 718, media: { media: 'print' } })
    const r = await page.evaluate(() => {
      const p = [...document.querySelectorAll('section > p')].find((e) => e.querySelector('.tufte-sidenote'))
      const note = p.querySelector('.tufte-sidenote')
      return {
        beside: note.getBoundingClientRect().left >= p.getBoundingClientRect().right,
        number: getComputedStyle(note, '::before').content !== 'none',
        markers: [...document.querySelectorAll('.tufte-note-edge')].filter((e) => e.getClientRects().length).length,
      }
    })
    expect(r).toEqual({ beside: true, number: true, markers: 0 })
  })

  test('wide-layout print keeps drawers in the column they were written beside', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 718, media: { media: 'print' } })
    const ids = await drawerIds(page)
    for (const id of ids) {
      const r = await page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().toJSON())
      expect(r.width, id).toBeGreaterThan(100)
      expect(r.right, id).toBeLessThanOrEqual(718)
      expect(r.left, id).toBeGreaterThanOrEqual(0)
    }
  })
})
