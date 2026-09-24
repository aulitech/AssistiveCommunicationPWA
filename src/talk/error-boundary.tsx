// What is on screen when the app itself has failed.
//
// **There was nothing.** A render that threw unmounted the whole tree, and a
// blank page is the worst thing this app can show: it is a device somebody may
// have no other way to speak with, and the blank page took the emergency bar
// with it. So the boundary sits around every screen, and what it puts up is the
// one thing that must always work — the emergency bar — with a way back and a
// way to keep the board.
//
// **Everything here is read afresh from storage**, never from the screen that
// failed: the hooks holding the board may be exactly what broke. That is why
// the phrases come from `core/board.ts`, which is the same arithmetic the board
// uses without being any part of it — and why each read is guarded, the store
// itself being one of the things that might be damaged.

import { Component, useCallback, useState, type ReactNode } from 'react'
import { EMERGENCY_PHRASES, type Phrase } from '../core/phrases'
import { emergencyPhrasesOf } from '../core/board'
import { loadAliases, loadPhraseStore, loadSettings } from '../core/store'
import { buildBackup } from '../core/backup'
import { reportFailure } from '../core/report'
import { PanelButton } from '../ui/controls'
import { downloadBackup } from '../menu/backup-file'
import { EmergencyButton } from './emergency'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // What kind of failure, and nothing it says: a message can carry the words
    // of a phrase, and a console ends up in screenshots.
    reportFailure('app/crash', error instanceof Error ? error.name : 'Something other than an Error was thrown')
  }

  render() {
    return this.state.failed ? <StillTalking /> : this.props.children
  }
}

/**
 * The bar as this person arranged it, where it can still be read — and the six
 * Peri ships where it cannot, since those need nothing at all to have survived.
 */
function emergencyBar(): Phrase[] {
  try {
    const phrases = emergencyPhrasesOf(loadPhraseStore())
    return phrases.length > 0 ? phrases : EMERGENCY_PHRASES
  } catch {
    return EMERGENCY_PHRASES
  }
}

function StillTalking() {
  const [phrases] = useState(emergencyBar)
  const [kept, setKept] = useState<'not yet' | 'kept' | 'failed'>('not yet')

  /**
   * The whole board as it was last written down. Built from storage, not from
   * memory — memory is what failed — so it holds everything up to the last
   * change that was saved, which with safe writes is every change there was.
   */
  const keepBoard = useCallback(() => {
    try {
      const store = loadPhraseStore()
      const aliases = loadAliases()
      const backup = buildBackup({ store, aliases, settings: loadSettings() })
      setKept(downloadBackup(backup).ok ? 'kept' : 'failed')
    } catch {
      setKept('failed')
    }
  }, [])

  return (
    <div className="still-talking" role="alert">
      <div className="still-talking-words">
        <h1>Peri has stopped working</h1>
        <p>The emergency phrases below still speak. Start again to get the board back.</p>
      </div>
      <div className="still-talking-actions">
        <PanelButton label="Start again" kind="primary" onActivate={() => location.reload()} />
        <PanelButton
          label={
            kept === 'kept'
              ? 'Backup saved'
              : kept === 'failed'
                ? 'Could not save a backup'
                : 'Save a backup first'
          }
          kind="plain"
          onActivate={keepBoard}
        />
      </div>
      <div className="emergency-bar" role="group" aria-label="Emergency phrases">
        {phrases.map(p => (
          <EmergencyButton key={p.id} phrase={p} />
        ))}
      </div>
    </div>
  )
}
