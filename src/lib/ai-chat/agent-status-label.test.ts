import { describe, expect, it } from "vitest";

import { getAgentRunStatusLabel } from "@/lib/ai-chat/agent-status-label";
import type { ChatAgentCall } from "@/lib/ai-chat/types";

function createAgentCall(
  overrides: Partial<ChatAgentCall> = {},
): ChatAgentCall {
  return {
    id: "agent-call-1",
    agentName: "general",
    task: "Inspect files",
    status: "running",
    contextMode: "task_only",
    depth: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
    output: "",
    messages: [],
    childAgentCalls: [],
    ...overrides,
  };
}

describe("getAgentRunStatusLabel", () => {
  it("reports thinking for active thinking steps", () => {
    expect(
      getAgentRunStatusLabel(
        createAgentCall({
          processSteps: [
            {
              id: "thinking-1",
              type: "thinking",
              content: "Planning",
              status: "in_progress",
            },
          ],
        }),
      ),
    ).toBe("Thinking");
  });

  it("reports calling tool while a tool call is being built", () => {
    expect(
      getAgentRunStatusLabel(
        createAgentCall({
          processSteps: [
            {
              id: "tool-building-1",
              type: "tool_building",
              status: "running",
              toolCallIds: ["tool-call-1"],
              toolNames: ["read"],
              toolCallCount: 1,
            },
          ],
        }),
      ),
    ).toBe("Calling tool");
  });

  it("reports waiting for tool while a tool is running", () => {
    expect(
      getAgentRunStatusLabel(
        createAgentCall({
          processSteps: [
            {
              id: "tool-1",
              type: "tool_execution",
              status: "running",
              toolCall: {
                id: "tool-call-1",
                type: "function",
                function: { name: "read", arguments: "{}" },
              },
            },
          ],
        }),
      ),
    ).toBe("Waiting for tool");
  });
});
