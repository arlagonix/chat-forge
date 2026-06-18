# Code Conventions

## Naming
- **Files**: camelCase for regular modules (`chat-utils.ts`), kebab-case for components (`chat-message-list.tsx`). Test files: `*.test.ts`/`*.test.tsx`.
- **Functions**: camelCase. React components PascalCase. Hooks prefixed `use`.
- **TypeScript types**: PascalCase interfaces/types. Type exports explicit.

## Imports
- Path alias `@/` maps to `src/` (e.g. `import { cn } from "@/lib/utils"`).
- Group order: external deps (blank line), internal (`@/`), relative (`./`).
- Type-only imports use `type` keyword inline (`import { ..., type X } from "..."`).

## CSS & Styling
- **Tailwind CSS 4** with `@import "tailwindcss"` syntax (no `@tailwind` directives).
- Utility class merging: `cn()` from `clsx` + `tailwind-merge` (`src/lib/utils.ts`).
- Radix Themes with CSS variables: `--font-sans`, `--font-mono`.
- Fonts: JetBrains Mono (mono), IBM Plex Sans (sans), IBM Plex Mono (mono fallback).
- Animation: `tw-animate-css` 1.3.3.

## React Patterns
- Functional components with hooks. No class components.
- `useCallback` / `useMemo` for stable references.
- `useRef` for mutable values that shouldn't trigger re-renders (e.g. `didHydrateRef`, `composerDraftsRef`).
- `useStableCallback` hook for callbacks that need stable identity.
- State lifting: `App.tsx` is single source of truth for most app state; child components receive data/callbacks.
- Auto-save via debounced `useEffect` watching state changes (hydration guard via `didHydrateRef`).

## State Management
- No external state library (no Redux, Zustand, etc.). All state in `App.tsx` via `useState`.
- Persistence: Electron IPC JSON files (main-process) with snapshot diffing to avoid redundant writes. Legacy IndexedDB storage was migrated.
- Chat messages are immutable slices; updater functions receive current state and return next state.

## IPC Architecture
- Renderer never accesses Electron/node APIs directly. All communication via `contextBridge` in `electron/preload.ts`.
- Bridges: `moltenForgeAI`, `moltenForgeStorage`, `moltenForgeWorkspace`, `moltenForgeTools`, `moltenForgeFind`, `moltenForgeMcp`.
- Stream-based AI responses: renderer calls `streamChat()` which returns `{ id, cancel(), result(onDelta) }`.

## Error Handling
- `labelForError()` utility normalizes error to string message.
- `toast()` via sonner for user-facing notifications. `showError`, `showSuccess`, `showInfo` wrappers.
- Hydration errors gracefully degrade (don't persist placeholder state over on-disk data).

## Testing
- Vitest + Testing Library + jsdom.
- `ResizeObserver` mocked globally in `src/test/setup.ts`.
- Test files co-located with source, named `*.test.ts` or `*.test.tsx`.

## No Prettier
- Formatting conventions enforced only by ESLint. No `.prettierrc` present.
