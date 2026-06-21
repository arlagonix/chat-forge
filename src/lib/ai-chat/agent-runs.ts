import { getActiveVariant } from "@/lib/ai-chat/chat-utils";
import type {
  AgentCallStatus,
  ChatAgentCall,
  ChatAssistantProcessStep,
  ChatMessage,
} from "@/lib/ai-chat/types";

export type AgentRunListItem = {
  id: string;
  parentId?: string;
  depth: number;
  agentName: string;
  task: string;
  status: AgentCallStatus;
  startedAt: string;
};

function collectFromAgentCall(
  agentCall: ChatAgentCall,
  items: AgentRunListItem[],
  parentId?: string,
) {
  items.push({
    id: agentCall.id,
    parentId,
    depth: agentCall.depth,
    agentName: agentCall.agentName,
    task: agentCall.task,
    status: agentCall.status,
    startedAt: agentCall.startedAt,
  });

  for (const child of agentCall.childAgentCalls ?? []) {
    collectFromAgentCall(child, items, agentCall.id);
  }
}

function collectFromProcessSteps(
  processSteps: ChatAssistantProcessStep[] | undefined,
  items: AgentRunListItem[],
) {
  const seen = new Set(items.map((item) => item.id));

  for (const step of processSteps ?? []) {
    if (step.type !== "agent_call" || seen.has(step.agentCall.id)) continue;
    collectFromAgentCall(step.agentCall, items);
    seen.add(step.agentCall.id);
  }
}

export function collectAgentRunsFromMessages(
  messages: ChatMessage[],
): AgentRunListItem[] {
  const items: AgentRunListItem[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    collectFromProcessSteps(getActiveVariant(message)?.processSteps, items);
  }

  return items;
}

export function findAgentCallInTree(
  agentCall: ChatAgentCall,
  agentCallId: string,
): ChatAgentCall | undefined {
  if (agentCall.id === agentCallId) return agentCall;

  for (const child of agentCall.childAgentCalls ?? []) {
    const match = findAgentCallInTree(child, agentCallId);
    if (match) return match;
  }

  for (const step of agentCall.processSteps ?? []) {
    if (step.type !== "agent_call") continue;
    const match = findAgentCallInTree(step.agentCall, agentCallId);
    if (match) return match;
  }

  return undefined;
}

export function findAgentCallInMessages(
  messages: ChatMessage[],
  agentCallId?: string,
): ChatAgentCall | undefined {
  if (!agentCallId) return undefined;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const step of getActiveVariant(message)?.processSteps ?? []) {
      if (step.type !== "agent_call") continue;
      const match = findAgentCallInTree(step.agentCall, agentCallId);
      if (match) return match;
    }
  }

  return undefined;
}

export function findAgentRunItem(
  items: AgentRunListItem[],
  agentCallId?: string,
): AgentRunListItem | undefined {
  if (!agentCallId) return undefined;
  return items.find((item) => item.id === agentCallId);
}
