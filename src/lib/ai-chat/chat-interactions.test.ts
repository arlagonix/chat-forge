import { describe, expect, it } from "vitest";

import { getAskUserAnswerSummaries } from "@/lib/ai-chat/chat-interactions";

describe("chat interaction summaries", () => {
  it("uses user-facing option labels in answered history", () => {
    const summaries = getAskUserAnswerSummaries(
      {
        questions: [
          {
            id: "mode",
            question: "Which mode?",
            options: [{ id: "safe", label: "Safe mode" }],
          },
        ],
      },
      {
        answers: { mode: "safe" },
        answeredAt: "2026-01-01T00:00:00.000Z",
      },
    );

    expect(summaries).toEqual([
      { id: "mode", question: "Which mode?", answer: "Safe mode" },
    ]);
  });
});
