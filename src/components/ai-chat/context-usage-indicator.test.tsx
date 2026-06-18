import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ContextUsageIndicator } from "@/components/ai-chat/context-usage-indicator";

describe("ContextUsageIndicator", () => {
  it("shows percentage when context limit is known and opens details modal", async () => {
    const user = userEvent.setup();

    render(
      <ContextUsageIndicator
        usage={{
          usedTokens: 35_433,
          limitTokens: 200_000,
          usagePercent: 17.7165,
          messagesCount: 16,
          userMessagesCount: 4,
          assistantMessagesCount: 12,
          costUsd: 0,
          lastAssistantBreakdown: {
            input: 113,
            output: 233,
            reasoning: 15,
            cacheRead: 35_072,
            cacheWrite: 0,
            total: 35_433,
          },
          cacheHitPercent: 99.7,
          distribution: {
            user: 2,
            assistant: 60,
            tool: 38,
            other: 0,
          },
          distributionTotal: 100,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Context usage" })).toHaveTextContent(
      "17.7%",
    );

    await user.click(screen.getByRole("button", { name: "Context usage" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Last Assistant Message")).toBeInTheDocument();
    expect(screen.getByText("35,433 / 200,000")).toBeInTheDocument();
    expect(screen.getByText("99.7%")).toBeInTheDocument();
  });

  it("shows compact used tokens when context limit is unknown", () => {
    render(
      <ContextUsageIndicator
        usage={{
          usedTokens: 35_433,
          messagesCount: 0,
          userMessagesCount: 0,
          assistantMessagesCount: 0,
          costUsd: 0,
          distribution: {
            user: 0,
            assistant: 0,
            tool: 0,
            other: 0,
          },
          distributionTotal: 0,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Context usage" })).toHaveTextContent(
      "35k",
    );
  });
});
