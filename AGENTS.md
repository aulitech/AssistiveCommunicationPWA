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

- `ui/dwell.ts` - `useDwellControl`, the hover-and-hold primitive every control is built on
- `ui/caret.ts` - `caretIndexAt`, which asks the browser what character sits under the pointer. A text box was the one control dwell alone could not drive: hovering can focus it, but the caret only ever moved on a click
- `ui/link-input.ts` - `useLinkInput`, the paste and drop handlers a text box needs to turn a link into markdown. Used by the message box and by the phrase editor
- `ui/reorder.ts` - `useReorder`, the pick-up-and-put-down primitive behind both bars that can be arranged. A pointer-drag needs a button held down while the pointer moves, which is the one gesture a dwell user cannot make — so anything arrangeable can also be *lifted*: one dwell picks it up, a second on another drops it there. The category tabs and the emergency bar arrange by identical rules, so the rules are written once here
- `ui/controls.tsx` - The dwell controls more than one screen uses: `DwellButton`, `NavItem`, `SettingRow`, `SettingSpinner`, `ScrollRow` (a row that scrolls sideways with its own dwell arrows — the filter chips outgrow the screen), `PickerModal` and `PickerTile` (a full-screen grid of choices, portalled to the body — a panel animated with `transform` makes `position: fixed` resolve against the panel rather than the viewport), `ScrollPane` (four dwell controls — jump to top, nudge up, nudge down, jump to bottom, each shown only when there is somewhere to go), `PanelButton`, `ProseSections`, `DwellCursor`
- `ui/settings.ts`, `ui/edit-mode.ts` - The two React contexts. Separate from the panels that edit them, or `controls.tsx` would have to import the settings screen, which is built out of `controls.tsx`
- `ui/style.ts` - `cx` and `dwellVar`. Not components, so not in `controls.tsx` — a module mixing the two loses fast refresh for everything importing it
- `ui/icons.tsx` - Inline SVG. Icons used by exactly one screen stay with that screen — `ReorderIcon` is here because both bars that can be arranged draw it

**voice/**

- `voice/speech.ts` - The single place utterances are created, and the routing between the device voice and a linked account
- `voice/audio-cache.ts` - Audio already fetched, in memory and in IndexedDB. The memory layer is what makes a phrase's own voice usable on the emergency bar
- `voice/picker.tsx` - Choosing a voice. One control, used by Settings for the app's voice and by the phrase editor for a single phrase's. It sits above `ui/` in the layering for that reason — it is built out of `ui` controls, so `voice` cannot be beside it
- `voice/groups.ts` - Cutting a long voice list down: device voices by language, an account's by the collection it files them under
- `voice/elevenlabs.ts` - A linked ElevenLabs account: validating a key, fetching its voices, fetching audio, and the cache in front of it

**menu/**

- `menu/menu.tsx` - The panel itself, the four things it opens, and the confirmation in front of **Sign out** — the one item here that empties the screen. That dialog is portalled and centred on purpose: a pointer rests where it last fired, so a "yes" appearing under the nav item would be answered by the pointer already sitting there. **Back is the only way out that does not need a keyboard** — the scrim behind the panel is inert on purpose, since a pointer wandering across it used to take the menu away
- `menu/settings-panel.tsx`, `menu/profile-panel.tsx`, `menu/backup-panel.tsx`, `menu/help-panel.tsx` - Those four. All four panels bound their height and scroll — the profile grows with every contact, the settings with the linked-account row — and hold their content to the same 68ch column: the panel spans the whole viewport, so without it a setting's label sits at one edge of a wide monitor and its control at the other. The voice picker and the backup category picker are both full-screen grids built from `PickerModal` — the first single-select, the second multi-select. The voice picker is a full-screen grid, and choosing a voice speaks a sample in it and leaves the grid open — a preview button beside each of sixty tiles would put two targets in every one. Cancel puts back the voice the picker opened on, which is what makes trying them free. It is portalled to the body: the panel is animated with `transform`, and a transformed ancestor makes `position: fixed` resolve against that ancestor rather than the viewport — any full-screen overlay opened from inside a panel needs the same treatment
- `menu/help.ts` - The guide, as data

**talk/** — **the usual starting point for UI work**

- `talk/talk.tsx` - The screen: which dialog is open, which category is showing, and what to say when an operation finishes
- `talk/use-board.ts` - What is on the board and every way of changing it
- `talk/use-composer.ts` - The message being built: its text, its history, and the caret
- `talk/use-sent.ts` - The messages already spoken or copied
- `talk/use-toast.ts` - The line that appears and fades
- `talk/grid.tsx` - The grid, the cell, and the rail. **Only the first n cells are rendered** — see `core/virtual.ts`
- `talk/phrase-text.tsx` - `PhraseText`, which draws a phrase's slots and any markdown in it. Used by the grid cell and the emergency bar, so a phrase looks the same wherever it is shown
- `talk/topbar.tsx`, `talk/filter-bar.tsx`, `talk/emergency.tsx`, `talk/slots.tsx`, `talk/editors.tsx` - One surface each. The filter bar and the emergency bar can both be arranged by hand, both out of `ui/reorder`, and each keeps its own mode — tidying the category tabs must not arm the bar somebody speaks with

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
- `ui/caret.test.ts` - Which of the two caret APIs is trusted, and when neither is
- `src/App.test.tsx` - Whole-app flows driven through the real DOM
- `src/categories.test.tsx` - Adding, renaming, deleting and ordering category tabs
- `src/emergency.test.tsx` - Arranging the emergency bar, and the two things that must not follow from it: a phrase moved out of reach of the order it was stored under, and a bar left in reorder mode when somebody needs to speak
- `src/markdown.test.tsx` - Where the markup ends up once a phrase is used: drawn on the board, gone from what is spoken and searched, kept in the message box and on the clipboard. **Scope the grid to the seeded category first** — the board also holds the two and a half thousand phrases Peri ships, several of which begin with "Help"
- `src/shell.test.ts` - `index.html` and the manifest: the parts of the app no component renders
- `src/structure.test.ts` - The layering above, plus the two ways it quietly rots: a module dropped at the root, and Tailwind widening its scan back to the whole project
- `src/test/setup.ts` - Stubs for the platform APIs jsdom lacks (speech synthesis, `ResizeObserver`, scrolling, clipboard, audio playback)

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

- **The editor opens on `source`.** It opened on `text` for most of this app's life, so opening a fill-in-the-blank phrase showed "I want the red/blue one" and saving stored exactly that — flattening the slot for good, silently, on a phrase somebody had only opened to look at. `src/App.test.tsx` guards both halves: what the editor shows, and that a phrase opened and saved unchanged still offers its choices.
- **Anything that speaks, fetches or previews composes first.** The editor hands back `source`, so the voice preview and `warmVoice` both run it through `compose(parseSegments(…))`. Sent raw, ElevenLabs reads the brackets aloud and stores the clip under text nothing ever asks for again — and the phrase drops back to the device voice, having been paid for twice.
- **Everything else — speech, search, the grid, a phrase's accessible label — uses `text`.**

## Placing the caret

A text box is the one control dwell alone could not drive. Hovering can focus it, but the caret only ever moved when something was clicked — and a click is the input a gaze user does not have. Typing itself comes from whatever keyboard they already use; saying *where* to type is the part no keyboard supplies. So **the phrase editor's text answers to a dwell of its own**, which puts the caret under the pointer.

- **Two APIs answer the question and they are not equally trustworthy.** `caretPositionFromPoint` answers about a form control *as* a form control — the field itself and a character index into its value — and is taken whatever the value looks like. `caretRangeFromPoint` reaches inside and answers about the run of text it found there, which is the whole value only while the value is one line; on a phrase written over several it would land the caret nowhere near the pointer, so it is **declined rather than guessed at**. Null means leave the caret alone; putting it at nought would jump to the front of the phrase on every dwell.
- **Where neither exists the box is still focused.** That is the difference between a box that can be typed into and one that cannot.
- **Aiming somewhere new re-arms the dwell.** It fires once on arrival, so without that the caret could be placed only by leaving the box and coming back — but gaze never holds perfectly still, so `AIM_TOLERANCE` has to sit above the jitter. **Testing this needs a `pointermove` without a `pointerenter`**: a pointer travelling within an element only fires the first, and firing the second re-arms the dwell by itself and makes the test pass with the re-arming taken out.
- **Only the pointer handlers go on the textarea.** Spreading the whole set from `useDwellControl` would put its Enter/Space handling on a box people type into, and the first space typed would be swallowed.

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

`[label](url)`, added by **pasting or dropping a link** into the message box or the phrase editor. A URL is the worst thing a board can hold as text — long, wrapping a whole row, and forty seconds of punctuation read aloud — so what goes on the button is its name.

- **The URL rides in `Style`; the label is the run's own text.** So everything that reads a phrase's words — speech, search, the button's label — gets the label and never the URL, without having to know links exist.
- **The label is the best thing on offer:** the text of a dragged link, then the page title a dragged tab carries (`text/x-moz-url`), then the site's own name with the `www.` off. It is flattened to one line, because a phrase reads newlines as new lines now, and it is deliberately *not* shortened — it sits in a box the user can edit, and quietly cutting somebody's words down is worse than showing all of them.
- **Only `http`, `https` and `mailto`.** Nothing renders a real anchor today, but this text is copied to a clipboard and pasted into things that will, and a board is a file people hand to each other. `javascript:` above all.
- **A phrase that is *nothing but* a link opens it in a new tab and speaks nothing.** `soleLink` draws that line, and where it falls is the whole safety argument: `[Today's menu](…)` is a button for going somewhere and reads as nothing said aloud, while "Have a look at [the menu](…) later" is a sentence somebody built — and a sentence must never lose its voice to a browser tab. Styling inside the label is still one link; a slot, a second line, or a word outside it is not. **Edit mode wins over it**, or a link would be a phrase nobody could ever reword.
- **A new tab, never this one.** The board is how somebody is talking; navigating it away mid-conversation takes their voice rather than lending them a browser. `noopener` so the page opened cannot reach back and drive the tab the board is in.
- **Opening can be refused, and it is said out loud when it is.** A browser only allows `window.open` off the back of a recent click, tap or key press — and a dwell is a timer firing after a pointer has rested, with no press anywhere in it. So the users this is for are the ones most likely to be blocked. `openLink` reports whether it managed, and the screen flashes a toast when it did not; silence would leave the choice looking simply broken.
- **A paste goes to the caret; a drop goes to the end.** A drop comes from outside the box and carries no caret of its own, and browsers disagree about where one would be — appending is at least the same answer every time. Telling the two apart in a test needs a caret that is *not* at the end, since typing leaves it there and both answers then look alike.
- **The parser has no escapes.** The first `]` closes the label and the first `)` closes the URL, so `linkMarkdown` strips brackets out of the label and percent-encodes a closing one in the URL. Only the closing bracket: an opening one ends nothing.
- **`tidy` and `compose` collapse spaces but not newlines.** They used to collapse every run of whitespace, which made a multi-line phrase impossible. Nothing in the shipped table has ever held a newline, so this narrowed what is collapsed rather than changing any phrase Peri comes with.

## Backups

A backup is a **diff against the phrase table, not a copy of it**. The table ships with the app, so a file holds only what the user did — added, reworded, moved, removed, rearranged — plus their details and settings. That is why ids matter: they hash the source text, so an id in a backup still names the same phrase in a later release, and one that names nothing is skipped.

Two things in `src/backup.ts` are deliberate and easy to "fix" by mistake:

- **Merging never removes a phrase.** Deleting a phrase is the one change the app offers no way back from, so a file someone else made cannot make one on your device. Only *replace* applies removals, and `canReplace` refuses it for a file covering a few categories — everything the file said nothing about would go.
- **Imported settings are clamped to `SETTING_LIMITS`.** A dwell time of zero fires every control the instant a pointer crosses it, leaving a gaze user no working control to undo it with. A file does not get to set a value the settings panel could not.
- **`emergencyOrder` travels with the Emergency category and is never filtered down.** The other lists in a file are trimmed to the categories in scope; an arrangement trimmed to a few of its own ids is not a smaller arrangement, it is a wrong one. Merging appends what the file arranged behind what this device already had, exactly as `categoryOrder` does, so a file cannot rearrange a bar underneath the person using it.

## The emergency bar

The red bar is the one surface somebody reaches for without reading it, so which button sits where is theirs to set. **Menu → edit mode → the arrows at the end of the bar** turns reordering on; from there it behaves exactly like the category tabs, and both come out of `ui/reorder`.

- **The order is by phrase id, and empty means the order Peri ships.** Ids, so rewording a phrase leaves it exactly where it was put — the whole point of arranging a bar is reaching it without looking. Unlike the categories there is no second arrangement to switch back to: the shipped order is the order they happen to be written in, and nobody is looking for it back.
- **A phrase added later lands at the end.** `orderEmergency` ranks the ids it knows and leaves the rest as they came, so adding an emergency phrase does not rewrite an arrangement, and an id naming a deleted phrase is skipped rather than leaving a hole.
- **Reordering is its own mode, separate from the category tabs'.** One flag for both would arm the bar somebody speaks with every time they set about tidying their tabs. Both are modes *within* edit mode, and leaving edit mode disarms both.
- **The add control goes quiet rather than away while reordering.** Adding a phrase mid-reorder would drop whatever is in the air, and moving a control a user has learnt to find is worse than disabling it — so the two tools keep a constant width either way.

## Sent messages

Every message spoken or copied is kept, newest first, and shown under a **Sent** tab pinned to the left of **All**. Selecting one puts it back in the message box; in edit mode the editor offers to *Keep* it as a real phrase or *Forget* it.

- **Sent is not a category.** Its filter id is `SENT_FILTER`, which begins with a space so no real category — names are trimmed — can ever collide with it. Both it and All carry `fixed: true` in the `categories` prop, which is how `FilterBar` knows a tab cannot be renamed, dragged or reordered.
- **The list is never in a backup.** It is a record of what somebody actually said, and a backup is a file made to be handed to somebody else. Its own storage key, outside the three things `buildBackup` reads, with a test holding it there.
- **`record` and `forget` read storage back rather than closing over state.** Two sends can happen without a render in between, and the second would otherwise be written against a list that no longer exists.

## Voices

Two sources sit behind `speak()`. The device's own synthesiser is instant, free and works offline. A linked ElevenLabs account sounds better and does none of those things. Everything in `src/speech.ts` is arranged around one rule:

**A phrase never fails into silence.** A flat connection, an expired key, a rate limit, a browser refusing to autoplay — every one of them ends in the device speaking the words instead. If you add a path that can produce no audio, it falls back too.

Two consequences worth knowing before changing any of it:

- **The emergency bar never waits on the network**, via `speak(text, settings, { instant: true })`. That is not the same as "device voice": a phrase given its own voice keeps it there too, because assigning one fetches and stores the audio, so it is already in hand. What `instant` rules out is *going and asking* — anything not already fetched is said by the device this moment rather than in the right voice a second and a half later.
- **A new phrase starts from the last category and voice used**, kept under `peri_recent` and out of backups — it is where somebody had got to, not anything they made. Only a *starting point*: a phrase that already has a category or a voice shows its own, so opening one to fix a typo cannot quietly refile it or change how it sounds. A remembered category that has since gone is ignored, and unlinking an account forgets a remembered voice from it.
- **A phrase can carry its own voice**, in `voiceOverrides`. It beats the one in settings wherever the phrase is spoken, and it travels in a backup like any other customization.
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
