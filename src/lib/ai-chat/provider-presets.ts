import type { ProviderConfig, ProviderGenerationSettings } from "./types";

export const defaultGenerationSettings: ProviderGenerationSettings = {
  reasoningMode: "off",
  reasoningEffort: "medium",
  requestTimeoutMs: 30000,
};

export const providerPresets: ProviderConfig[] = [
  {
    id: "lmstudio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "not-needed",
    model: "",
    models: [],
    enabledModelIds: [],
    headers: {},
    defaultSettings: defaultGenerationSettings,
    modelSettings: {},
  },
  {
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "not-needed",
    model: "llama3.1",
    models: ["llama3.1"],
    enabledModelIds: ["llama3.1"],
    headers: {},
    defaultSettings: defaultGenerationSettings,
    modelSettings: {},
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    model: "openai/gpt-4o-mini",
    models: ["openai/gpt-4o-mini"],
    enabledModelIds: ["openai/gpt-4o-mini"],
    headers: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Chat Forge",
    },
    defaultSettings: defaultGenerationSettings,
    modelSettings: {},
  },
  {
    id: "gemini-openai-compatible",
    name: "Gemini OpenAI-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: "",
    model: "gemini-2.5-flash",
    models: ["gemini-2.5-flash"],
    enabledModelIds: ["gemini-2.5-flash"],
    headers: {},
    defaultSettings: defaultGenerationSettings,
    modelSettings: {},
  },
];

export const defaultProvider: ProviderConfig = providerPresets[0];
