// The panel that slides down from the top, and everything reached from it.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDwellControl, holdDwells } from '../ui/dwell'
import { type AliasStore, type Phrase } from '../core/phrases'
import { useSettings } from '../ui/settings'
import { type PhraseStore, type User } from '../core/store'
import { type AppState } from '../core/backup'
import { APP_VERSION } from '../core/version'
import { cx, dwellVar } from '../ui/style'
import { NavItem, PanelButton } from '../ui/controls'
import { SettingsPanel } from './settings-panel'
import { AliasesPanel } from './aliases-panel'
import type { SyncControl } from '../sync/use-sync'
import type { ElevenLabsAccount } from '../core/store'
import { BackupPanel } from './backup-panel'
import { HelpPanel } from './help-panel'
import {
  AliasesIcon,
  BackIcon,
  BackupIcon,
  HelpIcon,
  SettingsIcon,
  SignOutIcon,
  SpeakingTabIcon,
} from '../ui/icons'
import { SPEAKING_PATH, SPEAKING_WINDOW } from '../voice/relay'

/**
 * The way out of a panel, in the top right corner of every one of them.
 *
 * Above the panel's content rather than below it, so it holds still: the panels
 * are different heights, and one that follows the content moves whenever the
 * content does — a target that has to be re-found each time is a poor one for
 * anybody aiming by gaze.
 */
/**
 * Back, in the same corner of every panel, and **the app goes deaf for a moment
 * when it fires**.
 *
 * It is the one control that replaces the whole screen: the panel it is in goes
 * away and a different set of controls arrives under a pointer that has not
 * moved. The menu already guards its own items against reopening — this is the
 * other way out, the one that lands on the board, where what is underneath is a
 * phrase that would be spoken.
 */
function PanelBack({ onSelect }: { onSelect: () => void }) {
  const { settings } = useSettings()
  const back = useCallback(() => {
    holdDwells()
    onSelect()
  }, [onSelect])
  const { active, props } = useDwellControl(settings.actionDwellMs, back)
  return (
    <div
      className={cx('panel-back', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label="Back"
      {...props}
    >
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
      <BackIcon />
      Back
    </div>
  )
}

/**
 * Signing out is one dwell away from every other thing in this menu, and it is
 * the one that empties the screen. So it asks first.
 *
 * The confirmation is a dialog in the middle of the screen rather than a second
 * state on the nav item: a pointer rests where it last fired, and a "yes" that
 * appeared under it would be answered by the pointer already sitting there.
 *
 * It also says what signing out does not do. Somebody whose board is how they
 * speak has every reason to think a button called Sign out might take it away.
 * And what it does not protect: a guest's board is open to the next guest.
 */
function ConfirmSignOut({
  user,
  onConfirm,
  onCancel,
}: {
  user: User
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div className="confirm-scrim">
      <div className="confirm-modal" role="alertdialog" aria-modal="true" aria-label="Sign out">
        <span className="confirm-title">Sign out{user.email ? ` of ${user.email}` : ''}?</span>
        <p className="confirm-note">
          {user.provider === 'guest'
            ? 'Your phrases, your details and your settings stay on this device, for whoever continues as a guest. An account you sign in with has a board of its own.'
            : 'Your phrases, your details and your settings stay on this device, where only this account can open them. Signing back in brings you straight back to them.'}
        </p>
        <div className="confirm-actions">
          <PanelButton kind="plain" label="Stay signed in" onActivate={onCancel} />
          <PanelButton kind="danger" label="Sign out" onActivate={onConfirm} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

type PanelView = 'menu' | 'settings' | 'aliases' | 'backup' | 'help'

/** The panels that fill the screen rather than hanging from the top of it. */
const TALL_VIEWS: PanelView[] = ['settings', 'backup', 'help']

/**
 * How long the menu is deaf to a dwell after one of its items closes.
 *
 * A pointer rests where it last fired. Whatever was dwelled to leave a panel —
 * Back, or the Stay signed in of the sign-out dialog — is somewhere over the
 * menu that has just come back, and a nav item arriving under a pointer already
 * sitting still is a nav item about to open on its own. The same reasoning that
 * puts the sign-out confirmation in the middle of the screen rather than under
 * the item that raised it, applied to the one case that cannot be moved out of
 * the way: the menu itself.
 */
const REOPEN_GUARD_MS = 1000

export function TopPanel({
  open,
  user,
  onClose,
  onSignOut,
  aliases,
  onAliasesChange,
  store,
  phrases,
  categories,
  onRestore,
  sync,
  account,
  onAccountChange,
  replyKey,
  onReplyKeyChange,
  onForgetConversation,
  onOpenIntroduction,
}: {
  open: boolean
  user: User
  onClose: () => void
  onSignOut: () => void
  aliases: AliasStore
  onAliasesChange: (next: AliasStore) => void
  store: PhraseStore
  /** Every phrase on the board, for a spreadsheet of it. */
  phrases: Phrase[]
  categories: string[]
  onRestore: (next: AppState, message: string) => void
  /** Driven in `talk`, where the board it synchronizes lives. */
  sync: SyncControl
  /** Held in `talk` too: it is part of what synchronizing sends. */
  account: ElevenLabsAccount | null
  onAccountChange: (next: ElevenLabsAccount | null) => void
  /** The key behind a suggested reply, which the screen holds because sync sends it. */
  replyKey: string
  onReplyKeyChange: (next: string) => void
  /** Today's questions and the answers on the board, which the screen holds too. */
  onForgetConversation: () => void
  /** Opens Getting started, which stands where the board is — so the screen does it. */
  onOpenIntroduction: () => void
}) {
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

  const handleSignOut = useCallback(() => {
    setConfirmingSignOut(false)
    onClose()
    onSignOut()
  }, [onClose, onSignOut])
  const [view, setView] = useState<PanelView>('menu')

  /**
   * **The speaking tab** — the last thing said, for sharing into a call instead
   * of the board; see `voice/relay.ts`. Not a panel: it opens a tab of its own,
   * and the menu closes behind it, since the board is what somebody comes back
   * to. **Opened by a click, not by a rest** — a browser opens a tab only in
   * answer to a real click or tap, and the timer a rest fires from is neither —
   * so a rest that is refused leaves the menu open and says so where the item
   * says what it is, with the address. Opened under one name, so opening it
   * again finds the tab already open.
   */
  const [speakingRefused, setSpeakingRefused] = useState(false)
  const openSpeakingTab = useCallback(() => {
    if (window.open(SPEAKING_PATH, SPEAKING_WINDOW)) onClose()
    else setSpeakingRefused(true)
  }, [onClose])

  // Coming back to the menu from anything opened out of it. The guard runs from
  // the moment it is set, and the effect below is what takes it off again.
  const [guarded, setGuarded] = useState(false)
  const backToMenu = useCallback(() => {
    setView('menu')
    setConfirmingSignOut(false)
    setGuarded(true)
  }, [])

  useEffect(() => {
    if (!guarded) return
    const timer = setTimeout(() => setGuarded(false), REOPEN_GUARD_MS)
    return () => clearTimeout(timer)
  }, [guarded])

  // Reset to the menu whenever the panel opens or closes, so it never reopens
  // mid-way into a sub-screen. Adjusting during render rather than in an effect
  // avoids a second render pass with the stale view still on screen.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    setView('menu')
    setSpeakingRefused(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {/* Dark, and it swallows pointer events so nothing behind it can be
          dwelled by mistake — but it is not a way out. Moving across it used to
          close the panel after 600ms, which meant a pointer wandering on its way
          to the menu took the menu away again. The way out is the Back button,
          which is in the same corner of every panel including this one. */}
      <div className={cx('panel-scrim', open && 'open')} />

      {/* Settings, the guide and Backup & sharing take the whole screen; the
          menu itself and Aliases hang down only as far as their content. All
          three of those are scrolled whatever height they get, and a taller pane
          is fewer dwells on the scroll arrows. */}
      <div
        className={cx('top-panel', open && 'open', TALL_VIEWS.includes(view) && 'is-tall')}
        role="dialog"
        aria-label="Menu"
        aria-hidden={!open}
      >
        {/* User row: who, then which app and which release of it, then the way
            out. The name and the version are centred on the row, and stay put
            whichever panel is below it. */}
        <div className="panel-user-row">
          <div className="panel-user">
            <div className="panel-avatar" aria-hidden="true">
              {user.provider === 'google' && <span style={{ fontSize: '1.35rem' }}>G</span>}
              {user.provider === 'apple' && <span style={{ fontSize: '1.35rem' }}></span>}
              {user.provider === 'facebook' && <span style={{ fontSize: '1.35rem' }}>f</span>}
              {user.provider === 'guest' && <span style={{ fontSize: '1.35rem' }}>👤</span>}
            </div>
            <div className="panel-user-info">
              <span className="panel-user-name">{user.name}</span>
              {user.email && <span className="panel-user-email">{user.email}</span>}
            </div>
          </div>
          <div className="panel-title">
            <span className="panel-title-name">Peri</span>
            <span className="panel-version">{APP_VERSION}</span>
          </div>
          <PanelBack onSelect={view === 'menu' ? onClose : backToMenu} />
        </div>

        {view !== 'menu' ? (
          <>
            {view === 'settings' && (
              <SettingsPanel
                store={store}
                aliases={aliases}
                sync={sync}
                account={account}
                onAccountChange={onAccountChange}
                replyKey={replyKey}
                onReplyKeyChange={onReplyKeyChange}
                onForgetConversation={onForgetConversation}
                onOpenIntroduction={onOpenIntroduction}
              />
            )}
            {view === 'aliases' && <AliasesPanel aliases={aliases} onChange={onAliasesChange} />}
            {view === 'backup' && (
              <BackupPanel
                store={store}
                aliases={aliases}
                phrases={phrases}
                categories={categories}
                onRestore={onRestore}
              />
            )}
            {view === 'help' && <HelpPanel />}
          </>
        ) : (
          <nav className="panel-nav">
            <NavItem
              icon={<SettingsIcon />}
              label="Settings"
              sublabel="Dwell time, voice, volume, speed"
              disabled={guarded}
              onSelect={() => setView('settings')}
            />
            <NavItem
              icon={<AliasesIcon />}
              label="Aliases"
              sublabel="The words your phrases choose from"
              disabled={guarded}
              onSelect={() => setView('aliases')}
            />
            <NavItem
              icon={<BackupIcon />}
              label="Backup & sharing"
              sublabel="Save your phrases, or bring some in"
              disabled={guarded}
              onSelect={() => setView('backup')}
            />
            <NavItem
              icon={<SpeakingTabIcon />}
              label="Speaking tab"
              sublabel={
                speakingRefused
                  ? `A tab opens only for a click or a tap — or go to ${window.location.host}${SPEAKING_PATH}`
                  : 'Share what you say in a call, not the board'
              }
              disabled={guarded}
              onSelect={openSpeakingTab}
            />
            <NavItem
              icon={<HelpIcon />}
              label="Help"
              sublabel="How to use Peri"
              disabled={guarded}
              onSelect={() => setView('help')}
            />
            <NavItem
              icon={<SignOutIcon />}
              label="Sign out"
              sublabel={user.email || 'Guest session'}
              disabled={guarded}
              onSelect={() => setConfirmingSignOut(true)}
            />
          </nav>
        )}

        <div className="panel-handle" />
      </div>

      {confirmingSignOut && <ConfirmSignOut user={user} onConfirm={handleSignOut} onCancel={backToMenu} />}
    </>
  )
}
