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
pnpm check     # typecheck, lint, test
```

This is not advisory. `netlify.toml` runs the same command as the build command, so a failing test fails the deploy and turns the PR's Netlify check red. Running it locally just saves you the round trip.

Useful while working:

| Command | Does |
|---|---|
| `pnpm test:watch` | Tests, re-running on change |
| `pnpm typecheck` | `tsc --noEmit` alone |
| `pnpm lint` | ESLint alone |
| `pnpm build` | Production build into `dist/` |

## Accessibility is the feature

Every interactive control must work three ways: **dwell** (hover and hold), **tap**, and **keyboard** (Enter/Space). Not two of the three. Someone driving this app with a head tracker, a switch, or a keyboard all need to reach the same things.

In practice that means building controls with `useDwellControl` from `src/dwell.ts` and spreading the `props` it returns. It handles all three paths and stops them double-firing:

```tsx
const { active, props } = useDwellControl(settings.actionDwellMs, onActivate)
return <div role="button" aria-label="…" {...props}>…</div>
```

Also expected of anything interactive:

- A meaningful `aria-label`, and `aria-pressed` on toggles.
- A visible focus state — every control is in the tab order.
- Dwell timing from `settings`, never a hardcoded duration. Someone who lengthened their dwell because of tremor must not get a hair trigger on your control.

Speech goes through `speak()` in `src/speech.ts` so the user's voice, volume, and rate are always applied.

## Tests

Tests live beside the code they cover. `src/phrases.test.ts` and `src/dwell.test.tsx` are unit-level; `src/App.test.tsx` drives the whole app through the DOM.

**When you fix a bug, prove the test earns its place**: write it, then revert your fix and confirm it fails. A regression guard that passes with the bug reintroduced is worse than no test, because it looks like coverage. Several existing tests say in a comment which defect they guard.

Two things that will bite you otherwise:

- The grid renders every phrase in the table (~2,200 cells). Query it with `container.querySelector`, not Testing Library's `getByRole` — building an accessibility tree that size per lookup is slow enough to matter.
- Dwell is timer-driven. Use `vi.useFakeTimers()` and advance inside `act()`. Inserting a phrase also uses a zero-delay timer to place the cursor, so advance the clock after an interaction before asserting.

## Branches and pull requests

Branch off `main`, open a PR, let the Netlify preview build. Merges are rebased to keep history linear. `main` is the deploy branch — do not commit to it directly.

A PR description that says *why* is worth more than one that lists *what*; the diff already covers what.

## Things that will surprise you

- **The site is not indexed.** `public/robots.txt` and a `robots` meta tag in `index.html` both say so, and they are a pair — changing one alone leaves the site half-hidden.
- **`react-hooks/exhaustive-deps` is an error, not a warning.** A stale dependency array is how the phrase grid once silently stopped refreshing after an edit. If a dependency genuinely does not belong, restructure rather than suppressing.
- **The repo is not formatter-clean.** `oxfmt` is available but has never been run across the tree, so running it would bury your change in noise. Match the surrounding style instead.
- **Phrase slots depend on how many options they have** — none renders a typed blank, exactly one is substituted inline with no picker, two or more opens the picker. See the phrase notes in [AGENTS.md](AGENTS.md) before touching `src/phrases.ts`.

[AGENTS.md](AGENTS.md) documents the project layout and is the fastest way to find where something lives.
