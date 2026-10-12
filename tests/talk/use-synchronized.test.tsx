// What the screen hands synchronizing and does with what comes back, with the
// exchange itself stood in for — `tests/sync/use-sync.test.tsx` drives that
// through the real function. Here: the presentation window's picture named in
// what is sent, taken from what arrives, and carried while it runs.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { EMPTY_ALIASES } from '../../src/core/phrases'
import {
  DEFAULT_SETTINGS,
  emptyStore,
  loadPresentationBackground,
  pictureId,
  savePictureRecord,
} from '../../src/core/store'
import { type SyncPayload } from '../../src/core/sync'
import { type ClipStore } from '../../src/sync/audio'
import { type Board } from '../../src/talk/use-board'
import { useSynchronized } from '../../src/talk/use-synchronized'

/** What the screen last handed `useSync`, and what it gave back. */
let handed: { payload: SyncPayload; onApply: (payload: SyncPayload, from: string) => void }
let clips: ClipStore | null = null

vi.mock('../../src/sync/use-sync', () => ({
  useSync: (args: typeof handed) => {
    handed = args
    return { clips }
  },
}))

const BEACH = `data:image/jpeg;base64,${btoa('the beach at dawn')}`
const GARDEN = `data:image/jpeg;base64,${btoa('the garden in May')}`

function screen() {
  const board = { store: emptyStore(), aliases: EMPTY_ALIASES, restore: vi.fn() } as unknown as Board
  return renderHook(() =>
    useSynchronized({
      user: { name: 'Sam', email: 'sam@example.com', provider: 'google', id: '1' } as never,
      board,
      settings: DEFAULT_SETTINGS,
      update: vi.fn(),
      replyKey: '',
      replyKeyAt: 0,
      setReplyKey: vi.fn(),
      flashToast: vi.fn(),
    }),
  )
}

beforeEach(() => {
  localStorage.clear()
  clips = null
})

describe('the presentation picture', () => {
  it('is named in what synchronizing sends, with when it was chosen', async () => {
    const { result } = screen()
    expect(handed.payload).toMatchObject({ picture: '', pictureAt: 0 })

    await act(async () => void (await result.current.choosePicture(BEACH)))
    expect(result.current.picture).toBe(BEACH)
    expect(handed.payload.picture).toBe(await pictureId(BEACH))
    expect(handed.payload.pictureAt).toBeGreaterThan(0)
  })

  it('is taken from a board that arrives naming none', async () => {
    const { result } = screen()
    await act(async () => void (await result.current.choosePicture(BEACH)))

    act(() => handed.onApply({ ...handed.payload, picture: '', pictureAt: 99_999_999_999_999 }, 'phone'))
    expect(result.current.picture).toBe('')
    expect(handed.payload).toMatchObject({ picture: '', pictureAt: 99_999_999_999_999 })
  })

  it('arrives while synchronizing runs', async () => {
    savePictureRecord({ id: await pictureId(GARDEN), at: 7, sent: true, gone: [] })
    clips = {
      get: async () =>
        new Blob([Uint8Array.from(atob(GARDEN.split(',')[1]), c => c.charCodeAt(0))], { type: 'image/jpeg' }),
      put: () => {},
      upload: async () => true,
      remove: async () => true,
    }
    const { result } = screen()
    await waitFor(() => expect(result.current.picture).toBe(GARDEN))
    expect(loadPresentationBackground()).toBe(GARDEN)
  })
})
