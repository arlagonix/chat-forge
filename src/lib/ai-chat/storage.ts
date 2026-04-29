import { defaultGenerationSettings, defaultProvider } from "./provider-presets";
import type { ChatSession, ProviderConfig, ProvidersState } from "./types";

const DB_NAME = "chat-forge";
const DB_VERSION = 1;
const KV_STORE = "settings";
const CHATS_STORE = "chats";

const PROVIDER_KEY = "provider";
const PROVIDERS_STATE_KEY = "providers-state";
const SYSTEM_PROMPT_KEY = "system-prompt";
const ACTIVE_CHAT_ID_KEY = "active-chat-id";
const MODEL_CACHE_KEY_PREFIX = "provider-models:";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

type KeyValueRecord<T = unknown> = {
  key: string;
  value: T;
};

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultChatTitle() {
  return "New chat";
}

export function createEmptyChat(): ChatSession {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: defaultChatTitle(),
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function parseCustomHeaders(customHeaders?: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const rawLine of customHeaders?.split(/\r?\n/) ?? []) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;

    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (name && value) headers[name] = value;
  }

  return headers;
}

export function normalizeProvider(provider: Partial<ProviderConfig>): ProviderConfig {
  const legacyHeaders = parseCustomHeaders(provider.customHeaders);
  const headers = provider.headers ?? legacyHeaders;
  const models = [...new Set((provider.models ?? []).filter(Boolean).map((model) => model.trim()))].sort((a, b) => a.localeCompare(b));
  const enabledModelIds = [...new Set((provider.enabledModelIds ?? (provider.model ? [provider.model] : [])).filter(Boolean).map((model) => model.trim()))];
  const model = provider.model?.trim() || enabledModelIds[0] || "";

  return {
    ...defaultProvider,
    ...provider,
    id: provider.id?.trim() || `provider-${createId()}`,
    name: provider.name ?? "",
    baseUrl: provider.baseUrl ?? "",
    apiKey: provider.apiKey ?? "",
    model,
    models: [...new Set([...models, ...enabledModelIds, model].filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    enabledModelIds,
    headers,
    customHeaders: undefined,
    defaultSettings: {
      ...defaultGenerationSettings,
      ...(provider.defaultSettings ?? {}),
    },
    modelSettings: provider.modelSettings ?? {},
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(CHATS_STORE)) {
        const chatsStore = db.createObjectStore(CHATS_STORE, { keyPath: "id" });
        chatsStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (typeof window === "undefined") return fallback;

  const db = await openDatabase();

  try {
    const transaction = db.transaction(KV_STORE, "readonly");
    const store = transaction.objectStore(KV_STORE);
    const record = await requestToPromise<KeyValueRecord<T> | undefined>(store.get(key));
    return record?.value ?? fallback;
  } finally {
    db.close();
  }
}

async function setSetting<T>(key: string, value: T): Promise<void> {
  if (typeof window === "undefined") return;

  const db = await openDatabase();

  try {
    const transaction = db.transaction(KV_STORE, "readwrite");
    transaction.objectStore(KV_STORE).put({ key, value } satisfies KeyValueRecord<T>);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function loadProvider(): Promise<ProviderConfig> {
  const provider = await getSetting<ProviderConfig | undefined>(PROVIDER_KEY, undefined);
  return provider ? normalizeProvider(provider) : normalizeProvider(defaultProvider);
}

export async function saveProvider(provider: ProviderConfig): Promise<void> {
  await setSetting(PROVIDER_KEY, normalizeProvider(provider));
}

export async function loadProvidersState(): Promise<ProvidersState> {
  const providersState = await getSetting<ProvidersState | undefined>(PROVIDERS_STATE_KEY, undefined);

  if (providersState?.providers?.length) {
    const providers = providersState.providers.map(normalizeProvider);
    const activeProviderId = providers.some((provider) => provider.id === providersState.activeProviderId)
      ? providersState.activeProviderId
      : providers[0].id;

    return { providers, activeProviderId };
  }

  const provider = await loadProvider();
  return {
    providers: [provider],
    activeProviderId: provider.id,
  };
}

export async function saveProvidersState(value: ProvidersState): Promise<void> {
  const providers = value.providers.length
    ? value.providers.map(normalizeProvider)
    : [normalizeProvider(defaultProvider)];
  const activeProviderId = providers.some((provider) => provider.id === value.activeProviderId)
    ? value.activeProviderId
    : providers[0].id;

  await setSetting(PROVIDERS_STATE_KEY, { providers, activeProviderId });
}

export async function loadSystemPrompt(): Promise<string> {
  return getSetting(SYSTEM_PROMPT_KEY, DEFAULT_SYSTEM_PROMPT);
}

export async function saveSystemPrompt(value: string): Promise<void> {
  await setSetting(SYSTEM_PROMPT_KEY, value);
}

export async function loadActiveChatId(): Promise<string | undefined> {
  return getSetting<string | undefined>(ACTIVE_CHAT_ID_KEY, undefined);
}

export async function saveActiveChatId(chatId: string): Promise<void> {
  await setSetting(ACTIVE_CHAT_ID_KEY, chatId);
}

function getHeadersCacheKey(headers?: Record<string, string>) {
  return Object.entries(headers ?? {})
    .map(([name, value]) => [name.trim().toLowerCase(), value.trim()] as const)
    .filter(([name, value]) => name && value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}

function getProviderModelsCacheKey(provider: Pick<ProviderConfig, "baseUrl" | "headers" | "customHeaders">) {
  const baseUrl = provider.baseUrl.trim().replace(/\/+$/, "");
  const headers = provider.headers ?? parseCustomHeaders(provider.customHeaders);

  return `${MODEL_CACHE_KEY_PREFIX}${baseUrl}|${getHeadersCacheKey(headers)}`;
}

export async function loadCachedProviderModels(
  provider: Pick<ProviderConfig, "baseUrl" | "headers" | "customHeaders">,
): Promise<string[]> {
  if (!provider.baseUrl.trim()) return [];

  const models = await getSetting<string[]>(getProviderModelsCacheKey(provider), []);
  return Array.isArray(models)
    ? [
        ...new Set(
          models
            .filter((model) => typeof model === "string" && model.trim())
            .map((model) => model.trim()),
        ),
      ]
    : [];
}

export async function saveCachedProviderModels(
  provider: Pick<ProviderConfig, "baseUrl" | "headers" | "customHeaders">,
  models: string[],
): Promise<void> {
  if (!provider.baseUrl.trim()) return;

  const normalizedModels = [
    ...new Set(
      models
        .filter((model) => typeof model === "string" && model.trim())
        .map((model) => model.trim()),
    ),
  ].sort((left, right) => left.localeCompare(right));

  await setSetting(getProviderModelsCacheKey(provider), normalizedModels);
}

export async function loadChats(): Promise<ChatSession[]> {
  if (typeof window === "undefined") return [];

  const db = await openDatabase();

  try {
    const transaction = db.transaction(CHATS_STORE, "readonly");
    const store = transaction.objectStore(CHATS_STORE);
    const chats = await requestToPromise<ChatSession[]>(store.getAll());

    return chats.sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  } finally {
    db.close();
  }
}

export async function saveChat(chat: ChatSession): Promise<void> {
  if (typeof window === "undefined") return;

  const db = await openDatabase();

  try {
    const transaction = db.transaction(CHATS_STORE, "readwrite");
    transaction.objectStore(CHATS_STORE).put(chat);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function deleteChat(chatId: string): Promise<void> {
  if (typeof window === "undefined") return;

  const db = await openDatabase();

  try {
    const transaction = db.transaction(CHATS_STORE, "readwrite");
    transaction.objectStore(CHATS_STORE).delete(chatId);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function deleteAllChats(): Promise<void> {
  if (typeof window === "undefined") return;

  const db = await openDatabase();

  try {
    const transaction = db.transaction(CHATS_STORE, "readwrite");
    transaction.objectStore(CHATS_STORE).clear();
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
