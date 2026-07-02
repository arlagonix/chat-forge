import { LOAD_SKILL_TOOL_NAME } from "@/lib/ai-chat/builtin-tools";
import { createId } from "@/lib/ai-chat/chat-utils";
import type {
  ChatMessage,
  ChatToolCall,
  ChatToolResult,
  LoadedSkillInfo,
} from "@/lib/ai-chat/types";

export function stripSkillFrontmatter(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  const match = /^---\n[\s\S]*?\n---\n?/.exec(normalized);
  return (match ? normalized.slice(match[0].length) : normalized).trim();
}

export function buildLoadedSkillInstructions(skill: LoadedSkillInfo) {
  const directory = skill.directoryPath || "";
  const location = skill.manifestPath || skill.directoryPath || skill.name;
  const body = stripSkillFrontmatter(
    skill.manifestContent || skill.instructions || "",
  );

  return [
    `<skill name="${skill.name}" location="${location}">`,
    directory
      ? `References are relative to ${directory}.`
      : "References are relative to the skill directory.",
    "",
    body,
    "</skill>",
  ]
    .filter(
      (part) => part !== undefined && part !== null && String(part).length > 0,
    )
    .join("\n\n");
}

export function createLoadSkillToolCall(skillName: string): ChatToolCall {
  return {
    id: createId(),
    type: "function",
    function: {
      name: LOAD_SKILL_TOOL_NAME,
      arguments: JSON.stringify({ name: skillName }),
    },
  };
}

export function createLoadSkillToolResult({
  toolCall,
  skill,
  skillName = skill?.name ?? "",
}: {
  toolCall: ChatToolCall;
  skill?: LoadedSkillInfo;
  skillName?: string;
}): ChatToolResult {
  const loadedInstructions = skill ? buildLoadedSkillInstructions(skill) : "";
  const skillContent = skill
    ? skill.manifestContent || skill.instructions || ""
    : "";
  const payload = {
    ok: Boolean(skill),
    status: skill ? "loaded" : "missing",
    name: skillName,
    skillName,
    location: skill?.manifestPath ?? skill?.directoryPath,
    directoryPath: skill?.directoryPath,
    references: skill?.directoryPath
      ? `References are relative to ${skill.directoryPath}.`
      : "References are relative to the skill directory.",
    instructions: loadedInstructions,
    recommendedToolNames: [],
  };

  return {
    toolCallId: toolCall.id,
    toolName: LOAD_SKILL_TOOL_NAME,
    content: JSON.stringify(payload, null, 2),
    isError: !skill,
    loadedSkillName: skill ? skillName : undefined,
    loadedSkillDescription: skill?.description,
    loadedSkillContent: skillContent,
    loadedSkillInstructions: loadedInstructions,
    loadedSkillRecommendedToolNames: [],
  };
}

export function createLoadSkillAssistantMessage({
  skill,
  createdAt = new Date().toISOString(),
}: {
  skill: LoadedSkillInfo;
  createdAt?: string;
}): ChatMessage {
  const toolCall = createLoadSkillToolCall(skill.name);
  const toolResult = createLoadSkillToolResult({ toolCall, skill });

  return {
    id: createId(),
    role: "assistant",
    activeVariantIndex: 0,
    createdAt,
    variants: [
      {
        id: createId(),
        content: "",
        reasoning: "",
        status: "done",
        createdAt,
        toolCalls: [toolCall],
        toolResults: [toolResult],
        processSteps: [
          {
            id: createId(),
            type: "tool_execution",
            status: "complete",
            startedAt: createdAt,
            completedAt: createdAt,
            toolCall,
            toolResult,
          },
        ],
      },
    ],
  };
}

function addLoadedSkillNameFromResult(
  skillNames: Set<string>,
  toolResult: ChatToolResult | undefined,
) {
  if (
    toolResult?.toolName === LOAD_SKILL_TOOL_NAME &&
    !toolResult.isError &&
    toolResult.loadedSkillName
  ) {
    skillNames.add(toolResult.loadedSkillName);
  }
}

export function collectLoadedSkillNamesFromMessage(message: ChatMessage) {
  const skillNames = new Set<string>();
  if (message.role !== "assistant") return skillNames;

  for (const variant of message.variants) {
    for (const toolResult of variant.toolResults ?? []) {
      addLoadedSkillNameFromResult(skillNames, toolResult);
    }

    for (const step of variant.processSteps ?? []) {
      if (!("toolResult" in step)) continue;
      addLoadedSkillNameFromResult(skillNames, step.toolResult);
    }
  }

  return skillNames;
}

export function collectLoadedSkillNamesFromMessages(messages: ChatMessage[]) {
  const skillNames = new Set<string>();
  for (const message of messages) {
    for (const skillName of collectLoadedSkillNamesFromMessage(message)) {
      skillNames.add(skillName);
    }
  }
  return skillNames;
}

export function pruneActiveSkillNamesAfterDeletingLoadedSkillMessage({
  activeSkillNames,
  deletedMessage,
  remainingMessages,
}: {
  activeSkillNames: string[];
  deletedMessage: ChatMessage;
  remainingMessages: ChatMessage[];
}) {
  const deletedSkillNames = collectLoadedSkillNamesFromMessage(deletedMessage);
  if (deletedSkillNames.size === 0) return activeSkillNames;

  const remainingSkillNames = collectLoadedSkillNamesFromMessages(remainingMessages);
  return activeSkillNames.filter(
    (skillName) =>
      !deletedSkillNames.has(skillName) || remainingSkillNames.has(skillName),
  );
}
