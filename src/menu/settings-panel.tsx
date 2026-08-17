
// Menu → Settings. Dwell times, volume, speed and voice.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { linkAccount, REMOTE_PREFIX } from '../voice/elevenlabs'
import { VoicePicker } from '../voice/picker'
import { clearAudioCache } from '../voice/audio-cache'
import { type Profile } from '../core/phrases'
import { buildBackup } from '../core/backup'
import { type ElevenLabsAccount, type PhraseStore } from '../core/store'
import { useSettings } from '../ui/settings'
import { DEFAULT_SETTINGS, factoryReset, loadElevenLabs, loadRecent, saveElevenLabs, saveRecent } from '../core/store'
import { PanelButton, ScrollPane, SettingRow, SettingSpinner } from '../ui/controls'
import { downloadBackup } from './backup-file'

/**
 * The confirmation in front of a factory reset.
 *
 * Centred and portalled for the same reason `ConfirmSignOut` is: a pointer rests
 * where it last fired, so a "yes" appearing under the control that asked would be
 * answered by the pointer already sitting there — and this is the one control in
 * the app that can take away everything somebody wrote.
 *
 * It leads with a way out. Deleting a phrase is the one change Peri offers no
 * road back from, and this deletes all of them at once, so the first thing on
 * offer is a file to keep. Refusing nothing: somebody who has a backup already,
 * or does not want one, can go straight past it.
 */
function ConfirmReset({ onExport, onConfirm, onCancel }: {
  /** Reports whether the browser took the file, which decides what is said next. */
  onExport: () => { ok: true; name: string } | { ok: false }
  onConfirm: () => void
  onCancel: () => void
}) {
  const [saved, setSaved] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const exportFirst = useCallback(() => {
    const result = onExport()
    setSaved(result.ok ? result.name : null)
    setFailed(!result.ok)
  }, [onExport])

  return createPortal(
    <div className="confirm-scrim">
      <div className="confirm-modal" role="alertdialog" aria-modal="true" aria-label="Reset to factory defaults">
        <span className="confirm-title">Reset everything?</span>
        <p className="confirm-note">
          Every phrase you wrote, every one you reworded or removed, your categories, your emergency
          bar, your details, what you have said, your settings and any linked voice account will go
          back to how Peri arrived. <strong>This cannot be undone.</strong> You stay signed in.
        </p>
        {/* Said after the fact rather than before it, because "saved" is a claim
            only the browser can settle — a blocked download that looked like a
            save would be the worst possible moment to be wrong. */}
        {saved && <p className="confirm-note confirm-ok">Saved as {saved}. Keep it somewhere safe.</p>}
        {failed && (
          <p className="confirm-note confirm-warn">
            Peri could not save the file. Cancel and use <strong>Backup &amp; sharing</strong>, which
            can copy it instead.
          </p>
        )}
        <div className="confirm-actions">
          <PanelButton kind="primary" label="Export a backup first" onActivate={exportFirst} />
          <PanelButton kind="plain" label="Cancel" onActivate={onCancel} />
          <PanelButton kind="danger" label="Reset everything" onActivate={onConfirm} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

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

export function SettingsPanel({ store, profile, categoryById }: {
  /** Only so the reset confirmation can offer a backup before it wipes them. */
  store: PhraseStore
  profile: Profile
  categoryById: Map<string, string>
}) {
  const { settings, update } = useSettings()
  const [account, setLinked] = useState<ElevenLabsAccount | null>(loadElevenLabs)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const exportEverything = useCallback(
    () => downloadBackup(buildBackup({ store, profile, settings, categoryById })),
    [store, profile, settings, categoryById],
  )

  // Storage first, then a reload. Nothing here can reach the React state holding
  // the same values — the board, the composer, the sent list, this panel's own
  // account row — and a screen still offering phrases that no longer exist is
  // worse than no reset at all. Reloading is the one way to be sure every module
  // has read the empty shelf rather than most of them.
  const resetEverything = useCallback(() => {
    factoryReset()
    clearAudioCache()
    location.reload()
  }, [])

  // Written straight through, and `speak` reads it back per utterance, so there
  // is no second copy to keep in step. The cache goes with it: audio fetched on
  // one account's credits is not another's to use, and a voice re-linked may
  // well be a different one under the same name.
  const setAccount = useCallback((next: ElevenLabsAccount | null) => {
    saveElevenLabs(next)
    clearAudioCache()
    // A remembered voice from the account that has just gone would seed the next
    // new phrase with one that no longer exists.
    if (next === null) {
      const recent = loadRecent()
      if (recent.voice?.startsWith(REMOTE_PREFIX)) saveRecent({ ...recent, voice: undefined })
    }
    setLinked(next)
  }, [])

  return (
    <div className="settings-panel">
      <ScrollPane className="settings-scroller" paneClassName="settings-body" step={100}>
        <SettingRow label="Phrase dwell">
          <SettingSpinner
            value={settings.phraseDwellMs}
            defaultValue={DEFAULT_SETTINGS.phraseDwellMs}
            name="phrase dwell"
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
            defaultValue={DEFAULT_SETTINGS.actionDwellMs}
            name="action dwell"
            min={300}
            max={2000}
            step={100}
            format={v => `${(v / 1000).toFixed(1)}s`}
            onValue={v => update({ actionDwellMs: v })}
          />
        </SettingRow>
        {/* Beside the two dwell times because it is the third of the timings, but
            answering a different question: those are how long it takes to choose
            something, this is how fast it happens again while the pointer stays.
            Shown in milliseconds — a tenth of a second is the interesting
            difference here, and "0.2s" hides it. */}
        <SettingRow label="Auto-repeat">
          <SettingSpinner
            value={settings.repeatDelayMs}
            defaultValue={DEFAULT_SETTINGS.repeatDelayMs}
            name="auto-repeat"
            min={100}
            max={2000}
            step={50}
            format={v => `${v}ms`}
            onValue={v => update({ repeatDelayMs: v })}
          />
        </SettingRow>
        <SettingRow label="Volume">
          <SettingSpinner
            value={Math.round(settings.volume * 100)}
            defaultValue={DEFAULT_SETTINGS.volume * 100}
            name="volume"
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
            defaultValue={DEFAULT_SETTINGS.rate * 10}
            name="speed"
            min={5}
            max={20}
            step={1}
            format={v => `${(v / 10).toFixed(1)}×`}
            onValue={v => update({ rate: v / 10 })}
          />
        </SettingRow>
        <VoiceRow />
        <ElevenLabsRow account={account} onChange={setAccount} />

        {/* Last, and away from the values it undoes. Every revert above puts one
            setting back; this puts the whole device back, and the two should not
            sit close enough that a pointer travelling to one crosses the other. */}
        <div className="setting-reset">
          <PanelButton
            kind="danger"
            label="Reset to Factory Defaults"
            onActivate={() => setConfirmingReset(true)}
          />
        </div>
      </ScrollPane>

      {confirmingReset && (
        <ConfirmReset
          onExport={exportEverything}
          onConfirm={resetEverything}
          onCancel={() => setConfirmingReset(false)}
        />
      )}
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
