
// Menu → My details. Supplies the {contact} and {name} values the phrase table
// ships empty, so phrases that name someone have something to offer.

import { useCallback, useState } from 'react'
import { useDwellControl } from './dwell'
import { useSettings } from './settings'
import { type Profile } from './phrases'
import { PlusIcon } from './icons'
import { cx, dwellVar } from './style'
import { SettingRow } from './ui'

function ContactRow({ name, onRemove }: { name: string; onRemove: () => void }) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onRemove)
  return (
    <div className="contact-row">
      <span className="contact-name">{name}</span>
      <div
        className={cx('contact-remove', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-label={`Remove ${name}`}
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

export function ProfilePanel({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const { settings } = useSettings()
  const [draft, setDraft] = useState('')

  const setName = (field: keyof Profile['name'], value: string) =>
    onChange({ ...profile, name: { ...profile.name, [field]: value } })

  const addContact = useCallback(() => {
    const name = draft.trim()
    if (!name || profile.contacts.includes(name)) return
    onChange({ ...profile, contacts: [...profile.contacts, name] })
    setDraft('')
  }, [draft, profile, onChange])

  const { active: addActive, props: addProps } = useDwellControl(settings.actionDwellMs, addContact, {
    disabled: draft.trim() === '',
  })

  return (
    <div className="settings-panel">
      <p className="profile-hint">
        Used by phrases that name someone — “This is …”, “I'm going to call …”.
      </p>

      <SettingRow label="Nickname">
        <input
          className="profile-input"
          value={profile.name.nickname}
          onChange={e => setName('nickname', e.target.value)}
          placeholder="What people call you"
          aria-label="Nickname"
        />
      </SettingRow>
      <SettingRow label="First name">
        <input
          className="profile-input"
          value={profile.name.given}
          onChange={e => setName('given', e.target.value)}
          aria-label="First name"
        />
      </SettingRow>
      <SettingRow label="Last name">
        <input
          className="profile-input"
          value={profile.name.surname}
          onChange={e => setName('surname', e.target.value)}
          aria-label="Last name"
        />
      </SettingRow>

      <div className="contact-list" role="group" aria-label="Contacts">
        <span className="setting-label">Contacts</span>
        {profile.contacts.length === 0 && <p className="profile-empty">Nobody added yet.</p>}
        {profile.contacts.map(name => (
          <ContactRow
            key={name}
            name={name}
            onRemove={() => onChange({ ...profile, contacts: profile.contacts.filter(c => c !== name) })}
          />
        ))}
        <div className="contact-add">
          <input
            className="profile-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addContact()
              }
            }}
            placeholder="Add a name…"
            aria-label="Add a contact"
          />
          <div
            className={cx('contact-add-btn', addActive && 'dwelling', !draft.trim() && 'is-disabled')}
            style={dwellVar(settings.actionDwellMs)}
            role="button"
            aria-label="Add contact"
            {...addProps}
          >
            <div className="dwell-bar" key={addActive ? 'a' : 'i'} />
            <PlusIcon />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── BackupPanel ───────────────────────────────────────────────────────────────
// Everything a user has made of Peri lives in this browser and nowhere else, so
// this is both the backup and the only way to move a board between devices or
// hand one to somebody else.
