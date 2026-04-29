import { app, BrowserWindow, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ROOT = path.join(__dirname, "..");
process.env.APP_ROOT = APP_ROOT;

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(APP_ROOT, "dist");

function getPackagedAppRoot() {
  // In production, this points to the real packaged app root, including app.asar.
  // Example: C:\...\resources\app.asar
  return app.isPackaged ? app.getAppPath() : APP_ROOT;
}

function getRendererDist() {
  return app.isPackaged ? path.join(getPackagedAppRoot(), "dist") : RENDERER_DIST;
}

function getPublicAssetsPath() {
  return VITE_DEV_SERVER_URL ? path.join(APP_ROOT, "public") : getRendererDist();
}

process.env.VITE_PUBLIC = getPublicAssetsPath();

type AiProviderRequest = {
  baseUrl?: unknown;
  apiKey?: unknown;
  customHeaders?: unknown;
  headers?: unknown;
  payload?: unknown;
};

type ChatTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type StreamResult = {
  usage?: ChatTokenUsage;
  finishReason?: string;
};

const blockedUpstreamHeaders = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "origin",
  "referer",
  "cookie",
]);

const activeStreamControllers = new Map<string, AbortController>();
let win: BrowserWindow | null = null;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function assertProviderRequest(request: AiProviderRequest) {
  if (!request || typeof request !== "object") {
    throw new Error("Provider request is required.");
  }

  if (typeof request.baseUrl !== "string" || !request.baseUrl.trim()) {
    throw new Error("Provider base URL is required.");
  }

  return {
    baseUrl: request.baseUrl,
    apiKey: typeof request.apiKey === "string" ? request.apiKey : "",
    customHeaders: typeof request.customHeaders === "string" ? request.customHeaders : "",
    headers: request.headers && typeof request.headers === "object" && !Array.isArray(request.headers)
      ? (request.headers as Record<string, unknown>)
      : {},
    payload: request.payload,
  };
}

function buildUpstreamHeaders({
  apiKey,
  customHeaders,
  headers: providerHeaders,
  accept,
  contentType,
}: {
  apiKey?: string;
  customHeaders?: string;
  headers?: Record<string, unknown>;
  accept?: string;
  contentType?: string;
}) {
  const headers = new Headers();

  if (contentType) headers.set("Content-Type", contentType);
  if (accept) headers.set("Accept", accept);

  for (const rawLine of customHeaders?.split(/\r?\n/) ?? []) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;

    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    const lowerName = name.toLowerCase();

    if (!name || !value || blockedUpstreamHeaders.has(lowerName)) continue;

    try {
      headers.set(name, value);
    } catch {
      // Ignore invalid custom headers.
    }
  }

  for (const [name, rawValue] of Object.entries(providerHeaders ?? {})) {
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    const lowerName = name.toLowerCase();

    if (!name || !value || blockedUpstreamHeaders.has(lowerName)) continue;

    try {
      headers.set(name, value);
    } catch {
      // Ignore invalid provider headers.
    }
  }

  const trimmedApiKey = apiKey?.trim();
  if (trimmedApiKey) {
    headers.set("Authorization", `Bearer ${trimmedApiKey}`);
  }

  return headers;
}

async function readUpstreamJson(response: Response) {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Provider returned ${response.status}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Provider returned a non-JSON response.");
  }
}

function getDeltaText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        if (item && typeof item === "object" && "content" in item && typeof item.content === "string") {
          return item.content;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function readContentDelta(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const choices = "choices" in data ? data.choices : undefined;
  if (!Array.isArray(choices)) return "";
  const delta = choices[0]?.delta;
  if (!delta || typeof delta !== "object") return "";
  return getDeltaText("content" in delta ? delta.content : undefined);
}

function readReasoningDelta(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const choices = "choices" in data ? data.choices : undefined;
  if (!Array.isArray(choices)) return "";
  const delta = choices[0]?.delta;
  if (!delta || typeof delta !== "object") return "";
  return (
    getDeltaText("reasoning_content" in delta ? delta.reasoning_content : undefined) ||
    getDeltaText("reasoning" in delta ? delta.reasoning : undefined) ||
    getDeltaText("thinking" in delta ? delta.thinking : undefined) ||
    getDeltaText("reasoning_details" in delta ? delta.reasoning_details : undefined)
  );
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readUsage(data: unknown): ChatTokenUsage | undefined {
  if (!data || typeof data !== "object" || !("usage" in data)) return undefined;

  const usage = data.usage;
  if (!usage || typeof usage !== "object") return undefined;

  const promptTokens = readNumber("prompt_tokens" in usage ? usage.prompt_tokens : undefined);
  const completionTokens = readNumber(
    "completion_tokens" in usage ? usage.completion_tokens : undefined,
  );
  const totalTokens = readNumber("total_tokens" in usage ? usage.total_tokens : undefined);

  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined
  ) {
    return undefined;
  }

  return { promptTokens, completionTokens, totalTokens };
}

function readFinishReason(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const choices = "choices" in data ? data.choices : undefined;
  if (!Array.isArray(choices)) return undefined;
  const finishReason = choices[0]?.finish_reason;
  return typeof finishReason === "string" ? finishReason : undefined;
}


function isSafeExternalUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

function isAppUrl(url: string) {
  if (!VITE_DEV_SERVER_URL) return false;

  try {
    const targetUrl = new URL(url);
    const appUrl = new URL(VITE_DEV_SERVER_URL);
    return targetUrl.origin === appUrl.origin;
  } catch {
    return false;
  }
}

function openExternalUrl(url: string) {
  if (isSafeExternalUrl(url) && !isAppUrl(url)) {
    void shell.openExternal(url);
  }
}

function resolvePreloadPath() {
  const candidates = [
    path.join(__dirname, "preload.cjs"),
    path.join(__dirname, "preload.js"),
    path.join(__dirname, "preload.mjs"),
  ];

  const preloadPath = candidates.find((candidate) => existsSync(candidate));

  if (!preloadPath) {
    throw new Error(`Unable to find Electron preload script. Checked: ${candidates.join(", ")}`);
  }

  return preloadPath;
}

function getWindowIconPath() {
  return path.join(getPublicAssetsPath(), process.platform === "win32" ? "icon.ico" : "icon.png");
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    title: "Chat Forge",
    icon: getWindowIconPath(),
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });


  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isSafeExternalUrl(url) && !isAppUrl(url)) {
      event.preventDefault();
      openExternalUrl(url);
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("Failed to load renderer", { errorCode, errorDescription, validatedURL });
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(getRendererDist(), "index.html"));
  }
}


type JsonRecord = Record<string, unknown>;

type StorageSnapshot = {
  providersState?: unknown;
  systemPrompt?: unknown;
  activeChatId?: unknown;
  providerModelsCache?: Record<string, unknown>;
  chats?: unknown[];
};

const STORAGE_SCHEMA_VERSION = 1;
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

function getStorageRoot() {
  return path.join(app.getPath("userData"), "chat-forge-data");
}

function getStoragePaths() {
  const root = getStorageRoot();
  return {
    root,
    meta: path.join(root, "meta.json"),
    settings: path.join(root, "settings.json"),
    providers: path.join(root, "providers.json"),
    chatsDir: path.join(root, "chats"),
    chatsIndex: path.join(root, "chats", "index.json"),
    backupsDir: path.join(root, "backups"),
    attachmentsDir: path.join(root, "attachments"),
  };
}

function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sanitizeFileNamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "item";
}

function chatFilePath(chatId: string) {
  return path.join(getStoragePaths().chatsDir, `${sanitizeFileNamePart(chatId)}.json`);
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text) as T;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "ENOENT") return fallback;
    console.error(`Failed to read JSON file ${filePath}:`, error);
    return fallback;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const json = `${JSON.stringify(value, null, 2)}\n`;

  await fs.writeFile(tempPath, json, "utf8");
  await fs.rename(tempPath, filePath);
}

let storageWriteQueue = Promise.resolve();

function queueStorageWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageWriteQueue.then(operation, operation);
  storageWriteQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function ensureStorageDirectories() {
  const paths = getStoragePaths();
  await fs.mkdir(paths.chatsDir, { recursive: true });
  await fs.mkdir(paths.backupsDir, { recursive: true });
  await fs.mkdir(paths.attachmentsDir, { recursive: true });
}

async function isJsonStorageInitialized() {
  return existsSync(getStoragePaths().meta);
}

async function initializeJsonStorageIfNeeded() {
  if (await isJsonStorageInitialized()) return;

  await ensureStorageDirectories();
  await writeJsonAtomic(getStoragePaths().settings, {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    activeChatId: undefined,
    providerModelsCache: {},
  });
  await writeJsonAtomic(getStoragePaths().providers, null);
  await writeJsonAtomic(getStoragePaths().chatsIndex, { chats: [] });
  await writeJsonAtomic(getStoragePaths().meta, {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    migratedFromIndexedDb: false,
  });
}

function normalizeChatSummary(chat: unknown) {
  if (!isPlainObject(chat) || typeof chat.id !== "string") return undefined;

  return {
    id: chat.id,
    title: safeString(chat.title, "New chat"),
    createdAt: safeString(chat.createdAt, new Date().toISOString()),
    updatedAt: safeString(chat.updatedAt, new Date().toISOString()),
    providerId: typeof chat.providerId === "string" ? chat.providerId : undefined,
    model: typeof chat.model === "string" ? chat.model : undefined,
  };
}

async function readSettingsFile() {
  return readJsonFile<JsonRecord>(getStoragePaths().settings, {});
}

async function writeSettingsPatch(patch: JsonRecord) {
  await queueStorageWrite(async () => {
    await initializeJsonStorageIfNeeded();
    const settings = await readSettingsFile();
    await writeJsonAtomic(getStoragePaths().settings, { ...settings, ...patch });
  });
}

async function rebuildChatIndex() {
  const paths = getStoragePaths();
  await fs.mkdir(paths.chatsDir, { recursive: true });
  const entries = await fs.readdir(paths.chatsDir, { withFileTypes: true });
  const chats = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "index.json") continue;
    const chat = await readJsonFile<unknown>(path.join(paths.chatsDir, entry.name), undefined);
    const summary = normalizeChatSummary(chat);
    if (summary) chats.push(summary);
  }

  chats.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  await writeJsonAtomic(paths.chatsIndex, { chats });
  return chats;
}

async function readChatIndex() {
  const value = await readJsonFile<{ chats?: unknown[] }>(getStoragePaths().chatsIndex, { chats: [] });
  const summaries = (value.chats ?? []).map(normalizeChatSummary).filter((item): item is NonNullable<ReturnType<typeof normalizeChatSummary>> => Boolean(item));
  if (summaries.length || existsSync(getStoragePaths().chatsIndex)) return summaries;
  return rebuildChatIndex();
}

async function writeChatIndexFromChats(chats: unknown[]) {
  const summaries = chats.map(normalizeChatSummary).filter((item): item is NonNullable<ReturnType<typeof normalizeChatSummary>> => Boolean(item));
  summaries.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  await writeJsonAtomic(getStoragePaths().chatsIndex, { chats: summaries });
}

async function loadJsonChats() {
  await initializeJsonStorageIfNeeded();
  const summaries = await readChatIndex();
  const chats: JsonRecord[] = [];

  for (const summary of summaries) {
    const chat = await readJsonFile<unknown>(chatFilePath(summary.id), undefined);
    if (isPlainObject(chat) && typeof chat.id === "string") chats.push(chat);
  }

  chats.sort((left, right) => new Date(safeString(right.updatedAt)).getTime() - new Date(safeString(left.updatedAt)).getTime());
  return chats;
}

async function saveJsonChat(chat: unknown) {
  if (!isPlainObject(chat) || typeof chat.id !== "string") {
    throw new Error("A valid chat with an id is required.");
  }

  await queueStorageWrite(async () => {
    await initializeJsonStorageIfNeeded();
    await writeJsonAtomic(chatFilePath(chat.id), chat);

    const existing = await readChatIndex();
    const next = existing.filter((item) => item.id !== chat.id);
    const summary = normalizeChatSummary(chat);
    if (summary) next.unshift(summary);
    await writeChatIndexFromChats(next);
  });
}

async function deleteJsonChat(chatId: unknown) {
  const id = safeString(chatId).trim();
  if (!id) return;

  await queueStorageWrite(async () => {
    await initializeJsonStorageIfNeeded();
    try {
      await fs.unlink(chatFilePath(id));
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "ENOENT") throw error;
    }

    const existing = await readChatIndex();
    await writeChatIndexFromChats(existing.filter((item) => item.id !== id));
  });
}

async function deleteAllJsonChats() {
  await queueStorageWrite(async () => {
    await initializeJsonStorageIfNeeded();
    const paths = getStoragePaths();
    const entries = await fs.readdir(paths.chatsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json") {
        await fs.unlink(path.join(paths.chatsDir, entry.name));
      }
    }

    await writeJsonAtomic(paths.chatsIndex, { chats: [] });
  });
}

async function migrateFromIndexedDbSnapshot(snapshot: StorageSnapshot) {
  if (await isJsonStorageInitialized()) return { migrated: false };

  await queueStorageWrite(async () => {
    await ensureStorageDirectories();

    const settings = {
      systemPrompt: typeof snapshot.systemPrompt === "string" ? snapshot.systemPrompt : DEFAULT_SYSTEM_PROMPT,
      activeChatId: typeof snapshot.activeChatId === "string" ? snapshot.activeChatId : undefined,
      providerModelsCache: isPlainObject(snapshot.providerModelsCache) ? snapshot.providerModelsCache : {},
    };

    await writeJsonAtomic(getStoragePaths().settings, settings);
    await writeJsonAtomic(getStoragePaths().providers, snapshot.providersState ?? null);

    const chats = Array.isArray(snapshot.chats) ? snapshot.chats.filter((chat) => isPlainObject(chat) && typeof chat.id === "string") : [];
    for (const chat of chats) {
      await writeJsonAtomic(chatFilePath(String((chat as JsonRecord).id)), chat);
    }
    await writeChatIndexFromChats(chats);

    await writeJsonAtomic(getStoragePaths().meta, {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      migratedFromIndexedDb: true,
    });
  });

  return { migrated: true };
}

ipcMain.handle("storage:is-initialized", async () => isJsonStorageInitialized());

ipcMain.handle("storage:migrate-from-indexeddb", async (_event, snapshot: StorageSnapshot) => {
  return migrateFromIndexedDbSnapshot(isPlainObject(snapshot) ? snapshot : {});
});

ipcMain.handle("storage:providers-state:load", async () => {
  await initializeJsonStorageIfNeeded();
  return readJsonFile<unknown>(getStoragePaths().providers, undefined);
});

ipcMain.handle("storage:providers-state:save", async (_event, value: unknown) => {
  await queueStorageWrite(async () => {
    await initializeJsonStorageIfNeeded();
    await writeJsonAtomic(getStoragePaths().providers, value);
  });
});

ipcMain.handle("storage:system-prompt:load", async () => {
  await initializeJsonStorageIfNeeded();
  const settings = await readSettingsFile();
  return typeof settings.systemPrompt === "string" ? settings.systemPrompt : DEFAULT_SYSTEM_PROMPT;
});

ipcMain.handle("storage:system-prompt:save", async (_event, value: unknown) => {
  await writeSettingsPatch({ systemPrompt: safeString(value, DEFAULT_SYSTEM_PROMPT) });
});

ipcMain.handle("storage:active-chat-id:load", async () => {
  await initializeJsonStorageIfNeeded();
  const settings = await readSettingsFile();
  return typeof settings.activeChatId === "string" ? settings.activeChatId : undefined;
});

ipcMain.handle("storage:active-chat-id:save", async (_event, chatId: unknown) => {
  await writeSettingsPatch({ activeChatId: safeString(chatId) || undefined });
});

ipcMain.handle("storage:provider-models-cache:load", async (_event, cacheKey: unknown) => {
  await initializeJsonStorageIfNeeded();
  const key = safeString(cacheKey).trim();
  if (!key) return [];

  const settings = await readSettingsFile();
  const cache = isPlainObject(settings.providerModelsCache) ? settings.providerModelsCache : {};
  return safeStringArray(cache[key]);
});

ipcMain.handle("storage:provider-models-cache:save", async (_event, cacheKey: unknown, models: unknown) => {
  const key = safeString(cacheKey).trim();
  if (!key) return;

  await queueStorageWrite(async () => {
    await initializeJsonStorageIfNeeded();
    const settings = await readSettingsFile();
    const cache = isPlainObject(settings.providerModelsCache) ? settings.providerModelsCache : {};
    await writeJsonAtomic(getStoragePaths().settings, {
      ...settings,
      providerModelsCache: {
        ...cache,
        [key]: [...new Set(safeStringArray(models).map((model) => model.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      },
    });
  });
});

ipcMain.handle("storage:chats:load", async () => loadJsonChats());

ipcMain.handle("storage:chat:save", async (_event, chat: unknown) => saveJsonChat(chat));

ipcMain.handle("storage:chat:delete", async (_event, chatId: unknown) => deleteJsonChat(chatId));

ipcMain.handle("storage:chats:delete-all", async () => deleteAllJsonChats());
ipcMain.handle("ai:load-models", async (_event, request: AiProviderRequest) => {
  const { baseUrl, apiKey, customHeaders, headers } = assertProviderRequest(request);
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
    method: "GET",
    headers: buildUpstreamHeaders({ apiKey, customHeaders, headers, accept: "application/json" }),
    cache: "no-store",
  });

  return readUpstreamJson(response);
});

ipcMain.handle("ai:send-chat", async (_event, request: AiProviderRequest) => {
  const { baseUrl, apiKey, customHeaders, headers, payload } = assertProviderRequest(request);
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: buildUpstreamHeaders({
      apiKey,
      customHeaders,
      headers,
      contentType: "application/json",
      accept: "application/json",
    }),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  return readUpstreamJson(response);
});

ipcMain.handle("ai:cancel-stream", (_event, streamId: string) => {
  activeStreamControllers.get(streamId)?.abort();
  activeStreamControllers.delete(streamId);
});

ipcMain.handle("ai:stream-chat", async (event, streamId: string, request: AiProviderRequest): Promise<StreamResult> => {
  const { baseUrl, apiKey, customHeaders, headers, payload } = assertProviderRequest(request);
  const controller = new AbortController();
  activeStreamControllers.set(streamId, controller);

  let usage: ChatTokenUsage | undefined;
  let finishReason: string | undefined;

  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
      method: "POST",
      headers: buildUpstreamHeaders({
        apiKey,
        customHeaders,
        headers,
        contentType: "application/json",
        accept: "text/event-stream",
      }),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Provider returned ${response.status}`);
    }

    if (!response.body) {
      throw new Error("Provider response did not include a readable stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    function sendRawData(data: unknown) {
      const eventUsage = readUsage(data);
      if (eventUsage) usage = eventUsage;

      const eventFinishReason = readFinishReason(data);
      if (eventFinishReason) finishReason = eventFinishReason;

      const reasoningDelta = readReasoningDelta(data);
      if (reasoningDelta) {
        event.sender.send(`ai:stream-delta:${streamId}`, {
          type: "reasoning",
          delta: reasoningDelta,
        });
      }

      const contentDelta = readContentDelta(data);
      if (contentDelta) {
        event.sender.send(`ai:stream-delta:${streamId}`, {
          type: "content",
          delta: contentDelta,
        });
      }
    }

    function processDataLine(dataLine: string) {
      const trimmed = dataLine.trim();
      if (!trimmed || trimmed === "[DONE]") return;

      try {
        sendRawData(JSON.parse(trimmed));
      } catch {
        // Ignore malformed provider stream lines.
      }
    }

    function processLine(rawLine: string) {
      const line = rawLine.trimEnd();
      const trimmedLine = line.trimStart();

      if (!trimmedLine || trimmedLine.startsWith(":")) return;

      if (trimmedLine.startsWith("data:")) {
        processDataLine(trimmedLine.slice(5).trimStart());
        return;
      }

      if (trimmedLine.startsWith("{")) {
        processDataLine(trimmedLine);
      }
    }

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        processLine(line);
      }

      if (done) break;
    }

    if (buffer.trim()) {
      processLine(buffer);
    }

    return { usage, finishReason };
  } finally {
    activeStreamControllers.delete(streamId);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);
