import { describe, expect, it } from "vitest";

import { finalizeCancelledAssistantVariant } from "./generation-metadata";
import type { ChatAssistantVariant } from "./types";

describe("generation cancellation metadata", () => {
  it("completes thinking, removes tool building, and fills missing tool results", () => {
    const variant: ChatAssistantVariant = {
      id: "variant-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      content: "",
      status: "streaming",
      toolCalls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "read", arguments: "{}" },
        },
      ],
      processSteps: [
        {
          id: "thinking-1",
          type: "thinking",
          content: "thinking",
          status: "in_progress",
        },
        {
          id: "building-1",
          type: "tool_building",
          status: "running",
          toolCallIds: ["call-1"],
          toolNames: ["read"],
          toolCallCount: 1,
        },
        {
          id: "tool-1",
          type: "tool_execution",
          status: "running",
          toolCall: {
            id: "call-1",
            type: "function",
            function: { name: "read", arguments: "{}" },
          },
        },
      ],
    };

    const finalized = finalizeCancelledAssistantVariant(variant);

    expect(
      finalized.processSteps?.some((step) => step.type === "tool_building"),
    ).toBe(false);
    expect(finalized.processSteps?.[0]).toMatchObject({
      type: "thinking",
      status: "complete",
    });
    expect(finalized.processSteps?.[1]).toMatchObject({
      type: "tool_execution",
      status: "failed",
      toolResult: {
        toolCallId: "call-1",
        content: "Tool execution cancelled by user.",
        isError: true,
      },
    });
    expect(finalized.toolResults).toEqual([
      {
        toolCallId: "call-1",
        toolName: "read",
        content: "Tool execution cancelled by user.",
        isError: true,
      },
    ]);
  });

  it("keeps a completed tool result successful when its status is stale", () => {
    const variant: ChatAssistantVariant = {
      id: "variant-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      content: "",
      status: "streaming",
      processSteps: [
        {
          id: "tool-1",
          type: "tool_execution",
          status: "running",
          toolCall: {
            id: "call-1",
            type: "function",
            function: { name: "bash", arguments: "{}" },
          },
          toolResult: {
            toolCallId: "call-1",
            toolName: "bash",
            content: "done",
          },
        },
      ],
    };

    const finalized = finalizeCancelledAssistantVariant(variant);

    expect(finalized.processSteps?.[0]).toMatchObject({
      type: "tool_execution",
      status: "complete",
      toolResult: { content: "done" },
    });
  });
});
