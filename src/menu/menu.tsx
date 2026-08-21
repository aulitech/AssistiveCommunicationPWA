
// The panel that slides down from the top, and everything reached from it.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDwellControl, holdDwells } from '../ui/dwell'
import { type AliasStore } from '../core/phrases'
import { useSettings } from '../ui/settings'
import { type PhraseStore, type User } from '../core/store'
import { type AppState } from '../core/backup'
import { cx, dwellVar } from '../ui/style'
import { NavItem, PanelButton } from '../ui/controls'
import { SettingsPanel } from './settings-panel'
import { AliasesPanel } from './aliases-panel'
import type { SyncControl } from '../sync/use-sync'
import type { ElevenLabsAccount } from '../core/store'
import { BackupPanel } from './backup-panel'
import { HelpPanel } from './help-panel'

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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden="true">
        <polyline points="15 18 9 12 15 6" />
      </svg>
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
 */
function ConfirmSignOut({ user, onConfirm, onCancel }: {
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
          Your phrases, your details and your settings stay on this device. Signing back in brings
          you straight back to them.
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

export function TopPanel({ open, user, onClose, onSignOut, aliases, onAliasesChange, store, categories, categoryById, onRestore, sync, account, onAccountChange }: {
  open: boolean
  user: User
  onClose: () => void
  onSignOut: () => void
  aliases: AliasStore
  onAliasesChange: (next: AliasStore) => void
  store: PhraseStore
  categories: string[]
  categoryById: Map<string, string>
  onRestore: (next: AppState, message: string) => void
  /** Driven in `talk`, where the board it synchronizes lives. */
  sync: SyncControl
  /** Held in `talk` too: it is part of what synchronizing sends. */
  account: ElevenLabsAccount | null
  onAccountChange: (next: ElevenLabsAccount | null) => void
}) {
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

  const handleSignOut = useCallback(() => {
    setConfirmingSignOut(false)
    onClose()
    onSignOut()
  }, [onClose, onSignOut])
  const [view, setView] = useState<PanelView>('menu')

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

      {/* Settings and the guide take the whole screen; the menu itself and the
          shorter panels hang down only as far as their content. Both of those two
          are scrolled whatever height they get, and a taller pane is fewer dwells
          on the scroll arrows. */}
      <div
        className={cx('top-panel', open && 'open', (view === 'settings' || view === 'help') && 'is-tall')}
        role="dialog"
        aria-label="Menu"
        aria-hidden={!open}
      >
        {/* User row */}
        <div className="panel-user-row">
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
          <PanelBack onSelect={view === 'menu' ? onClose : backToMenu} />
        </div>

        {view !== 'menu' ? (
          <>
            {view === 'settings' && (
              <SettingsPanel
                store={store}
                aliases={aliases}
                categoryById={categoryById}
                sync={sync}
                account={account}
                onAccountChange={onAccountChange}
              />
            )}
            {view === 'aliases' && <AliasesPanel aliases={aliases} onChange={onAliasesChange} />}
            {view === 'backup' && (
              <BackupPanel
                store={store}
                aliases={aliases}
                categories={categories}
                categoryById={categoryById}
                onRestore={onRestore}
              />
            )}
            {view === 'help' && <HelpPanel />}
          </>
        ) : (
          <nav className="panel-nav">
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
              label="Settings"
              sublabel="Dwell time, voice, volume, speed"
              disabled={guarded}
              onSelect={() => setView('settings')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              label="Aliases"
              sublabel="The words your phrases choose from"
              disabled={guarded}
              onSelect={() => setView('aliases')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
              label="Backup & sharing"
              sublabel="Save your phrases, or bring some in"
              disabled={guarded}
              onSelect={() => setView('backup')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
              label="Help"
              sublabel="How to use Peri"
              disabled={guarded}
              onSelect={() => setView('help')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
              label="Sign out"
              sublabel={user.email || 'Guest session'}
              disabled={guarded}
              onSelect={() => setConfirmingSignOut(true)}
            />
          </nav>
        )}

        <div className="panel-handle" />
      </div>

      {confirmingSignOut && (
        <ConfirmSignOut
          user={user}
          onConfirm={handleSignOut}
          onCancel={backToMenu}
        />
      )}
    </>
  )
}
