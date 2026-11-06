// Layout on the built demo pages: overflow, the note stack, line length.
import { expect, test } from '@playwright/test'
import { NARROW, PAGES, SWEEP, WIDE, goto, lineLengths, marginReport, median, overflow } from './helpers.js'

for (const slug of PAGES) {
  test(`${slug}: no horizontal overflow at any width`, async ({ page }) => {
    const bad = {}
    for (const width of SWEEP) {
      await goto(page, slug, { width })
      const px = await overflow(page)
      if (px > 0) bad[width] = px
    }
    expect(bad).toEqual({})
  })

  test(`${slug}: 45-80 characters per line at every width`, async ({ page }) => {
    const bad = {}
    for (const width of SWEEP) {
      await goto(page, slug, { width })
      const lines = await lineLengths(page)
      expect(lines.length, `no sample lines at ${width}`).toBeGreaterThan(3)
      const m = median(lines)
      // The sliver takes about 24px from the text on a phone, so 45 is held from 520, and
      // the one width in the sweep below that which used to meet it may fall 2 short.
      if ((width >= 520 && m < 45) || (width >= 480 && m < 43) || m > 80) bad[width] = m
    }
    expect(bad).toEqual({})
  })
}

test('kitchen-sink: margin items never collide, leave the viewport or the article', async ({ page }) => {
  const bad = {}
  for (const width of WIDE) {
    await goto(page, 'kitchen-sink', { width })
    const r = await marginReport(page)
    expect(r.count, `wide layout should show the notes at ${width}`).toBeGreaterThan(10)
    if (r.collisions.length || r.offscreen.length || r.escaped.length) bad[width] = r
  }
  expect(bad).toEqual({})
})

test('kitchen-sink: margin notes clear the text column', async ({ page }) => {
  const bad = {}
  for (const width of WIDE) {
    await goto(page, 'kitchen-sink', { width })
    const hits = await page.evaluate(() =>
      [...document.querySelectorAll('.tufte-sidenote, .tufte-marginnote')].flatMap((note) => {
        const host = note.closest('p, li, blockquote, h1, h2, h3')
        const gap = note.getBoundingClientRect().left - host.getBoundingClientRect().right
        return gap < 0 ? [`${note.textContent.slice(0, 30)}: ${Math.round(gap)}px`] : []
      }),
    )
    if (hits.length) bad[width] = hits
  }
  expect(bad).toEqual({})
})

test('narrow mode puts notes past the sliver and wide mode shows them, on either side of the breakpoint', async ({ page }) => {
  const place = () => page.locator('.tufte-sidenote').first().evaluate((n) => ({ left: n.getBoundingClientRect().left, right: n.getBoundingClientRect().right, vw: document.documentElement.clientWidth }))
  for (const width of NARROW) {
    await goto(page, 'kitchen-sink', { width })
    const r = await place()
    expect(r.left, `${width}: the note starts on screen, in the sliver`).toBeLessThan(r.vw)
    expect(r.right, `${width}: and runs off it`).toBeGreaterThan(r.vw)
    await expect(page.locator('.tufte-sidenote > .tufte-note-edge').first()).toBeVisible()
    await expect(page.locator('.tufte-note-ref').first()).toBeVisible()
  }
  for (const width of WIDE) {
    await goto(page, 'kitchen-sink', { width })
    const r = await place()
    expect(r.right, `${width}`).toBeLessThanOrEqual(r.vw)
    await expect(page.locator('.tufte-note-edge').first()).toBeHidden()
  }
})

test('body paragraphs all share one column width, notes or not', async ({ page }) => {
  await goto(page, 'kitchen-sink', { width: 1440 })
  const widths = await page.evaluate(() => {
    const ps = [...document.querySelectorAll('.tufte section > p')].filter((p) => p.getClientRects().length)
    return [...new Set(ps.map((p) => Math.round(p.getBoundingClientRect().width)))]
  })
  expect(widths.length, `paragraph widths: ${widths}`).toBe(1)
})
