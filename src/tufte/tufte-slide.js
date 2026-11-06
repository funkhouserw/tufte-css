// Tufte kit, optional. Links already reach every note and swiping is native. This only makes
// a tap on a marker slide across and back, sideways only: the page stays exactly where it
// is, and no history is added. A note in place (a caption, a table) needs no slide at all.
let last
addEventListener('click', (e) => {
  const link = e.target.closest?.('a.tufte-note-ref, a.tufte-note-edge')
  const page = link?.closest('.tufte')
  const note = page && document.getElementById(link.hash.slice(1))
  if (!note) return
  e.preventDefault()
  if (!note.querySelector(':scope > .tufte-note-edge')?.getClientRects().length) return
  const open = Math.abs(page.scrollLeft) > 8
  const back = open && (link.matches('.tufte-note-edge') || note === last)
  const side = getComputedStyle(page).direction === 'rtl' ? -1 : 1
  page.scrollTo({ left: back ? 0 : side * (page.scrollWidth - page.clientWidth) })
  last = note
})
