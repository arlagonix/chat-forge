import { defaultGenerationSettings, defaultProvider } from "./provider-presets";
import type {
  ChatAssistantMessage,
  ChatAssistantVariant,
  ChatMessage,
  ChatSession,
  ChatTokenUsage,
  ProviderConfig,
  ProviderGenerationSettings,
} from "./types";

export function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function labelForError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error.";
}

export function providerDisplayName(provider: Pick<ProviderConfig, "name">) {
  return provider.name.trim() || "New provider";
}

export function normalizeProviderModels(models: string[]) {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

export function getProviderFallbackModel(
  provider: Pick<ProviderConfig, "model" | "enabledModelIds">,
) {
  return (
    provider.model.trim() ||
    normalizeProviderModels(provider.enabledModelIds ?? [])[0] ||
    ""
  );
}

export function providerLabel(provider: ProviderConfig) {
  const model = getProviderFallbackModel(provider) || "No model selected";
  return `${providerDisplayName(provider)} · ${model}`;
}

export function normalizeProviderForState(
  provider: ProviderConfig,
): ProviderConfig {
  const models = normalizeProviderModels(provider.models ?? []);
  const enabledModelIds = normalizeProviderModels(
    provider.enabledModelIds ?? [],
  );
  const model = provider.model.trim();

  return {
    ...provider,
    name: provider.name ?? "",
    baseUrl: provider.baseUrl ?? "",
    apiKey: provider.apiKey ?? "",
    model,
    models: normalizeProviderModels([...models, ...enabledModelIds, model]),
    enabledModelIds,
    headers: provider.headers ?? {},
    customHeaders: undefined,
    defaultSettings: {
      ...defaultGenerationSettings,
      ...(provider.defaultSettings ?? {}),
    },
    modelSettings: provider.modelSettings ?? {},
  };
}

export function createProviderId() {
  return `provider-${createId()}`;
}

export function createNewProvider(): ProviderConfig {
  return normalizeProviderForState({
    ...defaultProvider,
    id: createProviderId(),
    name: "New provider",
    baseUrl: "",
    apiKey: "",
    model: "",
    models: [],
    enabledModelIds: [],
    headers: {},
    defaultSettings: defaultGenerationSettings,
    modelSettings: {},
  });
}

export function estimateTokens(text: string) {
  const trimmedText = text.trim();
  if (!trimmedText) return 0;

  return Math.max(1, Math.ceil(trimmedText.length / 4));
}

export function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;

  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function buildTokenMetrics({
  content,
  durationMs,
  usage,
  provider,
  finishReason,
}: {
  content: string;
  durationMs: number;
  usage?: ChatTokenUsage;
  provider: ProviderConfig;
  finishReason?: string;
}) {
  const exactOutputTokens = usage?.completionTokens;
  const outputTokens = exactOutputTokens ?? estimateTokens(content);
  const tokensPerSecond =
    outputTokens > 0 ? outputTokens / (durationMs / 1000) : 0;

  return {
    durationMs,
    tokenUsage: usage,
    outputTokens,
    tokensPerSecond,
    isApproximate: exactOutputTokens === undefined,
    providerName: providerDisplayName(provider),
    model: provider.model,
    finishReason,
  };
}

export function formatOptionalNumber(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? "" : String(value);
}

export function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function sanitizeGenerationSettings(
  settings: ProviderGenerationSettings,
): ProviderGenerationSettings {
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => {
      if (value === undefined) return false;
      if (typeof value === "string") return value.trim().length > 0;
      return true;
    }),
  ) as ProviderGenerationSettings;
}

export function formatMetricDetails(
  metrics: NonNullable<ChatAssistantVariant["metrics"]>,
) {
  const rows = [
    [
      "Duration",
      metrics.durationMs !== undefined
        ? formatDuration(metrics.durationMs)
        : undefined,
    ],
    [
      "Speed",
      metrics.tokensPerSecond !== undefined
        ? `${metrics.isApproximate ? "~" : ""}${metrics.tokensPerSecond.toFixed(1)} tok/s`
        : undefined,
    ],
    [
      "Output tokens",
      metrics.outputTokens !== undefined
        ? `${metrics.isApproximate ? "~" : ""}${metrics.outputTokens}`
        : undefined,
    ],
    ["Prompt tokens", metrics.tokenUsage?.promptTokens],
    ["Completion tokens", metrics.tokenUsage?.completionTokens],
    ["Total tokens", metrics.tokenUsage?.totalTokens],
    ["Finish reason", metrics.finishReason],
    ["Provider", metrics.providerName],
    ["Model", metrics.model],
  ];

  return rows.filter(([, value]) => value !== undefined && value !== "");
}

export function formatTokenMetrics(
  metrics: NonNullable<ChatAssistantVariant["metrics"]>,
) {
  const approximatePrefix = metrics.isApproximate ? "~" : "";
  const outputTokens = metrics.outputTokens ?? 0;
  const tokensPerSecond = metrics.tokensPerSecond ?? 0;
  const totalTokens = metrics.tokenUsage?.totalTokens;

  return [
    `${approximatePrefix}${tokensPerSecond.toFixed(1)} tok/s`,
    formatDuration(metrics.durationMs ?? 0),
    `${approximatePrefix}${outputTokens} output tokens`,
    totalTokens !== undefined ? `${totalTokens} total tokens` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function getActiveVariant(message: ChatAssistantMessage) {
  return message.variants[message.activeVariantIndex] ?? message.variants[0];
}

export function getAssistantContent(message: ChatMessage) {
  if (message.role === "user") return message.content;

  return getActiveVariant(message)?.content ?? "";
}

export function titleFromMessage(message: string) {
  const firstLine = message.replace(/\s+/g, " ").trim();
  if (!firstLine) return "New chat";

  return firstLine.length > 44 ? `${firstLine.slice(0, 44)}...` : firstLine;
}

export function sortChatsByUpdatedAt(chats: ChatSession[]) {
  return [...chats].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], [role="textbox"]',
    ),
  );
}

export function getChatActivityDate(chat: ChatSession) {
  return chat.updatedAt;
}

export function formatChatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

const CHAT_GROUP_MONTH_NAMES = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getStartOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatChatGroupLabel(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "UNKNOWN DATE";

  if (isSameLocalDay(date, now)) return "TODAY";

  const yesterday = getStartOfLocalDay(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(date, yesterday)) return "YESTERDAY";

  return `${date.getDate()} ${CHAT_GROUP_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export type ChatGroup = {
  label: string;
  chats: ChatSession[];
};

export function groupChatsByActivityDate(chats: ChatSession[]) {
  const now = new Date();
  const groups: ChatGroup[] = [];

  for (const chat of chats) {
    const label = formatChatGroupLabel(getChatActivityDate(chat), now);
    const lastGroup = groups.at(-1);

    if (lastGroup?.label === label) {
      lastGroup.chats.push(chat);
    } else {
      groups.push({ label, chats: [chat] });
    }
  }

  return groups;
}
