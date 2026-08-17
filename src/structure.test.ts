import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'

// The source tree is layered, and the layering is the only thing keeping this
// app navigable: every import points down the list below, never up and never
// sideways into a screen. That rule is invisible in a diff — an import added the
// wrong way round compiles, passes every other test, and is only noticed when
// somebody later cannot work out where to put something.
//
// So it is checked here instead. This is not a style rule: `core` importing a
// screen would mean the phrase table could not be reasoned about without the
// menu, and a cycle between two directories means neither can be read first.

const SRC = resolve(process.cwd(), 'src')

/**
 * Lowest first. A directory may import from itself and from anything on an
 * earlier line — never from a later one, which is what makes cycles impossible
 * rather than merely absent today.
 */
const LAYERS: string[][] = [
  ['core'], //            what Peri knows and keeps
  ['ui'], //              the shared controls
  ['voice'], //           making sound come out, and choosing which
  ['menu'], //            the panel that slides down
  ['talk', 'signin', 'legal'], // the three screens
  ['.'], //               App and main, which reach anything
]

const layerOf = (dir: string) => LAYERS.findIndex(names => names.includes(dir))

/** Every source file, tests included — a test may not sneak round the rule. */
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

const IMPORT = /(?:from|import)\s+['"](\.[^'"]*)['"]/g

/** Which directory a file belongs to, relative to `src`. */
const directoryOf = (path: string) => dirname(relative(SRC, path)).split('/')[0]

interface Edge {
  file: string
  from: string
  to: string
}

const edges: Edge[] = sources().flatMap(path => {
  const text = readFileSync(path, 'utf8')
  const from = directoryOf(path)
  return [...text.matchAll(IMPORT)].flatMap(match => {
    const target = normalize(join(dirname(path), match[1]))
    const to = directoryOf(target)
    return to === from ? [] : [{ file: relative(SRC, path), from, to }]
  })
})

describe('the shape of the source tree', () => {
  it('puts every file in a directory the layering knows about', () => {
    const homeless = sources()
      .map(p => directoryOf(p))
      .filter(dir => layerOf(dir) === -1)
    expect([...new Set(homeless)]).toEqual([])
  })

  // The root is a layer, so a module dropped there would sit above everything
  // and answer to none of the rules below. Only the shell and the tests that
  // drive the whole app through it belong at this level.
  it('keeps modules out of the root', () => {
    const loose = sources()
      .filter(p => directoryOf(p) === '.')
      .map(p => relative(SRC, p))
      .filter(name => !/^(App\.tsx|main\.tsx|vite-env\.d\.ts)$/.test(name) && !name.includes('.test.'))
    expect(loose, 'put it in a layer, or say why it belongs beside App').toEqual([])
  })

  it('has something in every layer', () => {
    for (const layer of LAYERS) {
      for (const dir of layer) {
        expect(sources().some(p => directoryOf(p) === dir), `${dir} is empty`).toBe(true)
      }
    }
  })

  // The rule. Everything below is a consequence of it.
  it('imports only downwards, never up into a screen', () => {
    const wrongWay = edges
      .filter(e => layerOf(e.to) >= layerOf(e.from))
      .map(e => `${e.file} imports ${e.to}/ — ${e.to} is not below ${e.from}`)
    expect(wrongWay).toEqual([])
  })

  // Implied by the rule above, and worth failing separately: a cycle is the
  // failure that actually hurts to unpick later.
  it('has no two directories that import each other', () => {
    const pairs = new Set(edges.map(e => `${e.from} ${e.to}`))
    const mutual = [...pairs].filter(p => {
      const [from, to] = p.split(' ')
      return pairs.has(`${to} ${from}`)
    })
    expect(mutual).toEqual([])
  })

  // `core` is the one everything else is written against, so it has to be
  // readable on its own — no React, no screens, no network.
  it('keeps core free of everything else', () => {
    const reaching = edges.filter(e => e.from === 'core').map(e => `${e.file} imports ${e.to}/`)
    expect(reaching).toEqual([])
  })

  // Tailwind scans the whole project for words that look like utility names and
  // finds them in prose. `container.querySelector`, written in AGENTS.md, was
  // shipping a real `.container` rule and five media queries to every user — and
  // ten more utilities came from words in the stylesheet's own property values.
  // Scanning only the files that can carry a class took three kilobytes off the
  // bundle; the `source(none)` is what makes it an allowlist rather than a
  // guess at what to exclude.
  it('generates utilities only from files that can carry a class', () => {
    const css = readFileSync(resolve(SRC, 'index.css'), 'utf8')
    expect(css).toMatch(/@import ['"]tailwindcss['"] source\(none\)/)
    expect(css).toMatch(/@source ["']\.\/\*\*\/\*\.tsx["']/)
    expect(css).toMatch(/@source not ["']\.\/\*\*\/\*\.test\.tsx["']/)
  })

  // A NUL byte makes a file *binary* to grep, ripgrep and most review tools —
  // and a search over a binary file answers nothing rather than saying it cannot.
  // `core/backup.ts` carried one for a long time, as the separator in a composite
  // map key, and every search across the tree quietly skipped it. The character
  // is the right separator, being the one thing no category or phrase can hold;
  // it just has to be written as an escape rather than as the byte itself.
  it('keeps every source file searchable', () => {
    const binary = sources()
      .filter(p => readFileSync(p).includes(0))
      .map(p => relative(SRC, p))
    expect(binary).toEqual([])
  })

  it('keeps App as the only default export', () => {
    const defaults = sources()
      .filter(p => /^export default/m.test(readFileSync(p, 'utf8')))
      .map(p => relative(SRC, p))
    expect(defaults).toEqual(['App.tsx'])
  })
})
