import {
  DEFAULT_CHAT_TITLE,
  normalizeManualChatTitle,
} from "./chat-utils";
import type {
  ChatFileToolAutoApproval,
  ChatFolder,
  ChatMessage,
  ChatSession,
  ChatThinkingMode,
  ChatWorkspaceRoot,
} from "./types";

export function cloneWorkspaceRoots(roots?: ChatWorkspaceRoot[]) {
  return roots?.map((root) => ({ ...root })) ?? [];
}

export function getFolderDefaultWorkspaceRoots(
  folder?: ChatFolder | Pick<ChatFolder, "workspaceRoots">,
) {
  return cloneWorkspaceRoots(folder?.workspaceRoots);
}

export type NewChatDraftSettings = {
  providerId?: string;
  model?: string;
  modeId?: string;
  folderId?: string;
  enabledToolNames?: string[];
  disabledToolNames?: string[];
  enabledSkillNames?: string[];
  disabledSkillNames?: string[];
  enabledAgentNames?: string[];
  disabledAgentNames?: string[];
  activeSkillNames?: string[];
  workspaceRoots?: ChatWorkspaceRoot[];
  fileToolAutoApproval?: ChatFileToolAutoApproval;
  thinkingMode?: ChatThinkingMode;
};

function cloneStringArray(values?: string[]) {
  return values ? [...values] : undefined;
}

export function buildNewChatDraftSettings(
  sourceChat: ChatSession,
): NewChatDraftSettings {
  return {
    providerId: sourceChat.providerId,
    model: sourceChat.model,
    modeId: sourceChat.modeId,
    folderId: sourceChat.folderId,
    enabledToolNames: cloneStringArray(sourceChat.enabledToolNames),
    disabledToolNames: cloneStringArray(sourceChat.disabledToolNames),
    enabledSkillNames: cloneStringArray(sourceChat.enabledSkillNames),
    disabledSkillNames: cloneStringArray(sourceChat.disabledSkillNames),
    enabledAgentNames: cloneStringArray(sourceChat.enabledAgentNames),
    disabledAgentNames: cloneStringArray(sourceChat.disabledAgentNames),
    activeSkillNames: cloneStringArray(sourceChat.activeSkillNames),
    workspaceRoots: sourceChat.workspaceRoots
      ? cloneWorkspaceRoots(sourceChat.workspaceRoots)
      : undefined,
    fileToolAutoApproval: sourceChat.fileToolAutoApproval
      ? { ...sourceChat.fileToolAutoApproval }
      : undefined,
    thinkingMode: sourceChat.thinkingMode,
  };
}

export function applyNewChatDraftSettings({
  baseChat,
  draftSettings,
  modeId,
  folderId,
  workspaceRoots,
  fileToolAutoApprovalDefaults,
}: {
  baseChat: ChatSession;
  draftSettings?: NewChatDraftSettings;
  modeId: string;
  folderId?: string;
  workspaceRoots: ChatWorkspaceRoot[];
  fileToolAutoApprovalDefaults: ChatFileToolAutoApproval;
}): ChatSession {
  return {
    ...baseChat,
    providerId: draftSettings?.providerId,
    model: draftSettings?.model,
    modeId,
    folderId,
    enabledToolNames: cloneStringArray(draftSettings?.enabledToolNames),
    disabledToolNames: cloneStringArray(draftSettings?.disabledToolNames),
    enabledSkillNames: cloneStringArray(draftSettings?.enabledSkillNames),
    disabledSkillNames: cloneStringArray(draftSettings?.disabledSkillNames),
    enabledAgentNames: cloneStringArray(draftSettings?.enabledAgentNames),
    disabledAgentNames: cloneStringArray(draftSettings?.disabledAgentNames),
    activeSkillNames: cloneStringArray(draftSettings?.activeSkillNames),
    workspaceRoots: workspaceRoots.length ? cloneWorkspaceRoots(workspaceRoots) : undefined,
    fileToolAutoApproval: draftSettings?.fileToolAutoApproval
      ? { ...draftSettings.fileToolAutoApproval }
      : { ...fileToolAutoApprovalDefaults },
    thinkingMode: draftSettings?.thinkingMode,
  };
}

export function cloneChatMessages(messages: ChatMessage[]) {
  if (typeof structuredClone === "function") {
    return structuredClone(messages) as ChatMessage[];
  }

  return JSON.parse(JSON.stringify(messages)) as ChatMessage[];
}

type DerivedChatTitleKind = "copy" | "branch";

function parseDerivedChatTitle(title: string) {
  let baseTitle = normalizeManualChatTitle(title) || DEFAULT_CHAT_TITLE;
  const numbers: Record<DerivedChatTitleKind, number> = {
    copy: 0,
    branch: 0,
  };

  for (;;) {
    const numberedMatch = baseTitle.match(
      /\s+\((copy|branch)(?: #(\d+))?\)$/i,
    );
    const legacyCopyMatch = numberedMatch
      ? undefined
      : baseTitle.match(/\s+copy$/i);
    const suffixMatch = numberedMatch ?? legacyCopyMatch;
    if (!suffixMatch) break;

    const kind = numberedMatch
      ? (numberedMatch[1].toLowerCase() as DerivedChatTitleKind)
      : "copy";
    const parsedNumber = numberedMatch?.[2]
      ? Number.parseInt(numberedMatch[2], 10)
      : numbers[kind] + 1;
    numbers[kind] = Math.max(numbers[kind], parsedNumber);
    const suffixStart =
      suffixMatch.index ?? baseTitle.length - suffixMatch[0].length;
    baseTitle =
      normalizeManualChatTitle(baseTitle.slice(0, suffixStart)) ||
      DEFAULT_CHAT_TITLE;
  }

  return { baseTitle, numbers };
}

function getDerivedChatTitle(
  title: string,
  existingTitles: Iterable<string>,
  kind: DerivedChatTitleKind,
) {
  const source = parseDerivedChatTitle(title);
  let highestNumber = source.numbers[kind];
  const normalizedBaseTitle = source.baseTitle.toLocaleLowerCase();

  for (const existingTitle of existingTitles) {
    const existing = parseDerivedChatTitle(existingTitle);
    if (existing.baseTitle.toLocaleLowerCase() !== normalizedBaseTitle) continue;
    highestNumber = Math.max(highestNumber, existing.numbers[kind]);
  }

  return `${source.baseTitle} (${kind} #${highestNumber + 1})`;
}

export function getClonedChatTitle(
  title: string,
  existingTitles: Iterable<string> = [],
) {
  return getDerivedChatTitle(title, existingTitles, "copy");
}

export function getBranchedChatTitle(
  title: string,
  existingTitles: Iterable<string> = [],
) {
  return getDerivedChatTitle(title, existingTitles, "branch");
}

function cloneChatConfiguration(
  sourceChat: ChatSession,
  fileToolAutoApprovalFallback?: ChatFileToolAutoApproval,
) {
  return {
    providerId: sourceChat.providerId,
    model: sourceChat.model,
    modeId: sourceChat.modeId,
    enabledToolNames: cloneStringArray(sourceChat.enabledToolNames),
    disabledToolNames: cloneStringArray(sourceChat.disabledToolNames),
    enabledSkillNames: cloneStringArray(sourceChat.enabledSkillNames),
    disabledSkillNames: cloneStringArray(sourceChat.disabledSkillNames),
    enabledAgentNames: cloneStringArray(sourceChat.enabledAgentNames),
    disabledAgentNames: cloneStringArray(sourceChat.disabledAgentNames),
    activeSkillNames: cloneStringArray(sourceChat.activeSkillNames),
    workspaceRoots: sourceChat.workspaceRoots
      ? cloneWorkspaceRoots(sourceChat.workspaceRoots)
      : undefined,
    fileToolAutoApproval: sourceChat.fileToolAutoApproval
      ? { ...sourceChat.fileToolAutoApproval }
      : fileToolAutoApprovalFallback
        ? { ...fileToolAutoApprovalFallback }
        : undefined,
    thinkingMode: sourceChat.thinkingMode,
  };
}

export function buildClonedChat(
  sourceChat: ChatSession,
  baseChat: ChatSession,
  now: string,
  existingTitles: Iterable<string> = [],
): ChatSession {
  return {
    ...baseChat,
    ...cloneChatConfiguration(sourceChat),
    title: getClonedChatTitle(sourceChat.title, existingTitles),
    titleMode: "manual",
    isPinned: sourceChat.folderId ? false : sourceChat.isPinned,
    folderId: sourceChat.folderId,
    messages: cloneChatMessages(sourceChat.messages),
    createdAt: now,
    updatedAt: now,
  };
}

export function buildBranchedChat({
  sourceChat,
  baseChat,
  messages,
  now,
  existingTitles,
  fileToolAutoApprovalDefaults,
}: {
  sourceChat: ChatSession;
  baseChat: ChatSession;
  messages: ChatMessage[];
  now: string;
  existingTitles: Iterable<string>;
  fileToolAutoApprovalDefaults: ChatFileToolAutoApproval;
}): ChatSession {
  return {
    ...baseChat,
    ...cloneChatConfiguration(sourceChat, fileToolAutoApprovalDefaults),
    title: getBranchedChatTitle(sourceChat.title, existingTitles),
    titleMode: "manual",
    isPinned: sourceChat.folderId ? false : sourceChat.isPinned,
    folderId: sourceChat.folderId,
    messages,
    createdAt: now,
    updatedAt: now,
  };
}

export function renameChatWithoutActivityUpdate(
  chat: ChatSession,
  title: string,
) {
  const nextTitle = normalizeManualChatTitle(title);
  if (!nextTitle) return chat;

  return {
    ...chat,
    title: nextTitle,
    titleMode: "manual" as const,
  };
}
