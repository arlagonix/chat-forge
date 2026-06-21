# Tech Stack

## Languages
- **TypeScript** 5.7.3 (strict mode). JSX: `react-jsx`.
- CSS: Tailwind CSS 4.2.0 + PostCSS + `tw-animate-css`.

## Frameworks & Libraries
- **React** 19.2.4 (StrictMode enabled).
- **Electron** 41.3.0 (main + renderer processes).
- **Vite** 7.3.2 + **vite-plugin-electron** 0.28.6 + **vite-plugin-electron-renderer**.
- **Radix UI Themes** 3.3.0 (gray accent, `"full"` radius, `"95%"` scaling).
- **Radix UI primitives**: checkbox, dialog, dropdown-menu, label, popover, select, separator, slot, switch, tabs, tooltip, alert-dialog, context-menu, hover-card, menubar, navigation-menu, radio-group, scroll-area, sheet, toggle-group, tooltip.
- **TanStack React Virtual** 3.13.26 (virtualized chat message list).
- **shadcn/ui** components — selectively added, not full catalog.
- **AI SDK** (`ai` 6.0.193 + `@ai-sdk/openai-compatible` 2.0.48).
- **MCP SDK** (`@modelcontextprotocol/sdk` 1.23.0).
- **KaTeX** 0.16.0 + **Mermaid** 11.12.1 (rendering in markdown).
- **react-markdown** 10.1.0 + remark-gfm, remark-math, rehype-highlight, rehype-katex, rehype-raw, rehype-sanitize.
- **lucide-react** 0.564.0 (icons).
- **cmdk** 1.1.1 (command palettes/search).
- **sonner** 1.7.1 (toast notifications).
- **dompurify** 3.3.0 (HTML sanitization).
- **officeparser** 6.0.4 + **pdf-parse** 1.1.1 + **node-7z** 3.0.0 (attachment processing).
- **undici** 6.26.0 (HTTP client).

## Build & Packaging
- **electron-builder** 26.8.1 (config: `electron-builder.json5`).
- Build outputs: `dist/` (renderer), `dist-electron/` (main), `release/` (packaged installers).
- Platform targets: NSIS + portable on Windows, DMG on macOS, AppImage on Linux.
- PostCSS config for Tailwind.

## Testing
- **Vitest** 3.0.5 with **jsdom** 26.0.0.
- **@testing-library/react** 16.2.0 + **@testing-library/jest-dom** 6.6.4 + **@testing-library/user-event** 14.6.1.

## Tooling
- **ESLint** 8.57.0 with TypeScript + react-hooks + react-refresh plugins.
- **No Prettier** (no config file found). Formatting relies on ESLint.
- **@tailwindcss/postcss** 4.2.0 (Tailwind PostCSS plugin).

## Package Manager
- **npm** (no yarn/pnpm lockfile).

## Path Aliases
- `@/` → `src/` (configured in `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`).

## Version Pin
- Current: **1.15.5** (defined in `package.json`, exposed to app as `__APP_VERSION__` build-time constant).
