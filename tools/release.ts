// The version commit that ends a pull request, worked out from the label the
// pull request carries rather than in somebody's head: `pnpm release`, run on
// the branch, as the last commit before it merges. See *Versioning* in AGENTS.md.
//
// **It is a commit on the branch, not on main.** A release commit made on main
// by a workflow would have to be allowed past main's own ruleset, and what that
// takes is a personal access token with write access to main sitting in the
// repository's secrets for ever. The branch needs no such thing, and the check
// that follows the bump is the check that guards the merge.

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

// ── Running it ───────────────────────────────────────────────────────────────

const run = (command: string, ...args: string[]) => execFileSync(command, args, { encoding: 'utf8' }).trim()

/** What this branch's pull request asks for, which is what the label check held it to. */
function levelOfThisBranch(): Level {
  let labels: { name: string }[]
  try {
    labels = JSON.parse(run('gh', 'pr', 'view', '--json', 'labels', '--jq', '.labels')) as { name: string }[]
  } catch {
    throw new Error('No pull request for this branch yet. Open one, labelled major, minor or patch.')
  }
  const level = levelOf(labels.map(l => l.name))
  if (!level) throw new Error('Label the pull request with exactly one of major, minor or patch.')
  return level
}

function main() {
  const branch = run('git', 'rev-parse', '--abbrev-ref', 'HEAD')
  if (branch === 'main') throw new Error('A release is the last commit on a branch, not a commit on main.')
  if (run('git', 'status', '--porcelain'))
    throw new Error('Commit what is in the tree first; a release is its own commit.')

  const json = readFileSync('package.json', 'utf8')
  const version = bump((JSON.parse(json) as { version: string }).version, levelOfThisBranch())
  writeFileSync('package.json', withVersion(json, version))
  run('git', 'commit', '--quiet', '-am', `Version ${version}`)
  console.log(`Version ${version}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
