// Drawers: open, close, dismiss, focus return, staying on screen. All of it with JS off,
// since the contract says pages ship none.
import { expect, test } from '@playwright/test'
import { activeId, drawerIds, goto, isOpen, offScreenBy, panel, pressTab, rectOf, settle, tabFor, waitOpen } from './helpers.js'

test.use({ javaScriptEnabled: false })

const WIDTHS = [390, 767, 768, 820, 1024, 1440, 2560]
const openByClick = async (page, id) => {
  await tabFor(page, id).scrollIntoViewIfNeeded()
  await tabFor(page, id).click()
  await waitOpen(page, id)
}

for (const width of [390, 1440]) {
  test.describe(`at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await goto(page, 'kitchen-sink', { width })
    })

    test('the demo has drawers, all closed', async ({ page }) => {
      const ids = await drawerIds(page)
      expect(ids.length).toBeGreaterThanOrEqual(3)
      for (const id of ids) await expect(panel(page, id)).toBeHidden()
    })

    test('Close button closes and returns focus to the tab', async ({ page }) => {
      for (const id of await drawerIds(page)) {
        await tabFor(page, id).focus()
        await page.keyboard.press('Enter')
        await waitOpen(page, id)
        await panel(page, id).locator('.tufte-drawer-close').focus()
        await page.keyboard.press('Enter')
        await waitOpen(page, id, false)
        expect(await activeId(page)).toContain(`[popovertarget=${id}]`)
      }
    })

    test('Escape closes and returns focus to the tab', async ({ page }) => {
      for (const id of await drawerIds(page)) {
        await tabFor(page, id).focus()
        await page.keyboard.press('Enter')
        await waitOpen(page, id)
        await page.keyboard.press('Escape')
        await waitOpen(page, id, false)
        expect(await activeId(page)).toContain(`[popovertarget=${id}]`)
      }
    })

    test('Tab from the open tab goes into the panel, then to Close', async ({ page }) => {
      for (const id of await drawerIds(page)) {
        await tabFor(page, id).focus()
        await page.keyboard.press('Enter')
        await waitOpen(page, id)
        await pressTab(page)
        expect(await page.evaluate((id) => document.activeElement.closest(`#${id}`) !== null, id), `${id} body`).toBe(true)
        expect(await activeId(page)).toContain('tufte-drawer-body')
        await pressTab(page)
        expect(await activeId(page)).toContain('tufte-drawer-close')
        await page.keyboard.press('Escape')
        await waitOpen(page, id, false)
      }
    })

    test('clicking elsewhere dismisses', async ({ page }) => {
      const [id] = await drawerIds(page)
      await openByClick(page, id)
      await page.mouse.click(width - 2, 3)
      await waitOpen(page, id, false)
    })

    test('the tab closes what it opened', async ({ page }) => {
      const [id] = await drawerIds(page)
      await openByClick(page, id)
      const r = await rectOf(tabFor(page, id))
      // An anchored panel opens beside its tab. Without anchor positioning it may not.
      test.skip(await page.evaluate(([x, y, id]) => document.elementFromPoint(x, y)?.closest(`#${id}`) !== null, [r.left + 3, r.top + 3, id]), 'tab covered by the panel')
      await tabFor(page, id).click()
      await waitOpen(page, id, false)
    })

    test('a second drawer replaces the first, even opened straight after it', async ({ page }) => {
      const [a, b] = await drawerIds(page)
      await tabFor(page, a).focus()
      await page.keyboard.press('Enter')
      await tabFor(page, b).focus()
      await page.keyboard.press('Enter')
      await waitOpen(page, b)
      expect(await isOpen(page, a)).toBe(false)
      await expect(panel(page, a)).toBeHidden()
      const r = await rectOf(panel(page, b))
      expect(offScreenBy(r)).toBeLessThanOrEqual(1)
    })
  })
}

const SIZES = [[390, 844], [390, 500], [767, 900], [768, 900], [820, 900], [1024, 900], [1440, 900], [1440, 500], [2560, 900]]
for (const [width, height] of SIZES) {
  test(`every drawer stays on screen with its Close button reachable at ${width}x${height}`, async ({ page }) => {
    // Geometry only, so skip the 240ms slide on each of the many opens.
    await goto(page, 'kitchen-sink', { width, height, media: { reducedMotion: 'reduce' } })
    const problems = []
    for (const id of await drawerIds(page)) {
      for (const block of ['center', 'start', 'end']) {
        await tabFor(page, id).evaluate((el, block) => el.scrollIntoView({ block, behavior: 'instant' }), block)
        await tabFor(page, id).focus({ preventScroll: true })
        await page.keyboard.press('Enter')
        await waitOpen(page, id)
        const p = await rectOf(panel(page, id))
        const close = await rectOf(panel(page, id).locator('.tufte-drawer-close'))
        if (offScreenBy(p) > 1) problems.push(`${id}/${block}: panel off by ${Math.round(offScreenBy(p))}px ${JSON.stringify(p)}`)
        if (offScreenBy(close) > 1) problems.push(`${id}/${block}: Close off by ${Math.round(offScreenBy(close))}px`)
        if (p.height < 60) problems.push(`${id}/${block}: panel only ${p.height}px tall`)
        await page.keyboard.press('Escape')
        await waitOpen(page, id, false)
      }
    }
    expect(problems).toEqual([])
  })
}

for (const width of [820, 1440]) {
  test(`an open drawer stays on screen when its tab is scrolled away at ${width}`, async ({ page }) => {
    await goto(page, 'kitchen-sink', { width })
    const [id] = await drawerIds(page)
    await tabFor(page, id).scrollIntoViewIfNeeded()
    await tabFor(page, id).focus({ preventScroll: true })
    await page.keyboard.press('Enter')
    await waitOpen(page, id)
    const problems = []
    for (const dy of [-1500, 1500, 3000]) {
      await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'instant' }), dy)
      await page.waitForTimeout(150)
      await settle(page)
      if (!(await isOpen(page, id))) continue
      const r = await rectOf(panel(page, id))
      if (offScreenBy(r) > 1) problems.push(`scroll ${dy}: off by ${Math.round(offScreenBy(r))}px, top ${Math.round(r.top)}`)
    }
    expect(problems).toEqual([])
  })
}

test.describe('on a narrow screen a drawer opens from its line, not as a bottom sheet', () => {
  const anchored = (page) => page.evaluate(() => CSS.supports('top: anchor(top)') && CSS.supports('position-try-fallbacks: --x'))
  const openAt = async (page, id, block) => {
    await tabFor(page, id).evaluate((el, block) => el.scrollIntoView({ block, behavior: 'instant' }), block)
    await tabFor(page, id).focus({ preventScroll: true })
    await page.keyboard.press('Enter')
    await waitOpen(page, id)
    return { panel: await rectOf(panel(page, id)), tab: await rectOf(tabFor(page, id)) }
  }

  for (const width of [320, 390, 767]) {
    test(`at ${width} it opens below a tab high on the screen, and above one low on it`, async ({ page }) => {
      await goto(page, 'kitchen-sink', { width, height: 800, media: { reducedMotion: 'reduce' } })
      const [id] = await drawerIds(page)
      const high = await openAt(page, id, 'center')
      expect(offScreenBy(high.panel)).toBeLessThanOrEqual(1)
      expect(high.panel.left).toBeGreaterThan(0)
      expect(high.panel.width).toBeGreaterThan(width - 40)
      if (await anchored(page)) {
        await page.keyboard.press('Escape')
        await waitOpen(page, id, false)
        const top = await openAt(page, id, 'start')
        expect(top.panel.top, 'below its tab').toBeGreaterThanOrEqual(top.tab.bottom - 1)
        await page.keyboard.press('Escape')
        await waitOpen(page, id, false)
        const low = await openAt(page, id, 'end')
        expect(low.panel.bottom, 'above its tab').toBeLessThanOrEqual(low.tab.top + 1)
        expect(low.panel.top).toBeGreaterThanOrEqual(0)
      } else {
        expect(high.panel.bottom, 'not stuck to the bottom of the screen').toBeLessThan(high.panel.vh - 1)
      }
    })
  }
})

test.describe('resized across the breakpoint while open', () => {
  for (const [from, to] of [[1440, 390], [390, 1440], [800, 700]]) {
    test(`${from} to ${to}`, async ({ page }) => {
      await goto(page, 'kitchen-sink', { width: from })
      const [id] = await drawerIds(page)
      await tabFor(page, id).focus()
      await page.keyboard.press('Enter')
      await waitOpen(page, id)
      await page.setViewportSize({ width: to, height: 900 })
      await page.waitForTimeout(100)
      await settle(page)
      expect(await isOpen(page, id)).toBe(true)
      const r = await rectOf(panel(page, id))
      expect(offScreenBy(r)).toBeLessThanOrEqual(1)
      expect(r.width).toBeGreaterThan(200)
      expect(offScreenBy(await rectOf(panel(page, id).locator('.tufte-drawer-close')))).toBeLessThanOrEqual(1)
      await page.keyboard.press('Escape')
      await waitOpen(page, id, false)
    })
  }
})
