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

// ── Release notes ────────────────────────────────────────────────────────────
//
// What Menu → Release notes shows, worked out from the history rather than
// written by hand: every commit between one version commit and the next is
// what that version brought. Written by the release itself, into the version
// commit, so the notes a build carries always end at the version it says it is.

/** Where the notes are kept — read by `menu/release-notes-panel.tsx`, and only when it opens. */
export const NOTES_FILE = 'src/menu/release-notes.json'

/**
 * **The last commit before releases were numbered.** Everything up to it went
 * out as 1.0.0, which no version commit marks: the first, 1.1.0, ends a pull
 * request of one commit made after this one. Matched by subject, which a
 * rebase leaves alone.
 */
export const BEFORE_NUMBERED = "Show Peri's version, centred on the menu's top line"

/** Lines a commit message carries for git rather than for anybody reading it. */
const TRAILER = /^(co-authored-by|signed-off-by):/i

/** A commit as somebody reads it: what it says it did, and the rest in paragraphs and lists. */
export interface NoteCommit {
  subject: string
  body: ({ text: string } | { items: string[] })[]
}

export interface NoteVersion {
  version: string
  /** The day it was cut, as YYYY-MM-DD. */
  date: string
  commits: NoteCommit[]
}

/**
 * A message's body as blocks: paragraphs unwrapped onto one line each, and a
 * run of lines beginning `- ` as a list, an item running on over the indented
 * lines under it. The trailers come off.
 */
export function bodyBlocks(body: string): NoteCommit['body'] {
  const lines = body.split('\n').filter(line => !TRAILER.test(line.trim()))
  const blocks: NoteCommit['body'] = []
  for (const para of lines.join('\n').split(/\n\s*\n/)) {
    const rows = para.split('\n').filter(row => row.trim() !== '')
    if (rows.length === 0) continue
    if (/^\s*[-*] /.test(rows[0])) {
      const items: string[] = []
      for (const row of rows) {
        if (/^\s*[-*] /.test(row)) items.push(row.replace(/^\s*[-*] /, '').trim())
        else items[items.length - 1] += ` ${row.trim()}`
      }
      blocks.push({ items })
    } else {
      blocks.push({ text: rows.map(row => row.trim()).join(' ') })
    }
  }
  return blocks
}

/** One commit in a log written with `LOG_FORMAT`. */
interface Logged {
  date: string
  subject: string
  body: string
}

/** Each commit begins with a record separator, then its date and message apart by a unit separator. */
export const LOG_FORMAT = '%x1e%ad%x1f%B'

export function parseLog(raw: string): Logged[] {
  return raw
    .split('\x1e')
    .filter(entry => entry.trim() !== '')
    .map(entry => {
      const [date, message = ''] = entry.split('\x1f')
      const [subject = '', ...rest] = message.trim().split('\n')
      return { date: date.trim(), subject: subject.trim(), body: rest.join('\n').trim() }
    })
}

/**
 * **The notes, newest version first**, from a log oldest first. Each version
 * commit closes what came since the one before; what comes after the last is
 * the release being cut, as `next`, dated `today` — and left out where there
 * is no next, being in no release yet.
 */
export function releaseNotes(log: readonly Logged[], next?: { version: string; today: string }): NoteVersion[] {
  const versions: NoteVersion[] = []
  let since: NoteCommit[] = []
  let numbered = !log.some(c => c.subject === BEFORE_NUMBERED)
  for (const commit of log) {
    const release = RELEASE_SUBJECT.exec(commit.subject)
    if (release) {
      versions.push({ version: commit.subject.slice('Version '.length), date: commit.date, commits: since })
      since = []
      continue
    }
    since.push({ subject: commit.subject, body: bodyBlocks(commit.body) })
    if (!numbered && commit.subject === BEFORE_NUMBERED) {
      versions.push({ version: '1.0.0', date: commit.date, commits: since })
      since = []
      numbered = true
    }
  }
  if (next && since.length > 0) versions.push({ version: next.version, date: next.today, commits: since })
  // Newest first, and so is each version's list: the last thing done is the
  // first thing somebody opening it wants to read.
  return versions.reverse().map(v => ({ ...v, commits: [...v.commits].reverse() }))
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

/** The notes from the whole of this branch's history, with what is not released yet as `next`. */
function writeNotes(next?: string) {
  const log = parseLog(run('git', 'log', '--reverse', '--date=short', `--format=${LOG_FORMAT}`))
  const today = new Date().toISOString().slice(0, 10)
  const notes = releaseNotes(log, next ? { version: next, today } : undefined)
  writeFileSync(NOTES_FILE, `${JSON.stringify(notes, null, 2)}\n`)
}

function main() {
  // `pnpm release notes` writes them as the history stands, releasing nothing.
  if (process.argv[2] === 'notes') return writeNotes()

  const branch = run('git', 'rev-parse', '--abbrev-ref', 'HEAD')
  if (branch === 'main' || branch === 'preview')
    throw new Error(`A release is the last commit on a branch, not a commit on ${branch}.`)
  if (run('git', 'status', '--porcelain'))
    throw new Error('Commit what is in the tree first; a release is its own commit.')

  const json = readFileSync('package.json', 'utf8')
  const version = bump((JSON.parse(json) as { version: string }).version, levelOfThisBranch())
  writeFileSync('package.json', withVersion(json, version))
  writeNotes(version)
  run('git', 'add', NOTES_FILE)
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
