import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ROOT = path.join(__dirname, "..");
process.env.APP_ROOT = APP_ROOT;

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(APP_ROOT, "public")
  : RENDERER_DIST;

type AiProviderRequest = {
  baseUrl?: unknown;
  apiKey?: unknown;
  customHeaders?: unknown;
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
    payload: request.payload,
  };
}

function buildUpstreamHeaders({
  apiKey,
  customHeaders,
  accept,
  contentType,
}: {
  apiKey?: string;
  customHeaders?: string;
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

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    title: "Chat Forge",
    icon: path.join(process.env.VITE_PUBLIC ?? RENDERER_DIST, "icon.png"),
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

ipcMain.handle("ai:load-models", async (_event, request: AiProviderRequest) => {
  const { baseUrl, apiKey, customHeaders } = assertProviderRequest(request);
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
    method: "GET",
    headers: buildUpstreamHeaders({ apiKey, customHeaders, accept: "application/json" }),
    cache: "no-store",
  });

  return readUpstreamJson(response);
});

ipcMain.handle("ai:send-chat", async (_event, request: AiProviderRequest) => {
  const { baseUrl, apiKey, customHeaders, payload } = assertProviderRequest(request);
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: buildUpstreamHeaders({
      apiKey,
      customHeaders,
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
  const { baseUrl, apiKey, customHeaders, payload } = assertProviderRequest(request);
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
