import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
   * **Nothing in the app answers only to a press.**
   *
   * An audit found four plain anchors, three text fields that took the caret
   * only on a click, and a file button a rest did nothing to — each of them a
   * control somebody working the board by gaze alone could see and not use, and
   * none of them failing a test, since a test that clicks proves nothing about
   * whether a rest does anything. `tests/app/reach.test.tsx` drives each one by
   * resting. This is what stops the next one being written.
   *
   * So the source may hold an anchor only inside `DwellLink`, a single-line
   * field only inside `DwellInput`, and no native `<select>` at all — an
   * operating system draws its list outside the page, where nothing can be
   * hovered. A textarea has to carry the caret dwell's own handlers. The one
   * bare input left is where the file picker hands its answer back, which is
   * nothing a pointer or a keyboard may land on.
   */
  it('holds every link, field and list to the dwell-driven version of itself', () => {
    // Comments first: half the prose in this tree explains why something is
    // *not* a `<select>`, and would otherwise count as one.
    const code = (path: string) =>
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    // To the end of the tag, which for a field is its `/>` rather than the first
    // `>` — every handler written as an arrow has one of those in it.
    const found = (tag: string, end = '/>') =>
      sources()
        .filter(path => path.endsWith('.tsx'))
        .flatMap(path =>
          [...code(path).matchAll(new RegExp(`<${tag}[\\s>][^]*?${end}`, 'g'))].map(m => ({
            file: relative(SRC, path),
            tag: m[0],
          })),
        )

    expect(
      found('a', '>').map(f => f.file),
      'an anchor outside DwellLink answers to a click and nothing else',
    ).toEqual(['ui/controls.tsx'])

    expect(found('select', '>'), 'a native list is drawn where nothing can be hovered').toEqual([])

    // Two inputs in the whole tree, both in the shared controls: `DwellInput`,
    // which every field is, and `FileButton`'s picker, which every file chooser
    // is — the backup's and the spreadsheet's — so the rule about hiding it is
    // kept in one place rather than once per chooser.
    const inputs = found('input')
    expect(
      [...new Set(inputs.map(f => f.file))],
      'a field outside DwellInput takes the caret only on a click',
    ).toEqual(['ui/controls.tsx'])
    expect(inputs).toHaveLength(2)
    const pickers = inputs.filter(f => /type="file"/.test(f.tag))
    expect(pickers, 'the bare input left is the file picker').toHaveLength(1)
    const picker = pickers[0]!.tag
    expect(picker, 'the file input is a second target beside its button').toMatch(/aria-hidden="true"/)
    expect(picker).toMatch(/tabIndex=\{-1\}/)

    const boxes = found('textarea')
    expect(boxes.length, 'no text boxes at all — did they move?').toBeGreaterThan(0)
    for (const box of boxes) {
      expect(box.tag, `a textarea in ${box.file} has no caret dwell on it`).toMatch(/\{\.\.\.caret\.props\}/)
    }
  })

  /**
   * **Everything that scrolls has a way to scroll it by dwell.** A wheel, a
   * trackpad and a scrollbar are all things a gaze user does not have, so what
   * scrolls out of reach of the only input somebody has is simply gone. Three
   * surfaces did: the slot chooser, the legal pages, and the edit strip — the
   * first two now scroll in a pane, and the third no longer scrolls at all.
   *
   * The list below is every surface allowed to scroll, and **what scrolls it**.
   * A new one fails here until somebody writes down which controls reach it,
   * which is the whole of the point: a scrolling surface is a decision, not a
   * default.
   */
  it('lets nothing scroll that a dwell cannot scroll', () => {
    const SCROLLED_BY: Record<string, string> = {
      '.text-display': 'BoxScroll, inside its right edge',
      '.heard-text': 'BoxScroll, inside its right edge',
      '.filter-scroll': 'the category bar’s own arrows',
      '.grid-wrapper': 'the grid rail',
      '.scroll-row-inner': 'ScrollRow’s arrows',
      '.scroll-pane-inner': 'ScrollPane’s controls above and below',
    }
    const css = readFileSync(resolve(SRC, 'index.css'), 'utf8')
    const scrolling = [...css.matchAll(/([^{}]+)\{[^{}]*overflow(?:-x|-y)?: *(?:auto|scroll)[^{}]*\}/g)].map(m =>
      m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim(),
    )
    expect(scrolling.sort(), 'something scrolls that nothing is written down as scrolling').toEqual(
      Object.keys(SCROLLED_BY).sort(),
    )
  })

  /**
   * **Every icon a line of prose names is one that can be drawn.**
   *
   * A mark nothing defines draws nothing — the sentence keeps its spacing and
   * quietly loses the thing it was pointing at, which in a guide whose whole job
   * is to say *this button, the one that looks like this* is the worst way for
   * it to be wrong. Nothing else would catch it: the mark is a string, so it
   * costs no type error and no failing render.
   */
  it('names no icon in its prose that it cannot draw', () => {
    const drawable = new Set(
      [...readFileSync(resolve(SRC, 'ui/prose-icons.tsx'), 'utf8').matchAll(/^ {2}'?([a-z][a-z-]*)'?:/gm)].map(
        m => m[1],
      ),
    )
    expect(drawable.size, 'nothing can be drawn at all — did the table move?').toBeGreaterThan(0)

    const named = ['menu/help.ts', 'legal/legal.ts'].flatMap(file =>
      [...readFileSync(resolve(SRC, file), 'utf8').matchAll(/:([a-z][a-z-]*):/g)].map(m => m[1]!),
    )
    expect(named.length, 'the guide names no icons at all — did the marks move?').toBeGreaterThan(0)

    const missing = [...new Set(named)].filter(name => !drawable.has(name))
    expect(missing, 'named in the prose and not in the icon table').toEqual([])
  })

  /**
   * **A focused field draws one line, not two.** Every text field says it has
   * focus by tinting its own border, and the app's focus ring draws three pixels
   * outside whatever is focused — so every field a dwell had put the caret in
   * wore two accent lines, one inside the other. Found on the message box first
   * and fixed there alone, which left every key, passphrase and figure in
   * Settings still doubled.
   *
   * So the ring is taken off every one of them, and each has to say focus on its
   * own border instead — or taking the ring away takes the only sign of focus a
   * keyboard user had.
   */
  it('draws a focused field once, on its own border', () => {
    // Comments out first, or the one above a rule reads as part of its first selector.
    const css = readFileSync(resolve(SRC, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = (selector: string) => {
      const found = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(m =>
        m[1]!.split(',').some(sel => sel.trim() === selector),
      )
      return found?.[2] ?? ''
    }
    for (const field of ['.text-display', '.heard-text', '.caret-field']) {
      expect(rule(`${field}:focus-visible`), `${field} still wears the ring outside its border`).toMatch(
        /outline: *none/,
      )
      expect(rule(`${field}:focus`), `${field} shows no focus of its own once the ring is gone`).toMatch(
        /border-color: *var\(--accent\)/,
      )
    }
  })

  /**
   * **Every animation names keyframes that exist.**
   *
   * A CSS animation whose name nothing defines does not fail — it simply never
   * runs, silently, and what it was animating sits still. On this app that is a
   * dwell control that fills instantly or not at all, which reads as a broken
   * control rather than as a missing rule.
   *
   * It nearly shipped: renaming the keyframe the message box fills with left the
   * Aliases panel's fields pointing at a name that had gone, and nothing in the
   * build, the types or the tests would have said so.
   */
  it('animates nothing by a name it has not defined', () => {
    const css = readFileSync(resolve(SRC, 'index.css'), 'utf8')

    const defined = new Set([...css.matchAll(/@keyframes +([\w-]+)/g)].map(m => m[1]))
    expect(defined.size, 'the stylesheet defines no keyframes at all — did they move?').toBeGreaterThan(0)

    // The name is the one part of the shorthand that is not a time, a count, a
    // timing function or a keyword — and here it is always written first.
    const used = [...css.matchAll(/animation: *([\w-]+)/g)].map(m => m[1]!).filter(name => name !== 'none')
    const missing = [...new Set(used)].filter(name => !defined.has(name))
    expect(missing, 'animated by a name no @keyframes defines').toEqual([])
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
  // A board is somebody's, and all that keeps it theirs is that every read and
  // write names whose — see *Whose board* in `core/store.ts`. A key read under
  // its bare name is one every account on the device shares, which is what
  // every key here was until that existed.
  it('stores everything under the name of whose it is', () => {
    const code = (path: string) =>
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    /** The device's own: who is signed in, who owned it first, the sign-in page, and Apple's names. */
    const DEVICE_WIDE: Record<string, string[]> = {
      'core/store/user.ts': ['USER_KEY'],
      'core/store/owner.ts': ['FIRST_OWNER_KEY'],
      'core/store/settings.ts': ['SETTINGS_KEY + NOBODY'],
      'signin/auth.ts': ['APPLE_NAME_KEY', 'nameKey'],
    }
    // `writeKey` is where every write goes now, so what its callers hand it is
    // what has to name whose — its own declaration is not a call.
    const STORED =
      /(?:localStorage\.(?:get|set|remove)Item|indexedDB\.open|(?<!function )writeKey)\(\s*([^,)]+?)\s*[,)]/g
    /** The one writer, which is handed a name already made: its callers are what is checked. */
    const isTheWriter = (file: string, name: string) => file === 'core/store/keys.ts' && name === 'key'

    const found = sources().flatMap(path => {
      const file = relative(SRC, path)
      return [...code(path).matchAll(STORED)].map(m => ({ file, name: m[1] }))
    })
    expect(found.length, 'the pattern stopped finding anything').toBeGreaterThan(30)
    expect(
      found
        .filter(
          ({ file, name }) =>
            !name.startsWith('storageKey(') && !DEVICE_WIDE[file]?.includes(name) && !isTheWriter(file, name),
        )
        .map(({ file, name }) => `${file}: ${name}`),
      'stored under a name every account on this device shares',
    ).toEqual([])
  })

  /**
   * **Every write goes through `writeKey`.** A write can be refused — a full
   * store, a private window — and one that threw from inside a state update
   * took the whole screen down, the emergency bar with it. The helper is the
   * one place that cannot happen, so it has to be the one place that writes.
   */
  it('writes to storage in exactly one place', () => {
    const code = (path: string) =>
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    const writers = sources().flatMap(path =>
      [...code(path).matchAll(/localStorage\.setItem\(/g)].map(() => relative(SRC, path)),
    )
    expect(writers).toEqual(['core/store/keys.ts'])
  })

  /**
   * **The documents that tell somebody how to run this project, held to what it
   * can run and to what it has.** A README goes stale quietly: a script is
   * renamed, a file moves, and the instructions keep looking right. Both of
   * these are the first thing a newcomer reads, so what they name has to exist.
   */
  it('names no command or file the documents do not have', () => {
    const scripts = new Set(
      Object.keys(
        (
          JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
            scripts: Record<string, string>
          }
        ).scripts,
      ),
    )
    // pnpm's own, which are not this project's to declare.
    const own = new Set(['install', 'exec', 'dlx', 'add', 'run', 'why'])

    for (const doc of ['README.md', 'CONTRIBUTING.md']) {
      const text = readFileSync(resolve(process.cwd(), doc), 'utf8')

      for (const [, script] of text.matchAll(/`pnpm ([a-z][\w:-]*)/g)) {
        expect(scripts.has(script!) || own.has(script!), `${doc} tells somebody to run \`pnpm ${script}\``).toBe(
          true,
        )
      }

      for (const [, link] of text.matchAll(/]\((?!https?:|#)([^)]+)\)/g)) {
        expect(existsSync(resolve(process.cwd(), link!)), `${doc} links to ${link}, which is not there`).toBe(true)
      }
    }
  })

  /**
   * **What the guide for agents names has to exist.** AGENTS.md is the map
   * every session starts from, and a map pointing at something that has moved
   * sends it looking for what is not there. It went stale the quiet way: a test
   * file split into nine and still named as one in six places, three paths from
   * before the source was layered, and two names renamed the day after they
   * were written down.
   *
   * **A name in backticks is a claim that it exists.** Every path must be a
   * file — from the root, from `src/`, or from `tests/`, or for a bare filename
   * somewhere in the tree — and every identifier must be a word the code uses.
   * A name that no longer exists and is mentioned only as history is written
   * without backticks.
   */
  it('names nothing in the agents guide that the project does not have', () => {
    const guide = readFileSync(resolve(process.cwd(), 'AGENTS.md'), 'utf8')
    const root = process.cwd()
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        ['node_modules', '.git', 'dist'].includes(entry.name)
          ? []
          : entry.isDirectory()
            ? walk(resolve(dir, entry.name))
            : [resolve(dir, entry.name)],
      )
    const files = walk(root)
    const basenames = new Set(files.map(f => f.split('/').pop()!))
    const code = files
      .filter(f => /\.(ts|tsx|css|js|html|yml|json|toml|yaml)$/.test(f) && !f.includes('/core/imports/'))
      .map(f => readFileSync(f, 'utf8'))
      .join('\n')
    const words = new Set(code.match(/[A-Za-z_]\w*/g))
    /** Names that are real and are not this project's own: events, an attribute, an API field, pnpm's error. */
    const NOT_OURS = new Set(['audiostart', 'audioend', 'inputmode', 'language_code', 'ERR_PNPM_IGNORED_BUILDS'])

    const quoted = [...guide.matchAll(/`([^`\s]+)`/g)].map(m => m[1]!)
    const missingPaths = quoted.filter(
      name =>
        /\.(ts|tsx|css|json|md|html|toml|yaml|js)$/.test(name) &&
        !name.startsWith('.') &&
        !/[<*]/.test(name) &&
        (name.includes('/')
          ? !['', 'src', 'tests'].some(base => existsSync(resolve(root, base, name)))
          : !basenames.has(name)),
    )
    const missingNames = quoted.filter(
      name =>
        /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)?$/.test(name) &&
        !NOT_OURS.has(name) &&
        !name.split('.').every(part => words.has(part)),
    )

    expect(missingPaths, 'AGENTS.md names a file that is not there').toEqual([])
    expect(missingNames, 'AGENTS.md names something the code does not have').toEqual([])
  })

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
