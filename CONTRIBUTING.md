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
| `pnpm build` | Production build into `dist/` |

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

Speech goes through `speak()` in `src/voice/speech.ts` so the user's voice, volume, and rate are always applied.

## Tests

Every test lives under `tests/`, mirroring the tree it covers — `tests/core/phrases.test.ts`, `tests/ui/dwell.test.tsx`, `tests/functions/sync.test.ts`. The ones that drive the whole app through `App` are in `tests/app/`. Nothing goes beside the code it covers, and `netlify/functions/` is the reason: every file in that directory is published as a function, so a test written there was deployed as one.

**When you fix a bug, prove the test earns its place**: write it, then revert your fix and confirm it fails. A regression guard that passes with the bug reintroduced is worse than no test, because it looks like coverage. Several existing tests say in a comment which defect they guard.

Two things that will bite you otherwise:

- The board holds about 2,500 phrases, and the grid renders a windowful of them: `tests/setup.ts` gives it the viewport jsdom will not. Query with `container.querySelector` rather than Testing Library's `getByRole` — building an accessibility tree per lookup is slow enough to matter — and where a test needs the whole board on screen to find one phrase among thousands, `unmeasuredGrid()` puts the window away.
- Dwell is timer-driven. Use `vi.useFakeTimers()` and advance inside `act()`. Inserting a phrase also uses a zero-delay timer to place the cursor, so advance the clock after an interaction before asserting.

## Branches and pull requests

Branch off `main` and open a pull request, labelled **`major`, `minor` or `patch`** — a check enforces exactly one, and `pnpm release` turns that label into the version commit that ends the branch. Merges are rebased to keep history linear, and `main` is protected: nobody commits to it directly, and nothing bypasses its checks. Getting a merged change in front of people is a separate, deliberate step — [README.md](README.md) describes it.

A PR description that says *why* is worth more than one that lists *what*; the diff already covers what.

## Things that will surprise you

- **Indexing is stated in two places.** `public/robots.txt` and the `robots` meta tag in `index.html` have to agree, or the site ends up half-hidden. A test enforces it.
- **`react-hooks/exhaustive-deps` is an error, not a warning.** A stale dependency array is how the phrase grid once silently stopped refreshing after an edit. If a dependency genuinely does not belong, restructure rather than suppressing.
- **The tree is formatter-clean, and `pnpm check` starts by checking it.** `pnpm format` fixes whatever it reports, in about twenty milliseconds. `.oxfmtrc.json` holds the style, and names what `oxfmt` must not touch — the phrase table, the stylesheet, the lockfile.
- **`src/App.tsx` is fifty lines and is not where UI work starts.** It answers "which screen is on" and nothing else. The talking screen is `src/talk/talk.tsx`; [AGENTS.md](AGENTS.md) lists which file owns what.
- **`src/` is layered, and the layering is enforced.** `core/` → `ui/` and `voice/` → `menu/` → the screens. Imports point down that list and never up. `tests/app/structure.test.ts` fails if they do, so put a new module in the lowest layer that can hold it rather than at the root.
- **The stylesheet is deliberately one file.** Reordering its blocks changes the cascade, and no test here lays anything out. See the Styling section of [AGENTS.md](AGENTS.md).
- **Phrase slots depend on how many options they have** — none renders a typed blank, exactly one is substituted inline with no picker, two or more opens the picker. See the phrase notes in [AGENTS.md](AGENTS.md) before touching `src/core/phrases.ts`.

[AGENTS.md](AGENTS.md) documents the project layout and is the fastest way to find where something lives.
