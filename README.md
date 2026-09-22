# Peri

Assistive communication for people who cannot speak, and cannot use their hands. The whole app is driven by **pointing and dwell**: a head tracker, an eye tracker or a mouse rests on something, and after a moment it fires. Nothing here needs a click, a drag or a keyboard, because the people it is for have none of those.

Live at **[peri.auli.tech](https://peri.auli.tech)**. It installs to a home screen, works offline, and needs no account.

## What it does

- **A board of about 2,500 phrases**, in categories, ordered by what gets used. One dwell speaks a phrase, or collects it into a message.
- **An emergency bar** that never waits on a network, so "Help me!" is always one dwell and no round trip.
- **Phrases with a choice in them** — `Please turn {control} the lights` — including word lists of your own, for the names and contacts no phrase table can ship.
- **Listening.** A microphone takes the question somebody just asked out loud, and up to twenty answers land on the board as cells to choose between. **A suggestion is never spoken by itself**: the chosen one goes into the message box and is said only on the dwell that says anything else.
- **Better voices** through a linked ElevenLabs account, **another language** through Google Cloud Translation, and a keyboard Peri draws itself, because on iOS a gaze user cannot raise the system one.
- **Two devices, one board**, synchronized through a server that stores ciphertext it cannot read.
- **Backups and spreadsheets**, so somebody setting a board up for another person can write two hundred phrases in an afternoon rather than a week of dwelling.

Everything is stored on the device, **per account**: two people signing in on one tablet get boards neither can open. What leaves the device is five things, each of them switched on by somebody, and each written down in the [privacy policy](https://peri.auli.tech/privacy).

## How it is built

React 19, Vite, Tailwind CSS v4 and TypeScript, built to static files. There is **one** piece of server: `netlify/functions/sync.ts`, a locked box with a number on it, which stores and returns an encrypted blob and can read none of it. Everything else — the phrases, the speech, the audio cache, the encryption — happens in the browser.

`src/` is layered, and the layering is enforced by a test. **[AGENTS.md](AGENTS.md) is the map**: what each file owns, and why the awkward parts are the way they are. **[CONTRIBUTING.md](CONTRIBUTING.md)** covers getting set up and the conventions a change has to meet.

## GitHub and Netlify do different jobs

They are easy to confuse, because both run on every push and both report a check on the pull request. The division is:

| | GitHub Actions | Netlify |
|---|---|---|
| **Decides** | whether a change may merge | nothing |
| **Runs** | `pnpm check` — format, types, lint, ~1,800 tests | `pnpm build` |
| **On a pull request** | the checks `check` and `version label` | a deploy preview, in about 20 seconds |
| **On `main`** | the same checks | a production build, which is **not** published |
| **Also** | the Publish workflow, by hand | hosting, the CDN, the redirects, and `/api/sync` with Netlify Blobs behind it |

Netlify ran `pnpm check && pnpm build` as its build command until September 2026, which made every preview eight to ten minutes long and left the test suite as the only thing standing between a change and `main`. It builds now, and nothing else.

**`main` is protected by a ruleset**: both checks, a pull request, rebase merges only, no force pushes, no deletion, and no bypass for anybody — including the person who owns the repository. A workflow cannot push to it either, which is why the version commit is made on the branch.

### From a change to the people using it

1. **Open a pull request**, labelled `major`, `minor` or `patch`. The `version label` check fails without exactly one. It is the one thing about a change that the diff cannot tell you.
2. **`pnpm release`** on the branch, as the last commit before merging: it reads that label, bumps `package.json` and commits `Version 1.3.4`.
3. **`gh pr merge --auto --rebase`.** GitHub merges when the checks pass; nobody watches them.
4. **Publishing is a separate decision, and stays one.** Auto-publishing is off. `gh workflow run publish` — or the Actions tab — refuses a `main` that does not end in a release commit, waits for Netlify's build of that exact commit, publishes that one build, and then asks the live site what version it is serving.

People speak through this app. A release reaches them when somebody decides it should, not because a merge happened.

## Where the secrets are, and which ones are not secret

Four homes, and the differences between them matter more than the list.

**1. A GitHub Actions secret — one, and only one workflow reads it.**

| Secret | Used by | For |
|---|---|---|
| `NETLIFY_AUTH_TOKEN` | `.github/workflows/publish.yml` | Publishing a built deploy through the Netlify API |

Set it with `gh secret set NETLIFY_AUTH_TOKEN` (which prompts, so the token stays out of your shell history) or through **Settings → Secrets and variables → Actions**. Workflow tokens default to read-only here, and every workflow asks for what it needs and no more.

**2. Netlify environment variables — public by the time they reach a browser.**

Vite inlines anything named `VITE_*` into the bundle. These are not hidden and are not meant to be; they must be set under **Site configuration → Environment variables**, or a deploy goes out without them.

| Variable | Effect if unset | Why it is safe in public |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | that sign-in button is not offered | OAuth client IDs are public by specification |
| `VITE_APPLE_CLIENT_ID` | as above | as above |
| `VITE_FACEBOOK_APP_ID` | as above | as above |
| `VITE_GOOGLE_TRANSLATE_KEY` | translation is off; shipped translations still speak | **safe by restriction, not by secrecy** — HTTP referrer restricted to this site, and restricted to the Cloud Translation API alone, so a lifted key costs quota rather than anybody's words |

There is no client *secret* anywhere in this app, and there is no backend to keep one in. Locally the same variables go in `.env.local`, which is gitignored — see [.env.example](.env.example) and [docs/oauth-setup.md](docs/oauth-setup.md).

**3. On the command line, never committed.** `GOOGLE_TRANSLATE_KEY` — an *unrestricted* key, for `pnpm translate`, which runs in Node and so sends no referrer for a restriction to check. It is a build tool that writes the shipped translation tables; it never goes to Netlify. See [docs/translation-setup.md](docs/translation-setup.md).

**4. The user's own, on the user's own device.** Peri holds three things that belong to the person using it, and holds them per account:

- their **ElevenLabs key**, if they linked one,
- their **Anthropic key**, if they set one up for suggested answers,
- their **Synchronize passphrase**.

The passphrase **never leaves the device**: it derives both the key a board is sealed with and the address it is stored under, so the server is handed a number it cannot work backwards from. Neither key is ever written into a backup file, because a backup is a file people hand to each other. Both keys do travel inside an encrypted snapshot between that person's own devices, which is what makes a voice they paid for work on their phone as well as their tablet.

Nothing in this repository can read any of the three, and neither can we.

## Reading on

| | |
|---|---|
| [AGENTS.md](AGENTS.md) | The map of the codebase, and the reasoning behind the parts that look odd |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Getting set up, and what a change has to meet |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | |
| [docs/oauth-setup.md](docs/oauth-setup.md) | Getting sign-in credentials from each provider |
| [docs/translation-setup.md](docs/translation-setup.md) | The two translation keys, and why there are two |
| [LICENSE](LICENSE) | MIT |

Published by Autonomous Living Technologies, Inc.
