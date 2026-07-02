import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  ContextUsageIndicator,
  ContextUsageSidebar,
} from "@/components/ai-chat/context-usage-indicator";

describe("ContextUsageIndicator", () => {
  it("shows percentage when context limit is known and calls the opener", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <ContextUsageIndicator
        onOpen={onOpen}
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

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders detailed usage in a sidebar", () => {
    render(
      <ContextUsageSidebar
        onClose={vi.fn()}
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

    expect(screen.getByText("Last Assistant Message")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) =>
        element?.textContent?.replace(/[\s,]/g, "") === "35433/200000" ||
        false,
      ),
    ).toBeInTheDocument();
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

  it("keeps small nonzero percentages formatted as 0.0%", () => {
    render(
      <ContextUsageIndicator
        usage={{
          usedTokens: 40,
          limitTokens: 200_000,
          usagePercent: 0.02,
          messagesCount: 0,
          userMessagesCount: 0,
          assistantMessagesCount: 0,
          costUsd: 0,
          distribution: { user: 0, assistant: 0, tool: 0, other: 40 },
          distributionTotal: 40,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Context usage" })).toHaveTextContent(
      "0.0%",
    );
  });

  it("shows finalized request categories while generation is active", () => {
    render(
      <ContextUsageSidebar
        onClose={vi.fn()}
        usage={{
          usedTokens: 160,
          limitTokens: 1_000,
          usagePercent: 16,
          messagesCount: 2,
          userMessagesCount: 1,
          assistantMessagesCount: 1,
          costUsd: 0,
          distribution: { user: 20, assistant: 30, tool: 60, other: 50 },
          distributionTotal: 160,
          preparedRequestEstimate: {
            inputTokens: 150,
            systemTokens: 40,
            userMessageTokens: 20,
            assistantMessageTokens: 20,
            toolMessageTokens: 10,
            mediaTokens: 5,
            protocolTokens: 5,
            toolDefinitionTokens: {
              builtIn: 10,
              custom: 5,
              mcp: 15,
              skill: 10,
              agent: 10,
            },
            assistantMessageId: "assistant-1",
            variantId: "variant-1",
            assistantTokensAtRequestStart: 0,
          },
        }}
      />,
    );

    expect(screen.getByText("Request Estimate")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Tool Definitions")).toBeInTheDocument();
    expect(screen.getByText(/MCP 15/)).toBeInTheDocument();
    expect(screen.getByText(/Skills 10/)).toBeInTheDocument();
    expect(screen.getByText(/Agents 10/)).toBeInTheDocument();
  });
});
