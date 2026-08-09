# Peri

Assistive communication driven entirely by gaze and dwell. React + Vite + Tailwind CSS, deployed to Netlify as an installable PWA.

## Development server

`pnpm dev` starts Vite on http://localhost:5173 with hot reload. `pnpm build` writes `dist/`, and `pnpm preview` serves that build.

Nothing starts a server for you — this project was scaffolded by Figma Make and no longer is, so there is no harness running one in the background.

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css`, mounts `src/App.tsx` into the `#root` element, and registers the service worker in production builds
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/phrases.ts` - Parses `src/imports/phrasetable.json` into phrases, including the fill-in-the-blank slots, their `aliases` lookups, and the user profile that fills `{contact}` and `{name}`
- `src/store.ts` - Everything the app persists and the shapes it persists it in: settings, the phrase store, the profile, the signed-in user, and the four `localStorage` keys
- `src/backup.ts` - The export/import file format under **Menu → Backup & sharing**: building one, reading one back, and applying it
- `src/dwell.ts` - `useDwellControl`, the hover-and-hold primitive every control is built on
- `src/speech.ts` - Speech synthesis; the single place utterances are created
- `src/auth.ts` - Google, Apple, and Facebook OAuth sign-in
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
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
- Export components as default exports.
