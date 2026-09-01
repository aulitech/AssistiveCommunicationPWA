
// Menu → Settings. Dwell times, volume, speed and voice.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { linkAccount } from '../voice/elevenlabs'
import { checkKey } from '../translate/client'
import { VARIETIES, needsTranslation, varietyLabel } from '../core/translation'
import type { SyncControl } from '../sync/use-sync'
import { VoicePicker } from '../voice/picker'
import { subscribeVoices } from '../voice/speech'
import { languageName, speechLanguages } from '../voice/groups'
import { clearAudioCache } from '../voice/audio-cache'
import { type AliasStore } from '../core/phrases'
import { buildBackup } from '../core/backup'
import { type ElevenLabsAccount, type PhraseStore } from '../core/store'
import { useSettings } from '../ui/settings'
import { DEFAULT_SETTINGS, factoryReset, loadDeepLKey, saveDeepLKey } from '../core/store'
import { PanelButton, PickerModal, PickerTile, PickerTrigger, ScrollPane, SettingRow, SettingSpinner } from '../ui/controls'
import { useDwellControl } from '../ui/dwell'
import { CopyIcon, EyeIcon, EyeOffIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
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

/**
 * The language the board is spoken in.
 *
 * A full-screen grid rather than a `<select>`, for the reason every other
 * choice in this app is one: an operating system draws a native list outside
 * the page, where nothing can be hovered and so nothing can be dwelled on.
 *
 * The languages offered are the ones this device has voices for. Offering one
 * it cannot speak would be offering silence.
 */
function LanguageRow() {
  const { settings, update } = useSettings()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => subscribeVoices(setVoices), [])

  /**
   * What the device can speak, and what Peri can translate into.
   *
   * The rule was once "only languages this device has voices for", on the
   * grounds that offering one it cannot speak is offering silence. That is true
   * of a language with nothing behind it and false of one Peri ships a table
   * for: no device has a Puerto Rican or a Patois voice, and both of those are
   * the point. A variety Peri knows leads the list, since a device offering
   * sixty voices offers none of these.
   */
  const languages = useMemo(() => {
    const own = VARIETIES.map(v => ({ tag: v.tag, label: v.label, count: 0 }))
    const device = speechLanguages(voices).filter(l => !own.some(o => o.tag === l.tag))
    return [...own, ...device]
  }, [voices])
  const chosen = languages.find(l => l.tag === settings.language)
  // A language set on another device may have no voices here. Naming it anyway
  // is the honest answer — it is still what the board is set to speak.
  const label = settings.language
    ? (chosen?.label ?? varietyLabel(settings.language) ?? languageName(settings.language))
    : 'Device default'

  const choose = (tag: string) => {
    // A voice is a language. Leaving an English voice selected under a board
    // set to speak French would make the setting look broken, so a device voice
    // that does not match is let go of — the browser then picks one in the
    // chosen language. An ElevenLabs voice is left alone: it has no language of
    // its own and speaks whatever it is given.
    const voice = voices.find(v => v.voiceURI === settings.voiceURI)
    const mismatched = Boolean(tag && voice && voice.lang !== tag)
    update({ language: tag, ...(mismatched ? { voiceURI: '' } : {}) })
    setOpen(false)
  }

  return (
    <SettingRow label="Spoken language">
      <PickerTrigger
        label={label}
        name={`Spoken language: ${label}. Choose another`}
        onOpen={() => setOpen(true)}
        open={open}
      />
      {open && (
        <PickerModal
          title="Choose a spoken language"
          hint="The languages this device has voices for"
          onDone={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        >
          <PickerTile
            name="Device default"
            detail="Whatever this device speaks"
            selected={settings.language === ''}
            onSelect={() => choose('')}
          />
          {languages.map(l => (
            <PickerTile
              key={l.tag}
              name={l.label}
              detail={
                l.count === 0
                  ? 'Peri translates it · no voice on this device'
                  : `${l.tag} · ${l.count} ${l.count === 1 ? 'voice' : 'voices'}`
              }
              selected={settings.language === l.tag}
              onSelect={() => choose(l.tag)}
            />
          ))}
        </PickerModal>
      )}
    </SettingRow>
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

export function SettingsPanel({ store, aliases, categoryById, sync, account, onAccountChange }: {
  /** Only so the reset confirmation can offer a backup before it wipes them. */
  store: PhraseStore
  aliases: AliasStore
  categoryById: Map<string, string>
  sync: SyncControl
  /**
   * Held in `talk` rather than here, because it is part of what synchronizing
   * sends — and a row holding its own copy would go stale the moment a board
   * arrived from another device carrying a different account.
   */
  account: ElevenLabsAccount | null
  onAccountChange: (next: ElevenLabsAccount | null) => void
}) {
  const { settings, update } = useSettings()
  const [confirmingReset, setConfirmingReset] = useState(false)

  const exportEverything = useCallback(
    () => downloadBackup(buildBackup({ store, aliases, settings, categoryById })),
    [store, aliases, settings, categoryById],
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

  return (
    <div className="settings-panel">
      <ScrollPane className="settings-scroller" paneClassName="settings-body" step={100}>
        {/* First, because it is the setting somebody needs before they can read
            any of the others — including this panel. It is also the one that
            re-lays the panel out as it changes, and the top row is where that
            moves its own controls least. */}
        <SettingRow label="Text size">
          <SettingSpinner
            value={Math.round(settings.zoom * 100)}
            defaultValue={DEFAULT_SETTINGS.zoom * 100}
            name="text size"
            min={50}
            max={200}
            step={10}
            format={v => `${v}%`}
            onValue={v => update({ zoom: v / 100 })}
          />
        </SettingRow>
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
        <LanguageRow />
        <VoiceRow />
        <SyncRow sync={sync} />
        <ElevenLabsRow account={account} onChange={onAccountChange} />
        <TranslationRow />

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
 * One of the two controls beside a hidden value: reveal it, or copy it.
 *
 * An icon rather than a word, because the field beside them is the widest thing
 * in the panel and two labelled buttons pushed it down to nothing on a phone.
 * **The name is still on the button** — an icon says nothing aloud, and these
 * are the two controls in the app where getting the wrong one means either
 * putting a credential on a shared screen or not copying it at all.
 */
function SecretButton({ label, pressed, disabled, onActivate, children }: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onActivate: () => void
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate, { disabled })
  return (
    <div
      className={cx('secret-btn', active && 'dwelling', pressed && 'is-on', disabled && 'is-disabled')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
      {children}
    </div>
  )
}

/**
 * A value that is typed once and needed again later: the Synchronize passphrase,
 * the ElevenLabs key.
 *
 * **Hidden by default, and copyable without ever being shown** — which is the
 * usual case, because a passphrase is wanted on the *other* device rather than
 * on this one. Showing it is a deliberate second act: this panel spans the whole
 * screen, and these are set up in rooms with other people in them.
 *
 * It does not hide itself again after a moment. Somebody reading a passphrase
 * out to whoever is holding the second device needs it to stay there, and a
 * field that blanks mid-sentence is a field they have to start again with.
 */
function SecretField({ value, name, label, placeholder, onChange, onEnter }: {
  value: string
  /** What it is, in the words the buttons use: "the passphrase". */
  name: string
  /** The field's own accessible name, which is a thing rather than a phrase. */
  label: string
  placeholder?: string
  /** Absent for a value already stored, which is read rather than written. */
  onChange?: (next: string) => void
  onEnter?: () => void
}) {
  const [shown, setShown] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(value)
      .then(() => setSaid(`Copied ${name}`))
      // Reading and writing the clipboard both need permission, and a dwell is a
      // timer with no key press in it — so this is refused often enough to be
      // worth a sentence rather than a silence.
      .catch(() => setSaid(`Peri could not reach the clipboard. Show ${name} and copy it by hand.`))
  }, [value, name])

  return (
    <div className="secret-field">
      <input
        className="profile-input secret-input"
        type={shown ? 'text' : 'password'}
        value={value}
        readOnly={!onChange}
        onChange={e => onChange?.(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault()
            onEnter()
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
      />
      <SecretButton
        label={shown ? `Hide ${name}` : `Show ${name}`}
        pressed={shown}
        onActivate={() => setShown(v => !v)}
        disabled={value === ''}
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </SecretButton>
      <SecretButton label={`Copy ${name}`} onActivate={copy} disabled={value === ''}>
        <CopyIcon />
      </SecretButton>
      {said && (
        <p className="eleven-note secret-said" role="status">
          {said}
        </p>
      )}
    </div>
  )
}

/**
 * Synchronizing this board with the other devices signed in to the same account.
 *
 * Off until somebody asks for it, and it asks for a passphrase before it will
 * start. That is not a login — there is no account on the server and nothing to
 * log in to. The passphrase is the key the board is locked with **and** the
 * address it is stored under, so a server holding it holds ciphertext at a
 * location it cannot connect to anybody. See `core/crypto`.
 *
 * The consequence somebody has to be told about, and the reason for the code:
 * a passphrase typed differently on the second device is not an error, it is a
 * different board. Nothing arrives, nothing is lost, and it looks exactly like
 * sync being broken. Two devices showing the same six characters agree.
 */
function SyncRow({ sync }: { sync: SyncControl }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmingForget, setConfirmingForget] = useState(false)

  const turnOn = useCallback(() => {
    sync.enable(passphrase)
    setPassphrase('')
  }, [sync, passphrase])

  const said = () => {
    // Before anything else: with no account there is nothing to synchronize
    // *with*, whether or not the setting has been turned on. The field beside
    // this is disabled for the same reason, and a disabled control that explains
    // nothing is a control that reads as broken.
    if (!sync.available) {
      return 'Sign in with Google, Apple or Facebook to synchronize. A guest is only ever this device.'
    }
    switch (sync.status) {
      case 'unavailable':
        return 'Sign in with Google, Apple or Facebook to synchronize. A guest is only ever this device.'
      case 'working':
        return 'Synchronizing…'
      case 'synced':
        return sync.lastSyncedAt
          ? `Up to date · last synchronized at ${new Date(sync.lastSyncedAt).toLocaleTimeString()}${
            sync.lastFrom ? ` · last change from device ${sync.lastFrom}` : ''
          }`
          : 'Up to date'
      case 'choose':
        return 'This account already has a board, and so does this device. Only one of them can be kept.'
      case 'locked':
      case 'error':
        return sync.error ?? 'Not synchronizing'
      default:
        return 'Off. This board stays on this device.'
    }
  }

  return (
    <div className="setting-row sync-row">
      <span className="setting-label">Synchronize</span>
      <div className="setting-control sync-control">
        {sync.enabled ? (
          <>
            <span className="sync-status">
              {sync.code && <span className="sync-code">Code {sync.code}</span>}
            </span>
            {/* The passphrase is wanted on the second device, and nobody can
                work it out from anything else — so it can be read back off the
                device that has it. */}
            <SecretField value={sync.passphrase} name="the passphrase" label="Synchronize passphrase" />
          </>
        ) : (
          <>
            <SecretField
              value={passphrase}
              name="the passphrase"
              label="Synchronize passphrase"
              placeholder="Choose a passphrase"
              onChange={setPassphrase}
              onEnter={() => passphrase.trim() && turnOn()}
            />
            <PanelButton
              kind="primary"
              label="Start"
              onActivate={turnOn}
              disabled={!sync.available || passphrase.trim() === ''}
            />
          </>
        )}

        <p className={sync.status === 'error' || sync.status === 'locked' ? 'eleven-error' : 'eleven-note'} role={sync.status === 'error' || sync.status === 'locked' ? 'alert' : undefined}>
          {said()}
        </p>

        {/* The one moment sync will not decide by itself. Both boards cannot be
            kept, and quietly choosing either is a way to lose somebody's
            phrases — so it is put in front of them, in their words, and nothing
            happens until one is chosen. */}
        {sync.status === 'choose' && (
          <div className="sync-actions">
            <PanelButton kind="primary" label="Keep this device's board" onActivate={sync.keepMine} />
            <PanelButton kind="plain" label="Use the synchronized board" onActivate={sync.takeTheirs} />
            {/* A way out of the question. Without it, the only way past a
                question somebody does not want to answer is to leave the panel,
                and it is waiting again the next time they open it. */}
            <PanelButton kind="danger" label="Stop" onActivate={sync.disable} />
          </div>
        )}

        {/* The two that stop it, side by side and in that order: this device,
            then this device and the copy every other one is reading. Graded, so
            the larger of the two is never the one nearer to hand. */}
        {sync.enabled && sync.status !== 'choose' && (
          <div className="sync-actions">
            <PanelButton kind="plain" label="Synchronize now" onActivate={sync.syncNow} />
            <PanelButton kind="danger" label="Stop" onActivate={sync.disable} />
            <PanelButton kind="danger" label="Stop and erase the copy" onActivate={() => setConfirmingForget(true)} />
          </div>
        )}

        <p className="eleven-note">
          {sync.status === 'choose'
            ? 'Keeping this device\'s board replaces the synchronized one on every other device. Using the synchronized board replaces what is on this device. Nothing has changed yet.'
            : sync.enabled
            ? 'Every device signed in to this account and given the same passphrase keeps the same board. The last change wins, so editing on two devices at once loses the earlier edit. The copy on the server is encrypted before it leaves this device and cannot be read without the passphrase — which nobody can reset for you.'
            : 'Optional. Keeps your phrases, categories and settings the same on every device you sign in to — apart from text size and volume, which stay as you set them on each one. The copy is encrypted here first, so the passphrase is the only thing that can open it — write it down somewhere safe.'}
        </p>
      </div>

      {confirmingForget && (
        <ConfirmForgetSync
          onConfirm={() => {
            setConfirmingForget(false)
            sync.forget()
          }}
          onCancel={() => setConfirmingForget(false)}
        />
      )}
    </div>
  )
}

/**
 * In front of erasing the synchronized copy, and portalled for the reason every
 * other confirmation here is: a pointer rests where it last fired, so a "yes"
 * drawn under the button that asked would be answered by the pointer already
 * sitting on it.
 */
function ConfirmForgetSync({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return createPortal(
    <div className="confirm-scrim">
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label="Stop synchronizing">
        <h3 className="confirm-title">Stop synchronizing?</h3>
        <p className="confirm-text">
          This device keeps its board. The encrypted copy on the server is erased, and any other device still
          synchronizing will put its own copy back up the next time it looks.
        </p>
        <div className="confirm-actions">
          <PanelButton kind="plain" label="Cancel" onActivate={onCancel} />
          <PanelButton kind="danger" label="Stop and erase" onActivate={onConfirm} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Linking an account. Typed rather than dwelled, like the rest of the one-off
 * setup — an API key is forty characters of noise, and whoever is pasting it is
 * at a keyboard.
 */
/**
 * The translation key, for the half of a board Peri ships no translation for.
 *
 * The phrases Peri comes with are translated ahead of time and work offline and
 * instantly. What this is for is everything else: a phrase somebody wrote
 * themselves, one with a blank filled in, and a message composed out of
 * several. Without it those are spoken as they were written — which the note
 * below says out loud, because a board that quietly stops translating halfway
 * is worse than one that never started.
 */
function TranslationRow() {
  const { settings } = useSettings()
  const [key, setKey] = useState(loadDeepLKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linked, setLinked] = useState(() => loadDeepLKey() !== '')

  const link = useCallback(() => {
    setBusy(true)
    setError(null)
    checkKey(key.trim()).then(result => {
      setBusy(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      saveDeepLKey(key.trim())
      setLinked(true)
    })
  }, [key])

  const unlink = useCallback(() => {
    setError(null)
    saveDeepLKey('')
    setKey('')
    setLinked(false)
  }, [])

  return (
    <div className="setting-row eleven-row">
      <span className="setting-label">Translation</span>
      <div className="setting-control eleven-control">
        {linked ? (
          <>
            <span className="eleven-status">Linked</span>
            <PanelButton kind="danger" label="Unlink" onActivate={unlink} />
            <SecretField value={key} name="the translation key" label="DeepL API key" />
          </>
        ) : (
          <>
            <SecretField
              value={key}
              name="the translation key"
              label="DeepL API key"
              placeholder="Paste your DeepL key"
              onChange={setKey}
              onEnter={link}
            />
            <PanelButton
              kind="primary"
              label={busy ? 'Checking…' : 'Link'}
              onActivate={link}
              disabled={busy || key.trim() === ''}
            />
          </>
        )}
        {error && <p className="eleven-error" role="alert">{error}</p>}
        <p className="eleven-note">
          {!needsTranslation(settings.language)
            ? 'Only used when the board is set to speak a language it is not written in.'
            : linked
              ? 'Your own phrases are sent to DeepL to be translated, once each, and kept on this device afterwards. The phrases Peri ships are translated already and never leave. The emergency bar never waits for a translation.'
              : 'Optional. The phrases Peri ships are already translated; without a key, phrases you wrote yourself are spoken as they were written. The key is never put in a backup file.'}
        </p>
      </div>
    </div>
  )
}

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
            {/* Readable again for the reason the passphrase is: the key is
                wanted on the next device, and ElevenLabs shows it once. */}
            <SecretField value={account.apiKey} name="the API key" label="ElevenLabs API key" />
          </>
        ) : (
          <>
            <SecretField
              value={key}
              name="the API key"
              label="ElevenLabs API key"
              placeholder="Paste your API key"
              onChange={setKey}
              onEnter={link}
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
            : 'Optional. Adds the voices from your ElevenLabs account. The key is never put in a backup file — but with Synchronize on it does travel, encrypted, to your own devices.'}
        </p>
      </div>
    </div>
  )
}

// ── ProfilePanel ──────────────────────────────────────────────────────────────
// Supplies the values behind {contact} and {name.nickname}. Typed rather than
// dwelled: it is one-off setup, usually done by whoever sets the device up.
