import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DEFAULT_REPLY_MODEL,
  DEFAULT_SETTINGS,
  REPLY_MODELS,
  addReplyTurn,
  emptyStore,
  factoryReset,
  forgetReplyContext,
  loadReplyContext,
  loadSettings,
  loadReplyKey,
  loadSent,
  moveInOrder,
  orderByIds,
  readPhraseOrder,
  renameCategory,
  sameAccount,
  readReplyModel,
  replyModelName,
  replyModelThinks,
  saveReplyContext,
  saveAnswers,
  loadAnswers,
  saveReplyKey,
  saveSent,
  saveSettings,
  changesWhoIsSignedIn,
  emptySync,
  loadAliasSort,
  onWriteFailure,
  writeKey,
  loadAliases,
  loadElevenLabs,
  loadPhraseSorts,
  loadPhraseStore,
  loadRecent,
  loadSync,
  loadTranslated,
  loadUsage,
  openBoardFor,
  ownerOf,
  saveAliasSort,
  saveAliases,
  saveElevenLabs,
  savePhraseSorts,
  savePhraseStore,
  saveRecent,
  saveSync,
  saveTranslated,
  saveUsage,
  saveUser,
  leaveForSignIn,
  settingsOnArrival,
  type ReplyTurn,
  type User,
} from '../../src/core/store'

// The arithmetic behind arranging things by hand. The two bars that use it are
// driven through the DOM — the tabs in categories.test.tsx, the emergency bar in
// emergency.test.tsx — and this is the part that decides where something lands.

const phrases = (...ids: string[]) => ids.map(id => ({ id }))
const ids = <T extends { id: string }>(list: T[]) => list.map(p => p.id)

describe('arranging the emergency bar', () => {
  const bar = phrases('em-0', 'em-1', 'em-2', 'em-3')

  // The categories fall back to alphabetical; these fall back to the order they
  // come in, which is the order Peri ships them in.
  it('leaves them exactly as they come when nothing has been arranged', () => {
    expect(orderByIds(bar, [])).toBe(bar)
  })

  it('puts them in the order asked for', () => {
    expect(ids(orderByIds(bar, ['em-2', 'em-0', 'em-3', 'em-1']))).toEqual(['em-2', 'em-0', 'em-3', 'em-1'])
  })

  // A phrase added after the bar was arranged has no place in that order. It
  // goes at the end rather than at the front, and rearranging is what moves it.
  it('files anything the order has never heard of at the end, as it came', () => {
    expect(ids(orderByIds(phrases('em-0', 'new-a', 'em-1', 'new-b'), ['em-1', 'em-0']))).toEqual([
      'em-1',
      'em-0',
      'new-a',
      'new-b',
    ])
  })

  // An order outlives the phrases in it: one naming a phrase that has since been
  // deleted must not leave a hole, or put the rest in the wrong place.
  it('skips an id that names nothing', () => {
    expect(ids(orderByIds(phrases('em-0', 'em-1'), ['em-9', 'em-1', 'em-0']))).toEqual(['em-1', 'em-0'])
  })
})

describe('moving one thing to where another sits', () => {
  const list = ['a', 'b', 'c', 'd']

  // Landing after the target going right and before it going left is what puts
  // the thing where the pointer actually is, either way.
  it('lands after the target when moving rightwards', () => {
    expect(moveInOrder(list, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('lands before the target when moving leftwards', () => {
    expect(moveInOrder(list, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('leaves the list alone when there is nothing to do', () => {
    expect(moveInOrder(list, 'a', 'a')).toBe(list)
    expect(moveInOrder(list, 'a', 'gone')).toBe(list)
    expect(moveInOrder(list, 'gone', 'a')).toBe(list)
  })

  it('never loses or duplicates anything', () => {
    expect([...moveInOrder(list, 'b', 'd')].sort()).toEqual(list)
  })
})

/**
 * Asked before an account is written, because writing one throws away the audio
 * cached under it — and a board arriving from another device carries the
 * account whether or not that is what changed.
 */
describe('telling two linked accounts apart', () => {
  const account = (apiKey: string, voices: { id: string; name: string }[] = [{ id: 'v1', name: 'Rachel' }]) => ({
    apiKey,
    voices,
  })

  it('says nothing is the same account as nothing', () => {
    expect(sameAccount(null, null)).toBe(true)
  })

  it('tells an account from no account', () => {
    expect(sameAccount(account('sk-a'), null)).toBe(false)
    expect(sameAccount(null, account('sk-a'))).toBe(false)
  })

  it('takes two copies of the same one as the same one', () => {
    expect(sameAccount(account('sk-a'), account('sk-a'))).toBe(true)
  })

  it('tells two keys apart', () => {
    expect(sameAccount(account('sk-a'), account('sk-b'))).toBe(false)
  })

  // A key re-linked can name a different set, and a picker offering voices the
  // account no longer has is a phrase that will not speak.
  it('tells the same key with different voices apart', () => {
    expect(sameAccount(account('sk-a'), account('sk-a', []))).toBe(false)
    expect(sameAccount(account('sk-a'), account('sk-a', [{ id: 'v2', name: 'Rachel' }]))).toBe(false)
    expect(sameAccount(account('sk-a'), account('sk-a', [{ id: 'v1', name: 'Adam' }]))).toBe(false)
  })
})

// The user's own arrangement of the phrases inside a category. It belongs to the
// category, so it has to survive the category being renamed — including the
// rename that collapses two categories into one.
describe('an arrangement and the category it belongs to', () => {
  const storeWith = (phraseOrder: Record<string, string[]>, categories: string[] = []) => ({
    ...emptyStore(),
    categories,
    phraseOrder,
  })

  it('follows the category to its new name', () => {
    const next = renameCategory(storeWith({ Food: ['a', 'b'] }, ['Food']), 'Food', 'Meals')
    expect(next.phraseOrder).toEqual({ Meals: ['a', 'b'] })
  })

  it('leaves every other category’s alone', () => {
    const next = renameCategory(storeWith({ Food: ['a'], Home: ['c'] }, ['Food', 'Home']), 'Food', 'Meals')
    expect(next.phraseOrder).toEqual({ Meals: ['a'], Home: ['c'] })
  })

  // Renaming onto a name that already exists merges the two, so the arrangement
  // merges the same way a backup does: what arrives goes behind what was there.
  it('goes behind the one it is merged into', () => {
    const next = renameCategory(storeWith({ Food: ['a', 'b'], Home: ['c'] }, ['Food', 'Home']), 'Food', 'Home')
    expect(next.phraseOrder).toEqual({ Home: ['c', 'a', 'b'] })
  })

  it('does not list a phrase twice when both named it', () => {
    const next = renameCategory(
      storeWith({ Food: ['a', 'b'], Home: ['b', 'c'] }, ['Food', 'Home']),
      'Food',
      'Home',
    )
    expect(next.phraseOrder).toEqual({ Home: ['b', 'c', 'a'] })
  })

  it('writes nothing where there was no arrangement to move', () => {
    const next = renameCategory(storeWith({ Home: ['c'] }, ['Food', 'Home']), 'Food', 'Meals')
    expect(next.phraseOrder).toEqual({ Home: ['c'] })
  })
})

describe('reading an arrangement back', () => {
  it('takes a category’s list of ids', () => {
    expect(readPhraseOrder({ Food: ['a', 'b'] })).toEqual({ Food: ['a', 'b'] })
  })

  it('refuses anything that is not a record of them', () => {
    for (const raw of [null, undefined, 'words', 7, ['a']]) expect(readPhraseOrder(raw)).toBeNull()
  })

  // An empty arrangement and no arrangement mean the same thing, and a store
  // that only ever accumulates is one nobody can read later.
  it('drops a category whose list holds nothing usable', () => {
    expect(readPhraseOrder({ Food: [], Home: [1, null], Meals: ['', 'a'] })).toEqual({ Meals: ['a'] })
  })

  it('drops a category whose value is not a list at all', () => {
    expect(readPhraseOrder({ Food: 'a,b', Home: ['c'] })).toEqual({ Home: ['c'] })
  })
})

/**
 * The key behind a suggested reply. Its own storage name, which matters more
 * than it looks: every one of these keys is a bare string under a bare name, so
 * two of them sharing one would have each quietly overwriting the other.
 */
describe('the key for suggested replies', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips', () => {
    saveReplyKey('sk-ant-key')
    expect(loadReplyKey()).toBe('sk-ant-key')
  })

  it('is empty before one has been given', () => {
    expect(loadReplyKey()).toBe('')
  })

  it('is trimmed on the way in, since it was pasted', () => {
    saveReplyKey('  sk-ant-key  ')
    expect(loadReplyKey()).toBe('sk-ant-key')
  })

  it('is removed by an empty one rather than stored as one', () => {
    saveReplyKey('sk-ant-key')
    saveReplyKey('   ')
    expect(loadReplyKey()).toBe('')
    expect(localStorage.getItem('peri_reply')).toBeNull()
  })

  it('is kept under a name of its own', () => {
    saveSent([{ id: 's1', text: 'I need the toilet' }])
    saveReplyKey('sk-ant-key')

    expect(loadSent()).toHaveLength(1)
    expect(localStorage.getItem('peri_reply')).toBe('sk-ant-key')
  })

  it('is cleared by a factory reset', () => {
    saveReplyKey('sk-ant-key')
    factoryReset()
    expect(loadReplyKey()).toBe('')
  })
})

/**
 * Which model writes a suggested reply.
 *
 * A closed list rather than a free string, and every test here is about that:
 * the name goes to somebody else's API, so a board carrying one this build has
 * never heard of has to fall back to something that works rather than fail on
 * the first question somebody is asked.
 */
describe('the model behind a suggested reply', () => {
  beforeEach(() => localStorage.clear())

  /**
   * The first three on one axis and the fourth on another. Fable is last rather
   * than slotted among them because it is a different voice rather than a faster
   * or a slower one, and the ordering claim is only about the three.
   */
  it('offers the models it can call, the first three quickest first', () => {
    expect(REPLY_MODELS.map(m => m.id)).toEqual([
      'claude-haiku-4-5-20251001',
      'claude-sonnet-5',
      'claude-opus-5-5',
      'claude-fable-5-1',
    ])
  })

  // Somebody is waiting in front of you. A better sentence that arrives ten
  // seconds later is not a better sentence.
  it('starts on the quickest', () => {
    expect(DEFAULT_REPLY_MODEL).toBe(REPLY_MODELS[0].id)
    expect(DEFAULT_SETTINGS.replyModel).toBe(DEFAULT_REPLY_MODEL)
  })

  it('names every one of them, and something for one it has never heard of', () => {
    for (const model of REPLY_MODELS) expect(replyModelName(model.id)).toBe(model.name)
    expect(replyModelName('some-model-from-later')).toBe(replyModelName(DEFAULT_REPLY_MODEL))
  })

  it('takes a model it knows', () => {
    expect(readReplyModel('claude-opus-5-5')).toBe('claude-opus-5-5')
  })

  /**
   * **Up, never down.** Anything unknown falls back to the default, which is
   * the quickest — so a model this build stopped offering would otherwise move
   * somebody who chose the most careful one to the least, silently, from their
   * settings, their backups and their other devices alike.
   */
  it('reads a model it used to offer as the one that succeeded it', () => {
    expect(readReplyModel('claude-opus-5')).toBe('claude-opus-5-5')
  })

  it('carries a stored choice of the old model forward to the new one', () => {
    localStorage.setItem('dwellspeak_settings', JSON.stringify({ replyModel: 'claude-opus-5' }))
    expect(loadSettings().replyModel).toBe('claude-opus-5-5')
  })

  // What is looked up came out of storage or a file, and every JavaScript
  // object answers to these.
  it('reads a name every object answers to as the default', () => {
    for (const raw of ['constructor', 'toString', '__proto__']) {
      expect(readReplyModel(raw), raw).toBe(DEFAULT_REPLY_MODEL)
    }
  })

  it('knows which models think before they answer', () => {
    expect(replyModelThinks('claude-opus-5-5')).toBe(true)
    expect(replyModelThinks('claude-fable-5-1')).toBe(true)
    expect(replyModelThinks('claude-haiku-4-5-20251001')).toBe(false)
    expect(replyModelThinks('claude-sonnet-5')).toBe(false)
  })

  it('falls back for anything else at all', () => {
    for (const raw of ['some-model-from-later', '', null, undefined, 7, {}, ['claude-opus-5-5']]) {
      expect(readReplyModel(raw), String(raw)).toBe(DEFAULT_REPLY_MODEL)
    }
  })

  it('round-trips through storage', () => {
    saveSettings({ ...DEFAULT_SETTINGS, replyModel: 'claude-sonnet-5' })
    expect(loadSettings().replyModel).toBe('claude-sonnet-5')
  })

  /**
   * The case this guards. A board opened in a later release, then opened again
   * in this one, carries a model this build cannot call — and the symptom would
   * be the suggestion failing rather than the setting looking wrong.
   */
  it('reads a stored model this build does not know as the default', () => {
    localStorage.setItem('dwellspeak_settings', JSON.stringify({ replyModel: 'some-model-from-later' }))
    expect(loadSettings().replyModel).toBe(DEFAULT_REPLY_MODEL)
  })

  it('reads a damaged one as the default rather than throwing', () => {
    localStorage.setItem('dwellspeak_settings', JSON.stringify({ replyModel: { id: 'claude-opus-5-5' } }))
    expect(loadSettings().replyModel).toBe(DEFAULT_REPLY_MODEL)
  })
})

/**
 * Today's conversation, and the day it lasts.
 *
 * It is a record of what somebody was actually asked in a care room, so the
 * window is not a convenience: what is kept is kept on their behalf, and a day
 * is the longest any of it is worth holding.
 */
describe('what was asked and answered today', () => {
  const HOUR = 60 * 60 * 1000
  const NOW = 1_800_000_000_000

  beforeEach(() => localStorage.clear())

  it('keeps an exchange, oldest first', () => {
    let turns = addReplyTurn([], 'Tea or coffee?', 'Tea please', NOW)
    turns = addReplyTurn(turns, 'Milk?', 'Yes please', NOW + 1000)
    expect(turns.map(t => t.question)).toEqual(['Tea or coffee?', 'Milk?'])
  })

  it('does not change the list it was given', () => {
    const once = addReplyTurn([], 'Tea or coffee?', 'Tea please', NOW)
    addReplyTurn(once, 'Milk?', 'Yes please', NOW + 1000)
    expect(once).toHaveLength(1)
  })

  it('refuses an exchange with nothing on one side of it', () => {
    expect(addReplyTurn([], '   ', 'Tea please', NOW)).toEqual([])
    expect(addReplyTurn([], 'Tea or coffee?', '  ', NOW)).toEqual([])
  })

  it('drops what happened more than a day ago as it adds', () => {
    const old = addReplyTurn([], 'Yesterday', 'A while back', NOW - 25 * HOUR)
    const now = addReplyTurn(old, 'Today', 'Just now', NOW)
    expect(now.map(t => t.question)).toEqual(['Today'])
  })

  it('keeps what happened within the day', () => {
    const earlier = addReplyTurn([], 'This morning', 'Earlier', NOW - 23 * HOUR)
    const now = addReplyTurn(earlier, 'Now', 'Just now', NOW)
    expect(now).toHaveLength(2)
  })

  it('keeps the last twenty and no more', () => {
    let turns: ReplyTurn[] = []
    for (let i = 0; i < 30; i++) turns = addReplyTurn(turns, `q${i}`, `a${i}`, NOW + i)
    expect(turns).toHaveLength(20)
    expect(turns[0].question).toBe('q10')
  })

  /**
   * Pruned on the way out as well as in, so a board left open overnight forgets
   * on its own rather than waiting for the next question to notice.
   */
  it('forgets a stale exchange on the way out, with nothing written', () => {
    saveReplyContext([
      { at: NOW - 25 * HOUR, question: 'Yesterday', reply: 'A while back' },
      { at: NOW - HOUR, question: 'This afternoon', reply: 'Earlier' },
    ])
    expect(loadReplyContext(NOW).map(t => t.question)).toEqual(['This afternoon'])
  })

  /**
   * Capped on the way out as well as in. What is in storage was not necessarily
   * written by this release — a longer window from an earlier one, or a file
   * somebody edited — and every turn read back is one more sent to the model and
   * paid for.
   */
  it('reads back at most twenty, however many were written', () => {
    saveReplyContext(Array.from({ length: 30 }, (_, i) => ({ at: NOW + i, question: `q${i}`, reply: `a${i}` })))
    const read = loadReplyContext(NOW + 30)
    expect(read).toHaveLength(20)
    expect(read[0].question).toBe('q10')
  })

  it('round-trips what is still current', () => {
    const turns = addReplyTurn([], 'Tea or coffee?', 'Tea please', NOW)
    saveReplyContext(turns)
    expect(loadReplyContext(NOW)).toEqual(turns)
  })

  it('reads nothing out of damage', () => {
    for (const raw of ['not json', '{}', 'null', '7', '"tea"']) {
      localStorage.setItem('peri_reply_context', raw)
      expect(loadReplyContext(NOW), raw).toEqual([])
    }
  })

  it('drops the entries it cannot use and keeps the rest', () => {
    localStorage.setItem(
      'peri_reply_context',
      JSON.stringify([
        { at: NOW, question: 'Good', reply: 'Fine' },
        { at: NOW, question: 'No reply' },
        { at: NOW, reply: 'No question' },
        { question: 'No clock', reply: 'Fine' },
        { at: 'soon', question: 'Bad clock', reply: 'Fine' },
        null,
        7,
      ]),
    )
    expect(loadReplyContext(NOW).map(t => t.question)).toEqual(['Good'])
  })

  it('takes the key away entirely when there is nothing left', () => {
    saveReplyContext([{ at: NOW, question: 'Tea?', reply: 'Please' }])
    saveReplyContext([])
    expect(localStorage.getItem('peri_reply_context')).toBeNull()
  })

  it('is forgotten on its own, and by a factory reset', () => {
    saveReplyContext([{ at: NOW, question: 'Tea?', reply: 'Please' }])
    forgetReplyContext()
    expect(loadReplyContext(NOW)).toEqual([])

    saveReplyContext([{ at: NOW, question: 'Tea?', reply: 'Please' }])
    factoryReset()
    expect(loadReplyContext(NOW)).toEqual([])
  })
})

/**
 * The answers last offered, which stay on the board across a reload — by the
 * day's rules, because they are the day's conversation.
 */
describe('the answers last offered', () => {
  const HOUR = 60 * 60 * 1000
  const NOW = 1_800_000_000_000
  const kept = { at: NOW, question: 'Are you comfortable', replies: ['I am, thank you', 'Could you move my ___?'] }

  it('round-trips what is still current, gaps and all', () => {
    saveAnswers(kept)
    expect(loadAnswers(NOW + HOUR)).toEqual(kept)
  })

  // The same day the questions are kept for, to the millisecond: a record that
  // outlived the questions would be answers to something nothing remembers.
  it('is gone once its day is up, and not a moment before', () => {
    saveAnswers(kept)
    expect(loadAnswers(NOW + 24 * HOUR - 1)).toEqual(kept)
    expect(loadAnswers(NOW + 24 * HOUR)).toBeNull()
  })

  it('reads nothing out of damage', () => {
    for (const raw of [
      'not json',
      'null',
      '7',
      '[]',
      '{}',
      JSON.stringify({ ...kept, at: 'soon' }),
      JSON.stringify({ ...kept, at: null }),
      JSON.stringify({ ...kept, question: 7 }),
      JSON.stringify({ ...kept, replies: 'I am' }),
    ]) {
      localStorage.setItem('peri_answers', raw)
      expect(loadAnswers(NOW), raw).toBeNull()
    }
  })

  // One malformed line costs its own line and not the rest, the rule reading
  // the answers off the service follows too.
  it('drops the answers it cannot use and keeps the rest', () => {
    localStorage.setItem(
      'peri_answers',
      JSON.stringify({ ...kept, replies: ['Tea please', 7, '', '   ', null, 'Coffee'] }),
    )
    expect(loadAnswers(NOW)?.replies).toEqual(['Tea please', 'Coffee'])

    localStorage.setItem('peri_answers', JSON.stringify({ ...kept, replies: ['', 7] }))
    expect(loadAnswers(NOW), 'a record of nothing was read as a record').toBeNull()
  })

  it('takes the key away entirely when there is nothing to keep', () => {
    saveAnswers(kept)
    saveAnswers(null)
    expect(localStorage.getItem('peri_answers')).toBeNull()

    saveAnswers(kept)
    saveAnswers({ ...kept, replies: [] })
    expect(localStorage.getItem('peri_answers')).toBeNull()
  })

  // Forgetting the conversation forgets the answers to it: a control that took
  // the questions and left twenty answers to them would have done half of what
  // it says.
  it('is forgotten with the conversation, and by a factory reset', () => {
    saveAnswers(kept)
    forgetReplyContext()
    expect(loadAnswers(NOW)).toBeNull()

    saveAnswers(kept)
    factoryReset()
    expect(loadAnswers(NOW)).toBeNull()
  })
})

// ── Whose board ──────────────────────────────────────────────────────────────
// A board is the signed-in person's and nobody else's. These drive every piece
// of one through storage under two accounts and a guest; that the screens keep
// them apart is `app/accounts.test.tsx`.
describe('whose board', () => {
  const ada: User = { name: 'Ada', email: 'ada@example.com', provider: 'google', sub: '1' }
  const bob: User = { name: 'Bob', email: 'bob@example.com', provider: 'google', sub: '2' }
  const guest: User = { name: 'Guest', email: '', provider: 'guest' }
  /** Signed in before the provider's id was kept, so there is none to keep a board under. */
  const early: User = { name: 'Eve', email: 'eve@example.com', provider: 'google' }

  const PERSONAL = /^(dwellspeak_(settings|phrase_store_v2|profile)|peri_[a-z_]+)$/

  /** Every piece of a board, written once through the store's own savers. */
  function writeEverything(dwell: number) {
    saveSettings({ ...DEFAULT_SETTINGS, phraseDwellMs: dwell })
    savePhraseStore({ ...emptyStore(), hidden: [`hidden-${dwell}`] })
    saveAliases({ lists: { contacts: [`Mum ${dwell}`] }, hidden: [] })
    saveAliasSort('alpha')
    saveSent([{ id: `s${dwell}`, text: `said ${dwell}` }])
    saveTranslated([{ id: `t${dwell}`, text: `dit ${dwell}`, source: `said ${dwell}`, tag: 'fr' }])
    saveRecent({ category: `Cat ${dwell}` })
    saveUsage({ [`p${dwell}`]: { count: 1, at: 1 } })
    savePhraseSorts({ all: 'alpha' })
    saveElevenLabs({ apiKey: `eleven-${dwell}`, voices: [] })
    saveReplyKey(`sk-ant-${dwell}`)
    saveReplyContext([{ question: `asked ${dwell}`, reply: 'yes', at: Date.now() }])
    saveAnswers({ at: Date.now(), question: `asked ${dwell}`, replies: ['yes'] })
    saveSync({ ...emptySync(), passphrase: `words ${dwell}` })
  }

  /** What of a board can be read back, as the values `writeEverything` wrote. */
  const readEverything = () => ({
    dwell: loadSettings().phraseDwellMs,
    hidden: loadPhraseStore().hidden,
    contacts: loadAliases().lists.contacts,
    aliasSort: loadAliasSort(),
    sent: loadSent().map(m => m.text),
    translated: loadTranslated().map(t => t.text),
    recent: loadRecent().category,
    usage: Object.keys(loadUsage()),
    sorts: loadPhraseSorts(),
    eleven: loadElevenLabs()?.apiKey,
    reply: loadReplyKey(),
    context: loadReplyContext().map(t => t.question),
    answers: loadAnswers()?.question,
    passphrase: loadSync().passphrase,
  })

  it('is an account, the guest, or nobody', () => {
    expect(ownerOf(ada)).toBe('google:1')
    expect(ownerOf(guest)).toBe('guest')
    expect(ownerOf(early), 'a board kept under an id nobody can sign in as again').toBeNull()
    expect(ownerOf(null)).toBeNull()
  })

  it('keeps every piece of one away from every other account', () => {
    openBoardFor(ada)
    writeEverything(2000)
    const adas = readEverything()
    // Every piece really was written, or a board that leaked would look like
    // one that was never there.
    expect(adas).toEqual({
      dwell: 2000,
      hidden: ['hidden-2000'],
      contacts: ['Mum 2000'],
      aliasSort: 'alpha',
      sent: ['said 2000'],
      translated: ['dit 2000'],
      recent: 'Cat 2000',
      usage: ['p2000'],
      sorts: { all: 'alpha' },
      eleven: 'eleven-2000',
      reply: 'sk-ant-2000',
      context: ['asked 2000'],
      answers: 'asked 2000',
      passphrase: 'words 2000',
    })

    openBoardFor(bob)
    expect(readEverything(), 'the second account opened the first one’s board').toEqual({
      dwell: DEFAULT_SETTINGS.phraseDwellMs,
      hidden: [],
      contacts: undefined,
      aliasSort: 'custom',
      sent: [],
      translated: [],
      recent: undefined,
      usage: [],
      sorts: {},
      eleven: undefined,
      reply: '',
      context: [],
      answers: undefined,
      passphrase: '',
    })
    writeEverything(3000)

    openBoardFor(ada)
    expect(readEverything(), 'the second account wrote over the first').toEqual(adas)
  })

  it('writes nothing of a later account under a name somebody else reads', () => {
    openBoardFor(ada)
    openBoardFor(bob)
    writeEverything(3000)

    const written = Object.keys(localStorage).filter(k => k !== 'peri_first_owner')
    expect(written.length).toBeGreaterThanOrEqual(14)
    for (const key of written) expect(key, 'written under a name another board reads').toMatch(/@google:2$/)
  })

  it('keeps the guest’s apart from an account’s, both ways', () => {
    openBoardFor(guest)
    writeEverything(2000)
    openBoardFor(ada)
    expect(loadSent()).toEqual([])
    writeEverything(3000)
    openBoardFor(guest)
    expect(loadSent().map(m => m.text)).toEqual(['said 2000'])
  })

  // The board from before boards were kept apart is under the bare names, and
  // goes to whoever opens a board first — without a byte of it being moved.
  describe('the first owner', () => {
    const board = () => ({ sent: 'said before', key: 'sk-ant-before' })
    const leaveOneBehind = () => {
      localStorage.setItem('peri_sent', JSON.stringify([{ id: 's0', text: board().sent }]))
      localStorage.setItem('peri_reply', board().key)
    }

    it('inherits the board already on the device', () => {
      leaveOneBehind()
      openBoardFor(ada)
      expect(loadSent().map(m => m.text)).toEqual([board().sent])
      expect(loadReplyKey()).toBe(board().key)
    })

    it('is the only one who does', () => {
      leaveOneBehind()
      openBoardFor(ada)
      for (const other of [bob, guest]) {
        openBoardFor(other)
        expect(loadSent(), `${other.name} opened the board that was on the device`).toEqual([])
        expect(loadReplyKey()).toBe('')
      }
    })

    it('is decided once, and not by whoever opens a board next', () => {
      openBoardFor(ada)
      openBoardFor(bob)
      openBoardFor(ada)
      saveSent([{ id: 's1', text: 'Ada again' }])
      expect(localStorage.getItem('peri_sent'), 'the first owner lost the bare names').not.toBeNull()
      openBoardFor(bob)
      expect(loadSent()).toEqual([])
    })

    // Somebody signed in before accounts had ids is still on the board they
    // had, and has not claimed it: whoever signs in next, once they have signed
    // out, is the one it goes to — which on their own device is them.
    it('is not somebody signed in with no id, who keeps the board they had', () => {
      leaveOneBehind()
      openBoardFor(early)
      expect(loadSent().map(m => m.text)).toEqual([board().sent])
      expect(localStorage.getItem('peri_first_owner')).toBeNull()

      openBoardFor(bob)
      expect(
        loadSent().map(m => m.text),
        'the next to sign in did not inherit it',
      ).toEqual([board().sent])
    })
  })

  it('resets only the board that is open', () => {
    openBoardFor(ada)
    writeEverything(2000)
    const adas = readEverything()
    openBoardFor(bob)
    writeEverything(3000)

    factoryReset()
    expect(Object.keys(localStorage).filter(k => k.endsWith('@google:2'))).toEqual([])
    openBoardFor(ada)
    expect(readEverything(), 'resetting one account took another’s board').toEqual(adas)
  })

  it('leaves who is signed in, and who owned the board first, to the device', () => {
    saveUser(ada)
    openBoardFor(ada)
    openBoardFor(bob)
    factoryReset()
    expect(localStorage.getItem('dwellspeak_user')).not.toBeNull()
    expect(localStorage.getItem('peri_first_owner')).toBe('google:1')
    expect(Object.keys(localStorage).filter(k => PERSONAL.test(k) && k !== 'peri_first_owner')).toEqual([])
  })

  // Signed out is nobody's board: the sign-in page, and a legal page opened
  // with nobody signed in, read nothing of anybody's.
  it('opens nobody’s while nobody is signed in', () => {
    openBoardFor(ada)
    writeEverything(2000)
    openBoardFor(bob)
    writeEverything(3000)

    openBoardFor(null)
    expect(readEverything().dwell).toBe(DEFAULT_SETTINGS.phraseDwellMs)
    expect(readEverything().sent).toEqual([])
    expect(readEverything().reply).toBe('')
    expect(readEverything().passphrase).toBe('')
  })

  describe('how the sign-in page is worked', () => {
    const worked = {
      ...DEFAULT_SETTINGS,
      zoom: 1.5,
      phraseDwellMs: 2500,
      actionDwellMs: 1600,
      repeatDelayMs: 700,
      language: 'fr',
      voiceURI: 'Amélie',
      volume: 0.3,
      replyModel: REPLY_MODELS[2].id,
    }
    const REACHING = { zoom: 1.5, phraseDwellMs: 2500, actionDwellMs: 1600, repeatDelayMs: 700 }

    // Whoever is at the sign-in page next is most often whoever just left it,
    // and somebody who needs a slow dwell cannot sign back in at a quick one.
    it('is left the way the board was worked, and nothing else of it', () => {
      openBoardFor(ada)
      leaveForSignIn(worked)
      openBoardFor(null)
      expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, ...REACHING })
    })

    it('is where a board opened here for the first time starts, and stays', () => {
      openBoardFor(null)
      const signedOut = { ...loadSettings(), ...REACHING, language: 'fr' }
      openBoardFor(bob)
      expect(settingsOnArrival(signedOut)).toEqual({ ...DEFAULT_SETTINGS, ...REACHING })
      expect(loadSettings(), 'not written down, so gone on the next load').toEqual({
        ...DEFAULT_SETTINGS,
        ...REACHING,
      })
    })

    it('is not where a board with settings of its own starts', () => {
      openBoardFor(ada)
      saveSettings(worked)
      expect(settingsOnArrival({ ...DEFAULT_SETTINGS, actionDwellMs: 300 })).toEqual({
        ...worked,
        autoSpeak: DEFAULT_SETTINGS.autoSpeak,
      })
    })
  })

  it('names another tab signing somebody in or out, and nothing else', () => {
    expect(changesWhoIsSignedIn('dwellspeak_user')).toBe(true)
    expect(changesWhoIsSignedIn(null), 'storage cleared signs everybody out').toBe(true)
    expect(changesWhoIsSignedIn('dwellspeak_settings')).toBe(false)
    expect(changesWhoIsSignedIn('dwellspeak_user@google:1')).toBe(false)
  })
})

/**
 * **A refused write does not throw.** It used to, from inside a React state
 * update more often than not, and the whole screen went with it — the emergency
 * bar included. A full store and a private window both refuse.
 */
describe('writing it down', () => {
  const refuse = () =>
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })

  it('keeps what it is given, and says so', () => {
    expect(writeKey('peri_test', 'kept')).toBe(true)
    expect(localStorage.getItem('peri_test')).toBe('kept')
  })

  it('says so when storage refuses, rather than throwing', () => {
    const refused = refuse()
    try {
      expect(() => writeKey('peri_test', 'lost')).not.toThrow()
      expect(writeKey('peri_test', 'lost')).toBe(false)
    } finally {
      refused.mockRestore()
    }
  })

  // Every saver goes through it, so none of them can take the screen down.
  it('lets a saver fail without throwing', () => {
    const refused = refuse()
    try {
      expect(() => savePhraseStore(emptyStore())).not.toThrow()
    } finally {
      refused.mockRestore()
    }
  })

  /**
   * Which record, and nothing else. What was in it is somebody's words, and
   * whose it is names their account — a console ends up in screenshots.
   */
  it('reports which record, never what was in it or whose', async () => {
    const { warnings } = await import('../setup')
    const refused = refuse()
    try {
      writeKey('peri_sent@google:1234', JSON.stringify(['I need my inhaler']))
    } finally {
      refused.mockRestore()
    }
    const said = warnings.join(' ')
    expect(said).toContain('peri_sent')
    expect(said).not.toContain('inhaler')
    expect(said).not.toContain('google:1234')
  })

  it('tells every listener, and stops telling one that has gone', () => {
    const told: string[] = []
    const stop = onWriteFailure(() => told.push('first'))
    const stopSecond = onWriteFailure(() => told.push('second'))
    const refused = refuse()
    try {
      writeKey('peri_test', 'lost')
      stop()
      writeKey('peri_test', 'lost')
    } finally {
      refused.mockRestore()
      stopSecond()
    }
    expect(told).toEqual(['first', 'second', 'second'])
  })

  it('tells nobody when the write was kept', () => {
    const told: string[] = []
    const stop = onWriteFailure(() => told.push('told'))
    writeKey('peri_test', 'kept')
    stop()
    expect(told).toEqual([])
  })
})

/**
 * **One damaged phrase costs that phrase, never the board.** What is in storage
 * may not have been written by this release — an older one, a hand-edited file,
 * another device — and a phrase whose words were not words reached the parser
 * while the board was drawn, on every load, since the damage stays put.
 */
describe('reading back a damaged phrase store', () => {
  const stored = (value: unknown) => localStorage.setItem('dwellspeak_phrase_store_v2', JSON.stringify(value))

  it('keeps the phrases that are whole and drops the ones that are not', () => {
    stored({
      custom: [
        { id: 'custom-good', text: 'Put the kettle on', category: 'Kitchen' },
        { id: 'custom-number', text: 123, category: 'Kitchen' },
        { id: 'custom-nameless', text: 'No category' },
        null,
        'a bare string',
        { text: 'No id', category: 'Kitchen' },
      ],
    })
    expect(loadPhraseStore().custom).toEqual([
      { id: 'custom-good', text: 'Put the kettle on', category: 'Kitchen' },
    ])
  })

  it('keeps only the wordings that are words', () => {
    stored({ overrides: { 'em-0': 'Help me, please!', 'em-1': 42, 'em-2': null, 'em-3': { text: 'x' } } })
    expect(loadPhraseStore().overrides).toEqual({ 'em-0': 'Help me, please!' })
  })

  it('keeps only the names that are names', () => {
    stored({
      hidden: ['em-0', 7, null],
      categoryRenames: { Food: 'Meals', Drink: 3 },
      categoryOverrides: { 'custom-a': 'Kitchen', 'custom-b': false },
    })
    const store = loadPhraseStore()
    expect(store.hidden).toEqual(['em-0'])
    expect(store.categoryRenames).toEqual({ Food: 'Meals' })
    expect(store.categoryOverrides).toEqual({ 'custom-a': 'Kitchen' })
  })

  // An array where a record belongs is not a record, whatever it holds.
  it('reads a list where a record belongs as nothing at all', () => {
    stored({ overrides: ['em-0', 'Help'], categoryRenames: [] })
    const store = loadPhraseStore()
    expect(store.overrides).toEqual({})
    expect(store.categoryRenames).toEqual({})
  })
})
