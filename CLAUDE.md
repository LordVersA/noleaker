# noleaker

- Always commit your work: after each finished, verified step (build, lint and tests pass), make a
  git commit with a clear message. Do not leave finished work uncommitted.
- Two build targets: `npm run build` builds `dist/chrome/` and `dist/firefox/`. Platform code lives
  in `src/platform/<target>/` and is imported only through `@platform/*`. Shared code must not use
  Chrome-only APIs (enforced by `npm run lint`).
- Before committing: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`,
  `npm test` (tests read the built bundles). The Chrome bundle must stay within
  `tests/bundle-baseline.json`.
- Firefox port plan and progress: `Firefox-plan.md`.
