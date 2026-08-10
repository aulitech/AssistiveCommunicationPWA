
// Filling in a phrase's blanks. A phrase with two or more options behind a slot
// asks for them one slot at a time before it is delivered anywhere.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { BLANK, compose, type Phrase } from '../core/phrases'
import { cx, dwellVar } from '../ui/style'

function SlotOption({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const { settings } = useSettings()
  const handle = useCallback(() => onPick(value), [value, onPick])
  const { active, props } = useDwellControl(settings.phraseDwellMs, handle)
  return (
    <div
      className={cx('slot-option', active && 'dwelling')}
      style={dwellVar(settings.phraseDwellMs)}
      role="button"
      aria-label={value}
      {...props}
    >
      {value}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

export function SlotPicker({ phrase, onComplete, onCancel }: {
  phrase: Phrase
  onComplete: (text: string) => void
  onCancel: () => void
}) {
  const { settings } = useSettings()
  const [choices, setChoices] = useState<(string | null)[]>(() =>
    phrase.segments.filter(s => s.kind === 'slot').map(() => null),
  )

  // Indices (within the slot sequence) that the user actually chooses from.
  const steps = useMemo(() => {
    const out: number[] = []
    let slot = -1
    for (const segment of phrase.segments) {
      if (segment.kind !== 'slot') continue
      slot++
      if (segment.options.length > 0) out.push(slot)
    }
    return out
  }, [phrase])

  const [step, setStep] = useState(0)
  const slotIndex = steps[step]

  const options = useMemo(() => {
    let slot = -1
    for (const segment of phrase.segments) {
      if (segment.kind !== 'slot') continue
      slot++
      if (slot === slotIndex) return segment.options
    }
    return []
  }, [phrase, slotIndex])

  const pick = useCallback(
    (value: string) => {
      const next = [...choices]
      next[slotIndex] = value
      setChoices(next)
      if (step + 1 < steps.length) setStep(step + 1)
      else onComplete(compose(phrase.segments, next))
    },
    [choices, slotIndex, step, steps.length, phrase, onComplete],
  )

  const cancelHook = useDwellControl(settings.actionDwellMs, onCancel)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Preview with choices made so far; the slot in play is highlighted.
  let slot = -1
  const preview = phrase.segments.map((segment, i) => {
    if (segment.kind === 'text') return <span key={i}>{segment.text}</span>
    slot++
    const chosen = choices[slot]
    const isCurrent = slot === slotIndex
    return (
      <span key={i} className={cx('phrase-slot', isCurrent && 'is-current', chosen && 'is-filled')}>
        {chosen ?? (segment.options.length ? segment.label : BLANK)}
      </span>
    )
  })

  return (
    <div className="slot-picker-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="slot-picker" role="dialog" aria-modal="true" aria-label="Choose wording">
        <div className="slot-picker-preview">{preview}</div>
        <div className="slot-picker-step">
          Choose {steps.length > 1 ? `${step + 1} of ${steps.length}` : 'a word'}
        </div>
        <div className="slot-options" role="group">
          {options.map(option => (
            <SlotOption key={option} value={option} onPick={pick} />
          ))}
        </div>
        <div
          className={cx('slot-cancel', cancelHook.active && 'dwelling')}
          style={dwellVar(settings.actionDwellMs)}
          role="button"
          aria-label="Cancel"
          {...cancelHook.props}
        >
          <div className="dwell-bar" key={cancelHook.active ? 'a' : 'i'} />
          Cancel
        </div>
      </div>
    </div>
  )
}
