import type { ApiChatMessage, ChatMessage, ProviderConfig } from "./types";

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

  const apiMessages: ApiChatMessage[] = [
    ...(systemPrompt.trim()
      ? [{ role: "system" as const, content: systemPrompt.trim() }]
      : []),
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user",
      content: userMessage,
    },
  ];

  const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey || "not-needed"}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: apiMessages,
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
