import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AskUserBlock } from "@/components/ai-chat/tool-interaction-blocks";
import type { AskUserRequest, AskUserResponse } from "@/lib/ai-chat/types";

const request: AskUserRequest = {
  title: "Pick behavior",
  questions: [
    {
      id: "behavior",
      question: "Which behavior should be used?",
      options: [{ id: "compact", label: "Compact" }],
    },
  ],
};

const response: AskUserResponse = {
  answers: { behavior: "compact" },
  answerLabels: { behavior: "Compact" },
  answeredAt: "2026-01-01T00:00:00.000Z",
};

describe("AskUserBlock", () => {
  it("hides completed status while showing collapsed Q/A cards", () => {
    render(
      <AskUserBlock
        id="ask-user-1"
        request={request}
        response={response}
        status="complete"
        canSubmit={false}
        isCollapsed
        onToggleCollapsed={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
    expect(screen.getByText("1 answer")).toBeInTheDocument();
    expect(screen.getAllByText(/Q:/)).toHaveLength(1);
    expect(
      screen.getByText(/Which behavior should be used?/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/A:/)).toHaveLength(1);
    expect(screen.getByText(/Compact/)).toBeInTheDocument();
  });

  it("shows every answered question in the collapsed summary", () => {
    render(
      <AskUserBlock
        id="ask-user-2"
        request={{
          title: "Configure run",
          questions: [
            {
              id: "tool",
              question: "Which tool should be used?",
              options: [{ id: "rng", label: "Random Number Generator" }],
            },
            {
              id: "value",
              type: "text",
              question: "Which value did it return?",
              options: [],
            },
          ],
        }}
        response={{
          answers: { tool: "rng", value: "44" },
          answerLabels: {
            tool: "Random Number Generator",
            value: "44",
          },
          answeredAt: "2026-01-01T00:00:00.000Z",
        }}
        status="complete"
        canSubmit={false}
        isCollapsed
        onToggleCollapsed={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("2 answers")).toBeInTheDocument();
    expect(screen.getByText(/Which tool should be used?/)).toBeInTheDocument();
    expect(screen.getByText(/Random Number Generator/)).toBeInTheDocument();
    expect(screen.getByText(/Which value did it return?/)).toBeInTheDocument();
    expect(screen.getByText(/44/)).toBeInTheDocument();
  });
});
