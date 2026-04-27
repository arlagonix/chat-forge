"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Moon,
  MoreVertical,
  Plus,
  RefreshCcw,
  Send,
  Settings,
  Square,
  Sun,
  Trash2,
} from "lucide-react";
import type { FormEvent, WheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MarkdownMessage } from "@/components/ai-chat/markdown-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  getActiveModelSettings,
  loadProviderModels,
  streamProviderChat,
} from "@/lib/ai-chat/direct-provider-client";
import {
  defaultGenerationSettings,
  defaultProvider,
  providerPresets,
} from "@/lib/ai-chat/provider-presets";
import {
  createEmptyChat,
  deleteChat,
  loadActiveChatId,
  loadChats,
  loadProvider,
  loadSystemPrompt,
  saveActiveChatId,
  saveChat,
  saveProvider,
  saveSystemPrompt,
} from "@/lib/ai-chat/storage";
import type {
  ChatAssistantMessage,
  ChatAssistantVariant,
  ChatMessage,
  ChatSession,
  ChatTokenUsage,
  ProviderConfig,
  ProviderGenerationSettings,
} from "@/lib/ai-chat/types";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { toast } from "sonner";

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function labelForError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error.";
}

function providerLabel(provider: ProviderConfig) {
  const model = provider.model.trim() || "No model selected";
  return `${provider.name || "Custom provider"} · ${model}`;
}

function estimateTokens(text: string) {
  const trimmedText = text.trim();
  if (!trimmedText) return 0;

  return Math.max(1, Math.ceil(trimmedText.length / 4));
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;

  return `${(durationMs / 1000).toFixed(2)}s`;
}

function buildTokenMetrics({
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
    providerName: provider.name,
    model: provider.model,
    finishReason,
  };
}

function formatOptionalNumber(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? "" : String(value);
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeGenerationSettings(
  settings: ProviderGenerationSettings,
): ProviderGenerationSettings {
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => value !== undefined && value !== ""),
  ) as ProviderGenerationSettings;
}

function getSettingsForProvider(provider: ProviderConfig) {
  return getActiveModelSettings(provider);
}

function formatMetricDetails(
  metrics: NonNullable<ChatAssistantVariant["metrics"]>,
) {
  const rows = [
    ["Duration", metrics.durationMs !== undefined ? formatDuration(metrics.durationMs) : undefined],
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

function formatTokenMetrics(
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

function getActiveVariant(message: ChatAssistantMessage) {
  return message.variants[message.activeVariantIndex] ?? message.variants[0];
}

function getAssistantContent(message: ChatMessage) {
  if (message.role === "user") return message.content;

  return getActiveVariant(message)?.content ?? "";
}

function titleFromMessage(message: string) {
  const firstLine = message.replace(/\s+/g, " ").trim();
  if (!firstLine) return "New chat";

  return firstLine.length > 44 ? `${firstLine.slice(0, 44)}...` : firstLine;
}

function sortChatsByUpdatedAt(chats: ChatSession[]) {
  return [...chats].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], [role="textbox"]',
    ),
  );
}

function getLastChatActivityDate(chat: ChatSession) {
  const lastMessage = chat.messages.at(-1);
  return lastMessage?.createdAt ?? chat.updatedAt;
}

function formatChatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [provider, setProvider] = useState<ProviderConfig>(defaultProvider);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant.",
  );
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelLoadStatus, setModelLoadStatus] = useState<
    "idle" | "success" | "empty" | "error"
  >("idle");
  const [models, setModels] = useState<string[]>([]);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<
    Record<string, boolean>
  >({});
  const [expandedMetricsIds, setExpandedMetricsIds] = useState<
    Record<string, boolean>
  >({});
  const [isNearChatBottom, setIsNearChatBottom] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const modelLoadStatusTimerRef = useRef<number | null>(null);
  const isAutoScrollingRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);
  const didHydrateRef = useRef(false);
  const { resolvedTheme, setTheme } = useTheme();

  const sortedChats = useMemo(() => sortChatsByUpdatedAt(chats), [chats]);

  const activeChat = useMemo(() => {
    return (
      sortedChats.find((chat) => chat.id === activeChatId) ?? sortedChats[0]
    );
  }, [activeChatId, sortedChats]);

  const messages = activeChat?.messages ?? [];
  const activeModelSettings = getSettingsForProvider(provider);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const [
          loadedProvider,
          loadedSystemPrompt,
          loadedChats,
          loadedActiveChatId,
        ] = await Promise.all([
          loadProvider(),
          loadSystemPrompt(),
          loadChats(),
          loadActiveChatId(),
        ]);

        if (cancelled) return;

        let nextChats = loadedChats;
        let nextActiveChatId = loadedActiveChatId;

        if (nextChats.length === 0) {
          const chat = createEmptyChat();
          nextChats = [chat];
          nextActiveChatId = chat.id;
          await saveChat(chat);
          await saveActiveChatId(chat.id);
        } else if (
          !nextActiveChatId ||
          !nextChats.some((chat) => chat.id === nextActiveChatId)
        ) {
          nextActiveChatId = nextChats[0].id;
          await saveActiveChatId(nextActiveChatId);
        }

        if (cancelled) return;

        setProvider(loadedProvider);
        setSystemPrompt(loadedSystemPrompt);
        setChats(nextChats);
        setActiveChatId(nextActiveChatId);
        didHydrateRef.current = true;
        setMounted(true);
      } catch (error) {
        console.error("Failed to load app data from IndexedDB:", error);
        const fallbackChat = createEmptyChat();
        setChats([fallbackChat]);
        setActiveChatId(fallbackChat.id);
        didHydrateRef.current = true;
        setMounted(true);
        showError("Storage failed", labelForError(error));
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (modelLoadStatusTimerRef.current !== null) {
        window.clearTimeout(modelLoadStatusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.repeat) return;
      if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey)
        return;
      if (event.code !== "KeyN") return;

      event.preventDefault();
      event.stopPropagation();
      void createNewChat();
    }

    document.addEventListener("keydown", handleGlobalShortcut, {
      capture: true,
    });

    return () => {
      document.removeEventListener("keydown", handleGlobalShortcut, {
        capture: true,
      });
    };
  }, [isSending]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    saveProvider(provider).catch((error) =>
      console.error("Failed to save provider:", error),
    );
  }, [provider]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    saveSystemPrompt(systemPrompt).catch((error) =>
      console.error("Failed to save system prompt:", error),
    );
  }, [systemPrompt]);

  useEffect(() => {
    if (!didHydrateRef.current || !activeChatId) return;
    saveActiveChatId(activeChatId).catch((error) =>
      console.error("Failed to save active chat id:", error),
    );
  }, [activeChatId]);

  useEffect(() => {
    if (!didHydrateRef.current || chats.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      Promise.all(chats.map((chat) => saveChat(chat))).catch((error) =>
        console.error("Failed to save chats:", error),
      );
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [chats]);

  useEffect(() => {
    const textarea = draftTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
    const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
    const maxHeight = lineHeight * 11 + paddingTop + paddingBottom;

    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    const scrollElement = chatScrollRef.current;
    if (!scrollElement || !shouldStickToBottomRef.current) return;

    isAutoScrollingRef.current = true;
    scrollElement.scrollTop = scrollElement.scrollHeight;
    window.requestAnimationFrame(() => {
      isAutoScrollingRef.current = false;
    });
  }, [messages]);

  const canSend = useMemo(() => {
    return Boolean(
      provider.baseUrl.trim() &&
      provider.model.trim() &&
      draft.trim() &&
      !isSending &&
      activeChat,
    );
  }, [activeChat, draft, isSending, provider.baseUrl, provider.model]);

  function showSuccess(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function showError(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function showInfo(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function updateChat(
    chatId: string,
    updater: (chat: ChatSession) => ChatSession,
  ) {
    setChats((currentChats) =>
      currentChats.map((chat) => (chat.id === chatId ? updater(chat) : chat)),
    );
  }

  function updateChatMessages(
    chatId: string,
    updater: (messages: ChatMessage[]) => ChatMessage[],
  ) {
    updateChat(chatId, (chat) => ({
      ...chat,
      messages: updater(chat.messages),
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateActiveChatMessages(
    updater: (messages: ChatMessage[]) => ChatMessage[],
  ) {
    if (!activeChatId) return;
    updateChatMessages(activeChatId, updater);
  }

  function toggleReasoning(messageId: string) {
    setExpandedReasoningIds((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  }

  function toggleMetrics(messageId: string) {
    setExpandedMetricsIds((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  }

  function scrollChatToBottom(behavior: ScrollBehavior = "smooth") {
    const scrollElement = chatScrollRef.current;
    if (!scrollElement) return;

    shouldStickToBottomRef.current = true;
    setIsNearChatBottom(true);
    scrollElement.scrollTo({
      top: scrollElement.scrollHeight,
      behavior,
    });
  }

  function handleChatScroll() {
    const scrollElement = chatScrollRef.current;
    if (!scrollElement) return;

    const distanceFromBottom =
      scrollElement.scrollHeight -
      scrollElement.scrollTop -
      scrollElement.clientHeight;
    const isNearBottom = distanceFromBottom < 96;
    shouldStickToBottomRef.current = isNearBottom;
    setIsNearChatBottom(isNearBottom);

    if (isAutoScrollingRef.current) return;
  }

  function handleChatWheel(event: WheelEvent<HTMLDivElement>) {
    const scrollElement = chatScrollRef.current;
    if (!scrollElement) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-chat-scroll]")) return;
    if (target?.closest("[data-draft-input]")) return;

    scrollElement.scrollTop += event.deltaY;
    handleChatScroll();
  }

  function appendToAssistantVariant(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    patch: Partial<Pick<ChatAssistantVariant, "content" | "reasoning">>,
  ) {
    updateChatMessages(chatId, (currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== assistantMessageId || message.role !== "assistant") {
          return message;
        }

        return {
          ...message,
          variants: message.variants.map((variant) => {
            if (variant.id !== variantId) return variant;

            return {
              ...variant,
              content: patch.content
                ? variant.content + patch.content
                : variant.content,
              reasoning: patch.reasoning
                ? `${variant.reasoning ?? ""}${patch.reasoning}`
                : variant.reasoning,
            };
          }),
        };
      }),
    );
  }

  function updateAssistantVariant(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    updater: (variant: ChatAssistantVariant) => ChatAssistantVariant,
  ) {
    updateChatMessages(chatId, (currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== assistantMessageId || message.role !== "assistant") {
          return message;
        }

        return {
          ...message,
          variants: message.variants.map((variant) =>
            variant.id === variantId ? updater(variant) : variant,
          ),
        };
      }),
    );
  }

  function selectAssistantVariant(messageId: string, variantIndex: number) {
    updateActiveChatMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== messageId || message.role !== "assistant") {
          return message;
        }

        const safeIndex = Math.min(
          Math.max(variantIndex, 0),
          message.variants.length - 1,
        );

        return {
          ...message,
          activeVariantIndex: safeIndex,
        };
      }),
    );
  }

  function applyPreset(id: string) {
    const preset = providerPresets.find((item) => item.id === id);
    if (!preset) return;

    setProvider({
      ...preset,
      defaultSettings: {
        ...defaultGenerationSettings,
        ...(preset.defaultSettings ?? {}),
      },
      modelSettings: preset.modelSettings ?? {},
    });
    setModels([]);
    showSuccess("Provider preset loaded", preset.name);
  }

  function updateProviderSetting(patch: Partial<ProviderConfig>) {
    setProvider((currentProvider) => ({
      ...currentProvider,
      ...patch,
      id: patch.id ?? "custom",
    }));
  }

  function updateActiveModelSettings(patch: ProviderGenerationSettings) {
    setProvider((currentProvider) => {
      const modelKey = currentProvider.model.trim() || "__default__";
      const currentModelSettings = currentProvider.modelSettings?.[modelKey] ?? {};

      return {
        ...currentProvider,
        id: "custom",
        defaultSettings: {
          ...defaultGenerationSettings,
          ...(currentProvider.defaultSettings ?? {}),
        },
        modelSettings: {
          ...(currentProvider.modelSettings ?? {}),
          [modelKey]: sanitizeGenerationSettings({
            ...currentModelSettings,
            ...patch,
          }),
        },
      };
    });
  }

  function resetActiveModelSettings() {
    setProvider((currentProvider) => {
      const modelKey = currentProvider.model.trim() || "__default__";
      const nextModelSettings = { ...(currentProvider.modelSettings ?? {}) };
      delete nextModelSettings[modelKey];

      return {
        ...currentProvider,
        id: "custom",
        modelSettings: nextModelSettings,
      };
    });
  }

  function setTemporaryModelLoadStatus(status: "success" | "empty" | "error") {
    setModelLoadStatus(status);

    if (modelLoadStatusTimerRef.current !== null) {
      window.clearTimeout(modelLoadStatusTimerRef.current);
    }

    modelLoadStatusTimerRef.current = window.setTimeout(() => {
      setModelLoadStatus("idle");
      modelLoadStatusTimerRef.current = null;
    }, 1800);
  }

  async function saveSettingsChanges() {
    try {
      await Promise.all([
        saveProvider(provider),
        saveSystemPrompt(systemPrompt),
      ]);
      showSuccess("Settings saved.");
    } catch (error) {
      console.error("Failed to save settings:", error);
      showError("Failed to save settings", labelForError(error));
    }
  }

  function getLoadModelsButtonLabel() {
    if (isLoadingModels) return "Loading models...";
    if (modelLoadStatus === "success") {
      return `Loaded ${models.length} model${models.length === 1 ? "" : "s"}`;
    }
    if (modelLoadStatus === "empty") return "No models returned";
    if (modelLoadStatus === "error") return "Model lookup failed";

    return "Load models";
  }

  async function loadModelsFromProvider() {
    setIsLoadingModels(true);
    setModelLoadStatus("idle");

    if (modelLoadStatusTimerRef.current !== null) {
      window.clearTimeout(modelLoadStatusTimerRef.current);
      modelLoadStatusTimerRef.current = null;
    }

    try {
      const loadedModels = await loadProviderModels(provider);
      setModels(loadedModels);

      if (!provider.model.trim() && loadedModels.length > 0) {
        setProvider((currentProvider) => ({
          ...currentProvider,
          model: loadedModels[0],
        }));
      }

      setTemporaryModelLoadStatus(loadedModels.length ? "success" : "empty");
    } catch (error) {
      setTemporaryModelLoadStatus("error");
      console.error("Model lookup failed:", error);
    } finally {
      setIsLoadingModels(false);
    }
  }

  function validateProviderForGeneration() {
    if (!provider.baseUrl.trim()) {
      showError("Provider base URL is required.");
      setSettingsOpen(true);
      return false;
    }

    if (!provider.model.trim()) {
      showError(
        "Model name is required",
        "Load models or enter the model name manually.",
      );
      setSettingsOpen(true);
      return false;
    }

    return true;
  }

  async function runAssistantVariant({
    chatId,
    contextMessages,
    userMessage,
    assistantMessageId,
    variantId,
    responseStartedAtMs,
  }: {
    chatId: string;
    contextMessages: ChatMessage[];
    userMessage: string;
    assistantMessageId: string;
    variantId: string;
    responseStartedAtMs: number;
  }) {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsSending(true);
    toast.dismiss();

    try {
      const streamResult = await streamProviderChat({
        provider,
        systemPrompt,
        messages: contextMessages,
        userMessage,
        signal: controller.signal,
        onContentDelta: (delta) => {
          appendToAssistantVariant(chatId, assistantMessageId, variantId, {
            content: delta,
          });
        },
        onReasoningDelta: (delta) => {
          appendToAssistantVariant(chatId, assistantMessageId, variantId, {
            reasoning: delta,
          });
        },
      });

      const durationMs = Math.max(1, performance.now() - responseStartedAtMs);

      updateAssistantVariant(
        chatId,
        assistantMessageId,
        variantId,
        (variant) => ({
          ...variant,
          status: "done",
          metrics: {
            ...variant.metrics,
            completedAt: new Date().toISOString(),
            ...buildTokenMetrics({
              content: variant.content,
              durationMs,
              usage: streamResult.usage,
              provider,
              finishReason: streamResult.finishReason,
            }),
          },
        }),
      );
    } catch (error) {
      const wasAborted =
        error instanceof DOMException && error.name === "AbortError";

      const durationMs = Math.max(1, performance.now() - responseStartedAtMs);

      updateAssistantVariant(
        chatId,
        assistantMessageId,
        variantId,
        (variant) => {
          const currentContent = variant.content.trim();
          const content = wasAborted
            ? variant.content || "Generation stopped."
            : currentContent
              ? `${variant.content}\n\nError: ${labelForError(error)}`
              : `Error: ${labelForError(error)}`;

          return {
            ...variant,
            status: wasAborted ? "done" : "error",
            content,
            metrics: {
              ...variant.metrics,
              completedAt: new Date().toISOString(),
              ...buildTokenMetrics({
                content,
                durationMs,
                provider,
              }),
            },
          };
        },
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsSending(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();

    const userMessage = draft.trim();

    if (isSending) return;
    if (!activeChat) return;
    if (!validateProviderForGeneration()) return;

    if (!userMessage) {
      showError("Message is required.");
      return;
    }

    const userChatMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };

    const assistantMessageId = createId();
    const variantId = createId();
    const responseStartedAtMs = performance.now();
    const responseStartedAt = new Date().toISOString();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      variants: [
        {
          id: variantId,
          content: "",
          reasoning: "",
          status: "streaming",
          createdAt: responseStartedAt,
          metrics: {
            startedAt: responseStartedAt,
          },
        },
      ],
      activeVariantIndex: 0,
      createdAt: responseStartedAt,
    };

    const contextMessages = activeChat.messages;
    const nextMessages = [
      ...activeChat.messages,
      userChatMessage,
      assistantMessage,
    ];

    shouldStickToBottomRef.current = true;
    updateChat(activeChat.id, (chat) => ({
      ...chat,
      title:
        chat.messages.length === 0 && chat.title === "New chat"
          ? titleFromMessage(userMessage)
          : chat.title,
      messages: nextMessages,
      updatedAt: responseStartedAt,
    }));
    setDraft("");

    await runAssistantVariant({
      chatId: activeChat.id,
      contextMessages,
      userMessage,
      assistantMessageId,
      variantId,
      responseStartedAtMs,
    });
  }

  async function regenerateAssistantMessage(assistantMessageId: string) {
    if (isSending) return;
    if (!activeChat) return;
    if (!validateProviderForGeneration()) return;

    const assistantIndex = activeChat.messages.findIndex(
      (message) =>
        message.id === assistantMessageId && message.role === "assistant",
    );
    if (assistantIndex < 0) return;

    let userIndex = -1;
    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
      if (activeChat.messages[index]?.role === "user") {
        userIndex = index;
        break;
      }
    }

    const userMessageSource = activeChat.messages[userIndex];
    if (!userMessageSource || userMessageSource.role !== "user") {
      showError("Could not find the user message to regenerate from.");
      return;
    }

    const userMessage = userMessageSource.content;
    const contextMessages = activeChat.messages.slice(0, userIndex);
    const variantId = createId();
    const responseStartedAtMs = performance.now();
    const responseStartedAt = new Date().toISOString();

    updateActiveChatMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== assistantMessageId || message.role !== "assistant") {
          return message;
        }

        return {
          ...message,
          variants: [
            ...message.variants,
            {
              id: variantId,
              content: "",
              reasoning: "",
              status: "streaming",
              createdAt: responseStartedAt,
              metrics: {
                startedAt: responseStartedAt,
              },
            },
          ],
          activeVariantIndex: message.variants.length,
        };
      }),
    );

    shouldStickToBottomRef.current = true;

    await runAssistantVariant({
      chatId: activeChat.id,
      contextMessages,
      userMessage,
      assistantMessageId,
      variantId,
      responseStartedAtMs,
    });
  }

  async function continueAssistantMessage(assistantMessageId: string) {
    if (isSending) return;
    if (!activeChat) return;
    if (!validateProviderForGeneration()) return;

    const assistantIndex = activeChat.messages.findIndex(
      (message) =>
        message.id === assistantMessageId && message.role === "assistant",
    );
    const assistantMessage = activeChat.messages[assistantIndex];

    if (assistantIndex < 0 || !assistantMessage || assistantMessage.role !== "assistant") {
      return;
    }

    const activeVariant = getActiveVariant(assistantMessage);
    if (!activeVariant?.content.trim()) {
      showError("There is no answer to continue.");
      return;
    }

    const responseStartedAtMs = performance.now();
    const responseStartedAt = new Date().toISOString();
    const contextMessages = activeChat.messages.slice(0, assistantIndex + 1);
    const continuePrompt = "Continue from exactly where your previous answer stopped. Do not repeat the previous text.";

    updateAssistantVariant(
      activeChat.id,
      assistantMessageId,
      activeVariant.id,
      (variant) => ({
        ...variant,
        status: "streaming",
        metrics: {
          ...variant.metrics,
          startedAt: responseStartedAt,
          completedAt: undefined,
        },
      }),
    );

    shouldStickToBottomRef.current = true;

    await runAssistantVariant({
      chatId: activeChat.id,
      contextMessages,
      userMessage: continuePrompt,
      assistantMessageId,
      variantId: activeVariant.id,
      responseStartedAtMs,
    });
  }

  function stopGeneration() {
    abortControllerRef.current?.abort();
  }

  async function createNewChat() {
    const chat = createEmptyChat();
    setChats((currentChats) => [chat, ...currentChats]);
    setActiveChatId(chat.id);
    setDraft("");
    setExpandedReasoningIds({});
    setExpandedMetricsIds({});
    shouldStickToBottomRef.current = true;

    try {
      await saveChat(chat);
      await saveActiveChatId(chat.id);
    } catch (error) {
      console.error("Failed to save new chat:", error);
    }
  }

  async function switchChat(chatId: string) {
    setActiveChatId(chatId);
    setDraft("");
    setExpandedReasoningIds({});
    setExpandedMetricsIds({});
    shouldStickToBottomRef.current = true;
  }

  async function clearCurrentChat() {
    if (!activeChat) return;

    if (isSending) stopGeneration();

    const now = new Date().toISOString();
    updateChat(activeChat.id, (chat) => ({
      ...chat,
      title: "New chat",
      messages: [],
      updatedAt: now,
    }));
    setExpandedReasoningIds({});
    setExpandedMetricsIds({});
    showSuccess("Chat cleared.");
  }

  async function removeChat(chatId: string) {
    if (isSending) stopGeneration();

    const remainingChats = sortChatsByUpdatedAt(
      chats.filter((chat) => chat.id !== chatId),
    );
    const nextChats =
      remainingChats.length > 0 ? remainingChats : [createEmptyChat()];
    const nextActiveId =
      activeChatId === chatId
        ? nextChats[0].id
        : (activeChatId ?? nextChats[0].id);

    setChats(nextChats);
    setActiveChatId(nextActiveId);
    setExpandedReasoningIds({});
    setExpandedMetricsIds({});

    try {
      await deleteChat(chatId);
      if (remainingChats.length === 0) {
        await saveChat(nextChats[0]);
      }
      await saveActiveChatId(nextActiveId);
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  }

  if (!mounted) {
    return (
      <main className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
        Loading...
      </main>
    );
  }

  return (
    <main className="flex h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <aside
        data-sidebar
        className="flex w-96 shrink-0 flex-col border-r bg-card/80"
      >
        <div className="border-b py-3 pl-3 pr-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-5">
                Chat Forge
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {provider.model.trim() || "No model selected"}
              </p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 rounded-none"
                  title="Menu"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-none">
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <Settings className="size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setTheme(resolvedTheme === "dark" ? "light" : "dark")
                  }
                >
                  {resolvedTheme === "dark" ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                  {resolvedTheme === "dark" ? "Light theme" : "Dark theme"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearCurrentChat}>
                  <Trash2 className="size-4" />
                  Clear current chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 chat-scrollbar">
          <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Chats
          </div>
          <div className="grid gap-1.5">
            {sortedChats.map((chat) => (
              <div
                key={chat.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "group flex min-w-0 cursor-pointer items-center gap-1 border px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  chat.id === activeChat?.id
                    ? "border-primary/30 bg-accent text-accent-foreground"
                    : "border-transparent hover:border-border hover:bg-muted/60",
                )}
                onClick={() => switchChat(chat.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    switchChat(chat.id);
                  }
                }}
                title={chat.title}
              >
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm leading-5">
                    {chat.title}
                  </div>
                  <div className="truncate text-[11px] leading-4 text-muted-foreground">
                    {chat.messages.length} message
                    {chat.messages.length === 1 ? "" : "s"}
                    {" · "}
                    {formatChatActivityDate(getLastChatActivityDate(chat))}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7 shrink-0 rounded-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeChat(chat.id);
                  }}
                  title="Delete chat"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-2 border-t p-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center rounded-none"
            onClick={createNewChat}
            title="New chat (Ctrl+N)"
          >
            <Plus className="size-4" />
            New chat
          </Button>
        </div>
      </aside>

      <section className="relative grid min-h-0 flex-1 grid-rows-[1fr_auto] bg-background">
        <div className="min-h-0 overflow-hidden" onWheel={handleChatWheel}>
          <div
            ref={chatScrollRef}
            data-chat-scroll
            onScroll={handleChatScroll}
            className="chat-scrollbar mx-auto h-full w-full max-w-3xl overflow-y-auto py-3 md:py-6"
          >
            <div className="flex flex-col gap-4">
              {messages.length === 0 ? (
                <div className="flex min-h-[calc(100dvh-12rem)] items-center justify-center">
                  <div className="max-w-md border bg-card p-6 text-center shadow-xs">
                    <h2 className="text-base font-semibold">
                      Start a conversation
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Configure a provider, choose a model, and send your first
                      message. Chats are stored locally in IndexedDB.
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button
                        className="rounded-none"
                        variant="secondary"
                        onClick={() => setSettingsOpen(true)}
                      >
                        <Settings className="size-4" />
                        Open settings
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message) => {
                  const activeVariant =
                    message.role === "assistant"
                      ? getActiveVariant(message)
                      : undefined;
                  const content =
                    message.role === "assistant"
                      ? (activeVariant?.content ?? "")
                      : message.content;
                  const reasoning = activeVariant?.reasoning ?? "";
                  const status = activeVariant?.status;
                  const metrics = activeVariant?.metrics;
                  const variantCount =
                    message.role === "assistant" ? message.variants.length : 0;
                  const activeVariantNumber =
                    message.role === "assistant"
                      ? message.activeVariantIndex + 1
                      : 0;

                  return (
                    <div key={message.id} className="grid gap-2">
                      {message.role === "assistant" &&
                        reasoning.trim() &&
                        (() => {
                          const isExpanded = Boolean(
                            expandedReasoningIds[message.id],
                          );
                          const reasoningLineCount = reasoning
                            .trimEnd()
                            .split(/\r?\n/).length;
                          const canToggle = reasoningLineCount > 6;

                          return (
                            <article className="flex justify-start">
                              <div className="w-full border border-dashed bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground shadow-xs [overflow-wrap:anywhere]">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <div className="text-xs font-medium uppercase tracking-wide">
                                    Thinking
                                    {status === "streaming" ? "..." : ""}
                                  </div>
                                  {canToggle && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 rounded-none px-2 text-xs text-muted-foreground"
                                      onClick={() =>
                                        toggleReasoning(message.id)
                                      }
                                    >
                                      {isExpanded ? (
                                        <>
                                          <ChevronUp className="size-3" />
                                          Shrink
                                        </>
                                      ) : (
                                        <>
                                          <ChevronDown className="size-3" />
                                          Expand
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                                <div
                                  className={cn(
                                    "min-w-0 text-xs leading-5",
                                    isExpanded
                                      ? "max-h-[32rem] overflow-y-auto overflow-x-hidden pr-1"
                                      : "flex max-h-40 flex-col justify-end overflow-hidden",
                                  )}
                                >
                                  <MarkdownMessage
                                    content={reasoning}
                                    className="chat-markdown-compact shrink-0"
                                  />
                                </div>
                              </div>
                            </article>
                          );
                        })()}

                      {(content ||
                        message.role !== "assistant" ||
                        status !== "streaming") && (
                        <article
                          className={cn(
                            "flex",
                            message.role === "user"
                              ? "justify-end"
                              : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "min-w-0 overflow-hidden text-sm leading-6 [overflow-wrap:anywhere]",
                              message.role === "user"
                                ? "max-w-[85%] border bg-primary px-4 py-3 text-primary-foreground shadow-xs"
                                : "w-full max-w-full border bg-card px-4 py-3 text-card-foreground shadow-xs",
                              status === "error" && "border-destructive/50",
                            )}
                          >
                            {message.role === "assistant" ? (
                              <MarkdownMessage content={content} />
                            ) : (
                              <div className="whitespace-pre-wrap">
                                {message.content}
                              </div>
                            )}
                          </div>
                        </article>
                      )}

                      {message.role === "assistant" && (
                        <div className="grid gap-2 text-[11px] leading-4 text-muted-foreground">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                            <button
                              type="button"
                              className="min-h-6 text-left hover:text-foreground disabled:pointer-events-none"
                              disabled={metrics?.durationMs === undefined}
                              onClick={() => toggleMetrics(message.id)}
                              title="Show generation details"
                            >
                              {metrics?.durationMs !== undefined
                                ? formatTokenMetrics(metrics)
                                : status === "streaming"
                                  ? "Generating..."
                                  : ""}
                            </button>

                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {variantCount > 1 && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-6 w-6 rounded-none text-muted-foreground"
                                    onClick={() =>
                                      selectAssistantVariant(
                                        message.id,
                                        message.activeVariantIndex - 1,
                                      )
                                    }
                                    disabled={
                                      message.activeVariantIndex <= 0 || isSending
                                    }
                                    title="Previous answer"
                                  >
                                    <ChevronLeft className="size-3.5" />
                                  </Button>
                                  <span className="min-w-9 text-center tabular-nums">
                                    {activeVariantNumber}/{variantCount}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-6 w-6 rounded-none text-muted-foreground"
                                    onClick={() =>
                                      selectAssistantVariant(
                                        message.id,
                                        message.activeVariantIndex + 1,
                                      )
                                    }
                                    disabled={
                                      message.activeVariantIndex >=
                                        variantCount - 1 || isSending
                                    }
                                    title="Next answer"
                                  >
                                    <ChevronRight className="size-3.5" />
                                  </Button>
                                </div>
                              )}

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 rounded-none px-2 text-xs text-muted-foreground"
                                onClick={() =>
                                  regenerateAssistantMessage(message.id)
                                }
                                disabled={isSending}
                                title={status === "error" ? "Retry answer" : "Regenerate answer"}
                              >
                                <RefreshCcw className="size-3" />
                                {status === "error" ? "Retry" : "Regenerate"}
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 rounded-none px-2 text-xs text-muted-foreground"
                                onClick={() => continueAssistantMessage(message.id)}
                                disabled={isSending || !content.trim()}
                                title="Continue answer"
                              >
                                Continue
                              </Button>
                            </div>
                          </div>

                          {metrics?.durationMs !== undefined &&
                            expandedMetricsIds[message.id] && (
                              <div className="grid gap-1 border bg-muted/30 p-2">
                                {formatMetricDetails(metrics).map(([label, value]) => (
                                  <div
                                    key={label}
                                    className="grid grid-cols-[8rem_1fr] gap-2"
                                  >
                                    <span className="text-muted-foreground/80">
                                      {label}
                                    </span>
                                    <span className="min-w-0 truncate text-foreground/80">
                                      {value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {!isNearChatBottom && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute bottom-32 left-1/2 z-10 -translate-x-1/2 rounded-none shadow-md"
            onClick={() => scrollChatToBottom()}
          >
            <ChevronDown className="size-4" />
            Scroll to bottom
          </Button>
        )}

        <form
          onSubmit={sendMessage}
          className="bg-background px-3 py-3 md:px-4 md:py-4"
          data-draft-input
        >
          <div className="mx-auto w-full max-w-3xl border bg-card p-3 pt-0 shadow-sm">
            <div className="mx-auto grid w-full max-w-3xl gap-2">
              <Textarea
                ref={draftTextareaRef}
                value={draft}
                rows={3}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;

                  if (event.shiftKey) return;

                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
                placeholder="Type your message... Enter to send, Shift+Enter for newline"
                className="min-h-[5.5rem] resize-none border-0 !bg-transparent px-1 shadow-none leading-6 focus-visible:ring-0"
              />
              <div className="flex justify-end">
                {isSending ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={stopGeneration}
                    className="shrink-0 rounded-none"
                    title="Stop generation"
                  >
                    <Square className="size-4" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!canSend}
                    className="shrink-0 rounded-none"
                    title="Send message"
                  >
                    <Send className="size-4" />
                    Send
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </section>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="flex h-[min(760px,calc(100dvh-2rem))] max-h-none flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="h-[96px] shrink-0 overflow-hidden border-b px-5 py-4 pr-12">
            <DialogTitle>Provider settings</DialogTitle>
            <DialogDescription>
              Configure any OpenAI-compatible endpoint. Requests are routed
              through the local app API to avoid browser CORS issues.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="grid gap-5 pb-1">
              <div className="grid gap-2">
                <Label>Preset</Label>
                <Select value={provider.id} onValueChange={applyPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {providerPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="provider-name">Name</Label>
                  <Input
                    id="provider-name"
                    value={provider.name}
                    onChange={(event) =>
                      setProvider({
                        ...provider,
                        id: "custom",
                        name: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="provider-model">Model</Label>
                  <Input
                    id="provider-model"
                    value={provider.model}
                    onChange={(event) =>
                      setProvider({
                        ...provider,
                        id: "custom",
                        model: event.target.value,
                      })
                    }
                    placeholder="qwen/qwen3.5-9b"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="provider-url">Base URL</Label>
                <Input
                  id="provider-url"
                  value={provider.baseUrl}
                  onChange={(event) =>
                    setProvider({
                      ...provider,
                      id: "custom",
                      baseUrl: event.target.value,
                    })
                  }
                  placeholder="http://localhost:1234/v1"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="provider-api-key">API key</Label>
                <div className="relative">
                  <Input
                    id="provider-api-key"
                    value={provider.apiKey}
                    onChange={(event) =>
                      setProvider({
                        ...provider,
                        id: "custom",
                        apiKey: event.target.value,
                      })
                    }
                    placeholder="not-needed"
                    type={isApiKeyVisible ? "text" : "password"}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-none text-muted-foreground"
                    onClick={() => setIsApiKeyVisible((current) => !current)}
                    title={isApiKeyVisible ? "Hide API key" : "Show API key"}
                  >
                    {isApiKeyVisible ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="provider-custom-headers">Custom headers</Label>
                <Textarea
                  id="provider-custom-headers"
                  value={provider.customHeaders ?? ""}
                  onChange={(event) =>
                    updateProviderSetting({
                      customHeaders: event.target.value,
                    })
                  }
                  placeholder={"Header-Name: value\nX-Company-Gateway: team-ai"}
                  className="min-h-24 font-mono text-xs leading-5"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  One header per line. Authorization is still generated from the API key field.
                </p>
              </div>

              <Separator />

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Generation settings for current model</Label>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Saved per model. Leave numeric fields empty to use provider defaults.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-none"
                    onClick={resetActiveModelSettings}
                  >
                    Reset
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="generation-temperature">Temperature</Label>
                    <Input
                      id="generation-temperature"
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={formatOptionalNumber(activeModelSettings.temperature)}
                      onChange={(event) =>
                        updateActiveModelSettings({
                          temperature: parseOptionalNumber(event.target.value),
                        })
                      }
                      placeholder="Provider default"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="generation-top-p">Top P</Label>
                    <Input
                      id="generation-top-p"
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={formatOptionalNumber(activeModelSettings.topP)}
                      onChange={(event) =>
                        updateActiveModelSettings({
                          topP: parseOptionalNumber(event.target.value),
                        })
                      }
                      placeholder="Provider default"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="generation-max-tokens">Max tokens</Label>
                    <Input
                      id="generation-max-tokens"
                      type="number"
                      min="1"
                      step="1"
                      value={formatOptionalNumber(activeModelSettings.maxTokens)}
                      onChange={(event) =>
                        updateActiveModelSettings({
                          maxTokens: parseOptionalNumber(event.target.value),
                        })
                      }
                      placeholder="Provider default"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Thinking controls</Label>
                    <Select
                      value={activeModelSettings.reasoningMode ?? "auto"}
                      onValueChange={(reasoningMode) =>
                        updateActiveModelSettings({
                          reasoningMode: reasoningMode as ProviderGenerationSettings["reasoningMode"],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                        <SelectItem value="enabled">Force enabled</SelectItem>
                        <SelectItem value="off">Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Reasoning effort</Label>
                    <Select
                      value={activeModelSettings.reasoningEffort ?? "medium"}
                      onValueChange={(reasoningEffort) =>
                        updateActiveModelSettings({
                          reasoningEffort: reasoningEffort as ProviderGenerationSettings["reasoningEffort"],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="generation-timeout">Request timeout, ms</Label>
                    <Input
                      id="generation-timeout"
                      type="number"
                      min="1000"
                      step="1000"
                      value={formatOptionalNumber(activeModelSettings.requestTimeoutMs)}
                      onChange={(event) =>
                        updateActiveModelSettings({
                          requestTimeoutMs: parseOptionalNumber(event.target.value),
                        })
                      }
                      placeholder="30000"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={loadModelsFromProvider}
                disabled={isLoadingModels || !provider.baseUrl.trim()}
                className="w-full rounded-none"
              >
                <RefreshCcw
                  className={cn("size-4", isLoadingModels && "animate-spin")}
                />
                {getLoadModelsButtonLabel()}
              </Button>

              {models.length > 0 && (
                <div className="grid gap-2">
                  <Label>Detected models</Label>
                  <Select
                    value={provider.model}
                    onValueChange={(model) =>
                      setProvider({ ...provider, id: "custom", model })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              <div className="grid gap-2">
                <Label htmlFor="system-prompt">System prompt</Label>
                <Textarea
                  id="system-prompt"
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  className="min-h-32 leading-6"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="h-[72px] shrink-0 items-center border-t px-5 py-3">
            <Button
              type="button"
              variant="secondary"
              className="rounded-none"
              onClick={() =>
                setProvider({
                  ...defaultProvider,
                  defaultSettings: defaultGenerationSettings,
                  modelSettings: {},
                })
              }
            >
              Reset provider
            </Button>
            <Button
              type="button"
              className="rounded-none"
              onClick={saveSettingsChanges}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
