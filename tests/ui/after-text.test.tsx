import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { AfterText } from '../../src/ui/after-text'

// What jsdom can say about `AfterText`: what it gives the copy it lays the
// words out in. Where that puts the control is `e2e/layout.spec.ts`'s question.

function Box({ width }: { width: number }) {
  const field = useRef<HTMLTextAreaElement>(null)
  return (
    <div>
      <textarea
        ref={el => {
          field.current = el
          if (!el) return
          // A box flex has shared a line out to: fractional, which `offsetWidth`
          // rounds away.
          el.getBoundingClientRect = () => ({
            width,
            height: 40,
            top: 0,
            left: 0,
            right: width,
            bottom: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          })
          Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => Math.round(width) })
        }}
        defaultValue="Some words"
      />
      <AfterText fieldRef={field} value="Some words">
        <button type="button">Speak</button>
      </AfterText>
    </div>
  )
}

describe('AfterText', () => {
  // Regression guard: a copy a fraction narrower than the box breaks its lines
  // a word early wherever the last word only fits in the fraction, and the
  // control stood after the wrong word.
  it('lays the copy out at the box’s width to the fraction of a pixel', () => {
    const { container } = render(<Box width={387.11} />)
    expect(container.querySelector<HTMLElement>('.after-text-mirror')!.style.width).toBe('387.11px')
  })
})
