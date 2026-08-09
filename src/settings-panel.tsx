
// Menu → Settings. Dwell times, volume, speed and voice.

import { useEffect, useMemo, useState } from 'react'
import { useDwellControl } from './dwell'
import { useSettings } from './settings'
import { subscribeVoices } from './speech'
import { cx, dwellVar } from './style'
import { ScrollPane, SettingRow, SettingSpinner } from './ui'

function VoiceDropdownItem({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onSelect)
  return (
    <div
      className={cx('voice-option', selected && 'selected', active && 'dwelling')}
      style={dwellVar(settings.actionDwellMs)}
      role="option"
      aria-selected={selected}
      {...props}
    >
      {label}
      <div className="dwell-bar" key={active ? 'a' : 'i'} />
    </div>
  )
}

function voiceLabel(v: { name: string; lang?: string }) {
  return v.lang ? `${v.name} · ${v.lang}` : v.name
}

function VoiceRow({ voices }: { voices: SpeechSynthesisVoice[] }) {
  const { settings, update } = useSettings()
  const [open, setOpen] = useState(false)
  const items = useMemo(
    () => [{ voiceURI: '', name: 'Default', lang: '' }, ...voices.map(v => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang }))],
    [voices],
  )
  const current = items.find(v => v.voiceURI === settings.voiceURI) ?? items[0]

  const { active, props } = useDwellControl(settings.actionDwellMs, () => setOpen(o => !o))

  return (
    <SettingRow label="Voice">
      <div className="voice-dropdown">
        <div
          className={cx('voice-trigger', active && 'dwelling')}
          style={dwellVar(settings.actionDwellMs)}
          role="combobox"
          aria-expanded={open}
          aria-label={`Voice: ${voiceLabel(current)}`}
          {...props}
        >
          <span className="voice-trigger-label">{voiceLabel(current)}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <div className="dwell-bar" key={active ? 'a' : 'i'} />
        </div>
        {open && (
          <div className="voice-list" role="listbox" onPointerLeave={() => setOpen(false)}>
            <ScrollPane className="voice-scroller" paneClassName="voice-list-inner">
              {items.map((v, i) => (
                <VoiceDropdownItem
                  key={`${v.voiceURI}-${i}`}
                  label={voiceLabel(v)}
                  selected={v.voiceURI === settings.voiceURI}
                  onSelect={() => {
                    update({ voiceURI: v.voiceURI })
                    setOpen(false)
                  }}
                />
              ))}
            </ScrollPane>
          </div>
        )}
      </div>
    </SettingRow>
  )
}

export function SettingsPanel() {
  const { settings, update } = useSettings()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => subscribeVoices(setVoices), [])

  return (
    <div className="settings-panel">
      <SettingRow label="Phrase dwell">
        <SettingSpinner
          value={settings.phraseDwellMs}
          min={500}
          max={3000}
          step={100}
          format={v => `${(v / 1000).toFixed(1)}s`}
          onValue={v => update({ phraseDwellMs: v })}
        />
      </SettingRow>
      <SettingRow label="Action dwell">
        <SettingSpinner
          value={settings.actionDwellMs}
          min={300}
          max={2000}
          step={100}
          format={v => `${(v / 1000).toFixed(1)}s`}
          onValue={v => update({ actionDwellMs: v })}
        />
      </SettingRow>
      <SettingRow label="Volume">
        <SettingSpinner
          value={Math.round(settings.volume * 100)}
          min={0}
          max={100}
          step={10}
          format={v => `${v}%`}
          onValue={v => update({ volume: v / 100 })}
        />
      </SettingRow>
      <SettingRow label="Speed">
        <SettingSpinner
          value={Math.round(settings.rate * 10)}
          min={5}
          max={20}
          step={1}
          format={v => `${(v / 10).toFixed(1)}×`}
          onValue={v => update({ rate: v / 10 })}
        />
      </SettingRow>
      {voices.length > 0 && <VoiceRow voices={voices} />}
    </div>
  )
}

// ── ProfilePanel ──────────────────────────────────────────────────────────────
// Supplies the values behind {contact} and {name.nickname}. Typed rather than
// dwelled: it is one-off setup, usually done by whoever sets the device up.
