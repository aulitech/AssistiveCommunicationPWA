// The blue bar along the bottom. Always visible, on every screen of the app, and
// spoken the moment it is chosen rather than composed into the message first.
//
// Which button sits where matters more here than anywhere else: this is the one
// surface somebody reaches for without reading it, so the order it comes in is
// theirs to set. Reordering works exactly as it does for the category tabs —
// drag with a mouse, or hold one button and dwell where it should go — and both
// routes come from `ui/reorder`.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useReorder, reorderLabel, type ReorderProps } from '../ui/reorder'
import { useSettings } from '../ui/settings'
import { useEdit } from '../ui/edit-mode'
import { speak } from '../voice/speech'
import { stripMarkdown } from '../core/markdown'
import { type Phrase } from '../core/phrases'
import { GripIcon, PlusIcon, TrashIcon } from '../ui/icons'
import { cx, dwellVar } from '../ui/style'
import { ItemTool } from './item-tool'
import { PhraseText } from './phrase-text'

/**
 * One button on the bar. Exported for the screen shown when the app itself has
 * failed — `error-boundary.tsx` — which offers the same buttons, so they look,
 * dwell and speak there exactly as they do here.
 */
export function EmergencyButton({
  phrase,
  voice,
  reorder,
  held,
  tools,
  saysInEditMode,
  onPeek,
}: {
  phrase: Phrase
  voice?: string
  /** Present on every other button while one is in the air — somewhere to put it. */
  reorder?: ReorderProps
  /** This is the phrase in the air — lifted by its own drag pad. */
  held?: boolean
  /** **The emergency phrase open in the message box** carries its tools — see `EmergencyBar`. */
  tools?: React.ReactNode
  /**
   * **Says itself in edit mode too**, while the box is in use — see
   * `saysInEditMode` on `EmergencyBar`.
   */
  saysInEditMode?: boolean
  /** Its words to show whole while it is rested on — see `clipped` in `EmergencyBar`. */
  onPeek?: (words: string | null) => void
}) {
  const { settings } = useSettings()
  const { editMode: editModeOn, openEdit } = useEdit()
  // Edit mode as far as this button is concerned: a thing to open, or — while
  // a phrase is being written — a thing to say, as it is everywhere else.
  const editMode = editModeOn && !saysInEditMode
  const [flash, setFlash] = useState(false)

  const handleActivate = useCallback(() => {
    // Reordering takes precedence: while it is on, a button is a thing to move
    // rather than a thing to open — or, outside edit mode, to say.
    if (reorder) {
      reorder.onLiftOrDrop()
      return
    }
    if (editMode) {
      openEdit(phrase, true)
      return
    }
    // Never waits on the network. A phrase given its own voice keeps it here,
    // because assigning one fetches and stores the audio — so it is already in
    // hand. Anything not in hand is said by the device this instant rather than
    // in the right voice a second and a half from now: "I can't breathe" does
    // not get to depend on the wifi.
    // Please too, when it is on — but only as it is in hand, never waited for.
    speak(phrase.text, settings, { voiceURI: voice, instant: true, please: settings.please })
    setFlash(true)
    setTimeout(() => setFlash(false), 400)
  }, [phrase, voice, editMode, openEdit, settings, reorder])

  // Emergency phrases use the same dwell time as any other phrase. A shorter
  // fixed value would fire early for anyone who lengthened their dwell because
  // of tremor — exactly the users most likely to need this bar.
  // The words, not the markup — see the grid cell for why.
  const spoken = stripMarkdown(phrase.text)

  const { active, props } = useDwellControl(settings.phraseDwellMs, handleActivate, {
    // A dwell landing mid-drag would lift a second button out from under the
    // one already in the pointer's hand.
    // The phrase open in the box answers to its tools, not to itself.
    disabled: reorder?.dragging || Boolean(tools),
    // **Live while something else is being said**, when it is saying: it
    // never waits on anything, and saying it stops what was playing. Being
    // arranged or edited, it is a thing to change, and waits like the rest.
    whileSpeaking: !editMode && !reorder,
  })

  return (
    <div
      className={cx(
        'emergency-btn',
        active && 'dwelling',
        flash && 'flashed',
        editMode && !reorder && 'edit-mode',
        tools ? 'has-tools' : null,
        held && 'is-held',
        // Somewhere the held phrase could go — every other button, while one is
        // in the air.
        reorder?.heldLabel && 'is-drop-zone',
        reorder?.dropTarget && 'is-drop-target',
      )}
      style={dwellVar(settings.phraseDwellMs)}
      role="button"
      aria-label={
        reorder ? reorderLabel(reorder, spoken, 'phrase') : editMode ? `Edit emergency phrase: ${spoken}` : spoken
      }
      draggable={reorder ? true : undefined}
      onDragStart={reorder?.onDragStart}
      onDragOver={
        reorder &&
        (e => {
          // Without this the browser refuses the drop outright.
          e.preventDefault()
          reorder.onDragOver()
        })
      }
      onDragEnd={reorder?.onDragEnd}
      onDrop={
        reorder &&
        (e => {
          e.preventDefault()
          reorder.onDrop()
        })
      }
      {...props}
      onPointerEnter={e => {
        props.onPointerEnter?.(e)
        onPeek?.(spoken)
      }}
      onPointerLeave={() => {
        props.onPointerLeave()
        onPeek?.(null)
      }}
    >
      <span className="emergency-label">
        <PhraseText segments={phrase.segments} />
      </span>
      {tools && <span className="cell-tools">{tools}</span>}
      <div className="emergency-dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

/**
 * **Adding an emergency phrase, right after the last button** — a bare plus
 * with a round wash behind it as it is rested on, as Add category follows the
 * last tab, and in every mode as that one is. It opens a dialog for the words
 * (`EmergencyModal`), so it takes no more of the bar than its glyph.
 */
function AddEmergency({ onActivate }: { onActivate: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onActivate)
  return (
    <div
      className={cx('emergency-add', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="button"
      aria-label="Add emergency phrase"
      {...props}
    >
      <PlusIcon />
      <span className="emergency-add-fill" key={active ? 'a' : 'i'} />
    </div>
  )
}

export function EmergencyBar({
  phrases,
  voiceFor,
  open,
  onDeleteOpen,
  saysInEditMode,
  onReorder,
  onLift,
  onPeek,
  onAdd,
}: {
  phrases: Phrase[]
  voiceFor: (id: string) => string | undefined
  /**
   * **The emergency phrase open in the message box**, in edit mode. Its button
   * carries a bin against its left edge, which asks first, and a drag pad
   * against its right — as a phrase open in the grid does.
   */
  open?: { id: string; changed: boolean } | null
  onDeleteOpen?: () => void
  /**
   * **Whether a button chosen in edit mode is said rather than opened** — true
   * while the box holds a phrase or any words. Opened, it would go into them
   * at the caret, and an emergency phrase is for saying: somebody in the
   * middle of rewording something who needs help has no time to clear the
   * box first. Into an empty box it opens, which is how one is changed.
   */
  saysInEditMode?: boolean
  /**
   * **The words of the button rested on, while any button's words are cut
   * off** — a phone held upright fits six buttons a word or two wide — shown
   * whole and large in the middle of the phrase table. Null when the pointer
   * leaves it, or when nothing on the bar is cut off.
   */
  onPeek?: (words: string | null) => void
  /** Edit mode only. */
  onReorder?: (from: string, to: string) => void
  /** Announced when a phrase is picked up — the styling alone says nothing aloud. */
  onLift?: (text: string) => void
  /** The plus after the last button, in every mode — see `AddEmergency`. */
  onAdd: () => void
}) {
  const { editMode } = useEdit()
  // A phrase is keyed by its id, so what it is called has to be looked up: two
  // buttons can read the same and an id survives rewording either of them.
  const labelOf = (id: string) => phrases.find(p => p.id === id)?.text ?? id
  const { propsFor, release, held, dragging } = useReorder({ onReorder, onLift, labelOf })

  // Put back whatever was in the air when the phrase open in the box is another,
  // or none, or edit mode ends — the tool that lifted it has gone.
  const openId = open?.id ?? null
  const changed = open?.changed ?? false
  useEffect(() => {
    release()
  }, [openId, changed, editMode, release])

  // In the air by a dwell or by a mouse: either way every other one is
  // somewhere to put it.
  const inHand = held ?? dragging
  /** The open phrase's two tools: the bin against its left edge, the drag pad against its right. */
  const toolsFor = (id: string) => (
    <>
      <ItemTool className="delete-tool" label="Delete this emergency phrase" onActivate={() => onDeleteOpen?.()}>
        <TrashIcon />
      </ItemTool>
      {onReorder && (
        <ItemTool
          className="reorder-tool"
          label={held === id ? 'Put it back where it was' : 'Move this emergency phrase'}
          pressed={held === id}
          onActivate={() => propsFor(id).onLiftOrDrop()}
          drag={propsFor(id)}
        >
          <GripIcon />
        </ItemTool>
      )}
    </>
  )

  /**
   * Whether any button's words are cut off — wider or taller than the button
   * shows. Measured on every change to the bar and every resize of it, since a
   * phone turned on its side is a bar where nothing is.
   */
  const barRef = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState(false)
  const labels = phrases.map(p => p.text).join('\n')
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const measure = () =>
      setClipped(
        [...bar.querySelectorAll<HTMLElement>('.emergency-btn')].some(
          b => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1,
        ),
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [labels, editMode])
  // Nothing cut off is nothing to show, whatever was being shown.
  useEffect(() => {
    if (!clipped) onPeek?.(null)
  }, [clipped, onPeek])

  // Drawn with nothing on it, as the plus that puts something there.
  return (
    <div ref={barRef} className="emergency-bar" role="group" aria-label="Emergency phrases">
      {phrases.map(p => (
        <EmergencyButton
          key={p.id}
          phrase={p}
          voice={voiceFor(p.id)}
          reorder={inHand && inHand !== p.id ? propsFor(p.id) : undefined}
          held={held === p.id}
          tools={p.id === openId ? toolsFor(p.id) : undefined}
          saysInEditMode={saysInEditMode}
          onPeek={clipped ? onPeek : undefined}
        />
      ))}
      {/* **Adding one, right after the last**, as a new tab follows the last
          tab. Arranging and deleting are the open phrase's own tools. */}
      <AddEmergency
        onActivate={() => {
          // Whatever is in the air is put back, as it is when the phrase open
          // in the box changes: the plus is going somewhere else.
          release()
          onAdd()
        }}
      />
    </div>
  )
}
