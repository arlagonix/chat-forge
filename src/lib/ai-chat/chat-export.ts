import { getAskUserAnswerSummaries } from "@/lib/ai-chat/chat-interactions";
import { getActiveVariant } from "@/lib/ai-chat/chat-utils";
import type {
  ChatAssistantProcessStep,
  ChatAssistantVariant,
  ChatMessage,
  ChatSession,
  ChatToolResult,
} from "@/lib/ai-chat/types";

export type ChatExportFormat = "markdown" | "text";

const MAX_TOOL_SUMMARY_LENGTH = 1200;

function normalizeBlankLines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function truncateText(value: string, maxLength = MAX_TOOL_SUMMARY_LENGTH) {
  const normalized = normalizeBlankLines(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}\n[truncated]`;
}

function formatToolResultSummary(result: ChatToolResult | undefined) {
  if (!result) return "";
  if (result.generatedFiles?.length) {
    return result.generatedFiles.map((file) => file.name).join(", ");
  }
  if (result.terminal) {
    const parts = [
      result.terminal.stdout.trim(),
      result.terminal.stderr.trim(),
    ].filter(Boolean);
    return truncateText(parts.join("\n\n"));
  }
  return truncateText(result.content);
}

function formatAskUserStep(step: Extract<ChatAssistantProcessStep, { type: "user_input" }>) {
  const lines = [`Ask user: ${step.request.question}`];
  if (step.request.context?.trim()) {
    lines.push(`Context: ${step.request.context.trim()}`);
  }
  if (step.response) {
    for (const summary of getAskUserAnswerSummaries(step.request, step.response)) {
      lines.push(`Answer: ${summary.answer}`);
    }
    if (step.response.comment?.trim()) {
      lines.push(`Comment: ${step.response.comment.trim()}`);
    }
  } else {
    lines.push("Answer: pending");
  }
  return lines.join("\n");
}

function formatProcessStep(step: ChatAssistantProcessStep) {
  if (step.type === "assistant_message") return normalizeBlankLines(step.content);
  if (step.type === "user_input") return formatAskUserStep(step);
  if (step.type === "tool_execution" || step.type === "tasks") {
    const summary = formatToolResultSummary(step.toolResult);
    return [`Tool: ${step.toolCall.function.name}`, summary].filter(Boolean).join("\n");
  }
  if (step.type === "approval" || step.type === "file_approval") {
    const result = step.response
      ? step.response.approved
        ? "approved"
        : "denied"
      : "pending";
    return `Approval: ${step.request.title}\nResult: ${result}`;
  }
  if (step.type === "agent_call") {
    const parts = [
      `Agent: ${step.agentCall.agentName}`,
      step.agentCall.status ? `Status: ${step.agentCall.status}` : "",
      step.agentCall.output?.trim() ? truncateText(step.agentCall.output) : "",
    ].filter(Boolean);
    return parts.join("\n");
  }
  return "";
}

function formatAssistantVariant(variant: ChatAssistantVariant | undefined) {
  if (!variant) return "";
  const stepText = (variant.processSteps ?? [])
    .map(formatProcessStep)
    .filter((item) => item.trim())
    .join("\n\n");
  if (stepText.trim()) return stepText;
  return normalizeBlankLines(variant.content);
}

function formatMessage(message: ChatMessage) {
  if (message.role === "user") {
    return {
      role: "User",
      content: normalizeBlankLines(message.content),
    };
  }

  return {
    role: "Assistant",
    content: formatAssistantVariant(getActiveVariant(message)),
  };
}

function formatMarkdownChat(chat: ChatSession) {
  const lines = [`# ${chat.title.trim() || "Untitled chat"}`];
  for (const message of chat.messages) {
    const formatted = formatMessage(message);
    if (!formatted.content.trim()) continue;
    lines.push(`## ${formatted.role}`, formatted.content);
  }
  return `${lines.join("\n\n").trim()}\n`;
}

function formatTextChat(chat: ChatSession) {
  const lines = [chat.title.trim() || "Untitled chat", ""];
  for (const message of chat.messages) {
    const formatted = formatMessage(message);
    if (!formatted.content.trim()) continue;
    lines.push(`${formatted.role}:`, formatted.content, "");
  }
  return `${lines.join("\n").trim()}\n`;
}

export function formatChatExport(chat: ChatSession, format: ChatExportFormat) {
  return format === "markdown" ? formatMarkdownChat(chat) : formatTextChat(chat);
}
