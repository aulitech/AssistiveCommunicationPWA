# Peri

Assistive communication driven entirely by gaze and dwell. React + Vite + Tailwind CSS, deployed to Netlify as an installable PWA.

## Development server

`pnpm dev` starts Vite on http://localhost:5173 with hot reload. `pnpm build` writes `dist/`, and `pnpm preview` serves that build.

Nothing starts a server for you — this project was scaffolded by Figma Make and no longer is, so there is no harness running one in the background.

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

`src/` is **layered, lowest first**. A directory may import from itself and from anything on an earlier line, never from a later one. `src/structure.test.ts` fails the build if that is broken, so the rule is enforced rather than merely described.

| Layer | Directory | Holds |
|---|---|---|
| 1 | `core/` | What Peri knows and keeps. No React, no network, no screens |
| 2 | `ui/` | The controls and contexts every screen is built from |
| 2 | `voice/` | Making sound come out |
| 3 | `menu/` | The panel that slides down, and everything reached from it |
| 4 | `talk/` `signin/` `legal/` | The three screens |
| 5 | *(root)* | `App.tsx`, `main.tsx`, and the tests that drive the whole app |

**core/** — readable on its own; nothing else in `src` is needed to follow it

- `core/phrases.ts` - Parses `core/imports/phrasetable.json` into phrases, including the fill-in-the-blank slots, their `aliases` lookups, the profile that fills `{contact}` and `{name}`, and the fixed emergency phrases
- `core/store.ts` - Everything the app persists and the shapes it persists it in: settings, the phrase store, the profile, the signed-in user, the linked account, the sent messages, the six `localStorage` keys, and the pure operations that arrange categories
- `core/backup.ts` - The export/import file format under **Menu → Backup & sharing**: building one, reading one back, and applying it
- `core/prose.ts` - The blocks long-form text is written in

**ui/** — the shared vocabulary

- `ui/dwell.ts` - `useDwellControl`, the hover-and-hold primitive every control is built on
- `ui/controls.tsx` - The dwell controls more than one screen uses: `DwellButton`, `NavItem`, `SettingRow`, `SettingSpinner`, `ScrollPane`, `PanelButton`, `ProseSections`, `DwellCursor`
- `ui/settings.ts`, `ui/edit-mode.ts` - The two React contexts. Separate from the panels that edit them, or `controls.tsx` would have to import the settings screen, which is built out of `controls.tsx`
- `ui/style.ts` - `cx` and `dwellVar`. Not components, so not in `controls.tsx` — a module mixing the two loses fast refresh for everything importing it
- `ui/icons.tsx` - Inline SVG. Icons used by exactly one screen stay with that screen

**voice/**

- `voice/speech.ts` - The single place utterances are created, and the routing between the device voice and a linked account
- `voice/elevenlabs.ts` - A linked ElevenLabs account: validating a key, fetching its voices, fetching audio, and the cache in front of it

**menu/**

- `menu/menu.tsx` - The panel itself and the four things it opens. **Back is the only way out that does not need a keyboard** — the scrim behind the panel is inert on purpose, since a pointer wandering across it used to take the menu away
- `menu/settings-panel.tsx`, `menu/profile-panel.tsx`, `menu/backup-panel.tsx`, `menu/help-panel.tsx` - Those four. The voice picker is a full-screen grid, and choosing a voice speaks a sample in it and leaves the grid open — a preview button beside each of sixty tiles would put two targets in every one. Cancel puts back the voice the picker opened on, which is what makes trying them free
- `menu/help.ts` - The guide, as data

**talk/** — **the usual starting point for UI work**

- `talk/talk.tsx` - The screen: which dialog is open, which category is showing, and what to say when an operation finishes
- `talk/use-board.ts` - What is on the board and every way of changing it
- `talk/use-composer.ts` - The message being built: its text, its history, and the caret
- `talk/use-sent.ts` - The messages already spoken or copied
- `talk/use-toast.ts` - The line that appears and fades
- `talk/topbar.tsx`, `talk/grid.tsx`, `talk/filter-bar.tsx`, `talk/emergency.tsx`, `talk/slots.tsx`, `talk/editors.tsx` - One surface each

**signin/**, **legal/** — a screen and the module behind it, twice

- `signin/auth.ts` - Google, Apple, and Facebook OAuth sign-in
- `legal/legal.ts` - The privacy policy and terms, served at `/privacy` and `/terms`

**Root and elsewhere**

- `src/App.tsx` - Which of the three screens is on, and the settings provider. Fifty lines; **it is not where UI work starts**
- `src/main.tsx` - React entrypoint; imports `src/index.css`, mounts `App` into `#root`, and registers the service worker in production builds
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import. One file, ordered by accretion rather than by concern — see the note under Styling before reorganising it
- `index.html` - Vite HTML shell: the `#root` element, `src/main.tsx`, and every `<meta>` the page carries
- `public/` - Served at the site root: PWA manifest, icons, `robots.txt`, and `sw.js` (the offline service worker)
- `package.json` - Project dependencies and the Vite build, development, preview, test, and formatting scripts
- `vite.config.ts` - Vite and Vitest configuration: React, Tailwind CSS v4, the `@` alias for `src`, and the `test` block
- `netlify.toml` - The deploy: build command, SPA fallback, and cache headers
- `eslint.config.js` - Lint rules; `react-hooks/exhaustive-deps` is an error here, not a warning
- `.mise.toml` - Toolchain versions for Node.js and pnpm

The site is **indexed**: `public/robots.txt` allows everything and `index.html` carries no `robots` meta tag. The two are a pair — if either ever says no, the other has to as well, or the site ends up half-hidden. `src/shell.test.ts` fails if they disagree.

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Testing: Vitest with jsdom and React Testing Library
- Linting: ESLint with `typescript-eslint` and `eslint-plugin-react-hooks`
- Formatting: oxfmt

## Testing

Run `pnpm check` before handing work back — it runs `typecheck`, `lint`, and `test` in sequence. `pnpm test:watch` while iterating.

Tests live beside the code they cover:

Unit tests sit beside what they cover; tests that drive the whole app through `App` sit at the root with it.

- `core/phrases.test.ts` - Placeholder parsing, alias resolution, and whole-table invariants
- `core/sent.test.ts` - The list of what was said: newest first, no repeats, and the cap
- `core/backup.test.ts` - The backup format: round trips, exporting a few categories, merge vs replace, and what a damaged file is allowed to do
- `voice/elevenlabs.test.ts` - The API client: linking, its failure messages, and the audio cache
- `voice/speech.test.ts` - Which voice a phrase comes out of, and that it always comes out of one of them
- `ui/dwell.test.tsx` - The dwell hook: timing, tap, keyboard, disabled, and repeat
- `src/App.test.tsx` - Whole-app flows driven through the real DOM
- `src/categories.test.tsx` - Adding, renaming, deleting and ordering category tabs
- `src/shell.test.ts` - `index.html` and the manifest: the parts of the app no component renders
- `src/structure.test.ts` - The layering above, plus the two ways it quietly rots: a module dropped at the root, and Tailwind widening its scan back to the whole project
- `src/test/setup.ts` - Stubs for the platform APIs jsdom lacks (speech synthesis, `ResizeObserver`, scrolling, clipboard, audio playback)

Two things worth knowing when adding to them:

- The app grid renders every phrase in the table, so query it with `container.querySelector` rather than Testing Library's `getByRole` — building an accessibility tree over a couple of thousand cells for each lookup is slow enough to matter.
- Dwell is timer-driven. Use `vi.useFakeTimers()` and advance inside `act()`; the app also uses a zero-delay timer to place the cursor after inserting a phrase, so advance the clock after any interaction before asserting.

When fixing a bug, add the test that fails without the fix, then confirm it actually fails when the fix is reverted. Several tests here are explicit regression guards and say so in a comment.

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

**Tailwind is given an allowlist, not the whole project.** `src/index.css` opens with `@import 'tailwindcss' source(none)` and then names `./**/*.tsx` minus tests. Left to scan everything, it takes any word that looks like a utility name — `container.querySelector` written in this file shipped a real `.container` rule with five media queries to every user, and words in the stylesheet's own property values added ten more. Narrowing it took three kilobytes off the bundle. Add to the `@source` list if a class ever needs to come from somewhere else.

**The stylesheet is one file on purpose.** It is ordered by accretion rather than by concern — the rules for reordering categories sit two thousand lines below the rules for the tabs they reorder — so splitting it into partials would mean either importing the same concern twice or moving blocks past each other. Moving them changes the cascade wherever two selectors have equal specificity, and jsdom lays nothing out, so no test here would catch the difference. Reorganise it only alongside a visual comparison against a deploy preview.

## Phrases and slots

Phrases in `phrasetable.json` can carry fill-in-the-blank slots — `Please turn {control} the lights`. A slot's options come from one of three places, resolved in `resolveSlot`:

1. An inline quoted list in the placeholder itself (`{['music', 'tv']}`), which always wins.
2. The user's profile, for `{contact}` and `{name...}`. The table ships these empty; the profile is edited under **Menu → My details** and stored separately from the phrase store.
3. The table's own `aliases` block, for `{pronouns}`, `{direction}`, `{bodyparts}` and friends.

How many options a slot ends up with decides the interaction, so mind the boundaries: **none** renders as `___` and the cursor lands on it for typing, **exactly one** is substituted straight into the text with no picker, and **two or more** opens the slot picker. `hasChoices` and `choosableSlots` both key off `options.length > 1` for that reason.

Slot options are baked in at parse time, so `buildPhrases(profile)` re-parses the table when the profile changes. Phrase ids hash the *source* text rather than the rendered text, so saved edits survive a profile change.

## Backups

A backup is a **diff against the phrase table, not a copy of it**. The table ships with the app, so a file holds only what the user did — added, reworded, moved, removed, rearranged — plus their details and settings. That is why ids matter: they hash the source text, so an id in a backup still names the same phrase in a later release, and one that names nothing is skipped.

Two things in `src/backup.ts` are deliberate and easy to "fix" by mistake:

- **Merging never removes a phrase.** Deleting a phrase is the one change the app offers no way back from, so a file someone else made cannot make one on your device. Only *replace* applies removals, and `canReplace` refuses it for a file covering a few categories — everything the file said nothing about would go.
- **Imported settings are clamped to `SETTING_LIMITS`.** A dwell time of zero fires every control the instant a pointer crosses it, leaving a gaze user no working control to undo it with. A file does not get to set a value the settings panel could not.

## Sent messages

Every message spoken or copied is kept, newest first, and shown under a **Sent** tab pinned to the left of **All**. Selecting one puts it back in the message box; in edit mode the editor offers to *Keep* it as a real phrase or *Forget* it.

- **Sent is not a category.** Its filter id is `SENT_FILTER`, which begins with a space so no real category — names are trimmed — can ever collide with it. Both it and All carry `fixed: true` in the `categories` prop, which is how `FilterBar` knows a tab cannot be renamed, dragged or reordered.
- **The list is never in a backup.** It is a record of what somebody actually said, and a backup is a file made to be handed to somebody else. Its own storage key, outside the three things `buildBackup` reads, with a test holding it there.
- **`record` and `forget` read storage back rather than closing over state.** Two sends can happen without a render in between, and the second would otherwise be written against a list that no longer exists.

## Voices

Two sources sit behind `speak()`. The device's own synthesiser is instant, free and works offline. A linked ElevenLabs account sounds better and does none of those things. Everything in `src/speech.ts` is arranged around one rule:

**A phrase never fails into silence.** A flat connection, an expired key, a rate limit, a browser refusing to autoplay — every one of them ends in the device speaking the words instead. If you add a path that can produce no audio, it falls back too.

Two consequences worth knowing before changing any of it:

- **The emergency bar always speaks on the device**, via `speak(text, settings, { local: true })`. A request that has to go out and come back is not what "I can't breathe" needs, and with the network down it is nothing at all.
- **The API key is never in a backup.** It lives under its own storage key, outside the three things `buildBackup` is built from. A backup is made to be shared, and the key in one hands over the account. `src/backup.test.ts` holds it to that, and `src/legal.ts` says so to the user.

Audio is cached in memory by voice and text. An AAC board is the same phrases over and over, so the second time is free and instant — which is the difference between a usable feature and a bill.

Sending the words somewhere is a disclosure, so it is stated in three places that must agree: the ElevenLabs row in Settings, the **Better voices** section of the guide, and the Speech section of the privacy policy. Change one and change all three.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- `src/App.tsx` has the only default export. Everything else is named, so a rename is a compiler error rather than a silently different component.
- Export only what another module imports. A component with one caller stays private to its file.
- The phrase grid is memoised over a couple of thousand cells. A callback reaching it must not depend on a whole hook result — those are a fresh object every render, and the memo would never hold. Depend on the specific function instead; `deliverPhrase` in `src/talk.tsx` shows the shape.
