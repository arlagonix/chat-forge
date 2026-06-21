import { getVisibleAssistantProcessSteps } from "@/lib/ai-chat/process-step-groups";
import type {
  AgentCallStatus,
  ChatAssistantVariant,
  ChatToolCall,
  ChatToolResult,
  ToolExecutionStatus,
  UserInputStatus,
} from "@/lib/ai-chat/types";

const CALL_AGENT_TOOL_NAME = "call_agent";

export type AssistantGenerationStatusLabel =
  | "Composing"
  | "Thinking"
  | "Waiting for tool"
  | "Waiting for agent"
  | "Writing"
  | "Working";

function isPendingToolStatus(
  status: ToolExecutionStatus | undefined,
  hasResult: boolean,
) {
  if (status === "failed" || status === "complete") return false;
  if (hasResult) return false;
  return true;
}

function isPendingUserInputStatus(status: UserInputStatus | undefined) {
  return !status || status === "waiting";
}

function isPendingAgentStatus(status: AgentCallStatus | undefined) {
  return !status || status === "pending" || status === "running";
}

function hasPendingToolCall(
  toolCalls: ChatToolCall[] | undefined,
  toolResults: ChatToolResult[] | undefined,
  predicate: (toolCall: ChatToolCall) => boolean,
) {
  if (!toolCalls?.length) return false;

  const completedToolCallIds = new Set(
    (toolResults ?? []).map((result) => result.toolCallId),
  );

  return toolCalls.some(
    (toolCall) =>
      predicate(toolCall) && !completedToolCallIds.has(toolCall.id),
  );
}

export function getAssistantGenerationStatusLabel(
  variant?: ChatAssistantVariant,
): AssistantGenerationStatusLabel {
  if (variant?.status !== "streaming") return "Working";

  const visibleSteps = getVisibleAssistantProcessSteps(
    variant.processSteps ?? [],
  );
  const latestStep = visibleSteps[visibleSteps.length - 1];

  if (latestStep) {
    if (latestStep.type === "thinking") {
      return latestStep.status === "complete" ? "Composing" : "Thinking";
    }

    if (latestStep.type === "assistant_message") {
      return latestStep.content.trim() ? "Writing" : "Composing";
    }

    if (latestStep.type === "tool_building") {
      return "Composing";
    }

    if (latestStep.type === "agent_call") {
      return isPendingAgentStatus(latestStep.status)
        ? "Waiting for agent"
        : "Composing";
    }

    if (latestStep.type === "tool_execution") {
      if (
        latestStep.toolCall.function.name === CALL_AGENT_TOOL_NAME &&
        isPendingToolStatus(latestStep.status, Boolean(latestStep.toolResult))
      ) {
        return "Waiting for agent";
      }

      return isPendingToolStatus(
        latestStep.status,
        Boolean(latestStep.toolResult),
      )
        ? "Waiting for tool"
        : "Composing";
    }

    if (
      latestStep.type === "user_input" ||
      latestStep.type === "approval" ||
      latestStep.type === "file_approval"
    ) {
      return isPendingUserInputStatus(latestStep.status)
        ? "Waiting for tool"
        : "Composing";
    }

    if (latestStep.type === "tasks") {
      return isPendingToolStatus(
        latestStep.status,
        Boolean(latestStep.toolResult),
      )
        ? "Waiting for tool"
        : "Composing";
    }
  }

  if (
    hasPendingToolCall(
      variant.toolCalls,
      variant.toolResults,
      (toolCall) => toolCall.function.name === CALL_AGENT_TOOL_NAME,
    )
  ) {
    return "Waiting for agent";
  }

  if (
    hasPendingToolCall(
      variant.toolCalls,
      variant.toolResults,
      (toolCall) => toolCall.function.name !== CALL_AGENT_TOOL_NAME,
    )
  ) {
    return "Waiting for tool";
  }

  if (variant.reasoning?.trim() && !variant.content.trim()) {
    return "Thinking";
  }

  if (variant.content.trim()) return "Writing";

  return "Composing";
}
