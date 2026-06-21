import { describe, expect, it } from "vitest";

import { getAssistantGenerationStatusLabel } from "@/lib/ai-chat/generation-status-label";
import type {
  ChatAgentCall,
  ChatAssistantVariant,
  ChatToolCall,
} from "@/lib/ai-chat/types";

function variant(
  overrides: Partial<ChatAssistantVariant> = {},
): ChatAssistantVariant {
  return {
    id: "variant-1",
    content: "",
    status: "streaming",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function toolCall(id: string, name: string): ChatToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}

const agentCall: ChatAgentCall = {
  id: "agent-call-1",
  agentName: "General",
  task: "Inspect the project",
  status: "running",
  contextMode: "task_only",
  depth: 0,
  startedAt: "2026-01-01T00:00:00.000Z",
  output: "",
  messages: [],
  childAgentCalls: [],
};

describe("getAssistantGenerationStatusLabel", () => {
  it("shows composing while waiting for first model output", () => {
    expect(getAssistantGenerationStatusLabel(variant())).toBe("Composing");
  });

  it("shows thinking for an active thinking step", () => {
    expect(
      getAssistantGenerationStatusLabel(
        variant({
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

  it("shows writing for streaming assistant text", () => {
    expect(
      getAssistantGenerationStatusLabel(
        variant({
          processSteps: [
            {
              id: "message-1",
              type: "assistant_message",
              content: "Hello",
            },
          ],
        }),
      ),
    ).toBe("Writing");
  });

  it("shows waiting for tool for a pending tool step", () => {
    expect(
      getAssistantGenerationStatusLabel(
        variant({
          processSteps: [
            {
              id: "tool-step-1",
              type: "tool_execution",
              status: "running",
              toolCall: toolCall("tool-call-1", "bash"),
            },
          ],
        }),
      ),
    ).toBe("Waiting for tool");
  });

  it("shows waiting for agent for an active agent step", () => {
    expect(
      getAssistantGenerationStatusLabel(
        variant({
          processSteps: [
            {
              id: "agent-step-1",
              type: "agent_call",
              status: "running",
              toolCall: toolCall("tool-call-1", "call_agent"),
              agentCall,
            },
          ],
        }),
      ),
    ).toBe("Waiting for agent");
  });

  it("uses legacy pending tool calls when process steps are unavailable", () => {
    expect(
      getAssistantGenerationStatusLabel(
        variant({
          toolCalls: [toolCall("tool-call-1", "read")],
          toolResults: [],
        }),
      ),
    ).toBe("Waiting for tool");
  });
});
