// Audio already fetched, in two layers.
//
// The memory layer is the one that matters at the moment of speaking: it answers
// synchronously, so a phrase whose audio is in it is spoken with no wait at all.
// That is what lets a phrase given its own voice keep that voice on the
// emergency bar, where waiting on a request is not acceptable.
//
// The stored layer exists so the memory layer can be full again after a reload.
// A phrase assigned a voice is fetched once, kept, and loaded back at start-up —
// otherwise "assign a voice" would mean "assign a voice until you close the tab",
// and an emergency phrase would quietly drop back to the device voice.
//
// Where IndexedDB is missing — an old browser, a private window that refuses it,
// jsdom — everything still works and simply forgets between sessions.

const DB_NAME = 'peri-audio'
const STORE = 'clips'

/** Bounded so a long session cannot grow it without limit. */
const MEMORY_LIMIT = 200

const memory = new Map<string, Blob>()

export const audioKey = (voiceId: string, text: string) => `${voiceId} ${text}`

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
      request = indexedDB.open(DB_NAME, 1)
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

/** Remembers it in both layers. The stored write is not waited on. */
export function rememberAudio(key: string, blob: Blob) {
  memory.set(key, blob)
  if (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value!)
  void withStore('readwrite', store => store.put(blob, key) as IDBRequest<unknown>)
}

/**
 * Pulls the given clips back into memory, so that after a reload the phrases
 * that were given a voice can still be spoken without waiting. Only ever called
 * with the handful of phrases that actually carry one.
 */
export async function warmAudio(keys: string[]): Promise<number> {
  let loaded = 0
  for (const key of keys) {
    if (memory.has(key)) continue
    const blob = await withStore<Blob>('readonly', store => store.get(key) as IDBRequest<Blob>)
    if (blob instanceof Blob) {
      memory.set(key, blob)
      loaded++
    }
  }
  return loaded
}

/** Forgets everything, in both layers. Called when an account is unlinked. */
export function clearAudioCache() {
  memory.clear()
  void withStore('readwrite', store => store.clear() as IDBRequest<unknown>)
}
