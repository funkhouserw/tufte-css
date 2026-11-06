# Tufte kit

A rebuild of [Tufte CSS](https://github.com/edwardtufte/tufte-css) for pages that have to work on phones and inside other people's layouts. This branch (`ilse_version`) is a fork of Edward Tufte's repository; the original lives on [`gh-pages`](https://github.com/funkhouserw/tufte-css/tree/gh-pages) and upstream.

It keeps what makes Tufte CSS worth using (ET Book, the 55/45 feel of text and margin, sidenotes beside the line they belong to) and rebuilds the rest. It's what runs [the.corporateshill.com](https://the.corporateshill.com).

## What's different from Tufte CSS 1.9

| | Tufte CSS 1.9 | This kit |
|---|---|---|
| Narrow screens | Below 760px, notes hide behind ⊕ toggles | The margin stays a margin: the page slides sideways to it, with a quiet marker ("note 1") at the edge |
| Sizing | The viewport | Container queries, so it fits any column it's placed in, and the proportions hold at in-between widths |
| Host page CSS | Competes with it | Lives in `@layer tufte`, so host styles win where they should and resets don't break the columns |
| Notes too big for the margin | Not handled | Drawers, using the Popover API and CSS anchor positioning |
| Colors | Light, plus a `prefers-color-scheme` dark mode | `light-dark()` tokens you can override on `.tufte` |
| Authoring | HTML by hand | Plain Markdown through MDX (a rehype plugin builds sections, figures and image sizes), or React components: `Sidenote`, `MarginNote`, `Figure`, `Full`, `Epigraph`, `NewThought`, `Drawer` and more |
| Tailwind | None | Optional adapter (`src/tufte/tufte-tailwind.css`) with no Preflight |
| JavaScript | None | None required. One optional 17-line script improves the sideways slide |
| Tests | One Playwright regression test | About 165 Playwright tests per engine, across Chromium, Firefox and WebKit |

`DESIGN.md` has the markup contract and the reasoning behind each decision.

## Try it

```sh
npm install
npm run dev        # http://localhost:5180/kitchen-sink/ and /plain/
npm run build      # static pages in dist/
npm test           # the full suite on three engines
```

Node 24 or newer.

## Status

Work in progress. Known problems, all covered by failing tests on purpose:

- WebKit: with the view slid open and JavaScript off, focusing a marker by keyboard can leave it off-screen. Two related focus tests fail.
- Drawers can fail to paint in WebKit at phone widths (360 to 412px).
- Firefox: the `rule` marker can sit off its edge.
- Host CSS resets, right-to-left drawers, and a figure placed after an extremely long note all have edge cases.

The sideways margin has only been tested in desktop engines with emulated touch; it needs real phones.

## Fonts

ET Book is included as in upstream, under the MIT License. Its font files carry an OS/2 embedding flag that's stricter than that license; if that matters for your use, check before redistributing.

## License

MIT, as upstream. Tufte CSS is by Dave Liepmann and now an Edward Tufte project; this rebuild is by Ilse Funkhouser, written with Claude.
