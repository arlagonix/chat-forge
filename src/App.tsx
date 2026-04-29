"use client";

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Copy,
  Eye,
  EyeOff,
  Moon,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCcw,
  Send,
  Settings,
  Square,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import type {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent,
} from "react";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { MarkdownMessage } from "@/components/ai-chat/markdown-message";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  loadCachedProviderModels,
  loadChats,
  loadProvider,
  loadSystemPrompt,
  saveActiveChatId,
  saveCachedProviderModels,
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
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
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
    Object.entries(settings).filter(([, value]) => {
      if (value === undefined) return false;
      if (typeof value === "string") return value.trim().length > 0;
      return true;
    }),
  ) as ProviderGenerationSettings;
}

function getSettingsForProvider(provider: ProviderConfig) {
  return getActiveModelSettings(provider);
}

function formatMetricDetails(
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

const AssistantMessageContent = memo(function AssistantMessageContent({
  content,
  className,
  isStreaming = false,
}: {
  content: string;
  className?: string;
  isStreaming?: boolean;
}) {
  return (
    <MarkdownMessage
      content={content}
      className={className}
      isStreaming={isStreaming}
    />
  );
});

const UserMessageEditor = memo(function UserMessageEditor({
  initialContent,
  disabled,
  onCancel,
  onSave,
}: {
  initialContent: string;
  disabled: boolean;
  onCancel: () => void;
  onSave: (content: string) => void | Promise<void>;
}) {
  const [content, setContent] = useState(initialContent);
  const trimmedContent = content.trim();

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  function handleSave() {
    if (disabled || !trimmedContent) return;

    void onSave(content);
  }

  return (
    <div className="grid gap-2">
      <article className="flex justify-end">
        <div className="min-w-0 w-full max-w-[85%] overflow-hidden bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-xs [overflow-wrap:anywhere]">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }

              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                handleSave();
              }
            }}
            autoFocus
            disabled={disabled}
            className="min-h-32 w-full resize-y rounded-none border-0 bg-transparent p-0 text-primary-foreground shadow-none outline-none placeholder:text-primary-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-80"
          />
        </div>
      </article>

      <div className="flex justify-end gap-1.5 text-[11px] leading-4 text-muted-foreground">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 rounded-none px-2 text-xs text-muted-foreground"
          onClick={handleSave}
          disabled={disabled || !trimmedContent}
          title="Save edit and regenerate"
        >
          <Check className="size-3" />
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 rounded-none px-2 text-xs text-muted-foreground"
          onClick={onCancel}
          disabled={disabled}
          title="Cancel edit"
        >
          <X className="size-3" />
          Cancel
        </Button>
      </div>
    </div>
  );
});

type ChatComposerHandle = {
  clear: () => void;
  focus: () => void;
};

const ChatComposer = memo(
  forwardRef<
    ChatComposerHandle,
    {
      disabled: boolean;
      isSending: boolean;
      onSend: (content: string) => Promise<boolean> | boolean;
      onStop: () => void;
    }
  >(function ChatComposer({ disabled, isSending, onSend, onStop }, ref) {
    const [draft, setDraft] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const trimmedDraft = draft.trim();
    const canSend = !disabled && !isSending && trimmedDraft.length > 0;

    const focusTextarea = useCallback(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const textarea = textareaRef.current;
          if (!textarea) return;

          textarea.focus({ preventScroll: true });

          const cursorPosition = textarea.value.length;
          textarea.setSelectionRange(cursorPosition, cursorPosition);
        });
      });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        clear: () => setDraft(""),
        focus: focusTextarea,
      }),
      [focusTextarea],
    );

    useEffect(() => {
      const textarea = textareaRef.current;
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

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!canSend) return;

      const wasSent = await onSend(draft);
      if (wasSent) setDraft("");
    }

    return (
      <form
        onSubmit={handleSubmit}
        className="bg-background px-3 py-3 md:px-4 md:py-4"
        data-draft-input
      >
        <div className="mx-auto w-full max-w-3xl border bg-card p-3 pt-0 shadow-sm">
          <div className="mx-auto grid w-full max-w-3xl gap-2">
            <Textarea
              ref={textareaRef}
              value={draft}
              rows={3}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;

                if (event.shiftKey) return;

                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              placeholder="Type a message..."
              className="min-h-[5.5rem] resize-none border-0 !bg-transparent px-1 leading-6 shadow-none focus-visible:ring-0"
            />
            <div className="flex justify-end">
              {isSending ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onStop}
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
    );
  }),
);

type StreamBuffer = {
  chatId: string;
  assistantMessageId: string;
  variantId: string;
  content: string;
  reasoning: string;
};

type ActiveGeneration = {
  controller: AbortController;
  assistantMessageId: string;
  variantId: string;
};

type MessageContextMenuState = {
  messageId: string;
  x: number;
  y: number;
  linkHref: string | null;
  selectedText: string;
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [provider, setProvider] = useState<ProviderConfig>(defaultProvider);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant.",
  );
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | undefined>();
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [generatingChatIds, setGeneratingChatIds] = useState<string[]>([]);
  const [streamingAssistantByChatId, setStreamingAssistantByChatId] = useState<
    Record<string, string>
  >({});
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelLoadStatus, setModelLoadStatus] = useState<
    "idle" | "success" | "empty" | "error"
  >("idle");
  const [models, setModels] = useState<string[]>([]);
  const [isModelComboboxOpen, setIsModelComboboxOpen] = useState(false);
  const [modelSearchValue, setModelSearchValue] = useState("");
  const [messageContextMenu, setMessageContextMenu] =
    useState<MessageContextMenuState | null>(null);
  const [isSidebarModelComboboxOpen, setIsSidebarModelComboboxOpen] =
    useState(false);
  const [sidebarModelSearchValue, setSidebarModelSearchValue] = useState("");
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<
    Record<string, boolean>
  >({});
  const [expandedMetricsIds, setExpandedMetricsIds] = useState<
    Record<string, boolean>
  >({});
  const [isNearChatBottom, setIsNearChatBottom] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const messageElementRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingAssistantScrollRef = useRef<string | null>(null);
  const chatComposerRef = useRef<ChatComposerHandle | null>(null);
  const generationRefs = useRef<Record<string, ActiveGeneration>>({});
  const modelLoadStatusTimerRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollStateFrameRef = useRef<number | null>(null);
  const scrollSettleTimeoutRef = useRef<number | null>(null);
  const userScrollTimeoutRef = useRef<number | null>(null);
  const streamBuffersRef = useRef<Record<string, StreamBuffer>>({});
  const streamFlushTimeoutRefs = useRef<Record<string, number>>({});
  const isAutoScrollingRef = useRef(false);
  const isUserScrollingRef = useRef(false);
  const isStreamingRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);
  const lastScrollStateRef = useRef(true);
  const didHydrateRef = useRef(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (!messageContextMenu) return;

    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;

      if (target?.closest("[data-message-context-menu]")) {
        return;
      }

      closeMessageContextMenu();
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMessageContextMenu();
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [messageContextMenu]);

  function focusDraftTextarea() {
    chatComposerRef.current?.focus();
  }

  const sortedChats = useMemo(() => sortChatsByUpdatedAt(chats), [chats]);

  const activeChat = useMemo(() => {
    return (
      sortedChats.find((chat) => chat.id === activeChatId) ?? sortedChats[0]
    );
  }, [activeChatId, sortedChats]);

  const messages = activeChat?.messages ?? [];
  const activeChatModel = activeChat?.model?.trim() || provider.model.trim();
  const isSending = activeChat
    ? generatingChatIds.includes(activeChat.id)
    : false;
  const activeModelSettings = getSettingsForProvider({
    ...provider,
    model: activeChatModel || provider.model,
  });
  const modelSuggestions = useMemo(() => {
    const normalizedModels = [
      ...new Set(
        [...models, provider.model, activeChatModel]
          .map((model) => model.trim())
          .filter(Boolean),
      ),
    ];

    return normalizedModels.sort((left, right) => left.localeCompare(right));
  }, [models, provider.model, activeChatModel]);

  const filteredModelSuggestions = useMemo(() => {
    const search = modelSearchValue.trim().toLowerCase();
    if (!search) return modelSuggestions;

    return modelSuggestions.filter((model) =>
      model.toLowerCase().includes(search),
    );
  }, [modelSearchValue, modelSuggestions]);

  const trimmedModelSearchValue = modelSearchValue.trim();
  const canUseCustomModel =
    trimmedModelSearchValue.length > 0 &&
    !modelSuggestions.some(
      (model) => model.toLowerCase() === trimmedModelSearchValue.toLowerCase(),
    );

  const filteredSidebarModelSuggestions = useMemo(() => {
    const search = sidebarModelSearchValue.trim().toLowerCase();
    if (!search) return modelSuggestions;

    return modelSuggestions.filter((model) =>
      model.toLowerCase().includes(search),
    );
  }, [sidebarModelSearchValue, modelSuggestions]);

  const trimmedSidebarModelSearchValue = sidebarModelSearchValue.trim();
  const canUseCustomSidebarModel =
    trimmedSidebarModelSearchValue.length > 0 &&
    !modelSuggestions.some(
      (model) =>
        model.toLowerCase() === trimmedSidebarModelSearchValue.toLowerCase(),
    );

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
          const chat = {
            ...createEmptyChat(),
            model: loadedProvider.model.trim(),
          };
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

        const loadedModels = await loadCachedProviderModels(loadedProvider);
        if (cancelled) return;

        setProvider(loadedProvider);
        setModels(loadedModels);
        setSystemPrompt(loadedSystemPrompt);
        setChats(nextChats);
        setActiveChatId(nextActiveChatId);
        didHydrateRef.current = true;
        setMounted(true);
      } catch (error) {
        console.error("Failed to load app data from IndexedDB:", error);
        const fallbackChat = {
          ...createEmptyChat(),
          model: defaultProvider.model.trim(),
        };
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
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      if (scrollStateFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollStateFrameRef.current);
      }
      if (scrollSettleTimeoutRef.current !== null) {
        window.clearTimeout(scrollSettleTimeoutRef.current);
      }
      if (userScrollTimeoutRef.current !== null) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }
      Object.values(streamFlushTimeoutRefs.current).forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
      Object.values(generationRefs.current).forEach((generation) =>
        generation.controller.abort(),
      );
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

    let cancelled = false;

    loadCachedProviderModels(provider)
      .then((cachedModels) => {
        if (!cancelled) setModels(cachedModels);
      })
      .catch((error) => console.error("Failed to load cached models:", error));

    return () => {
      cancelled = true;
    };
  }, [provider.baseUrl, provider.customHeaders]);

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

  function getChatDistanceFromBottom() {
    const scrollElement = chatScrollRef.current;
    if (!scrollElement) return 0;

    return Math.max(
      0,
      scrollElement.scrollHeight -
        scrollElement.scrollTop -
        scrollElement.clientHeight,
    );
  }

  function isChatNearBottom(threshold = 140) {
    return getChatDistanceFromBottom() <= threshold;
  }

  function updateNearBottomState(isNearBottom: boolean) {
    if (lastScrollStateRef.current === isNearBottom) return;

    lastScrollStateRef.current = isNearBottom;
    setIsNearChatBottom(isNearBottom);
  }

  function markUserScrolling() {
    isUserScrollingRef.current = true;

    if (userScrollTimeoutRef.current !== null) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }

    userScrollTimeoutRef.current = window.setTimeout(() => {
      isUserScrollingRef.current = false;
      userScrollTimeoutRef.current = null;
    }, 180);
  }

  function scrollToBottomNow() {
    const bottomElement = chatBottomRef.current;
    const scrollElement = chatScrollRef.current;
    if (!bottomElement || !scrollElement) return;

    isAutoScrollingRef.current = true;
    bottomElement.scrollIntoView({ block: "end", behavior: "auto" });
    scrollElement.scrollTop = Math.max(
      0,
      scrollElement.scrollHeight - scrollElement.clientHeight,
    );
    updateNearBottomState(true);

    window.requestAnimationFrame(() => {
      isAutoScrollingRef.current = false;
    });
  }

  const scheduleChatScrollToBottom = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;

      if (!shouldStickToBottomRef.current) return;

      scrollToBottomNow();

      window.requestAnimationFrame(() => {
        if (shouldStickToBottomRef.current) scrollToBottomNow();
      });

      if (scrollSettleTimeoutRef.current !== null) {
        window.clearTimeout(scrollSettleTimeoutRef.current);
      }

      scrollSettleTimeoutRef.current = window.setTimeout(() => {
        scrollSettleTimeoutRef.current = null;
        if (shouldStickToBottomRef.current) scrollToBottomNow();
      }, 60);
    });
  }, []);

  const scrollAssistantIntoView = useCallback((messageId: string) => {
    const messageElement = messageElementRefs.current.get(messageId);
    if (!messageElement) {
      pendingAssistantScrollRef.current = messageId;
      return;
    }

    isAutoScrollingRef.current = true;
    messageElement.scrollIntoView({ block: "start", behavior: "auto" });

    window.requestAnimationFrame(() => {
      isAutoScrollingRef.current = false;
    });
  }, []);

  function registerMessageElement(messageId: string) {
    return (element: HTMLDivElement | null) => {
      if (element) {
        messageElementRefs.current.set(messageId, element);

        if (pendingAssistantScrollRef.current === messageId) {
          pendingAssistantScrollRef.current = null;
          window.requestAnimationFrame(() =>
            scrollAssistantIntoView(messageId),
          );
        }
      } else {
        messageElementRefs.current.delete(messageId);
      }
    };
  }

  useLayoutEffect(() => {
    const pendingAssistantMessageId = pendingAssistantScrollRef.current;

    if (pendingAssistantMessageId) {
      pendingAssistantScrollRef.current = null;
      scrollAssistantIntoView(pendingAssistantMessageId);
    } else if (shouldStickToBottomRef.current) {
      scheduleChatScrollToBottom();
    }
  }, [messages, scheduleChatScrollToBottom, scrollAssistantIntoView]);

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
    options: { touch?: boolean } = {},
  ) {
    const shouldTouch = options.touch ?? true;

    updateChat(chatId, (chat) => ({
      ...chat,
      messages: updater(chat.messages),
      ...(shouldTouch ? { updatedAt: new Date().toISOString() } : {}),
    }));
  }

  function updateActiveChatMessages(
    updater: (messages: ChatMessage[]) => ChatMessage[],
    options: { touch?: boolean } = {},
  ) {
    if (!activeChatId) return;
    updateChatMessages(activeChatId, updater, options);
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

  function scrollChatToBottom() {
    shouldStickToBottomRef.current = true;
    updateNearBottomState(true);
    scheduleChatScrollToBottom();
  }

  function handleChatScroll() {
    closeMessageContextMenu();

    if (scrollStateFrameRef.current !== null) return;

    scrollStateFrameRef.current = window.requestAnimationFrame(() => {
      scrollStateFrameRef.current = null;

      if (isAutoScrollingRef.current) return;

      const isNearBottom = isChatNearBottom();
      updateNearBottomState(isNearBottom);

      if (isNearBottom) {
        shouldStickToBottomRef.current = true;
      } else if (!isStreamingRef.current || isUserScrollingRef.current) {
        shouldStickToBottomRef.current = false;
      }
    });
  }

  function handleChatWheel(event: WheelEvent<HTMLDivElement>) {
    closeMessageContextMenu();

    if (isAutoScrollingRef.current) return;

    markUserScrolling();

    if (event.deltaY < 0) {
      shouldStickToBottomRef.current = false;
      updateNearBottomState(false);
      return;
    }

    window.requestAnimationFrame(() => {
      const isNearBottom = isChatNearBottom();
      if (isNearBottom) {
        shouldStickToBottomRef.current = true;
        scheduleChatScrollToBottom();
      }
      updateNearBottomState(isNearBottom);
    });
  }

  function handleChatPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;

    if (!target?.closest("[data-message-context-menu]")) {
      closeMessageContextMenu();
    }

    if (isAutoScrollingRef.current) return;
    markUserScrolling();
  }

  function appendToAssistantVariant(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    patch: Partial<Pick<ChatAssistantVariant, "content" | "reasoning">>,
  ) {
    updateChatMessages(
      chatId,
      (currentMessages) =>
        currentMessages.map((message) => {
          if (
            message.id !== assistantMessageId ||
            message.role !== "assistant"
          ) {
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
      { touch: false },
    );
  }

  function getStreamBufferKey(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
  ) {
    return `${chatId}:${assistantMessageId}:${variantId}`;
  }

  function flushBufferedAssistantVariant(bufferKey: string) {
    const buffered = streamBuffersRef.current[bufferKey];
    if (!buffered || (!buffered.content && !buffered.reasoning)) return;

    streamBuffersRef.current[bufferKey] = {
      ...buffered,
      content: "",
      reasoning: "",
    };

    appendToAssistantVariant(
      buffered.chatId,
      buffered.assistantMessageId,
      buffered.variantId,
      {
        content: buffered.content || undefined,
        reasoning: buffered.reasoning || undefined,
      },
    );

    if (buffered.chatId === activeChatId && shouldStickToBottomRef.current) {
      scheduleChatScrollToBottom();
    }
  }

  function flushAllBufferedAssistantVariants() {
    Object.keys(streamBuffersRef.current).forEach((bufferKey) => {
      flushBufferedAssistantVariant(bufferKey);
    });
  }

  function scheduleBufferedAssistantFlush(bufferKey: string) {
    if (streamFlushTimeoutRefs.current[bufferKey] !== undefined) return;

    streamFlushTimeoutRefs.current[bufferKey] = window.setTimeout(
      () => {
        delete streamFlushTimeoutRefs.current[bufferKey];
        flushBufferedAssistantVariant(bufferKey);
      },
      isUserScrollingRef.current
        ? 160
        : shouldStickToBottomRef.current
          ? 50
          : 110,
    );
  }

  function appendBufferedAssistantVariant(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    patch: Partial<Pick<ChatAssistantVariant, "content" | "reasoning">>,
  ) {
    const bufferKey = getStreamBufferKey(chatId, assistantMessageId, variantId);
    const buffered = streamBuffersRef.current[bufferKey] ?? {
      chatId,
      assistantMessageId,
      variantId,
      content: "",
      reasoning: "",
    };

    streamBuffersRef.current[bufferKey] = {
      ...buffered,
      content: patch.content
        ? buffered.content + patch.content
        : buffered.content,
      reasoning: patch.reasoning
        ? buffered.reasoning + patch.reasoning
        : buffered.reasoning,
    };

    scheduleBufferedAssistantFlush(bufferKey);
  }
  function updateAssistantVariant(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    updater: (variant: ChatAssistantVariant) => ChatAssistantVariant,
    options: { touch?: boolean } = {},
  ) {
    updateChatMessages(
      chatId,
      (currentMessages) =>
        currentMessages.map((message) => {
          if (
            message.id !== assistantMessageId ||
            message.role !== "assistant"
          ) {
            return message;
          }

          return {
            ...message,
            variants: message.variants.map((variant) =>
              variant.id === variantId ? updater(variant) : variant,
            ),
          };
        }),
      options,
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

  function selectActiveChatModel(model: string) {
    const normalizedModel = model.trim();
    if (!normalizedModel) return;

    updateProviderSetting({ model: normalizedModel });

    if (activeChat) {
      updateChat(activeChat.id, (chat) => ({
        ...chat,
        model: normalizedModel,
        updatedAt: new Date().toISOString(),
      }));
    }

    setIsSidebarModelComboboxOpen(false);
    setSidebarModelSearchValue("");
  }

  function updateActiveModelSettings(patch: ProviderGenerationSettings) {
    setProvider((currentProvider) => {
      const modelKey =
        activeChatModel || currentProvider.model.trim() || "__default__";
      const currentModelSettings =
        currentProvider.modelSettings?.[modelKey] ?? {};

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
      const modelKey =
        activeChatModel || currentProvider.model.trim() || "__default__";
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
      setSettingsOpen(false);
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
      await saveCachedProviderModels(provider, loadedModels);

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

  function validateProviderForGeneration(model = activeChatModel) {
    if (!provider.baseUrl.trim()) {
      showError("Provider base URL is required.");
      setSettingsOpen(true);
      return false;
    }

    if (!model.trim()) {
      showError(
        "Model name is required",
        "Load models or enter the model name manually.",
      );
      return false;
    }

    return true;
  }

  function setChatGenerating(chatId: string, isGenerating: boolean) {
    setGeneratingChatIds((currentChatIds) => {
      const nextChatIds = isGenerating
        ? [...new Set([...currentChatIds, chatId])]
        : currentChatIds.filter((currentChatId) => currentChatId !== chatId);

      isStreamingRef.current = nextChatIds.length > 0;
      return nextChatIds;
    });
  }

  function isChatGenerating(chatId: string) {
    return (
      Boolean(generationRefs.current[chatId]) ||
      generatingChatIds.includes(chatId)
    );
  }

  function stopChatGeneration(chatId: string) {
    generationRefs.current[chatId]?.controller.abort();
  }

  async function runAssistantVariant({
    chatId,
    contextMessages,
    userMessage,
    assistantMessageId,
    variantId,
    responseStartedAtMs,
    providerForRun,
  }: {
    chatId: string;
    contextMessages: ChatMessage[];
    userMessage: string;
    assistantMessageId: string;
    variantId: string;
    responseStartedAtMs: number;
    providerForRun: ProviderConfig;
  }) {
    const controller = new AbortController();
    generationRefs.current[chatId] = {
      controller,
      assistantMessageId,
      variantId,
    };
    setChatGenerating(chatId, true);
    setStreamingAssistantByChatId((current) => ({
      ...current,
      [chatId]: assistantMessageId,
    }));

    if (chatId === activeChatId) {
      shouldStickToBottomRef.current = true;
      pendingAssistantScrollRef.current = assistantMessageId;
      lastScrollStateRef.current = true;
      setIsNearChatBottom(true);
      scheduleChatScrollToBottom();
    }

    toast.dismiss();

    try {
      const streamResult = await streamProviderChat({
        provider: providerForRun,
        systemPrompt,
        messages: contextMessages,
        userMessage,
        signal: controller.signal,
        onContentDelta: (delta) => {
          appendBufferedAssistantVariant(
            chatId,
            assistantMessageId,
            variantId,
            {
              content: delta,
            },
          );
        },
        onReasoningDelta: (delta) => {
          appendBufferedAssistantVariant(
            chatId,
            assistantMessageId,
            variantId,
            {
              reasoning: delta,
            },
          );
        },
      });

      flushBufferedAssistantVariant(
        getStreamBufferKey(chatId, assistantMessageId, variantId),
      );

      const durationMs = Math.max(1, performance.now() - responseStartedAtMs);

      updateAssistantVariant(
        chatId,
        assistantMessageId,
        variantId,
        (variant) => ({
          ...variant,
          status: "done",
          metrics: {
            startedAt:
              variant.metrics?.startedAt ??
              new Date(Date.now() - durationMs).toISOString(),
            ...variant.metrics,
            completedAt: new Date().toISOString(),
            ...buildTokenMetrics({
              content: variant.content,
              durationMs,
              usage: streamResult.usage,
              provider: providerForRun,
              finishReason: streamResult.finishReason,
            }),
          },
        }),
      );
    } catch (error) {
      const wasAborted =
        error instanceof DOMException && error.name === "AbortError";

      flushBufferedAssistantVariant(
        getStreamBufferKey(chatId, assistantMessageId, variantId),
      );

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
              startedAt:
                variant.metrics?.startedAt ??
                new Date(Date.now() - durationMs).toISOString(),
              ...variant.metrics,
              completedAt: new Date().toISOString(),
              ...buildTokenMetrics({
                content,
                durationMs,
                provider: providerForRun,
              }),
            },
          };
        },
      );
    } finally {
      const currentGeneration = generationRefs.current[chatId];
      if (currentGeneration?.controller === controller) {
        delete generationRefs.current[chatId];
        setChatGenerating(chatId, false);
        setStreamingAssistantByChatId((current) => {
          const { [chatId]: _removed, ...remaining } = current;
          return remaining;
        });
      }

      if (chatId === activeChatId && shouldStickToBottomRef.current) {
        scheduleChatScrollToBottom();
      }
    }
  }

  async function sendMessage(content: string) {
    const userMessage = content.trim();

    if (!activeChat) return false;
    if (isChatGenerating(activeChat.id)) return false;

    const chatModel = activeChat.model?.trim() || provider.model.trim();
    if (!validateProviderForGeneration(chatModel)) return false;
    const providerForRun = { ...provider, model: chatModel };

    if (!userMessage) {
      showError("Message is required.");
      return false;
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
    pendingAssistantScrollRef.current = assistantMessageId;
    lastScrollStateRef.current = true;
    setIsNearChatBottom(true);
    updateChat(activeChat.id, (chat) => ({
      ...chat,
      title:
        chat.messages.length === 0 && chat.title === "New chat"
          ? titleFromMessage(userMessage)
          : chat.title,
      messages: nextMessages,
      model: chatModel,
      updatedAt: responseStartedAt,
    }));

    void runAssistantVariant({
      chatId: activeChat.id,
      contextMessages,
      userMessage,
      assistantMessageId,
      variantId,
      responseStartedAtMs,
      providerForRun,
    });

    return true;
  }

  async function regenerateAssistantMessage(assistantMessageId: string) {
    if (!activeChat) return;
    if (isChatGenerating(activeChat.id)) return;

    const chatModel = activeChat.model?.trim() || provider.model.trim();
    if (!validateProviderForGeneration(chatModel)) return;
    const providerForRun = { ...provider, model: chatModel };

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

    updateActiveChatMessages(
      (currentMessages) =>
        currentMessages.map((message) => {
          if (
            message.id !== assistantMessageId ||
            message.role !== "assistant"
          ) {
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
      { touch: false },
    );

    shouldStickToBottomRef.current = true;
    pendingAssistantScrollRef.current = assistantMessageId;
    lastScrollStateRef.current = true;
    setIsNearChatBottom(true);

    await runAssistantVariant({
      chatId: activeChat.id,
      contextMessages,
      userMessage,
      assistantMessageId,
      variantId,
      responseStartedAtMs,
      providerForRun,
    });
  }

  function startEditingUserMessage(messageId: string) {
    if (isSending) {
      showInfo("Wait until generation finishes before editing messages.");
      return;
    }

    setEditingMessageId(messageId);
  }

  function cancelEditingUserMessage() {
    setEditingMessageId(null);
  }

  function getSelectedTextWithin(element: HTMLElement) {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
      return "";
    }

    const selectedText = selection.toString();

    if (!selectedText.trim()) {
      return "";
    }

    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index);

      try {
        if (range.intersectsNode(element)) {
          return selectedText;
        }
      } catch {
        // Ignore detached selection ranges.
      }
    }

    return "";
  }

  function closeMessageContextMenu() {
    setMessageContextMenu(null);
  }

  function captureMessageContext(
    event: ReactMouseEvent<HTMLElement>,
    messageId: string,
  ) {
    event.preventDefault();

    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest("a[href]");
    const menuWidth = 220;
    const menuHeight = 180;
    const margin = 8;
    const x = Math.max(
      margin,
      Math.min(event.clientX, window.innerWidth - menuWidth - margin),
    );
    const y = Math.max(
      margin,
      Math.min(event.clientY, window.innerHeight - menuHeight - margin),
    );

    setMessageContextMenu({
      messageId,
      x,
      y,
      linkHref: link instanceof HTMLAnchorElement ? link.href : null,
      selectedText: getSelectedTextWithin(event.currentTarget),
    });
  }

  async function copyLinkHref(href: string | null) {
    if (!href) return;

    try {
      await navigator.clipboard.writeText(href);
      showSuccess("Link copied.");
    } catch (error) {
      console.error("Failed to copy link:", error);
      toast.error("Failed to copy link.");
    }
  }

  function deleteMessage(messageId: string) {
    if (!activeChat) return;

    if (isChatGenerating(activeChat.id)) {
      showInfo("Wait until generation finishes before deleting messages.");
      return;
    }

    updateActiveChatMessages((currentMessages) =>
      currentMessages.filter((message) => message.id !== messageId),
    );

    setEditingMessageId((currentMessageId) =>
      currentMessageId === messageId ? null : currentMessageId,
    );
    setCopiedMessageId((currentMessageId) =>
      currentMessageId === messageId ? null : currentMessageId,
    );
    setExpandedReasoningIds((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
    setExpandedMetricsIds((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
    messageElementRefs.current.delete(messageId);
    showSuccess("Message deleted.");
  }

  async function copyMessageContent(messageId: string, content: string) {
    if (!content.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((currentMessageId) =>
          currentMessageId === messageId ? null : currentMessageId,
        );
      }, 1200);
    } catch (error) {
      console.error("Failed to copy message:", error);
      toast.error("Failed to copy message.");
    }
  }

  async function saveEditedUserMessage(
    messageId: string,
    editedContent: string,
  ) {
    if (!activeChat) return;
    if (isChatGenerating(activeChat.id)) return;

    const chatModel = activeChat.model?.trim() || provider.model.trim();
    if (!validateProviderForGeneration(chatModel)) return;
    const providerForRun = { ...provider, model: chatModel };

    const userMessage = editedContent.trim();
    if (!userMessage) {
      showError("Message is required.");
      return;
    }

    const userIndex = activeChat.messages.findIndex(
      (message) => message.id === messageId && message.role === "user",
    );
    const currentMessage = activeChat.messages[userIndex];

    if (userIndex < 0 || !currentMessage || currentMessage.role !== "user") {
      showError("Could not find the message to edit.");
      return;
    }

    const assistantMessageId = createId();
    const variantId = createId();
    const responseStartedAtMs = performance.now();
    const responseStartedAt = new Date().toISOString();
    const editedUserMessage: ChatMessage = {
      ...currentMessage,
      content: userMessage,
    };
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
    const contextMessages = activeChat.messages.slice(0, userIndex);
    const nextMessages = [
      ...contextMessages,
      editedUserMessage,
      assistantMessage,
    ];

    shouldStickToBottomRef.current = true;
    pendingAssistantScrollRef.current = assistantMessageId;
    lastScrollStateRef.current = true;
    setIsNearChatBottom(true);
    setExpandedReasoningIds({});
    setExpandedMetricsIds({});
    setEditingMessageId(null);

    updateChat(activeChat.id, (chat) => ({
      ...chat,
      title: userIndex === 0 ? titleFromMessage(userMessage) : chat.title,
      messages: nextMessages,
      model: chatModel,
      updatedAt: responseStartedAt,
    }));

    await runAssistantVariant({
      chatId: activeChat.id,
      contextMessages,
      userMessage,
      assistantMessageId,
      variantId,
      responseStartedAtMs,
      providerForRun,
    });
  }

  function stopGeneration() {
    if (!activeChat) return;
    stopChatGeneration(activeChat.id);
  }

  async function createNewChat() {
    const chat = { ...createEmptyChat(), model: provider.model.trim() };
    setChats((currentChats) => [chat, ...currentChats]);
    setActiveChatId(chat.id);
    chatComposerRef.current?.clear();
    setEditingMessageId(null);
    setExpandedReasoningIds({});
    setExpandedMetricsIds({});
    shouldStickToBottomRef.current = true;
    lastScrollStateRef.current = true;
    setIsNearChatBottom(true);
    focusDraftTextarea();

    try {
      await saveChat(chat);
      await saveActiveChatId(chat.id);
    } catch (error) {
      console.error("Failed to save new chat:", error);
    }
  }

  async function switchChat(chatId: string) {
    setActiveChatId(chatId);
    chatComposerRef.current?.clear();
    setEditingMessageId(null);
    setExpandedReasoningIds({});
    setExpandedMetricsIds({});
    shouldStickToBottomRef.current = true;
    lastScrollStateRef.current = true;
    setIsNearChatBottom(true);
  }

  async function clearCurrentChat() {
    if (!activeChat) return;

    if (isChatGenerating(activeChat.id)) stopChatGeneration(activeChat.id);

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
    if (isChatGenerating(chatId)) stopChatGeneration(chatId);

    const remainingChats = sortChatsByUpdatedAt(
      chats.filter((chat) => chat.id !== chatId),
    );
    const nextChats =
      remainingChats.length > 0
        ? remainingChats
        : [{ ...createEmptyChat(), model: provider.model.trim() }];
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
        className="flex w-80 shrink-0 flex-col border-r bg-card/80"
      >
        <div className="border-b py-3 pl-3 pr-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-5">
                Chat Forge
              </h1>
              {/* <p className="truncate text-xs text-muted-foreground">
                {activeChatModel || "No model selected"}
              </p> */}
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
              <DropdownMenuContent
                align="end"
                className="rounded-none"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  window.requestAnimationFrame(() => {
                    (document.activeElement as HTMLElement | null)?.blur();
                  });
                }}
              >
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

        <div className="grid gap-2 border-b p-3">
          {/* <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Model
          </Label> */}
          <div className="flex gap-2">
            <Popover
              open={isSidebarModelComboboxOpen}
              onOpenChange={setIsSidebarModelComboboxOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  disabled={!activeChat || isSending}
                  aria-expanded={isSidebarModelComboboxOpen}
                  className="model-picker-trigger min-w-0 flex-1 justify-between rounded-none px-3 text-left font-normal"
                  title={
                    isSending
                      ? "Wait until this chat finishes generating"
                      : activeChatModel || "Select or enter a model"
                  }
                >
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      !activeChatModel && "text-muted-foreground",
                    )}
                  >
                    {activeChatModel || "Select model"}
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[var(--radix-popover-trigger-width)] rounded-none p-0"
              >
                <Command shouldFilter={false}>
                  <CommandInput
                    value={sidebarModelSearchValue}
                    onValueChange={setSidebarModelSearchValue}
                    placeholder="Search or type model..."
                  />
                  <CommandList>
                    {canUseCustomSidebarModel && (
                      <CommandGroup heading="Custom">
                        <CommandItem
                          value={trimmedSidebarModelSearchValue}
                          onSelect={() =>
                            selectActiveChatModel(
                              trimmedSidebarModelSearchValue,
                            )
                          }
                          className="cursor-pointer"
                        >
                          Use “{trimmedSidebarModelSearchValue}”
                        </CommandItem>
                      </CommandGroup>
                    )}
                    {filteredSidebarModelSuggestions.length > 0 ? (
                      <CommandGroup heading="Models">
                        {filteredSidebarModelSuggestions.map((model) => (
                          <CommandItem
                            key={model}
                            value={model}
                            onSelect={() => selectActiveChatModel(model)}
                            className="cursor-pointer"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {model}
                            </span>
                            <Check
                              className={cn(
                                "size-4",
                                activeChatModel === model
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ) : (
                      <CommandEmpty>No models found.</CommandEmpty>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={loadModelsFromProvider}
              disabled={isLoadingModels || !provider.baseUrl.trim()}
              className="shrink-0 rounded-none"
              title={getLoadModelsButtonLabel()}
              aria-label={getLoadModelsButtonLabel()}
            >
              <RefreshCcw
                className={cn("size-4", isLoadingModels && "animate-spin")}
              />
            </Button>
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
                  <div className="truncate text-sm leading-5">{chat.title}</div>
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
        <div
          className="relative min-h-0 overflow-hidden"
          onWheel={handleChatWheel}
          onPointerDown={handleChatPointerDown}
        >
          <div
            ref={chatScrollRef}
            data-chat-scroll
            onScroll={handleChatScroll}
            className="chat-scrollbar h-full w-full overflow-y-auto py-3 [overflow-anchor:none] md:py-6"
          >
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
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
                  const isStreamingMessage =
                    activeChat !== undefined &&
                    message.role === "assistant" &&
                    streamingAssistantByChatId[activeChat.id] === message.id &&
                    status === "streaming";

                  return (
                    <div
                      key={message.id}
                      ref={registerMessageElement(message.id)}
                      data-message-id={message.id}
                      className="grid gap-2"
                    >
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
                                  <AssistantMessageContent
                                    content={reasoning}
                                    className="chat-markdown-compact shrink-0"
                                  />
                                </div>
                              </div>
                            </article>
                          );
                        })()}

                      {message.role === "user" &&
                      editingMessageId === message.id ? (
                        <UserMessageEditor
                          initialContent={message.content}
                          disabled={isSending}
                          onCancel={cancelEditingUserMessage}
                          onSave={(nextContent) =>
                            saveEditedUserMessage(message.id, nextContent)
                          }
                        />
                      ) : (
                        (content ||
                          message.role !== "assistant" ||
                          status !== "streaming") && (
                          <>
                            <article
                              className={cn(
                                "flex",
                                message.role === "user"
                                  ? "justify-end"
                                  : "justify-start",
                              )}
                              onContextMenu={(event) =>
                                captureMessageContext(event, message.id)
                              }
                            >
                              <div
                                className={cn(
                                  "min-w-0 overflow-hidden text-sm leading-6 [overflow-wrap:anywhere]",
                                  message.role === "user"
                                    ? "max-w-[85%] bg-primary px-4 py-3 text-primary-foreground shadow-xs"
                                    : "w-full max-w-full bg-card px-4 py-3 text-card-foreground shadow-xs",
                                  status === "error" && "border-destructive/50",
                                )}
                              >
                                {message.role === "assistant" ? (
                                  <>
                                    <AssistantMessageContent
                                      content={content}
                                      isStreaming={isStreamingMessage}
                                    />
                                  </>
                                ) : (
                                  <div className="whitespace-pre-wrap">
                                    {message.content}
                                  </div>
                                )}
                              </div>
                            </article>

                            {messageContextMenu?.messageId === message.id && (
                              <div
                                data-message-context-menu
                                className="fixed z-50 min-w-55 border bg-popover p-1 text-sm text-popover-foreground shadow-md"
                                style={{
                                  left: messageContextMenu.x,
                                  top: messageContextMenu.y,
                                }}
                                onContextMenu={(event) => event.preventDefault()}
                              >
                                {messageContextMenu.linkHref && (
                                  <>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                                      onClick={() => {
                                        void copyLinkHref(messageContextMenu.linkHref);
                                        closeMessageContextMenu();
                                      }}
                                    >
                                      <Copy className="size-4" />
                                      Copy link
                                    </button>
                                    <div className="-mx-1 my-1 h-px bg-border" />
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                                  disabled={
                                    !messageContextMenu.selectedText.trim() &&
                                    !content.trim()
                                  }
                                  onClick={() => {
                                    void copyMessageContent(
                                      message.id,
                                      messageContextMenu.selectedText || content,
                                    );
                                    closeMessageContextMenu();
                                  }}
                                >
                                  <Copy className="size-4" />
                                  {messageContextMenu.selectedText.trim()
                                    ? "Copy selection"
                                    : message.role === "assistant"
                                      ? "Copy answer"
                                      : "Copy message"}
                                </button>
                                {message.role === "assistant" && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                                    disabled={isSending}
                                    onClick={() => {
                                      void regenerateAssistantMessage(message.id);
                                      closeMessageContextMenu();
                                    }}
                                  >
                                    <RefreshCcw className="size-4" />
                                    {status === "error"
                                      ? "Retry answer"
                                      : "Regenerate answer"}
                                  </button>
                                )}
                                {message.role === "user" && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                                    disabled={isSending}
                                    onClick={() => {
                                      startEditingUserMessage(message.id);
                                      closeMessageContextMenu();
                                    }}
                                  >
                                    <Pencil className="size-4" />
                                    Edit message
                                  </button>
                                )}
                                <div className="-mx-1 my-1 h-px bg-border" />
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-destructive hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-destructive/20"
                                  disabled={isSending}
                                  onClick={() => {
                                    deleteMessage(message.id);
                                    closeMessageContextMenu();
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                  Delete message
                                </button>
                              </div>
                            )}
                          </>
                        )
                      )}

                      {message.role === "user" &&
                        editingMessageId !== message.id && (
                          <div className="flex justify-end gap-1.5 text-[11px] leading-4 text-muted-foreground">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 rounded-none px-2 text-xs text-muted-foreground"
                              onClick={() =>
                                copyMessageContent(message.id, message.content)
                              }
                              disabled={!message.content.trim()}
                              title="Copy message"
                            >
                              {copiedMessageId === message.id ? (
                                <>
                                  <Check className="size-3" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3" />
                                  Copy
                                </>
                              )}
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 rounded-none px-2 text-xs text-muted-foreground"
                              onClick={() =>
                                startEditingUserMessage(message.id)
                              }
                              disabled={isSending}
                              title="Edit message"
                            >
                              <Pencil className="size-3" />
                              Edit
                            </Button>
                          </div>
                        )}

                      {message.role === "assistant" && (
                        <div className="grid gap-2 text-[11px] leading-4 text-muted-foreground">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                            <button
                              type="button"
                              className={cn(
                                "min-h-6 text-left hover:text-foreground disabled:pointer-events-none",
                                status === "streaming" &&
                                  metrics?.durationMs === undefined &&
                                  "generating-gradient-text font-medium",
                              )}
                              disabled={metrics?.durationMs === undefined}
                              onClick={() => toggleMetrics(message.id)}
                              title="Show generation details"
                            >
                              {metrics?.durationMs !== undefined
                                ? formatTokenMetrics(metrics)
                                : status === "streaming"
                                  ? "Generating"
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
                                      message.activeVariantIndex <= 0 ||
                                      isSending
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
                                  copyMessageContent(message.id, content)
                                }
                                disabled={!content.trim()}
                                title="Copy answer"
                              >
                                {copiedMessageId === message.id ? (
                                  <>
                                    <Check className="size-3" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-3" />
                                    Copy
                                  </>
                                )}
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 rounded-none px-2 text-xs text-muted-foreground"
                                onClick={() =>
                                  regenerateAssistantMessage(message.id)
                                }
                                disabled={isSending}
                                title={
                                  status === "error"
                                    ? "Retry answer"
                                    : "Regenerate answer"
                                }
                              >
                                <RefreshCcw className="size-3" />
                                {status === "error" ? "Retry" : "Regenerate"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div
                ref={chatBottomRef}
                aria-hidden="true"
                className="h-px w-full shrink-0"
              />
            </div>
          </div>

          {!isNearChatBottom && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 right-[-74px] z-10 px-3 md:px-4">
              <div className="mx-auto flex w-full max-w-3xl justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="pointer-events-auto rounded-none shadow-md opacity-80 hover:opacity-100"
                  onClick={() => scrollChatToBottom()}
                  title="Scroll to bottom"
                  aria-label="Scroll to bottom"
                >
                  <ChevronDown className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <ChatComposer
          ref={chatComposerRef}
          disabled={!activeChat}
          isSending={isSending}
          onSend={sendMessage}
          onStop={stopGeneration}
        />
      </section>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="flex h-[min(760px,calc(100dvh-2rem))] max-h-none flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="h-[96px] shrink-0 overflow-hidden border-b px-5 py-4 pr-12">
            <DialogTitle>Provider settings</DialogTitle>
            <DialogDescription>
              Configure any OpenAI-compatible endpoint. Requests are sent
              directly from the browser, so the provider must allow CORS.
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
              </div>

              <div className="grid gap-2">
                <Label>Model</Label>
                <div className="flex gap-2">
                  <Popover
                    open={isModelComboboxOpen}
                    onOpenChange={(open) => {
                      setIsModelComboboxOpen(open);
                      if (open) setModelSearchValue("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        id="provider-model"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={isModelComboboxOpen}
                        className="model-picker-trigger min-w-0 flex-1 justify-between rounded-none px-3 font-normal"
                      >
                        <span
                          className={cn(
                            "truncate text-left",
                            !provider.model.trim() && "text-muted-foreground",
                          )}
                        >
                          {provider.model.trim() || "Select or enter a model"}
                        </span>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
                      align="start"
                      onWheel={(event) => event.stopPropagation()}
                      onTouchMove={(event) => event.stopPropagation()}
                    >
                      <Command shouldFilter={false}>
                        <CommandInput
                          value={modelSearchValue}
                          onValueChange={setModelSearchValue}
                          placeholder="Search or type a custom model..."
                        />
                        <CommandList
                          className="max-h-[min(220px,40dvh)] overflow-y-auto overscroll-contain"
                          onWheel={(event) => event.stopPropagation()}
                          onTouchMove={(event) => event.stopPropagation()}
                        >
                          {canUseCustomModel && (
                            <CommandGroup heading="Custom">
                              <CommandItem
                                value={`custom:${trimmedModelSearchValue}`}
                                onSelect={() => {
                                  updateProviderSetting({
                                    model: trimmedModelSearchValue,
                                  });
                                  setIsModelComboboxOpen(false);
                                  setModelSearchValue("");
                                }}
                                className="cursor-pointer"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  Use “{trimmedModelSearchValue}”
                                </span>
                              </CommandItem>
                            </CommandGroup>
                          )}

                          {filteredModelSuggestions.length > 0 ? (
                            <CommandGroup heading="Available models">
                              {filteredModelSuggestions.map((model) => (
                                <CommandItem
                                  key={model}
                                  value={model}
                                  keywords={[model]}
                                  onSelect={() => {
                                    updateProviderSetting({ model });
                                    setIsModelComboboxOpen(false);
                                    setModelSearchValue("");
                                  }}
                                  className="cursor-pointer"
                                >
                                  <span className="min-w-0 flex-1 truncate">
                                    {model}
                                  </span>
                                  <Check
                                    className={cn(
                                      "size-4",
                                      provider.model.trim() === model
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ) : (
                            <CommandEmpty>No models found.</CommandEmpty>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={loadModelsFromProvider}
                    disabled={isLoadingModels || !provider.baseUrl.trim()}
                    className="shrink-0 rounded-none"
                    title={getLoadModelsButtonLabel()}
                    aria-label={getLoadModelsButtonLabel()}
                  >
                    <RefreshCcw
                      className={cn(
                        "size-4",
                        isLoadingModels && "animate-spin",
                      )}
                    />
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
                  One header per line. Authorization is still generated from the
                  API key field.
                </p>
              </div>

              <Separator />

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Generation settings for current model</Label>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Saved per model. Leave numeric fields empty to use
                      provider defaults.
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
                      value={formatOptionalNumber(
                        activeModelSettings.temperature,
                      )}
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
                      value={formatOptionalNumber(
                        activeModelSettings.maxTokens,
                      )}
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
                          reasoningMode:
                            reasoningMode as ProviderGenerationSettings["reasoningMode"],
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
                          reasoningEffort:
                            reasoningEffort as ProviderGenerationSettings["reasoningEffort"],
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
                    <Label htmlFor="generation-timeout">
                      Request timeout, ms
                    </Label>
                    <Input
                      id="generation-timeout"
                      type="number"
                      min="1000"
                      step="1000"
                      value={formatOptionalNumber(
                        activeModelSettings.requestTimeoutMs,
                      )}
                      onChange={(event) =>
                        updateActiveModelSettings({
                          requestTimeoutMs: parseOptionalNumber(
                            event.target.value,
                          ),
                        })
                      }
                      placeholder="30000"
                    />
                  </div>
                </div>
              </div>

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
