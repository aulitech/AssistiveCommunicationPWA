// The pause after choosing, through the real app on its real default: after a
// dwell or a click is taken, others are ignored for a second. See
// docs/decisions/settling-after-the-screen-moves.md#the-pause-after-choosing.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/core/store'
import { spoken, withSelectionPause } from '../setup'
import { $$, click, plainCell, renderApp, settle } from './harness'

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const settingRow = (label: string) =>
  $$('.setting-row').find(r => r.querySelector('.setting-label')?.textContent === label)!

beforeEach(() => withSelectionPause())

describe('the pause after choosing', () => {
  it('is a second to begin with', () => {
    expect(DEFAULT_SETTINGS.selectionPauseMs).toBe(1000)
  })

  // A second click, or a hand that clicked twice, choosing a phrase nobody meant.
  it('ignores a second phrase chosen straight after the first, and takes one after it', () => {
    renderApp({ autoSpeak: true })
    const first = plainCell()
    const second = plainCell([first.textContent ?? ''])
    click(first)
    click(second)
    expect(spoken, 'the second phrase was said inside the pause').toEqual([first.textContent])

    advance(1000)
    click(second)
    expect(spoken).toEqual([first.textContent, second.textContent])
  })

  // Somebody who moves straight on to their next phrase and rests there.
  it('starts a rest begun in the pause once the pause is over', () => {
    renderApp({ autoSpeak: true })
    const first = plainCell()
    const second = plainCell([first.textContent ?? ''])
    click(first)
    fireEvent.pointerMove(document.body, { clientX: 5, clientY: 5 })
    fireEvent.pointerEnter(second)
    advance(DEFAULT_SETTINGS.phraseDwellMs)
    expect(spoken).toEqual([first.textContent])

    advance(1000)
    expect(spoken).toEqual([first.textContent, second.textContent])
  })

  it('takes the second straight away when it is turned off', () => {
    renderApp({ autoSpeak: true, selectionPauseMs: 0 })
    const first = plainCell()
    const second = plainCell([first.textContent ?? ''])
    click(first)
    click(second)
    expect(spoken).toEqual([first.textContent, second.textContent])
  })

  it('is offered in Settings, down to off, and kept', () => {
    renderApp({ selectionPauseMs: 250 })
    advance(1000)
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Open menu'))
    advance(1000)
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Settings'))
    advance(1000)

    const row = settingRow('Pause after choosing')
    expect(row, 'no Pause after choosing row in Settings').toBeDefined()
    expect(row.querySelector('.setting-formatted')?.textContent).toBe('0.250s')
    click([...row.querySelectorAll('.step-btn')].find(b => b.getAttribute('aria-label') === 'Decrease'))
    settle()
    expect(JSON.parse(localStorage.getItem('dwellspeak_settings')!).selectionPauseMs).toBe(0)
    expect(row.querySelector('.setting-formatted')?.textContent).toBe('Off')
  })
})
