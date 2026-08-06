// Speech output. One entry point so every utterance — composed message,
// emergency phrase, preview — honours the user's voice, volume and rate.

export interface VoiceSettings {
  voiceURI: string // empty = browser default
  volume: number // 0–1
  rate: number // 0.5–2
}

export function speak(text: string, settings: VoiceSettings) {
  if (!text.trim() || !('speechSynthesis' in window)) return
  speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.volume = settings.volume
  utterance.rate = settings.rate
  if (settings.voiceURI) {
    const voice = speechSynthesis.getVoices().find(v => v.voiceURI === settings.voiceURI)
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    }
  }
  speechSynthesis.speak(utterance)
}

/**
 * Voices load asynchronously in most browsers and the `voiceschanged` event can
 * fire more than once. Subscribe and re-read rather than snapshotting on mount.
 */
export function subscribeVoices(onChange: (voices: SpeechSynthesisVoice[]) => void): () => void {
  if (!('speechSynthesis' in window)) {
    onChange([])
    return () => {}
  }

  const read = () => {
    // Group by language so a long list stays navigable, with the UI language first.
    const preferred = navigator.language.toLowerCase()
    const voices = [...speechSynthesis.getVoices()].sort((a, b) => {
      const aPref = a.lang.toLowerCase().startsWith(preferred.slice(0, 2)) ? 0 : 1
      const bPref = b.lang.toLowerCase().startsWith(preferred.slice(0, 2)) ? 0 : 1
      return aPref - bPref || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name)
    })
    onChange(voices)
  }

  read()
  speechSynthesis.addEventListener('voiceschanged', read)
  return () => speechSynthesis.removeEventListener('voiceschanged', read)
}
