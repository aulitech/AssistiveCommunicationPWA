// A picture made small enough to keep — for the presentation window's
// background, chosen under Settings. See `core/store/presentation.ts`.

import { MAX_CLIP_BYTES } from '../sync/audio'

/** The longest side a kept picture has: a large screen's width, which is all a background is ever drawn at. */
const LONGEST = 1920

/** The JPEG qualities tried in turn, best first, before the picture is drawn any smaller. */
const QUALITIES = [0.85, 0.75, 0.65]

/** How many bytes a `data:` URL of this length holds. */
const bytesIn = (url: string) => Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4)

/**
 * **A photograph as it comes off a phone is several megabytes, and a board's
 * whole storage is a few.** So it is drawn again at no more than a screen's
 * width and kept as a JPEG — a few hundred kilobytes — before anything tries to
 * keep it. **No larger than synchronizing can carry**, which sends it as a clip
 * (`MAX_CLIP_BYTES`): a lower quality first, and then smaller, until it fits.
 * Rejects for a file that is not a picture the browser can draw.
 */
export async function shrinkPicture(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    let longest = Math.min(LONGEST, Math.max(bitmap.width, bitmap.height))
    for (;;) {
      const scale = longest / Math.max(bitmap.width, bitmap.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const drawing = canvas.getContext('2d')
      if (!drawing) throw new Error('This browser cannot draw a picture')
      drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const quality of QUALITIES) {
        const url = canvas.toDataURL('image/jpeg', quality)
        if (bytesIn(url) <= MAX_CLIP_BYTES || longest <= 64) return url
      }
      longest = Math.floor(longest * 0.75)
    }
  } finally {
    bitmap.close()
  }
}
