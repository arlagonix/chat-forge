import { describe, expect, it } from "vitest";

import {
  getToolBatchGroupLabel,
  getVisibleAssistantProcessSteps,
  groupVisibleAssistantProcessSteps,
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

  it("labels agent-only batches as delegation", () => {
    const agentStep: VisibleAssistantProcessStep = {
      id: "agent-1",
      type: "agent_call",
      toolBatchId: "agents-1",
      status: "running",
      toolCall: {
        id: "call-agent-1",
        type: "function",
        function: {
          name: "call_agent",
          arguments: '{"agentName":"general","task":"Inspect files"}',
        },
      },
      agentCall: {
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
      },
      sourceStepIds: ["agent-1"],
    };

    expect(
      getToolBatchGroupLabel({
        kind: "tool_batch",
        toolBatchId: "agents-1",
        steps: [agentStep, { ...agentStep, id: "agent-2" }],
      }),
    ).toBe("Delegating to agents");
  });
});

describe("groupVisibleAssistantProcessSteps", () => {
  it("wraps a lone thinking step in a runtime group", () => {
    const visibleSteps = getVisibleAssistantProcessSteps([
      {
        id: "thinking-1",
        type: "thinking",
        content: "Inspecting files",
        status: "complete",
      },
    ]);

    expect(groupVisibleAssistantProcessSteps(visibleSteps)).toMatchObject([
      {
        kind: "runtime_group",
        groups: [
          {
            kind: "single",
            step: { id: "thinking-1", type: "thinking" },
          },
        ],
      },
    ]);
  });

  it("starts a new runtime group for thinking that follows a tool step", () => {
    const visibleSteps = getVisibleAssistantProcessSteps([
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
      {
        id: "thinking-1",
        type: "thinking",
        content: "Checking result",
        status: "complete",
      },
    ]);

    const groups = groupVisibleAssistantProcessSteps(visibleSteps);

    expect(groups).toHaveLength(2);
    expect(groups[0].kind).toBe("runtime_group");
    if (groups[0].kind !== "runtime_group") return;
    expect(groups[0].groups).toMatchObject([
      { kind: "single", step: { id: "tool-1" } },
    ]);
    expect(groups[1].kind).toBe("runtime_group");
    if (groups[1].kind !== "runtime_group") return;
    expect(groups[1].groups).toMatchObject([
      { kind: "single", step: { id: "thinking-1" } },
    ]);
  });

  it("keeps thinking after a parallel tool batch outside that batch", () => {
    const visibleSteps = getVisibleAssistantProcessSteps([
      {
        id: "tool-1",
        type: "tool_execution",
        toolBatchId: "batch-1",
        status: "complete",
        toolCall: { ...toolCall, id: "tool-call-1" },
        toolResult: {
          toolCallId: "tool-call-1",
          toolName: toolCall.function.name,
          content: "done",
        },
      },
      {
        id: "tool-2",
        type: "tool_execution",
        toolBatchId: "batch-1",
        status: "complete",
        toolCall: { ...toolCall, id: "tool-call-2" },
        toolResult: {
          toolCallId: "tool-call-2",
          toolName: toolCall.function.name,
          content: "done",
        },
      },
      {
        id: "thinking-1",
        type: "thinking",
        content: "Analyzing results",
        status: "complete",
      },
    ]);

    const groups = groupVisibleAssistantProcessSteps(visibleSteps);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      kind: "tool_batch",
      toolBatchId: "batch-1",
      steps: [{ id: "tool-1" }, { id: "tool-2" }],
    });
    expect(groups[1]).toMatchObject({
      kind: "runtime_group",
      groups: [{ kind: "single", step: { id: "thinking-1" } }],
    });
  });

  it("keeps thinking plus following tools as the existing thinking tool group", () => {
    const visibleSteps = getVisibleAssistantProcessSteps([
      {
        id: "thinking-1",
        type: "thinking",
        content: "Need a command",
        status: "complete",
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
    ]);

    expect(groupVisibleAssistantProcessSteps(visibleSteps)).toMatchObject([
      {
        kind: "thinking_tool_group",
        thinkingStep: { id: "thinking-1" },
        toolGroups: [{ kind: "single", step: { id: "tool-1" } }],
      },
    ]);
  });

  it("keeps adjacent call_agent and agent batches separate", () => {
    const callAgentToolCall = {
      id: "call-agent-1",
      type: "function" as const,
      function: {
        name: "call_agent",
        arguments: '{"agentName":"general","task":"Inspect files"}',
      },
    };
    const visibleSteps = getVisibleAssistantProcessSteps([
      {
        id: "tool-1",
        type: "tool_execution",
        toolBatchId: "tools-1",
        status: "complete",
        toolCall: callAgentToolCall,
        toolResult: {
          toolCallId: callAgentToolCall.id,
          toolName: "call_agent",
          content: "Agent dispatched.",
        },
      },
      {
        id: "tool-2",
        type: "tool_execution",
        toolBatchId: "tools-1",
        status: "complete",
        toolCall: { ...callAgentToolCall, id: "call-agent-2" },
        toolResult: {
          toolCallId: "call-agent-2",
          toolName: "call_agent",
          content: "Agent dispatched.",
        },
      },
      {
        id: "agent-1",
        type: "agent_call",
        toolBatchId: "agents-1",
        status: "running",
        toolCall: callAgentToolCall,
        agentCall: {
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
        },
      },
      {
        id: "agent-2",
        type: "agent_call",
        toolBatchId: "agents-1",
        status: "running",
        toolCall: { ...callAgentToolCall, id: "call-agent-2" },
        agentCall: {
          id: "agent-call-2",
          agentName: "general",
          task: "Inspect more files",
          status: "running",
          contextMode: "task_only",
          depth: 1,
          startedAt: "2026-01-01T00:00:00.000Z",
          output: "",
          messages: [],
          childAgentCalls: [],
        },
      },
    ]);

    expect(groupVisibleAssistantProcessSteps(visibleSteps)).toMatchObject([
      {
        kind: "tool_batch",
        toolBatchId: "tools-1",
        steps: [{ id: "tool-1" }, { id: "tool-2" }],
      },
      {
        kind: "tool_batch",
        toolBatchId: "agents-1",
        steps: [{ id: "agent-1" }, { id: "agent-2" }],
      },
    ]);
  });
});
