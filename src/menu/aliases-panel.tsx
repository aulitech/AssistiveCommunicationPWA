
// Menu → Aliases. The lists a phrase's slots choose from.
//
// A phrase can say "Please turn {control} the lights" or "I'm going to call
// {contact}", and what the slot offers comes from a named list. Nine of them
// ship with the table and two of those — `contacts` and `name` — arrive empty,
// because there is nowhere in the data to put a particular person's details.
//
// This panel was **My details**, which edited exactly those two and nothing
// else. All of them are the user's now: seeded from the table, every word
// removable, every list extensible, and a list of their own added at the end.
// Only what they change is stored, so a list nobody touches follows the table
// into the next release.

import { useCallback, useMemo, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { tableAliases, type Aliases } from '../core/phrases'
import { PlusIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { ScrollPane } from '../ui/controls'

/** One word, with the control that takes it off the list. */
function WordChip({ word, list, onRemove }: { word: string; list: string; onRemove: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onRemove)
  return (
    <div className="alias-word">
      <span className="alias-word-text">{word}</span>
      <div
        className={cx('contact-remove', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-label={`Remove ${word} from ${list}`}
        {...props}
      >
        <div className="dwell-bar" key={active ? 'a' : 'i'} />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="14" height="14" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    </div>
  )
}

/**
 * A text box and a `+`, used twice: to add a word to a list, and to add a list.
 *
 * Enter does the same thing as the button. Typing is a keyboard job either way —
 * this is set-up work, usually done by whoever configures the device — but the
 * `+` is there because somebody driving by gaze with an on-screen keyboard has
 * no Enter key worth the name.
 */
function AddRow({ label, placeholder, onAdd }: {
  label: string
  placeholder: string
  onAdd: (value: string) => void
}) {
  const { settings } = useSettings()
  const [draft, setDraft] = useState('')

  const add = useCallback(() => {
    const value = draft.trim()
    if (!value) return
    onAdd(value)
    setDraft('')
  }, [draft, onAdd])

  const { active, props } = useDwellControl(settings.actionDwellMs, add, { disabled: draft.trim() === '' })

  return (
    <div className="contact-add">
      <input
        className="profile-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        placeholder={placeholder}
        aria-label={label}
      />
      <div
        className={cx('contact-add-btn', active && 'dwelling', !draft.trim() && 'is-disabled')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-label={label}
        {...props}
      >
        <div className="dwell-bar" key={active ? 'a' : 'i'} />
        <PlusIcon />
      </div>
    </div>
  )
}

export function AliasesPanel({ aliases, onChange }: {
  aliases: Aliases
  onChange: (next: Aliases) => void
}) {
  // What the table ships under what the user has made of it. The table's lists
  // are the seed; a key the user has touched wins outright, empty included.
  const shipped = useMemo(() => tableAliases(), [])
  const shown = useMemo<[string, string[]][]>(() => {
    const names = [...new Set([...Object.keys(shipped), ...Object.keys(aliases)])].sort((a, b) =>
      a.localeCompare(b),
    )
    return names.map(name => [name, aliases[name] ?? shipped[name] ?? []])
  }, [shipped, aliases])

  /** Writing any list writes the whole list, which is what makes a removal stick. */
  const setList = useCallback(
    (name: string, words: string[]) => onChange({ ...aliases, [name]: words }),
    [aliases, onChange],
  )

  const addList = useCallback(
    (raw: string) => {
      const name = raw.trim().toLowerCase()
      if (!name || name in shipped || name in aliases) return
      onChange({ ...aliases, [name]: [] })
    },
    [aliases, shipped, onChange],
  )

  const dropList = useCallback(
    (name: string) => {
      const next = { ...aliases }
      delete next[name]
      onChange(next)
    },
    [aliases, onChange],
  )

  return (
    <div className="settings-panel">
      <ScrollPane className="settings-scroller" paneClassName="settings-body" step={100}>
        <p className="profile-hint">
          The words a phrase offers where it leaves a blank — “Please turn{' '}
          <em>on</em> the lights”, “I'm going to call <em>Mum</em>”. Write{' '}
          <code>{'{'}contacts{'}'}</code> in a phrase to use one.
        </p>

        {shown.map(([name, words]) => (
          <AliasList
            key={name}
            name={name}
            words={words}
            /** Only a list of their own can be deleted; the table's can be emptied. */
            onDrop={name in shipped ? undefined : () => dropList(name)}
            onWords={next => setList(name, next)}
          />
        ))}

        <div className="alias-list" role="group" aria-label="New list">
          <span className="setting-label">New list</span>
          <p className="profile-empty">
            A name with no spaces — a phrase reaches it by writing that name in curly brackets.
          </p>
          <AddRow label="Add a list" placeholder="drinks" onAdd={addList} />
        </div>
      </ScrollPane>
    </div>
  )
}

function AliasList({ name, words, onWords, onDrop }: {
  name: string
  words: string[]
  onWords: (next: string[]) => void
  /** Absent for a list the table ships, which can be emptied but not removed. */
  onDrop?: () => void
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onDrop ?? (() => {}), {
    disabled: !onDrop,
  })

  return (
    <div className="alias-list" role="group" aria-label={name}>
      <div className="alias-list-head">
        <span className="setting-label">{name}</span>
        {onDrop && (
          <div
            className={cx('contact-remove', active && 'dwelling')}
            style={dwellVar(settings.actionDwellMs)}
            role="button"
            aria-label={`Delete the ${name} list`}
            {...props}
          >
            <div className="dwell-bar" key={active ? 'a' : 'i'} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="14" height="14" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        )}
      </div>

      {words.length === 0 && <p className="profile-empty">Nothing in it yet.</p>}
      <div className="alias-words">
        {words.map(word => (
          <WordChip
            key={word}
            word={word}
            list={name}
            onRemove={() => onWords(words.filter(w => w !== word))}
          />
        ))}
      </div>

      <AddRow
        label={`Add a word to ${name}`}
        placeholder="Add a word…"
        onAdd={word => {
          if (words.includes(word)) return
          onWords([...words, word])
        }}
      />
    </div>
  )
}
