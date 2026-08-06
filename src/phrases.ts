// Phrase parsing.
//
// phrasetable.json stores fill-in-the-blank phrases whose slots come in a few
// hand-written (and not always well-formed) shapes:
//
//   { ['right', 'left'] }        inline choice list
//   {[ 'shirt', 'coat']}         …with stray whitespace
//   { 'book', 'magazine']}       …missing its opening bracket
//   { 'drink', 'eat'])           …and closing with a paren
//   {pronouns} {direction}       reference into the table's `aliases` block
//   {name.nickname}              dotted path into `aliases`
//   {}                           free blank with no data behind it
//
// Everything here turns those into structured segments so the UI can offer the
// options instead of printing the raw braces.

import phraseTable from './imports/phrasetable.json'

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'slot'; label: string; options: string[] }

export interface Phrase {
  id: string
  text: string // display text — slots rendered as their label
  segments: Segment[]
  category: string
}

// ── Aliases ───────────────────────────────────────────────────────────────────
// `aliases` is an array of single-key objects; values are either string lists or
// nested objects of lists/strings. Flatten to "key" and "key.subkey" lookups,
// and give each parent key the union of its children ("contacts" → every list).

type AliasIndex = Map<string, string[]>

function buildAliasIndex(raw: unknown): AliasIndex {
  const index: AliasIndex = new Map()
  if (!Array.isArray(raw)) return index

  const asList = (v: unknown): string[] | null => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    if (typeof v === 'string') return v.trim() ? [v.trim()] : []
    return null
  }

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      const direct = asList(value)
      if (direct) {
        index.set(key.toLowerCase(), direct)
        continue
      }
      if (value && typeof value === 'object') {
        const union: string[] = []
        for (const [sub, subValue] of Object.entries(value as Record<string, unknown>)) {
          const list = asList(subValue)
          if (!list) continue
          index.set(`${key}.${sub}`.toLowerCase(), list)
          union.push(...list)
        }
        index.set(key.toLowerCase(), union)
      }
    }
  }
  return index
}

const ALIASES = buildAliasIndex((phraseTable as { aliases?: unknown }).aliases)

// Phrases say {direction} / {contact} where the alias list is plural.
function lookupAlias(name: string): string[] | null {
  const key = name.toLowerCase()
  return ALIASES.get(key) ?? ALIASES.get(`${key}s`) ?? ALIASES.get(key.replace(/s$/, '')) ?? null
}

const ALIAS_LABELS: Record<string, string> = {
  pronouns: 'pronoun',
  directions: 'direction',
  headings: 'direction',
  contacts: 'contact',
  clothes: 'clothing',
  weather: 'weather',
  control: 'on/off',
  bodyparts: 'body part',
  'name.nickname': 'name',
}

/** Placeholder text shown (and inserted) for a slot with no options behind it. */
export const BLANK = '___'

function aliasLabel(name: string): string {
  const key = name.toLowerCase()
  return ALIAS_LABELS[key] ?? ALIAS_LABELS[`${key}s`] ?? key.replace(/[._]/g, ' ')
}

function listLabel(options: string[]): string {
  if (options.length === 0) return BLANK
  if (options.length <= 3) return options.join('/')
  return `${options.slice(0, 2).join('/')}/…`
}

// ── Placeholder parsing ──────────────────────────────────────────────────────
// Lenient on the closing character so the malformed `…'eat'])` entries still parse.

const PLACEHOLDER = /\{[^{}()]*[})]/g

function resolveSlot(body: string): { label: string; options: string[] } {
  const quoted = body.match(/'([^']*)'/g)
  if (quoted) {
    const options = quoted.map(q => q.slice(1, -1).trim()).filter(Boolean)
    return { label: listLabel(options), options }
  }

  const name = body.trim().replace(/[[\]]/g, '')
  if (name) {
    const options = lookupAlias(name)
    // A known alias that happens to be empty (contacts, name) still reads better
    // as its label than as a bare blank.
    if (options) return { label: options.length ? aliasLabel(name) : BLANK, options }
  }

  return { label: BLANK, options: [] }
}

/** Trailing periods/ellipses in the source table are inconsistent; drop them. */
function tidy(text: string): string {
  return text.replace(/\.{2,}/g, '').replace(/\s+/g, ' ')
}

export function parseSegments(raw: string): Segment[] {
  const segments: Segment[] = []
  let cursor = 0

  PLACEHOLDER.lastIndex = 0
  for (let match = PLACEHOLDER.exec(raw); match; match = PLACEHOLDER.exec(raw)) {
    if (match.index > cursor) {
      segments.push({ kind: 'text', text: tidy(raw.slice(cursor, match.index)) })
    }
    const { label, options } = resolveSlot(match[0].slice(1, -1))
    segments.push({ kind: 'slot', label, options })
    cursor = match.index + match[0].length
  }
  if (cursor < raw.length) segments.push({ kind: 'text', text: tidy(raw.slice(cursor)) })

  return segments.length ? segments : [{ kind: 'text', text: tidy(raw) }]
}

/** Render segments, substituting `choices` for slots (index-aligned to slots). */
export function compose(segments: Segment[], choices?: (string | null)[]): string {
  let slot = -1
  const out = segments
    .map(s => {
      if (s.kind === 'text') return s.text
      slot++
      return choices?.[slot] ?? (s.options.length ? s.label : BLANK)
    })
    .join('')
  return out.replace(/\s+/g, ' ').replace(/\s+([,.?!])/g, '$1').replace(/[.\s]+$/, '').trim()
}

/** Slots the user must pick a value for; blanks are left for them to type. */
export function choosableSlots(segments: Segment[]): Segment[] {
  return segments.filter((s): s is Extract<Segment, { kind: 'slot' }> => s.kind === 'slot' && s.options.length > 0)
}

export function hasChoices(segments: Segment[]): boolean {
  return segments.some(s => s.kind === 'slot' && s.options.length > 0)
}

// ── Stable ids ────────────────────────────────────────────────────────────────
// Keyed by content, not array position, so saved edits survive edits to
// phrasetable.json instead of silently reattaching to a neighbouring phrase.

function hash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export function makePhrase(raw: string, category: string, seen?: Map<string, number>): Phrase {
  const segments = parseSegments(raw)
  const key = `${category}|${raw}`
  let id = hash(key)
  if (seen) {
    // Same text twice in one category — disambiguate deterministically.
    const n = seen.get(id) ?? 0
    seen.set(id, n + 1)
    if (n > 0) id = `${id}-${n}`
  }
  return { id, text: compose(segments), segments, category }
}

/** Plain phrase with no slots — user-authored text and emergency entries. */
export function plainPhrase(id: string, text: string, category: string): Phrase {
  return { id, text, segments: [{ kind: 'text', text }], category }
}

export const PHRASES: Phrase[] = (() => {
  const rows = (phraseTable.phrases as { txt: string; category: string }[]) ?? []
  const seen = new Map<string, number>()
  return rows
    .filter(p => p.txt?.trim())
    .map(p => makePhrase(p.txt.trim(), p.category, seen))
    .filter(p => p.text.trim() !== '')
})()
