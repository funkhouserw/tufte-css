// Note numbering and the markers, which must work without JavaScript.
import { expect, test } from '@playwright/test'
import { MARGIN_ITEMS, counterValues, goto, scrollState, settle, slideTo, tabUntil } from './helpers.js'

const STOPS = '.tufte-note-ref, .tufte-note-edge'

test.describe('numbering', () => {
  for (const width of [390, 1440]) {
    test(`kitchen-sink numbers run 1..n and each note matches its reference at ${width}`, async ({ page }) => {
      await goto(page, 'kitchen-sink', { width })
      const { refs, notes } = await counterValues(page)
      expect(refs.length).toBeGreaterThan(5)
      expect(refs).toEqual(refs.map((_, i) => i + 1))
      expect(notes).toEqual(refs)
    })
  }

  test('each written-out marker matches the number the CSS counter gives its note', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390 })
    const words = await page.locator('.tufte-sidenote > .tufte-note-edge').allTextContents()
    const names = await page.locator('.tufte-sidenote').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    const { notes } = await counterValues(page)
    expect(words).toEqual(notes.map((n) => `note ${n}`))
    expect(names).toEqual(notes.map((n) => `Note ${n}`))
  })
})

test.describe('narrow markers by keyboard, JS off', () => {
  test.use({ javaScriptEnabled: false })

  test('every note in the margin has one tab stop, with a visible focus ring, and Enter brings it into view', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const total = await page.locator(MARGIN_ITEMS).count()
    expect(total).toBeGreaterThan(5)
    for (let seen = 0; seen < total; seen++) {
      const presses = await tabUntil(page, STOPS)
      expect(presses, `marker ${seen} not reachable by Tab`).toBeGreaterThan(0)
      const before = await page.evaluate(() => {
        const link = document.activeElement
        const note = document.querySelector(link.hash)
        const r = link.getBoundingClientRect()
        return { name: link.textContent, ring: getComputedStyle(link).outlineStyle, left: r.left, right: r.right, vw: document.documentElement.clientWidth, target: !!note }
      })
      expect(before.target, before.name).toBe(true)
      expect(before.ring, before.name).toBe('solid')
      expect(before.left, before.name).toBeGreaterThanOrEqual(0)
      expect(before.right, before.name).toBeLessThanOrEqual(before.vw)
      await page.keyboard.press('Enter')
      await settle(page)
      await expect.poll(() => page.evaluate(() => {
        const r = document.querySelector(location.hash).getBoundingClientRect()
        return r.left >= 0 && r.right <= document.documentElement.clientWidth && r.top < innerHeight && r.bottom > 0
      }), `note ${seen} not brought into view`).toBe(true)
      // The next Tab has to start from the marker, not from the note the link went to.
      await page.evaluate(() => { document.querySelector('.tufte').scrollTo({ left: 0, behavior: 'instant' }) })
    }
  })

  test('tapping the number reaches its note', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const note = page.locator('.tufte-note:has(.tufte-note-ref)').first()
    await note.locator('.tufte-note-ref').click()
    await expect.poll(() => note.locator('.tufte-sidenote').evaluate((n) => n.getBoundingClientRect().right <= document.documentElement.clientWidth)).toBe(true)
    await expect(note.locator('.tufte-sidenote')).toBeInViewport({ ratio: 0.5 })
  })

  test('tapping the word in the sliver reaches its note', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const note = page.locator('.tufte-marginnote').first()
    await note.locator('.tufte-note-edge').click()
    await expect.poll(() => note.evaluate((n) => n.getBoundingClientRect().right <= document.documentElement.clientWidth)).toBe(true)
  })

  test('focus moving on from a note brings the view back to the next marker', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const { max } = await scrollState(page)
    await slideTo(page, max)
    await page.locator('.tufte-note-ref').nth(1).focus()
    await settle(page)
    const r = await page.locator('.tufte-note-ref').nth(1).evaluate((el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, vw: document.documentElement.clientWidth } })
    expect(r.left).toBeGreaterThanOrEqual(0)
    expect(r.right).toBeLessThanOrEqual(r.vw)
    expect([0, max]).toContain((await scrollState(page)).left)
  })

  test('a link inside a note slides the margin into view when focused, and the view is not left between stops', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const link = page.locator('.tufte-sidenote a:not(.tufte-note-edge)').first()
    await link.focus()
    await expect.poll(() => link.evaluate((el) => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= document.documentElement.clientWidth })).toBe(true)
    const { left, max } = await scrollState(page)
    expect(left).toBeCloseTo(max, 0)
  })

  test('wide layout has no dead tab stops on note markers', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 1440 })
    expect(await tabUntil(page, STOPS, 80)).toBe(-1)
  })
})
