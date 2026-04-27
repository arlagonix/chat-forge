export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessageStatus = "streaming" | "done" | "error";

export type ChatTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ChatMessageMetrics = {
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  tokenUsage?: ChatTokenUsage;
  outputTokens?: number;
  tokensPerSecond?: number;
  isApproximate?: boolean;
};

export type ChatAssistantVariant = {
  id: string;
  content: string;
  reasoning?: string;
  status?: ChatMessageStatus;
  createdAt: string;
  metrics?: ChatMessageMetrics;
};

export type ChatUserMessage = {
  id: string;
  role: "user";
  content: string;
  createdAt: string;
};

export type ChatAssistantMessage = {
  id: string;
  role: "assistant";
  variants: ChatAssistantVariant[];
  activeVariantIndex: number;
  createdAt: string;
};

export type ChatMessage = ChatUserMessage | ChatAssistantMessage;

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type ApiChatMessage = {
  role: ChatRole;
  content: string;
};
