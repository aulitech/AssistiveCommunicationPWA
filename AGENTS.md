# Peri

Assistive communication driven entirely by gaze and dwell. React + Vite + Tailwind CSS, deployed to Netlify as an installable PWA.

## Development server

`pnpm dev` starts Vite on http://localhost:5173 with hot reload. `pnpm build` writes `dist/`, and `pnpm preview` serves that build.

Nothing starts a server for you — this project was scaffolded by Figma Make and no longer is, so there is no harness running one in the background.

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

Modules are layered, and imports only ever point down the list. Nothing below imports anything above it, so there are no cycles to reason about.

**Entry**

- `src/main.tsx` - React entrypoint; imports `src/index.css`, mounts `src/App.tsx` into the `#root` element, and registers the service worker in production builds
- `src/App.tsx` - The shell: which of the three screens is on, and the settings provider every one of them reads. Fifty lines; **it is not where UI work starts**

**Data and platform** — no React, no dependants of their own

- `src/phrases.ts` - Parses `src/imports/phrasetable.json` into phrases, including the fill-in-the-blank slots, their `aliases` lookups, the profile that fills `{contact}` and `{name}`, and the fixed emergency phrases
- `src/store.ts` - Everything the app persists and the shapes it persists it in: settings, the phrase store, the profile, the signed-in user, the four `localStorage` keys, and the pure operations that arrange categories
- `src/backup.ts` - The export/import file format under **Menu → Backup & sharing**: building one, reading one back, and applying it
- `src/dwell.ts` - `useDwellControl`, the hover-and-hold primitive every control is built on
- `src/speech.ts` - Speech synthesis; the single place utterances are created
- `src/auth.ts` - Google, Apple, and Facebook OAuth sign-in
- `src/help.ts`, `src/legal.ts`, `src/prose.ts` - Long-form text as data, and the blocks it is written in

**Shared** — the vocabulary every screen is built from

- `src/settings.ts`, `src/edit-mode.ts` - The two React contexts. Separate modules because `ui.tsx` needs a dwell time and would otherwise have to import the settings screen, which is built out of `ui.tsx`
- `src/style.ts` - `cx` and `dwellVar`. Not components, so not in `ui.tsx` — a module mixing the two loses fast refresh for everything importing it
- `src/icons.tsx` - Inline SVG. Icons used by exactly one screen stay with that screen
- `src/ui.tsx` - The dwell controls more than one screen uses: `DwellButton`, `NavItem`, `SettingRow`, `SettingSpinner`, `ScrollPane`, `ProseSections`, `DwellCursor`

**State** — the talking screen's own hooks

- `src/use-board.ts` - What is on the board and every way of changing it: the store, the profile, the phrases and categories derived from them, and the operations that write back
- `src/use-composer.ts` - The message being built: its text, its history, and the caret
- `src/use-toast.ts` - The line that appears and fades

**Surfaces** — one file per thing on screen

- `src/topbar.tsx` - The message box, the controls acting on it, and Rest
- `src/grid.tsx` - The phrase grid, the phrase cell, and the rail that scrolls it
- `src/filter-bar.tsx` - The category tabs, and the controls that arrange them
- `src/emergency.tsx` - The red bar along the bottom
- `src/slots.tsx` - The picker that fills a phrase's blanks
- `src/editors.tsx` - The phrase and category dialogs
- `src/settings-panel.tsx`, `src/profile-panel.tsx`, `src/backup-panel.tsx` - The three panels reached from the menu
- `src/menu.tsx` - The panel that slides down from the top, and the help guide inside it

**Screens**

- `src/talk.tsx` - The talking screen, and **the usual starting point for UI work**
- `src/signin.tsx` - The way in
- `src/legal-page.tsx` - `/privacy` and `/terms`

**Styling**

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

- `src/phrases.test.ts` - Placeholder parsing, alias resolution, and whole-table invariants
- `src/backup.test.ts` - The backup format: round trips, exporting a few categories, merge vs replace, and what a damaged file is allowed to do
- `src/dwell.test.tsx` - The dwell hook: timing, tap, keyboard, disabled, and repeat
- `src/App.test.tsx` - Whole-app flows driven through the real DOM
- `src/categories.test.tsx` - Adding, renaming, deleting and ordering category tabs
- `src/shell.test.ts` - `index.html` and the manifest: the parts of the app no component renders
- `src/test/setup.ts` - Stubs for the platform APIs jsdom lacks (speech synthesis, `ResizeObserver`, scrolling, clipboard)

Two things worth knowing when adding to them:

- The app grid renders every phrase in the table, so query it with `container.querySelector` rather than Testing Library's `getByRole` — building an accessibility tree over a couple of thousand cells for each lookup is slow enough to matter.
- Dwell is timer-driven. Use `vi.useFakeTimers()` and advance inside `act()`; the app also uses a zero-delay timer to place the cursor after inserting a phrase, so advance the clock after any interaction before asserting.

When fixing a bug, add the test that fails without the fix, then confirm it actually fails when the fix is reverted. Several tests here are explicit regression guards and say so in a comment.

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

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

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- `src/App.tsx` has the only default export. Everything else is named, so a rename is a compiler error rather than a silently different component.
- Export only what another module imports. A component with one caller stays private to its file.
- The phrase grid is memoised over a couple of thousand cells. A callback reaching it must not depend on a whole hook result — those are a fresh object every render, and the memo would never hold. Depend on the specific function instead; `deliverPhrase` in `src/talk.tsx` shows the shape.
