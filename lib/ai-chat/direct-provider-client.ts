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
    ...(stream
      ? {
          stream_options: {
            include_usage: true,
          },
        }
      : {}),
  };
}

function proxyRequestBody(provider: ProviderConfig) {
  const settings = getActiveModelSettings(provider);

  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    customHeaders: provider.customHeaders ?? "",
    timeoutMs: settings.requestTimeoutMs ?? defaultGenerationSettings.requestTimeoutMs,
  };
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

  const response = await fetch("/api/ai-chat/openai-compatible/models", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(proxyRequestBody(provider)),
  });

  const data = await readProviderResponse(response);

  if (data?.error && (!Array.isArray(data?.models) || data.models.length === 0)) {
    throw new Error(String(data.error));
  }

  if (!Array.isArray(data?.models)) {
    return [];
  }

  return data.models.filter((id: unknown): id is string => typeof id === "string");
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

  const response = await fetch("/api/ai-chat/openai-compatible/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...proxyRequestBody(provider),
      payload: buildPayload({ provider, systemPrompt, messages, userMessage, stream: false }),
    }),
  });

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

  const response = await fetch("/api/ai-chat/openai-compatible/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...proxyRequestBody(provider),
      payload: buildPayload({ provider, systemPrompt, messages, userMessage, stream: true }),
    }),
    signal,
  });

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

  function processEvent(rawEvent: string) {
    const dataLines = rawEvent
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    for (const dataLine of dataLines) {
      if (!dataLine || dataLine === "[DONE]") continue;

      let data: unknown;
      try {
        data = JSON.parse(dataLine);
      } catch {
        continue;
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
  }

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      processEvent(event);
    }

    if (done) break;
  }

  if (buffer.trim()) {
    processEvent(buffer);
  }

  tagParser.flush();

  return { usage, finishReason };
}
