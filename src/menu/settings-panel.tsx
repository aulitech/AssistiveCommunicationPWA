
// Menu → Settings. Dwell times, volume, speed and voice.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { clearAudioCache, linkAccount, remoteVoiceURI } from '../voice/elevenlabs'
import { type ElevenLabsAccount } from '../core/store'
import { useSettings } from '../ui/settings'
import { speak, subscribeVoices } from '../voice/speech'
import { loadElevenLabs, saveElevenLabs } from '../core/store'
import { cx, dwellVar } from '../ui/style'
import { PanelButton, PickerModal, PickerTile, SettingRow, SettingSpinner } from '../ui/controls'

/** A voice offered in the picker, wherever it comes from. */
interface VoiceChoice {
  voiceURI: string
  name: string
  lang?: string
  remote?: boolean
}

function voiceLabel(v: VoiceChoice) {
  if (v.remote) return `${v.name} · ElevenLabs`
  return v.lang ? `${v.name} · ${v.lang}` : v.name
}

/** Short, and it says what it is. Cached after the first time on a paid voice. */
const SAMPLE = 'This is how I sound.'

function VoiceRow({ voices, account }: { voices: SpeechSynthesisVoice[]; account: ElevenLabsAccount | null }) {
  const { settings, update } = useSettings()
  const [open, setOpen] = useState(false)
  // The account's voices come first: someone who went to the trouble of linking
  // one is looking for those, not scrolling past sixty the device came with.
  const items = useMemo<VoiceChoice[]>(
    () => [
      { voiceURI: '', name: 'Default', lang: '' },
      ...(account?.voices ?? []).map(v => ({ voiceURI: remoteVoiceURI(v.id), name: v.name, remote: true })),
      ...voices.map(v => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang })),
    ],
    [voices, account],
  )
  const current = items.find(v => v.voiceURI === settings.voiceURI) ?? items[0]

  // What to put back if they leave without settling on one.
  const [before, setBefore] = useState(settings.voiceURI)

  const openPicker = useCallback(() => {
    setBefore(settings.voiceURI)
    setOpen(true)
  }, [settings.voiceURI])

  const { active, props } = useDwellControl(settings.actionDwellMs, openPicker)

  // Applied as it is chosen, and spoken with the voice actually picked rather
  // than the one in `settings` — that update has not reached this render yet.
  const pick = useCallback(
    (voiceURI: string) => {
      update({ voiceURI })
      speak(SAMPLE, { ...settings, voiceURI })
    },
    [update, settings],
  )

  const done = useCallback(() => setOpen(false), [])

  const cancel = useCallback(() => {
    update({ voiceURI: before })
    setOpen(false)
  }, [update, before])

  return (
    <SettingRow label="Voice">
      <div
        className={cx('voice-trigger', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Voice: ${voiceLabel(current)}. Choose another`}
        {...props}
      >
        <span className="voice-trigger-label">{voiceLabel(current)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <div className="dwell-bar" key={active ? 'a' : 'i'} />
      </div>
      {open && (
        <PickerModal title="Choose a voice" hint="Each one speaks as you choose it" onDone={done} onCancel={cancel}>
          {items.map((v, i) => (
            <PickerTile
              key={`${v.voiceURI}-${i}`}
              name={v.name}
              detail={v.remote ? 'ElevenLabs' : v.lang}
              className={v.remote ? 'is-remote' : undefined}
              selected={v.voiceURI === settings.voiceURI}
              onSelect={() => pick(v.voiceURI)}
            />
          ))}
        </PickerModal>
      )}
    </SettingRow>
  )
}

export function SettingsPanel() {
  const { settings, update } = useSettings()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [account, setLinked] = useState<ElevenLabsAccount | null>(loadElevenLabs)

  useEffect(() => subscribeVoices(setVoices), [])

  // Written straight through, and `speak` reads it back per utterance, so there
  // is no second copy to keep in step. The cache goes with it: audio fetched on
  // one account's credits is not another's to use, and a voice re-linked may
  // well be a different one under the same name.
  const setAccount = useCallback((next: ElevenLabsAccount | null) => {
    saveElevenLabs(next)
    clearAudioCache()
    setLinked(next)
  }, [])

  return (
    <div className="settings-panel">
      <SettingRow label="Phrase dwell">
        <SettingSpinner
          value={settings.phraseDwellMs}
          min={500}
          max={3000}
          step={100}
          format={v => `${(v / 1000).toFixed(1)}s`}
          onValue={v => update({ phraseDwellMs: v })}
        />
      </SettingRow>
      <SettingRow label="Action dwell">
        <SettingSpinner
          value={settings.actionDwellMs}
          min={300}
          max={2000}
          step={100}
          format={v => `${(v / 1000).toFixed(1)}s`}
          onValue={v => update({ actionDwellMs: v })}
        />
      </SettingRow>
      <SettingRow label="Volume">
        <SettingSpinner
          value={Math.round(settings.volume * 100)}
          min={0}
          max={100}
          step={10}
          format={v => `${v}%`}
          onValue={v => update({ volume: v / 100 })}
        />
      </SettingRow>
      <SettingRow label="Speed">
        <SettingSpinner
          value={Math.round(settings.rate * 10)}
          min={5}
          max={20}
          step={1}
          format={v => `${(v / 10).toFixed(1)}×`}
          onValue={v => update({ rate: v / 10 })}
        />
      </SettingRow>
      {(voices.length > 0 || account) && <VoiceRow voices={voices} account={account} />}
      <ElevenLabsRow account={account} onChange={setAccount} />
    </div>
  )
}

/**
 * Linking an account. Typed rather than dwelled, like the rest of the one-off
 * setup — an API key is forty characters of noise, and whoever is pasting it is
 * at a keyboard.
 */
function ElevenLabsRow({ account, onChange }: {
  account: ElevenLabsAccount | null
  onChange: (account: ElevenLabsAccount | null) => void
}) {
  const { settings, update } = useSettings()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const link = useCallback(() => {
    setBusy(true)
    setError(null)
    linkAccount(key).then(result => {
      setBusy(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setKey('')
      onChange(result.account)
    })
  }, [key, onChange])

  // Unlinking while one of its voices is chosen would leave the picker naming a
  // voice that is no longer there, so the device voice takes over with it.
  const unlink = useCallback(() => {
    setError(null)
    if (settings.voiceURI.startsWith('elevenlabs:')) update({ voiceURI: '' })
    onChange(null)
  }, [onChange, settings.voiceURI, update])

  return (
    <div className="setting-row eleven-row">
      <span className="setting-label">ElevenLabs</span>
      <div className="setting-control eleven-control">
        {account ? (
          <>
            <span className="eleven-status">
              Linked · {account.voices.length} voice{account.voices.length === 1 ? '' : 's'}
            </span>
            <PanelButton kind="danger" label="Unlink" onActivate={unlink} />
          </>
        ) : (
          <>
            <input
              className="profile-input eleven-key"
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  link()
                }
              }}
              placeholder="Paste your API key"
              aria-label="ElevenLabs API key"
              autoComplete="off"
              spellCheck={false}
            />
            <PanelButton
              kind="primary"
              label={busy ? 'Linking…' : 'Link'}
              onActivate={link}
              disabled={busy || key.trim() === ''}
            />
          </>
        )}
        {error && <p className="eleven-error" role="alert">{error}</p>}
        <p className="eleven-note">
          {account
            ? 'These voices need the internet and use your ElevenLabs credits. Peri falls back to the device voice if one cannot be fetched, and the emergency bar always uses the device voice.'
            : 'Optional. Adds the voices from your ElevenLabs account. The key stays on this device and is never put in a backup.'}
        </p>
      </div>
    </div>
  )
}

// ── ProfilePanel ──────────────────────────────────────────────────────────────
// Supplies the values behind {contact} and {name.nickname}. Typed rather than
// dwelled: it is one-off setup, usually done by whoever sets the device up.
