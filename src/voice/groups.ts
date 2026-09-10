// Cutting a long list of voices down to a findable size.
//
// The two kinds divide on different things and neither divides on the other's:
// device voices have a language and nothing else that tells them apart, while an
// ElevenLabs account files each voice under a collection. One row of chips
// serves both, because a voice only ever belongs to one of them.

import { VARIETIES, varietyLabel } from '../core/translation'

export interface VoiceChoice {
  voiceURI: string
  name: string
  lang?: string
  remote?: boolean
  /** What an ElevenLabs account files it under. */
  collection?: string
}

/**
 * The groups a long list of voices can be cut down by. Device voices divide by
 * language, which is the only thing that reliably tells them apart; an
 * ElevenLabs account divides by the collection it files each voice under.
 * Neither exists for the other kind, so one row of chips serves both.
 */
export function voiceGroups(items: VoiceChoice[]): { id: string; label: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>()
  for (const v of items) {
    const id = v.remote ? `collection:${v.collection ?? 'other'}` : v.lang ? `lang:${v.lang}` : ''
    if (!id) continue
    const label = v.remote ? titleCase(v.collection ?? 'Other') : languageName(v.lang!)
    counts.set(id, { label, count: (counts.get(id)?.count ?? 0) + 1 })
  }
  return (
    [...counts]
      .map(([id, { label, count }]) => ({ id, label, count }))
      // Collections first, then languages, each alphabetically — the account's own
      // voices are what somebody who linked one is looking for.
      .sort(
        (a, b) =>
          Number(a.id.startsWith('lang:')) - Number(b.id.startsWith('lang:')) || a.label.localeCompare(b.label),
      )
  )
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The languages this device can actually speak, commonest first.
 *
 * Built from the installed voices rather than from a list of the world's
 * languages: offering one the device has no voice for would be offering
 * silence. The browser's own language leads, because it is the likeliest
 * answer and it saves reading down a list of sixty.
 */
export function speechLanguages(voices: { lang: string }[]): { tag: string; label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const v of voices) {
    if (v.lang) counts.set(v.lang, (counts.get(v.lang) ?? 0) + 1)
  }
  const preferred = deviceLanguage().slice(0, 2).toLowerCase()
  return [...counts]
    .map(([tag, count]) => ({ tag, label: languageName(tag), count }))
    .sort(
      (a, b) =>
        Number(!a.tag.toLowerCase().startsWith(preferred)) - Number(!b.tag.toLowerCase().startsWith(preferred)) ||
        a.label.localeCompare(b.label),
    )
}

const deviceLanguage = () => {
  try {
    return navigator.language ?? ''
  } catch {
    return ''
  }
}

/** "en-GB" reads as a product code; "English (United Kingdom)" does not. */
export function languageName(lang: string): string {
  try {
    return new Intl.DisplayNames([navigator.language], { type: 'language' }).of(lang) ?? lang
  } catch {
    return lang
  }
}

/** Whether a voice belongs to the chosen group. */
export function inGroup(voice: VoiceChoice, group: string | null): boolean {
  if (group === null) return true
  if (group.startsWith('collection:')) {
    return Boolean(voice.remote) && `collection:${voice.collection ?? 'other'}` === group
  }
  return !voice.remote && `lang:${voice.lang ?? ''}` === group
}

/** How a voice reads on the trigger and in a label. */
export function voiceLabel(v: VoiceChoice) {
  if (v.remote) return `${v.name} · ElevenLabs`
  return v.lang ? `${v.name} · ${v.lang}` : v.name
}

/**
 * What the board is set to speak, named for a reader rather than by its tag.
 *
 * A language set on another device may have no voices here, and naming it
 * anyway is the honest answer — it is still what the board is set to speak.
 */
export function languageLabel(tag: string, voices: SpeechSynthesisVoice[]): string {
  if (!tag) return 'Device default'
  const known = speechLanguages(voices).find(l => l.tag === tag)
  return known?.label ?? varietyLabel(tag) ?? languageName(tag)
}

/**
 * What the device can speak, and what Peri can translate into.
 *
 * The rule was once "only languages this device has voices for", on the grounds
 * that offering one it cannot speak is offering silence. That is true of a
 * language with nothing behind it and false of one Peri ships a table for: no
 * device has a Puerto Rican or a Patois voice, and both of those are the point.
 * A variety Peri knows leads the list, since a device offering sixty voices
 * offers none of these.
 */
export function offeredLanguages(voices: SpeechSynthesisVoice[]) {
  const own = VARIETIES.map(v => ({ tag: v.tag, label: v.label, count: 0 }))
  const device = speechLanguages(voices).filter(l => !own.some(o => o.tag === l.tag))
  return [...own, ...device]
}
