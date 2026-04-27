import { defaultProvider } from "./provider-presets";
import type { ChatSession, ProviderConfig } from "./types";

const DB_NAME = "chat-forge";
const DB_VERSION = 1;
const KV_STORE = "settings";
const CHATS_STORE = "chats";

const PROVIDER_KEY = "provider";
const SYSTEM_PROMPT_KEY = "system-prompt";
const ACTIVE_CHAT_ID_KEY = "active-chat-id";

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
  return provider ? { ...defaultProvider, ...provider } : defaultProvider;
}

export async function saveProvider(provider: ProviderConfig): Promise<void> {
  await setSetting(PROVIDER_KEY, provider);
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
