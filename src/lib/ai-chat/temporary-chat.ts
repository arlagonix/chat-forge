import type { ChatAttachment, ChatSession } from "./types";

export const TEMPORARY_CHAT_TITLE = "Temporary chat";

export function isTemporaryChat(
  chat: Pick<ChatSession, "isTemporary"> | undefined,
): boolean {
  return chat?.isTemporary === true;
}

export function buildTemporaryChat(baseChat: ChatSession): ChatSession {
  return {
    ...baseChat,
    id: `temporary-${baseChat.id}`,
    title: TEMPORARY_CHAT_TITLE,
    titleMode: "manual",
    isTemporary: true,
    isPinned: false,
    folderId: undefined,
  };
}

export function convertTemporaryChatToPersistent(
  chat: ChatSession,
  savedAt = new Date().toISOString(),
): ChatSession {
  return {
    ...chat,
    title: TEMPORARY_CHAT_TITLE,
    titleMode: "manual",
    isTemporary: undefined,
    updatedAt: chat.updatedAt > savedAt ? chat.updatedAt : savedAt,
  };
}

export function hasTemporaryChatContent({
  chat,
  draft,
  attachments,
  isGenerating,
}: {
  chat: ChatSession;
  draft: string;
  attachments: ChatAttachment[];
  isGenerating: boolean;
}): boolean {
  return (
    chat.messages.length > 0 ||
    (chat.activeSkillNames?.length ?? 0) > 0 ||
    draft.trim().length > 0 ||
    attachments.length > 0 ||
    isGenerating
  );
}

export function filterPersistentComposerDrafts(
  drafts: Record<string, string>,
  temporaryChatIds: ReadonlySet<string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(drafts).filter(([chatId]) => !temporaryChatIds.has(chatId)),
  );
}
