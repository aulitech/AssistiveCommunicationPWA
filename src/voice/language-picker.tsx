// Choosing the language the board is spoken in.
//
// Beside `VoicePicker` and shaped like it, because the two are asked together:
// a voice is a language, and since a voice is now remembered *per* language the
// pair are one setting with two halves. Both are reached from the settings
// panel and, on a screen wide enough to hold them, from the topbar — so the
// choosing lives here rather than in either of those.
//
// A full-screen grid rather than a `<select>`, for the reason every other
// choice in this app is one: an operating system draws a native list outside
// the page, where nothing can be hovered and so nothing can be dwelled on.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PickerModal, PickerTile, PickerTrigger } from '../ui/controls'
import { usePendingChoice } from '../ui/pending-choice'
import { languageLabel, offeredLanguages } from './groups'
import { subscribeVoices } from './speech'

export function LanguagePicker({
  value,
  onChange,
  /** Rendered in place of the default trigger, for the topbar's compact one. */
  children,
}: {
  value: string
  /** Takes the device's voices too: what to do with the old one depends on them. */
  onChange: (tag: string, voices: SpeechSynthesisVoice[]) => void
  children?: (props: { label: string; open: () => void; isOpen: boolean }) => React.ReactNode
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => subscribeVoices(setVoices), [])

  const languages = useMemo(() => offeredLanguages(voices), [voices])
  const label = languageLabel(value, voices)

  // Marked on a rest, written on Done — see `usePendingChoice`. Held rather than
  // applied and put back, because choosing a language writes down the voice it
  // is leaving, and one only passed over must not leave a voice behind it.
  const commit = useCallback((tag: string) => onChange(tag, voices), [onChange, voices])
  const { open, pending, mark, begin, done, cancel } = usePendingChoice(value, commit)

  return (
    <>
      {children ? (
        children({ label, open: begin, isOpen: open })
      ) : (
        <PickerTrigger
          label={label}
          name={`Spoken language: ${label}. Choose another`}
          onOpen={begin}
          open={open}
        />
      )}
      {open && (
        <PickerModal
          title="Choose a spoken language"
          hint="The languages this device has voices for"
          onDone={done}
          onCancel={cancel}
        >
          <PickerTile
            name="Device default"
            detail="Whatever this device speaks"
            selected={pending === ''}
            onSelect={() => mark('')}
          />
          {languages.map(l => (
            <PickerTile
              key={l.tag}
              name={l.label}
              detail={
                l.count === 0
                  ? 'Peri translates it · no voice on this device'
                  : `${l.tag} · ${l.count} ${l.count === 1 ? 'voice' : 'voices'}`
              }
              selected={pending === l.tag}
              onSelect={() => mark(l.tag)}
            />
          ))}
        </PickerModal>
      )}
    </>
  )
}
