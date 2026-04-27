import type { ChatTokenUsage } from "@/lib/ai-chat/types";

type AiProviderRequest = {
  baseUrl: string;
  apiKey?: string;
  customHeaders?: string;
  payload?: unknown;
};

type AiStreamDeltaEvent =
  | { type: "content"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "raw"; data: unknown };

type AiStreamResult = {
  usage?: ChatTokenUsage;
  finishReason?: string;
};

type AiStreamHandle = {
  id: string;
  cancel: () => void;
  result: (onDelta: (event: AiStreamDeltaEvent) => void) => Promise<AiStreamResult>;
};

declare global {
  interface Window {
    codeForgeAI?: {
      loadModels: (request: AiProviderRequest) => Promise<unknown>;
      sendChat: (request: AiProviderRequest) => Promise<any>;
      streamChat: (request: AiProviderRequest) => AiStreamHandle;
    };
  }
}

export {};
