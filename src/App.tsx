// The app shell: which of the three screens is on, and the settings every one of
// them reads.
//
// Everything else lives in its own module; this file exists to answer "what am I
// looking at" and nothing more.

import { useCallback, useMemo, useState } from 'react'
import { legalDocumentFor } from './legal/legal'
import { loadSettings, saveSettings, clearUser, loadUser, saveUser, type Settings, type User } from './core/store'
import { SettingsCtx } from './ui/settings'
import { SignInPage } from './signin/signin'
import { LegalPage } from './legal/legal-page'
import { TalkScreen } from './talk/talk'

export default function App() {
  // Legal pages are plain documents at their own URLs. Two leaf pages reached
  // by real links need no router and no history handling.
  const legalDoc = legalDocumentFor(window.location.pathname)

  const [user, setUser] = useState<User | null>(loadUser)
  const [settings, setSettings] = useState<Settings>(loadSettings)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(s => {
      const next = { ...s, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const handleSignIn = useCallback((u: User) => {
    saveUser(u)
    setUser(u)
  }, [])

  const handleSignOut = useCallback(() => {
    clearUser()
    setUser(null)
  }, [])

  const ctx = useMemo(() => ({ settings, update }), [settings, update])

  if (legalDoc) return <LegalPage doc={legalDoc} />

  return (
    <SettingsCtx.Provider value={ctx}>
      {user ? <TalkScreen user={user} onSignOut={handleSignOut} /> : <SignInPage onSignIn={handleSignIn} />}
    </SettingsCtx.Provider>
  )
}
