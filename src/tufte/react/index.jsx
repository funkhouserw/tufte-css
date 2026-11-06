// React layer for the Tufte kit. Renders the markup contract in blog/DESIGN.md.
// Everything works with renderToStaticMarkup: no state, no effects, no client JS. The one
// script the kit has, tufte-slide.js, is optional and added by the build.
import { Children, createContext, isValidElement, useContext, useId } from 'react'

// Written-out note names ("Note 4"), counted while rendering so no client JS is needed.
// React renders in document order, the order the CSS counter runs in, and notes in a
// drawer stay out of both. Each Article gets its own count, as it does in CSS.
const NoteNames = createContext(null)
const InDrawer = createContext(false)

// Unnumbered things in the margin are named for what they are: "Margin figure 3".
function useNoteName(kind, word = 'note') {
  const counts = useContext(NoteNames)
  const inDrawer = useContext(InDrawer)
  const noun = kind === 'margin' ? `Margin ${word}` : 'Note'
  if (!kind) return null
  if (!counts) return noun
  const key = inDrawer ? `drawer ${kind}` : kind
  counts[key] = (counts[key] ?? 0) + 1
  return `${noun}${inDrawer ? ' in drawer' : ''} ${counts[key]}`
}

const cx = (...names) => names.filter(Boolean).join(' ')

// useId output is not guaranteed to be a valid ident (older React used colons).
const safeIdent = (id) => id.replace(/[^a-zA-Z0-9_-]/g, '')

// MDX wraps multi-line JSX content in <p>. Where only phrasing content is legal,
// a lone paragraph is unwrapped.
function unwrapParagraph(children) {
  const kids = Children.toArray(children).filter(
    (kid) => typeof kid !== 'string' || kid.trim(),
  )
  return kids.length === 1 && isValidElement(kids[0]) && kids[0].type === 'p'
    ? kids[0].props.children
    : children
}

const BLOCK_TAGS = new Set(
  'address article aside blockquote details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table ul'.split(
    ' ',
  ),
)

// A block element inside an inline note would break its paragraph once the browser
// parses the static HTML, so fail the build rather than ship a broken page.
function phrasing(children, name, hint) {
  const content = unwrapParagraph(children)
  const check = (node) =>
    Children.forEach(node, (kid) => {
      if (!isValidElement(kid)) return
      if (BLOCK_TAGS.has(kid.type) || BLOCK_COMPONENTS.has(kid.type)) {
        const found = kid.type.name ?? kid.type
        throw new Error(`<${name}> can only hold inline content, found <${found}>. ${hint}`)
      }
      check(kid.props.children)
    })
  check(content)
  return content
}

// marker: how a note shows in the sliver on a narrow screen. Word is the default.
export function Article({ marker, className, children, ...rest }) {
  if (marker && !['word', 'rule', 'bleed'].includes(marker)) {
    throw new Error(`<Article> marker must be word, rule or bleed, got "${marker}"`)
  }
  return (
    <article className={cx('tufte', className)} data-marker={marker} {...rest}>
      <NoteNames.Provider value={{}}>{children}</NoteNames.Provider>
    </article>
  )
}

// The word in the sliver, a link to its own note so it reaches it without script. A
// numbered note's tab stop is its number in the text, so this one isn't a second one.
function Edge({ target, name, word, numbered }) {
  return (
    <a className="tufte-note-edge" href={`#${target}`} aria-label={name} tabIndex={numbered ? -1 : undefined}>
      {word}
    </a>
  )
}

export function Sidenote({ id, children }) {
  const auto = useId()
  const noteId = id ?? `sn-${safeIdent(auto)}`
  const noteName = useNoteName('side')
  return (
    <span className="tufte-note">
      <a className="tufte-note-ref" href={`#${noteId}`}>
        <span className="tufte-sr">{noteName}</span>
      </a>
      <span className="tufte-sidenote" id={noteId} role="note" aria-label={noteName}>
        <Edge target={noteId} name={noteName} word={noteName.toLowerCase()} numbered />
        {phrasing(children, 'Sidenote', 'Use <MarginBlock> after the paragraph instead.')}
      </span>
    </span>
  )
}

const holdsPicture = (children) =>
  Children.toArray(children).some((kid) => isValidElement(kid) && ['img', 'svg', 'video'].includes(kid.type))

// No mark in the text: a margin note is beside its sentence, or a drag away from it.
// word: what the sliver calls it, "figure" if it holds a picture and "note" otherwise.
export function MarginNote({ id, word, children }) {
  const auto = useId()
  const noteId = id ?? `mn-${safeIdent(auto)}`
  const content = phrasing(children, 'MarginNote', 'Use <MarginBlock> after the paragraph instead.')
  const shownWord = word ?? (holdsPicture(content) ? 'figure' : 'note')
  const noteName = useNoteName('margin', shownWord)
  return (
    <span className="tufte-note">
      <span className="tufte-marginnote" id={noteId} role="note" aria-label={noteName}>
        <Edge target={noteId} name={noteName} word={shownWord} />
        {content}
      </span>
    </span>
  )
}

export function MarginBlock({ id, word = 'note', className, children, ...rest }) {
  const auto = useId()
  const noteId = id ?? `mb-${safeIdent(auto)}`
  const noteName = useNoteName('margin', word)
  return (
    <aside className={cx('tufte-margin-block', className)} id={noteId} {...rest}>
      <Edge target={noteId} name={noteName} word={word} />
      {children}
    </aside>
  )
}

// <Figure src alt>Caption with *Markdown*</Figure>, or for inline SVG and the like:
// <Figure caption="..."><svg>...</svg></Figure>
export function Figure({
  id,
  size = 'main',
  src,
  alt = '',
  width,
  height,
  caption,
  className,
  children,
  ...rest
}) {
  if (!['main', 'margin', 'full'].includes(size)) {
    throw new Error(`<Figure> size must be main, margin or full, got "${size}"`)
  }
  const auto = useId()
  const inMargin = size === 'margin'
  const figureId = id ?? (inMargin ? `mf-${safeIdent(auto)}` : undefined)
  const noteName = useNoteName(inMargin ? 'margin' : null, 'figure')
  const media = src ? (
    <img src={src} alt={alt} width={width} height={height} />
  ) : (
    unwrapParagraph(children)
  )
  const captionContent = caption ?? (src ? unwrapParagraph(children) : null)
  return (
    <figure className={cx('tufte-figure', className)} id={figureId} data-size={size} {...rest}>
      {inMargin ? <Edge target={figureId} name={noteName} word="figure" /> : null}
      {media}
      {captionContent ? <figcaption>{captionContent}</figcaption> : null}
    </figure>
  )
}

export function Subtitle({ className, children, ...rest }) {
  return (
    <p className={cx('tufte-subtitle', className)} {...rest}>
      {phrasing(children, 'Subtitle', 'A subtitle is a single line of text.')}
    </p>
  )
}

// One quote: <Epigraph source="Orwell">...</Epigraph>. Several quotes in one epigraph:
// omit source and write the <blockquote>s as children.
export function Epigraph({ source, className, children, ...rest }) {
  return (
    <div className={cx('tufte-epigraph', className)} {...rest}>
      {source ? (
        <blockquote>
          {children}
          <footer>
            <cite>{source}</cite>
          </footer>
        </blockquote>
      ) : (
        children
      )}
    </div>
  )
}

export function NewThought({ children }) {
  return <span className="tufte-newthought">{children}</span>
}

export function Full({ className, children, ...rest }) {
  return (
    <div className={cx('tufte-full', className)} {...rest}>
      {children}
    </div>
  )
}

// Focusable because it scrolls: WebKit gives a keyboard no other way in.
export function TableWrap({ className, children, ...rest }) {
  return (
    <div className={cx('tufte-table', className)} tabIndex={0} {...rest}>
      {children}
    </div>
  )
}

// <Embed src title ratio="16 / 9" /> or wrap your own iframe/video as children.
export function Embed({ src, title, ratio, className, style, children, ...rest }) {
  return (
    <div
      className={cx('tufte-embed', className)}
      style={ratio ? { ...style, aspectRatio: ratio } : style}
      {...rest}
    >
      {src ? <iframe src={src} title={title} loading="lazy" allowFullScreen /> : children}
    </div>
  )
}

const drawerAnchor = (ident) => `--d-${ident}`
const labelText = (label) => (typeof label === 'string' ? label : undefined)

function Tab({ target, ident, children }) {
  return (
    <button
      className="tufte-drawer-tab"
      type="button"
      popoverTarget={target}
      style={{ anchorName: drawerAnchor(ident) }}
    >
      {children}
    </button>
  )
}

function CloseButton({ target, children }) {
  return (
    <button
      className="tufte-drawer-close"
      type="button"
      popoverTarget={target}
      popoverTargetAction="hide"
    >
      {children}
    </button>
  )
}

// Inline drawer: the tab and a phrasing-only panel, used inside a paragraph.
// <Drawer label="the oak" title="Oak detail">text, <img>, <em>...</Drawer>
export function Drawer({ id, label, title, closeLabel = 'Close', children }) {
  const auto = useId()
  const ident = safeIdent(id ?? auto)
  const target = `drawer-${ident}`
  return (
    <span className="tufte-drawer-wrap">
      <Tab target={target} ident={ident}>
        {label}
      </Tab>
      <span
        className="tufte-drawer"
        id={target}
        popover="auto"
        role="group"
        aria-label={title ?? labelText(label)}
        style={{ positionAnchor: drawerAnchor(ident) }}
      >
        <span className="tufte-drawer-body" tabIndex={0}>
          <InDrawer.Provider value={true}>
            {phrasing(children, 'Drawer', 'Use <DrawerTab> with a <DrawerBlock> after the paragraph.')}
          </InDrawer.Provider>
        </span>
        <CloseButton target={target}>{closeLabel}</CloseButton>
      </span>
    </span>
  )
}

// Block drawer: the tab goes in the paragraph and the panel, which can hold any flow
// content, follows the paragraph. They are tied together by a shared `id`.
// Text with a <DrawerTab id="oak">tab</DrawerTab> in it.
// <DrawerBlock id="oak" title="Oak detail">...paragraphs...</DrawerBlock>
export function DrawerTab({ id, children }) {
  const ident = safeIdent(id)
  return (
    <span className="tufte-drawer-wrap">
      <Tab target={`drawer-${ident}`} ident={ident}>
        {children}
      </Tab>
    </span>
  )
}

export function DrawerBlock({ id, title, closeLabel = 'Close', children }) {
  const ident = safeIdent(id)
  const target = `drawer-${ident}`
  return (
    <aside
      className="tufte-drawer"
      id={target}
      popover="auto"
      role="group"
      aria-label={title}
      style={{ positionAnchor: drawerAnchor(ident) }}
    >
      <div className="tufte-drawer-body" tabIndex={0}>
        <InDrawer.Provider value={true}>{children}</InDrawer.Provider>
      </div>
      <CloseButton target={target}>{closeLabel}</CloseButton>
    </aside>
  )
}

// Code blocks scroll sideways, so like TableWrap they take keyboard focus.
export function Pre(props) {
  return <pre tabIndex={0} {...props} />
}

// What may not sit inside an inline note or drawer, as phrasing() sees them.
const BLOCK_COMPONENTS = new Set([
  MarginBlock, Figure, Subtitle, Epigraph, Full, TableWrap, Embed, DrawerBlock, Pre,
])

// Pass as <Post components={mdxComponents} /> so posts can use these without imports.
export const mdxComponents = {
  Sidenote,
  MarginNote,
  MarginBlock,
  Figure,
  Subtitle,
  Epigraph,
  NewThought,
  Full,
  TableWrap,
  Embed,
  Drawer,
  DrawerTab,
  DrawerBlock,
  pre: Pre,
}
