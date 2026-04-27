import type { ApiChatMessage, ChatMessage, ChatTokenUsage, ProviderConfig } from "./types";

function getActiveAssistantContent(message: ChatMessage) {
  if (message.role !== "assistant") return message.content;

  const variant = message.variants[message.activeVariantIndex];
  return variant?.content ?? "";
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
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
    getDeltaText("thinking" in delta ? delta.thinking : undefined)
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

export async function loadProviderModels(provider: ProviderConfig): Promise<string[]> {
  if (!provider.baseUrl.trim()) {
    throw new Error("Provider base URL is required.");
  }

  const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${provider.apiKey || "not-needed"}`,
    },
  });

  const data = await readProviderResponse(response);

  if (!Array.isArray(data?.data)) {
    return [];
  }

  return data.data
    .map((model: { id?: unknown }) => model.id)
    .filter((id: unknown): id is string => typeof id === "string");
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

  const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey || "not-needed"}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: buildApiMessages({ systemPrompt, messages, userMessage }),
      stream: false,
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

  const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey || "not-needed"}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: buildApiMessages({ systemPrompt, messages, userMessage }),
      stream: true,
      stream_options: {
        include_usage: true,
      },
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
  let buffer = "";
  let usage: ChatTokenUsage | undefined;

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

      const reasoningDelta = readReasoningDelta(data);
      if (reasoningDelta) onReasoningDelta?.(reasoningDelta);

      const contentDelta = readContentDelta(data);
      if (contentDelta) onContentDelta(contentDelta);
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

  return { usage };
}
