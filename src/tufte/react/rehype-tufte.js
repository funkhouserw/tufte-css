// Lets a post written in plain Markdown produce the contract's markup:
// - groups top-level content into <section>s, starting a new one at each h2, with a
//   leading h1 and <Subtitle> left directly in the article (a post that writes its
//   own <section> is left alone);
// - turns a paragraph holding only an image into a figure, its title as the caption:
//   ![Alt text](/img/a.png "Caption");
// - fails the build when a block component is placed inside a paragraph, which the
//   browser would otherwise split apart when it parses the static HTML;
// - writes the real width and height on images that don't have them, read from the
//   file, so the page doesn't jump as they load.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const BLOCK_COMPONENTS = new Set([
  'Figure', 'MarginBlock', 'Epigraph', 'Full', 'TableWrap', 'Embed', 'DrawerBlock', 'Subtitle',
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol',
  'p', 'pre', 'section', 'table', 'ul',
])

const isBlank = (node) => node.type === 'text' && !node.value.trim()
const isTag = (node, name) => node.type === 'element' && node.tagName === name
const isJsx = (node, name) => node.type === 'mdxJsxFlowElement' && node.name === name
const element = (tagName, properties, children) => ({ type: 'element', tagName, properties, children })

function figureFromParagraph(node) {
  const kids = isTag(node, 'p') ? node.children.filter((kid) => !isBlank(kid)) : []
  if (kids.length !== 1 || !isTag(kids[0], 'img')) return node
  const { title, ...imgProps } = kids[0].properties
  const img = { ...kids[0], properties: imgProps }
  const caption = title ? [element('figcaption', {}, [{ type: 'text', value: title }])] : []
  return element('figure', { className: ['tufte-figure'], dataSize: 'main' }, [img, ...caption])
}

function sectionize(children) {
  const out = []
  let section = null
  for (const node of children) {
    const beforeSections =
      !section &&
      (isTag(node, 'h1') || isJsx(node, 'Subtitle') || node.type === 'mdxFlowExpression')
    if (node.type === 'mdxjsEsm' || beforeSections || (!section && isBlank(node))) {
      out.push(node)
      continue
    }
    if (!section || isTag(node, 'h2')) {
      section = element('section', {}, [])
      out.push(section)
    }
    section.children.push(node)
  }
  return out
}

const isAnyJsx = (node) => node.type === 'mdxJsxTextElement' || node.type === 'mdxJsxFlowElement'

function assertNoBlockInParagraph(node, file, inParagraph = false) {
  if (inParagraph && isAnyJsx(node) && BLOCK_COMPONENTS.has(node.name)) {
    file.fail(`<${node.name}> is a block and cannot sit inside a paragraph. Put it on its own line.`, node)
  }
  const inside = inParagraph || isTag(node, 'p') || (isAnyJsx(node) && node.name === 'p')
  for (const kid of node.children ?? []) assertNoBlockInParagraph(kid, file, inside)
}

// PNG, GIF and JPEG headers hold the size. Anything else is left for the browser to find.
function imageSize(bytes) {
  if (bytes.toString('latin1', 1, 4) === 'PNG') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  if (bytes.toString('latin1', 0, 3) === 'GIF') return [bytes.readUInt16LE(6), bytes.readUInt16LE(8)]
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  for (let at = 2; at + 9 < bytes.length; at += 2 + bytes.readUInt16BE(at + 2)) {
    const marker = bytes[at + 1]
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isFrame) return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)]
  }
  return null
}

// Root-relative paths are looked up in the public folder beside the post or the project's.
function sizeOf(src, file) {
  if (typeof src !== 'string' || /^([a-z]+:)?\/\//i.test(src)) return null
  const dir = file.path ? dirname(file.path) : file.cwd
  const places = src.startsWith('/')
    ? [join(dir, 'public', src), join(file.cwd, 'public', src)]
    : [join(dir, src)]
  for (const place of places) {
    try {
      return imageSize(readFileSync(place))
    } catch {
      // Not in this place. A missing image is reported by the browser, not the build.
    }
  }
  return null
}

function addImageSizes(node, file) {
  if (isTag(node, 'img') && node.properties.width == null) {
    const size = sizeOf(node.properties.src, file)
    if (size) [node.properties.width, node.properties.height] = size
  }
  if (isAnyJsx(node) && (node.name === 'img' || node.name === 'Figure')) {
    const attr = (name) => node.attributes.find((a) => a.name === name)
    const size = attr('width') ? null : sizeOf(attr('src')?.value, file)
    if (size) {
      node.attributes.push(
        { type: 'mdxJsxAttribute', name: 'width', value: String(size[0]) },
        { type: 'mdxJsxAttribute', name: 'height', value: String(size[1]) },
      )
    }
  }
  for (const kid of node.children ?? []) addImageSizes(kid, file)
}

export default function rehypeTufte() {
  return (tree, file) => {
    assertNoBlockInParagraph(tree, file)
    addImageSizes(tree, file)
    tree.children = tree.children.map(figureFromParagraph)
    if (!tree.children.some((node) => isJsx(node, 'section'))) {
      tree.children = sectionize(tree.children)
    }
  }
}
