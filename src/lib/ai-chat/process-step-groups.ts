import type { ChatAssistantProcessStep } from "@/lib/ai-chat/types";

export type VisibleAssistantProcessStep = ChatAssistantProcessStep & {
  sourceStepIds: string[];
};

export type VisibleAssistantProcessStepBaseGroup =
  | { kind: "single"; step: VisibleAssistantProcessStep }
  | {
      kind: "tool_batch";
      toolBatchId: string;
      steps: VisibleAssistantProcessStep[];
    };

export type VisibleAssistantProcessStepGroup =
  | VisibleAssistantProcessStepBaseGroup
  | {
      kind: "thinking_tool_group";
      thinkingStep: VisibleAssistantProcessStep;
      toolGroups: VisibleAssistantProcessStepBaseGroup[];
    }
  | {
      kind: "runtime_group";
      groups: VisibleAssistantProcessStepBaseGroup[];
    };

export function getToolBatchGroupLabel(
  group: Extract<VisibleAssistantProcessStepBaseGroup, { kind: "tool_batch" }>,
) {
  const hasCallAgentTool = group.steps.some(
    (step) =>
      step.type === "tool_execution" &&
      step.toolCall.function.name === "call_agent",
  );
  const hasAgentBlock = group.steps.some((step) => step.type === "agent_call");
  const isAgentOnlyGroup = group.steps.every((step) => step.type === "agent_call");
  const hasApprovalStep = group.steps.some(
    (step) => step.type === "approval" || step.type === "file_approval",
  );
  const hasToolExecutionStep = group.steps.some(
    (step) => step.type === "tool_execution",
  );

  if (isAgentOnlyGroup && hasAgentBlock) return "Delegating to agents";
  if (hasCallAgentTool && hasAgentBlock) return "Delegating to agents";
  if (hasApprovalStep && hasToolExecutionStep) return "";
  return "Parallel tool calls";
}

function getVisibleStepToolBatchId(step: VisibleAssistantProcessStep) {
  return "toolBatchId" in step ? step.toolBatchId : undefined;
}

function isToolRelatedVisibleStep(step: VisibleAssistantProcessStep) {
  return (
    step.type === "tool_building" ||
    step.type === "tool_execution" ||
    step.type === "agent_call" ||
    step.type === "user_input" ||
    step.type === "approval" ||
    step.type === "file_approval" ||
    step.type === "tasks"
  );
}

function isRuntimeVisibleStep(step: VisibleAssistantProcessStep) {
  return step.type === "thinking" || isToolRelatedVisibleStep(step);
}

function groupToolRelatedVisibleSteps(
  steps: VisibleAssistantProcessStep[],
): VisibleAssistantProcessStepBaseGroup[] {
  const groups: VisibleAssistantProcessStepBaseGroup[] = [];
  let index = 0;

  while (index < steps.length) {
    const step = steps[index];
    const toolBatchId = getVisibleStepToolBatchId(step);

    if (!toolBatchId) {
      groups.push({ kind: "single", step });
      index += 1;
      continue;
    }

    const batchSteps: VisibleAssistantProcessStep[] = [];
    while (
      index < steps.length &&
      getVisibleStepToolBatchId(steps[index]) === toolBatchId
    ) {
      batchSteps.push(steps[index]);
      index += 1;
    }

    if (batchSteps.length > 1) {
      groups.push({ kind: "tool_batch", toolBatchId, steps: batchSteps });
    } else {
      groups.push({ kind: "single", step: batchSteps[0] });
    }
  }

  return groups;
}

function isAssistantTextVisibleStep(step: VisibleAssistantProcessStep) {
  return step.type === "assistant_message" && step.content.trim().length > 0;
}

function isThinkingToolGroupBoundary(step: VisibleAssistantProcessStep) {
  return step.type === "thinking" || isAssistantTextVisibleStep(step);
}

function getThinkingToolGroupLookahead(
  steps: VisibleAssistantProcessStep[],
  index: number,
) {
  const step = steps[index];
  if (step.type !== "thinking") return undefined;

  const toolSteps: VisibleAssistantProcessStep[] = [];
  let lookaheadIndex = index + 1;

  while (lookaheadIndex < steps.length) {
    const lookaheadStep = steps[lookaheadIndex];

    if (isThinkingToolGroupBoundary(lookaheadStep)) break;

    if (isToolRelatedVisibleStep(lookaheadStep)) {
      toolSteps.push(lookaheadStep);
    }

    lookaheadIndex += 1;
  }

  if (toolSteps.length <= 0) return undefined;

  return {
    lookaheadIndex,
    group: {
      kind: "thinking_tool_group" as const,
      thinkingStep: step,
      toolGroups: groupToolRelatedVisibleSteps(toolSteps),
    },
  };
}

function readRuntimeBaseGroup(
  steps: VisibleAssistantProcessStep[],
  index: number,
): { group: VisibleAssistantProcessStepBaseGroup; nextIndex: number } {
  const step = steps[index];

  if (isToolRelatedVisibleStep(step)) {
    const toolBatchId = getVisibleStepToolBatchId(step);

    if (toolBatchId) {
      const batchSteps: VisibleAssistantProcessStep[] = [];
      let nextIndex = index;

      while (
        nextIndex < steps.length &&
        getVisibleStepToolBatchId(steps[nextIndex]) === toolBatchId
      ) {
        batchSteps.push(steps[nextIndex]);
        nextIndex += 1;
      }

      if (batchSteps.length > 1) {
        return {
          group: { kind: "tool_batch", toolBatchId, steps: batchSteps },
          nextIndex,
        };
      }

      return { group: { kind: "single", step: batchSteps[0] }, nextIndex };
    }
  }

  return { group: { kind: "single", step }, nextIndex: index + 1 };
}

export function getVisibleAssistantProcessSteps(
  processSteps: ChatAssistantProcessStep[],
): VisibleAssistantProcessStep[] {
  const visibleSteps: VisibleAssistantProcessStep[] = [];

  for (const step of processSteps) {
    if (step.type === "thinking" && !step.content.trim()) {
      continue;
    }

    if (step.type === "approval" || step.type === "file_approval") {
      continue;
    }

    if (
      step.type === "user_input" &&
      (step.status !== "complete" || !step.response)
    ) {
      continue;
    }

    const previousStep = visibleSteps[visibleSteps.length - 1];

    if (
      step.type === "assistant_message" &&
      previousStep?.type === "assistant_message"
    ) {
      previousStep.content = `${previousStep.content}${step.content}`;
      previousStep.sourceStepIds = [...previousStep.sourceStepIds, step.id];
      continue;
    }

    visibleSteps.push({ ...step, sourceStepIds: [step.id] });
  }

  return visibleSteps;
}

export function groupVisibleAssistantProcessSteps(
  steps: VisibleAssistantProcessStep[],
): VisibleAssistantProcessStepGroup[] {
  const groups: VisibleAssistantProcessStepGroup[] = [];
  let index = 0;

  while (index < steps.length) {
    const step = steps[index];

    const thinkingToolGroup = getThinkingToolGroupLookahead(steps, index);
    if (thinkingToolGroup) {
      groups.push(thinkingToolGroup.group);
      index = thinkingToolGroup.lookaheadIndex;
      continue;
    }

    if (isRuntimeVisibleStep(step)) {
      const runtimeGroups: VisibleAssistantProcessStepBaseGroup[] = [];

      while (index < steps.length) {
        const runtimeStep = steps[index];

        if (!isRuntimeVisibleStep(runtimeStep)) break;
        if (runtimeStep.type === "thinking" && runtimeGroups.length > 0) break;
        if (getThinkingToolGroupLookahead(steps, index)) break;
        if (
          runtimeGroups.length > 0 &&
          getVisibleStepToolBatchId(runtimeStep)
        ) {
          break;
        }

        const result = readRuntimeBaseGroup(steps, index);
        runtimeGroups.push(result.group);
        index = result.nextIndex;
        if (result.group.kind === "tool_batch") break;
      }

      if (
        runtimeGroups.length === 1 &&
        runtimeGroups[0].kind === "tool_batch"
      ) {
        groups.push(runtimeGroups[0]);
      } else if (runtimeGroups.length > 0) {
        groups.push({ kind: "runtime_group", groups: runtimeGroups });
      }
      continue;
    }

    groups.push({ kind: "single", step });
    index += 1;
  }

  return groups;
}
