// The app shell: which of the three screens is on, and the settings every one of
// them reads.
//
// Everything else lives in its own module; this file exists to answer "what am I
// looking at" and nothing more.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { legalDocumentFor } from './legal/legal'
import { loadSettings, saveSettings, clearUser, loadUser, saveUser, type Settings, type User } from './core/store'
import { holdDwells } from './ui/dwell'
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

  /**
   * The one setting the stylesheet cannot read for itself. Every size in it is
   * in `rem`, so the root font-size is the single place text size is decided —
   * and a percentage rather than a pixel count, so it multiplies whatever the
   * reader has already told their browser they want rather than replacing it.
   *
   * **Changing it makes the app deaf for a moment.** Every control on screen
   * moves when the text grows, around a pointer that has not moved with them, so
   * whatever is under it afterwards is not what its owner was looking at. Here
   * rather than in the settings row, because every route to a new text size
   * comes through this line — the spinner, its revert, a restored backup, a
   * board arriving from another device.
   */
  const appliedZoom = useRef<number | null>(null)
  useEffect(() => {
    // Rounded, because a tenth of a percent means nothing here and `1.1 * 100`
    // is 110.00000000000001 — which the browser accepts and nobody wants to
    // read in the inspector.
    document.documentElement.style.fontSize = `${Math.round(settings.zoom * 100)}%`
    // Not on the way in: nothing has moved, and an app that will not answer for
    // its first second is an app that looks broken.
    if (appliedZoom.current !== null && appliedZoom.current !== settings.zoom) holdDwells()
    appliedZoom.current = settings.zoom
  }, [settings.zoom])

  const ctx = useMemo(() => ({ settings, update }), [settings, update])

  if (legalDoc) return <LegalPage doc={legalDoc} />

  return (
    <SettingsCtx.Provider value={ctx}>
      {user ? <TalkScreen user={user} onSignOut={handleSignOut} /> : <SignInPage onSignIn={handleSignIn} />}
    </SettingsCtx.Provider>
  )
}
