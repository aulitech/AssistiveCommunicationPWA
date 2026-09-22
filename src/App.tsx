// The app shell: which of the three screens is on, and the settings every one of
// them reads.
//
// Everything else lives in its own module; this file exists to answer "what am I
// looking at" and nothing more.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { legalDocumentFor } from './legal/legal'
import {
  changesWhoIsSignedIn,
  clearUser,
  leaveForSignIn,
  loadSettings,
  loadUser,
  openBoardFor,
  ownerOf,
  saveSettings,
  saveUser,
  settingsOnArrival,
  type Settings,
  type User,
} from './core/store'
import { holdDwells } from './ui/dwell'
import { SettingsCtx } from './ui/settings'
import { SignInPage } from './signin/signin'
import { LegalPage } from './legal/legal-page'
import { TalkScreen } from './talk/talk'

export default function App() {
  // Legal pages are plain documents at their own URLs. Two leaf pages reached
  // by real links need no router and no history handling.
  const legalDoc = legalDocumentFor(window.location.pathname)

  // Whose board this page reads is settled before anything reads it, the
  // settings on the next line included.
  const [user, setUser] = useState<User | null>(() => {
    const stored = loadUser()
    openBoardFor(stored)
    return stored
  })
  const [settings, setSettings] = useState<Settings>(loadSettings)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(s => {
      const next = { ...s, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  // Signing in happens only on a page nobody's board has been opened in — this
  // one was loaded signed out, or reloaded by signing out — so opening this
  // person's board here leaves nothing of anybody else's behind in memory.
  // What does carry across is how the sign-in page was worked, into a board
  // that has never been opened here — see `settingsOnArrival`.
  const handleSignIn = useCallback(
    (u: User) => {
      saveUser(u)
      openBoardFor(u)
      setUser(u)
      setSettings(settingsOnArrival(settings))
    },
    [settings],
  )

  // **Signing out reloads.** A board is held in memory as well as in storage —
  // the screens, the translations, the audio — and a request still on its way
  // writes wherever storage points when it lands. A fresh page is the one way
  // to be sure that none of it reaches whoever signs in next.
  const handleSignOut = useCallback(() => {
    leaveForSignIn(settings)
    clearUser()
    setUser(null)
    location.reload()
  }, [settings])

  // Somebody signed in or out in another tab. This one is holding a board that
  // may no longer be the signed-in person's, so it starts again as whoever is
  // signed in now.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!changesWhoIsSignedIn(e.key)) return
      const now = loadUser()
      if (ownerOf(now) !== ownerOf(user) || !now !== !user) location.reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [user])

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

  // The legal pages inside the provider as well, though they need no account:
  // they are driven by dwell now, and a dwell there should take the time this
  // person set rather than the one the app ships with.
  return (
    <SettingsCtx.Provider value={ctx}>
      {legalDoc ? (
        <LegalPage doc={legalDoc} />
      ) : user ? (
        <TalkScreen user={user} onSignOut={handleSignOut} />
      ) : (
        <SignInPage onSignIn={handleSignIn} />
      )}
    </SettingsCtx.Provider>
  )
}
