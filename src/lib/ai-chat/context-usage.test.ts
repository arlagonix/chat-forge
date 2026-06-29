import { describe, expect, it } from "vitest";

import {
  buildContextUsageDetails,
  computeCacheHitPercent,
  estimatePreparedContextUsage,
  extractTokenBreakdown,
} from "@/lib/ai-chat/context-usage";
import type { ChatMessage, LoadedToolInfo } from "@/lib/ai-chat/types";

function tool(
  partial: Partial<LoadedToolInfo> & Pick<LoadedToolInfo, "name">,
): LoadedToolInfo {
  return {
    id: partial.name,
    description: `${partial.name} description`,
    parameters: { type: "object", properties: {} },
    command: "",
    args: [],
    input: "json-stdin",
    timeoutMs: 30_000,
    ...partial,
  };
}

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

  it("categorizes the fallback system prompt separately from user messages", () => {
    const details = buildContextUsageDetails({
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "12345678",
          createdAt: new Date(0).toISOString(),
        },
      ],
      systemPrompt: "123456789012",
    });

    expect(details.distribution.user).toBe(2);
    expect(details.distribution.other).toBe(3);
    expect(details.distributionTotal).toBe(5);
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

  it("estimates the finalized request including every context category", () => {
    const tools = [
      tool({ name: "read" }),
      tool({ name: "custom_search", source: "custom" }),
      tool({ name: "mcp_memory_search", source: "mcp" }),
      tool({ name: "skill" }),
      tool({ name: "call_agent" }),
    ];
    const payloadTools = tools.map((item) => ({
      type: "function",
      function: {
        name: item.name,
        description: item.description,
        parameters: item.parameters,
      },
    }));

    const estimate = estimatePreparedContextUsage({
      payload: {
        messages: [
          { role: "system", content: "Mode, project, skill, and agent instructions" },
          { role: "user", content: "Inspect this project" },
          { role: "assistant", content: "I will inspect it", tool_calls: [] },
          { role: "tool", tool_call_id: "call-1", content: "tool output" },
        ],
        tools: payloadTools,
      },
      tools,
      assistantMessageId: "assistant-current",
      variantId: "variant-current",
      assistantTokensAtRequestStart: 0,
    });

    expect(estimate.systemTokens).toBeGreaterThan(0);
    expect(estimate.userMessageTokens).toBeGreaterThan(0);
    expect(estimate.assistantMessageTokens).toBeGreaterThan(0);
    expect(estimate.toolMessageTokens).toBeGreaterThan(0);
    expect(estimate.toolDefinitionTokens.builtIn).toBeGreaterThan(0);
    expect(estimate.toolDefinitionTokens.custom).toBeGreaterThan(0);
    expect(estimate.toolDefinitionTokens.mcp).toBeGreaterThan(0);
    expect(estimate.toolDefinitionTokens.skill).toBeGreaterThan(0);
    expect(estimate.toolDefinitionTokens.agent).toBeGreaterThan(0);
    expect(estimate.inputTokens).toBeGreaterThan(
      estimate.systemTokens + estimate.userMessageTokens,
    );
  });

  it("uses a fixed media estimate instead of counting image base64", () => {
    const estimateImage = (dataUrl: string) =>
      estimatePreparedContextUsage({
        payload: {
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Inspect this image" },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        },
        tools: [],
        assistantMessageId: "assistant-1",
        variantId: "variant-1",
        assistantTokensAtRequestStart: 0,
      });

    const shortImage = estimateImage("data:image/png;base64,a");
    const largeImage = estimateImage(
      `data:image/png;base64,${"a".repeat(100_000)}`,
    );

    expect(shortImage.mediaTokens).toBe(800);
    expect(largeImage.mediaTokens).toBe(800);
    expect(largeImage.inputTokens).toBe(shortImage.inputTokens);
  });

  it("uses the prepared regeneration request instead of stale exact usage", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-old",
        role: "assistant",
        activeVariantIndex: 0,
        createdAt: new Date(0).toISOString(),
        variants: [
          {
            id: "variant-old",
            content: "Old response",
            createdAt: new Date(0).toISOString(),
            metrics: {
              startedAt: new Date(0).toISOString(),
              tokenUsage: { totalTokens: 500 },
            },
          },
        ],
      },
      {
        id: "assistant-current",
        role: "assistant",
        activeVariantIndex: 0,
        createdAt: new Date(1).toISOString(),
        variants: [
          {
            id: "variant-current",
            content: "12345678",
            status: "streaming",
            createdAt: new Date(1).toISOString(),
          },
        ],
      },
    ];

    const details = buildContextUsageDetails({
      messages,
      contextLimit: 1_000,
      preparedRequestEstimate: {
        inputTokens: 100,
        systemTokens: 40,
        userMessageTokens: 20,
        assistantMessageTokens: 10,
        toolMessageTokens: 5,
        mediaTokens: 0,
        protocolTokens: 10,
        toolDefinitionTokens: {
          builtIn: 5,
          custom: 2,
          mcp: 3,
          skill: 2,
          agent: 3,
        },
        assistantMessageId: "assistant-current",
        variantId: "variant-current",
        assistantTokensAtRequestStart: 0,
      },
    });

    expect(details.usedTokens).toBe(102);
    expect(details.usagePercent).toBe(10.2);
    expect(details.distribution.user).toBe(20);
    expect(details.distribution.assistant).toBe(12);
    expect(details.distribution.other).toBe(50);
    expect(details.isApproximate).toBe(true);
  });

  it("counts only new assistant tokens after a tool-round snapshot", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-current",
        role: "assistant",
        activeVariantIndex: 0,
        createdAt: new Date(0).toISOString(),
        variants: [
          {
            id: "variant-current",
            content: "a".repeat(48),
            status: "streaming",
            createdAt: new Date(0).toISOString(),
          },
        ],
      },
    ];

    const details = buildContextUsageDetails({
      messages,
      preparedRequestEstimate: {
        inputTokens: 200,
        systemTokens: 100,
        userMessageTokens: 40,
        assistantMessageTokens: 40,
        toolMessageTokens: 10,
        mediaTokens: 0,
        protocolTokens: 10,
        toolDefinitionTokens: {
          builtIn: 0,
          custom: 0,
          mcp: 0,
          skill: 0,
          agent: 0,
        },
        assistantMessageId: "assistant-current",
        variantId: "variant-current",
        assistantTokensAtRequestStart: 10,
      },
    });

    expect(details.usedTokens).toBe(202);
    expect(details.lastAssistantBreakdown?.output).toBe(2);
  });

  it("prefers exact provider usage over a prepared request estimate", () => {
    const preparedRequestEstimate = {
      inputTokens: 200,
      systemTokens: 100,
      userMessageTokens: 50,
      assistantMessageTokens: 20,
      toolMessageTokens: 10,
      mediaTokens: 0,
      protocolTokens: 20,
      toolDefinitionTokens: {
        builtIn: 0,
        custom: 0,
        mcp: 0,
        skill: 0,
        agent: 0,
      },
      assistantMessageId: "assistant-current",
      variantId: "variant-current",
      assistantTokensAtRequestStart: 0,
    };
    const messages: ChatMessage[] = [
      {
        id: "assistant-current",
        role: "assistant",
        activeVariantIndex: 0,
        createdAt: new Date(0).toISOString(),
        variants: [
          {
            id: "variant-current",
            content: "Done",
            createdAt: new Date(0).toISOString(),
            metrics: {
              startedAt: new Date(0).toISOString(),
              tokenUsage: {
                totalTokens: 80,
                breakdown: { input: 70, output: 10 },
              },
            },
          },
        ],
      },
    ];

    const details = buildContextUsageDetails({
      messages,
      preparedRequestEstimate,
    });

    expect(details.usedTokens).toBe(80);
    expect(details.isApproximate).toBe(false);
    expect(details.preparedRequestEstimate).toBeUndefined();
  });
});
