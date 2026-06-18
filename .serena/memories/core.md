# Molten Forge — Core

Local-first Electron chat client for OpenAI-compatible providers.

## Source map

- `electron/main.ts` — Electron main process (6k+ lines). Storage IPC, provider proxy/streaming, file tools, terminal, MCP, attachments, project instructions.
- `electron/preload.ts` — contextBridge API: `moltenForgeAI`, `moltenForgeStorage`, `moltenForgeWorkspace`, `moltenForgeTools`, `moltenForgeFind`, `moltenForgeMcp`.
- `electron/ai-sdk-client.ts` — AI generation adapter (Vercel AI SDK Core + `@ai-sdk/openai-compatible`).
- `electron/pi-tools.ts` — Built-in tool definitions: read, write, edit, bash, web_fetch, ask_user, update_tasks, skill, call_agent.
- `electron/mcp-client.ts` — Model Context Protocol client (server management, tool discovery, execution).
- `electron/terminal-tool.ts` — Terminal execution tool (PowerShell/bash).
- `electron/file-tools.ts` — File read/write/edit tools for agent use.
- `electron/tool-utils.ts` — Shared tool utilities.
- `electron/project-instructions.ts` — AGENTS.md loading logic.
- `src/App.tsx` — Single-page main UI: state orchestration, chat list, composer, dialogs, settings, hydration, auto-save.
- `src/main.tsx` — React entry point. Mounts `ThemeProvider` > `RadixThemeBridge` > `App`. Toaster lives *outside* Radix theme (stacking context isolation).
- `src/lib/ai-chat/` — Core domain logic: providers, tools, skills, agents, modes, MCP, storage, types, chat utils, request builder, title generation, streaming buffer.
- `src/lib/provider-presets.ts` — Provider preset configurations.
- `src/lib/types.ts` — Shared TypeScript types.
- `src/lib/theme.tsx` — Light/dark theme via React context. Exposes `useTheme()`.
- `src/lib/pi-rpc/` — Reserved for future Pi RPC functionality (currently empty).
- `src/hooks/` — Custom React hooks (use-chat-actions, use-chat-autoscroll, use-chat-generation, use-mcp-settings-form, use-message-context-menu, use-mobile, use-relative-time-now, use-stable-callback, use-toast, use-tool-execution).
- `src/components/` — Chat UI components (`ai-chat/`), shadcn/Radix primitives (`ui/`), dialogs (`dialogs/`), theme toggle (`prompt-forge/`).
- `.agents/` — Agent skill templates (`skills/new-skill/`).
- `docs/` — Markdown documentation (attachments, chat folders, MCP, project instructions, skills).

## Invariants

- All provider communication goes through Electron IPC (main process AI SDK client), never direct from renderer.
- Storage is main-process JSON files on disk, accessed via Electron IPC (`moltenForgeStorage` bridge). Migration from IndexedDB occurred; old `src/lib/ai-chat/storage.ts` is legacy.
- Chat persistence: auto-save on change with debounce (1s during generation, 250ms otherwise). Snapshot diffing prevents redundant writes.
- New chats start as unsaved drafts; persisted only on first send.
- Project instructions (`AGENTS.md`) loaded per-chat workspace root, cached in state with file-watch-style refresh checks.
- Agents system: built-in (`general`, `general_full`) + custom agent import/export/manage. Configurable nesting depth.
- Skills system: custom prompt+tool bundles with permission controls. Loaded from YAML/JSON manifests.
- Modes system: per-mode tool/skill/agent permission maps.
- Tools system: built-in tools (read, write, edit, bash, web_fetch, ask_user, update_tasks, skill, call_agent) + custom tool manifests.
- `mem:tech_stack` — languages, frameworks, build tools, versions.
- `mem:conventions` — code style, naming, patterns.
- `mem:suggested_commands` — dev/test/lint/build commands.
- `mem:task_completion` — verification steps before marking done.
