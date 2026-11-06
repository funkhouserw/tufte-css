// Inputs the demos don't contain, in the contract's own markup (DESIGN.md), served as
// static HTML so the real parser sees them. A failure here is a kit bug, not a flaky
// test: these stay red until the kit is fixed.
import { expect, test } from '@playwright/test'
import { counterValues, fixture, goto, marginReport, offScreenBy, overflow, pressTab, rectOf, waitOpen } from './helpers.js'

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. '
const LONG = LOREM.repeat(8)
const URL = `https://example.com/${'a'.repeat(160)}/${'b'.repeat(60)}`
const WIDTHS = [320, 390, 767, 768, 820, 1024, 1440, 2560]

let uid = 0
const note = (text) => { const id = `n${++uid}`; return `<span class="tufte-note"><a class="tufte-note-ref" href="#${id}"><span class="tufte-sr">Note</span></a><span class="tufte-sidenote" id="${id}" role="note"><a class="tufte-note-edge" href="#${id}" aria-label="Note" tabindex="-1">note</a>${text}</span></span>` }
const margin = (text) => { const id = `n${++uid}`; return `<span class="tufte-note"><span class="tufte-marginnote" id="${id}" role="note"><a class="tufte-note-edge" href="#${id}" aria-label="Margin note">note</a>${text}</span></span>` }
const drawer = (id, label, body) => `<span class="tufte-drawer-wrap"><button class="tufte-drawer-tab" type="button" popovertarget="${id}" style="anchor-name:--${id}">${label}</button><span class="tufte-drawer" id="${id}" popover="auto" role="group" aria-label="${label}" style="position-anchor:--${id}"><span class="tufte-drawer-body" tabindex="0">${body}</span><button class="tufte-drawer-close" type="button" popovertarget="${id}" popovertargetaction="hide">Close</button></span></span>`
const tab = (id, label) => `<span class="tufte-drawer-wrap"><button class="tufte-drawer-tab" type="button" popovertarget="${id}" style="anchor-name:--${id}">${label}</button></span>`
const blockDrawer = (id, body) => `<aside class="tufte-drawer" id="${id}" popover="auto" role="group" aria-label="${id}" style="position-anchor:--${id}"><div class="tufte-drawer-body" tabindex="0">${body}</div><button class="tufte-drawer-close" type="button" popovertarget="${id}" popovertargetaction="hide">Close</button></aside>`
const article = (inner) => `<article class="tufte"><section>${inner}</section></article>`
const IMG = '<img src="/img/rhino.png" alt="A rhinoceros" width="1244" height="920">'
const wideTable = `<table><thead><tr>${'<th>Long column header</th>'.repeat(12)}</tr></thead><tbody><tr>${'<td>some cell data</td>'.repeat(12)}</tr></tbody></table>`

async function expectStable(page, label, widths = WIDTHS, build) {
  const bad = {}
  for (const width of widths) {
    await build(width)
    const r = await marginReport(page)
    const px = await overflow(page)
    if (px > 0 || r.collisions.length || r.offscreen.length || r.escaped.length) bad[width] = { overflowPx: px, ...r }
  }
  expect(bad, label).toEqual({})
}

test.describe('note stacking under load', () => {
  const cases = {
    'very long note in the last paragraph': `<p>${LOREM}</p><p>Last paragraph.${note(LONG)}</p>`,
    'many notes in one short paragraph': `<p>Short.${note(LOREM)} A.${note(LOREM)} B.${margin(LOREM)} C.${note('x')} D.${note(LOREM)} E.${note('y')} F.${note(LOREM)}</p><p>Next.${note('z')}</p>`,
    'notes in a heading, list, blockquote and nested wrappers': `<h2>Heading${note(LOREM)} text</h2><h3>Lower${note('h3')}</h3><ul><li>Item${note('li')} ${LOREM}<ul><li>Nested${note('nested')} ${LOREM}</li></ul></li></ul><blockquote><p>Quote${note(LOREM)} ${LOREM}</p></blockquote><div><div><div><div><p>Deep${note('deep')} ${LOREM}</p></div></div></div></div>`,
    'long unbroken URLs in note, body, heading, list, quote, caption and block note': `<p>Body ${URL} text.${note(`Note ${URL}`)}</p><h2>${URL}</h2><ul><li>${URL}</li></ul><blockquote>${URL}</blockquote><aside class="tufte-margin-block">${URL}</aside><figure class="tufte-figure" data-size="main">${IMG}<figcaption>${URL}</figcaption></figure><figure class="tufte-figure" data-size="full">${IMG}<figcaption>${URL}</figcaption></figure>`,
    'wide code block and wide table scroll inside themselves': `<pre><code>${'const wide = 1; '.repeat(40)}</code></pre><div class="tufte-table">${wideTable}</div><div class="tufte-full"><div class="tufte-table">${wideTable}</div></div><p>After${note('after')}</p>`,
    'full figure right after a long note': `<p>Text${note(LONG)}</p><figure class="tufte-figure" data-size="full">${IMG}<figcaption>${LOREM.repeat(3)}</figcaption></figure><p>Text${note('after')}</p>`,
    'main figure caption against a long note': `<p>Text${note(LONG)}</p><figure class="tufte-figure" data-size="main">${IMG}<figcaption>${LOREM.repeat(4)}</figcaption></figure><p>Text${note('after')}</p>`,
    'margin figure, block note and notes all at once': `<p>${LOREM}${note(LOREM)}</p><aside class="tufte-margin-block"><p>${LOREM}</p><p>${LOREM}</p></aside><figure class="tufte-figure" data-size="margin">${IMG}<figcaption>${LOREM}</figcaption></figure><p>Text${margin(LOREM)}</p>`,
  }
  for (const [name, body] of Object.entries(cases)) {
    test(name, async ({ page }) => {
      await expectStable(page, name, WIDTHS, (width) => fixture(page, article(body), { width }))
    })
  }

  test('a main figure caption stays beside its image, not stranded below it', async ({ page }) => {
    await fixture(page, article(`<p>Text${note(LONG)}</p><figure class="tufte-figure" data-size="main">${IMG}<figcaption>Caption.</figcaption></figure><p>${LOREM}</p>`), { width: 1440 })
    const gap = await page.evaluate(() => document.querySelector('figcaption').getBoundingClientRect().top - document.querySelector('.tufte-figure img').getBoundingClientRect().bottom)
    expect(gap).toBeLessThan(0)
  })

  test('a full figure after a long note does not leave a screen of blank text column', async ({ page }) => {
    await fixture(page, article(`<p>Text${note(LONG)}</p><figure class="tufte-figure" data-size="full">${IMG}</figure>`), { width: 1440 })
    const gap = await page.evaluate(() => document.querySelector('.tufte-figure').getBoundingClientRect().top - document.querySelector('p').getBoundingClientRect().bottom)
    expect(gap).toBeLessThan(450)
  })
})

test.describe('margin items in other places', () => {
  const check = (name, body) =>
    test(name, async ({ page }) => {
      await expectStable(page, name, [768, 820, 1024, 1440], (width) => fixture(page, body, { width }))
    })

  check('block note as a direct child of the article', `<article class="tufte"><p>${LOREM}</p><aside class="tufte-margin-block">Block note</aside></article>`)
  check('margin figure as a direct child of the article', `<article class="tufte"><p>${LOREM}</p><figure class="tufte-figure" data-size="margin">${IMG}<figcaption>Caption</figcaption></figure></article>`)
  check('sidenote inside a block note', article(`<p>${LOREM}</p><aside class="tufte-margin-block">Block${note('in a block note')}</aside>`))
  check('sidenote inside a main figure caption', article(`<figure class="tufte-figure" data-size="main">${IMG}<figcaption>Caption${note('in a caption')}</figcaption></figure>`))
  check('sidenote inside a margin figure caption', article(`<figure class="tufte-figure" data-size="margin">${IMG}<figcaption>Caption${note('in a caption')}</figcaption></figure>`))
  check('sidenote in a div directly inside Full', article(`<div class="tufte-full"><div>Text${note('in full div')}</div></div>`))
  check('main figure inside Full', article(`<div class="tufte-full"><figure class="tufte-figure" data-size="main">${IMG}<figcaption>Caption</figcaption></figure></div>`))

  test('Full nested in a blockquote or list does not widen the page', async ({ page }) => {
    const bad = {}
    for (const width of WIDTHS) {
      await fixture(page, article(`<blockquote><div class="tufte-full"><p>${LOREM}</p></div></blockquote><ul><li><div class="tufte-full"><p>${LOREM}</p></div></li></ul>`), { width })
      const px = await overflow(page)
      if (px > 0) bad[width] = px
    }
    expect(bad).toEqual({})
  })

  test('a note in a table cell is not lost behind the scroller', async ({ page }) => {
    await fixture(page, article(`<div class="tufte-table"><table><tbody><tr>${'<td>some long cell data here</td>'.repeat(10)}<td>Last${note('in a cell')}</td></tr></tbody></table></div>`), { width: 1440 })
    const r = await page.evaluate(() => {
      const n = document.querySelector('.tufte-sidenote').getBoundingClientRect()
      const w = document.querySelector('.tufte-table').getBoundingClientRect()
      return { noteRight: n.right, wrapRight: w.right, noteLeft: n.left, wrapLeft: w.left }
    })
    expect(r.noteRight).toBeLessThanOrEqual(r.wrapRight)
    expect(r.noteLeft).toBeGreaterThanOrEqual(r.wrapLeft)
  })
})

test.describe('notes ignore the type around them', () => {
  test('kitchen-sink: a note inside NewThought is not set in small caps', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 1440 })
    const note = page.locator('.tufte-newthought .tufte-sidenote').first()
    await expect(note).toHaveCSS('font-variant-caps', 'normal')
  })

  test('a drawer inside NewThought is not set in small caps', async ({ page }) => {
    await fixture(page, article(`<p><span class="tufte-newthought">Starts${drawer('d1', 'Tab', 'Drawer text')}</span> here.</p>`), { width: 1440 })
    await page.locator('.tufte-drawer-tab').click()
    await expect(page.locator('.tufte-drawer-body')).toHaveCSS('font-variant-caps', 'normal')
  })

  test('a note inside code or a monospaced run keeps the note font', async ({ page }) => {
    await fixture(page, article(`<p>Run <code>code${note('in code')}</code> and plain${note('plain')}.</p>`), { width: 1440 })
    const fonts = await page.evaluate(() => [...document.querySelectorAll('.tufte-sidenote')].map((n) => getComputedStyle(n).fontFamily))
    expect(fonts[0]).toBe(fonts[1])
  })

  test('a drawer tab in a heading is the same size as any other', async ({ page }) => {
    await fixture(page, article(`<h2>Heading${drawer('d1', 'Tab', 'x')}</h2><p>Text${drawer('d2', 'Tab', 'y')}</p>`), { width: 1440 })
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.tufte-drawer-tab')].map((t) => parseFloat(getComputedStyle(t).fontSize)))
    expect(Math.abs(sizes[0] - sizes[1])).toBeLessThan(1)
  })
})

test.describe('content inside a block drawer, which the contract says may be any flow content', () => {
  const body = `<p>Para${note('A sidenote in a drawer')} text.</p><figure class="tufte-figure" data-size="main">${IMG}<figcaption>Main caption in a drawer</figcaption></figure><aside class="tufte-margin-block">Block note in a drawer</aside><p>${margin('A margin note in a drawer')}</p>`
  const page1 = article(`<p>Before${note('first page note')}. ${tab('dd', 'Open')}</p>${blockDrawer('dd', body)}<p>After${note('second page note')}</p>`)

  for (const width of [820, 1440]) {
    test(`nothing in it needs horizontal scrolling at ${width}`, async ({ page }) => {
      await fixture(page, page1, { width })
      await page.locator('.tufte-drawer-tab').click()
      await waitOpen(page, 'dd')
      const r = await page.evaluate(() => {
        const b = document.querySelector('.tufte-drawer-body')
        const box = b.getBoundingClientRect()
        const hidden = [...b.querySelectorAll('.tufte-sidenote, .tufte-marginnote, .tufte-margin-block, figcaption')].filter((n) => n.getBoundingClientRect().right > box.right + 1).map((n) => n.textContent)
        return { hidden, extra: b.scrollWidth - b.clientWidth }
      })
      expect(r.hidden).toEqual([])
      expect(r.extra).toBeLessThanOrEqual(0)
    })
  }

  test('opening it does not renumber the notes on the page', async ({ page }) => {
    await fixture(page, article(`<p>Before${note('a')}. ${tab('dd', 'Open')}</p>${blockDrawer('dd', `<p>In drawer${note('b')}</p>`)}<p>After${note('c')}</p>`), { width: 1440 })
    const closed = (await counterValues(page)).refs
    await page.locator('.tufte-drawer-tab').focus()
    await page.keyboard.press('Enter')
    await waitOpen(page, 'dd')
    expect((await counterValues(page)).refs).toEqual(closed)
  })
})

test.describe('right to left', () => {
  for (const width of [820, 1440]) {
    test(`drawer tabs and panels stay on screen at ${width}`, async ({ page }) => {
      await fixture(page, article(`<p>${LOREM} ${drawer('d1', 'Tab', 'Drawer text')}</p><p>Text${note('note')}</p>`), { width, dir: 'rtl' })
      const t = await rectOf(page.locator('.tufte-drawer-tab'))
      expect(offScreenBy(t), 'tab').toBeLessThanOrEqual(1)
      await page.locator('.tufte-drawer-tab').focus({ preventScroll: true })
      await page.keyboard.press('Enter')
      await waitOpen(page, 'd1')
      expect(offScreenBy(await rectOf(page.locator('#d1'))), 'panel').toBeLessThanOrEqual(1)
    })
  }

  test('notes go to the margin on the left', async ({ page }) => {
    await fixture(page, article(`<p>${LOREM}${note('note')}</p>`), { width: 1440, dir: 'rtl' })
    const r = await page.evaluate(() => ({ note: document.querySelector('.tufte-sidenote').getBoundingClientRect().right, para: document.querySelector('p').getBoundingClientRect().left }))
    expect(r.note).toBeLessThanOrEqual(r.para)
  })
})

test.describe('host pages', () => {
  const body = article(`<p>${LOREM}${note('A note that belongs in the margin')}</p><p>${LOREM}</p>`)
  const inMargin = (page) =>
    page.evaluate(() => {
      const n = document.querySelector('.tufte-sidenote').getBoundingClientRect()
      const p = document.querySelector('p').getBoundingClientRect()
      return { gap: n.left - p.right, pWidth: p.width }
    })

  const resets = {
    'universal margin/padding reset': '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
    'Josh Comeau style reset': '*,*::before,*::after{box-sizing:border-box}*{margin:0}img,svg{display:block;max-width:100%}',
  }
  for (const [name, css] of Object.entries(resets)) {
    test(`unlayered ${name}: notes stay out of the text column`, async ({ page }) => {
      await fixture(page, body, { width: 1440, head: `<style>${css}</style>` })
      expect((await inMargin(page)).gap).toBeGreaterThanOrEqual(0)
    })
  }

  test('Bootstrap-style element rules: a direct-child paragraph keeps its column', async ({ page }) => {
    await fixture(page, `<article class="tufte"><p class="tufte-subtitle">Subtitle</p><section><p>${LOREM}</p></section></article>`, { width: 1440, head: '<style>p{margin:0 0 1rem}</style>' })
    const r = await page.evaluate(() => ({ sub: document.querySelector('.tufte-subtitle').getBoundingClientRect().left, para: document.querySelector('section p').getBoundingClientRect().left }))
    expect(Math.abs(r.sub - r.para)).toBeLessThanOrEqual(1)
  })

  test('Host element rules for links do not knock the reference out of the line', async ({ page }) => {
    await fixture(page, body, { width: 390, head: '<style>a{display:block}</style>' })
    await expect(page.locator('.tufte-note-ref').first()).toHaveCSS('display', 'inline')
  })

  test('a root font-size hack does not change the kit', async ({ page }) => {
    await fixture(page, body, { width: 1440, head: '<style>html{font-size:62.5%}body{font-size:1.2rem;line-height:1}</style>' })
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('p')).fontSize))).toBeCloseTo(21, 0)
  })

  for (const [name, wrap] of Object.entries({
    'a flex row': (b) => `<div style="display:flex"><nav style="width:200px">nav</nav>${b}</div>`,
    'a centring flex body': (b) => `<div style="display:flex;justify-content:center">${b}</div>`,
    'a shrink-to-fit float': (b) => `<div style="float:left">${b}</div>`,
  })) {
    test(`the article has a usable width inside ${name}`, async ({ page }) => {
      await fixture(page, wrap(body), { width: 1440 })
      expect(await page.evaluate(() => document.querySelector('.tufte').getBoundingClientRect().width)).toBeGreaterThan(300)
    })
  }

  for (const hostWidth of [300, 500, 800]) {
    test(`a ${hostWidth}px host column picks its mode from the column, not the viewport`, async ({ page }) => {
      await fixture(page, `<div style="width:${hostWidth}px;margin:auto">${article(`<p>${LOREM}${note('note')} ${drawer('d1', 'Tab', 'Drawer text')}</p>`)}</div>`, { width: 1440 })
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      // A narrow column slides, whatever the viewport: its marker shows only then.
      await expect(page.locator('.tufte-note-edge')).toBeVisible({ visible: hostWidth < 768 })
      const r = await page.evaluate(() => {
        const s = document.querySelector('.tufte')
        return { scrolls: s.scrollWidth > s.clientWidth, end: document.querySelector('.tufte-sidenote').getBoundingClientRect().right - s.getBoundingClientRect().right }
      })
      expect(r.scrolls).toBe(hostWidth < 768)
      expect(r.end > 0).toBe(hostWidth < 768)
      await page.locator('.tufte-drawer-tab').focus()
      await page.keyboard.press('Enter')
      await waitOpen(page, 'd1')
      expect(offScreenBy(await rectOf(page.locator('#d1')))).toBeLessThanOrEqual(1)
    })
  }

  test('two articles on one page number their notes separately', async ({ page }) => {
    await fixture(page, `${article(`<p>One${note('a')} two${note('b')}</p>`)}${article(`<p>One${note('c')}</p>`)}`, { width: 1440 })
    expect((await counterValues(page)).refs).toEqual([1, 2, 1])
  })
})

test.describe('browser text size at 200%', () => {
  // .tufte's font-size is `medium`. Setting it to 32px is what a 200% default font gives.
  const head = '<style>.tufte{font-size:32px}</style>'
  const body = article(`<h2>Heading${note(LOREM)}</h2><p>${LOREM}${note(LOREM)}</p><pre><code>${'wide '.repeat(60)}</code></pre><figure class="tufte-figure" data-size="main">${IMG}<figcaption>${LOREM}</figcaption></figure><p>${LOREM}</p>`)
  test('nothing overflows or collides, and the wide layout waits for its room', async ({ page }) => {
    await expectStable(page, '200%', [320, 390, 768, 1024, 1440, 1536, 2560], (width) => fixture(page, body, { width, head }))
    await fixture(page, body, { width: 1440, head })
    await expect(page.locator('.tufte-sidenote > .tufte-note-edge').first()).toBeVisible()
    await fixture(page, body, { width: 1536, head })
    await expect(page.locator('.tufte-note-edge').first()).toBeHidden()
  })
})

test.describe('accessibility semantics', () => {
  test('note markers are links with distinct, written-out accessible names', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390 })
    const refs = await page.locator('.tufte-note-ref').count()
    const notes = await page.locator('.tufte-sidenote').count()
    expect(refs).toBe(notes)
    for (let n = 1; n <= refs; n++) {
      await expect(page.locator('.tufte-note-ref').nth(n - 1)).toHaveAccessibleName(new RegExp(`^Note( in drawer)? \\d+$`))
    }
    await expect(page.getByRole('link', { name: 'Note 4', exact: true }).first()).toBeVisible()
    const stops = page.locator('.tufte-note-ref, .tufte-note-edge:not([tabindex="-1"])')
    const names = await stops.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent.trim()))
    expect(new Set(names).size).toBe(names.length)
  })

  test('every side-scrolling region can be reached and scrolled by keyboard', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390 })
    const scrollers = await page.evaluate(() =>
      [...document.querySelectorAll('.tufte pre, .tufte-table')].filter((e) => e.scrollWidth > e.clientWidth).length)
    expect(scrollers).toBeGreaterThan(0)
    const reached = new Set()
    for (let i = 0; i < 400; i++) {
      await pressTab(page)
      const hit = await page.evaluate(() => {
        const a = document.activeElement
        if (a === document.body) return 'end'
        return a.matches('.tufte pre, .tufte-table') || a.closest('.tufte pre, .tufte-table') ? (a.closest('.tufte pre, .tufte-table').textContent.slice(0, 40)) : null
      })
      if (hit === 'end' && i > 3) break
      if (hit && hit !== 'end') reached.add(hit)
    }
    expect(reached.size).toBe(scrollers)
  })
})

test.describe('print', () => {
  test('a wide table is not cut off at the page edge', async ({ page }) => {
    await fixture(page, article(`<div class="tufte-table">${wideTable}</div>`), { width: 718, media: { media: 'print' } })
    const r = await page.evaluate(() => document.querySelector('table').getBoundingClientRect().right)
    expect(r).toBeLessThanOrEqual(718)
  })

  test('wide code wraps rather than clips', async ({ page }) => {
    await fixture(page, article(`<pre><code>${'const wide = 1; '.repeat(40)}</code></pre>`), { width: 718, media: { media: 'print' } })
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    const r = await page.evaluate(() => document.querySelector('pre > code').getBoundingClientRect().right)
    expect(r).toBeLessThanOrEqual(718)
  })
})

test('keyboard walk: every stop in the kitchen sink is on screen with a visible ring', async ({ page }) => {
  for (const width of [390, 1440]) {
    await goto(page, 'kitchen-sink', { width, height: 800, media: { reducedMotion: 'reduce' } })
    const problems = []
    let stops = 0
    for (let i = 0; i < 300; i++) {
      await pressTab(page)
      const s = await page.evaluate(() => {
        const a = document.activeElement
        if (a === document.body || a === document.documentElement) return null
        if (a.tagName === 'IFRAME') return { skip: true }
        const r = a.getBoundingClientRect()
        return {
          name: `${a.tagName.toLowerCase()}.${a.className}`,
          ring: getComputedStyle(a).outlineStyle,
          inView: r.bottom > 0 && r.top < innerHeight && r.left >= -1 && r.right <= document.documentElement.clientWidth + 1 && r.height > 0,
        }
      })
      if (!s) { if (i > 3) break; continue }
      if (s.skip) continue
      stops++
      if (s.ring === 'none') problems.push(`${width} no ring: ${s.name}`)
      if (!s.inView) problems.push(`${width} off screen: ${s.name}`)
    }
    expect(stops, `${width}: reachable stops`).toBeGreaterThan(5)
    expect(problems).toEqual([])
  }
})
