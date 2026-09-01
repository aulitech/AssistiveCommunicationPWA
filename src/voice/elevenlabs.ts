// A linked ElevenLabs account, and the voices it brings.
//
// Peri's own voices come from the device and cost nothing, work offline and
// speak instantly. These cost credits, need the network, and take a moment to
// arrive. They are worth it to someone who would rather not sound like a
// browser, but the difference shapes everything here:
//
//  * Nothing waits on the network to find out it has failed. Every path that
//    cannot produce audio falls back to the device voice, so a flat connection,
//    an expired key or a browser refusing to autoplay all end in Peri speaking
//    anyway. Silence is not an acceptable failure for this app.
//  * Audio is kept once fetched. An AAC board is the same couple of thousand
//    phrases said over and over, so the second time costs nothing and arrives
//    instantly.
//  * The key never leaves this device and never enters a backup. A backup is
//    made to be shared; a key in one hands over the account.

import { type ElevenLabsAccount, type RemoteVoice } from '../core/store'
import { audioKey, cachedAudio, rememberAudio } from './audio-cache'
import { reportFailure } from '../core/report'

const API = 'https://api.elevenlabs.io/v1'

/**
 * Low latency matters more here than the last of the quality: this is somebody
 * mid-sentence, not a voiceover. Flash is also the cheaper of the two per
 * character, which for a board used all day is not a small thing.
 */
const MODEL = 'eleven_flash_v2_5'

/** Marks a voice as coming from the account rather than from the device. */
export const REMOTE_PREFIX = 'elevenlabs:'

export const remoteVoiceURI = (id: string) => `${REMOTE_PREFIX}${id}`

/** The voice id inside a `voiceURI`, or null if it names a device voice. */
export const remoteVoiceId = (voiceURI: string): string | null =>
  voiceURI.startsWith(REMOTE_PREFIX) ? voiceURI.slice(REMOTE_PREFIX.length) : null

export type LinkResult = { ok: true; account: ElevenLabsAccount } | { ok: false; error: string }

/** The failure as a value, and the same failure in the console. */
function linkFailed(error: string): LinkResult {
  reportFailure('elevenlabs/link', error)
  return { ok: false, error }
}

/** What went wrong, in words that say what to do about it. */
function describeFailure(status: number): string {
  if (status === 401 || status === 403) return 'That key was not accepted. Check you copied all of it.'
  if (status === 429) return 'ElevenLabs is asking for fewer requests. Try again in a moment.'
  return `ElevenLabs answered with an error (${status}).`
}

/**
 * Checks a key by asking for the voices behind it, which is also the only thing
 * we need from it — one request rather than a separate validation step that
 * could pass while the useful one fails.
 */
export async function linkAccount(apiKey: string): Promise<LinkResult> {
  const key = apiKey.trim()
  if (!key) return { ok: false, error: 'Paste your ElevenLabs API key first.' }

  let response: Response
  try {
    response = await fetch(`${API}/voices`, { headers: { 'xi-api-key': key } })
  } catch {
    return linkFailed('Could not reach ElevenLabs. Check the connection and try again.')
  }
  if (!response.ok) return linkFailed(describeFailure(response.status))

  let voices: RemoteVoice[]
  try {
    const body = (await response.json()) as {
      voices?: { voice_id?: unknown; name?: unknown; category?: unknown }[]
    }
    voices = (body.voices ?? [])
      .map(v => ({
        id: String(v.voice_id ?? ''),
        name: String(v.name ?? ''),
        // What ElevenLabs files it under. The picker offers these as filters, so
        // an account with a hundred voices is still navigable.
        ...(typeof v.category === 'string' && v.category ? { collection: v.category } : {}),
      }))
      .filter(v => v.id !== '' && v.name !== '')
  } catch {
    return linkFailed('ElevenLabs sent something Peri could not read.')
  }

  if (voices.length === 0) {
    return linkFailed('That account has no voices in it yet. Add one at elevenlabs.io first.')
  }
  return { ok: true, account: { apiKey: key, voices } }
}

// ── Audio ─────────────────────────────────────────────────────────────────────

/**
 * Requests already out. Previewing a voice and then assigning it asks for the
 * same clip twice within a moment, and the cache cannot dedupe what has not come
 * back yet — so the second caller waits on the first rather than being billed
 * for its own copy.
 */
const inFlight = new Map<string, Promise<Blob>>()

export async function synthesize(account: ElevenLabsAccount, voiceId: string, text: string): Promise<Blob> {
  const key = audioKey(voiceId, text)
  const hit = cachedAudio(key)
  if (hit) return hit

  const already = inFlight.get(key)
  if (already) return already

  const request = fetchAudio(account, voiceId, text, key)
  inFlight.set(key, request)
  try {
    return await request
  } finally {
    inFlight.delete(key)
  }
}

async function fetchAudio(account: ElevenLabsAccount, voiceId: string, text: string, key: string): Promise<Blob> {
  const response = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: { 'xi-api-key': account.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL }),
  })
  if (!response.ok) throw new Error(describeFailure(response.status))

  const blob = await response.blob()
  rememberAudio(key, blob)
  return blob
}
