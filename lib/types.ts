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

export type ChatMessage = {
  id: string;
  role: Exclude<ChatRole, "system">;
  content: string;
  reasoning?: string;
  status?: ChatMessageStatus;
  createdAt: string;
  metrics?: ChatMessageMetrics;
};

export type ApiChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequestBody = {
  provider: ProviderConfig;
  systemPrompt: string;
  messages: ChatMessage[];
  userMessage: string;
};

export type ModelsRequestBody = {
  provider: ProviderConfig;
};
