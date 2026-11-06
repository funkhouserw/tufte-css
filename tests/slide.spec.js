// The narrow-screen margin: the article is one horizontal scroller holding the text and the
// margin, snapped at two resting places. Scrolling here is scripted or by wheel, in desktop
// engines: this is emulation, not evidence of how it feels under a thumb on a phone.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MARGIN_ITEMS, fixture, goto, overflow, scrollState, settle, slideTo, tabUntil } from './helpers.js'

const slideSrc = () => readFileSync(resolve(import.meta.dirname, '../dist/kitchen-sink/index.html'), 'utf8').match(/<script src="([^"]+)"/)[1]

const SLIDING = [320, 360, 390, 480, 600, 700, 767]
const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '
const note = (id, n, text) => `<span class="tufte-note"><a class="tufte-note-ref" href="#${id}"><span class="tufte-sr">Note ${n}</span></a><span class="tufte-sidenote" id="${id}" role="note" aria-label="Note ${n}"><a class="tufte-note-edge" href="#${id}" aria-label="Note ${n}" tabindex="-1">note ${n}</a>${text}</span></span>`
const margin = (id, text) => `<span class="tufte-note"><span class="tufte-marginnote" id="${id}" role="note" aria-label="Margin note"><a class="tufte-note-edge" href="#${id}" aria-label="Margin note">note</a>${text}</span></span>`

test.describe('at rest', () => {
  for (const width of SLIDING) {
    test(`a sliver of margin shows at ${width}, holding each marker and none of the note's text`, async ({ page }) => {
      await goto(page, 'kitchen-sink', { width })
      expect((await scrollState(page)).left).toBe(0)
      const r = await page.evaluate((sel) => {
        const vw = document.documentElement.clientWidth
        const text = document.querySelector('section > p').getBoundingClientRect()
        const items = [...document.querySelectorAll(sel)]
        return {
          vw,
          textRight: text.right,
          bad: items.flatMap((item) => {
            const edge = item.querySelector(':scope > .tufte-note-edge').getBoundingClientRect()
            const box = item.getBoundingClientRect()
            const hang = parseFloat(getComputedStyle(item).paddingInlineStart)
            const name = item.textContent.slice(0, 30)
            const problems = []
            if (edge.left < text.right || edge.right > vw) problems.push(`marker outside the sliver ${Math.round(edge.left)}..${Math.round(edge.right)}: ${name}`)
            if (box.left + hang < vw) problems.push(`note's text is showing: ${name}`)
            return problems
          }),
        }
      }, MARGIN_ITEMS)
      expect(r.vw - r.textRight, 'the sliver and gap').toBeGreaterThanOrEqual(30)
      expect(r.bad).toEqual([])
    })
  }

  test('the article with nothing for the margin has no sliver and does not scroll', async ({ page }) => {
    await goto(page, 'plain', { width: 390 })
    expect((await scrollState(page)).max).toBe(0)
    const r = await page.evaluate(() => {
      const t = document.querySelector('section > p').getBoundingClientRect()
      return { left: t.left, right: document.documentElement.clientWidth - t.right }
    })
    expect(Math.abs(r.left - r.right)).toBeLessThanOrEqual(1)
  })
})

test.describe('markers', () => {
  test('each note in the margin appears once, with one marker', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390 })
    const r = await page.evaluate((sel) => {
      const items = [...document.querySelectorAll(sel)]
      const ids = [...document.querySelectorAll('[id]')].map((e) => e.id)
      return {
        items: items.length,
        oneMarker: items.filter((i) => i.querySelectorAll(':scope > .tufte-note-edge').length === 1).length,
        words: items.filter((i) => i.querySelector(':scope > .tufte-note-edge').textContent.trim()).length,
        selfLinks: items.filter((i) => i.querySelector(':scope > .tufte-note-edge').hash === `#${i.id}`).length,
        duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
      }
    }, MARGIN_ITEMS)
    expect(r.items).toBeGreaterThan(5)
    expect(r.oneMarker).toBe(r.items)
    expect(r.words).toBe(r.items)
    expect(r.selfLinks).toBe(r.items)
    expect(r.duplicateIds).toEqual([])
  })

  // A note is level with its line, or under the note before it, as on a wide page.
  for (const width of [320, 390, 767]) {
    test(`each marker is level with its line at ${width}, or below only because the note above is in the way`, async ({ page }) => {
      await goto(page, 'kitchen-sink', { width })
      const bad = await page.evaluate((sel) => {
        const items = [...document.querySelectorAll(sel)]
        const anchorTop = (item) => {
          const inline = item.closest('.tufte-note')
          if (!inline) return item.previousElementSibling ? item.previousElementSibling.getBoundingClientRect().bottom : item.getBoundingClientRect().top
          const probe = document.createElement('span')
          inline.before(probe)
          probe.textContent = '​'
          const r = probe.getBoundingClientRect()
          probe.remove()
          return r.top
        }
        const line = parseFloat(getComputedStyle(document.querySelector('section > p')).lineHeight)
        return items.flatMap((item, i) => {
          const edge = item.querySelector(':scope > .tufte-note-edge').getBoundingClientRect()
          const prev = items[i - 1]?.getBoundingClientRect()
          const want = anchorTop(item)
          const pushed = prev && prev.bottom >= want - line && edge.top >= prev.bottom - 1
          const level = Math.abs(edge.top - want) <= line * 1.5
          return level || pushed ? [] : [`${item.textContent.slice(0, 30)}: marker ${Math.round(edge.top)}, line ${Math.round(want)}`]
        })
      }, MARGIN_ITEMS)
      expect(bad).toEqual([])
    })
  }
})

test.describe('sliding', () => {
  for (const width of [320, 390, 600, 767]) {
    test(`every note is reachable by scrolling sideways at ${width}, staying level with its line`, async ({ page }) => {
      await goto(page, 'kitchen-sink', { width })
      const tops = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((n) => Math.round(n.getBoundingClientRect().top + scrollY)), MARGIN_ITEMS)
      const textTop = () => page.evaluate(() => document.querySelector('section > p').getBoundingClientRect().top)
      const restTops = await tops()
      const restText = await textTop()
      const { max } = await scrollState(page)
      expect(max).toBeGreaterThan(100)
      await slideTo(page, max)
      await settle(page)
      expect((await scrollState(page)).left).toBeCloseTo(max, 0)
      expect(await tops()).toEqual(restTops)
      expect(await textTop()).toBe(restText)
      const bad = await page.evaluate((sel) => {
        const vw = document.documentElement.clientWidth
        return [...document.querySelectorAll(sel)].filter((n) => { const r = n.getBoundingClientRect(); return r.left < 0 || r.right > vw }).map((n) => n.textContent.slice(0, 30))
      }, MARGIN_ITEMS)
      expect(bad).toEqual([])
      const textStillShowing = await page.evaluate(() => document.querySelector('section > p').getBoundingClientRect().right)
      expect(textStillShowing, 'some text stays in view beside the open margin').toBeGreaterThan(40)
    })
  }

  test('a partial slide snaps back to the nearer resting place, either way', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const { max } = await scrollState(page)
    await slideTo(page, 40)
    await expect.poll(async () => (await scrollState(page)).left).toBe(0)
    await slideTo(page, max - 40)
    await expect.poll(async () => Math.round((await scrollState(page)).left)).toBe(Math.round(max))
  })

  test('a sideways wheel moves the article and comes to rest at one of the two places', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const { max } = await scrollState(page)
    await page.mouse.move(150, 400)
    await page.mouse.wheel(max + 50, 0)
    await expect.poll(async () => Math.round((await scrollState(page)).left)).toBe(Math.round(max))
    await page.mouse.wheel(-(max + 50), 0)
    await expect.poll(async () => Math.round((await scrollState(page)).left)).toBe(0)
  })

  test('a real touch drag moves text and margin together and snaps (Chromium only: CDP touch)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'synthesized touch gestures are a Chromium DevTools feature')
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const cdp = await page.context().newCDPSession(page)
    const { max } = await scrollState(page)
    await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: 400, xDistance: -220, yDistance: 0, gestureSourceType: 'touch', speed: 800 })
    await expect.poll(async () => Math.round((await scrollState(page)).left)).toBe(Math.round(max))
    const before = await page.evaluate(() => scrollY)
    await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: 400, xDistance: 0, yDistance: -300, gestureSourceType: 'touch', speed: 800 })
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 100)
    expect(Math.round((await scrollState(page)).left)).toBe(Math.round(max))
    await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: 400, xDistance: 220, yDistance: 0, gestureSourceType: 'touch', speed: 800 })
    await expect.poll(async () => Math.round((await scrollState(page)).left)).toBe(0)
  })

  test('a vertical wheel over the article scrolls the page', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    await page.mouse.move(150, 400)
    await page.mouse.wheel(0, 600)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100)
    expect((await scrollState(page)).left).toBe(0)
  })
})

test.describe('page overflow and things that already scroll', () => {
  for (const slug of ['kitchen-sink', 'plain']) {
    test(`${slug}: only the article scrolls sideways, and it stops at the margin's edge, 320 to 1280`, async ({ page }) => {
      const bad = {}
      for (const width of [320, 360, 390, 480, 600, 700, 767, 768, 800, 1024, 1280]) {
        await goto(page, slug, { width })
        const page_ = await overflow(page)
        const r = await page.evaluate(() => {
          const s = document.querySelector('.tufte')
          const article = s.getBoundingClientRect()
          const col = getComputedStyle(document.querySelector('.tufte > section'))
          const end = parseFloat(col.getPropertyValue('--tufte-col-start')) + parseFloat(col.getPropertyValue('--tufte-col-full')) + parseFloat(col.getPropertyValue('--tufte-slide-end'))
          // Whatever in the article reaches furthest, excepting closed popovers.
          let furthest = 0
          for (const el of s.querySelectorAll('*')) {
            if (el.closest('[popover]') || el.closest('pre, .tufte-table') !== null && !el.matches('pre, .tufte-table')) continue
            for (const rect of el.getClientRects()) furthest = Math.max(furthest, rect.right - article.left)
          }
          return { extra: s.scrollWidth - s.clientWidth, width: s.clientWidth, end, furthest, vertical: getComputedStyle(s).overflowY }
        })
        const problems = []
        if (page_ > 0) problems.push(`page overflows by ${page_}`)
        if (r.vertical !== 'hidden') problems.push(`article overflow-y ${r.vertical}`)
        if (width >= 768 && r.extra > 0) problems.push(`wide article still scrolls by ${r.extra}`)
        if (width < 768 && slug === 'plain' && r.extra > 0) problems.push(`plain article scrolls by ${r.extra}`)
        if (width < 768 && slug === 'kitchen-sink') {
          // Past this nothing could be reached: mandatory snap has no resting place there.
          if (r.furthest > r.width + r.extra + 1) problems.push(`something reaches ${r.furthest}, the scroller ${r.width + r.extra}`)
          if (Math.abs(r.width + r.extra - r.end) > 2) problems.push(`scroller ends at ${r.width + r.extra}, the margin at ${r.end}`)
        }
        if (problems.length) bad[width] = problems
      }
      expect(bad).toEqual({})
    })
  }

  test('a wide table scrolls inside itself at a narrow width, without opening the margin', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const table = page.locator('.tufte-table').last()
    const r = await table.evaluate((t) => {
      t.scrollIntoView({ block: 'center', behavior: 'instant' })
      const s = document.querySelector('.tufte')
      const before = s.scrollLeft
      t.scrollLeft = t.scrollWidth
      return { wider: t.scrollWidth > t.clientWidth, moved: t.scrollLeft > 0, article: s.scrollLeft - before, contain: getComputedStyle(t).overscrollBehaviorX }
    })
    expect(r).toEqual({ wider: true, moved: true, article: 0, contain: 'contain' })
  })

  test('a wide pre scrolls inside itself too, and stays in the text column', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const r = await page.locator('pre').last().evaluate((p) => {
      const s = document.querySelector('.tufte')
      const before = s.scrollLeft
      p.scrollLeft = p.scrollWidth
      const text = document.querySelector('section > p').getBoundingClientRect()
      return { moved: p.scrollLeft > 0, article: s.scrollLeft - before, sameEnd: Math.abs(p.getBoundingClientRect().right - text.right) <= 1, contain: getComputedStyle(p).overscrollBehaviorX }
    })
    expect(r).toEqual({ moved: true, article: 0, sameEnd: true, contain: 'contain' })
  })

  for (const width of [320, 390, 767]) {
    test(`a full-width figure spans text and margin at ${width}, its caption keeps to the text`, async ({ page }) => {
      await goto(page, 'kitchen-sink', { width })
      const r = await page.evaluate(() => {
        const s = document.querySelector('.tufte')
        const reach = s.getBoundingClientRect().left + s.scrollWidth
        const fig = document.querySelector('.tufte-figure[data-size="full"]')
        const img = fig.querySelector('img').getBoundingClientRect()
        const text = document.querySelector('section > p').getBoundingClientRect()
        return { startsWithText: Math.abs(img.left - text.left) <= 1, withinReach: img.right <= reach, wider: img.width > text.width, caption: fig.querySelector('figcaption').getBoundingClientRect().right <= text.right + 1 }
      })
      expect(r).toEqual({ startsWithText: true, withinReach: true, wider: true, caption: true })
    })
  }

  test('a main figure and an embed stay in the text column', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390 })
    const r = await page.evaluate(() => {
      const text = document.querySelector('section > p').getBoundingClientRect()
      const within = (el) => Math.abs(el.getBoundingClientRect().right - text.right) <= 1
      return { figure: within(document.querySelector('.tufte-figure[data-size="main"]')), embed: within(document.querySelector('.tufte-embed')) }
    })
    expect(r).toEqual({ figure: true, embed: true })
  })
})

test.describe('tap to slide', () => {
  const ref = (page) => page.locator('.tufte-note-ref').nth(3)

  test('with the script, a tap on a number slides over with no vertical jump or history, and a tap on the word slides back', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    await ref(page).evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await settle(page)
    const y = await page.evaluate(() => scrollY)
    const history = await page.evaluate(() => history.length)
    const { max } = await scrollState(page)
    await ref(page).click()
    await expect.poll(async () => Math.round((await scrollState(page)).left)).toBe(Math.round(max))
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(y, 0)
    expect(await page.evaluate(() => location.hash)).toBe('')
    expect(await page.evaluate(() => history.length)).toBe(history)
    const word = page.locator('.tufte-sidenote > .tufte-note-edge').nth(3)
    await word.click()
    await expect.poll(async () => (await scrollState(page)).left).toBe(0)
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(y, 0)
  })

  test('with the script, a tap on the word in the sliver slides over, and Enter on the same number returns', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
    const { max } = await scrollState(page)
    const word = page.locator('.tufte-marginnote > .tufte-note-edge').first()
    await word.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }))
    await slideTo(page, 0)
    await word.click()
    await expect.poll(async () => Math.round((await scrollState(page)).left)).toBe(Math.round(max))
    await slideTo(page, 0)
    await expect.poll(async () => (await scrollState(page)).left).toBe(0)
    await ref(page).evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await ref(page).focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => Math.round((await scrollState(page)).left)).toBe(Math.round(max))
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await scrollState(page)).left).toBe(0)
  })

  for (const width of [320, 390, 767]) {
    test(`with the script, a marker near the bottom of the viewport moves sideways only at ${width}`, async ({ page }) => {
      await goto(page, 'kitchen-sink', { width, height: 800, media: { reducedMotion: 'reduce' } })
      const { max } = await scrollState(page)
      const bad = []
      const count = await page.locator('.tufte-note-ref').count()
      for (let i = 0; i < count; i++) {
        const link = page.locator('.tufte-note-ref').nth(i)
        if (await link.evaluate((el) => !!el.closest('[popover], figcaption, .tufte-margin-block, .tufte-table, pre'))) continue
        await link.evaluate((el) => window.scrollBy({ top: el.getBoundingClientRect().top - (innerHeight - 60), behavior: 'instant' }))
        await settle(page)
        const at = () => link.evaluate((el) => ({ y: scrollY, top: el.getBoundingClientRect().top }))
        const before = await at()
        // The raw mouse, because Playwright's own click scrolls the target first.
        const box = await link.boundingBox()
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await expect.poll(async () => Math.round((await scrollState(page)).left), `marker ${i}`).toBe(Math.round(max))
        const after = await at()
        if (after.y !== before.y || Math.abs(after.top - before.top) > 0.5) bad.push(`${i}: ${JSON.stringify({ before, after })}`)
        await slideTo(page, 0)
      }
      expect(bad).toEqual([])
    })
  }

  test('with the script, a marker in the sliver near the bottom moves sideways only, there and back', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, height: 800, media: { reducedMotion: 'reduce' } })
    const word = page.locator('.tufte-marginnote > .tufte-note-edge').first()
    await word.evaluate((el) => window.scrollBy({ top: el.getBoundingClientRect().top - (innerHeight - 40), behavior: 'instant' }))
    await settle(page)
    const at = () => word.evaluate((el) => ({ y: scrollY, top: el.getBoundingClientRect().top }))
    const before = await at()
    const tap = async () => {
      const box = await word.boundingBox()
      await page.mouse.click(box.x + box.width / 2, box.y + 10)
    }
    await tap()
    await expect.poll(async () => (await scrollState(page)).left).toBeGreaterThan(0)
    expect(await at()).toEqual(before)
    await tap()
    await expect.poll(async () => (await scrollState(page)).left).toBe(0)
    expect(await at()).toEqual(before)
  })

  test('with the script, a number whose note is in place moves nothing at all', async ({ page }) => {
    await fixture(page, `<article class="tufte"><section><p>${LOREM}</p><figure class="tufte-figure" data-size="main"><img src="/img/rhino.png" alt="" width="1244" height="920"><figcaption>Caption${note('c', 1, 'in a caption')}</figcaption></figure><p>${LOREM}${note('d', 2, 'x')}</p></section></article>`, { width: 390, head: `<script src="${slideSrc()}" defer></script>` })
    const link = page.locator('figcaption .tufte-note-ref')
    await link.scrollIntoViewIfNeeded()
    const before = await page.evaluate(() => scrollY)
    const box = await link.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(100)
    expect((await scrollState(page)).left).toBe(0)
    expect(await page.evaluate(() => [scrollY, location.hash])).toEqual([before, ''])
  })

  test('keyboard focus on a marker already in view moves nothing', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, height: 800, media: { reducedMotion: 'reduce' } })
    for (const sel of ['.tufte-note-ref', '.tufte-marginnote > .tufte-note-edge']) {
      const link = page.locator(sel).nth(1)
      await link.evaluate((el) => window.scrollBy({ top: el.getBoundingClientRect().top - 400, behavior: 'instant' }))
      await settle(page)
      const y = await page.evaluate(() => scrollY)
      await link.focus()
      await settle(page)
      expect(await page.evaluate(() => scrollY), sel).toBe(y)
      expect((await scrollState(page)).left, sel).toBe(0)
    }
  })

  test('focus in the text from the open view leaves the marker on screen, wherever it is', async ({ page }) => {
    await goto(page, 'kitchen-sink', { width: 390, height: 800, media: { reducedMotion: 'reduce' } })
    const { max } = await scrollState(page)
    const count = await page.locator('.tufte-note-ref').count()
    const bad = []
    for (let i = 0; i < count; i++) {
      const link = page.locator('.tufte-note-ref').nth(i)
      if (await link.evaluate((el) => !!el.closest('[popover], figcaption, .tufte-margin-block, .tufte-table, pre'))) continue
      await slideTo(page, max)
      await settle(page)
      await link.focus()
      await settle(page)
      await page.waitForTimeout(50)
      const r = await link.evaluate((el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, vw: document.documentElement.clientWidth } })
      if (r.left < 0 || r.right > r.vw) bad.push(`${i}: ${JSON.stringify(r)}, scrolled ${(await scrollState(page)).left}`)
    }
    expect(bad).toEqual([])
  })

  test.describe('without the script', () => {
    test.use({ javaScriptEnabled: false })

    test('every note can still be reached by its own link', async ({ page }) => {
      await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
      const ids = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((n) => n.id), MARGIN_ITEMS)
      expect(ids.length).toBeGreaterThan(5)
      const bad = []
      for (const id of ids) {
        await page.locator(`.tufte a[href="#${id}"]`).first().evaluate((el) => el.click())
        await settle(page)
        const r = await page.locator(`[id="${id}"]`).evaluate((n) => {
          const b = n.getBoundingClientRect()
          return { left: b.left, right: b.right, top: b.top, vw: document.documentElement.clientWidth, vh: innerHeight, hash: location.hash }
        })
        if (r.left < 0 || r.right > r.vw || r.top > r.vh || r.hash !== `#${id}`) bad.push(`${id}: ${JSON.stringify(r)}`)
        await slideTo(page, 0)
      }
      expect(bad).toEqual([])
    })

    test('the next keyboard stop takes the view back from a note', async ({ page }) => {
      await goto(page, 'kitchen-sink', { width: 390, media: { reducedMotion: 'reduce' } })
      await ref(page).focus()
      await page.keyboard.press('Enter')
      await expect.poll(async () => (await scrollState(page)).left).toBeGreaterThan(0)
      const stop = await tabUntil(page, '.tufte-note-ref')
      expect(stop).toBeGreaterThan(0)
      await expect.poll(async () => (await scrollState(page)).left).toBe(0)
    })

    test('the hash link does jump: it brings the note to about a third of the way down', async ({ page }) => {
      await goto(page, 'kitchen-sink', { width: 390, height: 800, media: { reducedMotion: 'reduce' } })
      await ref(page).evaluate((el) => window.scrollBy({ top: el.getBoundingClientRect().top - 700, behavior: 'instant' }))
      await settle(page)
      await ref(page).click()
      const id = (await ref(page).getAttribute('href')).slice(1)
      await expect.poll(() => page.locator(`[id="${id}"]`).evaluate((n) => Math.abs(n.getBoundingClientRect().top - innerHeight * 0.35) <= 2)).toBe(true)
    })
  })
})

test.describe('the three marker treatments', () => {
  const body = (marker) => `<article class="tufte"${marker ? ` data-marker="${marker}"` : ''}><section><p>${LOREM}${note('a', 1, LOREM)} ${LOREM}${margin('b', LOREM)} ${LOREM}</p></section></article>`
  const look = (page) =>
    page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const edge = document.querySelector('.tufte-sidenote > .tufte-note-edge')
      const note = document.querySelector('.tufte-sidenote')
      const cs = getComputedStyle(edge)
      const s = document.querySelector('.tufte')
      return {
        writing: cs.writingMode,
        fontSize: parseFloat(cs.fontSize),
        transparent: cs.color === 'rgba(0, 0, 0, 0)' || cs.color === 'transparent',
        rule: getComputedStyle(note).borderInlineStartStyle,
        ownNumber: getComputedStyle(note, '::before').content,
        edgeOnScreen: edge.getBoundingClientRect().left < vw && edge.getBoundingClientRect().right <= vw + 1,
        textShowing: note.getBoundingClientRect().left + parseFloat(getComputedStyle(note).paddingInlineStart) < vw,
        scrolls: s.scrollWidth - s.clientWidth > 100,
      }
    })

  for (const marker of [undefined, 'word']) {
    test(`${marker ?? 'no attribute'}: a word set vertically`, async ({ page }) => {
      await fixture(page, body(marker), { width: 390 })
      const r = await look(page)
      expect(r.writing).toBe('vertical-rl')
      expect(r.fontSize).toBeGreaterThan(10)
      expect(r.transparent).toBe(false)
      expect(r.rule).toBe('none')
      expect(r.ownNumber).toBe('none')
      expect(r.textShowing).toBe(false)
      expect(r.scrolls).toBe(true)
    })
  }

  test('rule: a hairline as tall as the note, its number beside it, the word hidden', async ({ page }) => {
    await fixture(page, body('rule'), { width: 390 })
    const r = await look(page)
    expect(r.rule).toBe('solid')
    expect(r.fontSize).toBe(0)
    expect(r.writing).toBe('horizontal-tb')
    expect(await page.locator('.tufte-sidenote > .tufte-note-edge').evaluate((e) => getComputedStyle(e, '::before').content)).toContain('counter')
    expect(r.edgeOnScreen).toBe(true)
    expect(r.textShowing).toBe(false)
    expect(r.scrolls).toBe(true)
    await expect(page.locator('.tufte-sidenote > .tufte-note-edge')).toHaveAccessibleName('Note 1')
  })

  test('bleed: no mark, the note\'s own letters run off the edge, the link still there', async ({ page }) => {
    await fixture(page, body('bleed'), { width: 390 })
    const r = await look(page)
    expect(r.transparent).toBe(true)
    expect(r.rule).toBe('none')
    expect(r.ownNumber).not.toBe('none')
    expect(r.textShowing).toBe(true)
    expect(r.scrolls).toBe(true)
    await expect(page.locator('.tufte-sidenote > .tufte-note-edge')).toHaveAccessibleName('Note 1')
  })

  for (const marker of ['rule', 'bleed']) {
    test(`${marker} changes nothing in the wide layout`, async ({ page }) => {
      const measure = () => page.evaluate(() => [...document.querySelectorAll('p, .tufte-sidenote, .tufte-marginnote')].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round) }))
      await fixture(page, body(), { width: 1440 })
      const plain = await measure()
      await fixture(page, body(marker), { width: 1440 })
      expect(await measure()).toEqual(plain)
      await expect(page.locator('.tufte-note-edge').first()).toBeHidden()
    })
  }
})

test.describe('right to left on a narrow screen', () => {
  test('the sliver is on the left, and the margin is reachable', async ({ page }) => {
    await fixture(page, `<article class="tufte"><section><p>${LOREM}${note('a', 1, LOREM)} ${LOREM}</p></section></article>`, { width: 390, dir: 'rtl' })
    const r = await page.evaluate(() => {
      const s = document.querySelector('.tufte')
      const edge = document.querySelector('.tufte-note-edge').getBoundingClientRect()
      const p = document.querySelector('p').getBoundingClientRect()
      s.scrollTo({ left: -9999, behavior: 'instant' })
      const note = document.querySelector('.tufte-sidenote').getBoundingClientRect()
      return { edgeLeft: edge.left, edgeRight: edge.right, textLeft: p.left, noteLeft: note.left, noteRight: note.right, vw: document.documentElement.clientWidth }
    })
    expect(r.edgeLeft).toBeGreaterThanOrEqual(0)
    expect(r.edgeRight).toBeLessThanOrEqual(r.textLeft)
    expect(r.noteLeft).toBeGreaterThanOrEqual(0)
    expect(r.noteRight).toBeLessThanOrEqual(r.vw)
  })
})

// An anchored popover whose anchor is scrolled out of view stops being painted unless it has
// position-visibility: always, while :popover-open and its box both stay correct. So the only
// proof is pixels: the same region of the screen, with the panel closed and with it open.
test.describe('a drawer whose tab is scrolled away sideways is still painted', () => {
  const WIDTHS = [320, 360, 375, 390, 393, 402, 412, 430, 440]
  const ids = (page) => page.evaluate(() => [...document.querySelectorAll('.tufte-drawer')].map((d) => d.id))
  const tabGone = (page, id) => page.locator(`[popovertarget="${id}"].tufte-drawer-tab`).evaluate((t) => t.getBoundingClientRect().right < 0 || t.getBoundingClientRect().left > innerWidth)
  const box = (page, id) => page.locator(`[id="${id}"]`).evaluate((p) => { const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height, bottom: r.bottom, right: r.right, vw: document.documentElement.clientWidth, vh: innerHeight } })
  const onScreen = (r) => r.x >= 0 && r.y >= 0 && r.right <= r.vw + 1 && r.bottom <= r.vh + 1 && r.height > 40
  const park = async (page, id) => {
    await page.locator(`[popovertarget="${id}"].tufte-drawer-tab`).evaluate((t) => window.scrollBy({ top: t.getBoundingClientRect().top - 300, behavior: 'instant' }))
    const { max } = await scrollState(page)
    return max
  }
  const toggle = (page, id) => page.locator(`[id="${id}"]`).evaluate((p) => p.togglePopover())

  for (const width of WIDTHS) {
    test(`opened with the view slid open, or slid open after opening, at ${width}`, async ({ page }) => {
      await goto(page, 'kitchen-sink', { width, height: 800, media: { reducedMotion: 'reduce' } })
      const bad = []
      let tabsGone = 0
      for (const id of await ids(page)) {
        const max = await park(page, id)
        // Opened while the tab is away.
        await slideTo(page, max)
        await settle(page)
        tabsGone += (await tabGone(page, id)) ? 1 : 0
        await toggle(page, id)
        await settle(page)
        const r = await box(page, id)
        const clip = { x: r.x, y: r.y, width: r.width, height: r.height }
        if (!onScreen(r)) bad.push(`${id} opened away: off screen ${JSON.stringify(r)}`)
        const open = await page.screenshot({ clip })
        await toggle(page, id)
        await settle(page)
        const closed = await page.screenshot({ clip })
        if (open.equals(closed)) bad.push(`${id} opened away: not painted`)
        // Opened at rest, then the view slides away from the tab.
        await slideTo(page, 0)
        await settle(page)
        await toggle(page, id)
        await settle(page)
        await slideTo(page, max)
        await settle(page)
        const q = await box(page, id)
        if (!onScreen(q)) bad.push(`${id} slid away: off screen ${JSON.stringify(q)}`)
        const clip2 = { x: q.x, y: q.y, width: q.width, height: q.height }
        const open2 = await page.screenshot({ clip: clip2 })
        await toggle(page, id)
        await settle(page)
        if (open2.equals(await page.screenshot({ clip: clip2 }))) bad.push(`${id} slid away: not painted`)
        await slideTo(page, 0)
      }
      expect(bad).toEqual([])
      expect(tabsGone, 'at least one tab is really off screen').toBeGreaterThan(0)
    })
  }
})
