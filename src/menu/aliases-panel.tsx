
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useReorder, reorderLabel, type ReorderProps } from '../ui/reorder'
import { useSettings } from '../ui/settings'
import { tableAliases, type Aliases } from '../core/phrases'
import { moveInOrder, loadAliasSort, saveAliasSort } from '../core/store'
import { CustomOrderIcon, PlusIcon, ReorderIcon, SortAlphaIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { ScrollPane } from '../ui/controls'

/**
 * One word in a list: a chip with the control that takes it off — or, while the
 * list is being arranged, a thing to pick up and put down.
 *
 * The two are never offered at once. A chip that both removes a word and moves
 * it is two targets in one place, which is the worst thing to hand somebody
 * aiming by gaze; and a dwell landing on the × mid-arrangement would delete the
 * word rather than drop the one in the air.
 */
function WordChip({ word, list, onRemove, reorder }: {
  word: string
  list: string
  onRemove: () => void
  /** Present only while the list is being arranged. */
  reorder?: ReorderProps
}) {
  const { settings } = useSettings()
  const remove = useDwellControl(settings.actionDwellMs, onRemove)
  const move = useDwellControl(settings.actionDwellMs, () => reorder?.onLiftOrDrop(), {
    disabled: !reorder || reorder.dragging,
  })

  return (
    <div
      className={cx(
        'alias-word',
        reorder && 'reorderable',
        reorder?.held && 'is-held',
        reorder?.heldLabel && 'is-drop-zone',
        reorder?.dropTarget && 'is-drop-target',
        reorder && move.active && 'dwelling',
      )}
      style={dwellVar(settings.actionDwellMs)}
      role={reorder ? 'button' : undefined}
      aria-label={reorder ? reorderLabel(reorder, word, 'word') : undefined}
      draggable={reorder ? true : undefined}
      onDragStart={reorder?.onDragStart}
      onDragOver={reorder && (e => {
        // Without this the browser refuses the drop outright.
        e.preventDefault()
        reorder.onDragOver()
      })}
      onDragEnd={reorder?.onDragEnd}
      onDrop={reorder && (e => {
        e.preventDefault()
        reorder.onDrop()
      })}
      {...(reorder ? move.props : {})}
    >
      <span className="alias-word-text">{word}</span>
      {reorder ? (
        <div className="dwell-bar" key={move.active ? 'a' : 'i'} />
      ) : (
        <div
          className={cx('contact-remove', remove.active && 'dwelling')}
          style={dwellVar(settings.actionDwellMs)}
          role="button"
          aria-label={`Remove ${word} from ${list}`}
          {...remove.props}
        >
          <div className="dwell-bar" key={remove.active ? 'a' : 'i'} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="14" height="14" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      )}
    </div>
  )
}

/** One of the tools in an open list's header. */
function ListTool({ className, label, pressed, disabled, onActivate, children }: {
  className: string
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
      className={cx('alias-tool', className, active && 'dwelling', pressed && 'is-on')}
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
  const names = useMemo(
    () => [...new Set([...Object.keys(shipped), ...Object.keys(aliases)])].sort((a, b) => a.localeCompare(b)),
    [shipped, aliases],
  )

  // One open at a time, and the first open on arrival — the same bargain the
  // guide's headings strike. Folded, the panel is a list of what it can offer,
  // which is how somebody finds the one list they came for; `bodyparts` alone
  // is fifty words to scroll past otherwise.
  const [openName, setOpenName] = useState<string | null>(names[0] ?? null)
  // Arranging is a mode within an open list, so closing one puts it away.
  const [arranging, setArranging] = useState(false)
  const [sort, setSort] = useState(loadAliasSort)

  // One way in, so every route to it is remembered — including arranging a list
  // out of A–Z, which makes the shown order theirs and has to stick.
  const applySort = useCallback((next: 'custom' | 'alpha') => {
    saveAliasSort(next)
    setSort(next)
  }, [])
  const toggleSort = useCallback(
    () => applySort(sort === 'alpha' ? 'custom' : 'alpha'),
    [sort, applySort],
  )

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
      setOpenName(name)
    },
    [aliases, shipped, onChange],
  )

  const dropList = useCallback(
    (name: string) => {
      const next = { ...aliases }
      delete next[name]
      onChange(next)
      setOpenName(null)
    },
    [aliases, onChange],
  )

  const open = useCallback((name: string) => {
    setArranging(false)
    setOpenName(current => (current === name ? null : name))
  }, [])

  return (
    <div className="settings-panel">
      <ScrollPane className="settings-scroller" paneClassName="settings-body" step={100}>
        <p className="profile-hint">
          The words a phrase offers where it leaves a blank — “Please turn{' '}
          <em>on</em> the lights”, “I'm going to call <em>Mum</em>”. Write{' '}
          <code>{'{'}contacts{'}'}</code> in a phrase to use one.
        </p>

        {names.map(name => (
          <AliasList
            key={name}
            name={name}
            words={aliases[name] ?? shipped[name] ?? []}
            isOpen={openName === name}
            onOpen={() => open(name)}
            sort={sort}
            onToggleSort={toggleSort}
            arranging={arranging}
            onToggleArrange={() => setArranging(a => !a)}
            /** Only a list of their own can be deleted; the table's can be emptied. */
            onDrop={name in shipped ? undefined : () => dropList(name)}
            onWords={next => setList(name, next)}
            onSorted={() => applySort('custom')}
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

function AliasList({ name, words, isOpen, onOpen, sort, onToggleSort, arranging, onToggleArrange, onWords, onDrop, onSorted }: {
  name: string
  words: string[]
  isOpen: boolean
  onOpen: () => void
  sort: 'custom' | 'alpha'
  onToggleSort: () => void
  arranging: boolean
  onToggleArrange: () => void
  onWords: (next: string[]) => void
  /** Absent for a list the table ships, which can be emptied but not removed. */
  onDrop?: () => void
  /** An arrangement made while A–Z was showing is now the arrangement. */
  onSorted: () => void
}) {
  const { settings } = useSettings()
  const heading = useDwellControl(settings.actionDwellMs, onOpen)
  const ref = useRef<HTMLDivElement>(null)

  // Opening one puts its heading at the top of the pane, so what was just chosen
  // is the first thing on screen — the same effect the guide's sections use, and
  // for the same reason. Closing does not scroll: closing is not going anywhere.
  useEffect(() => {
    if (isOpen) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [isOpen])

  // A–Z is a view of the same list. The order the user built is left in place
  // underneath it, so going to A–Z and back is not a way to lose it.
  const shown = useMemo(
    () => (sort === 'alpha' ? [...words].sort((a, b) => a.localeCompare(b)) : words),
    [words, sort],
  )

  // The whole arrangement rather than a step of one, and taken from what was on
  // screen — so a move made while A–Z is showing captures the order the user
  // could see at the time, and becomes their arrangement.
  const { propsFor, release } = useReorder({
    onReorder: (from, to) => {
      onWords(moveInOrder(shown, from, to))
      onSorted()
    },
  })

  const toggleArrange = useCallback(() => {
    release()
    onToggleArrange()
  }, [release, onToggleArrange])

  return (
    <div ref={ref} className={cx('alias-list', 'is-collapsible', isOpen && 'is-open')} role="group" aria-label={name}>
      <div
        className={cx('alias-list-head', heading.active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-expanded={isOpen}
        aria-label={`${name}, ${words.length} ${words.length === 1 ? 'word' : 'words'}`}
        {...heading.props}
      >
        <span className="alias-caret" aria-hidden="true" />
        <span className="setting-label">{name}</span>
        <span className="alias-count">{words.length}</span>
        <div className="dwell-bar" key={heading.active ? 'a' : 'i'} />
      </div>

      {/* Unmounted rather than hidden: nine lists left open in the tree would
          have a screen reader read out three hundred words nobody asked for. */}
      {isOpen && (
        <>
          <div className="alias-tools">
            <ListTool
              className="alias-sort"
              // The lit state says which arrangement is on, so the icon and the
              // name say it too rather than leaving colour to carry it.
              label={
                sort === 'alpha'
                  ? 'Sorted A to Z. Switch to your own order'
                  : 'Your own order. Switch to A to Z'
              }
              pressed={sort === 'alpha'}
              onActivate={onToggleSort}
            >
              {sort === 'alpha' ? <SortAlphaIcon /> : <CustomOrderIcon />}
            </ListTool>
            <ListTool
              className="alias-arrange"
              label={arranging ? `Done arranging ${name}` : `Arrange ${name}`}
              pressed={arranging}
              disabled={words.length < 2}
              onActivate={toggleArrange}
            >
              <ReorderIcon />
            </ListTool>
            {onDrop && (
              <ListTool className="alias-delete" label={`Delete the ${name} list`} onActivate={onDrop}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="14" height="14" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </ListTool>
            )}
          </div>

          {words.length === 0 && <p className="profile-empty">Nothing in it yet.</p>}
          {/* A grid rather than a wrapped row: fifty body parts in a paragraph of
              chips is a wall to read, and a grid gives the eye columns to travel
              down. */}
          <div className="alias-grid">
            {shown.map(word => (
              <WordChip
                key={word}
                word={word}
                list={name}
                onRemove={() => onWords(words.filter(w => w !== word))}
                reorder={arranging ? propsFor(word) : undefined}
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
        </>
      )}
    </div>
  )
}
