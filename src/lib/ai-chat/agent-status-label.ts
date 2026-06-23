import { getVisibleAssistantProcessSteps } from "@/lib/ai-chat/process-step-groups";
import type {
  AgentCallStatus,
  ChatAgentCall,
  ChatToolResult,
  ToolExecutionStatus,
  UserInputStatus,
} from "@/lib/ai-chat/types";

export type AgentRunDisplay = Pick<
  ChatAgentCall,
  "id" | "agentName" | "task" | "status" | "startedAt"
> &
  Partial<
    Pick<
      ChatAgentCall,
      | "completedAt"
      | "providerName"
      | "model"
      | "output"
      | "reasoning"
      | "error"
      | "processSteps"
    >
  >;

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

function getFirstNonEmptyLine(value: string | undefined) {
  return (
    value
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

function getLastNonEmptyLine(value: string | undefined) {
  return (
    value
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? ""
  );
}

function stripMarkdownPreview(value: string) {
  return value
    .replace(/^[#>*_`~\-\s]+/, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .trim();
}

function getUserInputPreview(step: Extract<ReturnType<typeof getVisibleAssistantProcessSteps>[number], { type: "user_input" }>) {
  return (
    getFirstNonEmptyLine(step.request.title) ||
    getFirstNonEmptyLine(step.request.description) ||
    getFirstNonEmptyLine(step.request.questions[0]?.question)
  );
}

function getStepPreviewLine(
  step: ReturnType<typeof getVisibleAssistantProcessSteps>[number],
): string {
  if (step.type === "thinking") return getLastNonEmptyLine(step.content);
  if (step.type === "assistant_message") {
    return getLastNonEmptyLine(step.content);
  }
  if (step.type === "tool_building") return step.toolNames.join(", ");
  if (step.type === "tool_execution") return step.toolCall.function.name;
  if (step.type === "agent_call") {
    return (
      [step.agentCall.agentName, getAgentRunPreviewLine(step.agentCall)]
        .filter(Boolean)
        .join(": ") || step.toolCall.function.name
    );
  }
  if (step.type === "user_input") return getUserInputPreview(step);
  if (step.type === "approval" || step.type === "file_approval") {
    return (
      getFirstNonEmptyLine(step.request.title) ||
      getFirstNonEmptyLine(step.request.description) ||
      step.toolCall.function.name
    );
  }
  if (step.type === "tasks") {
    return (
      getFirstNonEmptyLine(step.toolResult?.content) || step.toolCall.function.name
    );
  }

  return "";
}

export function getAgentRunPreviewLine(agentCall: AgentRunDisplay) {
  if (
    agentCall.status === "complete" ||
    agentCall.status === "failed" ||
    agentCall.status === "cancelled"
  ) {
    return stripMarkdownPreview(
      getFirstNonEmptyLine(agentCall.task) ||
        getFirstNonEmptyLine(agentCall.output) ||
        getFirstNonEmptyLine(agentCall.error),
    );
  }

  const visibleSteps = getVisibleAssistantProcessSteps(
    agentCall.processSteps ?? [],
  );

  for (let index = visibleSteps.length - 1; index >= 0; index -= 1) {
    const previewLine = stripMarkdownPreview(
      getStepPreviewLine(visibleSteps[index]),
    );
    if (previewLine) return previewLine;
  }

  return stripMarkdownPreview(
    getLastNonEmptyLine(agentCall.output) ||
      getLastNonEmptyLine(agentCall.reasoning) ||
      getFirstNonEmptyLine(agentCall.task),
  );
}

export function getAgentRunStatusLabel(
  agentCall: AgentRunDisplay,
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

export function getAgentRunRenderSignature(agentCall: AgentRunDisplay): string {
  if (
    agentCall.status === "complete" ||
    agentCall.status === "failed" ||
    agentCall.status === "cancelled"
  ) {
    return `${agentCall.status}:${agentCall.completedAt ?? ""}:${
      agentCall.error ? "error" : "ok"
    }`;
  }

  const processSteps = agentCall.processSteps ?? [];
  const latestStep = processSteps[processSteps.length - 1];

  if (!latestStep) return `${agentCall.status}:empty`;

  if (latestStep.type === "thinking") {
    return `${agentCall.status}:thinking:${latestStep.status}:${
      latestStep.content.trim() ? "content" : "empty"
    }`;
  }

  if (latestStep.type === "assistant_message") {
    return `${agentCall.status}:assistant_message:${
      latestStep.content.trim() ? "content" : "empty"
    }`;
  }

  if (latestStep.type === "tool_building") {
    return `${agentCall.status}:tool_building:${latestStep.toolNames.join(",")}`;
  }

  if (latestStep.type === "tool_execution") {
    return `${agentCall.status}:tool_execution:${latestStep.status}:${
      latestStep.toolCall.function.name
    }:${latestStep.toolResult ? "result" : "pending"}`;
  }

  if (latestStep.type === "agent_call") {
    return `${agentCall.status}:agent_call:${latestStep.status}:${
      latestStep.agentCall.agentName
    }:${getAgentRunRenderSignature(latestStep.agentCall)}`;
  }

  if (
    latestStep.type === "user_input" ||
    latestStep.type === "approval" ||
    latestStep.type === "file_approval" ||
    latestStep.type === "tasks"
  ) {
    return `${agentCall.status}:${latestStep.type}:${latestStep.status}:${
      latestStep.toolCall.function.name
    }:${latestStep.toolResult ? "result" : "pending"}`;
  }

  return `${agentCall.status}:unknown`;
}
