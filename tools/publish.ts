// Publishes the latest release: Netlify's build of main, once CI has cut a
// `Version x.y.z` commit on it. Run by the Publish workflow in
// `.github/workflows/publish.yml` — from the Actions tab, or `gh workflow run
// publish` — and never from a laptop, so the token lives in one place.
//
// **Auto-publishing is off on purpose.** People speak through this app, so a
// release reaches them when somebody decides it should rather than whenever a
// merge happens. This is that decision made one command long instead of a walk
// through Netlify's dashboard, and it publishes exactly one thing — the build of
// the release commit, checked afterwards to be the one being served — or
// nothing at all.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { RELEASE_SUBJECT } from './release'

export interface Deploy {
  id: string
  commit_ref: string | null
  context: string
  state: string
}

/**
 * Netlify's build of this commit for the site itself, rather than a preview or
 * a branch. With auto-publishing off, that build is finished and waiting.
 */
export function buildOf(deploys: readonly Deploy[], sha: string): Deploy | undefined {
  return deploys.find(d => d.commit_ref === sha && d.context === 'production')
}

/** The app's own script, named in its page. */
export function scriptIn(html: string): string | null {
  return /src="(\/assets\/index-[\w-]+\.js)"/.exec(html)?.[1] ?? null
}

/**
 * Whether a build says it is this version. `vite.config.ts` writes it in as a
 * string, and the minifier chooses the quotes — backticks, as it happens.
 */
export function saysVersion(script: string, version: string): boolean {
  const escaped = version.replace(/\./g, '\\.')
  return new RegExp(`(["'\`])${escaped}\\1`).test(script)
}

// ── Running it ───────────────────────────────────────────────────────────────

const API = 'https://api.netlify.com/api/v1'
const WAIT_MS = 15 * 60_000
const POLL_MS = 15_000
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function netlify<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.NETLIFY_AUTH_TOKEN}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Netlify said ${res.status} to ${init.method ?? 'GET'} ${path}`)
  return (await res.json()) as T
}

async function main() {
  if (!process.env.NETLIFY_AUTH_TOKEN)
    throw new Error('NETLIFY_AUTH_TOKEN is not set — see Publishing in AGENTS.md')
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  const sha = git('rev-parse', 'HEAD')
  const subject = git('log', '-1', '--format=%s', sha)
  if (!RELEASE_SUBJECT.test(subject)) {
    throw new Error(
      `main ends in "${subject}", which has not been released. CI cuts a release once main passes; if it failed, nothing is published until a fix does.`,
    )
  }
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

  const site = await netlify<{ id: string; ssl_url: string; published_deploy?: { id: string } }>(
    `/sites/${process.env.NETLIFY_SITE}`,
  )

  // Netlify starts building the moment the release is pushed, and may not
  // have finished.
  let build: Deploy | undefined
  for (const until = Date.now() + WAIT_MS; ; await sleep(POLL_MS)) {
    build = buildOf(await netlify<Deploy[]>(`/sites/${site.id}/deploys?per_page=30`), sha)
    if (build?.state === 'ready') break
    if (build?.state === 'error') throw new Error(`Netlify failed to build ${version} (${sha.slice(0, 7)})`)
    if (Date.now() > until) throw new Error(`Netlify has not finished building ${version} after 15 minutes`)
    console.log(`Waiting for Netlify to build ${version}: ${build?.state ?? 'not started'}`)
  }

  if (site.published_deploy?.id === build.id) console.log(`${version} is already the published build.`)
  else await netlify(`/sites/${site.id}/deploys/${build.id}/restore`, { method: 'POST' })

  // Asked of the site itself, as a visitor would, until the edge has caught up.
  for (let tries = 0; ; tries++) {
    const html = await (await fetch(`${site.ssl_url}/?published=${Date.now()}`)).text()
    const src = scriptIn(html)
    if (src && saysVersion(await (await fetch(site.ssl_url + src)).text(), version)) break
    if (tries === 12) throw new Error(`Published, but ${site.ssl_url} is not serving ${version} a minute later`)
    await sleep(5_000)
  }
  console.log(`Published ${version} (${sha.slice(0, 7)}) at ${site.ssl_url}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
