// Cutting a release, and putting one in front of people. The arithmetic and
// the reading, which is all of these two that can be tested without a repository
// and somebody's Netlify account — see `tools/release.ts` and `tools/publish.ts`.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  LEVELS,
  RELEASE_SUBJECT,
  bump,
  highest,
  levelOf,
  unreleased,
  withVersion,
  type Level,
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

describe('which commits a release covers', () => {
  const log = (...lines: string[]) => lines.join('\n')
  const commit = (sha: string, subject: string) => `${sha}\t${subject}`

  it('is everything back to the last release, and not the release itself', () => {
    expect(
      unreleased(
        log(
          commit('aaa', 'Keep each board to its account'),
          commit('bbb', 'Fix the microphone'),
          commit('ccc', 'Version 1.3.1'),
          commit('ddd', 'Something older'),
        ),
      ),
    ).toEqual(['aaa', 'bbb'])
  })

  it('is nothing when the last thing on main is a release', () => {
    expect(unreleased(log(commit('ccc', 'Version 1.3.1'), commit('aaa', 'Older')))).toEqual([])
  })

  // The subject and the whole of it: a commit that merely mentions a version is
  // not a release, and a release commit says nothing else.
  it('is not stopped by a commit that only talks about a version', () => {
    expect(
      unreleased(log(commit('aaa', 'Version 1.3.1 broke the icons'), commit('bbb', 'Version the app'))),
    ).toEqual(['aaa', 'bbb'])
    expect(RELEASE_SUBJECT.test('Version 1.3.1')).toBe(true)
    expect(RELEASE_SUBJECT.test('Version 01.3.1')).toBe(false)
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
