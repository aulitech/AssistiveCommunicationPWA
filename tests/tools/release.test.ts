// Cutting a release, and putting one in front of people. The arithmetic and
// the reading, which is all of these two that can be tested without a repository
// and somebody's Netlify account — see `tools/release.ts` and `tools/publish.ts`.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BEFORE_NUMBERED,
  LEVELS,
  NOTES_FILE,
  RELEASE_SUBJECT,
  bodyBlocks,
  bump,
  highest,
  levelOf,
  parseLog,
  releaseNotes,
  withVersion,
  type Level,
  type NoteVersion,
} from '../../tools/release'
import { buildOf, saysVersion, scriptIn, type Deploy } from '../../tools/publish'

describe('what a pull request asks for', () => {
  it('is the one of the three it is labelled with', () => {
    expect(levelOf(['minor'])).toBe('minor')
    expect(levelOf(['bug', 'patch', 'documentation'])).toBe('patch')
    expect(levelOf(['major'])).toBe('major')
  })

  // Neither is a decision, and a release takes an undecided one as a patch —
  // the smallest claim it can make. The label check in `version-label.yml` is
  // what stops one reaching main either way.
  it('is nothing at all where it says nothing, or says two things', () => {
    expect(levelOf([])).toBeNull()
    expect(levelOf(['bug'])).toBeNull()
    expect(levelOf(['minor', 'patch'])).toBeNull()
  })
})

describe('a release covering several pull requests', () => {
  it('is the highest of what they ask for', () => {
    expect(highest(['patch', 'major', 'minor'])).toBe('major')
    expect(highest(['patch', 'minor'])).toBe('minor')
    expect(highest(['patch', 'patch'])).toBe('patch')
  })

  // A run that stood down leaves its commits to the next one, so what is being
  // released is rarely one thing and never nothing.
  it('is a patch where there is nothing to go on', () => {
    expect(highest([])).toBe('patch')
  })

  it('is every level the labels can ask for', () => {
    expect([...LEVELS]).toEqual(['major', 'minor', 'patch'])
    for (const level of LEVELS) expect(levelOf([level])).toBe(level)
  })
})

describe('the number itself', () => {
  it.each([
    ['1.3.1', 'patch', '1.3.2'],
    ['1.3.1', 'minor', '1.4.0'],
    ['1.3.1', 'major', '2.0.0'],
    ['1.9.9', 'minor', '1.10.0'],
    ['0.0.0', 'patch', '0.0.1'],
  ])('bumps %s by a %s to %s', (from, level, to) => {
    expect(bump(from, level as Level)).toBe(to)
  })

  // A version nobody can compare with the one they are on is worse than none.
  it('refuses anything that is not major.minor.patch', () => {
    expect(() => bump('1.3', 'patch')).toThrow(/major\.minor\.patch/)
    expect(() => bump('v1.3.1', 'patch')).toThrow()
  })

  /**
   * Written back into `package.json` by hand rather than through `JSON.parse`
   * and `JSON.stringify`, which would reformat the file the formatter checks.
   */
  it('goes back into package.json and changes nothing else', () => {
    const json = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    const current = (JSON.parse(json) as { version: string }).version

    const next = withVersion(json, '9.9.9')
    expect((JSON.parse(next) as { version: string }).version).toBe('9.9.9')
    expect(next.replace('9.9.9', current), 'it reformatted the file the formatter checks').toBe(json)
  })

  it('says so rather than writing a version into a file that has none', () => {
    expect(() => withVersion('{ "name": "peri" }', '1.0.0')).toThrow(/version/)
  })
})

// What publishing looks for on main: the last commit is a release and says
// nothing else.
describe('a release commit', () => {
  it('is a version and the whole subject', () => {
    expect(RELEASE_SUBJECT.test('Version 1.3.1')).toBe(true)
    expect(RELEASE_SUBJECT.test('Version 1.3.1 broke the icons')).toBe(false)
    expect(RELEASE_SUBJECT.test('Version 01.3.1')).toBe(false)
    expect(RELEASE_SUBJECT.test('Keep each board to its account')).toBe(false)
  })
})

describe('the build a release is published from', () => {
  const deploy = (over: Partial<Deploy>): Deploy => ({
    id: 'd1',
    commit_ref: 'abc',
    context: 'production',
    state: 'ready',
    ...over,
  })

  it('is the site’s own build of that commit', () => {
    const build = deploy({ id: 'wanted' })
    expect(buildOf([deploy({ commit_ref: 'older', id: 'no' }), build], 'abc')?.id).toBe('wanted')
  })

  // A deploy preview is built from the same commit and serves a different site.
  it('is never a preview or a branch build of it', () => {
    const previews = [
      deploy({ id: 'preview', context: 'deploy-preview' }),
      deploy({ id: 'branch', context: 'branch-deploy' }),
    ]
    expect(buildOf(previews, 'abc')).toBeUndefined()
  })

  it('is nothing at all where Netlify has not built that commit', () => {
    expect(buildOf([deploy({ commit_ref: 'another' })], 'abc')).toBeUndefined()
    expect(buildOf([], 'abc')).toBeUndefined()
  })
})

/**
 * Publishing is checked by asking the site what it is serving, which means
 * finding the app's own script in the page and the version inside it.
 */
describe('what the site says it is serving', () => {
  it('finds the app’s script in the page', () => {
    const html = '<script type="module" crossorigin src="/assets/index-dQfKyBpK.js"></script>'
    expect(scriptIn(html)).toBe('/assets/index-dQfKyBpK.js')
    expect(scriptIn('<script src="/assets/other-dQfKyBpK.js"></script>')).toBeNull()
  })

  // The minifier picks the quotes, and picked backticks.
  it.each(['"1.3.1"', "'1.3.1'", '`1.3.1`'])('reads the version written as %s', quoted => {
    expect(saysVersion(`var Kc=${quoted},qc=1`, '1.3.1')).toBe(true)
  })

  it('is not a version that merely looks like it', () => {
    expect(saysVersion('var Kc=`1.3.10`', '1.3.1')).toBe(false)
    expect(saysVersion('var Kc=`1.3.1`', '1.3.2')).toBe(false)
    expect(saysVersion('var Kc=11311', '1.3.1'), 'the dots stood for any character').toBe(false)
  })
})

/**
 * **The release notes**, which Menu → Release notes shows: worked out from the
 * history by `pnpm release`, into the version commit, so they always end at
 * the version the build says it is.
 */
describe('the release notes', () => {
  const commit = (subject: string, date = '2026-10-01', body = '') => ({ subject, date, body })

  it('reads a log written in its format', () => {
    const raw = '\x1e2026-10-01\x1fFirst thing\n\nWhat it did.\n\x1e2026-10-02\x1fVersion 1.2.0\n'
    expect(parseLog(raw)).toEqual([
      { date: '2026-10-01', subject: 'First thing', body: 'What it did.' },
      { date: '2026-10-02', subject: 'Version 1.2.0', body: '' },
    ])
  })

  it('gives each version what came since the version before, newest first both ways', () => {
    const notes = releaseNotes([
      commit('One'),
      commit('Version 1.1.0', '2026-10-02'),
      commit('Two'),
      commit('Three'),
      commit('Version 1.2.0', '2026-10-05'),
    ])
    expect(notes.map(n => [n.version, n.date, n.commits.map(c => c.subject)])).toEqual([
      ['1.2.0', '2026-10-05', ['Three', 'Two']],
      ['1.1.0', '2026-10-02', ['One']],
    ])
  })

  // Nothing marks 1.0.0: everything up to the last commit before releases were
  // numbered went out as it, and the first version commit, 1.1.0, ends a pull
  // request of one commit after that.
  it('puts everything before releases were numbered under 1.0.0', () => {
    const notes = releaseNotes([
      commit('Initial commit', '2026-08-05'),
      commit(BEFORE_NUMBERED, '2026-09-21'),
      commit('Pulse a microphone'),
      commit('Version 1.1.0', '2026-09-21'),
    ])
    expect(notes.map(n => [n.version, n.date, n.commits.map(c => c.subject)])).toEqual([
      ['1.1.0', '2026-09-21', ['Pulse a microphone']],
      ['1.0.0', '2026-09-21', [BEFORE_NUMBERED, 'Initial commit']],
    ])
  })

  it('names what is being released, dated today, and leaves out what is in no release yet', () => {
    const log = [commit('One'), commit('Version 1.1.0'), commit('Two')]
    expect(releaseNotes(log).map(n => n.version)).toEqual(['1.1.0'])
    const cut = releaseNotes(log, { version: '1.2.0', today: '2026-10-19' })
    expect(cut[0]).toEqual({ version: '1.2.0', date: '2026-10-19', commits: [{ subject: 'Two', body: [] }] })
  })

  it('unwraps paragraphs, keeps lists, and takes the trailers off', () => {
    const body = [
      'What it did, written over',
      'two lines.',
      '',
      '- One thing, which also',
      '  runs on.',
      '- Another.',
      '',
      'Co-Authored-By: Somebody <somebody@example.com>',
    ].join('\n')
    expect(bodyBlocks(body)).toEqual([
      { text: 'What it did, written over two lines.' },
      { items: ['One thing, which also runs on.', 'Another.'] },
    ])
  })

  // Written by the release, into the version commit — so a build that says it
  // is one version carries the notes for it.
  it('end at the version package.json says, in the file the app reads', () => {
    const notes = JSON.parse(readFileSync(resolve(NOTES_FILE), 'utf8')) as NoteVersion[]
    const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }
    expect(notes[0]?.version).toBe(version)
    expect(notes.at(-1)?.version).toBe('1.0.0')
    for (const note of notes) expect(note.version, 'not a version').toMatch(/^\d+\.\d+\.\d+$/)
    expect(new Set(notes.map(n => n.version)).size, 'a version twice').toBe(notes.length)
  })
})
