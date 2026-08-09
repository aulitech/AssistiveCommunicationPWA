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

// ── User profile ──────────────────────────────────────────────────────────────
// The table ships `contacts` and `name` empty and there is nowhere in the data
// to put a particular person's details, so phrases like "I'm going to call
// {contact}" resolve to nothing. The profile supplies those values per user and
// overlays the table's entries.

export interface Profile {
  name: { given: string; surname: string; nickname: string }
  contacts: string[]
}

export const EMPTY_PROFILE: Profile = {
  name: { given: '', surname: '', nickname: '' },
  contacts: [],
}

/** Alias entries derived from the user's own details. */
export function profileAliases(profile: Profile): AliasIndex {
  const index: AliasIndex = new Map()
  const clean = (s: string) => s.trim()

  const contacts = profile.contacts.map(clean).filter(Boolean)
  if (contacts.length) index.set('contacts', contacts)

  const { given, surname, nickname } = profile.name
  const entries: [string, string][] = [
    ['name.given', given],
    ['name.surname', surname],
    ['name.nickname', nickname],
  ]
  const parts: string[] = []
  for (const [key, value] of entries) {
    const v = clean(value)
    if (!v) continue
    index.set(key, [v])
    parts.push(v)
  }
  // A bare {name} reads as the fullest form the user has given us.
  const full = clean([given, surname].map(clean).filter(Boolean).join(' ')) || clean(nickname)
  if (full) index.set('name', [full])
  else if (parts.length) index.set('name', [parts[0]])

  return index
}

// Phrases say {direction} / {contact} where the alias list is plural.
function lookupAlias(name: string, overlay?: AliasIndex): string[] | null {
  const key = name.toLowerCase()
  const from = (m: AliasIndex | undefined) =>
    m ? (m.get(key) ?? m.get(`${key}s`) ?? m.get(key.replace(/s$/, '')) ?? null) : null
  // The user's own details win over the table's empty placeholders.
  const user = from(overlay)
  if (user?.length) return user
  return from(ALIASES)
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

function resolveSlot(body: string, overlay?: AliasIndex): { label: string; options: string[] } {
  const quoted = body.match(/'([^']*)'/g)
  if (quoted) {
    const options = quoted.map(q => q.slice(1, -1).trim()).filter(Boolean)
    return { label: listLabel(options), options }
  }

  const name = body.trim().replace(/[[\]]/g, '')
  if (name) {
    const options = lookupAlias(name, overlay)
    // A single value needs no picker, so show it in place of the label.
    if (options?.length === 1) return { label: options[0], options }
    // A known alias that happens to be empty (contacts, name with no profile)
    // still reads better as a blank than as a label with nothing behind it.
    if (options) return { label: options.length ? aliasLabel(name) : BLANK, options }
  }

  return { label: BLANK, options: [] }
}

/** Trailing periods/ellipses in the source table are inconsistent; drop them. */
function tidy(text: string): string {
  return text.replace(/\.{2,}/g, '').replace(/\s+/g, ' ')
}

export function parseSegments(raw: string, overlay?: AliasIndex): Segment[] {
  const segments: Segment[] = []
  let cursor = 0

  PLACEHOLDER.lastIndex = 0
  for (let match = PLACEHOLDER.exec(raw); match; match = PLACEHOLDER.exec(raw)) {
    if (match.index > cursor) {
      segments.push({ kind: 'text', text: tidy(raw.slice(cursor, match.index)) })
    }
    const { label, options } = resolveSlot(match[0].slice(1, -1), overlay)
    segments.push({ kind: 'slot', label, options })
    cursor = match.index + match[0].length
  }
  if (cursor < raw.length) segments.push({ kind: 'text', text: tidy(raw.slice(cursor)) })

  return segments.length ? segments : [{ kind: 'text', text: tidy(raw) }]
}

export type Slot = Extract<Segment, { kind: 'slot' }>

/** What a slot reads as when the user has not picked for it. */
function slotDefault(segment: Slot): string {
  if (segment.options.length === 1) return segment.options[0]
  return segment.options.length ? segment.label : BLANK
}

/** Render segments, substituting `choices` for slots (index-aligned to slots). */
export function compose(segments: Segment[], choices?: (string | null)[]): string {
  let slot = -1
  const out = segments
    .map(s => {
      if (s.kind === 'text') return s.text
      slot++
      return choices?.[slot] ?? slotDefault(s)
    })
    .join('')
  return out.replace(/\s+/g, ' ').replace(/\s+([,.?!])/g, '$1').replace(/[.\s]+$/, '').trim()
}

/**
 * Slots the user must pick a value for. A slot with exactly one value needs no
 * picker — it is already the answer — and a slot with none is a typed blank.
 */
export function choosableSlots(segments: Segment[]): Slot[] {
  return segments.filter((s): s is Slot => s.kind === 'slot' && s.options.length > 1)
}

export function hasChoices(segments: Segment[]): boolean {
  return segments.some(s => s.kind === 'slot' && s.options.length > 1)
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

export function makePhrase(
  raw: string,
  category: string,
  seen?: Map<string, number>,
  overlay?: AliasIndex,
): Phrase {
  const segments = parseSegments(raw, overlay)
  // Hash the source text, not the rendered text, so a phrase keeps its id when
  // the user's profile changes what its slots resolve to.
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

const PHRASE_ROWS = ((phraseTable.phrases as { txt: string; category: string }[]) ?? []).filter(p =>
  p.txt?.trim(),
)

/**
 * The phrase table resolved against a user profile. Only a handful of phrases
 * reference profile-backed aliases, but slot options are baked in at parse time,
 * so the table is rebuilt when the profile changes — a few milliseconds, and
 * only on an edit to the user's own details.
 */
export function buildPhrases(profile: Profile = EMPTY_PROFILE): Phrase[] {
  const overlay = profileAliases(profile)
  const seen = new Map<string, number>()
  return PHRASE_ROWS.map(p => makePhrase(p.txt.trim(), p.category, seen, overlay)).filter(
    p => p.text.trim() !== '',
  )
}

/** The table with no profile applied. */
export const PHRASES: Phrase[] = buildPhrases()

// ── Emergency phrases ────────────────────────────────────────────────────────
// Not part of the table: they are fixed, they are few, and they have to exist
// whether or not the table ever loads.

export const EMERGENCY_PHRASES: Phrase[] = [
  ['em-0', 'Help me!'],
  ['em-1', "I'm in pain"],
  ['em-2', 'Call 911'],
  ['em-3', 'Get a doctor'],
  ['em-4', "I can't breathe"],
  ['em-5', 'Call my family'],
].map(([id, text]) => plainPhrase(id, text, 'Emergency'))
