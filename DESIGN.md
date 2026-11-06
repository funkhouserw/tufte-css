# Tufte kit: design contract

A modern rebuild of Tufte CSS (https://github.com/edwardtufte/tufte-css, MIT) for
a static, push-to-publish blog. No Astro, no CMS, no database. Output is static
HTML and CSS. Pages ship NO JavaScript unless a post explicitly adds some, with one
deliberate exception, the tap-to-slide script described under Display modes.

Upstream reference (read-only): /tmp/tufte-upstream/repo

## Principles
1. Keep Tufte's look: ET Book, upstream's proportions, cream paper, sidenotes,
   booktabs tables, restraint. Check against upstream's demo page. Upstream's "55/45"
   is text against everything else on the page, gap and empty right side included. Its
   text and note columns are 2:1 (see Proportions below).
2. Everything must work with JS disabled, including notes and drawers. With it disabled
   a marker is a plain link and swiping is native, so every note is still reached.
3. Scoped, not global. Nothing styles html/body or bare elements outside `.tufte`.
   Everything is in `@layer tufte`, low specificity via `:where()`, and every
   custom property is prefixed `--tufte-`.
4. Responsive to the container (`container: tufte / inline-size`), not the viewport.
5. Plain CSS is the source of truth. Tailwind is an optional adapter (tokens and
   variants). Prose styling does not belong in utility classes.
6. Readable, accessible, printable: a median of 45-80 characters per line from a 520px
   container up. Below that, readable type wins over line length, and the sliver takes
   about 24px from an article with notes: 19px at 320 to 21px by 440 gives medians in the
   low 30s at 320, the high 30s at 390 and 43 or more at 480. ET Book is small on its
   body, so 19px reads like 16px Georgia. Real keyboard focus, prefers-reduced-motion,
   prefers-color-scheme, print.

## Known upstream flaws to fix
- Measure gets too narrow between roughly 760 and 1000px (55% of a small page).
- Root font-size hijack (html 15px), body-level layout, `section > p` selectors
  that break as soon as markup nests.
- `display:none` checkbox toggles are not keyboard reachable.
- Notes must be phrasing content, so no multi-block notes.
- EOT/SVG/TTF font bloat (woff2 only now). Old iframe padding hack.

## Layout gotcha, read before designing
Upstream stacks notes with `float` + `clear` + negative margin, which only stacks
across paragraphs because the paragraphs share one block formatting context. Making
article children grid items gives each its own BFC and notes in adjacent paragraphs
collide. Choose deliberately and prove it with a test.

Margin note baseline: floats (robust, stack natively). CSS anchor positioning is
allowed as an enhancement behind `@supports`, mainly for block notes placed after
their paragraph. See https://vincent.bernat.ch/en/blog/2026-css-sidenotes . Safari
before 26.5 has an anchor-chain bug; typed attr() is too new, so anchor names go in
inline `style`.

## Proportions (wide mode)
Measured against upstream at 1440: text 693, gap 69, note column 347. Ours: text 662,
gap 66, note column 331, so the ratios match and the measure stays under 80 characters.
- Text: 55% of the room between the page gutters, never over 31.5em of body text and
  never under 22em. The floor is what fixes upstream's narrow mid widths.
- Gap: 10% of the text at large widths, tightening with the container to 26px at 768.
- Note column: 50% of the text, or what's left if that is less.
- The columns are centred in the container.

## Static HTML gotcha
Pages are parsed by a browser from static HTML. A block element (`div`, `aside`,
`figure`, `p`) inside `<p>` auto-closes the paragraph. Inline notes must therefore
render only phrasing elements (`span`, `a`, `button`). MDX wraps inline components in
`<p>` but leaves a block component on its own line unwrapped. A marker is a link, and links
don't nest, so a note can't be written inside an `<a>`: the parser would split them.

## Display modes (container width)
The same markup at every width, each note appearing once. A margin note stays a margin
note: nothing is inlined into the text, expanded in place or put in a bottom sheet.
- wide: text column plus margin column, notes in the margin. Starts at 48em.
- narrow: the same float layout, with the margin running past the edge of the screen and a
  sliver of it showing. `.tufte` is itself the horizontal scroller (native scroll-snap,
  resting at the text and at the margin), so the reader drags text and margin across
  together, notes stay level with their lines and neighbours stay in view. The scroller is
  there at every width and simply has nothing to scroll once the margin fits.
- An article with nothing for the margin has no sliver and doesn't scroll.
- print: a sheet of paper takes the wide layout. A sheet too narrow for that puts each note
  in place in a single column, with no scroller and no marker.

Sizes are inputs on `.tufte`: `--tufte-sliver`, `--tufte-note-hang`, `--tufte-slide-gap`,
`--tufte-slide-end`, `--tufte-slide-margin`, `--tufte-slide-keep`.

Narrow-only rules for things that already scroll or span: `pre` and `.tufte-table` stay in
the text column, Full or not, and scroll inside themselves. Full figures span text and
margin, so they are part way off screen at rest; their captions keep to the text. A main
figure's caption goes below it.

Marker treatment: `<article class="tufte" data-marker="word|rule|bleed">`, word by default.
All CSS, on the same markup.
- word: the marker's word set vertically in the sliver.
- rule: a hairline as tall as the note, with its number if it has one.
- bleed: no mark, the note's first letters run off the screen. The link is still there,
  invisible.

Tap to slide (the one deliberate exception to no JS): `src/tufte/tufte-slide.js`, under 1kB.
The build adds it, deferred, only to a page with a note marker in it. It makes a tap on a
marker slide across and back, sideways only, with `scrollTo`, never `scrollIntoView`: the
page stays exactly where it is, and no history entry is added. A note pushed well below its
line stays there, so the reader may need to scroll to it, which is their own move to make.

Without it a marker is a same-page link. That reaches the note and slides across, but it
does jump: the browser puts the note about a third of the way down the screen
(`scroll-margin-block: 35vh`, as gentle as a fragment link can be), and adds history.

Keyboard: every note has one tab stop, its number in the text or, for one with no number,
its word in the sliver. A numbered note's word has `tabindex="-1"`. Focus moves the page
only if the stop is off screen. Focus in the text rests on the text and focus in a note on
the margin, whatever snap would otherwise do. `.tufte` takes no `tabindex`, since it would
be a dead stop in wide mode, so arrow keys scroll it only where the browser allows it:
in Firefox, which makes it a stop by itself. Tab and Shift-Tab work everywhere.

## Markup contract (class names and structure are fixed; ask before changing)
Article: `<article class="tufte">` containing `<section>`s. Nesting wrappers must not
break anything.

Sidenote (numbered, inline in a paragraph; counter via CSS). The number in the text is a
link to the note, and the note holds its marker, a link to itself:
  <span class="tufte-note">
    <a class="tufte-note-ref" href="#ID"><span class="tufte-sr">Note 4</span></a>
    <span class="tufte-sidenote" id="ID" role="note" aria-label="Note 4">
      <a class="tufte-note-edge" href="#ID" aria-label="Note 4" tabindex="-1">note 4</a>
      ...phrasing only...
    </span>
  </span>

Margin note (unnumbered, inline): no mark in the text, so its marker is its tab stop. The
word says what it is: "note" unless told otherwise, "figure" if it holds a picture.
  <span class="tufte-note">
    <span class="tufte-marginnote" id="ID" role="note" aria-label="Margin note 2">
      <a class="tufte-note-edge" href="#ID" aria-label="Margin note 2">note</a>
      ...phrasing only...
    </span>
  </span>

Block margin note (multiple paragraphs, images; sibling AFTER its paragraph):
  <aside class="tufte-margin-block" id="ID">
    <a class="tufte-note-edge" href="#ID" aria-label="Margin note 3">note</a>
    ...any flow content...
  </aside>

Figure:
  <figure class="tufte-figure" data-size="main|margin|full">
    <img ...> or <svg ...>
    <figcaption>...</figcaption>
  </figure>
  Captions sit in the margin for main, below for margin and full. A main caption goes below
  on a narrow screen. A margin figure also takes an `id` and, first inside it, a marker:
  `<a class="tufte-note-edge" href="#ID" aria-label="Margin figure 1">figure</a>`.

Other: `<p class="tufte-subtitle">`, `<div class="tufte-epigraph"><blockquote>...
<footer><cite>`, `<span class="tufte-newthought">`, `<div class="tufte-full">` (spans
text + margin), `<div class="tufte-table">` wrapping a booktabs `<table>` with
overflow scroll, `<pre><code>`, `<div class="tufte-embed">` (aspect-ratio).

Drawer (pull-out panel tied to a spot in the text, using the native Popover API,
no JS; `ANCHOR` is a dashed ident such as `--d-oak`):
  <span class="tufte-drawer-wrap">
    <button class="tufte-drawer-tab" type="button" popovertarget="ID" style="anchor-name:ANCHOR">
      label
    </button>
    <span class="tufte-drawer" id="ID" popover="auto" role="group" aria-label="..." style="position-anchor:ANCHOR">
      <span class="tufte-drawer-body" tabindex="0">...phrasing only when used inline...</span>
      <button class="tufte-drawer-close" type="button" popovertarget="ID" popovertargetaction="hide">Close</button>
    </span>
  </span>
  Block form: `<aside class="tufte-drawer" ...>` with `<div class="tufte-drawer-body" tabindex="0">`,
  placed after the paragraph with the tab inline in the paragraph.
  Wide: slides out of the margin, aligned to the tab's line, can be wider than the
  margin and overlay the text. Narrow: opens over the text across the screen, down from
  the tab's line, flipping up near the bottom of the screen and pinning to the top if
  neither fits. With popovers but no anchor positioning: the same panel, a fixed way down
  the screen. With no popovers: in flow.
  A block drawer takes flow content. Inside one, notes are always open in place with no
  marker or number, don't count towards the article's numbering, and figures, block
  notes and Full stay within the panel, since a panel has no margin column.
  An open panel is clamped to the viewport in both directions when its tab scrolls away.
  This is CSS only and not complete: engines move an anchored box by the scroll delta
  without always laying it out again, so in Chromium a panel can still drift off after
  several scrolls in opposite directions, until the tab returns or the panel is closed.

Where a note can't reach the margin: inside a block note or a figure caption it runs
inline, and inside a scrolling table or `pre` it is a block in place, at every width. Its
marker doesn't show there, and a tap on its number does nothing, since it is right there.

Names: the React layer writes each marker's name and word while rendering ("Note 4",
"Margin note 2", "Margin figure 3", "Note in drawer 1"), in the order the CSS counter runs.
Hand-written markup should do the same. Scrolling `.tufte-table` and `pre` take `tabindex="0"`.

## Writer rule for drawers
In wide mode a drawer tab floats to the margin and leaves the sentence, so place
tabs between sentences and give them labels that stand alone.

## File ownership
- src/tufte/tufte.css, tufte-tailwind.css, fonts/  : core CSS
- src/tufte/tufte-slide.js                         : the optional tap-to-slide script
- src/tufte/drawer.css                             : drawers (imported by tufte.css)
- src/tufte/react/*                                : React components
- site/*, posts/, pages/, demo/, scripts/build.mjs, vite.config.js : the site, its posts, the kit's fixtures and the static build
- tests/*, playwright.config.js                    : QA

## Out of scope for now
Blog index, routing, RSS, editor, database. Margin figures accept inline SVG like
any other figure.
