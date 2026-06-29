import type {
  ChatAssistantVariant,
  ChatMessage,
} from "@/lib/ai-chat/types";

export function hasProviderUsableAssistantHistory(
  variant: ChatAssistantVariant,
) {
  return Boolean(
    variant.content.trim() ||
      variant.toolCalls?.length ||
      variant.reasoningMetadata?.reasoningContent?.trim() ||
      variant.reasoningMetadata?.reasoningDetails?.length,
  );
}

export function buildAssistantContinuationContext(
  messages: ChatMessage[],
  assistantIndex: number,
  variant: ChatAssistantVariant,
) {
  const endIndex = hasProviderUsableAssistantHistory(variant)
    ? assistantIndex + 1
    : assistantIndex;
  return messages.slice(0, endIndex);
}

export function getAssistantContinuationPrompt(
  variant: ChatAssistantVariant,
) {
  if (variant.content.trim()) {
    return "Continue generating from where the previous assistant message stopped. Do not repeat already generated content.";
  }

  return "Continue answering the preceding user request. Produce the assistant response now without mentioning that the previous response was empty or stopped.";
}
