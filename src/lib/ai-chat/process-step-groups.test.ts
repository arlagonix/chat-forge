import { describe, expect, it } from "vitest";

import {
  getToolBatchGroupLabel,
  getVisibleAssistantProcessSteps,
  type VisibleAssistantProcessStep,
} from "@/lib/ai-chat/process-step-groups";
import type { ChatAssistantProcessStep } from "@/lib/ai-chat/types";

const toolCall = {
  id: "tool-call-1",
  type: "function" as const,
  function: {
    name: "bash",
    arguments: "{}",
  },
};

describe("getVisibleAssistantProcessSteps", () => {
  it("hides approved approval steps", () => {
    const steps: ChatAssistantProcessStep[] = [
      {
        id: "approval-1",
        type: "approval",
        status: "complete",
        toolCall,
        request: {
          title: "Approve command",
          toolName: toolCall.function.name,
          action: "operation",
          description: "Run command",
        },
        response: {
          approved: true,
          answeredAt: "2026-01-01T00:00:00.000Z",
        },
      },
      {
        id: "tool-1",
        type: "tool_execution",
        status: "complete",
        toolCall,
        toolResult: {
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          content: "done",
        },
      },
    ];

    expect(
      getVisibleAssistantProcessSteps(steps).map((step) => step.id),
    ).toEqual(["tool-1"]);
  });
});

describe("getToolBatchGroupLabel", () => {
  it("does not label approval groups", () => {
    const approvalStep: VisibleAssistantProcessStep = {
      id: "approval-1",
      type: "approval",
      toolBatchId: "batch-1",
      status: "waiting",
      toolCall,
      request: {
        title: "Approve command",
        toolName: toolCall.function.name,
        action: "operation",
        description: "Run command",
      },
      sourceStepIds: ["approval-1"],
    };
    const toolStep: VisibleAssistantProcessStep = {
      id: "tool-1",
      type: "tool_execution",
      toolBatchId: "batch-1",
      status: "running",
      toolCall,
      sourceStepIds: ["tool-1"],
    };

    expect(
      getToolBatchGroupLabel({
        kind: "tool_batch",
        toolBatchId: "batch-1",
        steps: [approvalStep, toolStep],
      }),
    ).toBe("");
  });
});
