import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { canListen, listen } from '../../src/listen/recognition'
import { warnings } from '../setup'
import {
  FakeRecognition,
  installPrefixedRecognition,
  installRecognition,
  removeRecognition,
} from './fake-recognition'

// The microphone wrapper. Half of these are about the browsers that cannot do
// this at all, because that is the case a board has to survive: Peri's job is
// not listening, and a browser without an ear must leave every other part of it
// working exactly as before.

const heard: string[] = []
const ended: (string | undefined)[] = []
const handlers = {
  onHeard: (text: string) => void heard.push(text),
  onDone: (error?: string) => void ended.push(error),
}

beforeEach(() => {
  heard.length = 0
  ended.length = 0
  installRecognition()
})
afterEach(removeRecognition)

describe('whether it can listen at all', () => {
  it('says yes for a browser with the modern name', () => {
    expect(canListen()).toBe(true)
  })

  // Prefixed in every shipping browser for a decade, and only now arriving
  // without it, so both names have to be asked for.
  it('says yes for a browser with only the prefixed name', () => {
    installPrefixedRecognition()
    expect(canListen()).toBe(true)
  })

  it('says no for a browser with neither', () => {
    removeRecognition()
    expect(canListen()).toBe(false)
  })
})

describe('listening', () => {
  it('starts, and says what it hears as it hears it', () => {
    listen('', handlers)
    FakeRecognition.last!.say({ transcript: 'Do you want', isFinal: false })
    FakeRecognition.last!.say({ transcript: 'Do you want tea?', isFinal: true })

    expect(FakeRecognition.last!.started).toBe(true)
    expect(heard).toEqual(['Do you want', 'Do you want tea?'])
  })

  // A question is a sentence or two, and a recogniser left to decide for itself
  // stops at the first pause — which in a room is somebody drawing breath.
  it('keeps listening past a pause, and guesses out loud while it goes', () => {
    listen('', handlers)
    expect(FakeRecognition.last!.continuous).toBe(true)
    expect(FakeRecognition.last!.interimResults).toBe(true)
  })

  it('joins what is settled to what is still being guessed at', () => {
    listen('', handlers)
    FakeRecognition.last!.say(
      { transcript: 'Do you want ', isFinal: true },
      { transcript: 'tea or coffee', isFinal: false },
    )
    expect(heard).toEqual(['Do you want tea or coffee'])
  })

  it('listens in the language the board is set to', () => {
    listen('es-MX', handlers)
    expect(FakeRecognition.last!.lang).toBe('es-MX')
  })

  it('leaves the language to the device when none is set', () => {
    listen('', handlers)
    expect(FakeRecognition.last!.lang).toBe('')
  })

  it('says so once when it ends on its own', () => {
    listen('', handlers)
    FakeRecognition.last!.finish()
    expect(ended).toEqual([undefined])
  })

  it('stops when it is told to', () => {
    const stop = listen('', handlers)
    stop()
    expect(FakeRecognition.last!.stopped).toBe(true)
    expect(ended).toEqual([undefined])
  })

  // Every path ends exactly once. A second `onDone` would be a second attempt at
  // whatever the caller does with it — and the caller closes a box.
  it('ends once, however many ways it is ended', () => {
    const stop = listen('', handlers)
    FakeRecognition.last!.finish()
    stop()
    FakeRecognition.last!.finish()
    expect(ended).toEqual([undefined])
  })

  /**
   * **Sound coming in is not the same moment as listening.** The browser asks
   * for permission first and opens the device after, and it lets go of the
   * sound before the session ends — so what says the microphone is live waits
   * for this, and nothing is said about sound once the session is over.
   */
  it('says when sound starts and stops coming in, and not after it has ended', () => {
    const sound: boolean[] = []
    listen('', { ...handlers, onSound: on => void sound.push(on) })
    expect(sound, 'sound before any came in').toEqual([])

    FakeRecognition.last!.soundStarts()
    FakeRecognition.last!.soundEnds()
    FakeRecognition.last!.finish()
    FakeRecognition.last!.soundStarts()
    expect(sound).toEqual([true, false])
  })

  it('says nothing more after it has been stopped', () => {
    const stop = listen('', handlers)
    stop()
    FakeRecognition.last!.say({ transcript: 'too late', isFinal: true })
    expect(ended).toEqual([undefined])
  })
})

describe('when it will not work', () => {
  it('says so rather than throwing, in a browser that cannot listen', () => {
    removeRecognition()
    expect(() => listen('', handlers)).not.toThrow()
    expect(ended).toEqual(['This browser cannot listen'])
  })

  it('hands back a stop that does nothing, so the caller needs no special case', () => {
    removeRecognition()
    const stop = listen('', handlers)
    expect(() => stop()).not.toThrow()
  })

  it('says so when the thing cannot be started', () => {
    FakeRecognition.refuseToStart = true
    listen('', handlers)
    expect(ended).toEqual([undefined])
  })

  /**
   * The one worth naming exactly. Nothing in the app can fix it — the browser is
   * where the microphone is allowed — so the message has to say where to go.
   */
  it('names a refused microphone, and where to allow it', () => {
    listen('', handlers)
    FakeRecognition.last!.fail('not-allowed')
    expect(ended[0]).toMatch(/allow it for Peri in your browser/i)
  })

  it('names the rest of what can go wrong', () => {
    const cases: [string, RegExp][] = [
      ['no-speech', /nothing was heard/i],
      ['audio-capture', /no microphone/i],
      ['network', /speech service/i],
      ['something-else', /microphone stopped/i],
    ]
    for (const [error, said] of cases) {
      ended.length = 0
      listen('', handlers)
      FakeRecognition.last!.fail(error)
      expect(ended[0], error).toMatch(said)
    }
  })

  // An abort is this app stopping it on purpose. A failure message for something
  // the user did is a failure message about nothing.
  it('says nothing about an abort, which is this app stopping it', () => {
    listen('', handlers)
    FakeRecognition.last!.fail('aborted')
    expect(ended).toEqual([undefined])
  })

  it('reports a real failure to the console, and an abort to nothing', () => {
    listen('', handlers)
    FakeRecognition.last!.fail('audio-capture')
    expect(warnings.join(' ')).toMatch(/listen/)

    warnings.length = 0
    listen('', handlers)
    FakeRecognition.last!.fail('aborted')
    expect(warnings).toEqual([])
  })

  // What somebody said is theirs. A console ends up in every screen-share and
  // bug report from then on.
  it('never puts the words it heard in the console', () => {
    listen('', handlers)
    FakeRecognition.last!.say({ transcript: 'My chest hurts', isFinal: true })
    FakeRecognition.last!.fail('network')
    expect(warnings.join(' ')).not.toMatch(/chest/)
  })
})

describe('listening again', () => {
  it('makes a new session each time rather than reusing one', () => {
    const stop = listen('', handlers)
    stop()
    listen('', handlers)
    expect(FakeRecognition.made).toBe(2)
  })

  it('does not throw when a browser refuses a second start', () => {
    listen('', handlers)
    FakeRecognition.refuseToStart = true
    expect(() => listen('', handlers)).not.toThrow()
  })
})

describe('a recogniser that throws on the way out', () => {
  it('still ends, so the box does not sit open for ever', () => {
    const stop = listen('', handlers)
    vi.spyOn(FakeRecognition.last!, 'stop').mockImplementation(() => {
      throw new Error('nope')
    })
    stop()
    expect(ended).toEqual([undefined])
  })
})
