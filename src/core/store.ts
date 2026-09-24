// Everything Peri keeps between sessions, and the shapes it keeps it in.
//
// Split out of App.tsx so `core/backup.ts` can be written against the same
// definitions the app itself runs on. A second copy of these shapes would drift
// the first time one of them changed, and an export that no longer matches the
// store is a backup that silently restores nothing.

// **The store is in parts now**, under `core/store/`, one for each kind of
// thing kept — settings, the phrase store, the word lists, the records of what
// was said, the accounts, the day's conversation, whose board it is, and the
// reset. This file re-exports exactly what the store always offered, so nothing
// importing `core/store` had to change; the parts import each other directly,
// never through here, so no cycle runs through the barrel.

export { onWriteFailure, writeKey } from './store/keys'
export {
  chooseLanguage,
  chooseVoice,
  DEFAULT_REPLY_MODEL,
  DEFAULT_SETTINGS,
  leaveForSignIn,
  loadSettings,
  readLanguage,
  readReplyModel,
  REPLY_MODELS,
  replyModelName,
  replyModelThinks,
  saveSettings,
  SETTING_LIMITS,
  type Settings,
  settingsOnArrival,
  type VoiceLanguage,
} from './store/settings'
export {
  emptyStore,
  type FiledStore,
  foldFormerCopies,
  fromFiled,
  loadPhraseStore,
  type PhraseStore,
  readMembers,
  readPhraseOrder,
  readVoiceOverrides,
  savePhraseStore,
  setVoiceOverride,
  type StoredPhrase,
  voiceOverrideFor,
} from './store/phrase-store'
export {
  aliasesFromProfile,
  loadAliases,
  loadAliasSort,
  readAliases,
  saveAliases,
  saveAliasSort,
} from './store/aliases'
export {
  addSent,
  addTranslated,
  DEFAULT_SORT,
  forgetUse,
  loadPhraseSorts,
  loadRecent,
  loadSent,
  loadTranslated,
  loadUsage,
  type PhraseSort,
  type PhraseSorts,
  type PhraseUsage,
  type PhraseUse,
  type RecentChoices,
  recordUse,
  savePhraseSorts,
  saveRecent,
  saveSent,
  saveTranslated,
  saveUsage,
  type SentMessage,
  setSortFor,
  sortFor,
  type Translated,
} from './store/records'
export {
  type ElevenLabsAccount,
  loadElevenLabs,
  loadReplyKey,
  type RemoteVoice,
  sameAccount,
  saveElevenLabs,
  saveReplyKey,
} from './store/accounts'
export {
  addReplyTurn,
  type Apologies,
  APOLOGY_REST_MS,
  forgetReplyContext,
  type KeptAnswers,
  loadAnswers,
  loadApologies,
  loadReplyContext,
  NO_APOLOGIES,
  REPLY_CONTEXT_MS,
  type ReplyTurn,
  saveAnswers,
  saveApologies,
  saveReplyContext,
} from './store/conversation'
export { accountId, changesWhoIsSignedIn, clearUser, loadUser, saveUser, type User } from './store/user'
export { forgetWhoseBoard, openBoardFor, ownerOf, storageKey } from './store/owner'
export { emptySync, loadSync, saveSync, type SyncConfig } from './store/sync-config'
export { factoryReset, factoryState } from './store/reset'
export { moveInOrder, newPhraseId, orderByIds, orderCategories, renameCategory, wordingKey } from './store/arrange'
