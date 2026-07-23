import { describe, expect, it } from "vitest";

import {
  buildTemporaryChat,
  convertTemporaryChatToPersistent,
  filterPersistentComposerDrafts,
  hasTemporaryChatContent,
  isTemporaryChat,
  TEMPORARY_CHAT_TITLE,
} from "./temporary-chat";
import type { ChatSession } from "./types";

const createdAt = "2026-07-23T00:00:00.000Z";

function createChat(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "chat-1",
    title: "New chat",
    titleMode: "auto",
    messages: [],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe("temporary chats", () => {
  it("builds a fixed-title in-memory chat outside folders", () => {
    const chat = buildTemporaryChat(
      createChat({ folderId: "folder-1", isPinned: true }),
    );

    expect(chat.id).toBe("temporary-chat-1");
    expect(chat.title).toBe(TEMPORARY_CHAT_TITLE);
    expect(chat.titleMode).toBe("manual");
    expect(chat.isTemporary).toBe(true);
    expect(chat.isPinned).toBe(false);
    expect(chat.folderId).toBeUndefined();
    expect(isTemporaryChat(chat)).toBe(true);
  });

  it("converts a temporary chat into a fixed-title persistent chat", () => {
    const temporary = buildTemporaryChat(
      createChat({ updatedAt: "2026-07-23T01:00:00.000Z" }),
    );

    const saved = convertTemporaryChatToPersistent(
      temporary,
      "2026-07-23T02:00:00.000Z",
    );

    expect(saved.title).toBe(TEMPORARY_CHAT_TITLE);
    expect(saved.titleMode).toBe("manual");
    expect(saved.isTemporary).toBeUndefined();
    expect(saved.updatedAt).toBe("2026-07-23T02:00:00.000Z");
  });

  it("preserves a newer update made while a temporary chat is saving", () => {
    const temporary = buildTemporaryChat(
      createChat({ updatedAt: "2026-07-23T03:00:00.000Z" }),
    );

    expect(
      convertTemporaryChatToPersistent(
        temporary,
        "2026-07-23T02:00:00.000Z",
      ).updatedAt,
    ).toBe("2026-07-23T03:00:00.000Z");
  });

  it("detects content that requires confirmation before replacement", () => {
    const chat = buildTemporaryChat(createChat());

    expect(
      hasTemporaryChatContent({
        chat,
        draft: "",
        attachments: [],
        isGenerating: false,
      }),
    ).toBe(false);

    expect(
      hasTemporaryChatContent({
        chat,
        draft: "Unsaved text",
        attachments: [],
        isGenerating: false,
      }),
    ).toBe(true);

    expect(
      hasTemporaryChatContent({
        chat: { ...chat, activeSkillNames: ["review"] },
        draft: "",
        attachments: [],
        isGenerating: false,
      }),
    ).toBe(true);

    expect(
      hasTemporaryChatContent({
        chat: {
          ...chat,
          messages: [
            {
              id: "message-1",
              role: "user",
              content: "Hello",
              createdAt,
            },
          ],
        },
        draft: "",
        attachments: [],
        isGenerating: false,
      }),
    ).toBe(true);

    expect(
      hasTemporaryChatContent({
        chat,
        draft: "",
        attachments: [
          {
            id: "attachment-1",
            name: "notes.txt",
            kind: "text",
            mimeType: "text/plain",
            sizeBytes: 5,
          },
        ],
        isGenerating: false,
      }),
    ).toBe(true);

    expect(
      hasTemporaryChatContent({
        chat,
        draft: "",
        attachments: [],
        isGenerating: true,
      }),
    ).toBe(true);
  });

  it("excludes temporary chat drafts from persistent composer storage", () => {
    expect(
      filterPersistentComposerDrafts(
        {
          "chat-1": "Saved draft",
          "temporary-chat-2": "Private draft",
          __new_chat_draft__: "New chat draft",
        },
        new Set(["temporary-chat-2"]),
      ),
    ).toEqual({
      "chat-1": "Saved draft",
      __new_chat_draft__: "New chat draft",
    });
  });
});
