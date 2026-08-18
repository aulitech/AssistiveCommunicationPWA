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
| 3 | `voice/` | Making sound come out, and the control for choosing which |
| 4 | `menu/` | The panel that slides down, and everything reached from it |
| 5 | `talk/` `signin/` `legal/` | The three screens |
| 6 | *(root)* | `App.tsx`, `main.tsx`, and the tests that drive the whole app |

**core/** — readable on its own; nothing else in `src` is needed to follow it

- `core/phrases.ts` - Parses `core/imports/phrasetable.json` into phrases, including the fill-in-the-blank slots, their `aliases` lookups, the profile that fills `{contact}` and `{name}`, and the fixed emergency phrases
- `core/store.ts` - Everything the app persists and the shapes it persists it in: settings, the phrase store, the profile, the signed-in user, the linked account, the sent messages, the last category and voice used, the `localStorage` keys, and the pure operations that arrange the category tabs and the emergency bar
- `core/backup.ts` - The export/import file format under **Menu → Backup & sharing**: building one, reading one back, and applying it
- `core/virtual.ts` - How much of the grid to render, and when to render more
- `core/search.ts` - Narrowing the grid to what is being typed. Ranks a whole-phrase prefix first, then a word prefix, then the letters used as initials — which is what lets "ttyl" find "Talk to you later". Matched against the words rather than the markup, so `**Help** me` is found by typing "help"
- `core/markdown.ts` - The markup a phrase may carry, and taking it back off. `layout` for drawing, `stripMarkdown` for everything a phrase is *not* drawn into — spoken, searched, announced
- `core/links.ts` - Reading a URL and a label out of a paste or a drop, and writing them as `[label](url)`. A clipboard and a drag carry the same shape, so one reader serves both
- `core/prose.ts` - The blocks long-form text is written in

**ui/** — the shared vocabulary

- `ui/dwell.ts` - `useDwellControl`, the hover-and-hold primitive every control is built on. `repeatMs` is what makes a control repeat while it is held; every caller passes `settings.repeatDelayMs` rather than a number of its own
- `ui/caret.ts` - `useCaretDwell`, the hold that puts the caret under the pointer, and `caretIndexAt`, which asks the browser what character sits there. A text box was the one control dwell alone could not drive: hovering can focus it, but the caret only ever moved on a click. There is one box now and it does two jobs — the message being composed, and, in edit mode, the phrase being written — so the hook settles the awkward parts once for both
- `ui/link-input.ts` - `useLinkInput`, the paste and drop handlers a text box needs to turn a link into markdown, and `pasteFromClipboard` behind the **paste control** in the topbar. One box, so one paste, into whichever of the two it is holding
- `ui/reorder.ts` - `useReorder`, the pick-up-and-put-down primitive behind both bars that can be arranged. A pointer-drag needs a button held down while the pointer moves, which is the one gesture a dwell user cannot make — so anything arrangeable can also be *lifted*: one dwell picks it up, a second on another drops it there. The category tabs and the emergency bar arrange by identical rules, so the rules are written once here
- `ui/controls.tsx` - The dwell controls more than one screen uses: `DwellButton`, `NavItem`, `SettingRow`, `SettingSpinner`, `ScrollRow` (a row that scrolls sideways with its own dwell arrows — the filter chips outgrow the screen), `PickerModal` and `PickerTile` (a full-screen grid of choices, portalled to the body — a panel animated with `transform` makes `position: fixed` resolve against the panel rather than the viewport), `ScrollPane` (four dwell controls — jump to top, nudge up, nudge down, jump to bottom, each shown only when there is somewhere to go), `PanelButton`, `ProseSections`, `DwellCursor`
- `ui/settings.ts`, `ui/edit-mode.ts` - The two React contexts. Separate from the panels that edit them, or `controls.tsx` would have to import the settings screen, which is built out of `controls.tsx`
- `ui/style.ts` - `cx` and `dwellVar`. Not components, so not in `controls.tsx` — a module mixing the two loses fast refresh for everything importing it
- `ui/icons.tsx` - Inline SVG. Icons used by exactly one screen stay with that screen — `ReorderIcon` is here because both bars that can be arranged draw it, and `PageIcon` because both bars that can be paged do

**voice/**

- `voice/speech.ts` - The single place utterances are created, and the routing between the device voice and a linked account
- `voice/audio-cache.ts` - Audio already fetched, in memory and in IndexedDB. The memory layer is what makes a phrase's own voice usable on the emergency bar
- `voice/picker.tsx` - Choosing a voice. One control, used by Settings for the app's voice and by the edit strip for a single phrase's. It sits above `ui/` in the layering for that reason — it is built out of `ui` controls, so `voice` cannot be beside it
- `voice/groups.ts` - Cutting a long voice list down: device voices by language, an account's by the collection it files them under
- `voice/elevenlabs.ts` - A linked ElevenLabs account: validating a key, fetching its voices, fetching audio, and the cache in front of it

**menu/**

- `menu/menu.tsx` - The panel itself, the four things it opens, and the confirmation in front of **Sign out** — the one item here that empties the screen. That dialog is portalled and centred on purpose: a pointer rests where it last fired, so a "yes" appearing under the nav item would be answered by the pointer already sitting there. **Back is the only way out that does not need a keyboard** — the scrim behind the panel is inert on purpose, since a pointer wandering across it used to take the menu away
- `menu/settings-panel.tsx`, `menu/profile-panel.tsx`, `menu/backup-panel.tsx`, `menu/help-panel.tsx` - Those four. All four panels bound their height and scroll — the profile grows with every contact, the settings with the linked-account row — and hold their content to the same 68ch column: the panel spans the whole viewport, so without it a setting's label sits at one edge of a wide monitor and its control at the other. The voice picker and the backup category picker are both full-screen grids built from `PickerModal` — the first single-select, the second multi-select. The voice picker is a full-screen grid, and choosing a voice speaks a sample in it and leaves the grid open — a preview button beside each of sixty tiles would put two targets in every one. Cancel puts back the voice the picker opened on, which is what makes trying them free. It is portalled to the body: the panel is animated with `transform`, and a transformed ancestor makes `position: fixed` resolve against that ancestor rather than the viewport — any full-screen overlay opened from inside a panel needs the same treatment
- `menu/backup-file.ts` - Turning a backup into a file the browser saves. Out of `core/backup.ts`, which touches nothing, and out of the panel, because two places offer to save one: **Backup & sharing**, and the confirmation in front of a factory reset
**Settings and the guide fill the viewport**; the menu itself and the shorter panels hang down only as far as their content. `.top-panel.is-tall`, set from `view` in `menu.tsx`, sized in `dvh` — on a phone `vh` is the viewport with the browser chrome *hidden*, so a panel sized in it runs under the address bar and its last row cannot be reached.

- `menu/help.ts` - The guide, as data. **Its headings fold up**, one open at a time, first open on arrival — fifteen sections is a lot to scroll past by dwell to reach the one you came for. Folded, it is a list, so the headings carry no padding: the tighter the list the more of it is on screen, which is the point of folding it. **Opening one scrolls it to the top of the pane**, in an effect after the render that opened it, so what was just chosen is the first thing on screen; closing does not scroll, since closing is not going anywhere. The legal pages are the same shape of text drawn by the same `ProseSections`, and deliberately do *not* fold: they are documents, served at their own URLs and indexed

**talk/** — **the usual starting point for UI work**

- `talk/talk.tsx` - The screen: which category is showing, which mode is on, and what to say when an operation finishes
- `talk/use-board.ts` - What is on the board and every way of changing it
- `talk/use-composer.ts` - The message being built: its text, its history, and the caret
- `talk/use-editor.ts` - The phrase being written or reworded, which in edit mode is what the message box holds. There is **always a draft** — choosing a phrase points it at one, and nothing opens or closes. Only the fields actually touched are kept; the rest are derived from the phrase each render, so a draft cannot go stale against a store that changed underneath it. `open` is stable across renders on purpose: it reaches every one of a couple of thousand memoised phrase cells
- `talk/use-sent.ts` - The messages already spoken or copied
- `talk/use-toast.ts` - The line that appears and fades
- `talk/grid.tsx` - The grid, the cell, and the rail. The rail is scrolling only — the two mode toggles that used to head it are in the topbar now, beside Rest. **Only the first n cells are rendered** — see `core/virtual.ts`

**Three sizes of jump**, on the rail and on the category bar alike: a nudge (one chevron), a page (two chevrons), and an end (a chevron against a bar). The first two repeat while held, at `settings.repeatDelayMs`. They are ordered outward by how far they travel, so the three are told apart by position as well as by glyph. Two things are deliberate:

- **A page is the visible extent less one nudge's worth**, not the whole extent. Grid rows are not a uniform height and category tabs are pills of every width, so a jump of exactly one screen leaves something cut across the fold — a phrase half off the top, or half a category at the edge that a gaze user hits meaning its neighbour. The floor keeps a viewport smaller than the overlap from paging by nothing.
- **The two ends are hidden on a phone held upright** — `@media (max-width: 700px) and (orientation: portrait)`, keyed on `.filter-arrow-end`. Six arrows and the tools leave a portrait phone almost no room for the tabs they exist to reach, and paging reaches either end too, only a screen at a time. **Width alone is not the test**: a tablet in portrait is over 700px and keeps all six.

The arrow dividers are keyed off **which side of the scroller** an arrow is on (`.filter-scroll ~ .filter-arrow`), not off its position in the row. They were `:last-child` and `:nth-last-child(2)`, written when there were two arrows on the right; there are three now, and two on a portrait phone, so counting from the end kept being wrong.
- `talk/phrase-text.tsx` - `PhraseText`, which draws a phrase's slots and any markdown in it. Used by the grid cell and the emergency bar, so a phrase looks the same wherever it is shown
- `talk/topbar.tsx`, `talk/filter-bar.tsx`, `talk/emergency.tsx`, `talk/slots.tsx`, `talk/editors.tsx` - One surface each. **`editors.tsx` holds no phrase editor** — it is the strip on the message box's lower border (`PhraseEditBar`, rendered by the topbar so it can be positioned against it), the grid a category is chosen from, and `CategoryModal`, which is about a category rather than a phrase. The topbar carries **all three modes in one strip** — edit, Rest, auto-speak, in that order, centred on the top border of the message box and overlapping it, since they are the same kind of thing and the middle of the screen's top is where a gaze on its way anywhere passes. Riding on the border rather than sitting in a band above it is what keeps the cost to the grid at 2px instead of 18px; what it costs instead is that the top-centre of the message box answers to a mode rather than to the caret. It is **opaque black**, because it sits on the box and the border and the typed text used to show through the gaps between the three. `topbar` padding-top and `.topbar-modes` `top` have to stay equal, and at least half the strip's height — the toggles plus its own padding, 16px today — or the strip drifts off the border or over the top of the bar. **The box has a strip on each border in edit mode** — the modes above, the category and the voice below — and the lower one is sized by the same rule as the upper, out of a single `--edit-bar-inset` that is both the bar's padding-bottom in edit mode and the strip's own `bottom`. The filter bar and the emergency bar can both be arranged by hand, both out of `ui/reorder`, and each keeps its own mode — tidying the category tabs must not arm the bar somebody speaks with

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
- `core/virtual.test.ts` - The windowing arithmetic, including the case where nothing can be measured
- `core/texting.test.ts` - The acronym behind every phrase in the **Texting** category. The table holds only the expansion, so this is the one place the pairing is written down. The profane ones carry their rude word cut to its first letter, which is also the letter the acronym uses — so `wtf` still finds "What the f"; `CENSORED` there holds that rule
- `core/backup.test.ts` - The backup format: round trips, exporting a few categories, merge vs replace, and what a damaged file is allowed to do
- `core/store.test.ts` - The arithmetic behind arranging things by hand: where a lifted thing lands, and what happens to something the order has never heard of
- `core/markdown.test.ts` - What the markup means, what stays literal, and the one invariant holding it together: `stripMarkdown` reads exactly what `layout` draws
- `core/links.test.ts` - What a paste or a drop is carrying: which URL, which label, and the schemes that are refused
- `voice/elevenlabs.test.ts` - The API client: linking, its failure messages, and the audio cache
- `voice/speech.test.ts` - Which voice a phrase comes out of, and that it always comes out of one of them
- `voice/groups.test.ts` - The voice filters, and that the two kinds never answer to each other's groups
- `ui/dwell.test.tsx` - The dwell hook: timing, tap, keyboard, disabled, and repeat
- `ui/caret.test.tsx` - Which of the two caret APIs is trusted, when neither is, and the one claim about the hook the app tests cannot make — that it reports where it put the caret
- `src/App.test.tsx` - Whole-app flows driven through the real DOM
- `src/categories.test.tsx` - Adding, renaming, deleting and ordering category tabs, and paging the bar — the page arithmetic, the order the arrows sit in, and that a page repeats while held. **Paging tests have to supply the geometry** (`clientWidth`, `clientHeight`), since jsdom lays nothing out and a page measured from nothing is a page of nothing. The portrait rule is asserted against the text of `index.css`, which is all jsdom allows — whether it *takes effect* is a question for the deploy preview
- `src/emergency.test.tsx` - Arranging the emergency bar, and the two things that must not follow from it: a phrase moved out of reach of the order it was stored under, and a bar left in reorder mode when somebody needs to speak
- `src/markdown.test.tsx` - Where the markup ends up once a phrase is used: drawn on the board, gone from what is spoken and searched, kept in the message box and on the clipboard. **Scope the grid to the seeded category first** — the board also holds the two and a half thousand phrases Peri ships, several of which begin with "Help"
- `src/shell.test.ts` - `index.html` and the manifest: the parts of the app no component renders
- `src/structure.test.ts` - The layering above, plus the three ways it quietly rots: a module dropped at the root, Tailwind widening its scan back to the whole project, and **a NUL byte making a file binary to grep** — `core/backup.ts` used one as a map-key separator, and every search across the tree skipped that file without saying so. The character is right for the job; it has to be written as an escape
- `src/test/setup.ts` - Stubs for the platform APIs jsdom lacks (speech synthesis, `ResizeObserver`, scrolling, clipboard, audio playback). `scrolledIntoView` records what asked to be brought into view — jsdom has no layout and so no `scrollIntoView` at all, which is a missing function rather than one that quietly does nothing

Two things worth knowing when adding to them:

- The app grid renders every phrase in the table, so query it with `container.querySelector` rather than Testing Library's `getByRole` — building an accessibility tree over a couple of thousand cells for each lookup is slow enough to matter.
- **The grid renders every cell under jsdom**, because windowing needs a measured viewport and jsdom lays nothing out. That is the documented fallback, not an accident — a test that wants the window has to supply the geometry, as `rendering only part of a long grid` does in `App.test.tsx`.
- **`performance.now()` is faked by `vi.useFakeTimers()`.** A benchmark that reads it measures the fake clock and reports whatever `advanceTimersByTime` was given. Capture the real one at module load.
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

How many options a slot ends up with decides the interaction, so mind the boundaries: **none** is a blank the caret lands in for typing, **exactly one** is substituted straight into the text with no picker, and **two or more** opens the slot picker. `hasChoices` and `choosableSlots` both key off `options.length > 1` for that reason.

**`BLANK` is the empty string.** A blank puts no characters into what gets said, copied or typed over — the gap is the placeholder. Two things carry it, and both are needed, because a blank nobody can see is a blank nobody fills:

- On the board, `.phrase-slot.is-blank` keeps a `min-width`, so the dashed underline is still drawn across an empty gap.
- In the message box, `composeWithBlank` reports where the gap landed and the caret is put there. It has to *report* it, because there is nothing left in the text to search for — and `indexOf('')` answers with the position you asked about, which would land the caret at the start of every phrase inserted, blank or not.

Two consequences worth knowing:

- **Ask `hasBlank(segments)`, never `text.includes(BLANK)`.** The second is true of every phrase on the board. It emptied three tests silently when `BLANK` changed, rather than failing them.
- **`composeWithBlank` tracks the gap with a private-use character, not with `BLANK`.** Composing collapses spaces and trims ends, which moves every offset after the point it changes, so the only way to know where a blank *ended up* is to leave something there while that happens. It is not whitespace, so a blank spaces exactly as the old `___` did — and a word typed into the gap needs no spacing of its own, including before punctuation.

Slot options are baked in at parse time, so `buildPhrases(profile)` re-parses the table when the profile changes. Phrase ids hash the *source* text rather than the rendered text, so saved edits survive a profile change.

**A phrase carries both what it reads as and what it was written as.** `text` is the display form, with every slot resolved into a label; `source` is the raw `I want the {['red', 'blue']} one`. The second cannot be rebuilt from the first — "red/blue" is a label, and `{pronouns}` has become a list of words that would no longer follow the alias table or the user's own details.

Which one to use is not a matter of taste:

- **The editor loads `source`.** It loaded `text` for most of this app's life, so opening a fill-in-the-blank phrase showed "I want the red/blue one" and saving stored exactly that — flattening the slot for good, silently, on a phrase somebody had only opened to look at. `src/App.test.tsx` guards both halves: what the box shows, and that a phrase opened and saved unchanged still offers its choices.
- **Anything that speaks, fetches or previews composes first.** The draft holds `source`, so the voice preview and `warmVoice` both run it through `compose(parseSegments(…))`. Sent raw, ElevenLabs reads the brackets aloud and stores the clip under text nothing ever asks for again — and the phrase drops back to the device voice, having been paid for twice.
- **Everything else — speech, search, the grid, a phrase's accessible label — uses `text`.**

## Editing a phrase

**In edit mode the message box is the phrase editor.** There was a dialog for it, and a dialog is the wrong shape for a board driven by gaze: it covered the very phrases being edited, it had to be got out of before anything else could be reached, and every one of its controls was a target somewhere the pointer had never been. So there is always a draft — `talk/use-editor.ts` — and choosing a phrase points the draft at it rather than opening anything.

- **The rail changes with the mode, in the same three places.** Speak, copy and paste become save, delete and paste; Clear becomes "start a new phrase". Paste is the one that means the same thing either way, which is why it keeps the end of the row while the two beside it change. Delete **goes quiet rather than away** while there is nothing to delete, for the reason the emergency bar's add control does: a control that comes and goes moves the ones beside it, and these are aimed at rather than read.
- **A second strip rides the box's lower border**, centred on it exactly as the modes ride the upper one, and carrying the two things a phrase has besides its words — the category and the voice. Both are triggers onto a full-screen grid, because that is the only shape of "one out of many" a dwell can work. The category was a native `<select>`, whose list the operating system draws outside the page, where nothing can be hovered at all. Its grid ends in a tile that is not a category: **New category…** hands over to the same `CategoryModal` the tabs use, since naming one is a keyboard job. **The two are one number**, `--edit-bar-inset`: it is `.topbar` padding-bottom in edit mode, which is where the box's lower border falls, and it is the strip's own `bottom`, which with `translateY(50%)` is where the strip's centre line falls. It is half the strip's stated height, so the lower edge reaches the bottom of the bar and no further. Written as two numbers they drifted apart at the first change — the padding grew and the strip stayed put, leaving it centred 20px *below* the border it rides.
- **Saving closes nothing, because nothing was opened.** The draft goes back to blank and a toast says what happened — without it a save has no visible result beyond one cell appearing somewhere among a couple of thousand.
- **The message and the draft are separate.** Entering edit mode carries the message in as a new phrase, so "keep what I just wrote" is a mode switch rather than a feature — but writing a phrase never writes the message, and leaving edit mode gives it back untouched.
- **The grid does not narrow to the draft.** `currentWord` filters the board while a message is being composed; in edit mode `filterWord` is empty, or the phrases somebody came to edit would disappear as they typed. The guard only bites when edit mode was entered with something already composed, which is the only way to test it: writing a phrase writes the draft and never the message, so a test that clears the box first passes with the guard taken out.
- **The board opens talking, and with the caret in the box.** Auto-speak is the state every load starts in, and the message box carries `autoFocus` so somebody with a keyboard can type the first thing they want to say without having to place the caret first — the one thing a dwell could not do at all until `useCaretDwell`. A programmatic focus does not raise a phone's on-screen keyboard, which needs a real gesture.
- **Three states, two controls, in a ring.** A dwell on a phrase either says it (**auto-speak**), collects it (**composing**), or opens it (**edit**), and never more than one of those. Auto-speak is where the board ships, so opening Peri for the first time is enough to say something. Switching auto-speak *off* is a request to change the phrases, so it lands in edit mode; switching edit off comes back to composing. The ring is what lets two toggles reach three states without either of them ever doing nothing. `setMode` in `talk.tsx` is the only thing that writes any of it.

`Draft` derives everything it can rather than copying it: `text`, `category` and `voice` are stored only once touched, and everything else is read off the phrase each render, so a draft cannot go stale against a store that changed underneath it.

## Placing the caret

A text box is the one control dwell alone could not drive. Hovering can focus it, but the caret only ever moved when something was clicked — and a click is the input a gaze user does not have. Typing itself comes from whatever keyboard they already use; saying *where* to type is the part no keyboard supplies. So **the message box answers to a dwell of its own**, which puts the caret under the pointer: `useCaretDwell` in `ui/caret.ts`. There were two boxes until the phrase editor moved onto the main screen; there is one now, doing both jobs, and the dwell is on it in both of them.

- **On the message box the caret does a second job.** It decides which word the grid narrows itself to, so placing it is how a gaze user says which word to finish. That state is tracked rather than read off the box, so the hook reports where it put the caret and `use-composer`'s `setCursor` is told. jsdom happens to reach the same state by a second route — `setSelectionRange` fires a `selectionchange` that React turns into `onSelect`, already wired to the same setter — so **no app test can isolate that wiring**, and `ui/caret.test.tsx` holds it instead. It is worth holding: `selectionchange` on a form control is a late addition, and where it is missing the grid quietly completes a word the caret has left.
- **In edit mode the box holds a phrase, and is still a box.** It was `readOnly` there — a button whose hold opened the editor dialog — with the caret dwell switched off and a second dwell in its place. There is no dialog to open, so the second dwell is gone and the caret one runs in both modes. What does not run in edit mode is `onPlace`: the caret it reports belongs to the composer, and it decides which word the grid narrows itself to.
- **The message box used to stop arming once it held focus.** That gate was protecting something real, a pointer parked on the box while its owner types, but it also made the caret placeable exactly once, on the way in. Aiming settles it instead: a pointer that has not moved does not re-arm, focus or no focus.
- **Two APIs answer the question and they are not equally trustworthy.** `caretPositionFromPoint` answers about a form control *as* a form control — the field itself and a character index into its value — and is taken whatever the value looks like. `caretRangeFromPoint` reaches inside and answers about the run of text it found there, which is the whole value only while the value is one line; on a phrase written over several it would land the caret nowhere near the pointer, so it is **declined rather than guessed at**. Null means leave the caret alone; putting it at nought would jump to the front of the phrase on every dwell.
- **Where neither exists the box is still focused.** That is the difference between a box that can be typed into and one that cannot.
- **Aiming somewhere new re-arms the dwell.** It fires once on arrival, so without that the caret could be placed only by leaving the box and coming back — but gaze never holds perfectly still, so `AIM_TOLERANCE` has to sit above the jitter.
- **The distance is measured from where the wait began, which is why the hook keeps two positions.** `aim` is where the pointer is, and is what the caret is placed by; `armedAt` is where the current wait started, and is what `movedAway` is asked about. Measuring each movement against the one before it looks equivalent and is not: a pointer does not jump, it crosses a phrase in three-pixel steps, and nothing ever exceeds the tolerance. That shipped, and the symptom was the feature simply not working — leaving the box and coming back was still the only way to place the caret twice.
- **The box restarts its own fill.** Every other control remounts its `dwell-bar` to replay the animation, but a textarea can hold no children, so the fill is a CSS animation on the box itself and the `dwelling` class does not change across a re-arm — cancel and start land in one render, React writes nothing, and the bar keeps promising a firing that is no longer coming. `restartFill` takes the animation off, reads a layout property, and puts it back. jsdom lays nothing out, so nothing tests it.
- **Testing any of this needs a `pointermove` without a `pointerenter`**: a pointer travelling within an element only fires the first, and firing the second re-arms the dwell by itself and makes the test pass with the re-arming taken out. It also needs **more than one move** — a single sixty-pixel jump passes whichever position the distance is measured from.
- **Only the pointer handlers go on the textarea**, which is why the hook hands back nothing else. Spreading the whole set from `useDwellControl` would put its Enter/Space handling on a box people type into, and the first space typed would be swallowed.

## Markdown in a phrase

A phrase may carry markdown: `**bold**`, `*italic*`, `~~struck~~`, `` `code` ``, `# headings` and `- bullets`. It is a way of making a button readable at a glance and nothing more. `core/markdown.ts` holds all of it.

**The rule everything else follows from: what the eye sees is styled, what the ear hears is the words.** `stripMarkdown` and `layout` walk the same parse, and `core/markdown.test.ts` asserts they agree on every case — if they ever come apart, a phrase becomes unfindable or gets spoken wrong.

- **Stripping happens once, inside `speak()`.** Every route to the synthesiser can arrive with asterisks in hand, because the message box keeps them. Doing it at the single place utterances are created is what makes "the app never says *asterisk asterisk*" a property rather than a habit. `warmVoice` and the warm-up in `useBoard` strip the same way **or the audio cache silently misses**: a clip stored under the marked-up text is one the phrase asking for it never finds, and on the emergency bar that reads as a phrase quietly losing the voice it was given.
- **The markup is kept in the message box and on the clipboard.** That is deliberate — the box is where a message is assembled and edited, and a copied message may be going somewhere that renders it. Speech and search are the things that strip.
- **Underscores emphasise between words, never inside one.** `_like this_` is italic and `snake_case_name` is a name — the rule every markdown supporting both delimiters settles on. Asterisks carry no such restriction, because nobody writes `snake*case*name` by accident. It is **two** guards, opening and closing, and a phrase with underscores only inside words exercises just the closing one: with nothing able to close, nothing opens either way. `snake_case here_ and` is what shows the opening guard doing anything.
- **Nothing is markup until it closes.** A lone `*` is a character somebody typed; "2 * 3" is arithmetic. A phrase must not lose characters while it is being written.
- **Markup never crosses a slot.** Slots are parsed out before any of this runs. The shipped table has slots and no markdown, and a phrase somebody writes has the reverse, so the two rarely meet — but the limit is real and tested rather than pretended away.
- **A heading is a style, not an `<h2>`, and a link is a style, not an `<a>`.** These sit inside a `role="button"`; real document structure there would be a lie to a screen reader, which reads the plain text off the button's own label. A real anchor would also give a gaze user two targets in one place, and the one they did not mean takes the board away mid-sentence.

### Links

`[label](url)`, added by **pasting or dropping a link** into the message box. A URL is the worst thing a board can hold as text — long, wrapping a whole row, and forty seconds of punctuation read aloud — so what goes on the button is its name.

- **The URL rides in `Style`; the label is the run's own text.** So everything that reads a phrase's words — speech, search, the button's label — gets the label and never the URL, without having to know links exist.
- **The label is the best thing on offer:** the text of a dragged link, then the page title a dragged tab carries (`text/x-moz-url`), then the site's own name with the `www.` off. It is flattened to one line, because a phrase reads newlines as new lines now, and it is deliberately *not* shortened — it sits in a box the user can edit, and quietly cutting somebody's words down is worse than showing all of them.
- **Only `http`, `https` and `mailto`.** Nothing renders a real anchor today, but this text is copied to a clipboard and pasted into things that will, and a board is a file people hand to each other. `javascript:` above all.
- **A phrase that is *nothing but* a link opens it in a new tab and speaks nothing.** `soleLink` draws that line, and where it falls is the whole safety argument: `[Today's menu](…)` is a button for going somewhere and reads as nothing said aloud, while "Have a look at [the menu](…) later" is a sentence somebody built — and a sentence must never lose its voice to a browser tab. Styling inside the label is still one link; a slot, a second line, or a word outside it is not. **Edit mode wins over it**, or a link would be a phrase nobody could ever reword.
- **A new tab, never this one.** The board is how somebody is talking; navigating it away mid-conversation takes their voice rather than lending them a browser. `noopener` so the page opened cannot reach back and drive the tab the board is in.
- **Opening can be refused, and it is said out loud when it is.** A browser only allows `window.open` off the back of a recent click, tap or key press — and a dwell is a timer firing after a pointer has rested, with no press anywhere in it. So the users this is for are the ones most likely to be blocked. `openLink` reports whether it managed, and the screen flashes a toast when it did not; silence would leave the choice looking simply broken.
- **A dwell user has no Ctrl-V**, so a control asks on their behalf, at the end of the topbar's rail — the one control there that means the same thing in both modes, which is why it keeps its place while the two beside it change. It gets the same treatment a keyboard paste does, address into `[label](url)` included, and lands at the caret. **It can be refused**: reading the clipboard needs permission and, in most browsers, a recent click or key press, and a dwell is a timer with no press in it — Firefox does not offer it to a page at all. So `pasteFromClipboard` answers `pasted | empty | refused` and the screen says which, exactly as it does behind a blocked link. Never disabled, because what is on the clipboard is not the app's to know until it asks.
- **A paste goes to the caret; a drop goes to the end.** A drop comes from outside the box and carries no caret of its own, and browsers disagree about where one would be — appending is at least the same answer every time. Telling the two apart in a test needs a caret that is *not* at the end, since typing leaves it there and both answers then look alike.
- **The parser has no escapes.** The first `]` closes the label and the first `)` closes the URL, so `linkMarkdown` strips brackets out of the label and percent-encodes a closing one in the URL. Only the closing bracket: an opening one ends nothing.
- **`tidy` and `compose` collapse spaces but not newlines.** They used to collapse every run of whitespace, which made a multi-line phrase impossible. Nothing in the shipped table has ever held a newline, so this narrowed what is collapsed rather than changing any phrase Peri comes with.

## Settings

Five numeric values, a voice, and a linked account. **`autoSpeak` ships on and is not carried across a load** — see the mode ring under *Editing a phrase*. It is stored like the rest and ignored on the way back in, so the board opens ready to talk however it was left: a board that cannot say anything the moment it is switched on is not recoverable the way a mode two dwells away is. That is why `readSettings` falls its missing case back to the default rather than to `false`, and why every test about composing switches out of auto-speak after rendering rather than seeding it off. Three things about putting them back:

- **Every settable value carries a revert**, at the end of its spinner, which goes quiet at the default rather than away — a row that changed width as a value crossed its default would move the two buttons beside it. `SettingSpinner` takes `defaultValue` **in the units it displays**, so Volume and Speed scale theirs the same way they scale `value`. `ResetIcon` is a closed loop, deliberately not the open hook `UndoIcon` draws: Undo lives in the topbar and means "the last thing I did to this message", and the two must not be learnt as one control.
- **Reset to Factory Defaults takes everything**, not just the settings — phrases, categories, the emergency arrangement, details, the sent list, the linked account. So it asks first, in a dialog **portalled and centred** for the same reason the Sign-out one is, and the first thing that dialog offers is a backup to keep. It **leaves the user signed in**: signing out is its own item with its own confirmation.
- **The reset clears storage and reloads.** Nothing in the panel can reach the React state holding the same values — the board, the composer, the sent list, its own account row — and a screen still offering phrases that no longer exist is worse than no reset at all. `RESETTABLE_KEYS` is a list rather than `localStorage.clear()`, because the origin may hold something Peri did not put there; a key added to the store and forgotten there is a key the reset leaves behind.

## Backups

A backup is a **diff against the phrase table, not a copy of it**. The table ships with the app, so a file holds only what the user did — added, reworded, moved, removed, rearranged — plus their details and settings. That is why ids matter: they hash the source text, so an id in a backup still names the same phrase in a later release, and one that names nothing is skipped.

Two things in `src/backup.ts` are deliberate and easy to "fix" by mistake:

- **Merging never removes a phrase.** Deleting a phrase is the one change the app offers no way back from, so a file someone else made cannot make one on your device. Only *replace* applies removals, and `canReplace` refuses it for a file covering a few categories — everything the file said nothing about would go.
- **Imported settings are clamped to `SETTING_LIMITS`.** A dwell time of zero fires every control the instant a pointer crosses it, leaving a gaze user no working control to undo it with — and a `repeatDelayMs` of nought empties a list before it can be read, with the control that would slow it down repeating just as fast. A file does not get to set a value the settings panel could not. `readSettings` builds the object field by field, so a new setting is a compiler error here rather than a silently dropped one.
- **`emergencyOrder` travels with the Emergency category and is never filtered down.** The other lists in a file are trimmed to the categories in scope; an arrangement trimmed to a few of its own ids is not a smaller arrangement, it is a wrong one. Merging appends what the file arranged behind what this device already had, exactly as `categoryOrder` does, so a file cannot rearrange a bar underneath the person using it.

## The emergency bar

The red bar is the one surface somebody reaches for without reading it, so which button sits where is theirs to set. **Menu → edit mode → the arrows at the end of the bar** turns reordering on; from there it behaves exactly like the category tabs, and both come out of `ui/reorder`.

- **The order is by phrase id, and empty means the order Peri ships.** Ids, so rewording a phrase leaves it exactly where it was put — the whole point of arranging a bar is reaching it without looking. Unlike the categories there is no second arrangement to switch back to: the shipped order is the order they happen to be written in, and nobody is looking for it back.
- **A phrase added later lands at the end.** `orderEmergency` ranks the ids it knows and leaves the rest as they came, so adding an emergency phrase does not rewrite an arrangement, and an id naming a deleted phrase is skipped rather than leaving a hole.
- **Reordering is its own mode, separate from the category tabs'.** One flag for both would arm the bar somebody speaks with every time they set about tidying their tabs. Both are modes *within* edit mode, and leaving edit mode disarms both.
- **The add control goes quiet rather than away while reordering.** Adding a phrase mid-reorder would drop whatever is in the air, and moving a control a user has learnt to find is worse than disabling it — so the two tools keep a constant width either way.

## Sent messages

Every message spoken or copied is kept, newest first, and shown under a **Sent** tab pinned to the left of **All**. Selecting one puts it back in the message box; in edit mode it comes into the box to be *kept* as a real phrase, and the bin *forgets* it.

- **Sent is not a category.** Its filter id is `SENT_FILTER`, which begins with a space so no real category — names are trimmed — can ever collide with it. Both it and All carry `fixed: true` in the `categories` prop, which is how `FilterBar` knows a tab cannot be renamed, dragged or reordered.
- **The list is never in a backup.** It is a record of what somebody actually said, and a backup is a file made to be handed to somebody else. Its own storage key, outside the three things `buildBackup` reads, with a test holding it there.
- **`record` and `forget` read storage back rather than closing over state.** Two sends can happen without a render in between, and the second would otherwise be written against a list that no longer exists.

## Voices

Two sources sit behind `speak()`. The device's own synthesiser is instant, free and works offline. A linked ElevenLabs account sounds better and does none of those things. Everything in `src/speech.ts` is arranged around one rule:

**A phrase never fails into silence.** A flat connection, an expired key, a rate limit, a browser refusing to autoplay — every one of them ends in the device speaking the words instead. If you add a path that can produce no audio, it falls back too.

Two consequences worth knowing before changing any of it:

- **The emergency bar never waits on the network**, via `speak(text, settings, { instant: true })`. That is not the same as "device voice": a phrase given its own voice keeps it there too, because assigning one fetches and stores the audio, so it is already in hand. What `instant` rules out is *going and asking* — anything not already fetched is said by the device this moment rather than in the right voice a second and a half later.
- **A new phrase starts from the last category and voice used**, kept under `peri_recent` and out of backups — it is where somebody had got to, not anything they made. Only a *starting point*: a phrase that already has a category or a voice shows its own, so opening one to fix a typo cannot quietly refile it or change how it sounds. A remembered category that has since gone is ignored, and unlinking an account forgets a remembered voice from it.
- **A phrase can carry its own voice**, in `voiceOverrides`. It beats the one in settings wherever the phrase is spoken, and it travels in a backup like any other customization. A phrase written from nothing has no id until it is saved, so `addPhrase` **hands its id back** and the voice is hung on it afterwards — the choice was simply dropped before, and the phrase came out in the app's voice however carefully another had been picked.
- **The API key is never in a backup.** It lives under its own storage key, outside the three things `buildBackup` is built from. A backup is made to be shared, and the key in one hands over the account. `src/backup.test.ts` holds it to that, and `src/legal.ts` says so to the user.

Audio is cached in two layers by `voice/audio-cache.ts`. The memory layer answers synchronously, which is the only kind of answer the emergency bar can use; the IndexedDB layer exists so the memory layer can be full again after a reload, and `useBoard` pulls the assigned phrases back into it at start-up. Where IndexedDB is missing — an old browser, a private window, jsdom — everything still works and simply forgets between sessions.

Audio is cached in memory by voice and text. An AAC board is the same phrases over and over, so the second time is free and instant — which is the difference between a usable feature and a bill.

Sending the words somewhere is a disclosure, so it is stated in three places that must agree: the ElevenLabs row in Settings, the **Better voices** section of the guide, and the Speech section of the privacy policy. Change one and change all three.

## The phrase grid

The grid is the app's heaviest surface — up to two and a half thousand cells, at roughly twenty microseconds each to create. Two things keep it usable, and they solve different halves of the problem:

- **`content-visibility: auto`** on `.phrase-cell` lets the browser skip layout and paint for cells scrolled out of view. That is the browser's half.
- **`core/virtual.ts`** limits how many cells React creates at all. Switching back to **All** cost ~95ms of pure reconciliation before it and ~12ms after.

The window **grows from the top and is never repositioned by arithmetic**. Rows are not a uniform height — a phrase long enough to wrap three times makes its whole row taller, and about one row in five does — so anything that multiplied a row height by an index would put the grid in the wrong place a fifth of the time. Rendering the first *n* in normal flow cannot.

Two properties hold it together, and both have mutation-tested guards:

- **Unmeasured means all of them.** Before the first paint, and under jsdom, there is no viewport to measure and the grid renders everything — which is exactly what it did before any of this existed.
- **It cannot strand a phrase.** `needsMore` asks for more within a screen's height of the bottom, and content shorter than the viewport is always within a screen of its own end. So a window too small keeps growing until the grid is scrollable, however far off the measurement was. `rendered >= total` is the only thing stopping that being an infinite loop — removing it hangs the test suite rather than failing it.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- `src/App.tsx` has the only default export. Everything else is named, so a rename is a compiler error rather than a silently different component.
- Export only what another module imports. A component with one caller stays private to its file.
- The phrase grid is memoised over a couple of thousand cells. A callback reaching it must not depend on a whole hook result — those are a fresh object every render, and the memo would never hold. Depend on the specific function instead; `deliverPhrase` in `src/talk.tsx` shows the shape.
