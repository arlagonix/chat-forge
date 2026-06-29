import type {
  AskUserRequest,
  ChatToolCall,
  ToolApprovalRequest,
} from "@/lib/ai-chat/types";

type PendingChatInteractionBase = {
  id: string;
  chatId: string;
  assistantMessageId: string;
  variantId: string;
  stepId: string;
  toolCall: ChatToolCall;
  sourceAgentCallId?: string;
  sourceLabel?: string;
  createdAt: string;
};

export type PendingChatInteraction =
  | (PendingChatInteractionBase & {
      kind: "ask_user";
      request: AskUserRequest;
    })
  | (PendingChatInteractionBase & {
      kind: "tool_approval";
      request: ToolApprovalRequest;
    });
