// **Publishing**: `main` fast-forwarded to `preview`, and then the Publish
// workflow run on it. `pnpm promote`, from a clone of the repository with the
// `gh` command line signed in as somebody who administers it.
//
// **`preview` is where development lands; `main` is what people are using.**
// Every pull request merges into `preview`, cut as a release on its way in —
// see `tools/release.ts` — and nothing reaches `main` except this: the commits
// `preview` already has, moved across whole, so the two branches are the same
// commits rather than two histories that merely say the same thing.
//
// **Run from a laptop, with the signed-in user's own rights, on purpose.**
// `main` accepts a push only from a repository admin; a workflow that could
// make one would need a key with write access to `main` sitting in the
// repository's secrets, beside the Netlify token. So this moves `main`, and
// the Publish workflow — which alone holds that token — puts the build in front
// of people. Nothing here sees the token.

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { RELEASE_SUBJECT } from './release'

/** What there is to know about `preview` before `main` is moved to it. */
export interface Candidate {
  /** `main` is already where `preview` is: nothing to move, only to publish. */
  same: boolean
  /** `main` is behind `preview`, so moving it is a fast-forward. */
  mainIsBehind: boolean
  /** The subject of `preview`'s last commit. */
  subject: string
  /** How each check on that commit concluded, by name — or nothing yet. */
  checks: Record<string, string | null>
}

/** The checks `preview`'s last commit has to have passed: the suite, and the browser tests. */
export const REQUIRED_CHECKS = ['check', 'browser']

/** Why `main` cannot be moved to `preview` now, or null when it can. */
export function refusal(c: Candidate): string | null {
  if (!c.same && !c.mainIsBehind) {
    return 'main has commits preview does not, so it cannot be moved to preview without losing them. Every change goes through preview; see Publishing in AGENTS.md.'
  }
  if (!RELEASE_SUBJECT.test(c.subject)) {
    return `preview ends in "${c.subject}", which is not a release. Every pull request is cut as one before it merges.`
  }
  for (const name of REQUIRED_CHECKS) {
    const result = c.checks[name]
    if (result !== 'success') {
      return `preview's ${name} check is ${result ?? 'not reported yet'}; only a release that has passed goes out.`
    }
  }
  return null
}

const run = (cmd: string, ...args: string[]) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()
const succeeds = (cmd: string, ...args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  run('git', 'fetch', '--quiet', 'origin', 'main', 'preview')
  const preview = run('git', 'rev-parse', 'origin/preview')
  const current = run('git', 'rev-parse', 'origin/main')
  const repo = run('gh', 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner')
  const runs = JSON.parse(
    run(
      'gh',
      'api',
      `repos/${repo}/commits/${preview}/check-runs`,
      '--jq',
      '[.check_runs[] | {name, conclusion}]',
    ),
  ) as { name: string; conclusion: string | null }[]

  const problem = refusal({
    same: preview === current,
    mainIsBehind: succeeds('git', 'merge-base', '--is-ancestor', current, preview),
    subject: run('git', 'log', '-1', '--format=%s', preview),
    checks: Object.fromEntries(runs.map(r => [r.name, r.conclusion])),
  })
  if (problem) throw new Error(problem)

  if (preview === current) console.log(`main is already at preview (${preview.slice(0, 7)}).`)
  else {
    run('git', 'push', '--quiet', 'origin', `${preview}:refs/heads/main`)
    console.log(`main moved to preview (${preview.slice(0, 7)}).`)
  }

  // The Publish workflow, on main, and its result: it waits for Netlify's build
  // of the commit just pushed, publishes that, and asks the site what it serves.
  const before = run(
    'gh',
    'run',
    'list',
    '--workflow',
    'publish.yml',
    '--limit',
    '1',
    '--json',
    'databaseId',
    '--jq',
    '.[0].databaseId // 0',
  )
  run('gh', 'workflow', 'run', 'publish.yml', '--ref', 'main')
  let id = before
  for (let tries = 0; id === before; tries++) {
    if (tries === 20) throw new Error('The Publish workflow did not start; run it from the Actions tab.')
    await sleep(3_000)
    id = run(
      'gh',
      'run',
      'list',
      '--workflow',
      'publish.yml',
      '--limit',
      '1',
      '--json',
      'databaseId',
      '--jq',
      '.[0].databaseId // 0',
    )
  }
  execFileSync('gh', ['run', 'watch', id, '--exit-status'], { stdio: 'inherit' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
