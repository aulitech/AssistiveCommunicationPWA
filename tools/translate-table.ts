// Translate the phrase table Peri ships, once, into a file it can carry.
//
//   GOOGLE_TRANSLATE_KEY=… pnpm translate es
//
// Why this is a build step and not something the app does: a board has to speak
// the moment it is opened, offline, and above all the **emergency bar must
// never wait on a network**. A translation fetched when somebody presses a
// button is a translation that arrives after they needed it. So the phrases
// Peri ships are translated here, checked in, and lazily loaded at runtime;
// only the phrases somebody wrote themselves ever go to a server, and only once
// each.
//
// It writes `src/core/imports/translations/<lang>.json`, **merging** into what
// is already there rather than replacing it: the emergency phrases are
// hand-written and reviewed, and a machine must not quietly take them over.
//
// The output is meant to be read before it is committed. These are phrases
// somebody will say to a nurse about their own body, and a plausible-looking
// mistranslation is worse than an English sentence the listener has to work at.
//
// **`GOOGLE_TRANSLATE_KEY`, not `VITE_GOOGLE_TRANSLATE_KEY`, and they are not
// the same key.** The app's is restricted by HTTP referrer to the site, which
// is the whole of what makes it safe to inline into a public bundle — and a
// referrer is exactly what Node does not send. So this takes an unrestricted
// key, off the command line and never out of a file, used for as long as it
// takes to write a table and no longer.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { decodeEntities } from '../src/translate/client'
import { resolve, dirname } from 'node:path'
import { tableFor, translationTarget } from '../src/core/translation'

const TABLE = resolve(process.cwd(), 'src/core/imports/phrasetable.json')
const OUT = (table: string) => resolve(process.cwd(), `src/core/imports/translations/${table}.json`)

/** Google takes up to 128 segments a request; this stays well inside its size cap. */
const BATCH = 100

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

async function translateBatch(texts: string[], target: string, key: string): Promise<string[]> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'X-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, target, source: 'en', format: 'text' }),
  })
  if (!response.ok) throw new Error(`Google said ${response.status}: ${await response.text()}`)
  const body = (await response.json()) as { data: { translations: { translatedText: string }[] } }
  // Escaped even when plain text is asked for — see `decodeEntities`.
  return body.data.translations.map(t => decodeEntities(t.translatedText))
}

async function main() {
  // The tag Peri stores, not the code the service wants — `es-PR` is asked for
  // as `es` and written to `es-419.json`, and the mapping lives in one place
  // rather than in a person's head at the command line.
  const tag = process.argv[2]
  const key = process.env.GOOGLE_TRANSLATE_KEY ?? ''
  if (!tag || !key) {
    console.error('usage: GOOGLE_TRANSLATE_KEY=… pnpm translate <language>   (e.g. es, fr, es-PR)')
    process.exit(2)
  }

  const table = tableFor(tag)
  const target = translationTarget(tag)
  if (!table) {
    console.error(`${tag} needs no translating.`)
    process.exit(2)
  }
  if (!target) {
    console.error(
      `Nothing translates into ${tag}. Its table is written by hand and read by somebody who speaks it — see src/core/imports/translations/${table}.json`,
    )
    process.exit(2)
  }

  const phraseTable = JSON.parse(readFileSync(TABLE, 'utf8')) as { phrases: { txt: string }[] }

  // Phrases carrying a slot are left out on purpose. What gets spoken is not
  // known until the blank is filled — "Please turn {control} the lights" is said
  // as "Please turn on the lights" — so a translation of the raw phrase would
  // never be looked up. Those go to the translator at speaking time, like any
  // phrase somebody wrote themselves.
  const sources = [...new Set(phraseTable.phrases.map(p => p.txt).filter(t => t && !t.includes('{')))]

  const path = OUT(table)
  const existing: Record<string, string> =
    existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { of: Record<string, string> }).of : {}

  const todo = sources.filter(t => !(t in existing))
  console.log(`${sources.length} phrases, ${sources.length - todo.length} already done, ${todo.length} to translate`)

  const of: Record<string, string> = { ...existing }
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH)
    const done = await translateBatch(batch, target, key)
    batch.forEach((text, n) => {
      of[text] = done[n]
    })
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`)
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ language: table, of }, null, 2)}\n`)
  console.log(`wrote ${path} — read it before committing it`)
}

void main()
