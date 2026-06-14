# Molten Forge — Core

Local-first Electron chat client for OpenAI-compatible providers.

## Source map

- `electron/main.ts` — Electron main process (6k+ lines). Storage IPC, provider proxy/streaming, file tools, terminal, MCP, attachments, project instructions.
- `electron/preload.ts` — contextBridge API: `moltenForgeAI`, `moltenForgeStorage`, `moltenForgeWorkspace`, `moltenForgeTools`, `moltenForgeFind`, `moltenForgeMcp`.
- `src/App.tsx` — Single-page main UI: state orchestration, chat list, composer, dialogs, settings, hydration, auto-save.
- `src/main.tsx` — React entry point. Mounts `ThemeProvider` > `RadixThemeBridge` > `App`. Toaster lives *outside* Radix theme (stacking context isolation).
- `src/lib/ai-chat/` — Core domain logic: providers, tools, skills, agents, modes, MCP, storage, types, chat utils, request builder, title generation, streaming buffer.
- `src/lib/theme.tsx` — Light/dark theme via React context. Exposes `useTheme()`.
- `src/components/` — Chat UI components (`ai-chat/`), shadcn/Radix primitives (`ui/`), dialogs (`dialogs/`).

## Invariants

- All provider communication goes through Electron IPC (main process AI SDK client), never direct from renderer.
- Storage is IndexedDB in renderer via `idb-keyval`-style KV store (`src/lib/ai-chat/storage.ts`). DB name: `"molten-forge"`.
- Chat persistence: auto-save on change with debounce (1s during generation, 250ms otherwise). Snapshot diffing prevents redundant writes.
- New chats start as unsaved drafts; persisted only on first send.
- Project instructions (`AGENTS.md`) loaded per-chat workspace root, cached in state with file-watch-style refresh checks.
- `mem:tech_stack` — languages, frameworks, build tools, versions.
- `mem:conventions` — code style, naming, patterns.
- `mem:suggested_commands` — dev/test/lint/build commands.
- `mem:task_completion` — verification steps before marking done.
