// The presentation window's picture, between the user's own devices.
//
// **Not in the board.** The board is written whole on every change, and a
// picture is hundreds of times the size of everything else in it; so the board
// carries which picture and when it was chosen (`PictureRecord`), and the
// picture itself goes up once, as a clip among the audio — locked the same way,
// at an address only the passphrase leads to, named in the index so erasing the
// copy takes it too. See `sync/audio.ts`.
//
// What is owed is written down on the device rather than held in memory, so a
// device closed half way through finishes the job the next time it opens:
//
//  * **Up**, for a picture chosen here and not yet sent.
//  * **Down**, for a picture the board names that this device does not hold.
//    Checked against its name before it is shown, so what arrives is exactly
//    what was chosen.
//  * **Off**, for pictures replaced since they went up, so the server is not
//    left holding every picture somebody ever tried.
//
// Like everything else under `sync/`, nothing throws and every failure is a
// value: what is not done now is done on the next beat.

import {
  loadPictureRecord,
  loadPresentationBackground,
  pictureBytes,
  pictureClip,
  pictureId,
  pictureUrl,
  savePictureRecord,
  savePresentationBackground,
  type PictureRecord,
} from '../core/store'
import { type ClipStore } from './audio'

/** Writes a change to the record as it stands now, which the screen may have changed meanwhile. */
function amend(change: (record: PictureRecord) => PictureRecord) {
  savePictureRecord(change(loadPictureRecord()))
}

/**
 * Does whatever is owed, and answers with the picture if one arrived — empty
 * otherwise.
 */
export async function carryPicture(clips: ClipStore): Promise<string> {
  try {
    const record = loadPictureRecord()
    for (const clip of record.gone) {
      if (await clips.remove(clip)) amend(r => ({ ...r, gone: r.gone.filter(g => g !== clip) }))
    }
    if (!record.id) return ''

    const held = loadPresentationBackground()
    const here = held && (await pictureId(held)) === record.id
    if (here) {
      if (record.sent) return ''
      const { type, bytes } = pictureBytes(held)
      if (await clips.upload(pictureClip(record), new Blob([bytes as BlobPart], { type }))) {
        amend(r => (r.id === record.id && r.at === record.at ? { ...r, sent: true } : r))
      }
      return ''
    }

    const blob = await clips.get(pictureClip(record))
    if (!blob?.type.startsWith('image/')) return ''
    const url = pictureUrl(blob.type, new Uint8Array(await blob.arrayBuffer()))
    if ((await pictureId(url)) !== record.id) return ''
    // Still the picture wanted: one chosen here while this was on its way wins.
    const now = loadPictureRecord()
    if (now.id !== record.id || now.at !== record.at) return ''
    return savePresentationBackground(url) ? url : ''
  } catch {
    return ''
  }
}
