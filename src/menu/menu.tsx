
// The panel that slides down from the top, and everything reached from it.

import { useCallback, useEffect, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { type Profile } from '../core/phrases'
import { useSettings } from '../ui/settings'
import { type PhraseStore, type User } from '../core/store'
import { type AppState } from '../core/backup'
import { cx, dwellVar } from '../ui/style'
import { NavItem } from '../ui/controls'
import { SettingsPanel } from './settings-panel'
import { ProfilePanel } from './profile-panel'
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
function PanelBack({ onSelect }: { onSelect: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onSelect)
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

type PanelView = 'menu' | 'settings' | 'profile' | 'backup' | 'help'

export function TopPanel({ open, user, onClose, onSignOut, profile, onProfileChange, store, categories, categoryById, onRestore }: {
  open: boolean
  user: User
  onClose: () => void
  onSignOut: () => void
  profile: Profile
  onProfileChange: (p: Profile) => void
  store: PhraseStore
  categories: string[]
  categoryById: Map<string, string>
  onRestore: (next: AppState, message: string) => void
}) {
  const handleSignOut = useCallback(() => {
    onClose()
    onSignOut()
  }, [onClose, onSignOut])
  const [view, setView] = useState<PanelView>('menu')

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

      <div className={cx('top-panel', open && 'open')} role="dialog" aria-label="Menu" aria-hidden={!open}>
        {/* User row */}
        <div className="panel-user-row">
          <div className="panel-avatar" aria-hidden="true">
            {user.provider === 'google' && <span style={{ fontSize: 18 }}>G</span>}
            {user.provider === 'apple' && <span style={{ fontSize: 18 }}></span>}
            {user.provider === 'facebook' && <span style={{ fontSize: 18 }}>f</span>}
            {user.provider === 'guest' && <span style={{ fontSize: 18 }}>👤</span>}
          </div>
          <div className="panel-user-info">
            <span className="panel-user-name">{user.name}</span>
            {user.email && <span className="panel-user-email">{user.email}</span>}
          </div>
          <PanelBack onSelect={view === 'menu' ? onClose : () => setView('menu')} />
        </div>

        {view !== 'menu' ? (
          <>
            {view === 'settings' && <SettingsPanel />}
            {view === 'profile' && <ProfilePanel profile={profile} onChange={onProfileChange} />}
            {view === 'backup' && (
              <BackupPanel
                store={store}
                profile={profile}
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
              onSelect={() => setView('settings')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              label="My details"
              sublabel={
                profile.contacts.length
                  ? `${profile.contacts.length} contact${profile.contacts.length === 1 ? '' : 's'}`
                  : 'Your name and contacts'
              }
              onSelect={() => setView('profile')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
              label="Backup & sharing"
              sublabel="Save your phrases, or bring some in"
              onSelect={() => setView('backup')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
              label="Help"
              sublabel="How to use Peri"
              onSelect={() => setView('help')}
            />
            <NavItem
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
              label="Sign out"
              sublabel={user.email || 'Guest session'}
              onSelect={handleSignOut}
            />
          </nav>
        )}

        <div className="panel-handle" />
      </div>
    </>
  )
}
