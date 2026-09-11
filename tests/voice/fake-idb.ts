// Just enough IndexedDB for the audio cache's stored layer.
//
// **Installed by the tests that want it and by no others.** jsdom has no
// IndexedDB at all, and that missing case is a real one this app has to survive
// — an old browser, a private window that refuses it — so the rest of the suite
// keeps running without it on purpose. Only the tests that are *about* the
// stored layer stub one in.
//
// It implements the handful of calls `audio-cache.ts` makes and nothing else:
// open with an upgrade, a transaction, get, put and clear. Everything answers on
// a microtask, as the real one does, because code that assumes a synchronous
// answer is code that would fail in a browser.

type Handler = (() => void) | null

interface FakeRequest<T> {
  result: T
  onsuccess: Handler
  onerror: Handler
  onupgradeneeded: Handler
  onblocked: Handler
}

/** The clips this fake is holding, as the one thing a test wants to reach. */
export const clips = new Map<string, Blob>()

function request<T>(result: T, fire: (r: FakeRequest<T>) => void = r => r.onsuccess?.()): FakeRequest<T> {
  const r: FakeRequest<T> = { result, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null }
  // A microtask rather than a call, so a handler assigned after this returns is
  // the one that runs — which is how the real API is used.
  void Promise.resolve().then(() => fire(r))
  return r
}

const store = {
  get: (key: string) => request(clips.get(key)),
  put: (value: Blob, key: string) => {
    clips.set(key, value)
    return request(undefined)
  },
  clear: () => {
    clips.clear()
    return request(undefined)
  },
}

const db = {
  objectStoreNames: { contains: () => true },
  createObjectStore: () => store,
  transaction: () => ({ objectStore: () => store }),
}

/** Puts a clip where an earlier session would have left one. */
export const seedClip = (key: string, blob: Blob) => clips.set(key, blob)

/** Installs the fake and empties it. Call from `beforeEach`. */
export function installFakeIdb() {
  clips.clear()
  globalThis.indexedDB = {
    open: () =>
      request(db, r => {
        r.onupgradeneeded?.()
        r.onsuccess?.()
      }),
  } as unknown as IDBFactory
}

/** Puts the missing-IndexedDB world back, which is what every other test runs in. */
export function removeFakeIdb() {
  clips.clear()
  // @ts-expect-error — putting back the absence jsdom ships with.
  delete globalThis.indexedDB
}
