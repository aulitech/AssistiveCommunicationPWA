// **Stop, over the whole top row, while anything is being said** — the question,
// the message and the menu all under it, and one dwell ending the words. See
// `StopBar` in `talk/topbar.tsx`. Whether it covers the row in a real browser,
// and refuses the pointer that rested on Speak, is `e2e/stop.spec.ts`'s.

import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/core/store'
import { finishSpeech, holdSpeech, spoken } from '../setup'
import { $, $$, box, click, message, plainCell, renderApp, writeIn } from './harness'

const stop = () => $('.topbar > .stop-bar')
const speakButton = () => $$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak')!

describe('Stop, while anything is being said', () => {
  it('covers the top row while a phrase is said, and goes when it ends', () => {
    holdSpeech()
    renderApp({ autoSpeak: true })
    expect(stop(), 'Stop with nothing being said').toBeNull()

    const cell = plainCell()
    click(cell)
    expect(stop()).not.toBeNull()
    expect(stop()!.textContent).toBe('Stop')
    expect(stop()!.getAttribute('aria-label')).toBe('Stop speaking')
    // Laid over the row rather than in place of it: the box keeps the phrase,
    // selected, for when the row comes back.
    expect(message()).toBe(cell.textContent)
    expect([box().selectionStart, box().selectionEnd]).toEqual([0, box().value.length])

    act(() => finishSpeech())
    expect(stop(), 'Stop stayed after the words had ended').toBeNull()
  })

  it('stops the words when it is chosen', () => {
    holdSpeech()
    renderApp({ autoSpeak: true })
    click(plainCell())
    const cancel = vi.spyOn(speechSynthesis, 'cancel')
    click(stop())
    expect(cancel).toHaveBeenCalled()
    expect(stop()).toBeNull()
  })

  // Rested on, as everything here is chosen.
  it('stops them when it is rested on', () => {
    holdSpeech()
    renderApp({ autoSpeak: true })
    click(plainCell())
    const cancel = vi.spyOn(speechSynthesis, 'cancel')
    fireEvent.pointerMove(document.body, { clientX: 5, clientY: 5 })
    fireEvent.pointerEnter(stop()!)
    act(() => void vi.advanceTimersByTime(DEFAULT_SETTINGS.actionDwellMs))
    expect(cancel).toHaveBeenCalled()
    expect(stop()).toBeNull()
  })

  it('comes up for a message said with Speak', () => {
    holdSpeech()
    renderApp()
    writeIn(box(), 'Hello there')
    click(speakButton())
    expect(spoken).toEqual(['Hello there'])
    expect(stop()).not.toBeNull()
  })

  it('comes up for the emergency bar', () => {
    holdSpeech()
    renderApp()
    click($('.emergency-btn'))
    expect(spoken).toHaveLength(1)
    expect(stop()).not.toBeNull()
  })

  // A synthesiser that goes quiet without saying so does not leave Stop up.
  it('goes by itself once the voice has gone quiet', () => {
    renderApp({ autoSpeak: true })
    click(plainCell())
    expect(stop()).not.toBeNull()
    act(() => void vi.advanceTimersByTime(1_500))
    expect(stop()).toBeNull()
  })
})
