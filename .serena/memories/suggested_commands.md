# Suggested Commands

All commands run from project root. Uses **npm** (no yarn/pnpm).

## Development
- `npm run dev` — Start Vite dev server with Electron.

## Testing
- `npm run test` — Run all tests (Vitest).
- `npm run test:watch` — Watch mode.

## Building
- `npm run build` — Full pipeline: `tsc` + `vite build` + `electron-builder` (cross-platform).
- `npm run build:win` — Same but `--win --x64` only.
- `npm run build:renderer` — `tsc` + `vite build` only (no packaging).

## Linting
- `npm run lint` — ESLint with `--max-warnings 0`.

## Preview
- `npm run preview` — Vite preview (renderer only).

## Release diff (example)
- `npm run release:diff` — Generates `release-full.diff` from git (for changelog/review).

## Windows-specific notes
- Paths use backslashes in Electron IPC; forward slashes work in Vite/TypeScript via `@/` alias.
- `node_modules/.bin` tools resolved via npm scripts (no global install needed).
- Tools like `7zip-bin`, `node-7z` used for archive handling (Windows-native 7z).
