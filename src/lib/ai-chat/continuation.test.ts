import { describe, expect, it } from "vitest";

import {
  buildAssistantContinuationContext,
  getAssistantContinuationPrompt,
  hasProviderUsableAssistantHistory,
} from "@/lib/ai-chat/continuation";
import type { ChatAssistantVariant, ChatMessage } from "@/lib/ai-chat/types";

function variant(
  overrides: Partial<ChatAssistantVariant> = {},
): ChatAssistantVariant {
  return {
    id: "variant-1",
    content: "",
    status: "done",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function messages(assistantVariant: ChatAssistantVariant): ChatMessage[] {
  return [
    {
      id: "user-1",
      role: "user",
      content: "Explain the project",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "assistant-1",
      role: "assistant",
      variants: [assistantVariant],
      activeVariantIndex: 0,
      createdAt: "2026-01-01T00:00:01.000Z",
    },
  ];
}

describe("assistant continuation", () => {
  it("omits a thinking-only assistant record that providers cannot replay", () => {
    const response = variant({ reasoning: "Internal reasoning" });
    const context = buildAssistantContinuationContext(messages(response), 1, response);

    expect(hasProviderUsableAssistantHistory(response)).toBe(false);
    expect(context.map((message) => message.id)).toEqual(["user-1"]);
    expect(getAssistantContinuationPrompt(response)).toContain(
      "preceding user request",
    );
  });

  it("retains assistant text and asks the model not to repeat it", () => {
    const response = variant({ content: "Partial answer" });
    const context = buildAssistantContinuationContext(messages(response), 1, response);

    expect(context.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
    ]);
    expect(getAssistantContinuationPrompt(response)).toContain("Do not repeat");
  });

  it("retains tool-only assistant history", () => {
    const response = variant({
      toolCalls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "read", arguments: "{}" },
        },
      ],
    });

    expect(hasProviderUsableAssistantHistory(response)).toBe(true);
  });
});
