// The presentation window's picture between two devices, through the real
// Netlify function — the box as `audio.test.ts` drives it. A second device is
// the same keys with this one's storage wiped and its record saying what the
// board it took named.

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { deriveSyncKeys, type SyncKeys } from '../../src/core/crypto'
import {
  loadPictureRecord,
  loadPresentationBackground,
  pictureClip,
  pictureId,
  replacing,
  savePictureRecord,
  savePresentationBackground,
} from '../../src/core/store'
import { clipStore, forgetClips, getClip, putClip, type ClipStore } from '../../src/sync/audio'
import { carryPicture } from '../../src/sync/picture'

const blobs = new Map<string, unknown>()

vi.mock('@netlify/blobs', () => ({
  getStore: () => ({
    get: async (key: string) => blobs.get(key) ?? null,
    setJSON: async (key: string, value: unknown) => void blobs.set(key, value),
    delete: async (key: string) => void blobs.delete(key),
  }),
}))

const { default: handler } = await import('../../netlify/functions/sync.ts')

const BEACH = `data:image/jpeg;base64,${btoa('the beach at dawn')}`
const GARDEN = `data:image/jpeg;base64,${btoa('the garden in May')}`

let keys: SyncKeys
let clips: ClipStore

beforeAll(async () => {
  keys = await deriveSyncKeys('the cat sat down', 'google:1234')
})

beforeEach(() => {
  blobs.clear()
  localStorage.clear()
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new Request(new URL(String(input), 'https://peri.test'), init)),
  )
  clips = clipStore(keys, 'tablet')
})

/** This device choosing a picture, as `talk/use-picture.ts` does. */
async function choose(url: string, at: number) {
  savePresentationBackground(url)
  savePictureRecord(replacing(loadPictureRecord(), { id: await pictureId(url), at, sent: false }))
}

/** Another device, which took a board naming this picture. */
async function anotherDeviceNaming(url: string, at: number) {
  localStorage.clear()
  savePictureRecord({ id: await pictureId(url), at, sent: true, gone: [] })
}

describe('the presentation picture', () => {
  it('goes up from the device it was chosen on, and comes down on one whose board names it', async () => {
    await choose(BEACH, 5)
    expect(await carryPicture(clips)).toBe('')
    expect(loadPictureRecord().sent, 'still owed after it went up').toBe(true)

    await anotherDeviceNaming(BEACH, 5)
    expect(loadPresentationBackground()).toBe('')
    expect(await carryPicture(clips)).toBe(BEACH)
    expect(loadPresentationBackground()).toBe(BEACH)
  })

  it('is not readable on the server', async () => {
    await choose(BEACH, 5)
    await carryPicture(clips)
    const held = JSON.stringify([...blobs.values()])
    expect(held).not.toContain(btoa('the beach at dawn'))
    expect(held).not.toContain('beach')
  })

  // What arrives is shown only if it is the picture the board named.
  it('is refused when what is there is not the picture named', async () => {
    const id = await pictureId(BEACH)
    await putClip(
      keys,
      'phone',
      pictureClip({ id, at: 5 }),
      new Blob([atob(GARDEN.split(',')[1])], { type: 'image/jpeg' }),
    )

    await anotherDeviceNaming(BEACH, 5)
    expect(await carryPicture(clips)).toBe('')
    expect(loadPresentationBackground()).toBe('')
  })

  it('is not put up over one chosen here while it was on its way', async () => {
    await choose(BEACH, 5)
    await carryPicture(clips)
    await anotherDeviceNaming(BEACH, 5)

    const meanwhile: ClipStore = {
      ...clips,
      get: async key => {
        await choose(GARDEN, 6)
        return clips.get(key)
      },
    }
    expect(await carryPicture(meanwhile)).toBe('')
    expect(loadPresentationBackground()).toBe(GARDEN)
  })

  it('stays owed where it could not go up, and goes on the next try', async () => {
    await choose(BEACH, 5)
    expect(await carryPicture({ ...clips, upload: async () => false })).toBe('')
    expect(loadPictureRecord().sent).toBe(false)

    await carryPicture(clips)
    expect(loadPictureRecord().sent).toBe(true)
  })

  // The server is not left holding every picture somebody ever tried.
  it('takes a picture off the server once another is chosen in its place, or none', async () => {
    await choose(BEACH, 5)
    await carryPicture(clips)
    const beach = pictureClip({ id: await pictureId(BEACH), at: 5 })
    expect(await getClip(keys, beach)).not.toBeNull()

    await choose(GARDEN, 6)
    await carryPicture(clips)
    expect(await getClip(keys, beach), 'the replaced picture was left up').toBeNull()
    expect(await getClip(keys, pictureClip({ id: await pictureId(GARDEN), at: 6 }))).not.toBeNull()
    expect(loadPictureRecord().gone).toEqual([])

    savePresentationBackground('')
    savePictureRecord(replacing(loadPictureRecord(), { id: '', at: 7, sent: true }))
    await carryPicture(clips)
    expect(await getClip(keys, pictureClip({ id: await pictureId(GARDEN), at: 6 }))).toBeNull()
  })

  // Only what went up is owed a removal: a picture never sent has nothing there.
  it('owes no removal for a picture that never went up', async () => {
    await choose(BEACH, 5)
    await choose(GARDEN, 6)
    expect(loadPictureRecord().gone).toEqual([])
  })

  it('goes with everything else when the copy is erased', async () => {
    await choose(BEACH, 5)
    await carryPicture(clips)
    await forgetClips(keys)
    expect(await getClip(keys, pictureClip({ id: await pictureId(BEACH), at: 5 }))).toBeNull()
  })
})
