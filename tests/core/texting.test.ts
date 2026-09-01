import { describe, it, expect } from 'vitest'
import { PHRASES } from '../../src/core/phrases'
import { search } from '../../src/core/search'

// The Texting category is the expansions of the acronyms below, and this is the
// only place the pairing is written down — the table holds "Be right back" with
// nothing to say it came from BRB. Without this, dropping one is invisible.
//
// The phrases are the expansions rather than the acronyms because everything in
// this app is something somebody might say out loud, and "B R B" is not. Typing
// the acronym still finds most of them: the grid ranks by initials as well as by
// prefix, which is what `finds by initials` below holds it to.

const TEXTING: Record<string, string> = {
  BRB: 'Be right back',
  BBL: 'Be back later',
  BBS: 'Be back soon',
  BRT: 'Be right there',
  BIAB: 'Back in a bit',
  GTG: 'Got to go',
  TTYL: 'Talk to you later',
  TTYS: 'Talk to you soon',
  TTFN: 'Ta ta for now',
  OMW: 'On my way',
  OTW: 'On the way',
  AFK: 'Away from keyboard',
  CU: 'See you',
  CUL8R: 'See you later',
  CYT: 'See you tomorrow',
  WYA: 'Where are you',
  OMT: 'One moment',
  SEC: 'Just a second',
  MIN: 'Just a minute',
  RN: 'Right now',
  ATM: 'At the moment',
  ASAP: 'As soon as possible',
  ETA: 'Estimated time of arrival',
  L8R: 'Later',
  B4: 'Before',
  W8: 'Wait',
  HRU: 'How are you',
  HBU: 'How about you',
  WBU: 'What about you',
  SUP: "What's up",
  WYD: 'What are you doing',
  WUD: 'What are you up to',
  HYB: 'How have you been',
  WDYT: 'What do you think',
  WDYM: 'What do you mean',
  WYM: 'What do you mean by that',
  LMK: 'Let me know',
  HMU: 'Hit me up',
  JSYK: 'Just so you know',
  IMY: 'I miss you',
  TC: 'Take care',
  HAGD: 'Have a good day',
  HAGN: 'Have a good night',
  HAND: 'Have a nice day',
  IDK: "I don't know",
  IDRK: "I don't really know",
  IDC: "I don't care",
  IDTS: "I don't think so",
  IKR: 'I know, right',
  NVM: 'Never mind',
  OFC: 'Of course',
  DEF: 'Definitely',
  PROB: 'Probably',
  OBV: 'Obviously',
  SRSLY: 'Seriously',
  K: 'Okay',
  KK: 'Okay then',
  NGL: 'Not going to lie',
  TBH: 'To be honest',
  TBF: 'To be fair',
  FR: 'For real',
  IYKYK: 'If you know, you know',
  TY: 'Thank you',
  TYVM: 'Thank you very much',
  THX: 'Thanks',
  TYSM: 'Thank you so much',
  NP: 'No problem',
  YW: "You're welcome",
  PLS: 'Please',
  SRY: 'Sorry',
  MB: 'My bad',
  NBD: 'No big deal',
  NW: 'No worries',
  GL: 'Good luck',
  WD: 'Well done',
  CONGRATS: 'Congratulations',
  HBD: 'Happy birthday',
  GN: 'Good night',
  GM: 'Good morning',
  GE: 'Good evening',
  XOXO: 'Hugs and kisses',
  ILY: 'I love you',
  ILYSM: 'I love you so much',
  LY: 'Love you',
  IMO: 'In my opinion',
  IMHO: 'In my humble opinion',
  AFAIK: 'As far as I know',
  AFAIC: "As far as I'm concerned",
  IIRC: 'If I recall correctly',
  FWIW: "For what it's worth",
  BTW: 'By the way',
  FYI: 'For your information',
  OTOH: 'On the other hand',
  TLDR: "Too long, didn't read",
  ICYMI: 'In case you missed it',
  TIL: 'Today I learned',
  YMMV: 'Your mileage may vary',
  POV: 'Point of view',
  WRT: 'With respect to',
  RE: 'Regarding',
  VS: 'Versus',
  AKA: 'Also known as',
  ETC: 'And so on',
  IE: 'That is to say',
  EG: 'For example',
  NB: 'Please note',
  PS: 'One more thing',
  NTS: 'Note to self',
  ELI5: 'Explain it simply',
  AMA: 'Ask me anything',
  DAE: 'Does anyone else',
  YSK: 'You should know',
  PSA: 'Public service announcement',
  LPT: "Here's a useful tip",
  FTFY: 'Fixed that for you',
  ITT: 'In this thread',
  LOL: 'Laughing out loud',
  ROFL: 'Rolling on the floor laughing',
  JK: 'Just kidding',
  OMG: 'Oh my goodness',
  SMH: 'Shaking my head',
  TMI: 'Too much information',
  FOMO: 'Fear of missing out',
  JOMO: 'Joy of missing out',
  YOLO: 'You only live once',
  GOAT: 'Greatest of all time',
  FTW: 'For the win',
  TFW: 'That feeling when',
  MFW: 'My face when',
  SO: 'Significant other',
  BFF: 'Best friends forever',
  BF: 'Boyfriend',
  GF: 'Girlfriend',
  FAM: 'Family',
  IRL: 'In real life',
  TBT: 'Throwback Thursday',
  OOTD: 'Outfit of the day',
  BTS: 'Behind the scenes',
  NSFW: 'Not safe for work',
  EOD: 'End of day',
  COB: 'Close of business',
  EOW: 'End of week',
  EOM: 'End of message',
  TBD: 'To be decided',
  TBA: 'To be announced',
  TBC: 'To be confirmed',
  NA: 'Not applicable',
  NRN: 'No reply necessary',
  RSVP: 'Please let me know if you can come',
  ATTN: 'Attention',
  FAO: 'For the attention of',
  CC: 'Carbon copy',
  BCC: 'Blind carbon copy',
  FAQ: 'Frequently asked questions',
  DIY: 'Do it yourself',
  DND: 'Do not disturb',
  OOO: 'Out of office',
  WFH: 'Working from home',
  PTO: 'Paid time off',
  AL: 'Annual leave',
  MTG: 'Meeting',
  APPT: 'Appointment',
  AGM: 'Annual general meeting',
  TZ: 'Time zone',
  UTC: 'Coordinated universal time',
  DOB: 'Date of birth',
  INFO: 'Information',
  MSG: 'Message',
  TXT: 'Text message',
  PIC: 'Picture',
  PICS: 'Pictures',
  VID: 'Video',
  HR: 'Human resources',
  CEO: 'Chief executive',
  CFO: 'Chief financial officer',
  CTO: 'Chief technology officer',
  VP: 'Vice president',
  MD: 'Managing director',
  PA: 'Personal assistant',
  EA: 'Executive assistant',
  NDA: 'Non-disclosure agreement',
  PO: 'Purchase order',
  SOW: 'Statement of work',
  RFP: 'Request for proposal',
  SLA: 'Service level agreement',
  MVP: 'Minimum viable product',
  OKR: 'Objectives and key results',
  KPI: 'Key performance indicator',
  ROI: 'Return on investment',
  YTD: 'Year to date',
  YOY: 'Year on year',
  B2B: 'Business to business',
  B2C: 'Business to consumer',
  DM: 'Direct message',
  PM: 'Private message',
  OP: 'Original poster',
  RT: 'Retweet',
  GG: 'Good game',
  GGWP: 'Good game, well played',
  GLHF: 'Good luck, have fun',
  LFG: 'Looking for a group',
  NPC: 'Non-player character',
  IGN: 'In-game name',
  GP: 'General practitioner',
  DR: 'Doctor',
  OT: 'Occupational therapist',
  PT: 'Physiotherapist',
  SLT: 'Speech and language therapist',
  ER: 'Emergency room',
  ICU: 'Intensive care',
  MRI: 'Magnetic resonance scan',
  BP: 'Blood pressure',
  RX: 'Prescription',
  OTC: 'Over the counter',
  BC: 'Because',
  THO: 'Though',
  PPL: 'People',
  GR8: 'Great',
  M8: 'Mate',
  TMRW: 'Tomorrow',
  '2DAY': 'Today',
  '2NITE': 'Tonight',
  TGIF: "Thank goodness it's Friday",
  XMAS: 'Christmas',
  NY: 'New year',
  BDAY: 'Birthday',
  ANNIV: 'Anniversary',
  BYO: 'Bring your own',
  BYOB: 'Bring your own bottle',
  ABT: 'About',
  BTWN: 'Between',
  FYA: 'For your attention',
  HTH: 'Hope this helps',
  'W/': 'With',
  'W/O': 'Without',
  'A&E': 'Accident and emergency',

  // The profane ones, with each profane word cut to its first letter. That is
  // also the letter its acronym uses, so they stay findable the same way.
  WTF: 'What the f',
  WTAF: 'What the actual f',
  TF: 'The f',
  AF: 'As f',
  MF: 'Mother f',
  FU: 'F you',
  FO: 'F off',
  STFU: 'Shut the f up',
  GTFO: 'Get the f out',
  FFS: 'For f sake',
  OMFG: 'Oh my f God',
  JFC: 'Jesus f Christ',
  GDI: 'God d it',
  HFS: 'Holy f s',
  FML: 'F my life',
  TIFU: 'Today I f up',
  LMAO: 'Laughing my a off',
  LMFAO: 'Laughing my f a off',
  ROFLMAO: 'Rolling on the floor laughing my a off',
  IDGAF: "I don't give a f",
  DGAF: "Don't give a f",
  IDGAS: "I don't give a s",
  CBA: "Can't be a",
  BS: 'Bull s',
  HS: 'Horse s',
  TS: 'Tough s',
  POS: 'Piece of s',
  SOB: 'Son of a b',
  AH: 'A hole',
  KMA: 'Kiss my a',
  PITA: 'Pain in the a',
  BFD: 'Big f deal',
  NFW: 'No f way',
  SOL: 'S out of luck',
  FUBAR: 'F up beyond all recognition',
  SNAFU: 'Situation normal all f up',
  WTH: 'What the hell',
}

const texting = PHRASES.filter(p => p.category === 'Texting')
const byText = new Set(texting.map(p => p.text))

// Acronyms that are also the initials of what they stand for, so typing the
// acronym is a way of finding the phrase. Not all of them are: HRU is "How aRe
// yoU", which no initials rule can reach. This is the well-known part of the
// set that is reachable, held here so a reworded expansion cannot quietly stop
// answering to its own acronym.
const FOUND_BY_INITIALS = [
  'BRB',
  'BBL',
  'BRT',
  'GTG',
  'TTYL',
  'OMW',
  'AFK',
  'ASAP',
  'ETA',
  'LMK',
  'HMU',
  'IDK',
  'IDC',
  'IKR',
  'NGL',
  'TBH',
  'TBF',
  'TY',
  'TYVM',
  'NP',
  'YW',
  'GL',
  'GN',
  'GM',
  'ILY',
  'IMO',
  'IMHO',
  'AFAIK',
  'IIRC',
  'FWIW',
  'BTW',
  'FYI',
  'OTOH',
  'TLDR',
  'ICYMI',
  'TIL',
  'YMMV',
  'POV',
  'AKA',
  'PSA',
  'LOL',
  'ROFL',
  'JK',
  'OMG',
  'SMH',
  'TMI',
  'FOMO',
  'YOLO',
  'GOAT',
  'FTW',
  'BFF',
  'IRL',
  'NSFW',
  'EOD',
  'COB',
  'TBD',
  'TBA',
  'FAQ',
  'DIY',
  'DND',
  'OOO',
  'WFH',
  'PTO',
  'DM',
  'PM',
  'GG',
  'GLHF',
  'WYD',
  'ROI',
  'KPI',
  'TGIF',
]

/**
 * The ones carrying a word cut down to its first letter. WTH is the profane set
 * without being in here: "hell" is ordinary speech, and censoring it would be
 * prim rather than careful.
 */
const CENSORED = [
  'WTF',
  'WTAF',
  'TF',
  'AF',
  'MF',
  'FU',
  'FO',
  'STFU',
  'GTFO',
  'FFS',
  'OMFG',
  'JFC',
  'GDI',
  'HFS',
  'FML',
  'TIFU',
  'LMAO',
  'LMFAO',
  'ROFLMAO',
  'IDGAF',
  'DGAF',
  'IDGAS',
  'CBA',
  'BS',
  'HS',
  'TS',
  'POS',
  'SOB',
  'AH',
  'KMA',
  'PITA',
  'BFD',
  'NFW',
  'SOL',
  'FUBAR',
  'SNAFU',
]

/** How many of the whole set the acronym reaches — a majority, not all. */
const REACHABLE_BY_ACRONYM = 150

describe('the texting acronyms', () => {
  it('covers at least two hundred of them', () => {
    expect(Object.keys(TEXTING).length).toBeGreaterThanOrEqual(200)
  })

  it('has an expansion in the table for every one', () => {
    const missing = Object.entries(TEXTING)
      .filter(([, expansion]) => !byText.has(expansion))
      .map(([acronym, expansion]) => `${acronym} — "${expansion}"`)
    expect(missing).toEqual([])
  })

  it('has nothing in the category that no acronym asked for', () => {
    const wanted = new Set(Object.values(TEXTING))
    expect(texting.map(p => p.text).filter(t => !wanted.has(t))).toEqual([])
  })

  // Two acronyms sharing an expansion would put the same cell in the grid twice.
  it('gives each acronym an expansion of its own', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const [acronym, expansion] of Object.entries(TEXTING)) {
      const first = seen.get(expansion)
      if (first) clashes.push(`${first} and ${acronym} both mean "${expansion}"`)
      seen.set(expansion, acronym)
    }
    expect(clashes).toEqual([])
  })

  // They are spoken, so they have to read as speech: no placeholder syntax, no
  // stray punctuation, and short enough to be a text message.
  it('reads as something a person would say', () => {
    for (const expansion of Object.values(TEXTING)) {
      expect(expansion, 'a placeholder in a texting phrase').not.toMatch(/[{}[\]]/)
      expect(expansion.trim(), 'blank expansion').not.toBe('')
      expect(expansion.length, `too long to text: ${expansion}`).toBeLessThan(60)
      expect(expansion[0], `should start capitalised: ${expansion}`).toBe(expansion[0].toUpperCase())
    }
  })

  // The whole reason the expansions can stand in for the acronyms. Not first —
  // "ty" also reaches "Talk to you later" by the same rule — but on screen,
  // which is what a grid narrowed to a handful of cells needs.
  it('finds the common ones by typing the acronym', () => {
    const missed = FOUND_BY_INITIALS.filter(
      acronym => !search(texting, 'Texting', acronym).some(p => p.text === TEXTING[acronym]),
    )
    expect(missed).toEqual([])
  })

  it('reaches most of the rest that way too', () => {
    const reachable = Object.entries(TEXTING).filter(([acronym, expansion]) =>
      search(texting, 'Texting', acronym).some(p => p.text === expansion),
    )
    expect(reachable.length).toBeGreaterThanOrEqual(REACHABLE_BY_ACRONYM)
  })

  // Substituting the first letter rather than a row of asterisks is what keeps
  // these findable: the letter left behind is the letter the acronym uses, so
  // "wtf" still reaches "What the f".
  it('leaves a single letter where a word was cut', () => {
    const uncut = CENSORED.filter(acronym => {
      const words = TEXTING[acronym].replace(/[^\w\s']/g, '').split(/\s+/)
      return !words.some(w => w.length === 1)
    })
    expect(uncut).toEqual([])
  })

  it('still finds the cut ones by their acronym', () => {
    const missed = CENSORED.filter(
      acronym => !search(texting, 'Texting', acronym).some(p => p.text === TEXTING[acronym]),
    )
    // "F you" is f-y by initials, not f-u; it is reached by typing the words.
    expect(missed).toEqual(['FU'])
  })

  it('lists every acronym in CENSORED as one it actually has', () => {
    expect(CENSORED.filter(a => !(a in TEXTING))).toEqual([])
  })

  it('lists every acronym in FOUND_BY_INITIALS as one it actually has', () => {
    expect(FOUND_BY_INITIALS.filter(a => !(a in TEXTING))).toEqual([])
  })
})
