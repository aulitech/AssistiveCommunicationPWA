// A picture made small enough to keep — for the presentation window's
// background, chosen under Settings. See `core/store/presentation.ts`.

/** The longest side a kept picture has: a large screen's width, which is all a background is ever drawn at. */
const LONGEST = 1920

/**
 * **A photograph as it comes off a phone is several megabytes, and a board's
 * whole storage is a few.** So it is drawn again at no more than a screen's
 * width and kept as a JPEG — a few hundred kilobytes — before anything tries to
 * keep it. Rejects for a file that is not a picture the browser can draw.
 */
export async function shrinkPicture(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, LONGEST / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const drawing = canvas.getContext('2d')
  if (!drawing) throw new Error('This browser cannot draw a picture')
  drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}
