import { describe, it, expect } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
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
} from '../../src/core/backup'
import { DEFAULT_REPLY_MODEL, DEFAULT_SETTINGS, emptyStore, type PhraseStore } from '../../src/core/store'
import { EMPTY_ALIASES, type AliasStore } from '../../src/core/phrases'
import {
  saveElevenLabs,
  saveReplyContext,
  saveAnswers,
  saveReplyKey,
  saveSent,
  saveTranslated,
  saveUsage,
} from '../../src/core/store'

// A store with something of the user's in every field: two phrases they wrote,
// a reworded one Peri ships and a hidden one, three categories referring to
// Library phrases — one of them empty — and both arrangements.
function fixture(): { state: AppState } {
  const store: PhraseStore = {
    ...emptyStore(),
    custom: [
      { id: 'custom-1', text: 'Put the kettle on', category: 'Library' },
      { id: 'custom-2', text: 'The dog needs out', category: 'Library' },
    ],
    overrides: { 'built-1': "I'm knackered", 'custom-2': 'The dog needs walking' },
    hidden: ['built-2'],
    members: { Food: ['custom-1'], Home: ['built-3', 'custom-2'], Later: [] },
    categoryOrder: ['Home', 'Food', 'Later'],
    categorySort: 'custom',
    emergencyOrder: ['em-2', 'em-0'],
    libraryOrder: ['built-1', 'custom-2'],
  }
  const aliases: AliasStore = {
    lists: {
      'name.given': ['Ada'],
      'name.surname': ['Lovelace'],
      name: ['Ada Lovelace'],
      contacts: ['Mum', 'Charles'],
    },
    hidden: ['clothes'],
  }
  return { state: { store, aliases, settings: { ...DEFAULT_SETTINGS, phraseDwellMs: 2200 } } }
}

const exportAll = () => buildBackup(fixture().state)

const exportOf = (scope: string[]) => buildBackup({ ...fixture().state, scope })

const fresh = (): AppState => ({ store: emptyStore(), aliases: EMPTY_ALIASES, settings: DEFAULT_SETTINGS })

describe('building a backup', () => {
  it('stamps the format so a file can be told apart from any other JSON', () => {
    const backup = exportAll()
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(Date.parse(backup.exported)).not.toBeNaN()
  })

  it('carries every kind of change the user can make', () => {
    const backup = exportAll()
    expect(backup.added).toEqual([
      { id: 'custom-1', text: 'Put the kettle on', category: 'Library' },
      { id: 'custom-2', text: 'The dog needs walking', category: 'Library' },
    ])
    expect(backup.edited).toEqual([{ id: 'built-1', text: "I'm knackered" }])
    expect(backup.removed).toEqual(['built-2'])
    expect(backup.members).toEqual({ Food: ['custom-1'], Home: ['built-3', 'custom-2'], Later: [] })
    expect(backup.libraryOrder).toEqual(['built-1', 'custom-2'])
    expect(backup.categories.order).toEqual(['Home', 'Food', 'Later'])
    expect(backup.categories.sort).toBe('custom')
    expect(backup.aliases?.lists.contacts).toEqual(['Mum', 'Charles'])
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

  // Rearranging the emergency bar is as much a thing somebody did as rewording
  // a phrase is, and it is the one bar they reach for without reading it.
  it('carries the order of the emergency bar', () => {
    expect(exportAll().emergencyOrder).toEqual(['em-2', 'em-0'])
  })

  // The bar is one category's worth of phrases, so its arrangement travels with
  // that category and with nothing else.
  it('takes the emergency order only where Emergency is in scope', () => {
    expect(exportOf(['Emergency']).emergencyOrder).toEqual(['em-2', 'em-0'])
    expect(exportOf(['Home']).emergencyOrder).toBeUndefined()
  })

  it('leaves the field out entirely when the bar was never rearranged', () => {
    const { state } = fixture()
    const backup = buildBackup({ ...state, store: { ...state.store, emergencyOrder: [] } })
    expect(backup.emergencyOrder).toBeUndefined()
  })

  // A file holding only a rearranged bar still has something in it to restore.
  it('counts a rearranged bar as something worth exporting', () => {
    const backup = buildBackup({
      ...fresh(),
      store: { ...emptyStore(), emergencyOrder: ['em-1', 'em-0'] },
      scope: ['Emergency'],
    })
    expect(summarize(backup).empty).toBe(false)
  })

  // A category is the phrases it refers to, so a file of one carries those
  // phrases — Peri's own need nothing but the reference — and the category.
  it('keeps only the chosen categories, and the phrases they refer to', () => {
    const backup = exportOf(['Home'])
    expect(backup.scope).toEqual(['Home'])
    expect(backup.added.map(p => p.id)).toEqual(['custom-2'])
    expect(backup.edited).toEqual([])
    expect(backup.removed).toEqual([])
    expect(backup.members).toEqual({ Home: ['built-3', 'custom-2'] })
    expect(backup.libraryOrder).toBeUndefined()
    expect(backup.categories.order).toEqual(['Home'])
  })

  // Whose device this is, how long they need to dwell and who their contacts
  // are is not part of "here are my Food phrases".
  it('leaves the lists and settings out of a few categories', () => {
    const backup = exportOf(['Home'])
    expect(backup.aliases).toBeUndefined()
    expect(backup.settings).toBeUndefined()
    expect(backup.categories.sort).toBeUndefined()
  })

  // Library holds every phrase, so it is Library a removal belongs to.
  it('takes a removal along with Library, and with no category', () => {
    expect(exportOf(['Library']).removed).toEqual(['built-2'])
    expect(exportOf(['Food']).removed).toEqual([])
  })

  it('carries every phrase and Library’s order with Library, and no category', () => {
    const backup = exportOf(['Library'])
    expect(backup.added.map(p => p.id)).toEqual(['custom-1', 'custom-2'])
    expect(backup.edited.map(e => e.id)).toEqual(['built-1'])
    expect(backup.libraryOrder).toEqual(['built-1', 'custom-2'])
    expect(backup.members).toBeUndefined()
  })

  it('treats an empty choice of categories as the whole app', () => {
    expect(buildBackup({ ...fixture().state, scope: [] }).scope).toBeNull()
  })

  it('has nothing to say about an untouched app', () => {
    const backup = buildBackup(fresh())
    const summary = summarize(backup)
    expect(summary.added + summary.edited + summary.removed).toBe(0)
    expect(summary.empty).toBe(false) // the settings still ride along
    expect(summarize(buildBackup({ ...fresh(), scope: ['Food'] })).empty).toBe(true)
  })

  // Otherwise the panel offers someone "your word lists" when they have changed
  // none, and replacing from that file would empty the lists on the device that
  // receives it.
  it('leaves untouched lists out rather than writing an empty object', () => {
    const backup = buildBackup(fresh())
    expect(backup.aliases).toBeUndefined()
    expect(summarize(backup).aliases).toBe(false)
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
        version: 2,
        added: [
          { id: 'a', text: 'Kept', category: 'Library' },
          { id: 'b' }, // no text — nothing to restore
          'nonsense',
          { text: 'No id' },
        ],
        edited: [{ id: 'c', text: 'Kept too' }, { id: '' }],
        removed: ['d', 7, null],
        members: { Food: ['a', 3, 'a'], Broken: 'a', Library: ['a'] },
        libraryOrder: ['a', null],
        categories: { order: 'not a list', sort: 'sideways' },
        emergencyOrder: ['em-1', 4, '', null],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.added).toEqual([{ id: 'a', text: 'Kept', category: 'Library' }])
    expect(result.backup.edited).toEqual([{ id: 'c', text: 'Kept too' }])
    expect(result.backup.removed).toEqual(['d'])
    expect(result.backup.members).toEqual({ Food: ['a'] })
    expect(result.backup.libraryOrder).toEqual(['a'])
    expect(result.backup.categories.order).toEqual([])
    expect(result.backup.categories.sort).toBeUndefined()
    expect(result.backup.emergencyOrder).toEqual(['em-1'])
  })

  /**
   * **A file from before categories were references** filed each phrase under
   * one category. Read as references: every phrase in Library, each category
   * referring to the phrases filed under it — in the order its arrangement gave
   * them, then the file's — a category it made and left empty kept, and
   * Library's arrangement as Library's order.
   */
  it('reads a file from before categories were references into them', () => {
    const result = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        added: [
          { id: 'custom-1', text: 'Put the kettle on', category: 'Food' },
          { id: 'custom-2', text: 'Walk the dog', category: 'Food' },
          { id: 'custom-3', text: 'Somewhere', category: 'Library' },
          { id: 'custom-help', text: 'Help now', category: 'Emergency' },
        ],
        edited: [
          { id: 'built-1', category: 'Food' },
          { id: 'built-2', text: 'Reworded', category: 'Home' },
        ],
        categories: { created: ['Later'], renamed: { Feelings: 'Moods' }, order: ['Food', 'Library', 'Later'] },
        phraseOrder: { Food: ['built-1', 'custom-2'], Library: ['custom-3'] },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { backup } = result
    expect(backup.added.map(p => [p.id, p.category])).toEqual([
      ['custom-1', 'Library'],
      ['custom-2', 'Library'],
      ['custom-3', 'Library'],
      ['custom-help', 'Emergency'],
    ])
    // A move alone says nothing now but the reference.
    expect(backup.edited).toEqual([{ id: 'built-2', text: 'Reworded' }])
    expect(backup.members).toEqual({ Later: [], Food: ['built-1', 'custom-2', 'custom-1'], Home: ['built-2'] })
    expect(backup.libraryOrder).toEqual(['custom-3'])
    expect(backup.categories.order).toEqual(['Food', 'Later'])
  })

  it('puts a phrase with no category in Library rather than dropping it', () => {
    const result = parseBackup(
      JSON.stringify({ format: BACKUP_FORMAT, version: 1, added: [{ id: 'a', text: 'Homeless' }] }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.backup.added[0].category).toBe('Library')
      expect(result.backup.members).toBeUndefined()
    }
  })

  // A dwell of zero fires every control the instant a pointer crosses it. For
  // someone driving Peri by gaze that leaves no working control to undo it with,
  // so a file does not get to set one the settings panel could not.
  it('holds imported settings to the same limits as the settings panel', () => {
    const result = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        settings: {
          phraseDwellMs: 0,
          actionDwellMs: -5,
          // A repeat this fast empties a list in the time it takes to notice —
          // and the control to slow it back down repeats at the same rate.
          repeatDelayMs: 1,
          volume: 99,
          rate: 40,
          voiceURI: 7,
          language: 'Klingon, obviously',
          voicesByLanguage: { 'es-PR': 'Monica', 'Klingon, obviously': 'Worf', vi: 42, '': 'Samantha' },
          autoSpeak: 'yes',
          zoom: 9,
          // A model this build has never heard of. It is handed to somebody
          // else's API, so a file must not be able to choose one that fails on
          // the first question rather than in the settings panel.
          replyModel: 'some-model-from-later',
        },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.settings).toEqual({
      phraseDwellMs: 500,
      actionDwellMs: 300,
      repeatDelayMs: 100,
      voiceURI: '',
      // Not the shape of a language tag, so it is not handed to a synthesiser.
      language: '',
      // The same check, once per key — and `''` is a real key, being the board
      // following the device. A voice that is not a string goes with the tag
      // that is not a tag.
      voicesByLanguage: { 'es-PR': 'Monica', '': 'Samantha' },
      volume: 1,
      rate: 2,
      // 'yes' is not a boolean, so it falls back to the default like every
      // other nonsense value here — and the default is on.
      autoSpeak: true,
      keyboard: false,
      // A file does not get to make the text nine times its size, which would
      // take the settings panel down with it.
      zoom: 2,
      // Nor name a model this build cannot call.
      replyModel: DEFAULT_REPLY_MODEL,
    })
  })

  /**
   * The other half of holding it to a list: a model the build *does* know has to
   * survive the trip, or the setting would quietly go back to the default every
   * time a board was restored or arrived from another device.
   */
  it('carries a model it knows through a file unchanged', () => {
    const result = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        settings: { replyModel: 'claude-sonnet-5' },
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.backup.settings?.replyModel).toBe('claude-sonnet-5')
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
    expect(summary).toMatchObject({ added: 2, edited: 1, removed: 1, aliases: true, settings: true, empty: false })
  })

  it('says so plainly, in English', () => {
    expect(describeBackup(summarize(exportAll()))).toBe(
      '2 phrases you added, 1 edit, 1 phrase you removed, your word lists, your settings',
    )
    expect(describeBackup(summarize(buildBackup({ ...fresh(), scope: ['Food'] })))).toMatch(/nothing/i)
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
      { id: 'custom-1', text: 'Put the kettle on', category: 'Library' },
      { id: 'custom-2', text: 'The dog needs walking', category: 'Library' },
    ])
    expect(next.store.overrides).toEqual({ 'built-1': "I'm knackered" })
    expect(next.store.hidden).toEqual(['built-2'])
    expect(next.store.members).toEqual({ Food: ['custom-1'], Home: ['built-3', 'custom-2'], Later: [] })
    expect(next.store.libraryOrder).toEqual(['built-1', 'custom-2'])
    expect(next.store.categoryOrder).toEqual(['Home', 'Food', 'Later'])
    expect(next.store.categorySort).toBe('custom')
    expect(next.store.emergencyOrder).toEqual(['em-2', 'em-0'])
    expect(next.aliases.lists.contacts).toEqual(['Mum', 'Charles'])
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
      custom: [{ id: 'custom-local', text: 'Mine already', category: 'Library' }],
      overrides: { 'built-9': 'Local wording' },
      hidden: ['built-7'],
      members: { Food: ['custom-local', 'built-5'] },
      categoryOrder: ['Food'],
      emergencyOrder: ['em-4'],
      libraryOrder: ['built-9'],
    },
    aliases: { lists: { 'name.nickname': ['Bee'], contacts: ['Sam'] }, hidden: [] },
    settings: { ...DEFAULT_SETTINGS, rate: 1.6 },
  })

  it('keeps what was already there and adds what the file brings', () => {
    const next = applyBackup(exportAll(), local(), 'merge')
    expect(next.store.custom.map(p => p.id)).toEqual(['custom-local', 'custom-1', 'custom-2'])
    expect(next.store.overrides).toEqual({ 'built-9': 'Local wording', 'built-1': "I'm knackered" })
    expect(next.store.categoryOrder).toEqual(['Food', 'Home', 'Later'])
  })

  // What the file's categories refer to goes behind what this device's already
  // hold, so a category somebody arranged here stays arranged.
  it('adds the file’s references behind this device’s, each once', () => {
    const next = applyBackup(exportAll(), local(), 'merge')
    expect(next.store.members).toEqual({
      Food: ['custom-local', 'built-5', 'custom-1'],
      Home: ['built-3', 'custom-2'],
      Later: [],
    })
    expect(next.store.libraryOrder).toEqual(['built-9', 'built-1', 'custom-2'])
  })

  // Same rule as the categories: what somebody arranged on this device stays
  // where they put it, and the file's arrangement fills in behind it. A device
  // with no arrangement of its own takes the file's exactly.
  it('leaves an emergency bar this device already arranged where it was', () => {
    const next = applyBackup(exportAll(), local(), 'merge')
    expect(next.store.emergencyOrder).toEqual(['em-4', 'em-2', 'em-0'])
    expect(applyBackup(exportAll(), fresh(), 'merge').store.emergencyOrder).toEqual(['em-2', 'em-0'])
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
    expect(next.aliases.lists.contacts).toEqual(['Mum', 'Charles'])
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
  // And the file's categories refer to the phrase already here.
  it('leaves no duplicate when the same phrase arrives under another id', () => {
    const backup: Backup = {
      ...exportAll(),
      added: [{ id: 'custom-elsewhere', text: 'mine  ALREADY', category: 'Library' }],
      members: { Home: ['custom-elsewhere'] },
    }
    const next = applyBackup(backup, local(), 'merge')
    expect(next.store.custom).toHaveLength(1)
    expect(next.store.members.Home).toEqual(['custom-local'])
  })

  it('takes the newer wording when a phrase comes back changed', () => {
    const backup: Backup = {
      ...exportAll(),
      added: [{ id: 'custom-local', text: 'Mine, reworded', category: 'Library' }],
    }
    const next = applyBackup(backup, local(), 'merge')
    expect(next.store.custom).toEqual([{ id: 'custom-local', text: 'Mine, reworded', category: 'Library' }])
  })

  // The store reads an override before a phrase's own text, so one left behind
  // by whatever last held this id would hide the phrase just imported.
  it('clears an override that would mask an imported phrase', () => {
    const state = local()
    state.store.overrides['custom-local'] = 'Stale'
    const backup: Backup = {
      ...exportAll(),
      added: [{ id: 'custom-local', text: 'Fresh', category: 'Library' }],
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

  it('fills in lists the device is missing without emptying the ones it has', () => {
    const next = applyBackup(exportAll(), local(), 'merge')
    expect(next.aliases.lists['name.given']).toEqual(['Ada'])
    // The device's own nickname is untouched: the file said nothing about it.
    expect(next.aliases.lists['name.nickname']).toEqual(['Bee'])
    expect(next.aliases.lists.contacts).toEqual(['Sam', 'Mum', 'Charles'])
    // And the file's removals are not applied at all. Hiding a list is a
    // removal, and a file somebody else made must not take one off your device.
    expect(next.aliases.hidden).toEqual([])
  })

  it('applies the removals only when replacing', () => {
    expect(applyBackup(exportAll(), local(), 'replace').aliases.hidden).toEqual(['clothes'])
  })

  it('leaves the lists and settings alone when the file has none', () => {
    const next = applyBackup(exportOf(['Home']), local(), 'merge')
    expect(next.aliases).toEqual(local().aliases)
    expect(next.settings.rate).toBe(1.6)
  })
})

// A backup is made to be shared. An API key in one hands over the account it
// belongs to, and whatever that account can be billed for. It lives under its
// own storage key and never passes through `buildBackup`, which is easy to undo
// by accident if someone later gathers "everything Peri keeps" into one export.
describe('what a backup must never carry', () => {
  /**
   * How often each phrase is used is the same kind of thing as the Sent list: a
   * record of what somebody actually said and how often — which body part hurts,
   * who they keep asking for. A backup is a file made to be handed to somebody
   * else, and neither belongs in one.
   */
  it('leaves how often each phrase is used out of the file', () => {
    saveUsage({ 'custom-1': { count: 40, at: 1_700_000_000_000 }, 'built-1': { count: 7, at: 1_700_000_000_001 } })
    const { state } = fixture()
    const file = serializeBackup(buildBackup({ ...state }))

    // The ids are in the file — they name the phrases the user changed. What
    // must not be is any record of how much they have been leant on.
    expect(file).not.toMatch(/count/i)
    expect(file).not.toContain('1700000000000')
  })

  it('leaves a linked ElevenLabs key out of the file', () => {
    saveElevenLabs({ apiKey: 'sk-secret-key', voices: [{ id: 'v1', name: 'Rachel' }] })
    const { state } = fixture()
    const file = serializeBackup(buildBackup({ ...state }))

    expect(file).not.toContain('sk-secret-key')
    expect(file).not.toMatch(/apiKey/i)
  })

  /**
   * **Every language's voice, not just the first.** The writer emitted the map
   * and the parser dropped it, which cost nothing on the way out and lost every
   * per-phrase voice on the way back in — a backup that restores a board
   * missing something is worse than one that refuses to restore at all.
   */
  it('carries a voice for each language a phrase has one in, and reads them back', () => {
    const { state } = fixture()
    const store: PhraseStore = {
      ...state.store,
      voiceOverrides: { 'custom-1': { '': 'Samantha', 'es-PR': 'Monica' }, 'built-1': { vi: 'Linh' } },
    }
    const file = serializeBackup(buildBackup({ ...state, store }))

    const result = parseBackup(file)
    expect(result.ok, 'the file it just wrote did not parse').toBe(true)
    if (!result.ok) return

    const applied = applyBackup(result.backup, { ...state, store }, 'replace')
    expect(applied.store.voiceOverrides).toEqual({
      'custom-1': { '': 'Samantha', 'es-PR': 'Monica' },
      'built-1': { vi: 'Linh' },
    })
  })

  /**
   * A file written before voices were per-language. A backup is a file people
   * keep, so its single voice still has to arrive somewhere sensible.
   */
  it('reads a voice from a file written before they were per-language', () => {
    const { state } = fixture()
    const file = serializeBackup(buildBackup({ ...state }))
    const raw = JSON.parse(file)
    raw.edited = [{ id: 'built-1', voice: 'Samantha' }]
    raw.added = [{ id: 'x1', text: 'Hello', category: 'Home', voice: 'Monica' }]

    const result = parseBackup(JSON.stringify(raw))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const applied = applyBackup(result.backup, state, 'replace')
    expect(applied.store.voiceOverrides['built-1']).toEqual({ '': 'Samantha' })
    expect(applied.store.voiceOverrides.x1).toEqual({ '': 'Monica' })
  })

  /**
   * Nor what has been translated. It is a record of what somebody has actually
   * said, the same as the Sent list — and it is rebuilt for nothing the moment
   * a phrase is spoken again.
   */
  it('leaves what has been translated out of the file', () => {
    localStorage.setItem(
      'peri_translations',
      JSON.stringify({ fr: { 'My chest hurts': "J'ai mal à la poitrine" } }),
    )
    const { state } = fixture()
    const file = serializeBackup(buildBackup({ ...state }))

    expect(file).not.toContain('poitrine')
  })

  // What somebody actually said — what hurts, what they want, who they were
  // asking for — is not something to hand over with a set of phrases.
  it('leaves the record of what was said out of the file', () => {
    saveSent([
      { id: 's1', text: 'I need the toilet' },
      { id: 's2', text: 'My chest hurts' },
    ])
    const { state } = fixture()
    const file = serializeBackup(buildBackup({ ...state }))

    expect(file).not.toContain('I need the toilet')
    expect(file).not.toContain('My chest hurts')
  })

  /**
   * And nor does the Translations tab. It is the same record seen a second way
   * — what somebody said, in the language they said it in — so a file handed to
   * a teacher or a nurse must not carry it any more than the Sent list.
   */
  it('leaves what was said in another language out of the file', () => {
    saveTranslated([{ id: 't1', source: 'My chest hurts', text: "J'ai mal à la poitrine", tag: 'fr' }])
    const { state } = fixture()
    const file = serializeBackup(buildBackup({ ...state }))

    expect(file).not.toContain('poitrine')
    expect(file).not.toContain('My chest hurts')
  })

  /**
   * And nor does the key behind a suggested reply. Same rule as the ElevenLabs
   * key, same reason: a backup is a file made to be handed to somebody else, and
   * a key in one hands over an account somebody is billed for.
   */
  it('leaves the key for suggested replies out of the file', () => {
    saveReplyKey('sk-ant-secret-1234')
    const { state } = fixture()
    const file = serializeBackup(buildBackup({ ...state }))

    expect(file).not.toContain('sk-ant-secret-1234')
  })

  /**
   * Nor today's conversation. It is a record of what somebody was actually asked
   * in a care room, which is the same kind of thing as the Sent list and gets
   * the same answer.
   */
  it('leaves the questions it was asked today out of the file', () => {
    saveReplyContext([{ at: Date.now(), question: 'Did the chest pain come back?', reply: 'Yes, this morning' }])
    const { state } = fixture()
    const file = serializeBackup(buildBackup({ ...state }))

    expect(file).not.toContain('chest pain')
    expect(file).not.toContain('this morning')
  })

  // Nor the answers last offered to it, which are the same conversation.
  it('leaves the answers last offered out of the file', () => {
    saveAnswers({ at: Date.now(), question: 'Did the chest pain come back?', replies: ['Only once, last night'] })
    const { state } = fixture()
    const file = serializeBackup(buildBackup({ ...state }))

    expect(file).not.toContain('chest pain')
    expect(file).not.toContain('last night')
  })

  // The chosen voice does travel, and on a device with no account of its own it
  // falls back to the device voice rather than going quiet.
  it('does carry the chosen voice, which is not a secret', () => {
    const { state } = fixture()
    state.settings.voiceURI = 'elevenlabs:v1'
    const backup = buildBackup({ ...state })
    expect(backup.settings?.voiceURI).toBe('elevenlabs:v1')
  })
})

/**
 * The spoken language travels like the voice and the dwell times: it is about
 * the person, not about the screen in front of them. Text size and volume are
 * the two that stay behind.
 */
describe('the spoken language in a file', () => {
  /** A real file, with its settings block replaced by whatever is being tried. */
  const settingsFrom = (settings: unknown) => {
    const result = parseBackup(JSON.stringify({ ...exportAll(), settings }))
    if (!result.ok) throw new Error(result.error)
    return result.backup.settings
  }

  it('makes the round trip', () => {
    const { state } = fixture()
    const written = buildBackup({
      ...state,
      settings: { ...DEFAULT_SETTINGS, language: 'fr-FR' },
    })
    const result = parseBackup(serializeBackup(written))
    if (!result.ok) throw new Error(result.error)
    expect(result.backup.settings?.language).toBe('fr-FR')
  })

  it('reads a file written before the setting existed as the default', () => {
    const older: Record<string, unknown> = { ...DEFAULT_SETTINGS }
    delete older.language
    expect(settingsFrom(older)?.language).toBe('')
  })

  /**
   * It cannot be held to the languages *this* device speaks — the setting
   * travels, and the device that wrote it may have voices this one has never
   * had — but a language tag is a language tag, and anything else would only
   * ever be handed straight to the synthesiser.
   */
  it.each([['not a tag'], ['<script>alert(1)</script>'], ['e'], ['123'], [42], [null]])('refuses %s', bad => {
    expect(settingsFrom({ ...DEFAULT_SETTINGS, language: bad })?.language).toBe('')
  })

  it('keeps a tag it has never seen, since another device may well speak it', () => {
    expect(settingsFrom({ ...DEFAULT_SETTINGS, language: 'cy-GB' })?.language).toBe('cy-GB')
  })

  // A file from before Jamaican Patois and Puerto Rican Spanish were taken out.
  // Patois read as a tag is Japanese, which is the one answer worse than none.
  it('reads a language Peri no longer offers as what it speaks now', () => {
    expect(settingsFrom({ ...DEFAULT_SETTINGS, language: 'jam' })?.language).toBe('')
    expect(settingsFrom({ ...DEFAULT_SETTINGS, language: 'es-PR' })?.language).toBe('es')
  })
})

// An arrangement somebody built by hand inside a category. It is as much a thing
// they did as a rewording is, so it travels — and unlike the emergency bar's,
// which is one category's and goes whole or not at all, it can be trimmed to the
// categories a file covers.
// A category is the Library phrases it refers to, in an order of its own —
// which is its Custom order, so it is as much a thing somebody did as a
// rewording is.
describe('a category’s references', () => {
  it('is trimmed to the categories the file covers', () => {
    expect(exportOf(['Home']).members).toEqual({ Home: ['built-3', 'custom-2'] })
  })

  it('is left out entirely when the file covers no category', () => {
    expect(exportOf(['Emergency']).members).toBeUndefined()
  })

  // A file that says nothing else is still worth something if it makes a
  // category, so it must not count as empty.
  it('counts as something the file says', () => {
    const store: PhraseStore = { ...emptyStore(), members: { Food: [] } }
    const state: AppState = { store, aliases: EMPTY_ALIASES, settings: DEFAULT_SETTINGS }
    // Scoped, so neither the settings nor the word lists ride along.
    expect(summarize(buildBackup({ ...state, scope: ['Food'] })).empty).toBe(false)

    // And the same file with the category taken out really is empty, or the
    // line above would pass whatever the category counted for.
    expect(summarize(buildBackup({ ...state, store: emptyStore(), scope: ['Food'] })).empty).toBe(true)
  })

  it('leaves a category the file says nothing about alone', () => {
    const base: AppState = {
      store: { ...emptyStore(), members: { Moods: ['mine-9'] } },
      aliases: EMPTY_ALIASES,
      settings: DEFAULT_SETTINGS,
    }
    const next = applyBackup(exportOf(['Home']), base, 'merge')
    expect(next.store.members.Moods).toEqual(['mine-9'])
  })

  it('reads nothing out of a damaged one rather than refusing the file', () => {
    const raw = JSON.parse(serializeBackup(exportAll()))
    raw.members = 'Food, Home'
    const result = parseBackup(JSON.stringify(raw))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.members).toBeUndefined()
  })
})
