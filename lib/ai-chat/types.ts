export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessageStatus = "streaming" | "done" | "error";

export type ChatMessage = {
  id: string;
  role: Exclude<ChatRole, "system">;
  content: string;
  reasoning?: string;
  status?: ChatMessageStatus;
  createdAt: string;
};

export type ApiChatMessage = {
  role: ChatRole;
  content: string;
};
