import type {
  ApiChatMessage,
  ChatMessage,
  ChatTokenUsage,
  ProviderConfig,
  ProviderGenerationSettings,
} from "./types";
import { defaultGenerationSettings } from "./provider-presets";

function getActiveAssistantContent(message: ChatMessage) {
  if (message.role !== "assistant") return message.content;

  const variant = message.variants[message.activeVariantIndex];
  return variant?.content ?? "";
}

async function readProviderResponse(response: Response) {
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(responseText || `Provider returned ${response.status}`);
  }

  try {
    return JSON.parse(responseText);
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

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

function readFinishReason(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const choices = "choices" in data ? data.choices : undefined;
  if (!Array.isArray(choices)) return undefined;
  const finishReason = choices[0]?.finish_reason;
  return typeof finishReason === "string" ? finishReason : undefined;
}

function buildApiMessages({
  systemPrompt,
  messages,
  userMessage,
}: {
  systemPrompt: string;
  messages: ChatMessage[];
  userMessage: string;
}): ApiChatMessage[] {
  return [
    ...(systemPrompt.trim()
      ? [{ role: "system" as const, content: systemPrompt.trim() }]
      : []),
    ...messages.map((message) => ({
      role: message.role,
      content: getActiveAssistantContent(message),
    })),
    {
      role: "user" as const,
      content: userMessage,
    },
  ];
}

export function getActiveModelSettings(provider: ProviderConfig): ProviderGenerationSettings {
  return {
    ...defaultGenerationSettings,
    ...(provider.defaultSettings ?? {}),
    ...(provider.modelSettings?.[provider.model] ?? {}),
  };
}

function normalizeOptionalNumber(value: number | undefined, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(value, min), max);
}

function modelLooksReasoningCapable(model: string) {
  const normalized = model.toLowerCase();

  return [
    "deepseek-r1",
    "deepseek-reasoner",
    "qwq",
    "qwen3",
    "qwen-3",
    "qwen/qwen3",
    "reason",
    "thinking",
    "think",
    "gpt-oss",
    "o1",
    "o3",
    "o4",
  ].some((marker) => normalized.includes(marker));
}

function shouldSendReasoningControls(provider: ProviderConfig, settings: ProviderGenerationSettings) {
  if (settings.reasoningMode === "off") return false;
  if (settings.reasoningMode === "enabled") return true;
  return modelLooksReasoningCapable(provider.model);
}

function buildReasoningPayload(provider: ProviderConfig, settings: ProviderGenerationSettings) {
  if (!shouldSendReasoningControls(provider, settings)) return {};

  const model = provider.model.toLowerCase();
  const effort = settings.reasoningEffort ?? "medium";

  if (
    model.includes("gpt-oss") ||
    model.includes("openai/") ||
    /(^|[/:-])o[134](?:-|$)/.test(model)
  ) {
    return { reasoning_effort: effort };
  }

  return {
    reasoning: true,
    reasoning_effort: effort,
  };
}

function buildPayload({
  provider,
  systemPrompt,
  messages,
  userMessage,
  stream,
}: {
  provider: ProviderConfig;
  systemPrompt: string;
  messages: ChatMessage[];
  userMessage: string;
  stream: boolean;
}) {
  const settings = getActiveModelSettings(provider);
  const temperature = normalizeOptionalNumber(settings.temperature, 0, 2);
  const topP = normalizeOptionalNumber(settings.topP, 0, 1);
  const maxTokens = normalizeOptionalNumber(settings.maxTokens, 1, 1048576);

  return {
    model: provider.model,
    messages: buildApiMessages({ systemPrompt, messages, userMessage }),
    stream,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { top_p: topP } : {}),
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    ...buildReasoningPayload(provider, settings),
  };
}

const BLOCKED_BROWSER_HEADERS = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "cookie",
  "host",
  "origin",
  "referer",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "transfer-encoding",
  "upgrade",
]);

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function parseCustomHeaders(rawHeaders?: string) {
  const headers = new Headers();
  const lines = rawHeaders?.split(/\r?\n/) ?? [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;

    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    const normalizedName = name.toLowerCase();

    if (!name || !value || BLOCKED_BROWSER_HEADERS.has(normalizedName)) continue;

    try {
      headers.set(name, value);
    } catch {
      // Ignore invalid header names/values instead of breaking the request form.
    }
  }

  return headers;
}

function buildOpenAIHeaders({
  provider,
  extraHeaders,
}: {
  provider: ProviderConfig;
  extraHeaders?: HeadersInit;
}) {
  const headers = parseCustomHeaders(provider.customHeaders);
  const additionalHeaders = new Headers(extraHeaders);

  additionalHeaders.forEach((value, key) => {
    headers.set(key, value);
  });

  const trimmedApiKey = provider.apiKey.trim();
  if (trimmedApiKey) {
    headers.set("Authorization", `Bearer ${trimmedApiKey}`);
  }

  return headers;
}

function normalizeTimeout(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 30000;
  return Math.min(Math.max(Math.round(value), 1000), 300000);
}

function mergeSignals(left?: AbortSignal | null, right?: AbortSignal | null) {
  if (!left) return right ?? undefined;
  if (!right) return left;

  const controller = new AbortController();
  const abort = () => controller.abort();

  if (left.aborted || right.aborted) {
    controller.abort();
    return controller.signal;
  }

  left.addEventListener("abort", abort, { once: true });
  right.addEventListener("abort", abort, { once: true });

  return controller.signal;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 30000,
) {
  if (timeoutMs <= 0) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: mergeSignals(init.signal, controller.signal),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Provider request timed out or was cancelled.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchStreamWithConnectionTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 30000,
) {
  if (timeoutMs <= 0) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: mergeSignals(init.signal, controller.signal),
    });
    window.clearTimeout(timeoutId);
    return response;
  } catch (error) {
    window.clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Provider stream timed out before the response started or was cancelled.");
    }
    throw error;
  }
}

type ModelLike = {
  id?: unknown;
  name?: unknown;
  display_name?: unknown;
};

function getModelId(model: ModelLike) {
  if (typeof model.id === "string" && model.id.trim()) return model.id;
  if (typeof model.name === "string" && model.name.trim()) return model.name.replace(/^models\//, "");
  if (typeof model.display_name === "string" && model.display_name.trim()) return model.display_name;
  return undefined;
}

function normalizeModelList(data: unknown) {
  const source = (() => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && "data" in data && Array.isArray(data.data)) return data.data;
    if (data && typeof data === "object" && "models" in data && Array.isArray(data.models)) return data.models;
    return [];
  })();

  const normalized = source
    .map((model: unknown) => {
      if (typeof model === "string") return model;
      if (!model || typeof model !== "object") return undefined;
      return getModelId(model as ModelLike);
    })
    .filter((model: unknown): model is string => typeof model === "string" && model.trim().length > 0);

  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

function getRequestTimeout(provider: ProviderConfig) {
  const settings = getActiveModelSettings(provider);
  return normalizeTimeout(settings.requestTimeoutMs ?? defaultGenerationSettings.requestTimeoutMs);
}

function createReasoningTagParser({
  onContentDelta,
  onReasoningDelta,
}: {
  onContentDelta: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
}) {
  let mode: "content" | "reasoning" = "content";
  let pending = "";
  const openTag = /<(think|thinking|reasoning|reason|thought)>/i;
  const closeTag = /<\/(think|thinking|reasoning|reason|thought)>/i;
  const longestTagLength = "</reasoning>".length;

  function emitSafely(text: string, emit: (delta: string) => void, keepTagType: "open" | "close") {
    if (!text) return "";

    const lower = text.toLowerCase();
    const possibleTags = keepTagType === "open"
      ? ["<think>", "<thinking>", "<reasoning>", "<reason>", "<thought>"]
      : ["</think>", "</thinking>", "</reasoning>", "</reason>", "</thought>"];

    let keepLength = 0;
    const maxKeep = Math.min(longestTagLength - 1, text.length);
    for (let length = 1; length <= maxKeep; length += 1) {
      const suffix = lower.slice(-length);
      if (possibleTags.some((tag) => tag.startsWith(suffix))) {
        keepLength = length;
      }
    }

    const emitText = keepLength ? text.slice(0, -keepLength) : text;
    if (emitText) emit(emitText);
    return keepLength ? text.slice(-keepLength) : "";
  }

  function push(delta: string) {
    pending += delta;

    while (pending) {
      if (mode === "content") {
        const match = pending.match(openTag);
        if (!match || match.index === undefined) {
          pending = emitSafely(pending, onContentDelta, "open");
          return;
        }

        const before = pending.slice(0, match.index);
        if (before) onContentDelta(before);
        pending = pending.slice(match.index + match[0].length);
        mode = "reasoning";
      } else {
        const match = pending.match(closeTag);
        if (!match || match.index === undefined) {
          pending = emitSafely(pending, (text) => onReasoningDelta?.(text), "close");
          return;
        }

        const before = pending.slice(0, match.index);
        if (before) onReasoningDelta?.(before);
        pending = pending.slice(match.index + match[0].length);
        mode = "content";
      }
    }
  }

  function flush() {
    if (!pending) return;
    if (mode === "reasoning") onReasoningDelta?.(pending);
    else onContentDelta(pending);
    pending = "";
  }

  return { push, flush };
}

export async function loadProviderModels(provider: ProviderConfig): Promise<string[]> {
  if (!provider.baseUrl.trim()) {
    throw new Error("Provider base URL is required.");
  }

  const response = await fetchWithTimeout(
    `${normalizeBaseUrl(provider.baseUrl)}/models`,
    {
      method: "GET",
      headers: buildOpenAIHeaders({ provider }),
    },
    getRequestTimeout(provider),
  );

  const data = await readProviderResponse(response);
  return normalizeModelList(data);
}

export async function sendProviderChat({
  provider,
  systemPrompt,
  messages,
  userMessage,
}: {
  provider: ProviderConfig;
  systemPrompt: string;
  messages: ChatMessage[];
  userMessage: string;
}): Promise<string> {
  if (!provider.baseUrl.trim()) {
    throw new Error("Provider base URL is required.");
  }

  if (!provider.model.trim()) {
    throw new Error("Model name is required.");
  }

  if (!userMessage.trim()) {
    throw new Error("Message is required.");
  }

  const response = await fetchWithTimeout(
    `${normalizeBaseUrl(provider.baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers: buildOpenAIHeaders({
        provider,
        extraHeaders: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }),
      body: JSON.stringify(
        buildPayload({ provider, systemPrompt, messages, userMessage, stream: false }),
      ),
    },
    getRequestTimeout(provider),
  );

  const data = await readProviderResponse(response);
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("Provider response did not include choices[0].message.content.");
  }

  return content;
}

export type StreamProviderChatResult = {
  usage?: ChatTokenUsage;
  finishReason?: string;
};

export async function streamProviderChat({
  provider,
  systemPrompt,
  messages,
  userMessage,
  signal,
  onContentDelta,
  onReasoningDelta,
}: {
  provider: ProviderConfig;
  systemPrompt: string;
  messages: ChatMessage[];
  userMessage: string;
  signal?: AbortSignal;
  onContentDelta: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
}): Promise<StreamProviderChatResult> {
  if (!provider.baseUrl.trim()) {
    throw new Error("Provider base URL is required.");
  }

  if (!provider.model.trim()) {
    throw new Error("Model name is required.");
  }

  if (!userMessage.trim()) {
    throw new Error("Message is required.");
  }

  const response = await fetchStreamWithConnectionTimeout(
    `${normalizeBaseUrl(provider.baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers: buildOpenAIHeaders({
        provider,
        extraHeaders: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        },
      }),
      body: JSON.stringify(
        buildPayload({ provider, systemPrompt, messages, userMessage, stream: true }),
      ),
      signal,
    },
    getRequestTimeout(provider),
  );

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(responseText || `Provider returned ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Provider response did not include a readable stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const tagParser = createReasoningTagParser({ onContentDelta, onReasoningDelta });
  let buffer = "";
  let usage: ChatTokenUsage | undefined;
  let finishReason: string | undefined;

  function processDataLine(dataLine: string) {
    const trimmed = dataLine.trim();
    if (!trimmed || trimmed === "[DONE]") return;

    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return;
    }

    const eventUsage = readUsage(data);
    if (eventUsage) usage = eventUsage;

    const eventFinishReason = readFinishReason(data);
    if (eventFinishReason) finishReason = eventFinishReason;

    const reasoningDelta = readReasoningDelta(data);
    if (reasoningDelta) onReasoningDelta?.(reasoningDelta);

    const contentDelta = readContentDelta(data);
    if (contentDelta) tagParser.push(contentDelta);
  }

  function processLine(rawLine: string) {
    const line = rawLine.trimEnd();
    const trimmedLine = line.trimStart();

    if (!trimmedLine || trimmedLine.startsWith(":")) return;

    if (trimmedLine.startsWith("data:")) {
      processDataLine(trimmedLine.slice(5).trimStart());
      return;
    }

    // Some OpenAI-compatible APIs stream JSONL chunks instead of strict SSE events.
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

  tagParser.flush();

  return { usage, finishReason };
}
