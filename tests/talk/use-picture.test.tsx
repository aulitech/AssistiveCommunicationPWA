// The presentation window's picture as the screen holds it: chosen here, named
// by a board from elsewhere, named for the first time where it was chosen before
// pictures travelled, and shown the moment it arrives.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  loadPictureRecord,
  loadPresentationBackground,
  pictureId,
  savePictureRecord,
  savePresentationBackground,
} from '../../src/core/store'
import { type ClipStore } from '../../src/sync/audio'
import { useCarriedPicture, usePicture } from '../../src/talk/use-picture'

const BEACH = `data:image/jpeg;base64,${btoa('the beach at dawn')}`
const GARDEN = `data:image/jpeg;base64,${btoa('the garden in May')}`

beforeEach(() => localStorage.clear())

describe('choosing one', () => {
  it('keeps it, names it and says when, as still to go up', async () => {
    const { result } = renderHook(() => usePicture())
    let kept = false
    await act(async () => void (kept = await result.current.choose(BEACH)))

    expect(kept).toBe(true)
    expect(result.current.picture).toBe(BEACH)
    expect(loadPresentationBackground()).toBe(BEACH)
    const record = loadPictureRecord()
    expect(record).toMatchObject({ id: await pictureId(BEACH), sent: false })
    expect(record.at).toBeGreaterThan(0)
    expect(result.current.state).toEqual({ id: record.id, at: record.at })
  })

  it('takes it away as news of its own, with a time', async () => {
    const { result } = renderHook(() => usePicture())
    await act(async () => void (await result.current.choose(BEACH)))
    await act(async () => void (await result.current.choose('')))

    expect(result.current.picture).toBe('')
    expect(loadPresentationBackground()).toBe('')
    expect(loadPictureRecord()).toMatchObject({ id: '', sent: true })
    expect(result.current.state.at).toBeGreaterThan(0)
  })

  it('says when it could not be kept, and changes nothing', async () => {
    const { result } = renderHook(() => usePicture())
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    let kept = true
    await act(async () => void (kept = await result.current.choose(BEACH)))
    vi.restoreAllMocks()

    expect(kept).toBe(false)
    expect(result.current.picture).toBe('')
    expect(result.current.state).toEqual({ id: '', at: 0 })
  })
})

describe('a board from another device naming one', () => {
  it('takes the picture here away at once where it names none', async () => {
    const { result } = renderHook(() => usePicture())
    await act(async () => void (await result.current.choose(BEACH)))
    act(() => result.current.arrive('', 99_999_999_999_999))

    expect(result.current.picture).toBe('')
    expect(loadPresentationBackground()).toBe('')
  })

  // The new one is fetched by `useCarriedPicture`; until then the old one is better than none.
  it('keeps the picture here up until the one it names arrives', async () => {
    const { result } = renderHook(() => usePicture())
    await act(async () => void (await result.current.choose(BEACH)))
    const id = await pictureId(GARDEN)
    act(() => result.current.arrive(id, 99_999_999_999_999))

    expect(result.current.picture).toBe(BEACH)
    expect(result.current.state).toEqual({ id, at: 99_999_999_999_999 })
    expect(loadPictureRecord()).toMatchObject({ id, sent: true })
  })
})

// A picture chosen before pictures travelled.
describe('a picture from before', () => {
  it('is named as chosen at the beginning of time, so any choice since stands over it', async () => {
    savePresentationBackground(BEACH)
    const { result } = renderHook(() => usePicture())

    const id = await pictureId(BEACH)
    await waitFor(() => expect(result.current.state).toEqual({ id, at: 0 }))
    expect(loadPictureRecord()).toMatchObject({ id, at: 0, sent: false })
  })

  it('is left alone where a record already says something', async () => {
    savePresentationBackground(BEACH)
    savePictureRecord({ id: '', at: 5, sent: true, gone: [] })
    const { result } = renderHook(() => usePicture())
    await act(async () => {})
    expect(result.current.state).toEqual({ id: '', at: 5 })
  })
})

describe('carrying it', () => {
  /** The server, as `sync/audio.ts` hands it over, holding one picture. */
  const holding = (url: string): ClipStore => ({
    get: async () =>
      new Blob([Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0))], { type: 'image/jpeg' }),
    put: () => {},
    upload: async () => true,
    remove: async () => true,
  })

  it('shows a picture the moment it arrives', async () => {
    savePictureRecord({ id: await pictureId(GARDEN), at: 7, sent: true, gone: [] })
    const { result } = renderHook(() => {
      const pictures = usePicture()
      useCarriedPicture(holding(GARDEN), pictures)
      return pictures
    })
    await waitFor(() => expect(result.current.picture).toBe(GARDEN))
    expect(loadPresentationBackground()).toBe(GARDEN)
  })

  it('does nothing at all while synchronizing is off', async () => {
    savePictureRecord({ id: await pictureId(GARDEN), at: 7, sent: true, gone: [] })
    const { result } = renderHook(() => {
      const pictures = usePicture()
      useCarriedPicture(null, pictures)
      return pictures
    })
    await act(async () => {})
    expect(result.current.picture).toBe('')
  })

  it('sends one chosen while synchronizing is on', async () => {
    const upload = vi.fn(async () => true)
    const clips = { ...holding(GARDEN), upload }
    const { result } = renderHook(() => {
      const pictures = usePicture()
      useCarriedPicture(clips, pictures)
      return pictures
    })
    await act(async () => void (await result.current.choose(BEACH)))
    await waitFor(() => expect(loadPictureRecord().sent).toBe(true))
    expect(upload).toHaveBeenCalled()
  })
})
