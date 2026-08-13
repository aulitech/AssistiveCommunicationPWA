
// Menu → Settings. Dwell times, volume, speed and voice.

import { useCallback, useState } from 'react'
import { linkAccount } from '../voice/elevenlabs'
import { VoicePicker } from '../voice/picker'
import { clearAudioCache } from '../voice/audio-cache'
import { type ElevenLabsAccount } from '../core/store'
import { useSettings } from '../ui/settings'
import { loadElevenLabs, saveElevenLabs } from '../core/store'
import { PanelButton, ScrollPane, SettingRow, SettingSpinner } from '../ui/controls'

function VoiceRow() {
  const { settings, update } = useSettings()
  return (
    <SettingRow label="Voice">
      <VoicePicker
        value={settings.voiceURI}
        onChange={voiceURI => update({ voiceURI })}
        defaultLabel="Default"
      />
    </SettingRow>
  )
}

export function SettingsPanel() {
  const { settings, update } = useSettings()
  const [account, setLinked] = useState<ElevenLabsAccount | null>(loadElevenLabs)

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
      <ScrollPane className="settings-scroller" paneClassName="settings-body" step={100}>
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
        <VoiceRow />
        <ElevenLabsRow account={account} onChange={setAccount} />
      </ScrollPane>
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
