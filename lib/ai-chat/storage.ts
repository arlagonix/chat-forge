import { defaultProvider } from "./provider-presets";
import type { ChatMessage, ProviderConfig } from "./types";

const PROVIDER_KEY = "ai-chat-mvp:provider";
const SYSTEM_PROMPT_KEY = "ai-chat-mvp:system-prompt";
const MESSAGES_KEY = "ai-chat-mvp:messages";

export function loadProvider(): ProviderConfig {
  if (typeof window === "undefined") return defaultProvider;

  try {
    const raw = localStorage.getItem(PROVIDER_KEY);
    return raw ? { ...defaultProvider, ...JSON.parse(raw) } : defaultProvider;
  } catch {
    return defaultProvider;
  }
}

export function saveProvider(provider: ProviderConfig) {
  localStorage.setItem(PROVIDER_KEY, JSON.stringify(provider));
}

export function loadSystemPrompt(): string {
  if (typeof window === "undefined") return "You are a helpful assistant.";

  return localStorage.getItem(SYSTEM_PROMPT_KEY) ?? "You are a helpful assistant.";
}

export function saveSystemPrompt(value: string) {
  localStorage.setItem(SYSTEM_PROMPT_KEY, value);
}

export function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMessages(messages: ChatMessage[]) {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
}
