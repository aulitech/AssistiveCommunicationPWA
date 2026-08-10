import { describe, it, expect } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  IMPORTED_CATEGORY,
  applyBackup,
  backupFilename,
  buildBackup,
  canReplace,
  describeBackup,
  parseBackup,
  serializeBackup,
  summarize,
  type AppState,
  type Backup,
} from './backup'
import { DEFAULT_SETTINGS, emptyStore, type PhraseStore } from './store'
import { EMPTY_PROFILE, type Profile } from './phrases'
import { saveElevenLabs, saveSent } from './store'

// A store with something of the user's in every field, and the map of ids to
// categories the app would hand alongside it.
function fixture(): { state: AppState; categoryById: Map<string, string> } {
  const store: PhraseStore = {
    ...emptyStore(),
    custom: [
      { id: 'custom-1', text: 'Put the kettle on', category: 'Food' },
      { id: 'custom-2', text: 'The dog needs out', category: 'Home' },
    ],
    overrides: { 'built-1': "I'm knackered", 'custom-2': 'The dog needs walking' },
    hidden: ['built-2'],
    categoryRenames: { Feelings: 'Moods' },
    categories: ['Home'],
    categoryOverrides: { 'built-3': 'Home' },
    categoryOrder: ['Home', 'Food', 'Moods'],
    categorySort: 'custom',
  }
  const profile: Profile = {
    name: { given: 'Ada', surname: 'Lovelace', nickname: 'Ada' },
    contacts: ['Mum', 'Charles'],
  }
  const categoryById = new Map([
    ['custom-1', 'Food'],
    ['custom-2', 'Home'],
    ['built-1', 'Moods'],
    ['built-2', 'Food'],
    ['built-3', 'Home'],
  ])
  return {
    state: { store, profile, settings: { ...DEFAULT_SETTINGS, phraseDwellMs: 2200 } },
    categoryById,
  }
}

const exportAll = () => {
  const { state, categoryById } = fixture()
  return buildBackup({ ...state, categoryById })
}

const exportOf = (scope: string[]) => {
  const { state, categoryById } = fixture()
  return buildBackup({ ...state, categoryById, scope })
}

const fresh = (): AppState => ({ store: emptyStore(), profile: EMPTY_PROFILE, settings: DEFAULT_SETTINGS })

describe('building a backup', () => {
  it('stamps the format so a file can be told apart from any other JSON', () => {
    const backup = exportAll()
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(Date.parse(backup.exported)).not.toBeNaN()
  })

  it('carries every kind of change the user can make', () => {
    const backup = exportAll()
    expect(backup.added.map(p => p.id)).toEqual(['custom-1', 'custom-2'])
    expect(backup.edited).toEqual([{ id: 'built-1', text: "I'm knackered" }, { id: 'built-3', category: 'Home' }])
    expect(backup.removed).toEqual(['built-2'])
    expect(backup.categories.renamed).toEqual({ Feelings: 'Moods' })
    expect(backup.categories.order).toEqual(['Home', 'Food', 'Moods'])
    expect(backup.categories.sort).toBe('custom')
    expect(backup.profile?.contacts).toEqual(['Mum', 'Charles'])
    expect(backup.settings?.phraseDwellMs).toBe(2200)
  })

  // A phrase the user wrote and later reworded has both a custom entry and an
  // override. Exporting both would restore the phrase and then immediately
  // override it with the same text — twice the file for one phrase.
  it('folds an edit to a user-written phrase into the phrase itself', () => {
    const backup = exportAll()
    expect(backup.added.find(p => p.id === 'custom-2')?.text).toBe('The dog needs walking')
    expect(backup.edited.map(e => e.id)).not.toContain('custom-2')
  })

  it('keeps only the chosen categories', () => {
    const backup = exportOf(['Home'])
    expect(backup.scope).toEqual(['Home'])
    expect(backup.added.map(p => p.id)).toEqual(['custom-2'])
    expect(backup.edited.map(e => e.id)).toEqual(['built-3'])
    expect(backup.removed).toEqual([])
    expect(backup.categories.created).toEqual(['Home'])
    expect(backup.categories.order).toEqual(['Home'])
  })

  // Whose device this is, how long they need to dwell and who their contacts
  // are is not part of "here are my Food phrases".
  it('leaves the details and settings out of a few categories', () => {
    const backup = exportOf(['Home'])
    expect(backup.profile).toBeUndefined()
    expect(backup.settings).toBeUndefined()
    expect(backup.categories.sort).toBeUndefined()
  })

  it('takes a removal along with the category it was removed from', () => {
    expect(exportOf(['Food']).removed).toEqual(['built-2'])
  })

  it('treats an empty choice of categories as the whole app', () => {
    const { state, categoryById } = fixture()
    expect(buildBackup({ ...state, categoryById, scope: [] }).scope).toBeNull()
  })

  it('has nothing to say about an untouched app', () => {
    const backup = buildBackup({ ...fresh(), categoryById: new Map() })
    const summary = summarize(backup)
    expect(summary.added + summary.edited + summary.removed).toBe(0)
    expect(summary.empty).toBe(false) // the settings still ride along
    expect(summarize(buildBackup({ ...fresh(), categoryById: new Map(), scope: ['Food'] })).empty).toBe(true)
  })

  // Otherwise the panel offers someone "your details" when they have entered
  // none, and replacing from that file would clear the name on the device that
  // receives it.
  it('leaves an untouched profile out rather than writing empty strings', () => {
    const backup = buildBackup({ ...fresh(), categoryById: new Map() })
    expect(backup.profile).toBeUndefined()
    expect(summarize(backup).profile).toBe(false)
    expect(describeBackup(summarize(backup))).toBe('your settings')
  })
})

describe('reading a backup back', () => {
  const roundTrip = (backup: Backup) => {
    const result = parseBackup(serializeBackup(backup))
    if (!result.ok) throw new Error(result.error)
    return result.backup
  }

  it('survives a round trip through the file', () => {
    const backup = exportAll()
    expect(roundTrip(backup)).toEqual(backup)
  })

  it('survives a round trip of a few categories', () => {
    const backup = exportOf(['Home', 'Food'])
    expect(roundTrip(backup)).toEqual(backup)
  })

  it('turns away anything that is not a backup, with a reason', () => {
    for (const text of ['', 'not json at all', '[]', 'null', '{"format":"something-else"}']) {
      const result = parseBackup(text)
      expect(result.ok, text).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/backup/i)
    }
  })

  // Opening a newer file and silently dropping the parts this version cannot
  // read would look like a successful restore that lost half the phrases.
  it('refuses a backup from a newer Peri rather than reading half of it', () => {
    const result = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1 }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/newer version/i)
  })

  it('keeps what it can read out of a damaged file', () => {
    const result = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        added: [
          { id: 'a', text: 'Kept', category: 'Food' },
          { id: 'b' }, // no text — nothing to restore
          'nonsense',
          { text: 'No id' },
        ],
        edited: [{ id: 'c', text: 'Kept too' }, { id: '' }],
        removed: ['d', 7, null],
        categories: { created: ['Food', 3], renamed: { Old: 'New', Bad: 5 }, order: 'not a list', sort: 'sideways' },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.added).toEqual([{ id: 'a', text: 'Kept', category: 'Food' }])
    expect(result.backup.edited).toEqual([{ id: 'c', text: 'Kept too' }])
    expect(result.backup.removed).toEqual(['d'])
    expect(result.backup.categories.created).toEqual(['Food'])
    expect(result.backup.categories.renamed).toEqual({ Old: 'New' })
    expect(result.backup.categories.order).toEqual([])
    expect(result.backup.categories.sort).toBeUndefined()
  })

  it('files a phrase with no category rather than dropping it', () => {
    const result = parseBackup(
      JSON.stringify({ format: BACKUP_FORMAT, version: 1, added: [{ id: 'a', text: 'Homeless' }] }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.backup.added[0].category).toBe(IMPORTED_CATEGORY)
  })

  // A dwell of zero fires every control the instant a pointer crosses it. For
  // someone driving Peri by gaze that leaves no working control to undo it with,
  // so a file does not get to set one the settings panel could not.
  it('holds imported settings to the same limits as the settings panel', () => {
    const result = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        settings: { phraseDwellMs: 0, actionDwellMs: -5, volume: 99, rate: 40, voiceURI: 7, autoSpeak: 'yes' },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.settings).toEqual({
      phraseDwellMs: 500,
      actionDwellMs: 300,
      voiceURI: '',
      volume: 1,
      rate: 2,
      autoSpeak: false,
    })
  })

  it('falls back to the defaults for a setting that is missing or nonsense', () => {
    const result = parseBackup(
      JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: { phraseDwellMs: 'quick' } }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.backup.settings).toEqual(DEFAULT_SETTINGS)
  })
})

describe('describing a backup', () => {
  it('counts what is in it', () => {
    const summary = summarize(exportAll())
    expect(summary).toMatchObject({ added: 2, edited: 2, removed: 1, profile: true, settings: true, empty: false })
  })

  it('says so plainly, in English', () => {
    expect(describeBackup(summarize(exportAll()))).toBe(
      '2 phrases you added, 2 edits, 1 phrase you removed, your details, your settings',
    )
    expect(describeBackup(summarize(buildBackup({ ...fresh(), categoryById: new Map(), scope: ['Food'] })))).toMatch(
      /nothing/i,
    )
  })

  it('names the file after what is in it and when', () => {
    const at = { exported: '2026-08-08T09:30:00.000Z' }
    expect(backupFilename({ ...exportAll(), ...at })).toBe('peri-backup-2026-08-08.json')
    expect(backupFilename({ ...exportOf(['Home']), ...at })).toBe('peri-Home-2026-08-08.json')
    expect(backupFilename({ ...exportOf(['Home', 'Food']), ...at })).toBe('peri-2-categories-2026-08-08.json')
    // A hand-edited file with no date still gets a usable name.
    expect(backupFilename({ ...exportAll(), exported: '' })).toMatch(/^peri-backup-\d{4}-\d{2}-\d{2}\.json$/)
  })
})

describe('restoring onto a fresh device', () => {
  const restored = (mode: 'merge' | 'replace' = 'merge') => applyBackup(exportAll(), fresh(), mode)

  it('puts back everything the backup carried', () => {
    const next = restored('replace')
    expect(next.store.custom).toEqual([
      { id: 'custom-1', text: 'Put the kettle on', category: 'Food' },
      { id: 'custom-2', text: 'The dog needs walking', category: 'Home' },
    ])
    expect(next.store.overrides).toEqual({ 'built-1': "I'm knackered" })
    expect(next.store.categoryOverrides).toEqual({ 'built-3': 'Home' })
    expect(next.store.hidden).toEqual(['built-2'])
    expect(next.store.categoryRenames).toEqual({ Feelings: 'Moods' })
    expect(next.store.categoryOrder).toEqual(['Home', 'Food', 'Moods'])
    expect(next.store.categorySort).toBe('custom')
    expect(next.profile.contacts).toEqual(['Mum', 'Charles'])
    expect(next.settings.phraseDwellMs).toBe(2200)
  })

  it('gives a merge onto an empty device the same result, bar the removals', () => {
    const merged = restored('merge')
    expect(merged.store.custom).toEqual(restored('replace').store.custom)
    expect(merged.store.hidden).toEqual([])
  })
})

describe('merging into a device that is already in use', () => {
  const local = (): AppState => ({
    store: {
      ...emptyStore(),
      custom: [{ id: 'custom-local', text: 'Mine already', category: 'Food' }],
      overrides: { 'built-9': 'Local wording' },
      hidden: ['built-7'],
      categoryOrder: ['Food'],
    },
    profile: { name: { given: '', surname: '', nickname: 'Bee' }, contacts: ['Sam'] },
    settings: { ...DEFAULT_SETTINGS, rate: 1.6 },
  })

  it('keeps what was already there and adds what the file brings', () => {
    const next = applyBackup(exportAll(), local(), 'merge')
    expect(next.store.custom.map(p => p.id)).toEqual(['custom-local', 'custom-1', 'custom-2'])
    expect(next.store.overrides).toEqual({ 'built-9': 'Local wording', 'built-1': "I'm knackered" })
    expect(next.store.categoryOrder).toEqual(['Food', 'Home', 'Moods'])
  })

  // Removing a phrase is the one change the app offers no way back from, so a
  // file someone else made does not get to make one on this device.
  it('never takes a phrase away', () => {
    const next = applyBackup(exportAll(), local(), 'merge')
    expect(next.store.hidden).toEqual(['built-7'])
  })

  it('makes the device match the file when replacing instead', () => {
    const next = applyBackup(exportAll(), local(), 'replace')
    expect(next.store.custom.map(p => p.id)).toEqual(['custom-1', 'custom-2'])
    expect(next.store.overrides).toEqual({ 'built-1': "I'm knackered" })
    expect(next.store.hidden).toEqual(['built-2'])
    expect(next.profile.contacts).toEqual(['Mum', 'Charles'])
  })

  // Everything a file covering a few categories says nothing about would go.
  it('offers replacing only for a whole backup', () => {
    expect(canReplace(exportAll())).toBe(true)
    expect(canReplace(exportOf(['Home']))).toBe(false)
  })

  it('leaves no duplicates when the same file is imported twice', () => {
    const backup = exportAll()
    const once = applyBackup(backup, local(), 'merge')
    const twice = applyBackup(backup, once, 'merge')
    expect(twice.store.custom).toEqual(once.store.custom)
  })

  // Two devices give the same phrase two different ids, so an id alone would
  // let a phrase come back a second time under a different name.
  it('leaves no duplicate when the same phrase arrives under another id', () => {
    const backup: Backup = {
      ...exportAll(),
      added: [{ id: 'custom-elsewhere', text: 'Mine already', category: 'Food' }],
    }
    const next = applyBackup(backup, local(), 'merge')
    expect(next.store.custom).toHaveLength(1)
  })

  it('takes the newer wording when a phrase comes back changed', () => {
    const backup: Backup = {
      ...exportAll(),
      added: [{ id: 'custom-local', text: 'Mine, reworded', category: 'Food' }],
    }
    const next = applyBackup(backup, local(), 'merge')
    expect(next.store.custom).toEqual([{ id: 'custom-local', text: 'Mine, reworded', category: 'Food' }])
  })

  // The store reads an override before a phrase's own text, so one left behind
  // by whatever last held this id would hide the phrase just imported.
  it('clears an override that would mask an imported phrase', () => {
    const state = local()
    state.store.overrides['custom-local'] = 'Stale'
    const backup: Backup = {
      ...exportAll(),
      added: [{ id: 'custom-local', text: 'Fresh', category: 'Food' }],
    }
    const next = applyBackup(backup, state, 'merge')
    expect(next.store.overrides['custom-local']).toBeUndefined()
    expect(next.store.custom[0].text).toBe('Fresh')
  })

  it('does not write through to the state it was handed', () => {
    const before = local()
    const snapshot = JSON.parse(JSON.stringify(before))
    applyBackup(exportAll(), before, 'merge')
    expect(before).toEqual(snapshot)
  })

  it('fills in details the device is missing without erasing the ones it has', () => {
    const next = applyBackup(exportAll(), local(), 'merge')
    expect(next.profile.name.given).toBe('Ada')
    expect(next.profile.name.nickname).toBe('Ada')
    expect(next.profile.contacts).toEqual(['Sam', 'Mum', 'Charles'])
  })

  it('leaves the details and settings alone when the file has none', () => {
    const next = applyBackup(exportOf(['Home']), local(), 'merge')
    expect(next.profile).toEqual(local().profile)
    expect(next.settings.rate).toBe(1.6)
  })
})

// A backup is made to be shared. An API key in one hands over the account it
// belongs to, and whatever that account can be billed for. It lives under its
// own storage key and never passes through `buildBackup`, which is easy to undo
// by accident if someone later gathers "everything Peri keeps" into one export.
describe('what a backup must never carry', () => {
  it('leaves a linked ElevenLabs key out of the file', () => {
    saveElevenLabs({ apiKey: 'sk-secret-key', voices: [{ id: 'v1', name: 'Rachel' }] })
    const { state, categoryById } = fixture()
    const file = serializeBackup(buildBackup({ ...state, categoryById }))

    expect(file).not.toContain('sk-secret-key')
    expect(file).not.toMatch(/apiKey/i)
  })

  // What somebody actually said — what hurts, what they want, who they were
  // asking for — is not something to hand over with a set of phrases.
  it('leaves the record of what was said out of the file', () => {
    saveSent([{ id: 's1', text: 'I need the toilet' }, { id: 's2', text: 'My chest hurts' }])
    const { state, categoryById } = fixture()
    const file = serializeBackup(buildBackup({ ...state, categoryById }))

    expect(file).not.toContain('I need the toilet')
    expect(file).not.toContain('My chest hurts')
  })

  // The chosen voice does travel, and on a device with no account of its own it
  // falls back to the device voice rather than going quiet.
  it('does carry the chosen voice, which is not a secret', () => {
    const { state, categoryById } = fixture()
    state.settings.voiceURI = 'elevenlabs:v1'
    const backup = buildBackup({ ...state, categoryById })
    expect(backup.settings?.voiceURI).toBe('elevenlabs:v1')
  })
})
