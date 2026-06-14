import type { ChatToolCall, ChatToolResult } from "./types";

export const CANCELLED_TOOL_RESULT_CONTENT = "Tool execution cancelled by user.";

export function createCancelledToolResult(
  toolCall: ChatToolCall,
): ChatToolResult {
  return {
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    content: CANCELLED_TOOL_RESULT_CONTENT,
    isError: true,
  };
}

export function appendMissingCancelledToolResults(
  toolCalls: ChatToolCall[] | undefined,
  toolResults: ChatToolResult[] | undefined,
): ChatToolResult[] {
  const existingResults = toolResults ?? [];
  const calls = toolCalls ?? [];
  if (calls.length === 0) return existingResults;

  const existingResultIds = new Set(
    existingResults.map((result) => result.toolCallId),
  );
  const missingResults = calls
    .filter((toolCall) => !existingResultIds.has(toolCall.id))
    .map(createCancelledToolResult);

  return missingResults.length
    ? [...existingResults, ...missingResults]
    : existingResults;
}

export function getToolResultsForToolCalls({
  toolCalls,
  toolResults,
  fillMissingWithCancelled = false,
}: {
  toolCalls: ChatToolCall[] | undefined;
  toolResults: ChatToolResult[] | undefined;
  fillMissingWithCancelled?: boolean;
}): ChatToolResult[] {
  const calls = toolCalls ?? [];
  if (calls.length === 0) return [];

  const resultsByToolCallId = new Map(
    (toolResults ?? []).map((result) => [result.toolCallId, result] as const),
  );
  const orderedResults: ChatToolResult[] = [];

  for (const toolCall of calls) {
    const result = resultsByToolCallId.get(toolCall.id);
    if (result) {
      orderedResults.push(result);
      continue;
    }

    if (fillMissingWithCancelled) {
      orderedResults.push(createCancelledToolResult(toolCall));
    }
  }

  return orderedResults;
}
