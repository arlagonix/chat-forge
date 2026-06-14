import type { ChatToolCall, LoadedToolInfo } from "./types";

export function getToolCallUiMetadataFromTool(
  tool?: Pick<LoadedToolInfo, "name" | "description">,
) {
  if (!tool) return undefined;

  const description = tool.description?.trim();
  return description ? { description } : undefined;
}

export function attachToolCallUiMetadata(
  toolCall: ChatToolCall,
  loadedTools: LoadedToolInfo[],
): ChatToolCall {
  const tool = loadedTools.find(
    (candidate) => candidate.name === toolCall.function.name,
  );
  const uiMetadata = getToolCallUiMetadataFromTool(tool);
  if (!uiMetadata) return toolCall;

  return {
    ...toolCall,
    uiMetadata: {
      ...uiMetadata,
      ...(toolCall.uiMetadata ?? {}),
    },
  };
}

export function attachToolCallsUiMetadata(
  toolCalls: ChatToolCall[],
  loadedTools: LoadedToolInfo[],
): ChatToolCall[] {
  if (!toolCalls.length || !loadedTools.length) return toolCalls;
  return toolCalls.map((toolCall) =>
    attachToolCallUiMetadata(toolCall, loadedTools),
  );
}

export function stripToolCallUiMetadataForProvider(
  toolCall: ChatToolCall,
): ChatToolCall {
  // Keep provider-specific fields intact, but do not leak Molten Forge UI
  // uiMetadata into OpenAI-compatible tool_call payloads.
  const { uiMetadata: _uiMetadata, ...providerToolCall } = toolCall;
  return providerToolCall as ChatToolCall;
}
