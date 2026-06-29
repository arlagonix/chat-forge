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

  it("summarizes text, multi-select, and custom answers", () => {
    const summaries = getAskUserAnswerSummaries(
      {
        questions: [
          {
            id: "name",
            type: "text",
            question: "What should this be called?",
            options: [],
          },
          {
            id: "checks",
            type: "multi_select",
            question: "Which checks?",
            options: [
              { id: "types", label: "Type checking" },
              { id: "tests", label: "Tests" },
            ],
          },
          {
            id: "mode",
            question: "Which mode?",
            options: [{ id: "safe", label: "Safe mode" }],
          },
        ],
      },
      {
        answers: {
          name: "Release checks",
          checks: "",
          mode: "__custom__",
        },
        multiAnswers: { checks: ["types", "tests"] },
        customAnswers: { mode: "Strict mode" },
        answeredAt: "2026-01-01T00:00:00.000Z",
      },
    );

    expect(summaries).toEqual([
      {
        id: "name",
        question: "What should this be called?",
        answer: "Release checks",
      },
      {
        id: "checks",
        question: "Which checks?",
        answer: "Type checking, Tests",
      },
      { id: "mode", question: "Which mode?", answer: "Strict mode" },
    ]);
  });

  it("prefers stored answer labels for legacy responses", () => {
    const summaries = getAskUserAnswerSummaries(
      {
        questions: [
          {
            id: "checks",
            type: "multi_select",
            question: "Which checks?",
            options: [],
          },
        ],
      },
      {
        answers: { checks: "" },
        answerLabels: { checks: ["Lint", "Tests"] },
        answeredAt: "2026-01-01T00:00:00.000Z",
      },
    );

    expect(summaries[0]?.answer).toBe("Lint, Tests");
  });
});
