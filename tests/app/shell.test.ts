import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// index.html and the manifest are the parts of the app no component renders, so
// nothing else here would notice them breaking. They used to be assembled by a
// Figma Make plugin from a config file that no longer exists; these are now
// plain static files, and this is what checks them.

// Resolved from the working directory, which Vitest sets to the project root.
// `import.meta.url` is not a file URL under the jsdom environment.
const repoFile = (p: string) => resolve(process.cwd(), p)
const read = (p: string) => readFileSync(repoFile(p), 'utf8')

const html = read('index.html')
const manifest = JSON.parse(read('public/manifest.webmanifest'))

describe('the HTML shell', () => {
  // The title was `<!-- figma:title -->`, replaced at build time by a plugin.
  // Without the plugin an unreplaced slot would ship as the literal tab title.
  it('has a real title naming the app', () => {
    expect(html).toMatch(/<title>Peri[^<]*<\/title>/)
  })

  it('has no build-time slots left to fill', () => {
    expect(html).not.toContain('<!-- figma:')
    expect(html).not.toMatch(/<!--\s*\w+:[\w-]+\s*-->/)
  })

  it('declares a language, which the plugin used to supply', () => {
    expect(html).toMatch(/<html lang="[a-z]{2}"/)
  })

  it('describes itself for a link preview', () => {
    expect(html).toMatch(/<meta\s+name="description"/)
    expect(html).toMatch(/property="og:title"/)
  })

  // A link shared with someone who needs the app previews as a blank card
  // without this, and a preview image that 404s is the same blank card.
  it('offers a preview image that exists', () => {
    const src = html.match(/property="og:image"\s+content="\/([^"]+)"/)?.[1]
    expect(src, 'no og:image').toBeDefined()
    expect(existsSync(repoFile(`public/${src}`)), `public/${src} is missing`).toBe(true)
  })

  it('points only at files that exist', () => {
    const refs = [...html.matchAll(/(?:href|src)="\/([^"]+)"/g)].map(m => m[1])
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) {
      if (ref.startsWith('src/')) continue // bundled by Vite, not served as-is
      expect(existsSync(repoFile(`public/${ref}`)), `public/${ref} is missing`).toBe(true)
    }
  })
})

describe('the manifest', () => {
  it('names the app', () => {
    expect(manifest.name).toMatch(/^Peri/)
    expect(manifest.short_name).toBe('Peri')
  })

  it('lists only icons that exist', () => {
    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons) {
      const path = `public${icon.src}`
      expect(existsSync(repoFile(path)), `${path} is missing`).toBe(true)
    }
  })

  // Android needs a maskable icon or it draws its own white plate behind this
  // one, which on a dark mark looks like a bug.
  it('offers a maskable icon', () => {
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  })
})

/**
 * The service worker, run. jsdom has none, so `public/sw.js` is handed the few
 * globals it touches — `self`, `caches`, `fetch`, `Response` — and its events
 * are driven by hand. `network` is what the server would answer, by path, and
 * a path it has no answer for is the network being down.
 */
interface Answer {
  status: number
  type: string
  body: string | null
  clone: () => Answer
}
type Listener = (event: Record<string, unknown>) => void

function runWorker(network: Record<string, string | null>) {
  const ORIGIN = 'https://peri.example'
  const answer = (body: string | null, status = 200, type = 'basic'): Answer => ({
    status,
    type,
    body,
    clone: () => answer(body, status, type),
  })
  const keyOf = (r: string | { url: string }) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href
  const asked: string[] = []
  const fetch = async (r: string | { url: string }) => {
    const path = new URL(keyOf(r)).pathname
    asked.push(path)
    const body = network[path]
    if (body === undefined || body === null) throw new TypeError('Failed to fetch')
    return answer(body)
  }
  const stores = new Map<string, Map<string, Answer>>()
  const caches = {
    open: async (name: string) => {
      const held = stores.get(name) ?? new Map<string, Answer>()
      stores.set(name, held)
      return {
        match: async (r: string | { url: string }) => held.get(keyOf(r)),
        put: async (r: string | { url: string }, a: Answer) => void held.set(keyOf(r), a),
        add: async (url: string) => void held.set(keyOf(url), await fetch(url)),
      }
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  }
  const listeners: Record<string, Listener> = {}
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  }
  const Response = { error: () => answer(null, 0, 'error') }
  new Function('self', 'caches', 'fetch', 'Response', read('public/sw.js'))(self, caches, fetch, Response)

  const lifecycle = async (type: string) => {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]({ waitUntil: (p: Promise<unknown>) => void (done = p) })
    await done
  }
  return {
    stores,
    asked,
    /** Installed and in charge, as a worker is after its first visit. */
    start: async () => {
      await lifecycle('install')
      await lifecycle('activate')
    },
    /** What the worker answers with, or undefined where it leaves the request to the browser. */
    get: async (path: string, mode = 'no-cors') => {
      let answered: Promise<Answer> | undefined
      listeners.fetch({
        request: { method: 'GET', url: ORIGIN + path, mode },
        respondWith: (p: Promise<Answer>) => void (answered = p),
      })
      return answered && (await answered).body
    },
  }
}

describe('the service worker', () => {
  /**
   * **An address that keeps its name from release to release is asked for
   * fresh.** The manifest was served from the cache first, and an installed
   * copy went on calling itself by the app's old name: Chrome's check for a new
   * manifest was answered with the one stored the day the worker installed.
   */
  it.each(['/manifest.webmanifest', '/icon.svg', '/robots.txt'])('asks the network for %s first', async path => {
    const network: Record<string, string | null> = { [path]: 'as installed' }
    const worker = runWorker(network)
    await worker.start()

    network[path] = 'as released since'
    expect(await worker.get(path), 'answered with what was stored when the worker installed').toBe(
      'as released since',
    )
  })

  // Offline is the whole reason the worker exists.
  it.each(['/manifest.webmanifest', '/icon.svg'])('answers for %s from the cache with no network', async path => {
    const network: Record<string, string | null> = { [path]: 'as installed' }
    const worker = runWorker(network)
    await worker.start()
    network[path] = 'as released since'
    await worker.get(path)

    network[path] = null
    expect(await worker.get(path)).toBe('as released since')
  })

  // Vite writes a hash of a file's contents into its name, so a file at one of
  // those addresses never changes, and asking again would only cost time.
  it('serves the build’s own output from the cache without asking again', async () => {
    const path = '/assets/index-DouszsZR.js'
    const network: Record<string, string | null> = { [path]: 'the build' }
    const worker = runWorker(network)
    await worker.start()

    expect(await worker.get(path)).toBe('the build')
    network[path] = 'something else'
    expect(await worker.get(path)).toBe('the build')
    expect(worker.asked.filter(p => p === path)).toHaveLength(1)
  })

  it('opens the app fresh, and from the shell it kept when there is no network', async () => {
    const network: Record<string, string | null> = {
      '/index.html': 'shell as installed',
      '/': 'shell as installed',
    }
    const worker = runWorker(network)
    await worker.start()

    network['/'] = 'shell as released since'
    expect(await worker.get('/', 'navigate')).toBe('shell as released since')
    network['/'] = null
    expect(await worker.get('/', 'navigate')).toBe('shell as released since')
  })

  // A generation holds whatever it stored, so each one takes the last away.
  it('leaves no cache but its own', async () => {
    const worker = runWorker({ '/manifest.webmanifest': 'current' })
    worker.stores.set('peri-v1', new Map())
    await worker.start()
    expect([...worker.stores.keys()]).toHaveLength(1)
    expect(worker.stores.has('peri-v1'), 'the generation holding the old manifest is still there').toBe(false)
  })

  /**
   * Synchronizing answers with whatever another device wrote a minute ago.
   * Cached once, a device would be told for ever that its board is what it was
   * this morning — and it would look exactly like synchronizing not working.
   */
  it('leaves the sync endpoint to the network, and never keeps it', async () => {
    const worker = runWorker({ '/api/sync': 'the board' })
    await worker.start()
    expect(await worker.get('/api/sync')).toBeUndefined()
    expect(worker.asked).not.toContain('/api/sync')
  })

  // The endpoint the app actually calls has to be the one that is exempt.
  it('names the path the client calls', () => {
    expect(read('src/sync/client.ts')).toContain("'/api/sync'")
  })
})

// robots.txt and the robots meta tag say the same thing to different readers.
// Changing one alone leaves the site half-hidden, which is the kind of thing
// nobody notices for months.
describe('indexing', () => {
  it('has robots.txt and the robots meta tag agreeing', () => {
    const disallowed = read('public/robots.txt').includes('Disallow: /')
    const noindex = /<meta\s+name="robots"\s+content="noindex/.test(html)
    expect(noindex).toBe(disallowed)
  })

  // An empty or missing file agrees with anything, so the check above would
  // pass while every crawl 404s.
  it('serves a robots.txt that actually says something', () => {
    const robots = read('public/robots.txt')
    expect(robots).toMatch(/^User-agent:/m)
    expect(robots).toMatch(/^(Allow|Disallow):/m)
  })
})

describe('the version', () => {
  // Bumped with every merge to main and shown on the menu's top line — see
  // AGENTS.md. Major, minor, patch, and nothing else: a pre-release tag or a
  // leading zero is a version nobody can compare with the one they are on.
  it('is a semantic version', () => {
    const { version } = JSON.parse(read('package.json')) as { version: string }
    expect(version).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
  })
})
