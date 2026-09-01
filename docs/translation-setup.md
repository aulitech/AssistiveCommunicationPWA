# Setting up translation

Set a spoken language in Peri and it translates what you say before it says it. The board stays as it was written; what comes out of the speaker is the other language.

Most of that needs no setup at all. **The phrases Peri ships are translated before the app is built** — they are in `src/core/imports/translations/`, they work offline, and they are what the emergency bar uses. This document is about the other half: the phrases somebody writes themselves, which are translated as they go.

## The key is the app's, not the user's

It used to be a field in Settings. Asking somebody who communicates by gaze to open a Google Cloud account before their board can speak Spanish is not a setting, it is a wall — so Peri carries its own key and there is nothing on screen to fill in.

The ElevenLabs key stays the user's, and the difference is who is billed for what. That one buys a voice they chose. This one is a service they should not have to know exists.

## Two keys, and they are not the same key

| | Variable | Restricted? | Used by |
|---|---|---|---|
| The app | `VITE_GOOGLE_TRANSLATE_KEY` | HTTP referrer + API | the browser, at runtime |
| The table tool | `GOOGLE_TRANSLATE_KEY` | not restricted | `pnpm translate`, in Node |

They have to be separate. The app's key is inlined into a public JavaScript bundle, so it is restricted by HTTP referrer — and **a referrer is exactly what Node does not send**, so a restricted key gets a 403 from the tool. Keep an unrestricted one for that, pass it on the command line, and never put it in a file.

## Making the key

1. **console.cloud.google.com** → create or pick a project.
2. **APIs & Services → Library** → *Cloud Translation API* → **Enable**.
3. Turn on **billing** for the project. The free tier is 500,000 characters a month; past that it is $20 per million.
4. **APIs & Services → Credentials → Create credentials → API key.**

### Restricting it

Do this to the app's key and not to the tool's. It is the whole of what makes a public key acceptable:

- **Application restrictions → Websites**
  - `https://aulitalk.netlify.app/*`
  - `http://localhost:5173/*`
  - the deploy-preview pattern, if previews should translate
- **API restrictions → Restrict key →** Cloud Translation API

What a lifted key can then do is translate, from those origins, and nothing else. **The exposure is quota, not anybody's words** — no user data is reachable with it, and it cannot touch any other Google service. A determined attacker can spoof a `Referer`, so watch the quota rather than assuming the restriction is a wall.

If a referrer restriction is fiddly to keep in step with preview URLs, set a **quota cap** on the Cloud Translation API as well. That turns the worst case from a bill into a feature that stops working.

## Where the value goes

Locally, in `.env.local` (gitignored; copy `.env.example`):

```sh
VITE_GOOGLE_TRANSLATE_KEY=AIza…
```

For the deployed site, the same name under **Netlify → Site configuration → Environment variables**. Vite inlines it at build time, so **a change needs a redeploy**, not just a save.

Leave it blank and translation is simply off. The shipped phrases still speak in the chosen language, and anything else is spoken as it was written — which the Spoken language row says out loud, because a board that quietly stops translating halfway is worse than one that never started.

## Filling the shipped tables

One language at a time, with the *unrestricted* key:

```sh
GOOGLE_TRANSLATE_KEY=AIza… pnpm translate es
GOOGLE_TRANSLATE_KEY=AIza… pnpm translate fr
GOOGLE_TRANSLATE_KEY=AIza… pnpm translate es-PR
```

The whole phrase table is roughly 52,000 characters, so a language is about a tenth of the monthly free tier. It **merges** rather than replaces, so re-running is cheap and the hand-written emergency phrases are not quietly taken over by a machine.

**Read the output before committing it.** These are phrases somebody will say to a nurse about their own body, and a plausible-looking mistranslation is worse than an English sentence the listener has to work at.

`pnpm translate jam` refuses, and says why: nothing translates into Jamaican Patois — Google Translate the product added it in 2024, Cloud Translation, the one this can call, did not. That table is written by hand and read by somebody who speaks it.

## Checking it works

Set a spoken language under **Menu → Settings**, then say a phrase you wrote yourself rather than one Peri ships.

If it comes out in English, open the console and filter for `[Peri]`:

| What it says | What it means |
|---|---|
| `No translation key was built into this app` | the variable did not reach the build — check Netlify, and redeploy |
| `The translation key was refused…` | the key is wrong, or truncated |
| `The translation key is not allowed here…` | the referrer restriction does not cover this URL, or Cloud Translation is not enabled on the project |
| `Could not reach the translation service` | network |

Nothing here ever throws and nothing is ever silent-but-broken in the speaker: a phrase that cannot be translated is spoken as it was written.
