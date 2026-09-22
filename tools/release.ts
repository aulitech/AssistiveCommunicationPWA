// Cuts a release: the `Version x.y.z` commit that follows what has been merged
// into main since the last one. Run by CI once main has passed — the release
// job in `.github/workflows/ci.yml` — and never by hand. See *Versioning* in
// AGENTS.md.
//
// **A release covers everything since the last `Version x.y.z` commit**, bumped
// by the highest label among the pull requests that brought it: major over
// minor over patch. So a run that was cancelled, or that stood down because
// main had moved on, loses nothing — the next one picks it up.
//
// **It releases only a commit that passed.** It is started by one commit's
// checks finishing, and if main has moved on since that commit, it stands down:
// the newer commit is untested until its own run says otherwise, and that run
// will release both.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export type Level = 'major' | 'minor' | 'patch'

/** Highest first, which is the order a release takes the highest of them in. */
export const LEVELS: readonly Level[] = ['major', 'minor', 'patch']

/** A release commit's subject, and the whole of it. */
export const RELEASE_SUBJECT = /^Version (0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** The level a pull request's labels ask for, or null for none or for more than one. */
export function levelOf(labels: readonly string[]): Level | null {
  const asked = LEVELS.filter(level => labels.includes(level))
  return asked.length === 1 ? asked[0] : null
}

/** The highest of these, or a patch where there is nothing to go on. */
export const highest = (levels: readonly Level[]): Level => LEVELS.find(l => levels.includes(l)) ?? 'patch'

export function bump(version: string, level: Level): string {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!parts) throw new Error(`package.json holds ${JSON.stringify(version)}, which is not major.minor.patch`)
  const [major, minor, patch] = parts.slice(1).map(Number)
  if (level === 'major') return `${major + 1}.0.0`
  if (level === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** `package.json` with its version changed and nothing else — not even its formatting. */
export function withVersion(json: string, version: string): string {
  const field = /("version"\s*:\s*")[^"]*(")/
  if (!field.test(json)) throw new Error('package.json has no version field')
  return json.replace(field, `$1${version}$2`)
}

/**
 * The commits since the last release, newest first, from `git log --format=%H%x09%s`.
 * Empty when the newest is itself a release.
 */
export function unreleased(log: string): string[] {
  const since: string[] = []
  for (const line of log.split('\n')) {
    const [sha, subject = ''] = line.split('\t')
    if (!sha || RELEASE_SUBJECT.test(subject)) break
    since.push(sha)
  }
  return since
}

// ── Running it ───────────────────────────────────────────────────────────────

interface Pull {
  number: number
  merged_at: string | null
  labels: { name: string }[]
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()

async function pullsFor(sha: string): Promise<Pull[]> {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/commits/${sha}/pulls`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub said ${res.status} about the pull requests behind ${sha}`)
  return ((await res.json()) as Pull[]).filter(p => p.merged_at !== null)
}

async function main() {
  const tested = process.env.TESTED_SHA
  if (!tested) throw new Error('TESTED_SHA names the commit whose checks passed, and it is not set')

  git('fetch', '--quiet', 'origin', 'main')
  const tip = git('rev-parse', 'origin/main')
  if (tip !== tested) {
    console.log(
      `main has moved on to ${tip.slice(0, 7)} since ${tested.slice(0, 7)} passed; its own run will release both.`,
    )
    return
  }

  const since = unreleased(git('log', '--max-count=500', '--format=%H%x09%s', tip))
  if (since.length === 0) {
    console.log('Nothing merged since the last release.')
    return
  }

  // Each pull request once, however many of its commits there are.
  const asked = new Map<number, Level>()
  const unlabelled: string[] = []
  for (const sha of since) {
    const pulls = await pullsFor(sha)
    if (pulls.length === 0) unlabelled.push(sha.slice(0, 7))
    for (const pull of pulls) {
      if (!asked.has(pull.number)) asked.set(pull.number, levelOf(pull.labels.map(l => l.name)) ?? 'patch')
    }
  }
  const level = highest([...asked.values(), ...unlabelled.map((): Level => 'patch')])

  const json = readFileSync('package.json', 'utf8')
  const version = bump((JSON.parse(json) as { version: string }).version, level)
  writeFileSync('package.json', withVersion(json, version))

  const notes = [
    ...[...asked].map(([number, l]) => `#${number} ${l}`),
    ...unlabelled.map(sha => `${sha} patch, with no pull request`),
  ].join('\n')
  git(
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit',
    '--quiet',
    '-am',
    `Version ${version}`,
    '-m',
    notes,
  )
  git('tag', `v${version}`)
  try {
    git('push', '--quiet', 'origin', 'HEAD:main')
  } catch {
    // Something merged while this ran. That commit's own run releases it and
    // everything here with it, once it has passed.
    console.log(`main moved on while ${version} was being cut; the next run will release it.`)
    return
  }
  git('push', '--quiet', 'origin', `v${version}`)
  console.log(`Released ${version}:\n${notes}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
