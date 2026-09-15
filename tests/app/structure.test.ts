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
  ['translate'], //       words into other words, before anything says them
  ['voice', 'sync', 'listen'], // the three that talk to something outside this device
  ['menu'], //            the panel that slides down
  ['talk', 'signin', 'legal'], // the three screens
  ['.'], //               App and main, which reach anything
]

const layerOf = (dir: string) => LAYERS.findIndex(names => names.includes(dir))

/**
 * Every file that ships. Tests are not among them any more — they live under
 * `tests/`, mirroring this tree — so the layering below is a rule about the app
 * rather than about the suite, which is what it was always for.
 */
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/** Every file under a directory, whatever its extension. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
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
  // and answer to none of the rules below. Only the shell belongs at this level;
  // the tests that drive the whole app through it are under `tests/app/`.
  it('keeps modules out of the root', () => {
    const loose = sources()
      .filter(p => directoryOf(p) === '.')
      .map(p => relative(SRC, p))
      .filter(name => !/^(App\.tsx|main\.tsx|vite-env\.d\.ts)$/.test(name))
    expect(loose, 'put it in a layer, or say why it belongs beside App').toEqual([])
  })

  it('has something in every layer', () => {
    for (const layer of LAYERS) {
      for (const dir of layer) {
        expect(
          sources().some(p => directoryOf(p) === dir),
          `${dir} is empty`,
        ).toBe(true)
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
  })

  /**
   * The Netlify function is bundled and shipped to a Lambda, and it takes
   * `src/core/envelope.ts` out of this tree to do it. That module must import
   * nothing at all: one value taken from the store pulled in `core/phrases`,
   * which pulled in the two and a half thousand phrases Peri ships, and a 3KB
   * function became 418KB of phrase table it has no use for.
   *
   * Neither half of that is visible in a diff. Both are checked here.
   */
  describe('what the server is allowed to take from the app', () => {
    it('lets the wire format stand alone', () => {
      const wire = readFileSync(resolve(SRC, 'core/envelope.ts'), 'utf8')
      const imports = [...wire.matchAll(IMPORT)].map(m => m[1])
      expect(imports, 'the wire format must import nothing — see the function').toEqual([])
    })

    it('takes the wire format and nothing else', () => {
      const reached = walk(resolve(process.cwd(), 'netlify'))
        .filter(path => /\.tsx?$/.test(path))
        .flatMap(path => [...readFileSync(path, 'utf8').matchAll(IMPORT)].map(m => m[1]))
        .filter(spec => spec.includes('/src/'))
      expect(reached).toEqual(['../../src/core/envelope'])
    })
  })

  /**
   * **Every test lives under `tests/`.** Not a matter of taste, and not a style
   * this file is enforcing for tidiness: `netlify/functions/` is a directory
   * where every file is published as a function, so a test written beside the
   * code it covered was deployed as one — and the deploy failed rather than the
   * suite, which is the worst place to find out.
   *
   * `src/` is in the same list for a smaller reason: the app is what ships, and
   * a test in it is a test in the bundle's dependency graph.
   */
  it('keeps every test out of what ships', () => {
    const stray = ['src', 'netlify']
      .flatMap(dir => walk(resolve(process.cwd(), dir)))
      .filter(path => /\.test\.tsx?$/.test(path))
      .map(path => relative(process.cwd(), path))
    expect(stray, 'move it under tests/, mirroring the directory it covers').toEqual([])
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

  // Text size is one setting now, and it works by being the root font-size —
  // which only reaches text written in `rem`. A single `font-size` left in
  // pixels is a line that will not grow when somebody turns the zoom up, and
  // the ones that matter most are the ones somebody would reach for it for.
  // Checked here rather than by eye: it is 77 declarations and a diff shows
  // nothing.
  it('sizes every piece of text in rem', () => {
    const css = readFileSync(resolve(SRC, 'index.css'), 'utf8')
    const inPixels = [...css.matchAll(/font-size:[^;]+/g)].map(m => m[0]).filter(rule => rule.includes('px'))
    expect(inPixels).toEqual([])

    // And the handful set from a component, where a bare number means pixels.
    const inline = sources()
      .flatMap(path =>
        [...readFileSync(path, 'utf8').matchAll(/fontSize: *([^,}]+)/g)].map(m => [path, m[1]] as const),
      )
      .filter(([, value]) => !value.includes('rem'))
      .map(([path, value]) => `${relative(SRC, path)}: ${value}`)
    expect(inline).toEqual([])
  })

  // Contrast is arithmetic, and nobody does it by eye — which is how the muted
  // grey sat at 4.3:1 against a hovered cell for the whole life of the app,
  // under what AA asks for, in the one state a control is in while somebody is
  // looking at it. The palette is small enough to simply check.
  //
  // AAA rather than AA: this is read by people with low vision, on a screen
  // they may be a metre from, and the dim colour is the one that carries every
  // sublabel and hint in the app.
  it('keeps every colour of text readable on every surface', () => {
    const css = readFileSync(resolve(SRC, 'index.css'), 'utf8')
    const token = (name: string) => {
      const hex = css.match(new RegExp(`--${name}: *(#[0-9a-fA-F]{3,6})`))?.[1]
      if (!hex) throw new Error(`the palette no longer defines --${name}`)
      return hex
    }

    /** WCAG relative luminance, which is not the same as how bright it looks. */
    const luminance = (hex: string) => {
      const full = hex.length === 4 ? hex.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : hex
      const channels = [1, 3, 5].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
      const [r, g, b] = channels.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: string, b: string) => {
      const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
      return (x + 0.05) / (y + 0.05)
    }

    // Every surface text is ever drawn on, `cell-hover` included — a cell under
    // the pointer is exactly when its words are being read.
    const surfaces = ['bg', 'surface', 'cell', 'cell-hover']
    const worst = surfaces.map(name => ({
      surface: name,
      ratio: Number(contrast(token('text-muted'), token(name)).toFixed(2)),
    }))
    expect(worst.filter(w => w.ratio < 7)).toEqual([])
  })

  it('keeps App as the only default export', () => {
    const defaults = sources()
      .filter(p => /^export default/m.test(readFileSync(p, 'utf8')))
      .map(p => relative(SRC, p))
    expect(defaults).toEqual(['App.tsx'])
  })

  /**
   * `tools/pointer-probe.html` measures the pointer stream the way `ui/dwell.ts`
   * reads it, and restates its constants to do so — it is standalone HTML with
   * no build step and nothing to import from.
   *
   * That is a copy, and a copy drifts. It is the instrument STALL_MS is meant to
   * be tuned with, and one quietly disagreeing with the code it is tuning is
   * worse than no instrument at all.
   */
  it('keeps the pointer probe telling the same numbers as the dwell hook', () => {
    const read = (text: string) =>
      Object.fromEntries(
        [...text.matchAll(/const (STALL_MS|STREAM_\w+) = ([\d_]+)/g)].map(m => [m[1], m[2].replace(/_/g, '')]),
      )

    const hook = read(readFileSync(resolve(SRC, 'ui/dwell.ts'), 'utf8'))
    const probe = read(readFileSync(resolve(process.cwd(), 'tools/pointer-probe.html'), 'utf8'))

    expect(Object.keys(hook).length, 'the hook names no constants — did they move?').toBeGreaterThan(0)
    // The probe restates only what it measures with; the hook has one more, the
    // window the classification is remembered for, which nothing here reads.
    for (const [name, value] of Object.entries(probe)) {
      expect(hook[name], `${name} is not a constant of the dwell hook`).toBeDefined()
      expect(value, `the probe and the dwell hook disagree about ${name}`).toBe(hook[name])
    }
    expect(Object.keys(probe)).toContain('STALL_MS')
  })

  /**
   * The same rule for the microphone probe, which answers a different question
   * about a different API.
   *
   * It is the instrument deciding whether listen mode can be given a device
   * setting at all — `SpeechRecognition` is documented to take neither a device
   * nor a stream, and the probe is what tests that claim against real hardware.
   * So it has to be reaching for **the same object the app reaches for**. A
   * probe measuring one recogniser while the app used another would answer a
   * question nobody asked.
   */
  it('keeps the microphone probe reaching for the same recogniser the app does', () => {
    const names = (text: string) =>
      [...new Set([...text.matchAll(/\b(webkitSpeechRecognition|SpeechRecognition)\b/g)].map(m => m[1]))].sort()

    const app = names(readFileSync(resolve(SRC, 'listen/recognition.ts'), 'utf8'))
    const probe = names(readFileSync(resolve(process.cwd(), 'tools/mic-probe.html'), 'utf8'))

    expect(app, 'the app names no recogniser — did it move?').toEqual([
      'SpeechRecognition',
      'webkitSpeechRecognition',
    ])
    expect(probe, 'the probe and the app disagree about what to ask for').toEqual(app)
  })

  /**
   * **How tall a box may get is one number, not two.**
   *
   * The message box and the heard box are held to one height by measurement —
   * see `topbar.tsx` — and a pair kept equal that way but capped by two numbers
   * would come apart at exactly the point one of them filled up. Even the clamp
   * that halves their share of a short screen while they are stacked is written
   * as a clamp *on* the cap rather than as a second value for it.
   *
   * Restated rather than derived is the `--edit-bar-inset` story, where a padding
   * grew and the strip that had to match it stayed where it was, 20px below the
   * border it rides.
   */
  it('caps either box from one number rather than two', () => {
    const css = readFileSync(resolve(SRC, 'index.css'), 'utf8')

    const cap = css.match(/--box-max-height: *([^;]+);/)?.[1]
    expect(cap, 'the stylesheet no longer names how tall a box may get').toBeDefined()

    // Anything else wanting that height has to ask for the token. Written out a
    // second time is exactly how the pair stops matching.
    expect(css.split(cap!).length - 1, `${cap} is written down more than once`).toBe(1)
  })

  /**
   * **The app has one idea of what a wide screen is, not two.**
   *
   * `topbar.tsx` asks the question in JavaScript, because the two controls it
   * gates are not cheap to mount and hide — each builds the device's voice list.
   * The stylesheet asks it again for listen mode, where the question is whether
   * the heard box can sit beside the message rather than above it.
   *
   * Two answers to one question would mean a band of widths where the app has
   * decided the screen is wide for one purpose and narrow for another, which is
   * the sort of thing nobody sees until they are holding a tablet at exactly
   * that size.
   */
  it('keeps the stylesheet and the topbar agreeing on what a wide screen is', () => {
    const css = readFileSync(resolve(SRC, 'index.css'), 'utf8')
    const topbar = readFileSync(resolve(SRC, 'talk/topbar.tsx'), 'utf8')

    const inCode = topbar.match(/WIDE_ENOUGH = '\(min-width: (\d+)px\)'/)?.[1]
    expect(inCode, 'the topbar no longer names a wide screen — did it move?').toBeDefined()

    // Only the queries that ask about width alone. The banded ones — a range,
    // or a width with an orientation — are about the bars giving up arrows on a
    // phone, which is a different question with a different answer.
    const inCss = [...css.matchAll(/@media \(min-width: (\d+)px\) \{/g)].map(m => m[1])
    expect(inCss, 'the stylesheet no longer has a wide-screen rule').not.toEqual([])
    for (const width of inCss) {
      expect(width, 'the stylesheet and the topbar disagree about a wide screen').toBe(inCode)
    }
  })

  /**
   * **Every command `package.json` offers has to exist.**
   *
   * Two of them did not. `translate` named `tsx`, which was never a dependency,
   * so the tool for building the shipped translation tables had never once run.
   * `format` named a version of oxfmt that dropped the `;` separators inside
   * type literals, so running the documented command turned ninety files into
   * invalid syntax. Neither failure was visible in a diff, and neither was
   * reachable from any test: a script nothing runs is a script nobody notices is
   * broken until they need it.
   *
   * This does not run them — `dev` never exits and `translate` would spend
   * somebody's money. It checks the cheaper claim underneath both failures: that
   * the binary a script reaches for is one this project actually installs.
   */
  it('offers no script whose command it has not installed', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const bin = new Set(readdirSync(resolve(process.cwd(), 'node_modules/.bin')))
    // `pnpm` re-enters this same file, and `open` is macOS's own.
    const provided = new Set(['pnpm', 'open'])

    for (const [name, command] of Object.entries(pkg.scripts)) {
      const binary = command.trim().split(/\s+/)[0]!
      expect(
        provided.has(binary) || bin.has(binary),
        `\`pnpm ${name}\` runs \`${binary}\`, which is not installed — add it to devDependencies`,
      ).toBe(true)
    }
  })
})
