# Voices

> One of the decisions behind Peri, moved out of [AGENTS.md](../../AGENTS.md), which keeps the map of
> the source and the rules that hold everywhere. What is written here is why the code is the shape it is.

Two sources sit behind `speak()`. The device's own synthesiser is instant, free and works offline. A linked ElevenLabs account sounds better and does none of those things. Everything in `voice/speech.ts` is arranged around one rule:

**A phrase never fails into silence.** A flat connection, an expired key, a rate limit, a browser refusing to autoplay — every one of them ends in the device speaking the words instead. If you add a path that can produce no audio, it falls back too.

Two consequences worth knowing before changing any of it:

- **The emergency bar never waits on the network**, via `speak(text, settings, { instant: true })`. That is not the same as "device voice": a phrase given its own voice keeps it there too, because assigning one fetches and stores the audio, so it is already in hand. What `instant` rules out is *going and asking* — anything not already fetched is said by the device this moment rather than in the right voice a second and a half later.
- **A new phrase starts from the last category and voice used**, kept under `peri_recent` and out of backups — it is where somebody had got to, not anything they made. Only a *starting point*: a phrase that already has a category or a voice shows its own, so opening one to fix a typo cannot quietly refile it or change how it sounds. A remembered category that has since gone is ignored, and unlinking an account forgets a remembered voice from it. **Opening edit mode on a category writes that category there too** — see [Editing a phrase](editing-a-phrase.md).
- **A phrase can carry its own voice**, in `voiceOverrides`. It beats the one in settings wherever the phrase is spoken, and it travels in a backup like any other customization. A phrase written from nothing has no id until it is saved, so `addPhrase` **hands its id back** and the voice is hung on it afterwards — the choice was simply dropped before, and the phrase came out in the app's voice however carefully another had been picked.
- **The API key is never in a backup, and does travel in a sync snapshot.** Two different questions with two different answers. A backup is a file made to be handed to somebody else, and the key in one hands over the account — it lives under its own storage key, outside the three things `buildBackup` is built from, and `tests/core/backup.test.ts` holds it there. A snapshot is sealed with the user's own passphrase and reaches their own devices and nowhere else, so the key rides **beside** the backup in `Snapshot.account` rather than in it. Put it inside the backup and every exported file would carry it too. `src/legal/legal.ts` says both halves to the user.

Audio is cached in two layers by `voice/audio-cache.ts`. The memory layer answers synchronously, which is the only kind of answer the emergency bar can use; the IndexedDB layer exists so the memory layer can be full again after a reload, and `useBoard` pulls the assigned phrases back into it at start-up. Where IndexedDB is missing — an old browser, a private window, jsdom — everything still works and simply forgets between sessions.

Audio is cached in memory by voice and text. An AAC board is the same phrases over and over, so the second time is free and instant — which is the difference between a usable feature and a bill.

## Not paying for a clip twice

A clip is billed per character and is decided entirely by the voice and the words, so the same phrase is the same bytes for ever and on every device. **Four places are asked before ElevenLabs is**, in the order they cost least, and `fetchAudio` in `voice/elevenlabs.ts` is the whole of the chain:

- **Memory**, synchronously. The only question the emergency bar asks, and the only one that can be answered in time to matter.
- **IndexedDB**, on the way to the network rather than at start-up. **This was missing for the whole life of the feature**: every clip fetched was written there and nothing ever read one back except the handful of phrases carrying their own voice, so a reload bought the entire board again, one phrase at a time, with the audio already on disk. A board's worth read back on arrival is work nobody asked for, so the few clips that must be in hand *before* they are wanted are still warmed by name in `use-board.ts` and everything else is reached at the moment it is asked for.
- **The user's own other devices**, `sync/audio.ts`, when synchronizing is on. Absent otherwise, which is how the app ships.
- **ElevenLabs**, and what comes back is offered straight back up the chain so that no device on the account pays for it again.

Every layer fails into the next rather than throwing: a refused database, an unreachable server and a wrong passphrase all cost a clip somebody already owned, never a phrase.

**`voice/` and `sync/` are the same line of the layering, so neither may import the other.** The cache takes a `RemoteClips` that something above installs, and the only thing that can see both is `talk.tsx` — which is why one `useEffect` there hands the sync control's `clips` to `setRemoteClips`. It hands back `null` on the way out, or a signed-out screen would leave a stale set of keys installed in a module.

Four things about what is on the server:

- **A clip is its own blob, and never part of the board.** The board is written whole on every change, and audio is bought by *speaking* rather than by editing — folded in, saying a new phrase would look like an edit to every other device and push a board nobody changed.
- **The address is derived from the cache key**, through the same HKDF the board's address comes out of — `clipAddress` in `core/crypto.ts`. So a second device works out where a clip is from the phrase already on its board, with nothing to look up, and the server is handed a different 256-bit number for every clip and can tell nothing from any of them. Working one backwards means already holding the passphrase, and anyone holding that can read the board itself.
- **What *is* listed is what has been uploaded**, in one more blob beside them, and it exists for exactly one reason: *Stop and erase the copy* has to take the audio too, and an address nobody wrote down is an address nobody can delete. So the index is written **before** the clip it names, and the invariant runs one way only — the list may name a clip that is not there, which costs a wasted DELETE, while a clip the list does not name would be somebody's words left on a server after they asked for them back. A clip the index cannot be written for stays at home.
- **A clip too large to send stays at home too.** `MAX_CLIP_BYTES` leaves room for what an envelope does to it: base64 to make it JSON, then the ciphertext base64 again, about eight fifths in total. It is around half a minute of speech, and a board phrase is a sentence.

Two costs, both deliberate and both worth knowing:

- **A miss now waits on one more request.** Asking the server happens *before* ElevenLabs, so the first time a phrase is said on a device it pays a round trip it did not used to. Only on a genuine miss, and **never on the emergency bar** — `instant` returns before `synthesize` is reached at all, which is what keeps that surface off every one of these paths.
- **The index is rewritten whole each time it grows.** It is a list of cache keys, so it is bounded by the size of the board rather than by how long somebody has been talking, and it is only written when a genuinely new clip is bought. Uploading it is not waited on, so it costs bandwidth rather than time.

The disclosure rule applies to this as it does to the key: the **ElevenLabs row** and the **Synchronize row** in Settings, **Better voices** and **Keeping two devices the same** in the guide, and the **Speech** and **Synchronizing** sections of the privacy policy all say that the audio travels and that erasing the copy takes it.

**A language is what speaks when nothing more specific has been said.** `settings.language` sets `utterance.lang`; a chosen voice carries its own and wins, because choosing a voice is the more specific thing to have done. Its real work is the case where the voice does not apply: **a `voiceURI` is a platform string and it travels between devices**, so a board set up on a Mac arrives on a phone naming a voice that does not exist there — and without a language that falls all the way back to whatever the *system* speaks, which is how an English board ends up read aloud in another language entirely. Three consequences:

- **The languages offered are the ones the device can speak *or* Peri can translate into.** That rule was once only the first half, on the grounds that offering a language with no voice is offering silence — which is true of a language with nothing behind it and false of one Peri ships a table for. No device has a Puerto Rican or a Patois voice, and both of those are the point, so `VARIETIES` leads the list and the device's own languages follow.
- **A voice is remembered for each language, and so is a phrase's own.** A voice *is* a language, so switching the board between two of them used to let go of the old voice and leave the browser to pick — which made choosing one a thing to redo rather than a thing to set, twice a day for anybody working in two languages. `settings.voicesByLanguage` and `PhraseStore.voiceOverrides` (now id → language → voice) are the two halves, and `chooseVoice`/`chooseLanguage` in `core/store.ts` are the whole of the arithmetic. Four things about them:
  - **The lookup is exact, and never falls back to another language.** A phrase given an English voice has not been given a Spanish one, and an English synthesiser reading Spanish is worse than the board's own voice, which is what nothing means.
  - **`''` is a key like any other** — the board following the device is a setting somebody chose a voice under too. It is also where a store or a backup written before any of this existed reads its single voice, since that is very nearly always the language it was picked in.
  - **`chooseLanguage` writes down the voice it is *leaving*.** A device restored from a backup written before this has a `voiceURI` and an empty map, and without that the first switch away throws the voice away — the exact loss the feature exists to stop.
  - **Where nothing is remembered the old rule still stands:** a device voice that does not match is let go of, and the browser picks one in the chosen language. An ElevenLabs voice is left alone — it has no language of its own and speaks whatever it is given, and is not in the device's list at all, which is what carries it past the check rather than any special case naming it.
- **The language and the voice are also at the message box's upper-right corner**, on a screen wide enough, riding the same border the modes ride at its middle. Four things about that strip:
  - **Their faces are the values** — the tag itself, `en-US`, and the voice's bare name — rather than glyphs naming the subject. A globe says which grid opens; `es-PR` says what the board will do. Six rem each, ellipsis past that, and the whole of it on the control's `aria-label`.
  - **It is positioned against the box, not the bar.** `.text-display-wrap` exists only for that: everything else here centres on `.topbar`, which is 4px off the box's true centre and invisible, but a *corner* found that way would be out by the whole width of the action rail.
  - **It is its own strip, never the modes'.** That one is the three modes, found by position without being read, and `tests/app/board.test.tsx` asserts it holds exactly three — nothing may be inserted into it.
  - **Whether there is room is a `matchMedia` check in `topbar.tsx`**, not a `display: none`, so the breakpoint is written once — and because each picker builds the device's voice list, which is real work to do on a phone that never shows them.
- **It changes nothing for ElevenLabs.** `eleven_flash_v2_5` reads the language off the text, and for a board the text *is* the language — the phrases are written in it. Forcing a `language_code` could only make a mismatch sound worse, and it would have to join the audio cache key, so changing the setting would quietly throw away a board's worth of audio somebody had paid for.

The voice picker opens on the chosen language where there is one and it has voices here — sixty voices in languages nobody will choose is what the chips exist for. Only where that group is real: a language set on another device may have nothing behind it on this one, and a filter showing an empty grid reads as a fault.

Sending the words somewhere is a disclosure, so it is stated in three places that must agree: the ElevenLabs row in Settings, the **Better voices** section of the guide, and the Speech section of the privacy policy. Change one and change all three.
