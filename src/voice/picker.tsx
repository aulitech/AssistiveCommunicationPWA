// Choosing a voice.
//
// One control, used in two places: the app's voice in Settings, and a single
// phrase's own voice in the editor. They were a full-screen grid and a dropdown
// respectively, which meant the harder choice — one voice out of sixty for one
// phrase — was the one made through the worse control.
//
// Choosing speaks a sample and leaves the grid open. Nobody can tell sixty
// voices apart by name, and a preview button beside each would put two targets
// in every tile — the worst thing to give somebody aiming by gaze. So the tile
// is the preview: try them until one sounds right, then Done. Cancel puts back
// the voice it opened on, which is what makes trying them free.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSettings } from '../ui/settings'
import { PickerFilter, PickerModal, PickerTile, PickerTrigger } from '../ui/controls'
import { loadElevenLabs } from '../core/store'
import { remoteVoiceURI } from './elevenlabs'
import { inGroup, voiceGroups, voiceLabel, type VoiceChoice } from './groups'
import { speak, subscribeVoices } from './speech'

/** Short, and it says what it is. Cached after the first time on a paid voice. */
const SAMPLE = 'This is how I sound.'

export function VoicePicker({ value, onChange, defaultLabel, sampleText }: {
  /** The chosen `voiceURI`; empty means whatever the default is called below. */
  value: string
  onChange: (voiceURI: string) => void
  /** What the empty choice reads as — "Default" here, "Same as everything else" there. */
  defaultLabel: string
  /** What the preview says. A phrase previews itself; the app previews a sample. */
  sampleText?: string
}) {
  const { settings } = useSettings()
  const [deviceVoices, setDeviceVoices] = useState<SpeechSynthesisVoice[]>([])
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState<string | null>(null)
  /** What to put back if they leave without settling on one. */
  const [before, setBefore] = useState(value)
  // Re-read when the grid opens: linking an account happens in the same panel,
  // and this way the new voices are simply there.
  const [account, setAccount] = useState(loadElevenLabs)

  useEffect(() => subscribeVoices(setDeviceVoices), [])

  const items = useMemo<VoiceChoice[]>(() => {
    return [
      { voiceURI: '', name: defaultLabel, lang: '' },
      // The account's voices come first: somebody who went to the trouble of
      // linking one is looking for those, not scrolling past sixty the device
      // came with.
      ...(account?.voices ?? []).map(v => ({
        voiceURI: remoteVoiceURI(v.id),
        name: v.name,
        remote: true,
        collection: v.collection,
      })),
      ...deviceVoices.map(v => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang })),
    ]
  }, [deviceVoices, defaultLabel, account])

  const current = items.find(v => v.voiceURI === value) ?? items[0]
  const groups = useMemo(() => voiceGroups(items), [items])
  const shown = useMemo(() => items.filter(v => inGroup(v, group)), [items, group])

  const openPicker = useCallback(() => {
    setAccount(loadElevenLabs())
    setBefore(value)
    // Opens on the language the board is spoken in, where there is one and it
    // has voices here — sixty voices in languages nobody is going to choose is
    // the whole reason the chips exist. Only when that group is real: a
    // language set on another device may have nothing behind it on this one,
    // and a filter that shows an empty grid reads as a fault.
    const chosen = settings.language ? `lang:${settings.language}` : null
    setGroup(chosen && groups.some(g => g.id === chosen) ? chosen : null)
    setOpen(true)
  }, [value, settings.language, groups])

  // Applied as it is chosen, and spoken with the voice actually picked rather
  // than the one in settings — that update has not reached this render yet.
  const pick = useCallback(
    (voiceURI: string) => {
      onChange(voiceURI)
      speak(sampleText?.trim() || SAMPLE, settings, { voiceURI })
    },
    [onChange, settings, sampleText],
  )

  const cancel = useCallback(() => {
    onChange(before)
    setOpen(false)
  }, [onChange, before])

  return (
    <>
      <PickerTrigger
        className="voice-trigger"
        label={voiceLabel(current)}
        name={`Voice: ${voiceLabel(current)}. Choose another`}
        onOpen={openPicker}
        open={open}
      />

      {open && (
        <PickerModal
          title="Choose a voice"
          hint="Each one speaks as you choose it"
          filters={
            groups.length > 1 && (
              <>
                <PickerFilter
                  label="All"
                  count={items.length}
                  active={group === null}
                  onSelect={() => setGroup(null)}
                />
                {groups.map(g => (
                  <PickerFilter
                    key={g.id}
                    label={g.label}
                    count={g.count}
                    active={group === g.id}
                    onSelect={() => setGroup(g.id)}
                  />
                ))}
              </>
            )
          }
          onDone={() => setOpen(false)}
          onCancel={cancel}
        >
          {shown.map((v, i) => (
            <PickerTile
              key={`${v.voiceURI}-${i}`}
              name={v.name}
              detail={v.remote ? 'ElevenLabs' : v.lang}
              className={v.remote ? 'is-remote' : undefined}
              selected={v.voiceURI === value}
              onSelect={() => pick(v.voiceURI)}
            />
          ))}
        </PickerModal>
      )}
    </>
  )
}
