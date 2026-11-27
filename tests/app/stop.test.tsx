// **Stop, over the card's row of controls, while anything is being said** —
// the menu under it, and one dwell ending the words. See `StopBar` in
// `talk/topbar.tsx`. Whether it covers the row and no more in a real browser,
// and refuses the pointer that rested on Speak, is `e2e/stop.spec.ts`'s.

import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/core/store'
import { finishSpeech, holdSpeech, quietSpeech, spoken } from '../setup'
import { $, $$, box, click, message, plainCell, renderApp, writeIn } from './harness'

const stop = () => $('.message-tools > .stop-bar')
const speakButton = () => $$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak')!

describe('Stop, while anything is being said', () => {
  it('covers the row of controls while a phrase is said, and goes when it ends', () => {
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

  // **Nothing answers but Stop** while something is being said, and the board
  // is dimmed to say so — and once it has been said, everything does again.
  it('lets nothing else be chosen while something is being said', () => {
    holdSpeech()
    renderApp({ autoSpeak: true })
    const first = plainCell()
    click(first)
    expect($('.app')!.classList.contains('is-speaking')).toBe(true)
    const second = plainCell([first.textContent ?? ''])
    click(second)
    expect(spoken, 'a phrase was chosen over one being said').toEqual([first.textContent])

    act(() => finishSpeech())
    expect($('.app')!.classList.contains('is-speaking')).toBe(false)
    click(second)
    expect(spoken).toEqual([first.textContent, second.textContent])
  })

  // It never waits on anything: said over what was playing, which it stops.
  it('keeps the emergency bar live, saying it over what was playing', () => {
    holdSpeech()
    renderApp({ autoSpeak: true })
    click(plainCell())
    click($('.emergency-btn'))
    expect(spoken).toHaveLength(2)
    expect(stop()).not.toBeNull()
  })

  // **In edit mode, the words just said stay in the box**, so the box is in use
  // and the bar says what is chosen on it rather than opening it — and saying
  // never waits, so it is said over what was playing, and the box keeps its
  // words. (An empty box in edit mode, where the bar opens a phrase to be
  // changed and so waits like everything else, can no longer be reached while
  // anything is being said: Speak leaves the words where they were.)
  it('says the bar over words just said in edit mode, and keeps them in the box', () => {
    holdSpeech()
    renderApp()
    click($('.autospeak-toggle'))
    writeIn(box(), 'Something being said')
    click($$('.icon-btn').find(b => b.getAttribute('aria-label') === 'Speak and save'))
    expect(stop()).not.toBeNull()
    click($('.emergency-btn'))
    expect(spoken).toHaveLength(2)
    expect(box().value, 'an emergency phrase was put in the box').toBe('Something being said')
  })

  // A synthesiser that goes quiet without saying so does not leave Stop up.
  // Once the words have been handed over a second time and still not begun —
  // see `handOverAgain` in `voice/speech.ts`.
  it('goes by itself once the voice has gone quiet', () => {
    quietSpeech()
    renderApp({ autoSpeak: true })
    const words = plainCell().textContent
    click(plainCell())
    expect(stop()).not.toBeNull()
    act(() => void vi.advanceTimersByTime(1_500))
    expect(stop(), 'given up before the words were handed over again').not.toBeNull()
    expect(spoken).toEqual([words, words])
    act(() => void vi.advanceTimersByTime(1_500))
    expect(stop()).toBeNull()
  })
})
