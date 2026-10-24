// The keyboard Peri draws for itself.
//
// Ninety-odd dwell targets, in the same shape as every other control here, for
// the one job the app used to hand to the operating system. On iOS a pointer
// that only hovers can neither raise the software keyboard nor press its keys,
// so without this there is no way to type a word anywhere in the app — not a
// message, not a phrase, not a category name, not a passphrase.
//
// It types into whatever field has the caret rather than into any box it knows
// about, which is what lets one keyboard serve all of them. See `ui/typing.ts`.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LETTER_ROWS, SYMBOL_ROWS, afterTyping, nextShift, shifted, type Shift } from '../core/keys'
import { useDwellControl } from './dwell'
import { useSettings } from './settings'
import { deleteBack, insertText, useFocusedField, type TextField } from './typing'
import { cx, dwellVar } from './style'

/**
 * One key.
 *
 * **It refuses focus on the way down.** A dwell control is focusable, and a key
 * that took the focus would take it off the very field the letter is meant for.
 * There is no pointer-down at all on the device this exists for, so this is for
 * everybody else.
 */
function Key({
  label,
  name,
  onPress,
  className = '',
  wide = false,
  repeat = false,
  active = false,
}: {
  label: React.ReactNode
  /** What a screen reader says, where the face of the key is a glyph. */
  name: string
  onPress: () => void
  className?: string
  wide?: boolean
  repeat?: boolean
  active?: boolean
}) {
  const { settings } = useSettings()
  const { active: dwelling, props } = useDwellControl(settings.actionDwellMs, onPress, {
    repeatMs: repeat ? settings.repeatDelayMs : undefined,
  })
  return (
    <div
      role="button"
      aria-label={name}
      aria-pressed={active || undefined}
      className={cx('key', className, wide && 'is-wide', active && 'is-on', dwelling && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      onPointerDown={e => e.preventDefault()}
      {...props}
    >
      <div className="dwell-bar" key={dwelling ? 'a' : 'i'} />
      {label}
    </div>
  )
}

/**
 * The board of keys, and the shift and layer state behind it.
 *
 * Shift is a **ring**, the way the modes on the message box are: one dwell arms
 * it for a single letter, a second locks it, a third puts it away. Two states
 * would mean no way to type a run of capitals; a separate lock key would mean
 * two targets where a gaze user has room for one.
 */
export function Keyboard({
  onClose,
  above,
  covers,
}: {
  onClose: () => void
  /** What it stands on — the emergency bar, which it must never cover. */
  above?: string
  /** What it floats over — the phrase grid, which makes room for it. */
  covers?: string
}) {
  const [shift, setShift] = useState<Shift>('off')
  /**
   * **Floating over the board, on the bar below it.** It took the bottom third
   * of the screen and the board gave it up, so a keyboard opened was a board
   * a third shorter. It floats now, translucent, standing on `above` — the
   * emergency bar, the one surface somebody reaches for without reading, which
   * it must not cover — and it says how much of `covers` it hides
   * (`--keyboard-covers`), so the grid can scroll its last rows clear of it
   * and lift its down arrow above it. Measured again whenever either moves.
   */
  const boardRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = document.documentElement
    const place = () => {
      const keyboard = boardRef.current
      if (!keyboard) return
      const bar = above ? document.querySelector(above)?.getBoundingClientRect() : undefined
      const lift = bar && bar.height > 0 ? Math.max(0, window.innerHeight - bar.top) : 0
      keyboard.style.bottom = `${lift}px`
      const under = covers ? document.querySelector(covers)?.getBoundingClientRect() : undefined
      const top = keyboard.getBoundingClientRect().top
      const hidden = under && under.height > 0 ? Math.max(0, under.bottom - top) : 0
      root.style.setProperty('--keyboard-covers', `${hidden}px`)
    }
    place()
    const observer = new ResizeObserver(place)
    for (const sel of [above, covers]) {
      const el = sel ? document.querySelector(sel) : null
      if (el) observer.observe(el)
    }
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      root.style.removeProperty('--keyboard-covers')
    }
  }, [above, covers])
  const [symbols, setSymbols] = useState(false)
  const fieldOf = useFocusedField()
  // Read through a ref: a key is one of ninety and its handler must not be
  // rebuilt every time the shift state changes.
  const shiftRef = useRef(shift)
  useEffect(() => {
    shiftRef.current = shift
  })

  const withField = useCallback(
    (act: (field: TextField) => void) => {
      const field = fieldOf()
      if (!field) return
      act(field)
    },
    [fieldOf],
  )

  const type = useCallback(
    (text: string) => {
      withField(field => insertText(field, text))
      setShift(afterTyping(shiftRef.current))
    },
    [withField],
  )

  const back = useCallback(() => withField(field => deleteBack(field)), [withField])

  const [top, middle, bottom] = symbols ? SYMBOL_ROWS : LETTER_ROWS

  // Shift capitalises; a digit or a full stop has no capital form, so the
  // symbol layer needs no special case. `core/keys.ts` holds that — it keeps
  // letters off that layer.
  const keysOf = (row: string[]) =>
    row.map(key => {
      const face = shifted(key, shift)
      return <Key key={key} label={face} name={face} onPress={() => type(face)} />
    })

  return (
    <div ref={boardRef} className="keyboard" role="group" aria-label="Keyboard">
      <div className="key-row">{keysOf(top)}</div>
      <div className="key-row">{keysOf(middle)}</div>

      {/* Shift and backspace flank the short row, in both layers, so neither
          moves when the layer does. On the symbol layer there is nothing for
          shift to do, so it is a gap rather than a key that answers to nothing —
          a dead target is only slightly better than a wrong one. */}
      <div className="key-row">
        {symbols ? (
          <span className="key-gap" aria-hidden="true" />
        ) : (
          <Key
            label="⇧"
            name={shift === 'lock' ? 'Capitals locked' : shift === 'once' ? 'Shift' : 'Shift, off'}
            onPress={() => setShift(nextShift(shiftRef.current))}
            className={cx('key-tool', shift === 'lock' && 'is-locked')}
            active={shift !== 'off'}
          />
        )}
        {keysOf(bottom)}
        <Key label="⌫" name="Backspace" onPress={back} className="key-tool" repeat />
      </div>

      <div className="key-row">
        <Key label="✕" name="Close the keyboard" onPress={onClose} className="key-tool" />
        <Key
          label={symbols ? 'abc' : '?123'}
          name={symbols ? 'Letters' : 'Numbers and punctuation'}
          onPress={() => setSymbols(s => !s)}
          className="key-tool"
          active={symbols}
        />
        <Key label="space" name="Space" onPress={() => type(' ')} className="key-space" wide />
        <Key label="⏎" name="New line" onPress={() => type('\n')} className="key-tool" />
      </div>
    </div>
  )
}
