import { ipcMain, app, BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname$1, "..");
process.env.APP_ROOT = APP_ROOT;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, "public") : RENDERER_DIST;
const blockedUpstreamHeaders = /* @__PURE__ */ new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "origin",
  "referer",
  "cookie"
]);
const activeStreamControllers = /* @__PURE__ */ new Map();
let win = null;
function normalizeBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/+$/, "");
}
function assertProviderRequest(request) {
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
    payload: request.payload
  };
}
function buildUpstreamHeaders({
  apiKey,
  customHeaders,
  accept,
  contentType
}) {
  const headers = new Headers();
  if (contentType) headers.set("Content-Type", contentType);
  if (accept) headers.set("Accept", accept);
  for (const rawLine of (customHeaders == null ? void 0 : customHeaders.split(/\r?\n/)) ?? []) {
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
    }
  }
  const trimmedApiKey = apiKey == null ? void 0 : apiKey.trim();
  if (trimmedApiKey) {
    headers.set("Authorization", `Bearer ${trimmedApiKey}`);
  }
  return headers;
}
async function readUpstreamJson(response) {
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
function getDeltaText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      if (item && typeof item === "object" && "content" in item && typeof item.content === "string") {
        return item.content;
      }
      return "";
    }).join("");
  }
  return "";
}
function readContentDelta(data) {
  var _a;
  if (!data || typeof data !== "object") return "";
  const choices = "choices" in data ? data.choices : void 0;
  if (!Array.isArray(choices)) return "";
  const delta = (_a = choices[0]) == null ? void 0 : _a.delta;
  if (!delta || typeof delta !== "object") return "";
  return getDeltaText("content" in delta ? delta.content : void 0);
}
function readReasoningDelta(data) {
  var _a;
  if (!data || typeof data !== "object") return "";
  const choices = "choices" in data ? data.choices : void 0;
  if (!Array.isArray(choices)) return "";
  const delta = (_a = choices[0]) == null ? void 0 : _a.delta;
  if (!delta || typeof delta !== "object") return "";
  return getDeltaText("reasoning_content" in delta ? delta.reasoning_content : void 0) || getDeltaText("reasoning" in delta ? delta.reasoning : void 0) || getDeltaText("thinking" in delta ? delta.thinking : void 0) || getDeltaText("reasoning_details" in delta ? delta.reasoning_details : void 0);
}
function readNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readUsage(data) {
  if (!data || typeof data !== "object" || !("usage" in data)) return void 0;
  const usage = data.usage;
  if (!usage || typeof usage !== "object") return void 0;
  const promptTokens = readNumber("prompt_tokens" in usage ? usage.prompt_tokens : void 0);
  const completionTokens = readNumber(
    "completion_tokens" in usage ? usage.completion_tokens : void 0
  );
  const totalTokens = readNumber("total_tokens" in usage ? usage.total_tokens : void 0);
  if (promptTokens === void 0 && completionTokens === void 0 && totalTokens === void 0) {
    return void 0;
  }
  return { promptTokens, completionTokens, totalTokens };
}
function readFinishReason(data) {
  var _a;
  if (!data || typeof data !== "object") return void 0;
  const choices = "choices" in data ? data.choices : void 0;
  if (!Array.isArray(choices)) return void 0;
  const finishReason = (_a = choices[0]) == null ? void 0 : _a.finish_reason;
  return typeof finishReason === "string" ? finishReason : void 0;
}
function resolvePreloadPath() {
  const candidates = [
    path.join(__dirname$1, "preload.cjs"),
    path.join(__dirname$1, "preload.js"),
    path.join(__dirname$1, "preload.mjs")
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
      sandbox: false
    }
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
ipcMain.handle("ai:load-models", async (_event, request) => {
  const { baseUrl, apiKey, customHeaders } = assertProviderRequest(request);
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
    method: "GET",
    headers: buildUpstreamHeaders({ apiKey, customHeaders, accept: "application/json" }),
    cache: "no-store"
  });
  return readUpstreamJson(response);
});
ipcMain.handle("ai:send-chat", async (_event, request) => {
  const { baseUrl, apiKey, customHeaders, payload } = assertProviderRequest(request);
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: buildUpstreamHeaders({
      apiKey,
      customHeaders,
      contentType: "application/json",
      accept: "application/json"
    }),
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  return readUpstreamJson(response);
});
ipcMain.handle("ai:cancel-stream", (_event, streamId) => {
  var _a;
  (_a = activeStreamControllers.get(streamId)) == null ? void 0 : _a.abort();
  activeStreamControllers.delete(streamId);
});
ipcMain.handle("ai:stream-chat", async (event, streamId, request) => {
  const { baseUrl, apiKey, customHeaders, payload } = assertProviderRequest(request);
  const controller = new AbortController();
  activeStreamControllers.set(streamId, controller);
  let usage;
  let finishReason;
  try {
    let sendRawData = function(data) {
      const eventUsage = readUsage(data);
      if (eventUsage) usage = eventUsage;
      const eventFinishReason = readFinishReason(data);
      if (eventFinishReason) finishReason = eventFinishReason;
      const reasoningDelta = readReasoningDelta(data);
      if (reasoningDelta) {
        event.sender.send(`ai:stream-delta:${streamId}`, {
          type: "reasoning",
          delta: reasoningDelta
        });
      }
      const contentDelta = readContentDelta(data);
      if (contentDelta) {
        event.sender.send(`ai:stream-delta:${streamId}`, {
          type: "content",
          delta: contentDelta
        });
      }
    }, processDataLine = function(dataLine) {
      const trimmed = dataLine.trim();
      if (!trimmed || trimmed === "[DONE]") return;
      try {
        sendRawData(JSON.parse(trimmed));
      } catch {
      }
    }, processLine = function(rawLine) {
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
    };
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
      method: "POST",
      headers: buildUpstreamHeaders({
        apiKey,
        customHeaders,
        contentType: "application/json",
        accept: "text/event-stream"
      }),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal
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
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
