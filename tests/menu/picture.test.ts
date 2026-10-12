// A picture made small enough to keep, and to send: no larger than
// synchronizing carries as a clip, at the best quality and the largest size
// that fits. jsdom draws nothing, so the canvas here answers with a JPEG as
// large as its pixels and its quality would make one.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shrinkPicture } from '../../src/menu/picture'
import { MAX_CLIP_BYTES } from '../../src/sync/audio'

/** The size and quality of every picture asked of the canvas. */
let drawn: { width: number; height: number; quality: number }[] = []

/** A JPEG of `bytes` bytes, as a `data:` URL. */
const jpeg = (bytes: number) => `data:image/jpeg;base64,${'A'.repeat(Math.ceil(bytes / 3) * 4)}`

function photograph(width: number, height: number, bytesPerPixel: number) {
  vi.stubGlobal('createImageBitmap', async () => ({ width, height, close: () => {} }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {} } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
    _type?: string,
    quality = 0.92,
  ) {
    drawn.push({ width: this.width, height: this.height, quality })
    return jpeg(this.width * this.height * bytesPerPixel * quality)
  })
}

const bytesIn = (url: string) => ((url.length - url.indexOf(',') - 1) * 3) / 4

beforeEach(() => {
  drawn = []
  vi.restoreAllMocks()
})

describe('shrinking a picture', () => {
  it('keeps a small one at its own size and the best quality', async () => {
    photograph(800, 600, 0.5)
    await shrinkPicture(new File(['x'], 'small.jpg'))
    expect(drawn).toEqual([{ width: 800, height: 600, quality: 0.85 }])
  })

  it('draws a large one no wider than a screen', async () => {
    photograph(4000, 3000, 0.05)
    await shrinkPicture(new File(['x'], 'phone.jpg'))
    expect(drawn[0]).toMatchObject({ width: 1920, height: 1440 })
  })

  // Synchronizing sends it as a clip, and a larger one would never go up.
  it('is never larger than synchronizing can send: a lower quality first, then smaller', async () => {
    photograph(4000, 3000, 1)
    const url = await shrinkPicture(new File(['x'], 'busy.jpg'))
    expect(bytesIn(url)).toBeLessThanOrEqual(MAX_CLIP_BYTES)
    expect(drawn.slice(0, 3).map(d => d.quality)).toEqual([0.85, 0.75, 0.65])
    expect(drawn[3].width).toBeLessThan(1920)
  })
})
