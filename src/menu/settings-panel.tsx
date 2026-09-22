// Menu → Settings. Dwell times, volume, speed and voice.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { linkAccount } from '../voice/elevenlabs'
import { checkReplyKey } from '../listen/suggest'
import { hasTranslateKey } from '../translate/client'
import { needsTranslation } from '../core/translation'
import type { SyncControl } from '../sync/use-sync'
import { VoicePicker } from '../voice/picker'
import { LanguagePicker } from '../voice/language-picker'
import { clearAudioCache } from '../voice/audio-cache'
import { type AliasStore } from '../core/phrases'
import { buildBackup } from '../core/backup'
import { type ElevenLabsAccount, type PhraseStore } from '../core/store'
import { useSettings } from '../ui/settings'
import {
  DEFAULT_SETTINGS,
  REPLY_MODELS,
  chooseLanguage,
  chooseVoice,
  factoryReset,
  replyModelName,
} from '../core/store'
import {
  DwellInput,
  PanelButton,
  PickerModal,
  PickerTile,
  PickerTrigger,
  ScrollPane,
  SettingRow,
  SettingSpinner,
} from '../ui/controls'
import { seconds } from '../ui/units'
import { usePendingChoice } from '../ui/pending-choice'
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
function ConfirmReset({
  onExport,
  onConfirm,
  onCancel,
}: {
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
          Every phrase you wrote, every one you reworded or removed, your categories, your emergency bar, your
          details, what you have said, your settings and any linked voice account will go back to how Peri arrived.{' '}
          <strong>This cannot be undone.</strong> You stay signed in.
        </p>
        {/* Said after the fact rather than before it, because "saved" is a claim
            only the browser can settle — a blocked download that looked like a
            save would be the worst possible moment to be wrong. */}
        {saved && <p className="confirm-note confirm-ok">Saved as {saved}. Keep it somewhere safe.</p>}
        {failed && (
          <p className="confirm-note confirm-warn">
            Peri could not save the file. Cancel and use <strong>Backup &amp; sharing</strong>, which can copy it
            instead.
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
 * The language the board is spoken in, and the disclosure that comes with it.
 *
 * The choosing itself is `LanguagePicker`, beside the voice one it is now half
 * of — the topbar offers the same pair on a wide screen, and two copies of a
 * language list would be two chances to disagree about what the board speaks.
 */
function LanguageRow() {
  const { settings, update } = useSettings()

  /**
   * What choosing a language means for the words.
   *
   * It sat on a row of its own while the key was the user's to supply. There is
   * no key to supply now, so it belongs on the control that starts the sending
   * — and it says the shape of it rather than the mechanism: what never leaves,
   * what does, once each, and that the emergency bar still never waits.
   *
   * The second case is a build with no key in it. That is invisible from the
   * board — phrases somebody wrote are simply spoken in English — so it is said
   * here rather than left to be discovered mid-sentence.
   */
  const note = !needsTranslation(settings.language)
    ? undefined
    : hasTranslateKey()
      ? 'The phrases Peri ships are translated already and never leave this device. Phrases you wrote yourself are sent to Google to be translated, once each, and kept here afterwards. The emergency bar never waits for a translation.'
      : 'The phrases Peri ships are translated already. This build carries no translation key, so phrases you wrote yourself are spoken as you wrote them.'

  return (
    <SettingRow label="Spoken language" note={note}>
      <LanguagePicker
        value={settings.language}
        onChange={(tag, voices) => update(chooseLanguage(settings, tag, voices))}
      />
    </SettingRow>
  )
}

function VoiceRow() {
  const { settings, update } = useSettings()
  return (
    <SettingRow label="Voice">
      <VoicePicker
        value={settings.voiceURI}
        onChange={voiceURI => update(chooseVoice(settings, voiceURI))}
        defaultLabel="Default"
      />
    </SettingRow>
  )
}

export function SettingsPanel({
  store,
  aliases,
  categoryById,
  sync,
  account,
  onAccountChange,
  replyKey,
  onReplyKeyChange,
  onForgetConversation,
}: {
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
  /** The key behind a suggested reply, held by the screen because sync sends it. */
  replyKey: string
  onReplyKeyChange: (next: string) => void
  /**
   * Forget today's questions, the answers chosen, and the answers on the board.
   * The screen's to do rather than this row's, since the answers on the board
   * are held there and a row that emptied storage alone would leave them up.
   */
  onForgetConversation: () => void
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
            format={seconds}
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
            format={seconds}
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
            format={seconds}
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
        {/* Off until somebody asks for it: it is the only way to type at all on
            iOS, where a dwell raises no system keyboard, and it is a target in
            the way on a device that has a real one. */}
        <SettingRow
          label="Peri's keyboard"
          note={
            settings.keyboard
              ? 'A keyboard button sits beside the menu, and opens four rows of keys that type into whatever has the caret.'
              : 'Adds a keyboard button beside the menu. Turn it on where nothing else can type — on an iPad or iPhone a dwell raises no keyboard of its own, and this is the only way to write a phrase, a name or a key.'
          }
        >
          <PanelButton
            kind={settings.keyboard ? 'plain' : 'primary'}
            label={settings.keyboard ? 'Take it away' : 'Offer it'}
            onActivate={() => update({ keyboard: !settings.keyboard })}
          />
        </SettingRow>
        <LanguageRow />
        <VoiceRow />
        <SyncRow sync={sync} />
        <ElevenLabsRow account={account} onChange={onAccountChange} />
        <SuggestedRepliesRow value={replyKey} onChange={onReplyKeyChange} onForget={onForgetConversation} />

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
function SecretButton({
  label,
  pressed,
  disabled,
  onActivate,
  children,
}: {
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
function SecretField({
  value,
  name,
  label,
  placeholder,
  onChange,
  onEnter,
}: {
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
      {/* Takes the caret by dwell like every other field here. It did not, and
          that made this the one row in Settings nobody driving the board by gaze
          could fill in: Peri's own keyboard types into whatever field has the
          caret, and nothing but a click could give it to this one. The row that
          sets up the account a voice is paid from, the one that answers a
          question, and the lock on the board were all a carer's job. */}
      <DwellInput
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
            <span className="sync-status">{sync.code && <span className="sync-code">Code {sync.code}</span>}</span>
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

        <p
          className={sync.status === 'error' || sync.status === 'locked' ? 'eleven-error' : 'eleven-note'}
          role={sync.status === 'error' || sync.status === 'locked' ? 'alert' : undefined}
        >
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
            <PanelButton
              kind="danger"
              label="Stop and erase the copy"
              onActivate={() => setConfirmingForget(true)}
            />
          </div>
        )}

        <p className="eleven-note">
          {sync.status === 'choose'
            ? "Keeping this device's board replaces the synchronized one on every other device. Using the synchronized board replaces what is on this device. Nothing has changed yet."
            : sync.enabled
              ? 'Every device signed in to this account and given the same passphrase keeps the same board. The last change wins, so editing on two devices at once loses the earlier edit. Audio from a linked ElevenLabs account waits there too, so a phrase paid for here is not paid for again elsewhere; erasing the copy takes it as well. Everything on the server is encrypted before it leaves this device and cannot be read without the passphrase — which nobody can reset for you.'
              : 'Optional. Keeps your phrases, categories and settings the same on every device you sign in to — apart from text size and volume, which stay as you set them on each one. It also keeps the audio a linked ElevenLabs account has made, so no phrase is paid for twice. The copy is encrypted here first, so the passphrase is the only thing that can open it — write it down somewhere safe.'}
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
          This device keeps its board and its audio. The encrypted copy on the server is erased, along with every
          clip of ElevenLabs audio kept beside it, and any other device still synchronizing will put its own copy
          back up the next time it looks.
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
function ElevenLabsRow({
  account,
  onChange,
}: {
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
        {error && (
          <p className="eleven-error" role="alert">
            {error}
          </p>
        )}
        <p className="eleven-note">
          {account
            ? 'These voices need the internet and use your ElevenLabs credits. A phrase is paid for once: Peri keeps the audio, and with Synchronize on your other devices use the same clip rather than buying their own. Peri falls back to the device voice if one cannot be fetched, and the emergency bar always uses the device voice.'
            : 'Optional. Adds the voices from your ElevenLabs account. The key is never put in a backup file — but with Synchronize on it does travel, encrypted, to your own devices, and so does the audio it pays for.'}
        </p>
      </div>
    </div>
  )
}

// ── ProfilePanel ──────────────────────────────────────────────────────────────
// Supplies the values behind {contact} and {name.nickname}. Typed rather than
// dwelled: it is one-off setup, usually done by whoever sets the device up.

/**
 * The key behind a suggested reply.
 *
 * **Theirs, like the ElevenLabs key and unlike the translation key**, and the
 * difference is not a preference. A Google key can be pinned to one site by
 * referrer, so Peri's own can be inlined into the bundle and what a lifted one
 * costs is quota. Nothing restricts an Anthropic key that way: one shipped in
 * this bundle would be one anybody could lift and spend without limit. So it is
 * set up here, and it bills the person who chose the feature.
 *
 * Typed rather than dwelled, like the rest of the one-off setup. Hidden once it
 * is set, with the eye and the copy beside it, because the second device needs
 * the same one and this panel spans the viewport in rooms with other people in
 * them.
 */
function SuggestedRepliesRow({
  value,
  onChange,
  onForget,
}: {
  value: string
  onChange: (next: string) => void
  onForget: () => void
}) {
  const { settings, update } = useSettings()
  const [typed, setTyped] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forgotten, setForgotten] = useState(false)
  // Marked on a rest, written on Done — see `usePendingChoice`.
  const chooseModel = useCallback((replyModel: string) => update({ replyModel }), [update])
  const model = usePendingChoice(settings.replyModel, chooseModel)

  /**
   * Saved only once Anthropic has taken it, the way an ElevenLabs key is linked
   * — a key saved unchecked opens the question box to a key that has never
   * worked, and the first anybody hears of it is with a person waiting.
   */
  const save = useCallback(() => {
    const key = typed.trim()
    if (!key || checking) return
    setChecking(true)
    setError(null)
    void checkReplyKey(key).then(result => {
      setChecking(false)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setTyped('')
      onChange(key)
    })
  }, [typed, checking, onChange])

  return (
    <div className="setting-row eleven-row">
      <span className="setting-label">Suggested answers</span>
      <div className="setting-control eleven-control">
        {value ? (
          <>
            <span className="eleven-status">Set up</span>
            <PanelButton kind="danger" label="Remove" onActivate={() => onChange('')} />
            <SecretField value={value} name="the API key" label="Suggested answers API key" />

            {/* Only with a key, because without one it would set nothing. A full
                screen of tiles rather than a list that drops down, for the
                reason every choice in this app is one: an operating system draws
                a native list outside the page, where nothing can be hovered and
                so nothing can be dwelled. */}
            <PickerTrigger
              className="reply-model-trigger"
              label={replyModelName(settings.replyModel)}
              name={`Model for suggested replies: ${replyModelName(settings.replyModel)}. Choose another`}
              open={model.open}
              onOpen={model.begin}
            />

            {/* Housekeeping rather than something wanted mid-conversation, so it
                is here and not on the board. It goes on its own anyway after a
                day; this is for the person who wants it gone now. */}
            <PanelButton
              kind="plain"
              label={forgotten ? 'Conversation forgotten' : "Forget today's conversation"}
              onActivate={() => {
                onForget()
                setForgotten(true)
              }}
              disabled={forgotten}
            />
          </>
        ) : (
          <>
            <SecretField
              value={typed}
              name="the API key"
              label="Suggested answers API key"
              placeholder="Paste your Anthropic API key"
              onChange={setTyped}
              onEnter={save}
            />
            <PanelButton
              kind="primary"
              label={checking ? 'Checking…' : 'Save'}
              onActivate={save}
              disabled={checking || typed.trim() === ''}
            />
          </>
        )}
        {error && !value && (
          <p className="eleven-error" role="alert">
            {error}
          </p>
        )}
        <p className="eleven-note">
          {value
            ? "Listen mode can offer up to twenty answers to a question it heard, on the board under a tab called Answers. The question is sent to Anthropic on your own account and your own credits, with the phrases on your board so the answers can be your own words, and where an answer needs looking up it is searched for on the web as well. Today's questions and the answers you chose are kept on this device so a conversation carries on making sense, and so are the last answers offered, so they are still there if Peri is reopened; only the ones you chose are ever sent. All of it is forgotten after a day. An answer that takes more than three seconds is covered by a short apology said out loud, so nobody is left in silence; those are asked for a few at a time, with nothing of yours in the request, and are not kept as something you said. Resting on an answer puts it in the message box — Peri never speaks one for you."
            : 'Optional. Lets listen mode offer answers to a question it heard, on the board to choose between, using your own Anthropic account. The question goes with the phrases on your board, so the answers can be your own words, and questions that need looking up are searched for on the web. Saving the key checks it with Anthropic first. The key is never put in a backup file — but with Synchronize on it does travel, encrypted, to your own devices.'}
        </p>
      </div>

      {model.open && (
        <PickerModal
          title="Model for suggested replies"
          hint="Quicker, or better at reading a question. Somebody is waiting in front of you, so the quickest is the default."
          onDone={model.done}
          onCancel={model.cancel}
        >
          {REPLY_MODELS.map(m => (
            <PickerTile
              key={m.id}
              name={m.name}
              detail={m.detail}
              selected={m.id === model.pending}
              onSelect={() => model.mark(m.id)}
            />
          ))}
        </PickerModal>
      )}
    </div>
  )
}
