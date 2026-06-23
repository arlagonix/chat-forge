import { describe, expect, it } from "vitest";

import {
  getAgentRunPreviewLine,
  getAgentRunStatusLabel,
} from "@/lib/ai-chat/agent-status-label";
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

  it("uses the latest concrete line while an agent is running", () => {
    expect(
      getAgentRunPreviewLine(
        createAgentCall({
          processSteps: [
            {
              id: "thinking-1",
              type: "thinking",
              content: "First thought\nLatest thought",
              status: "in_progress",
            },
          ],
        }),
      ),
    ).toBe("Latest thought");
  });

  it("strips lightweight markdown from preview lines", () => {
    expect(
      getAgentRunPreviewLine(
        createAgentCall({
          processSteps: [
            {
              id: "message-1",
              type: "assistant_message",
              content: "**Input Validation** on the Main Form",
            },
          ],
        }),
      ),
    ).toBe("Input Validation on the Main Form");
  });

  it("uses the first task line when an agent is complete", () => {
    expect(
      getAgentRunPreviewLine(
        createAgentCall({
          status: "complete",
          task: "Inspect files\nThen summarize",
          output: "Done",
        }),
      ),
    ).toBe("Inspect files");
  });
});
