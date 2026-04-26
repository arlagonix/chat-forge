# AI Chat MVP

Client-only OpenAI-compatible chat app rebuilt on the same stack as the attached Prompt Forge app.

## Stack

- Next.js 16 app router
- React 19
- Tailwind CSS v4
- `@tailwindcss/postcss`
- shadcn/ui-style Radix components from the Prompt Forge archive
- `next-themes`
- `lucide-react`
- `cn` utility with `clsx` and `tailwind-merge`
- Client-side localStorage persistence

## Run

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Notes

This version has no backend proxy routes. It sends requests directly from the browser to the configured OpenAI-compatible provider URL.

That is fine for a local personal app, but cloud API keys are stored in localStorage and are visible to the browser runtime. Some providers may also block direct browser requests through CORS.

## Example providers

### LM Studio

```txt
Base URL: http://localhost:1234/v1
API key: not-needed
Model: load models or enter the model name shown in LM Studio
```

### Ollama

```txt
Base URL: http://localhost:11434/v1
API key: not-needed
Model: llama3.1
```

### OpenRouter

```txt
Base URL: https://openrouter.ai/api/v1
API key: your OpenRouter key
Model: openai/gpt-4o-mini
```
