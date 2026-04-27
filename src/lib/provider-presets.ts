import type { ProviderConfig } from "./types";

export const providerPresets: ProviderConfig[] = [
  {
    id: "lmstudio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "not-needed",
    model: "",
  },
  {
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "not-needed",
    model: "llama3.1",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    model: "openai/gpt-4o-mini",
  },
  {
    id: "gemini-openai-compatible",
    name: "Gemini OpenAI-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: "",
    model: "gemini-2.5-flash",
  },
];

export const defaultProvider: ProviderConfig = providerPresets[0];
