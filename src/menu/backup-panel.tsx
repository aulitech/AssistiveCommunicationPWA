// Menu → Backup & sharing. The screen over the format in `backup.ts`.

import { useCallback, useMemo, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { type AliasStore, type Phrase } from '../core/phrases'
import { type PhraseStore } from '../core/store'
import {
  applyBackup,
  buildBackup,
  canReplace,
  describeBackup,
  parseBackup,
  serializeBackup,
  summarize,
  type AppState,
  type Backup,
  type BackupSummary,
  type ImportMode,
} from '../core/backup'
import { downloadBackup } from './backup-file'
import { cx, dwellVar } from '../ui/style'
import { FileButton, PanelButton, PickerModal, PickerTile, ScrollPane } from '../ui/controls'
import { SheetSection } from './sheet-section'

/** What the trigger says the current choice is. */
function describeScope(scope: string[] | null): string {
  if (scope === null) return 'Everything'
  if (scope.length <= 2) return scope.join(', ')
  return `${scope.length} categories`
}

export function BackupPanel({
  store,
  aliases,
  phrases,
  categories,
  categoryById,
  onRestore,
}: {
  store: PhraseStore
  aliases: AliasStore
  /** Every phrase on the board, the emergency bar's included — what a spreadsheet of it holds. */
  phrases: Phrase[]
  /** Every category that can be exported on its own, in the order shown. */
  categories: string[]
  categoryById: Map<string, string>
  onRestore: (next: AppState, message: string) => void
}) {
  const { settings } = useSettings()
  // Null is "everything", which is not the same as every category ticked: only
  // a whole-app backup carries the details and settings, and only a whole-app
  // backup may be restored by replacing.
  const [scope, setScope] = useState<string[] | null>(null)
  const [picking, setPicking] = useState(false)
  /** What to put back if they leave the grid without settling on anything. */
  const [beforePicking, setBeforePicking] = useState<string[] | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<{ backup: Backup; summary: BackupSummary } | null>(null)

  const backup = useMemo(
    () => buildBackup({ store, aliases, settings, categoryById, scope }),
    [store, aliases, settings, categoryById, scope],
  )
  const summary = useMemo(() => summarize(backup), [backup])
  // What "Everything" would hold, whether or not it is the current choice — it
  // is the line under the option, so it has to stand for the option and not for
  // whatever categories happen to be ticked.
  const everything = useMemo(
    () => (scope === null ? summary : summarize(buildBackup({ store, aliases, settings, categoryById }))),
    [scope, summary, store, aliases, settings, categoryById],
  )

  const openPicker = useCallback(() => {
    setBeforePicking(scope)
    setPicking(true)
  }, [scope])

  const { active: scopeActive, props: scopeProps } = useDwellControl(settings.actionDwellMs, openPicker)

  const cancelPicking = useCallback(() => {
    setScope(beforePicking)
    setPicking(false)
  }, [beforePicking])

  const toggleCategory = useCallback((name: string) => {
    setStatus(null)
    setScope(current => {
      if (current === null) return [name]
      const next = current.includes(name) ? current.filter(c => c !== name) : [...current, name]
      // Unticking the last one means "not a subset any more", which is the whole
      // app — otherwise the panel would sit in a state that exports nothing.
      return next.length === 0 ? null : next
    })
  }, [])

  const download = useCallback(() => {
    const saved = downloadBackup(backup)
    if (saved.ok) {
      setError(null)
      setStatus(`Saved as ${saved.name}`)
    } else {
      setError('Peri could not save the file. Copy the backup instead.')
    }
  }, [backup])

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(serializeBackup(backup))
      .then(() => {
        setError(null)
        setStatus('Backup copied — paste it somewhere safe')
      })
      .catch(() => setError('Peri could not reach the clipboard. Save the file instead.'))
  }, [backup])

  const load = useCallback((text: string) => {
    const result = parseBackup(text)
    if (!result.ok) {
      setIncoming(null)
      setStatus(null)
      setError(result.error)
      return
    }
    const parsed = summarize(result.backup)
    if (parsed.empty) {
      setIncoming(null)
      setStatus(null)
      setError('That backup is empty — there is nothing in it to restore.')
      return
    }
    setError(null)
    setStatus(null)
    setIncoming({ backup: result.backup, summary: parsed })
  }, [])

  const loadFile = useCallback(
    (file: File) => {
      file
        .text()
        .then(load)
        .catch(() => setError('Peri could not read that file.'))
    },
    [load],
  )

  // The browser opens a file only for a real press — see `FileButton`.
  const refused = useCallback(
    () => setError('Your browser only opens a file on a real click or tap. Paste a backup works by resting.'),
    [],
  )

  const paste = useCallback(() => {
    navigator.clipboard
      ?.readText?.()
      .then(load)
      .catch(() => setError('Peri could not reach the clipboard. Choose a backup file instead.'))
  }, [load])

  const restore = useCallback(
    (mode: ImportMode) => {
      if (!incoming) return
      const next = applyBackup(incoming.backup, { store, aliases, settings }, mode)
      onRestore(next, mode === 'replace' ? 'Backup restored' : 'Backup merged in')
    },
    [incoming, store, aliases, settings, onRestore],
  )

  return (
    <div className="backup-panel">
      <ScrollPane className="backup-scroller" paneClassName="backup-body" step={120}>
        <p className="backup-note">
          Your phrases live in this browser and nowhere else. A backup carries everything you changed — what you
          added, reworded, moved or removed, your details and your settings. The phrases Peri came with are already
          in the app, so they are not in the file.
        </p>

        <span className="setting-label backup-heading">What to save</span>
        <div
          className={cx('picker-trigger backup-scope-trigger', scopeActive && 'dwelling')}
          style={dwellVar(settings.actionDwellMs)}
          role="button"
          aria-haspopup="dialog"
          aria-expanded={picking}
          aria-label={`Saving ${describeScope(scope)}. Choose what to save`}
          {...scopeProps}
        >
          <span className="picker-trigger-label">{describeScope(scope)}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <div className="dwell-bar" key={scopeActive ? 'a' : 'i'} />
        </div>

        {picking && (
          <PickerModal
            title="What to save"
            hint="Everything, or pick as many categories as you like"
            onDone={() => setPicking(false)}
            onCancel={cancelPicking}
          >
            <PickerTile
              name="Everything"
              detail={describeBackup(everything)}
              selected={scope === null}
              className="is-everything"
              onSelect={() => {
                setStatus(null)
                setScope(null)
              }}
            />
            {categories.map(name => (
              <PickerTile
                key={name}
                name={name}
                selected={scope !== null && scope.includes(name)}
                onSelect={() => toggleCategory(name)}
              />
            ))}
          </PickerModal>
        )}

        {scope !== null && <p className="backup-summary">{describeBackup(summary)}</p>}

        <div className="backup-actions">
          <PanelButton kind="primary" label="Save a file" onActivate={download} disabled={summary.empty} />
          <PanelButton kind="plain" label="Copy" onActivate={copy} disabled={summary.empty} />
        </div>

        <span className="setting-label backup-heading">Bring a backup in</span>

        {incoming ? (
          <div className="backup-incoming" role="group" aria-label="Restore this backup">
            <p className="backup-summary">
              {incoming.backup.scope ? `${incoming.backup.scope.join(', ')} — ` : 'Whole backup — '}
              {describeBackup(incoming.summary)}.
            </p>
            <div className="backup-actions">
              <PanelButton kind="primary" label="Add to what's here" onActivate={() => restore('merge')} />
              {canReplace(incoming.backup) && (
                <PanelButton kind="danger" label="Replace everything" onActivate={() => restore('replace')} />
              )}
              <PanelButton kind="plain" label="Cancel" onActivate={() => setIncoming(null)} />
            </div>
            <p className="backup-note">
              Adding never takes a phrase away. Replacing makes this device match the file exactly, including
              anything the backup had removed.
            </p>
          </div>
        ) : (
          <div className="backup-actions">
            <FileButton
              label="Choose a file"
              accept="application/json,.json"
              onFile={loadFile}
              onRefused={refused}
            />
            <PanelButton kind="plain" label="Paste a backup" onActivate={paste} />
          </div>
        )}

        {error && (
          <p className="backup-error" role="alert">
            {error}
          </p>
        )}
        {status && (
          <p className="backup-status" role="status">
            {status}
          </p>
        )}

        <SheetSection
          store={store}
          aliases={aliases}
          phrases={phrases}
          categories={categories}
          onRestore={onRestore}
        />
      </ScrollPane>
    </div>
  )
}
