# Contributing

Thanks for helping out. This is assistive communication software — people use it to say things they cannot otherwise say, sometimes urgently. That shapes most of the conventions below.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are licensed under the [MIT License](LICENSE).

## Getting set up

The toolchain is pinned in `.mise.toml` (Node 22, pnpm 11.20.0). With [mise](https://mise.jdx.dev) installed:

```sh
mise install
pnpm install
pnpm dev
```

**Use pnpm, not npm.** `pnpm-lock.yaml` is the committed lockfile and `package-lock.json` is gitignored. Running `npm install` produces a second, conflicting lockfile and a `node_modules` layout that disagrees with CI.

**Nothing needs configuring to work on the app.** Sign-in providers and translation come from `VITE_*` variables — copy [.env.example](.env.example) to `.env.local` if you want them, and leave it out if you don't. "Continue as guest" always works, the shipped translations still speak, and no key in there is a secret; [README.md](README.md) says which are public by design and why.

## Before you push

```sh
pnpm check     # format, typecheck, lint, test
```

This is not advisory. GitHub Actions runs the same command on every pull request, and `main` will not take a change until it passes. Running it locally just saves you the round trip — see [README.md](README.md) for what runs where.

Useful while working:

| Command | Does |
|---|---|
| `pnpm test:watch` | Tests, re-running on change |
| `pnpm typecheck` | `tsc --noEmit` alone |
| `pnpm lint` | ESLint alone |
| `pnpm format` | Fixes what `format:check` reports |
| `pnpm build` | Production build into `dist/` |
| `pnpm probe` | The pointer probe — what a browser will and will not tell a page about the pointer |
| `pnpm mic-probe` | The microphone probe — which input the speech recogniser is actually on |

## Accessibility is the feature

Every interactive control must work three ways: **dwell** (hover and hold), **tap**, and **keyboard** (Enter/Space). Not two of the three. Someone driving this app with a head tracker, a switch, or a keyboard all need to reach the same things.

In practice that means building controls with `useDwellControl` from `src/ui/dwell.ts` and spreading the `props` it returns. It handles all three paths and stops them double-firing:

```tsx
const { active, props } = useDwellControl(settings.actionDwellMs, onActivate)
return <div role="button" aria-label="…" {...props}>…</div>
```

Also expected of anything interactive:

- A meaningful `aria-label`, and `aria-pressed` on toggles.
- A visible focus state — every control is in the tab order.
- Dwell timing from `settings`, never a hardcoded duration. Someone who lengthened their dwell because of tremor must not get a hair trigger on your control.
- **Two targets must never sit in one place.** A gaze lands somewhere and waits; whichever control is underneath answers, and the one it did not mean is the one that deletes something.

Speech goes through `speak()` in `src/voice/speech.ts` so the user's voice, volume, and rate are always applied.

## What must stay true

These are the properties a change can break without anything looking broken. Each is argued out in [AGENTS.md](AGENTS.md); what matters here is that they are not yours to trade away in passing.

- **The emergency bar never waits on a network.** It speaks with what is already in hand, and a phrase on it is one dwell from silence to sound.
- **A suggested answer is never spoken by itself.** Answers land on the board as cells to choose between; the one chosen is said on the dwell that says anything else. Nothing under `src/listen/` reaches the synthesiser.
- **A phrase never fails into silence.** Every path that can produce no audio — a flat connection, an expired key, a refused autoplay — ends in the device speaking the words.
- **Anything that sends somebody's words somewhere is a disclosure, and it is written in three places that must agree**: the row in Settings, the section in the guide (`src/menu/help.ts`), and the matching section of the privacy policy (`src/legal/legal.ts`). Change one, change all three.
- **A board belongs to the account that is signed in.** Every read and write of storage goes through `storageKey` in `src/core/store.ts`, which names whose it is; a bare key is one every account on the device shares. A test fails if a new one skips it.
- **No client secret, ever.** There is no backend to keep one in, and everything Vite inlines is readable in the bundle by design.

## Tests

Every test lives under `tests/`, mirroring the tree it covers — `tests/core/phrases.test.ts`, `tests/ui/dwell.test.tsx`, `tests/functions/sync.test.ts`. The ones that drive the whole app through `App` are in `tests/app/`, named after what they cover, over the shared `tests/app/harness.tsx`. Nothing goes beside the code it covers, and `netlify/functions/` is the reason: every file in that directory is published as a function, so a test written there was deployed as one.

**When you fix a bug, prove the test earns its place**: write it, then revert your fix and confirm it fails. A regression guard that passes with the bug reintroduced is worse than no test, because it looks like coverage. Several existing tests say in a comment which defect they guard.

Three things that will bite you otherwise:

- The board holds about 2,500 phrases, and the grid renders a windowful of them: `tests/setup.ts` gives it the viewport jsdom will not. Query with `container.querySelector` rather than Testing Library's `getByRole` — building an accessibility tree per lookup is slow enough to matter — and where a test needs the whole board on screen to find one phrase among thousands, `unmeasuredGrid()` puts the window away.
- Dwell is timer-driven. Use `vi.useFakeTimers()` and advance inside `act()`. Inserting a phrase also uses a zero-delay timer to place the cursor, so advance the clock after an interaction before asserting.
- A test that clicks proves nothing about whether a rest does anything. `tests/app/reach.test.tsx` rests and never clicks, and that is how every gap it covers was found.

## Branches and pull requests

Branch off `main` and open a pull request, labelled **`major`, `minor` or `patch`** — a check enforces exactly one, and `pnpm release` turns that label into the version commit that ends the branch. Merges are rebased to keep history linear, and `main` is protected: nobody commits to it directly, and nothing bypasses its checks. Getting a merged change in front of people is a separate, deliberate step — [README.md](README.md) describes it.

A PR description that says *why* is worth more than one that lists *what*; the diff already covers what.

## Things that will surprise you

- **Indexing is stated in two places.** `public/robots.txt` and the `robots` meta tag in `index.html` have to agree, or the site ends up half-hidden. A test enforces it.
- **`react-hooks/exhaustive-deps` is an error, not a warning.** A stale dependency array is how the phrase grid once silently stopped refreshing after an edit. If a dependency genuinely does not belong, restructure rather than suppressing.
- **The tree is formatter-clean, and `pnpm check` starts by checking it.** `pnpm format` fixes whatever it reports, in about twenty milliseconds. `.oxfmtrc.json` holds the style, and names what `oxfmt` must not touch — the phrase table, the stylesheet, the lockfile.
- **`src/App.tsx` answers "which screen is on" and little else, and is not where UI work starts.** The talking screen is `src/talk/talk.tsx`; [AGENTS.md](AGENTS.md) lists which file owns what.
- **`src/` is layered, and the layering is enforced.** `core/` → `ui/` → `translate/` → `voice/`, `sync/`, `listen/` → `menu/` → `talk/`, `signin/`, `legal/` → the root. Imports point down that list and never up, so put a new module in the lowest layer that can hold it rather than at the root. `tests/app/structure.test.ts` fails if they point up.
- **The stylesheet is deliberately one file.** Reordering its blocks changes the cascade, and no test here lays anything out. See the Styling section of [AGENTS.md](AGENTS.md).
- **Phrase slots depend on how many options they have** — none renders a typed blank, exactly one is substituted inline with no picker, two or more opens the picker. See the phrase notes in [AGENTS.md](AGENTS.md) before touching `src/core/phrases.ts`.
- **Anything you add to `public/` keeps one address from release to release**, so the service worker asks the network for it first and falls back to its cache. Only Vite's fingerprinted output under `/assets/` is served cache-first. Getting that backwards is how an installed copy kept calling itself by the app's old name for a day.

[AGENTS.md](AGENTS.md) documents the project layout and is the fastest way to find where something lives.
