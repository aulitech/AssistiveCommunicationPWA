// Part of `core/store.ts` — see there for what the store is, and AGENTS.md for
// the rules each part keeps.

import { ELEVENLABS_KEY, REPLY_KEY, writeKey } from './keys'
import { storageKey } from './owner'

// ── A linked ElevenLabs account ───────────────────────────────────────────────
// Its own key, and deliberately not part of a backup: a backup is made to be
// shared, and the key in one hands over the account it belongs to along with
// whatever that account can be billed for. `src/backup.test.ts` holds it to
// that. What a backup does carry is the chosen voice, which on a device with no
// account of its own simply falls back to the device voice.

export interface RemoteVoice {
  id: string
  name: string
  /** What ElevenLabs files it under — premade, cloned, professional, generated. */
  collection?: string
}

export interface ElevenLabsAccount {
  apiKey: string
  /** Kept so the picker can still name the chosen voice while offline. */
  voices: RemoteVoice[]
}

/**
 * Whether two accounts are the same one, voices and all.
 *
 * Asked before writing one, because writing an account throws away the audio
 * cached under it — and a board arriving from another device carries the
 * account whether or not that is what changed. Without this, an edit to a
 * phrase on the tablet empties the phone's cache: every clip re-fetched, on the
 * user's own credits, for nothing.
 *
 * The voices count. A key re-linked can name a different set, and a picker
 * offering voices the account no longer has is a phrase that will not speak.
 */
export function sameAccount(a: ElevenLabsAccount | null, b: ElevenLabsAccount | null): boolean {
  if (a === null || b === null) return a === b
  if (a.apiKey !== b.apiKey || a.voices.length !== b.voices.length) return false
  return a.voices.every((voice, i) => voice.id === b.voices[i].id && voice.name === b.voices[i].name)
}

export function loadElevenLabs(): ElevenLabsAccount | null {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(ELEVENLABS_KEY)) ?? 'null')
    if (!raw || typeof raw.apiKey !== 'string' || !raw.apiKey) return null
    const voices: RemoteVoice[] = Array.isArray(raw.voices)
      ? raw.voices
          .filter(
            (v: unknown): v is RemoteVoice =>
              typeof v === 'object' && v !== null && typeof (v as RemoteVoice).id === 'string',
          )
          .map((v: RemoteVoice) => ({
            id: v.id,
            name: String(v.name ?? v.id),
            ...(typeof v.collection === 'string' && v.collection ? { collection: v.collection } : {}),
          }))
      : []
    return { apiKey: raw.apiKey, voices }
  } catch {
    return null
  }
}

export function saveElevenLabs(account: ElevenLabsAccount | null) {
  if (account) writeKey(storageKey(ELEVENLABS_KEY), JSON.stringify(account))
  else localStorage.removeItem(storageKey(ELEVENLABS_KEY))
}

// ── The key behind a suggested reply ──────────────────────────────────────────
// Theirs, not ours, and for the reason the ElevenLabs key is theirs: it bills
// them for something they chose. It could not be ours in any case — an Anthropic
// key cannot be restricted to one site the way the translation key is, so one
// inlined into this bundle would be one anybody could lift and spend.
//
// It follows every rule that key follows: **never in a backup**, which is a file
// made to be handed to somebody else, and it **does travel in a snapshot**, which
// is sealed with the user's own passphrase and reaches their own devices and
// nowhere else.

/** The key, or empty for a board that has not been given one. */
export function loadReplyKey(): string {
  try {
    const raw: unknown = localStorage.getItem(storageKey(REPLY_KEY))
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

export function saveReplyKey(key: string) {
  const trimmed = key.trim()
  if (trimmed) writeKey(storageKey(REPLY_KEY), trimmed)
  else localStorage.removeItem(storageKey(REPLY_KEY))
}
