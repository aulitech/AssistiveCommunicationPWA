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
 * The service worker serves every same-origin GET from its cache first, which is
 * right for build artefacts and catastrophic for the one path whose answer
 * changes without the app being rebuilt. Cached once, a device would be told for
 * ever that its board is what it was this morning — and it would look exactly
 * like synchronizing not working.
 *
 * Nothing in jsdom runs a service worker, so what can be checked here is that
 * the rule is written. Whether it takes effect is a question for a real install.
 */
describe('the service worker', () => {
  const sw = read('public/sw.js')

  it('leaves the sync endpoint alone', () => {
    expect(sw).toMatch(/pathname\.startsWith\('\/api\//)
  })

  // Inside the fetch handler, and before the cache-first branch — an exemption
  // written after the lookup exempts nothing at all. Measured from the handler
  // rather than the file, which opens a cache while it is still installing.
  it('says so before it reaches for the cache', () => {
    const handler = sw.slice(sw.indexOf("addEventListener('fetch'"))
    expect(handler).toContain("'/api/")
    expect(handler.indexOf("'/api/")).toBeLessThan(handler.indexOf('cache.match(request)'))
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
