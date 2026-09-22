// Audio already paid for, in three layers. **Every one of them exists to stop a
// clip being bought twice**, because these are billed per character and an AAC
// board is the same phrases said over and over.
//
// The **memory** layer is the one that matters at the moment of speaking: it
// answers synchronously, so a phrase whose audio is in it is spoken with no wait
// at all. That is what lets a phrase given its own voice keep that voice on the
// emergency bar, where waiting on a request is not acceptable.
//
// The **stored** layer is IndexedDB, and it is what makes the memory layer worth
// filling: without it every reload would buy the whole board again. It is read
// on the way to the network rather than all at once at start-up — a board's
// worth of clips read back on arrival is work nobody asked for, and the few that
// need to be in hand *before* they are asked for are warmed by name.
//
// The **remote** layer is the user's own other devices, and it is not this
// module's to reach: something above installs it, because the store it talks to
// lives beside this one in the layering rather than below it. Absent unless
// synchronizing is on, and asked only after both local layers have missed.
//
// Where IndexedDB is missing — an old browser, a private window that refuses it,
// jsdom — everything still works and simply forgets between sessions.
//
// **The stored layer is kept per board**, in a database named the way the
// board's own keys are. A clip is keyed by the words it says, so a shared
// database would hold one person's phrases where the next could reach them, and
// a factory reset would take away audio somebody else had paid for.

import { storageKey } from '../core/store'

const DB_NAME = 'peri-audio'
const STORE = 'clips'

/** Bounded so a long session cannot grow it without limit. */
const MEMORY_LIMIT = 200

const memory = new Map<string, Blob>()

export const audioKey = (voiceId: string, text: string) => `${voiceId} ${text}`

/** The one way into the memory layer, so its bound is applied in one place. */
function keepInMemory(key: string, blob: Blob) {
  memory.set(key, blob)
  if (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value!)
}

/** In hand right now, with no waiting. The only question the emergency bar asks. */
export function cachedAudio(key: string): Blob | undefined {
  const hit = memory.get(key)
  if (hit) {
    // Re-reading moves it back to the newest end.
    memory.delete(key)
    memory.set(key, hit)
  }
  return hit
}

export function cachedCount() {
  return memory.size
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise(resolve => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(storageKey(DB_NAME), 1)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    // A refused or corrupt database is not worth reporting: the app keeps
    // working, it just forgets between sessions.
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    db =>
      new Promise<T | null>(resolve => {
        if (!db) {
          resolve(null)
          return
        }
        try {
          const request = run(db.transaction(STORE, mode).objectStore(STORE))
          request.onsuccess = () => resolve(request.result ?? null)
          request.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

/** Remembers it in both local layers. The stored write is not waited on. */
export function rememberAudio(key: string, blob: Blob) {
  keepInMemory(key, blob)
  void withStore('readwrite', store => store.put(blob, key) as IDBRequest<unknown>)
}

/**
 * From the stored layer, and into memory on the way past.
 *
 * **Asked on the way to the network, not at start-up.** This is the answer to a
 * clip that was paid for in an earlier session: without it a reload meant buying
 * the whole board again, one phrase at a time, with every clip already sitting
 * in IndexedDB unread. It is async, so it is never the emergency bar's question
 * — that one is `cachedAudio`, and it stays synchronous.
 */
export async function storedAudio(key: string): Promise<Blob | undefined> {
  const blob = await withStore<Blob>('readonly', store => store.get(key) as IDBRequest<Blob>)
  if (!(blob instanceof Blob)) return undefined
  keepInMemory(key, blob)
  return blob
}

/**
 * Pulls the given clips into memory ahead of being asked for, so that after a
 * reload the phrases that were given a voice can still be spoken without
 * waiting. Only ever called with the handful of phrases that actually carry one:
 * everything else is reached through `storedAudio` at the moment it is wanted.
 */
export async function warmAudio(keys: string[]): Promise<number> {
  let loaded = 0
  for (const key of keys) {
    if (memory.has(key)) continue
    if (await storedAudio(key)) loaded++
  }
  return loaded
}

/**
 * The user's own other devices, as a place a clip may already be.
 *
 * **Installed from above rather than imported**, because the module that talks to
 * the server sits beside this one in the layering and neither may reach the
 * other. What installs it is the screen that holds both — see `talk.tsx`.
 */
export interface RemoteClips {
  /** What is at this key on the server, or null for nothing and for any failure. */
  get: (key: string) => Promise<Blob | null>
  /** Offers a clip to the other devices. Never waited on, and never throws. */
  put: (key: string, blob: Blob) => void
}

let remote: RemoteClips | null = null

/** Null while synchronizing is off, which is the state this app ships in. */
export function setRemoteClips(clips: RemoteClips | null) {
  remote = clips
}

export const remoteClips = () => remote

/**
 * Forgets everything this device holds for this board. Called when an account
 * is unlinked, and on a factory reset.
 *
 * **The remote layer is not touched**, and that is deliberate: those clips are
 * the user's other devices' too, and unlinking an account here is not a decision
 * about them. Taking them off the server is its own item — see `forgetClips`.
 */
export function clearAudioCache() {
  memory.clear()
  void withStore('readwrite', store => store.clear() as IDBRequest<unknown>)
}
