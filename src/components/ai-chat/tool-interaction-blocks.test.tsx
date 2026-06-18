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
  it("hides completed status while keeping compact context", () => {
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
    expect(screen.getByText("Pick behavior: Compact")).toBeInTheDocument();
  });
});
