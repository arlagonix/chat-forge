import { describe, expect, it } from "vitest";

import {
  buildContextUsageDetails,
  computeCacheHitPercent,
  extractTokenBreakdown,
} from "@/lib/ai-chat/context-usage";
import type { ChatMessage } from "@/lib/ai-chat/types";

describe("context usage helpers", () => {
  it("extracts rich token breakdowns and computes cache hit", () => {
    const breakdown = extractTokenBreakdown({
      totalTokens: 35_433,
      breakdown: {
        input: 113,
        output: 233,
        reasoning: 15,
        cache: { read: 35_072, write: 0 },
      },
    });

    expect(breakdown).toEqual({
      input: 113,
      output: 233,
      reasoning: 15,
      cacheRead: 35_072,
      cacheWrite: 0,
      total: 35_433,
    });
    expect(computeCacheHitPercent(breakdown)).toBeCloseTo(99.7, 1);
  });

  it("falls back to legacy prompt/completion/total token fields", () => {
    const breakdown = extractTokenBreakdown({
      promptTokens: 100,
      completionTokens: 25,
      totalTokens: 125,
    });

    expect(breakdown).toEqual({
      input: 100,
      output: 25,
      reasoning: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
      total: 125,
    });
    expect(computeCacheHitPercent(breakdown)).toBeUndefined();
  });

  it("builds context details with percentage when the model limit is known", () => {
    const messages: ChatMessage[] = [
      {
        id: "user-1",
        role: "user",
        content: "Please inspect the available tools.",
        createdAt: new Date(0).toISOString(),
      },
      {
        id: "assistant-1",
        role: "assistant",
        activeVariantIndex: 0,
        createdAt: new Date(1).toISOString(),
        variants: [
          {
            id: "variant-1",
            content: "Done.",
            createdAt: new Date(1).toISOString(),
            metrics: {
              startedAt: new Date(1).toISOString(),
              tokenUsage: {
                totalTokens: 35_433,
                breakdown: {
                  input: 113,
                  output: 233,
                  reasoning: 15,
                  cache: { read: 35_072, write: 0 },
                },
              },
            },
            toolCalls: [
              {
                id: "tool-1",
                type: "function",
                function: { name: "read", arguments: '{"path":"README.md"}' },
              },
            ],
            toolResults: [
              {
                toolCallId: "tool-1",
                toolName: "read",
                content: "File contents",
              },
            ],
          },
        ],
      },
    ];

    const details = buildContextUsageDetails({
      messages,
      contextLimit: 200_000,
      limitSource: "manual",
      systemPrompt: "You are helpful.",
    });

    expect(details.usedTokens).toBe(35_433);
    expect(details.usagePercent).toBeCloseTo(17.7, 1);
    expect(details.messagesCount).toBe(2);
    expect(details.userMessagesCount).toBe(1);
    expect(details.assistantMessagesCount).toBe(1);
    expect(details.cacheHitPercent).toBeCloseTo(99.7, 1);
    expect(details.distributionTotal).toBeGreaterThan(0);
  });

  it("omits percentage when context limit is unknown", () => {
    const details = buildContextUsageDetails({
      messages: [],
      attachmentTokens: 35_000,
    });

    expect(details.usedTokens).toBe(35_000);
    expect(details.limitTokens).toBeUndefined();
    expect(details.usagePercent).toBeUndefined();
  });

  it("estimates live context usage before provider token usage is available", () => {
    const messages: ChatMessage[] = [
      {
        id: "user-1",
        role: "user",
        content: "12345678",
        createdAt: new Date(0).toISOString(),
      },
      {
        id: "assistant-1",
        role: "assistant",
        activeVariantIndex: 0,
        createdAt: new Date(1).toISOString(),
        variants: [
          {
            id: "variant-1",
            content: "1234567890123456",
            reasoning: "1234",
            status: "streaming",
            createdAt: new Date(1).toISOString(),
          },
        ],
      },
    ];

    const details = buildContextUsageDetails({
      messages,
      contextLimit: 100,
      systemPrompt: "12345678",
    });

    expect(details.usedTokens).toBe(9);
    expect(details.usagePercent).toBe(9);
    expect(details.isApproximate).toBe(true);
    expect(details.lastAssistantBreakdown).toEqual({
      output: 4,
      reasoning: 1,
      total: 5,
      isApproximate: true,
    });
  });

  it("adds estimated trailing messages to the latest exact usage", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        activeVariantIndex: 0,
        createdAt: new Date(0).toISOString(),
        variants: [
          {
            id: "variant-1",
            content: "Done.",
            createdAt: new Date(0).toISOString(),
            metrics: {
              startedAt: new Date(0).toISOString(),
              tokenUsage: {
                totalTokens: 100,
                breakdown: {
                  input: 80,
                  output: 20,
                },
              },
            },
          },
        ],
      },
      {
        id: "user-1",
        role: "user",
        content: "12345678",
        createdAt: new Date(1).toISOString(),
      },
      {
        id: "assistant-2",
        role: "assistant",
        activeVariantIndex: 0,
        createdAt: new Date(2).toISOString(),
        variants: [
          {
            id: "variant-2",
            content: "123456789012",
            status: "streaming",
            createdAt: new Date(2).toISOString(),
          },
        ],
      },
    ];

    const details = buildContextUsageDetails({
      messages,
      contextLimit: 200,
    });

    expect(details.usedTokens).toBe(105);
    expect(details.usagePercent).toBe(52.5);
    expect(details.isApproximate).toBe(true);
    expect(details.lastAssistantBreakdown).toEqual({
      output: 3,
      total: 3,
      isApproximate: true,
    });
  });
});
