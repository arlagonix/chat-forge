# Task Completion — Verification Steps

Run these commands before marking any coding task as done:

1. **TypeScript check**
   ```
   npx tsc --noEmit
   ```
   (or `npm run build:renderer` which includes `tsc`)

2. **Lint**
   ```
   npm run lint
   ```
   Must pass with zero warnings (`--max-warnings 0` in config).

3. **Tests**
   ```
   npm run test
   ```
   All tests must pass. Uses Vitest with jsdom environment.

4. **Build** (optional, for packaging tasks)
   ```
   npm run build:renderer
   ```
   Verifies Vite build succeeds.

## Notes
- There is no formatter step (no Prettier).
- `npm run build` (full pipeline) is only needed for release/packaging; `npm run build:renderer` suffices for code verification.
- `npm run lint` runs before build in CI; fix all warnings.
- Tests use `@testing-library/jest-dom/vitest` matchers. Mock `ResizeObserver` is set up globally.
