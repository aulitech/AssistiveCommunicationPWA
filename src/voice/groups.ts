// Cutting a long list of voices down to a findable size.
//
// The two kinds divide on different things and neither divides on the other's:
// device voices have a language and nothing else that tells them apart, while an
// ElevenLabs account files each voice under a collection. One row of chips
// serves both, because a voice only ever belongs to one of them.

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
  return [...counts]
    .map(([id, { label, count }]) => ({ id, label, count }))
    // Collections first, then languages, each alphabetically — the account's own
    // voices are what somebody who linked one is looking for.
    .sort((a, b) => Number(a.id.startsWith('lang:')) - Number(b.id.startsWith('lang:')) || a.label.localeCompare(b.label))
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "en-GB" reads as a product code; "English (United Kingdom)" does not. */
function languageName(lang: string): string {
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
