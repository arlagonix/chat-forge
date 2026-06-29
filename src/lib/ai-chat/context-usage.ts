import type {
  ChatAssistantVariant,
  ChatMessage,
  ChatTokenUsage,
  LoadedToolInfo,
} from "@/lib/ai-chat/types";

const APPROXIMATE_CHARS_PER_TOKEN = 4;
const APPROXIMATE_IMAGE_TOKENS = 800;

export type ContextUsageToolDefinitionBreakdown = {
  builtIn: number;
  custom: number;
  mcp: number;
  skill: number;
  agent: number;
};

export type PreparedContextUsageEstimate = {
  inputTokens: number;
  systemTokens: number;
  userMessageTokens: number;
  assistantMessageTokens: number;
  toolMessageTokens: number;
  mediaTokens: number;
  protocolTokens: number;
  toolDefinitionTokens: ContextUsageToolDefinitionBreakdown;
  assistantMessageId: string;
  variantId: string;
  assistantTokensAtRequestStart: number;
};

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
  preparedRequestEstimate?: PreparedContextUsageEstimate;
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
  return Math.ceil(estimateTextLength(value) / APPROXIMATE_CHARS_PER_TOKEN);
}

function estimateSerializedTokens(value: unknown): number {
  try {
    return Math.max(
      0,
      Math.round(JSON.stringify(value).length / APPROXIMATE_CHARS_PER_TOKEN),
    );
  } catch {
    return estimateTokensFromText(value);
  }
}

function countAndStripImageData(value: unknown): {
  value: unknown;
  imageCount: number;
} {
  if (Array.isArray(value)) {
    let imageCount = 0;
    const next = value.map((item) => {
      const sanitized = countAndStripImageData(item);
      imageCount += sanitized.imageCount;
      return sanitized.value;
    });
    return { value: next, imageCount };
  }

  if (!value || typeof value !== "object") {
    return { value, imageCount: 0 };
  }

  const source = value as Record<string, unknown>;
  const isImagePart = source.type === "image_url";
  let imageCount = isImagePart ? 1 : 0;
  const next = Object.fromEntries(
    Object.entries(source).map(([key, item]) => {
      if (
        (key === "url" || key === "dataUrl") &&
        typeof item === "string" &&
        item.startsWith("data:image/")
      ) {
        return [key, ""];
      }

      const sanitized = countAndStripImageData(item);
      imageCount += sanitized.imageCount;
      return [key, sanitized.value];
    }),
  );
  return { value: next, imageCount };
}

function createEmptyToolDefinitionBreakdown(): ContextUsageToolDefinitionBreakdown {
  return { builtIn: 0, custom: 0, mcp: 0, skill: 0, agent: 0 };
}

function readPayloadToolName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const fn = (value as Record<string, unknown>).function;
  if (!fn || typeof fn !== "object") return "";
  const name = (fn as Record<string, unknown>).name;
  return typeof name === "string" ? name : "";
}

function getToolDefinitionCategory(tool: LoadedToolInfo | undefined) {
  if (tool?.name === "skill") return "skill" as const;
  if (tool?.name === "call_agent") return "agent" as const;
  if (tool?.source === "mcp") return "mcp" as const;
  if (tool?.source === "custom") return "custom" as const;
  return "builtIn" as const;
}

export function estimatePreparedContextUsage({
  payload,
  tools,
  assistantMessageId,
  variantId,
  assistantTokensAtRequestStart,
}: {
  payload: Record<string, unknown>;
  tools: LoadedToolInfo[];
  assistantMessageId: string;
  variantId: string;
  assistantTokensAtRequestStart: number;
}): PreparedContextUsageEstimate {
  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const rawToolDefinitions = Array.isArray(payload.tools) ? payload.tools : [];
  const sanitizedMessages = countAndStripImageData(rawMessages);
  const toolDefinitionTokens = createEmptyToolDefinitionBreakdown();
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool] as const));
  let systemTokens = 0;
  let userMessageTokens = 0;
  let assistantMessageTokens = 0;
  let toolMessageTokens = 0;
  let uncategorizedMessageTokens = 0;

  for (const message of sanitizedMessages.value as unknown[]) {
    const tokens = estimateSerializedTokens(message);
    const role =
      message && typeof message === "object"
        ? (message as Record<string, unknown>).role
        : undefined;
    if (role === "system") systemTokens += tokens;
    else if (role === "user") userMessageTokens += tokens;
    else if (role === "assistant") assistantMessageTokens += tokens;
    else if (role === "tool") toolMessageTokens += tokens;
    else uncategorizedMessageTokens += tokens;
  }

  for (const definition of rawToolDefinitions) {
    const name = readPayloadToolName(definition);
    const category = getToolDefinitionCategory(toolsByName.get(name));
    toolDefinitionTokens[category] += estimateSerializedTokens(definition);
  }

  const mediaTokens =
    sanitizedMessages.imageCount * APPROXIMATE_IMAGE_TOKENS;
  const categorizedTokens =
    systemTokens +
    userMessageTokens +
    assistantMessageTokens +
    toolMessageTokens +
    uncategorizedMessageTokens +
    mediaTokens +
    sumDefined(Object.values(toolDefinitionTokens));
  const serializedContextTokens =
    estimateSerializedTokens({
      messages: sanitizedMessages.value,
      ...(rawToolDefinitions.length ? { tools: rawToolDefinitions } : {}),
    }) + mediaTokens;
  const inputTokens = Math.max(categorizedTokens, serializedContextTokens);

  return {
    inputTokens,
    systemTokens,
    userMessageTokens,
    assistantMessageTokens,
    toolMessageTokens,
    mediaTokens,
    protocolTokens: Math.max(
      0,
      inputTokens - (categorizedTokens - uncategorizedMessageTokens),
    ),
    toolDefinitionTokens,
    assistantMessageId,
    variantId,
    assistantTokensAtRequestStart: Math.max(
      0,
      assistantTokensAtRequestStart,
    ),
  };
}

type AssistantContextTokenSource = Pick<
  ChatAssistantVariant,
  "content" | "reasoning" | "toolCalls" | "toolResults"
>;

function estimateVariantAssistantTokens(
  variant: AssistantContextTokenSource,
): number {
  return (
    estimateTokensFromText(variant.content) +
    estimateTokensFromText(variant.reasoning)
  );
}

function estimateVariantToolTokens(variant: AssistantContextTokenSource): number {
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

export function estimateAssistantVariantContextTokens(
  variant: AssistantContextTokenSource,
) {
  return (
    estimateVariantAssistantTokens(variant) + estimateVariantToolTokens(variant)
  );
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

  return estimateAssistantVariantContextTokens(variant);
}

function getPreparedRequestLiveTokens(
  messages: ChatMessage[],
  estimate: PreparedContextUsageEstimate,
) {
  const message = messages.find(
    (candidate) =>
      candidate.role === "assistant" &&
      candidate.id === estimate.assistantMessageId,
  );
  if (!message || message.role !== "assistant") return 0;
  const variant = message.variants.find(
    (candidate) => candidate.id === estimate.variantId,
  );
  if (!variant) return 0;

  return Math.max(
    0,
    estimateAssistantVariantContextTokens(variant) -
      estimate.assistantTokensAtRequestStart,
  );
}

function hasPreparedRequestExactUsage(
  messages: ChatMessage[],
  estimate: PreparedContextUsageEstimate,
) {
  const message = messages.find(
    (candidate) =>
      candidate.role === "assistant" &&
      candidate.id === estimate.assistantMessageId,
  );
  if (!message || message.role !== "assistant") return false;
  const variant = message.variants.find(
    (candidate) => candidate.id === estimate.variantId,
  );
  return Boolean(extractTokenBreakdown(variant?.metrics?.tokenUsage));
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
  let user = 0;
  let assistant = 0;
  let tool = 0;
  let other = estimateTokensFromText(systemPrompt);

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

  const knownTotal = user + assistant + tool + other;
  other +=
    inputTokens !== undefined ? Math.max(0, inputTokens - knownTotal) : 0;
  const total =
    inputTokens !== undefined ? Math.max(inputTokens, knownTotal) : knownTotal;

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

function computePreparedRequestDistribution(
  estimate: PreparedContextUsageEstimate,
  liveAssistantTokens: number,
) {
  const toolDefinitions = sumDefined(
    Object.values(estimate.toolDefinitionTokens),
  );
  const distribution = {
    user: estimate.userMessageTokens,
    assistant: estimate.assistantMessageTokens + liveAssistantTokens,
    tool: estimate.toolMessageTokens + toolDefinitions,
    other:
      estimate.systemTokens + estimate.mediaTokens + estimate.protocolTokens,
  };
  return {
    distribution,
    total: sumDefined(Object.values(distribution)),
  };
}

export function buildContextUsageDetails({
  messages,
  contextLimit,
  limitSource,
  attachmentTokens = 0,
  systemPrompt = "",
  preparedRequestEstimate,
}: {
  messages: ChatMessage[];
  contextLimit?: number;
  limitSource?: ContextUsageLimitSource;
  attachmentTokens?: number;
  systemPrompt?: string;
  preparedRequestEstimate?: PreparedContextUsageEstimate;
}): ContextUsageDetails {
  const activePreparedRequestEstimate =
    preparedRequestEstimate &&
    !hasPreparedRequestExactUsage(messages, preparedRequestEstimate)
      ? preparedRequestEstimate
      : undefined;
  const latestExactAssistantBreakdown = getLatestAssistantBreakdown(messages);
  const exactBreakdown = latestExactAssistantBreakdown?.breakdown;
  const safeAttachmentTokens = Math.max(0, attachmentTokens);
  const contextEstimate = estimateContextTokens({
    messages,
    systemPrompt,
    exactBreakdown,
    exactBreakdownIndex: latestExactAssistantBreakdown?.index,
  });
  const liveAssistantTokens = activePreparedRequestEstimate
    ? getPreparedRequestLiveTokens(messages, activePreparedRequestEstimate)
    : 0;
  const estimatedUsedTokens = activePreparedRequestEstimate
    ? activePreparedRequestEstimate.inputTokens + liveAssistantTokens
    : contextEstimate.tokens > 0
      ? contextEstimate.tokens + safeAttachmentTokens
      : safeAttachmentTokens || undefined;
  const usedTokens = activePreparedRequestEstimate
    ? estimatedUsedTokens
    : exactBreakdown !== undefined && !contextEstimate.isApproximate
      ? exactBreakdown.total + safeAttachmentTokens
      : estimatedUsedTokens;
  const hasLimit =
    contextLimit !== undefined && Number.isFinite(contextLimit) && contextLimit > 0;
  const usagePercent =
    hasLimit && usedTokens !== undefined ? (usedTokens / contextLimit) * 100 : undefined;
  const inputTokens = exactBreakdown?.input;
  const distribution = activePreparedRequestEstimate
    ? computePreparedRequestDistribution(
        activePreparedRequestEstimate,
        liveAssistantTokens,
      )
    : computeDistribution({ messages, systemPrompt, inputTokens });
  const lastAssistantBreakdown = activePreparedRequestEstimate
    ? liveAssistantTokens > 0
      ? {
          output: liveAssistantTokens,
          total: liveAssistantTokens,
          isApproximate: true,
        }
      : undefined
    : estimateLastAssistantBreakdown(messages);
  const isApproximate = activePreparedRequestEstimate
    ? true
    : contextEstimate.isApproximate ||
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
    preparedRequestEstimate: activePreparedRequestEstimate,
  };
}
