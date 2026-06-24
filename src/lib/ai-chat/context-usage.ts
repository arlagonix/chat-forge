import type {
  ChatAssistantVariant,
  ChatMessage,
  ChatTokenUsage,
} from "@/lib/ai-chat/types";

export type ContextUsageLimitSource =
  | "manual"
  | "detected"
  | "speculated"
  | "unknown";

export type ContextUsageTokenBreakdown = {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total: number;
  isApproximate?: boolean;
};

export type ContextUsageDistribution = {
  user: number;
  assistant: number;
  tool: number;
  other: number;
};

export type ContextUsageDetails = {
  usedTokens?: number;
  limitTokens?: number;
  limitSource?: ContextUsageLimitSource;
  usagePercent?: number;
  messagesCount: number;
  userMessagesCount: number;
  assistantMessagesCount: number;
  costUsd: number;
  lastAssistantBreakdown?: ContextUsageTokenBreakdown;
  cacheHitPercent?: number;
  isApproximate?: boolean;
  distribution: ContextUsageDistribution;
  distributionTotal: number;
};

function toNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function sumDefined(values: Array<number | undefined>) {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function extractTokenBreakdown(
  usage: ChatTokenUsage | undefined,
): ContextUsageTokenBreakdown | undefined {
  if (!usage) return undefined;

  const cacheRead = toNonNegativeNumber(usage.breakdown?.cache?.read);
  const cacheWrite = toNonNegativeNumber(usage.breakdown?.cache?.write);
  const input =
    toNonNegativeNumber(usage.breakdown?.input) ??
    toNonNegativeNumber(usage.promptTokens);
  const output =
    toNonNegativeNumber(usage.breakdown?.output) ??
    toNonNegativeNumber(usage.completionTokens);
  const reasoning = toNonNegativeNumber(usage.breakdown?.reasoning);
  const total =
    toNonNegativeNumber(usage.totalTokens) ??
    sumDefined([input, output, reasoning, cacheRead, cacheWrite]);

  if (
    total <= 0 &&
    input === undefined &&
    output === undefined &&
    reasoning === undefined &&
    cacheRead === undefined &&
    cacheWrite === undefined
  ) {
    return undefined;
  }

  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total,
  };
}

export function computeCacheHitPercent(
  breakdown: ContextUsageTokenBreakdown | undefined,
) {
  if (!breakdown) return undefined;

  const input = breakdown.input ?? 0;
  const cacheRead = breakdown.cacheRead ?? 0;
  const cacheWrite = breakdown.cacheWrite ?? 0;
  const totalInput = input + cacheRead + cacheWrite;

  if (totalInput <= 0 || breakdown.cacheRead === undefined) return undefined;

  return Math.min(100, Math.max(0, (cacheRead / totalInput) * 100));
}

function getActiveVariant(message: ChatMessage) {
  if (message.role !== "assistant") return undefined;
  return message.variants[message.activeVariantIndex];
}

function getLatestAssistantBreakdown(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const variant = getActiveVariant(messages[index]);
    const breakdown = extractTokenBreakdown(variant?.metrics?.tokenUsage);
    if (breakdown && breakdown.total > 0) {
      return { breakdown, index };
    }
  }

  return undefined;
}

function estimateTextLength(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).length;
  }
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (sum, item) => sum + estimateTextLength(item),
      0,
    );
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (sum, item) => sum + estimateTextLength(item),
      0,
    );
  }
  return 0;
}

function estimateTokensFromText(value: unknown): number {
  return Math.ceil(estimateTextLength(value) / 4);
}

function estimateVariantAssistantTokens(variant: ChatAssistantVariant): number {
  return (
    estimateTokensFromText(variant.content) +
    estimateTokensFromText(variant.reasoning)
  );
}

function estimateVariantToolTokens(variant: ChatAssistantVariant): number {
  const toolCallTokens = (variant.toolCalls ?? []).reduce<number>(
    (sum, call) =>
      sum +
      estimateTokensFromText(call.function.name) +
      estimateTokensFromText(call.function.arguments),
    0,
  );
  const toolResultTokens = (variant.toolResults ?? []).reduce<number>(
    (sum, result) =>
      sum +
      estimateTokensFromText(result.toolName) +
      estimateTokensFromText(result.content) +
      estimateTokensFromText(result.images),
    0,
  );

  return toolCallTokens + toolResultTokens;
}

function estimateMessageTokens(message: ChatMessage): number {
  if (message.role === "user") {
    return (
      estimateTokensFromText(message.content) +
      (message.attachments ?? []).reduce<number>(
        (sum, attachment) =>
          sum +
          (attachment.tokenEstimate ??
            estimateTokensFromText(attachment.extractedText ?? attachment.name)),
        0,
      )
    );
  }

  const variant = getActiveVariant(message);
  if (!variant) return 0;

  return estimateVariantAssistantTokens(variant) + estimateVariantToolTokens(variant);
}

function estimateLastAssistantBreakdown(
  messages: ChatMessage[],
): ContextUsageTokenBreakdown | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const variant = getActiveVariant(messages[index]);
    if (!variant) continue;

    const exactBreakdown = extractTokenBreakdown(variant.metrics?.tokenUsage);
    if (exactBreakdown && exactBreakdown.total > 0) return exactBreakdown;

    const output = estimateTokensFromText(variant.content);
    const reasoning = estimateTokensFromText(variant.reasoning);
    const tool = estimateVariantToolTokens(variant);
    const total = output + reasoning + tool;

    if (total <= 0) return undefined;

    return {
      output,
      reasoning: reasoning || undefined,
      total,
      isApproximate: true,
    };
  }

  return undefined;
}

function estimateContextTokens({
  messages,
  systemPrompt,
  exactBreakdown,
  exactBreakdownIndex,
}: {
  messages: ChatMessage[];
  systemPrompt: string;
  exactBreakdown?: ContextUsageTokenBreakdown;
  exactBreakdownIndex?: number;
}) {
  if (exactBreakdown && exactBreakdown.total > 0) {
    const trailingTokens = messages
      .slice((exactBreakdownIndex ?? messages.length - 1) + 1)
      .reduce<number>((sum, message) => sum + estimateMessageTokens(message), 0);

    return {
      tokens: exactBreakdown.total + trailingTokens,
      trailingTokens,
      isApproximate: trailingTokens > 0,
    };
  }

  const estimatedTokens =
    estimateTokensFromText(systemPrompt) +
    messages.reduce<number>(
      (sum, message) => sum + estimateMessageTokens(message),
      0,
    );

  return {
    tokens: estimatedTokens,
    trailingTokens: estimatedTokens,
    isApproximate: estimatedTokens > 0,
  };
}

function computeDistribution({
  messages,
  systemPrompt,
  inputTokens,
}: {
  messages: ChatMessage[];
  systemPrompt: string;
  inputTokens?: number;
}): { distribution: ContextUsageDistribution; total: number } {
  let user = estimateTokensFromText(systemPrompt);
  let assistant = 0;
  let tool = 0;

  for (const message of messages) {
    if (message.role === "user") {
      user += estimateTokensFromText(message.content);
      user += (message.attachments ?? []).reduce<number>(
        (sum, attachment) =>
          sum +
          (attachment.tokenEstimate ??
            estimateTokensFromText(attachment.extractedText ?? attachment.name)),
        0,
      );
      continue;
    }

    const variant = getActiveVariant(message);
    if (!variant) continue;
    assistant += estimateVariantAssistantTokens(variant);
    tool += estimateVariantToolTokens(variant);
  }

  const knownTotal = user + assistant + tool;
  const other =
    inputTokens !== undefined ? Math.max(0, inputTokens - knownTotal) : 0;
  const total = inputTokens !== undefined ? Math.max(inputTokens, knownTotal) : knownTotal;

  return {
    distribution: {
      user,
      assistant,
      tool,
      other,
    },
    total,
  };
}

export function buildContextUsageDetails({
  messages,
  contextLimit,
  limitSource,
  attachmentTokens = 0,
  systemPrompt = "",
}: {
  messages: ChatMessage[];
  contextLimit?: number;
  limitSource?: ContextUsageLimitSource;
  attachmentTokens?: number;
  systemPrompt?: string;
}): ContextUsageDetails {
  const latestExactAssistantBreakdown = getLatestAssistantBreakdown(messages);
  const exactBreakdown = latestExactAssistantBreakdown?.breakdown;
  const safeAttachmentTokens = Math.max(0, attachmentTokens);
  const contextEstimate = estimateContextTokens({
    messages,
    systemPrompt,
    exactBreakdown,
    exactBreakdownIndex: latestExactAssistantBreakdown?.index,
  });
  const estimatedUsedTokens =
    contextEstimate.tokens > 0
      ? contextEstimate.tokens + safeAttachmentTokens
      : safeAttachmentTokens || undefined;
  const usedTokens =
    exactBreakdown !== undefined && !contextEstimate.isApproximate
      ? exactBreakdown.total + safeAttachmentTokens
      : estimatedUsedTokens;
  const hasLimit =
    contextLimit !== undefined && Number.isFinite(contextLimit) && contextLimit > 0;
  const usagePercent =
    hasLimit && usedTokens !== undefined ? (usedTokens / contextLimit) * 100 : undefined;
  const inputTokens = exactBreakdown?.input;
  const distribution = computeDistribution({
    messages,
    systemPrompt,
    inputTokens,
  });
  const lastAssistantBreakdown = estimateLastAssistantBreakdown(messages);
  const isApproximate =
    contextEstimate.isApproximate ||
    Boolean(lastAssistantBreakdown?.isApproximate);

  return {
    usedTokens,
    limitTokens: hasLimit ? contextLimit : undefined,
    limitSource,
    usagePercent,
    messagesCount: messages.length,
    userMessagesCount: messages.filter((message) => message.role === "user").length,
    assistantMessagesCount: messages.filter((message) => message.role === "assistant").length,
    costUsd: 0,
    lastAssistantBreakdown,
    cacheHitPercent: lastAssistantBreakdown?.isApproximate
      ? undefined
      : computeCacheHitPercent(lastAssistantBreakdown),
    isApproximate,
    distribution: distribution.distribution,
    distributionTotal: distribution.total,
  };
}
