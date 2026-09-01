// Reading a link out of a paste or a drop, and writing it as markdown.
//
// A URL is the worst thing an AAC board can hold as text: it is long, it wraps
// a whole row, and read aloud it is forty seconds of punctuation. What somebody
// dropping a link wants on the button is its name. So a dropped or pasted link
// becomes `[label](url)` — the board and the synthesiser see the label, and the
// URL is still there to be copied out.
//
// A clipboard and a drag carry the same shape, `DataTransfer`, so one reader
// serves both. Both also carry several versions of the same thing, and the
// richer ones are the only place a label is to be found: dragging a link offers
// the anchor's own text, and dragging a tab offers the page title.

/** What a paste or a drop turned out to be carrying. */
export interface Link {
  url: string
  label: string
}

/**
 * Schemes a link may use. Anything else — `javascript:` above all — is refused
 * outright. Nothing here renders a URL as a real anchor today, but this text
 * gets copied to a clipboard and pasted into things that will, and a board is
 * a file people hand to each other.
 */
const SCHEMES = ['http:', 'https:', 'mailto:']

function readUrl(raw: string): string | null {
  const candidate = raw.trim()
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return SCHEMES.includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

/** The first thing in a `text/uri-list` that is a URL. Its comments start with `#`. */
function fromUriList(list: string): string | null {
  for (const line of list.split(/\r?\n/)) {
    if (line.startsWith('#')) continue
    const url = readUrl(line)
    if (url) return url
  }
  return null
}

/** The text of the first anchor in a dragged or copied fragment of a page. */
function labelFromHtml(html: string): string | null {
  try {
    const anchor = new DOMParser().parseFromString(html, 'text/html').querySelector('a')
    return anchor?.textContent?.trim() || null
  } catch {
    return null
  }
}

/** Firefox hands over `url\ntitle` when a tab or a bookmark is dragged. */
function labelFromMozUrl(value: string): string | null {
  return value.split(/\r?\n/)[1]?.trim() || null
}

/** Last resort, and a decent one: the site's name, which is short and speakable. */
function labelFromUrl(url: string): string {
  try {
    const { hostname, protocol, pathname } = new URL(url)
    if (protocol === 'mailto:') return pathname
    return hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * The link a paste or a drop is carrying, or null when it is not carrying one —
 * in which case the caller leaves the event alone and lets the browser paste or
 * drop it the ordinary way.
 */
export function readLink(data: DataTransfer | null): Link | null {
  if (!data) return null
  const get = (type: string) => {
    try {
      return data.getData(type)
    } catch {
      // A DataTransfer outside its own event throws rather than answering.
      return ''
    }
  }

  const url = fromUriList(get('text/uri-list') || '') ?? readUrl(get('text/plain') || '')
  if (!url) return null

  const label =
    labelFromHtml(get('text/html') || '') ?? labelFromMozUrl(get('text/x-moz-url') || '') ?? labelFromUrl(url)

  return { url, label: tidyLabel(label) || labelFromUrl(url) }
}

/**
 * The same question of a bare string, for the paste control.
 *
 * A keyboard paste arrives as a `DataTransfer` carrying several versions of the
 * same thing, and the richer ones are where a label comes from. Reading the
 * clipboard on purpose hands over text and nothing else, so there is no page
 * title to be had and the site's own name is the best label on offer.
 */
export function readLinkText(text: string): Link | null {
  const url = readUrl(text)
  if (!url) return null
  return { url, label: labelFromUrl(url) }
}

/**
 * A label is one line of a button. Newlines are taken out because a phrase now
 * reads them as new lines, and brackets because they would close the label
 * early. It is deliberately not shortened: a long page title makes an awkward
 * button, but it is sitting in a text box the user can edit, and quietly
 * cutting somebody's words down is worse than showing them all of them.
 */
function tidyLabel(label: string): string {
  return label.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim()
}

/**
 * `[label](url)`, in the shape the parser can read back. A URL containing a
 * closing bracket is encoded rather than escaped, because the parser has no
 * escapes — the first `)` ends the URL, so there must not be an earlier one.
 */
export function linkMarkdown({ url, label }: Link): string {
  return `[${tidyLabel(label)}](${url.replace(/\)/g, '%29')})`
}

/**
 * Opens a link in a new tab, and says whether it managed to.
 *
 * A new tab rather than this one, always: the board is how somebody is talking,
 * and navigating it away mid-conversation takes their voice rather than lending
 * them a browser. `noopener` because the page opened must not be able to reach
 * back and drive the tab the board is in.
 *
 * **It can be refused.** A browser only allows this off the back of a recent
 * click, tap or key press, and a dwell is a timer firing after a pointer has
 * rested — no press anywhere in it. So a gaze user may well be blocked, which
 * is exactly the wrong way round; the caller is expected to say so out loud
 * rather than let the choice do nothing at all.
 */
export function openLink(url: string): boolean {
  if (!readUrl(url)) return false
  try {
    return window.open(url, '_blank', 'noopener,noreferrer') !== null
  } catch {
    return false
  }
}
