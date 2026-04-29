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
    ...(stream
      ? {
          stream_options: {
            include_usage: true,
          },
        }
      : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { top_p: topP } : {}),
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    ...buildReasoningPayload(provider, settings),
  };
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

function assertElectronBridge() {
  if (!window.codeForgeAI) {
    throw new Error("Electron AI bridge is not available.");
  }
  return window.codeForgeAI;
}

export async function loadProviderModels(provider: ProviderConfig): Promise<string[]> {
  if (!provider.baseUrl.trim()) {
    throw new Error("Provider base URL is required.");
  }

  const data = await assertElectronBridge().loadModels({
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    headers: provider.headers,
  });

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

  const data = await assertElectronBridge().sendChat({
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    headers: provider.headers,
    payload: buildPayload({ provider, systemPrompt, messages, userMessage, stream: false }),
  });

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

  const tagParser = createReasoningTagParser({ onContentDelta, onReasoningDelta });

  const stream = assertElectronBridge().streamChat({
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    headers: provider.headers,
    payload: buildPayload({ provider, systemPrompt, messages, userMessage, stream: true }),
  });

  const abortHandler = () => {
    stream.cancel();
  };

  if (signal) {
    if (signal.aborted) {
      stream.cancel();
      throw new DOMException("Generation was cancelled.", "AbortError");
    }
    signal.addEventListener("abort", abortHandler, { once: true });
  }

  try {
    const result = await stream.result((event) => {
      if (event.type === "content") {
        tagParser.push(event.delta);
      } else if (event.type === "reasoning") {
        onReasoningDelta?.(event.delta);
      } else if (event.type === "raw") {
        const reasoningDelta = readReasoningDelta(event.data);
        if (reasoningDelta) onReasoningDelta?.(reasoningDelta);

        const contentDelta = readContentDelta(event.data);
        if (contentDelta) tagParser.push(contentDelta);
      }
    });

    tagParser.flush();
    return {
      usage: result.usage ?? undefined,
      finishReason: result.finishReason ?? undefined,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException("Generation was cancelled.", "AbortError");
    }
    throw error;
  } finally {
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

export const __electronRendererParsers = {
  readUsage,
  readFinishReason,
};
