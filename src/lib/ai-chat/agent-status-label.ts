import { getVisibleAssistantProcessSteps } from "@/lib/ai-chat/process-step-groups";
import type {
  AgentCallStatus,
  ChatAgentCall,
  ChatToolResult,
  ToolExecutionStatus,
  UserInputStatus,
} from "@/lib/ai-chat/types";

export type AgentRunStatusLabel =
  | "Composing"
  | "Thinking"
  | "Calling tool"
  | "Waiting for tool"
  | "Waiting for agent"
  | "Writing"
  | "Complete"
  | "Failed"
  | "Cancelled";

function isRunningAgentStatus(status: AgentCallStatus | undefined) {
  return status === "pending" || status === "running";
}

function isPendingToolStatus(
  status: ToolExecutionStatus | undefined,
  toolResult?: ChatToolResult,
) {
  if (toolResult) return false;
  return status !== "complete" && status !== "failed";
}

function isPendingUserInputStatus(status: UserInputStatus | undefined) {
  return !status || status === "waiting";
}

export function getAgentRunStatusLabel(
  agentCall: ChatAgentCall,
): AgentRunStatusLabel {
  if (agentCall.status === "complete") return "Complete";
  if (agentCall.status === "failed") return "Failed";
  if (agentCall.status === "cancelled") return "Cancelled";

  const visibleSteps = getVisibleAssistantProcessSteps(
    agentCall.processSteps ?? [],
  );
  const latestStep = visibleSteps[visibleSteps.length - 1];

  if (!latestStep) return "Composing";

  if (latestStep.type === "thinking") {
    return latestStep.status === "complete" ? "Composing" : "Thinking";
  }

  if (latestStep.type === "assistant_message") {
    return latestStep.content.trim() ? "Writing" : "Composing";
  }

  if (latestStep.type === "tool_building") return "Calling tool";

  if (latestStep.type === "agent_call") {
    return isRunningAgentStatus(latestStep.status)
      ? "Waiting for agent"
      : "Composing";
  }

  if (latestStep.type === "tool_execution") {
    return isPendingToolStatus(latestStep.status, latestStep.toolResult)
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
    return isPendingToolStatus(latestStep.status, latestStep.toolResult)
      ? "Waiting for tool"
      : "Composing";
  }

  return "Composing";
}
