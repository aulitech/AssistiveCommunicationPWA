// Translate the phrase table Peri ships, once, into a file it can carry.
//
//   DEEPL_KEY=… npx tsx tools/translate-table.ts es
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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const TABLE = resolve(process.cwd(), 'src/core/imports/phrasetable.json')
const OUT = (lang: string) => resolve(process.cwd(), `src/core/imports/translations/${lang}.json`)

/** DeepL takes at most 50 texts per request; well under its size cap too. */
const BATCH = 50

const endpointFor = (key: string) =>
  key.trim().endsWith(':fx') ? 'https://api-free.deepl.com/v2' : 'https://api.deepl.com/v2'

async function translateBatch(texts: string[], lang: string, key: string): Promise<string[]> {
  const response = await fetch(`${endpointFor(key)}/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, target_lang: lang.toUpperCase(), source_lang: 'EN' }),
  })
  if (!response.ok) throw new Error(`DeepL said ${response.status}: ${await response.text()}`)
  const body = (await response.json()) as { translations: { text: string }[] }
  return body.translations.map(t => t.text)
}

async function main() {
  const lang = process.argv[2]
  const key = process.env.DEEPL_KEY ?? ''
  if (!lang || !key) {
    console.error('usage: DEEPL_KEY=… npx tsx tools/translate-table.ts <language>')
    process.exit(2)
  }

  const table = JSON.parse(readFileSync(TABLE, 'utf8')) as { phrases: { txt: string }[] }

  // Phrases carrying a slot are left out on purpose. What gets spoken is not
  // known until the blank is filled — "Please turn {control} the lights" is said
  // as "Please turn on the lights" — so a translation of the raw phrase would
  // never be looked up. Those go to the translator at speaking time, like any
  // phrase somebody wrote themselves.
  const sources = [...new Set(table.phrases.map(p => p.txt).filter(t => t && !t.includes('{')))]

  const path = OUT(lang)
  const existing: Record<string, string> =
    existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { of: Record<string, string> }).of : {}

  const todo = sources.filter(t => !(t in existing))
  console.log(`${sources.length} phrases, ${sources.length - todo.length} already done, ${todo.length} to translate`)

  const of: Record<string, string> = { ...existing }
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH)
    const done = await translateBatch(batch, lang, key)
    batch.forEach((text, n) => {
      of[text] = done[n]
    })
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`)
  }

  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ language: lang, of }, null, 2)}\n`)
  console.log(`wrote ${path} — read it before committing it`)
}

void main()
