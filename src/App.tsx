"use client";

import { ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ChatMessageList } from "@/components/ai-chat/chat-message-list";
import {
  ChatComposer,
  type ChatComposerHandle,
  type ToolMentionOption,
} from "@/components/ai-chat/chat-composer";
import { ToolExecutionBlock } from "@/components/ai-chat/tool-execution-block";
import { ComposerFooter } from "@/components/ai-chat/composer-footer";
import { EmptyChatState } from "@/components/ai-chat/empty-chat-state";
import { FindBar } from "@/components/ai-chat/find-bar";
import { ChatSidebar } from "@/components/chat-sidebar";
import { SystemPromptDialog } from "@/components/dialogs/system-prompt-dialog";
import { ProviderSettingsDialog } from "@/components/provider-settings-dialog";
import { ToolsDialog } from "@/components/tools-dialog";
import { Button } from "@/components/ui/button";
import {
  buildTokenMetrics,
  createId,
  createNewProvider,
  createProviderId,
  getActiveVariant,
  getProviderFallbackModel,
  groupChatsByActivityDate,
  labelForError,
  normalizeProviderForState,
  normalizeProviderModels,
  providerDisplayName,
  sortChatsByUpdatedAt,
  titleFromMessage,
} from "@/lib/ai-chat/chat-utils";
import { streamProviderChat } from "@/lib/ai-chat/direct-provider-client";
import { defaultProvider } from "@/lib/ai-chat/provider-presets";
import {
  createEmptyChat,
  loadActiveChatId,
  loadChats,
  loadProvidersState,
  loadSystemPrompt,
  loadTools,
  loadToolsSettings,
  saveActiveChatId,
  saveChat,
  saveProvidersState,
  saveSystemPrompt,
  saveToolsSettings,
} from "@/lib/ai-chat/storage";
import { runQueuedTool } from "@/lib/ai-chat/tool-execution-queue";
import {
  ASK_USER_TOOL,
  ASK_USER_TOOL_NAME,
  CHECKLIST_WRITE_TOOL,
  CHECKLIST_WRITE_TOOL_NAME,
  DEFAULT_TOOLS_SETTINGS,
  compareToolsByDisplayOrder,
  createAskUserToolResult,
  createChecklistWriteToolResult,
  isBuiltInToolName,
  isValidToolName,
  parseAskUserRequestFromToolCall,
  parseChecklistWriteRequestFromToolCall,
  parseToolArgumentsText,
  parseToolMentionNames,
} from "@/lib/ai-chat/builtin-tools";
import type {
  AskUserRequest,
  AskUserResponse,
  ChatAssistantProcessStep,
  ChatAssistantVariant,
  ChatMessage,
  ChatSession,
  ChatToolCall,
  ChatToolResult,
  LoadedToolInfo,
  ProviderConfig,
  ProvidersState,
  ToolExecutionStatus,
  ToolsSettings,
  UserInputStatus,
} from "@/lib/ai-chat/types";
import { useChatActions } from "@/hooks/use-chat-actions";
import { useChatAutoscroll } from "@/hooks/use-chat-autoscroll";
import { useMessageContextMenu } from "@/hooks/use-message-context-menu";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const APP_NAME = "Chat Forge";
const APP_VERSION_LABEL = `v${__APP_VERSION__}`;
const APP_TITLE = `${APP_NAME} ${APP_VERSION_LABEL}`;

const CHAT_BOTTOM_THRESHOLD_PX = 32;
const SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX = 1000;
const STICKY_SCROLL_SUPPRESSION_MS = 1000;
const STICKY_SCROLL_SETTLE_FRAMES = 5;
const FORCED_SCROLL_SETTLE_FRAMES = 8;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "chat-forge-sidebar-collapsed";
const COMPOSER_DRAFTS_STORAGE_KEY = "chat-forge-composer-drafts";
const MAX_TOOL_ROUNDS = 20;

function loadComposerDrafts(): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(COMPOSER_DRAFTS_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function saveComposerDrafts(drafts: Record<string, string>) {
  if (typeof window === "undefined") return;

  const nonEmptyDrafts = Object.fromEntries(
    Object.entries(drafts).filter(([, value]) => value.length > 0),
  );

  if (Object.keys(nonEmptyDrafts).length === 0) {
    window.localStorage.removeItem(COMPOSER_DRAFTS_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    COMPOSER_DRAFTS_STORAGE_KEY,
    JSON.stringify(nonEmptyDrafts),
  );
}

type StreamBufferEvent =
  | {
      type: "content";
      delta: string;
      assistantMessageStepId: string;
    }
  | {
      type: "reasoning";
      delta: string;
      reasoningStepId: string;
    };

type StreamBuffer = {
  chatId: string;
  assistantMessageId: string;
  variantId: string;
  events: StreamBufferEvent[];
};

type ActiveProcessStepRef = {
  type: "thinking" | "assistant_message" | "tool_execution" | "user_input";
  id?: string;
};

function keepOnlyLatestChecklistListStep<T extends ChatAssistantProcessStep>(
  processSteps: T[],
): T[] {
  return processSteps;
}

function cancelUnfinishedChecklistListSteps(
  processSteps: ChatAssistantProcessStep[],
): ChatAssistantProcessStep[] {
  return processSteps;
}

type ActiveGeneration = {
  controller: AbortController;
  assistantMessageId: string;
  variantId: string;
};

type PendingAskUserRequest = {
  chatId: string;
  assistantMessageId: string;
  variantId: string;
  stepId: string;
  resolve: (result: ChatToolResult) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
};

type FindInPageResultState = {
  activeMatchOrdinal: number;
  matches: number;
};

const EMPTY_FIND_RESULT: FindInPageResultState = {
  activeMatchOrdinal: 0,
  matches: 0,
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [providersState, setProvidersState] = useState<ProvidersState>(() => ({
    providers: [normalizeProviderForState(defaultProvider)],
    activeProviderId: defaultProvider.id,
  }));
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant.",
  );
  const [toolsSettings, setToolsSettings] = useState<ToolsSettings>(
    DEFAULT_TOOLS_SETTINGS,
  );
  const [loadedTools, setLoadedTools] = useState<LoadedToolInfo[]>([]);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | undefined>();
  const [initialComposerDrafts] = useState<Record<string, string>>(() =>
    loadComposerDrafts(),
  );
  const composerDraftsRef = useRef<Record<string, string>>(
    initialComposerDrafts,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [generatingChatIds, setGeneratingChatIds] = useState<string[]>([]);
  const [streamingAssistantByChatId, setStreamingAssistantByChatId] = useState<
    Record<string, string>
  >({});
  const [visualStreamingMessageIds, setVisualStreamingMessageIds] = useState<
    string[]
  >([]);
  const [visualFlushRequests, setVisualFlushRequests] = useState<
    Record<string, number>
  >({});
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findResult, setFindResult] =
    useState<FindInPageResultState>(EMPTY_FIND_RESULT);
  const [isSidebarModelComboboxOpen, setIsSidebarModelComboboxOpen] =
    useState(false);
  const [sidebarModelSearchValue, setSidebarModelSearchValue] = useState("");
  const [isChatToolPickerOpen, setIsChatToolPickerOpen] = useState(false);
  const [chatToolSearchValue, setChatToolSearchValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;

    return (
      window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
    );
  });
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [collapsedToolStepIds, setCollapsedToolStepIds] = useState<
    Record<string, boolean>
  >({});
  const {
    messageContextMenu,
    captureMessageContext,
    closeMessageContextMenu,
  } = useMessageContextMenu();
  const messageElementRefs = useRef(new Map<string, HTMLDivElement>());
  const chatComposerRef = useRef<ChatComposerHandle | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const generationRefs = useRef<Record<string, ActiveGeneration>>({});
  const pendingAskUserRequestsRef = useRef<
    Record<string, PendingAskUserRequest>
  >({});
  const streamBuffersRef = useRef<Record<string, StreamBuffer>>({});
  const streamActiveProcessStepRefs = useRef<
    Record<string, ActiveProcessStepRef>
  >({});
  const streamFlushTimeoutRefs = useRef<Record<string, number>>({});
  const didHydrateRef = useRef(false);
  const composerDraftSaveTimeoutRef = useRef<number | null>(null);


  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    document.title = APP_TITLE;
  }, []);

  useEffect(() => {
    return window.chatForgeFind?.onFoundInPage((result) => {
      setFindResult({
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
      });
    });
  }, []);

  useEffect(() => {
    function handleFindShortcut(event: KeyboardEvent) {
      const isFindShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f";

      if (!isFindShortcut) return;

      event.preventDefault();

      const selectedText = window.getSelection()?.toString().trim();
      if (selectedText) {
        setFindQuery(selectedText);
      }

      setFindBarOpen(true);
      window.requestAnimationFrame(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      });
    }

    document.addEventListener("keydown", handleFindShortcut);

    return () => {
      document.removeEventListener("keydown", handleFindShortcut);
    };
  }, []);

  useEffect(() => {
    if (!findBarOpen) {
      void window.chatForgeFind?.stopFindInPage("clearSelection");
      setFindResult(EMPTY_FIND_RESULT);
      return;
    }

    window.requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, [findBarOpen]);

  useEffect(() => {
    if (!findBarOpen) return;

    const timeout = window.setTimeout(() => {
      runFindInPage(findQuery, { forward: true, findNext: false });
    }, 80);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [findBarOpen, findQuery]);

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(isSidebarCollapsed),
    );
  }, [isSidebarCollapsed]);


  function runFindInPage(
    query: string,
    options: { forward?: boolean; findNext?: boolean } = {},
  ) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      void window.chatForgeFind?.stopFindInPage("clearSelection");
      setFindResult(EMPTY_FIND_RESULT);
      return;
    }

    if (!window.chatForgeFind) {
      setFindResult(EMPTY_FIND_RESULT);
      return;
    }

    void window.chatForgeFind.findInPage({
      text: trimmedQuery,
      forward: options.forward ?? true,
      findNext: options.findNext ?? false,
    });
  }

  function findNextMatch(forward: boolean) {
    if (!findQuery.trim()) {
      findInputRef.current?.focus();
      return;
    }

    runFindInPage(findQuery, { forward, findNext: true });
  }

  function closeFindBar() {
    setFindBarOpen(false);
  }

  function focusDraftTextarea() {
    chatComposerRef.current?.focus();
  }

  function registerMessageElement(messageId: string) {
    return (element: HTMLDivElement | null) => {
      if (element) {
        messageElementRefs.current.set(messageId, element);
      } else {
        messageElementRefs.current.delete(messageId);
      }
    };
  }

  const sortedChats = useMemo(() => sortChatsByUpdatedAt(chats), [chats]);
  const groupedChats = useMemo(
    () => groupChatsByActivityDate(sortedChats),
    [sortedChats],
  );

  const activeChat = useMemo(() => {
    return (
      sortedChats.find((chat) => chat.id === activeChatId) ?? sortedChats[0]
    );
  }, [activeChatId, sortedChats]);
  const activeComposerDraft = activeChatId
    ? (composerDraftsRef.current[activeChatId] ?? "")
    : "";

  const providers = providersState.providers.length
    ? providersState.providers
    : [normalizeProviderForState(defaultProvider)];
  const activeProvider =
    providers.find(
      (provider) => provider.id === providersState.activeProviderId,
    ) ?? providers[0];
  const messages = activeChat?.messages ?? [];
  const hasMessages = messages.length > 0;
  const activeChatProvider =
    providers.find((provider) => provider.id === activeChat?.providerId) ??
    activeProvider;
  const activeChatModel =
    activeChat?.model?.trim() || getProviderFallbackModel(activeChatProvider);
  const isSending = activeChat
    ? generatingChatIds.includes(activeChat.id)
    : false;
  const visibleProviderGroups = useMemo(() => {
    const search = sidebarModelSearchValue.trim().toLowerCase();

    return providers
      .map((provider) => {
        const models = normalizeProviderModels(
          provider.enabledModelIds ?? [],
        ).filter((model) =>
          search
            ? `${providerDisplayName(provider)} ${model}`
                .toLowerCase()
                .includes(search)
            : true,
        );

        return { provider, models };
      })
      .filter((group) => group.models.length > 0);
  }, [providers, sidebarModelSearchValue]);

  const availableTools = useMemo(() => {
    const byName = new Map<string, LoadedToolInfo>();

    for (const tool of [ASK_USER_TOOL, CHECKLIST_WRITE_TOOL, ...loadedTools]) {
      if (!isValidToolName(tool.name) || byName.has(tool.name)) continue;
      byName.set(tool.name, tool);
    }

    return [...byName.values()].sort(compareToolsByDisplayOrder);
  }, [loadedTools]);

  const availableToolsByName = useMemo(() => {
    return new Map(availableTools.map((tool) => [tool.name, tool] as const));
  }, [availableTools]);

  const globallyEnabledToolNames = useMemo(() => {
    const names = new Set<string>();

    if (!toolsSettings.enabled) return names;

    if (toolsSettings.askUserEnabled) names.add(ASK_USER_TOOL_NAME);
    if (toolsSettings.checklistWriteEnabled)
      names.add(CHECKLIST_WRITE_TOOL_NAME);

    for (const tool of loadedTools) {
      if (
        tool.enabled &&
        tool.name !== ASK_USER_TOOL_NAME &&
        tool.name !== CHECKLIST_WRITE_TOOL_NAME &&
        isValidToolName(tool.name)
      ) {
        names.add(tool.name);
      }
    }

    return names;
  }, [loadedTools, toolsSettings]);

  const activeChatEnabledToolNames = useMemo(() => {
    if (!activeChat) return [];

    const chatEnabled = new Set(activeChat.enabledToolNames ?? []);
    const chatDisabled = new Set(activeChat.disabledToolNames ?? []);

    return availableTools
      .map((tool) => tool.name)
      .filter(
        (toolName) =>
          !chatDisabled.has(toolName) &&
          (globallyEnabledToolNames.has(toolName) || chatEnabled.has(toolName)),
      );
  }, [
    activeChat?.disabledToolNames,
    activeChat?.enabledToolNames,
    activeChat?.id,
    availableTools,
    globallyEnabledToolNames,
  ]);

  const visibleChatTools = useMemo(() => {
    const search = chatToolSearchValue.trim().toLowerCase();

    if (!search) return availableTools;

    return availableTools.filter((tool) =>
      `${tool.name} ${tool.description}`.toLowerCase().includes(search),
    );
  }, [availableTools, chatToolSearchValue]);

  const toolMentionOptions = useMemo<ToolMentionOption[]>(
    () =>
      availableTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        isBuiltin: isBuiltInToolName(tool.name),
      })),
    [availableTools],
  );

  const {
    chatScrollRef,
    chatContentRef,
    chatBottomRef,
    autoScrollEnabledRef,
    isNearChatBottom,
    showScrollToBottomButton,
    isChatScrollable,
    resetChatScrollState,
    armStickyScrollToBottom,
    scheduleStickyScrollToBottom,
    isStickyScrollSuppressed,
    syncChatScrollState,
    scrollChatToBottom,
    handleChatScroll,
    handleChatWheel,
    handleChatPointerDown,
    handleAssistantVisualProgress,
    handleAssistantVisualStreamingChange,
    handleAskUserLayoutChange,
  } = useChatAutoscroll({
    activeChatId,
    generatingChatIds,
    messages,
    closeMessageContextMenu,
    setVisualStreamingMessageIds,
  });

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const [
          loadedProvidersState,
          loadedSystemPrompt,
          loadedChats,
          loadedActiveChatId,
          loadedToolsSettings,
          loadedToolManifests,
        ] = await Promise.all([
          loadProvidersState(),
          loadSystemPrompt(),
          loadChats(),
          loadActiveChatId(),
          loadToolsSettings(),
          loadTools(),
        ]);

        if (cancelled) return;

        const normalizedProviders = loadedProvidersState.providers.length
          ? loadedProvidersState.providers.map(normalizeProviderForState)
          : [normalizeProviderForState(defaultProvider)];
        const fallbackProviderId = normalizedProviders.some(
          (provider) => provider.id === loadedProvidersState.activeProviderId,
        )
          ? loadedProvidersState.activeProviderId
          : normalizedProviders[0].id;
        const fallbackProvider =
          normalizedProviders.find(
            (provider) => provider.id === fallbackProviderId,
          ) ?? normalizedProviders[0];

        let nextChats = loadedChats.map((chat) => ({
          ...chat,
          providerId: chat.providerId ?? fallbackProviderId,
          model:
            chat.model?.trim() || getProviderFallbackModel(fallbackProvider),
        }));
        let nextActiveChatId = loadedActiveChatId;

        if (nextChats.length === 0) {
          const chat = {
            ...createEmptyChat(),
            providerId: fallbackProviderId,
            model: getProviderFallbackModel(fallbackProvider),
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

        setProvidersState({
          providers: normalizedProviders,
          activeProviderId: fallbackProviderId,
        });
        setSystemPrompt(loadedSystemPrompt);
        setToolsSettings(loadedToolsSettings);
        setLoadedTools(loadedToolManifests);
        setChats(nextChats);
        setActiveChatId(nextActiveChatId);
        didHydrateRef.current = true;
        setMounted(true);
      } catch (error) {
        console.error("Failed to load app data from IndexedDB:", error);
        const fallbackProvider = normalizeProviderForState(defaultProvider);
        const fallbackChat = {
          ...createEmptyChat(),
          providerId: fallbackProvider.id,
          model: getProviderFallbackModel(fallbackProvider),
        };
        setProvidersState({
          providers: [fallbackProvider],
          activeProviderId: fallbackProvider.id,
        });
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

      if (event.code === "KeyN") {
        event.preventDefault();
        event.stopPropagation();
        void createNewChat();
        return;
      }

      if (event.code === "Delete") {
        event.preventDefault();
        event.stopPropagation();
        void clearCurrentChat();
      }
    }

    document.addEventListener("keydown", handleGlobalShortcut, {
      capture: true,
    });

    return () => {
      document.removeEventListener("keydown", handleGlobalShortcut, {
        capture: true,
      });
    };
  }, [activeChat, isSending]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    saveProvidersState(providersState).catch((error) =>
      console.error("Failed to save providers:", error),
    );
  }, [providersState]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    saveSystemPrompt(systemPrompt).catch((error) =>
      console.error("Failed to save system prompt:", error),
    );
  }, [systemPrompt]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    saveToolsSettings(toolsSettings).catch((error) =>
      console.error("Failed to save tools settings:", error),
    );
  }, [toolsSettings]);

  useEffect(() => {
    if (!didHydrateRef.current || !activeChatId) return;
    saveActiveChatId(activeChatId).catch((error) =>
      console.error("Failed to save active chat id:", error),
    );
  }, [activeChatId]);

  useEffect(() => {
    return () => {
      if (composerDraftSaveTimeoutRef.current !== null) {
        window.clearTimeout(composerDraftSaveTimeoutRef.current);
      }

      saveComposerDrafts(composerDraftsRef.current);
    };
  }, []);

  useEffect(() => {
    if (!didHydrateRef.current || chats.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      Promise.all(chats.map((chat) => saveChat(chat))).catch((error) =>
        console.error("Failed to save chats:", error),
      );
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [chats]);

  function showSuccess(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function showError(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function showInfo(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function getToolsBridge() {
    if (!window.chatForgeTools) {
      throw new Error("Electron tools bridge is not available.");
    }

    return window.chatForgeTools;
  }

  function getGlobalEnabledTools() {
    const enabledCommandTools = toolsSettings.enabled
      ? loadedTools.filter(
          (tool) =>
            tool.enabled &&
            tool.name !== ASK_USER_TOOL_NAME &&
            tool.name !== CHECKLIST_WRITE_TOOL_NAME,
        )
      : [];

    if (!toolsSettings.enabled) return enabledCommandTools;

    return [
      ...(toolsSettings.askUserEnabled ? [ASK_USER_TOOL] : []),
      ...(toolsSettings.checklistWriteEnabled ? [CHECKLIST_WRITE_TOOL] : []),
      ...enabledCommandTools,
    ];
  }

  function getEnabledToolsForChat(
    chat: ChatSession,
    oneShotToolNames: string[] = [],
  ) {
    const byName = new Map<string, LoadedToolInfo>();
    const chatDisabledToolNames = new Set(chat.disabledToolNames ?? []);

    for (const tool of getGlobalEnabledTools()) {
      if (chatDisabledToolNames.has(tool.name)) continue;
      if (!byName.has(tool.name)) byName.set(tool.name, tool);
    }

    for (const toolName of chat.enabledToolNames ?? []) {
      if (chatDisabledToolNames.has(toolName)) continue;

      const tool = availableToolsByName.get(toolName);
      if (tool && !byName.has(tool.name)) byName.set(tool.name, tool);
    }

    for (const toolName of oneShotToolNames) {
      const tool = availableToolsByName.get(toolName);
      if (tool && !byName.has(tool.name)) byName.set(tool.name, tool);
    }

    return [...byName.values()];
  }

  function validateToolMentionsForRequest(content: string) {
    const toolNames = parseToolMentionNames(content);
    const unknownToolNames = toolNames.filter(
      (toolName) => !availableToolsByName.has(toolName),
    );

    if (unknownToolNames.length > 0) {
      showError(
        unknownToolNames.length === 1
          ? `Tool not found: ${unknownToolNames[0]}`
          : `Tools not found: ${unknownToolNames.join(", ")}`,
      );
      return undefined;
    }

    return toolNames;
  }

  function isToolExecutionCollapsed(stepId: string) {
    const manualState = collapsedToolStepIds[stepId];
    if (manualState !== undefined) return manualState;

    return true;
  }

  function toggleToolExecutionCollapsed(
    stepId: string,
    nextCollapsed: boolean,
  ) {
    setCollapsedToolStepIds((current) => ({
      ...current,
      [stepId]: nextCollapsed,
    }));
  }

  function renderToolExecutionBlock({
    id,
    toolCall,
    toolResult,
    status,
  }: {
    id: string;
    toolCall: ChatToolCall;
    toolResult?: ChatToolResult;
    status?: ToolExecutionStatus;
  }) {
    return (
      <ToolExecutionBlock
        id={id}
        toolCall={toolCall}
        toolResult={toolResult}
        status={status}
        loadedTools={loadedTools}
        isCollapsed={isToolExecutionCollapsed(id)}
        onToggleCollapsed={toggleToolExecutionCollapsed}
      />
    );
  }

  async function executeAskUserToolCall(
    toolCall: ChatToolCall,
    options: {
      chatId: string;
      assistantMessageId: string;
      variantId: string;
      stepId: string;
      signal?: AbortSignal;
    },
  ): Promise<ChatToolResult> {
    parseAskUserRequestFromToolCall(toolCall);

    return new Promise<ChatToolResult>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        delete pendingAskUserRequestsRef.current[toolCall.id];
        options.signal?.removeEventListener("abort", abortHandler);
      };

      const settleResolve = (result: ChatToolResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const settleReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const abortHandler = () => {
        updateAssistantUserInputStepStatus(
          options.chatId,
          options.assistantMessageId,
          options.variantId,
          options.stepId,
          "cancelled",
        );
        settleReject(
          new DOMException("Generation was cancelled.", "AbortError"),
        );
      };

      pendingAskUserRequestsRef.current[toolCall.id] = {
        chatId: options.chatId,
        assistantMessageId: options.assistantMessageId,
        variantId: options.variantId,
        stepId: options.stepId,
        resolve: settleResolve,
        reject: settleReject,
        cleanup,
      };

      updateAssistantUserInputStepStatus(
        options.chatId,
        options.assistantMessageId,
        options.variantId,
        options.stepId,
        "waiting",
      );

      if (options.signal?.aborted) {
        abortHandler();
        return;
      }

      options.signal?.addEventListener("abort", abortHandler, { once: true });
    });
  }

  async function executeChecklistWriteToolCall(
    toolCall: ChatToolCall,
  ): Promise<ChatToolResult> {
    const request = parseChecklistWriteRequestFromToolCall(toolCall);
    return createChecklistWriteToolResult(toolCall, request);
  }

  async function executeToolCall(
    toolCall: ChatToolCall,
    options: {
      chatId: string;
      assistantMessageId: string;
      variantId: string;
      stepId: string;
      signal?: AbortSignal;
    },
  ): Promise<ChatToolResult> {
    const toolName = toolCall.function.name;
    const tool = loadedTools.find((candidate) => candidate.name === toolName);

    try {
      if (toolName === ASK_USER_TOOL_NAME) {
        return await executeAskUserToolCall(toolCall, options);
      }

      if (toolName === CHECKLIST_WRITE_TOOL_NAME) {
        return await executeChecklistWriteToolCall(toolCall);
      }

      const argsText = toolCall.function.arguments.trim() || "{}";
      const args = JSON.parse(argsText);
      const result = await runQueuedTool(
        toolName,
        tool,
        () => getToolsBridge().execute({ name: toolName, args }),
        (status) =>
          updateAssistantToolStepStatus(
            options.chatId,
            options.assistantMessageId,
            options.variantId,
            options.stepId,
            status,
          ),
      );

      return {
        toolCallId: toolCall.id,
        toolName: result.toolName || toolName,
        content: result.content,
        isError: result.timedOut || result.exitCode !== 0,
        execution: result.execution,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }

      return {
        toolCallId: toolCall.id,
        toolName,
        content: `Error: ${labelForError(error)}`,
        isError: true,
      };
    }
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

  const updateActiveComposerDraft = useCallback(
    (draft: string) => {
      if (!activeChatId) return;

      const nextDrafts = { ...composerDraftsRef.current };

      if (draft.length === 0) delete nextDrafts[activeChatId];
      else nextDrafts[activeChatId] = draft;

      composerDraftsRef.current = nextDrafts;

      if (composerDraftSaveTimeoutRef.current !== null) {
        window.clearTimeout(composerDraftSaveTimeoutRef.current);
      }

      composerDraftSaveTimeoutRef.current = window.setTimeout(() => {
        composerDraftSaveTimeoutRef.current = null;
        saveComposerDrafts(composerDraftsRef.current);
      }, 250);
    },
    [activeChatId],
  );

  function appendToAssistantVariant(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    events: StreamBufferEvent[],
  ) {
    if (!events.length) return;

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

              let contentDelta = "";
              let reasoningDelta = "";
              const contentDeltasByStepId = new Map<string, string>();
              const reasoningDeltasByStepId = new Map<string, string>();

              for (const event of events) {
                if (event.type === "content") {
                  contentDelta += event.delta;
                  contentDeltasByStepId.set(
                    event.assistantMessageStepId,
                    `${contentDeltasByStepId.get(event.assistantMessageStepId) ?? ""}${event.delta}`,
                  );
                } else {
                  reasoningDelta += event.delta;
                  reasoningDeltasByStepId.set(
                    event.reasoningStepId,
                    `${reasoningDeltasByStepId.get(event.reasoningStepId) ?? ""}${event.delta}`,
                  );
                }
              }

              const processSteps = (variant.processSteps ?? []).map((step) => {
                if (step.type === "assistant_message") {
                  const delta = contentDeltasByStepId.get(step.id);
                  return delta
                    ? { ...step, content: step.content + delta }
                    : step;
                }

                if (step.type === "thinking") {
                  const delta = reasoningDeltasByStepId.get(step.id);
                  return delta
                    ? { ...step, content: step.content + delta }
                    : step;
                }

                return step;
              });

              return {
                ...variant,
                content: contentDelta
                  ? variant.content + contentDelta
                  : variant.content,
                reasoning: reasoningDelta
                  ? `${variant.reasoning ?? ""}${reasoningDelta}`
                  : variant.reasoning,
                processSteps,
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
    if (!buffered || buffered.events.length === 0) return;

    const events = buffered.events;
    streamBuffersRef.current[bufferKey] = {
      ...buffered,
      events: [],
    };

    appendToAssistantVariant(
      buffered.chatId,
      buffered.assistantMessageId,
      buffered.variantId,
      events,
    );
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
      autoScrollEnabledRef.current ? 50 : 110,
    );
  }

  function appendBufferedAssistantVariant(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    event: StreamBufferEvent,
  ) {
    const bufferKey = getStreamBufferKey(chatId, assistantMessageId, variantId);
    const buffered = streamBuffersRef.current[bufferKey] ?? {
      chatId,
      assistantMessageId,
      variantId,
      events: [],
    };

    streamBuffersRef.current[bufferKey] = {
      ...buffered,
      events: [...buffered.events, event],
    };

    scheduleBufferedAssistantFlush(bufferKey);
  }

  function setActiveStreamProcessStep(
    bufferKey: string,
    step: ActiveProcessStepRef,
  ) {
    streamActiveProcessStepRefs.current[bufferKey] = step;
  }

  function getActiveStreamProcessStep(bufferKey: string) {
    return streamActiveProcessStepRefs.current[bufferKey];
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

  function appendAssistantProcessSteps(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    steps: ChatAssistantProcessStep[],
  ) {
    if (!steps.length) return;

    updateAssistantVariant(
      chatId,
      assistantMessageId,
      variantId,
      (variant) => ({
        ...variant,
        processSteps: [...(variant.processSteps ?? []), ...steps],
      }),
      { touch: false },
    );
  }

  function updateAssistantToolStepStatus(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    stepId: string,
    status: ToolExecutionStatus,
  ) {
    updateAssistantVariant(
      chatId,
      assistantMessageId,
      variantId,
      (variant) => ({
        ...variant,
        processSteps: (variant.processSteps ?? []).map((step) =>
          step.id === stepId && step.type === "tool_execution"
            ? { ...step, status }
            : step,
        ),
      }),
      { touch: false },
    );
  }

  function updateAssistantUserInputStepStatus(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    stepId: string,
    status: UserInputStatus,
  ) {
    updateAssistantVariant(
      chatId,
      assistantMessageId,
      variantId,
      (variant) => ({
        ...variant,
        processSteps: (variant.processSteps ?? []).map((step) =>
          step.id === stepId && step.type === "user_input"
            ? { ...step, status }
            : step,
        ),
      }),
      { touch: false },
    );
  }

  function completeAssistantUserInputStep(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    stepId: string,
    response: AskUserResponse,
    toolResult: ChatToolResult,
  ) {
    updateAssistantVariant(
      chatId,
      assistantMessageId,
      variantId,
      (variant) => ({
        ...variant,
        processSteps: (variant.processSteps ?? []).map((step) =>
          step.id === stepId && step.type === "user_input"
            ? {
                ...step,
                status: "complete",
                response,
                toolResult,
              }
            : step,
        ),
      }),
      { touch: false },
    );
  }

  function submitAskUserResponse(
    toolCall: ChatToolCall,
    request: AskUserRequest,
    response: AskUserResponse,
  ) {
    const pendingRequest = pendingAskUserRequestsRef.current[toolCall.id];
    if (!pendingRequest) {
      showError("This input request is no longer active.");
      return;
    }

    const toolResult = createAskUserToolResult(toolCall, request, response);
    completeAssistantUserInputStep(
      pendingRequest.chatId,
      pendingRequest.assistantMessageId,
      pendingRequest.variantId,
      pendingRequest.stepId,
      response,
      toolResult,
    );
    pendingRequest.resolve(toolResult);

    if (pendingRequest.chatId === activeChatId) {
      scheduleStickyScrollToBottom({
        force: true,
        settleFrames: STICKY_SCROLL_SETTLE_FRAMES,
      });
    }
  }

  function cancelAskUserRequest(toolCallId: string) {
    const pendingRequest = pendingAskUserRequestsRef.current[toolCallId];
    if (!pendingRequest) {
      showError("This input request is no longer active.");
      return;
    }

    updateAssistantUserInputStepStatus(
      pendingRequest.chatId,
      pendingRequest.assistantMessageId,
      pendingRequest.variantId,
      pendingRequest.stepId,
      "cancelled",
    );

    generationRefs.current[pendingRequest.chatId]?.controller.abort();
    pendingRequest.reject(
      new DOMException("Generation was cancelled.", "AbortError"),
    );
  }

  function ensureAssistantMessageProcessStep(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    bufferKey: string,
  ) {
    const activeStep = getActiveStreamProcessStep(bufferKey);
    if (activeStep?.type === "assistant_message" && activeStep.id) {
      return activeStep.id;
    }

    const assistantMessageStepId = createId();
    appendAssistantProcessSteps(chatId, assistantMessageId, variantId, [
      { id: assistantMessageStepId, type: "assistant_message", content: "" },
    ]);
    setActiveStreamProcessStep(bufferKey, {
      type: "assistant_message",
      id: assistantMessageStepId,
    });

    return assistantMessageStepId;
  }

  function ensureThinkingProcessStep(
    chatId: string,
    assistantMessageId: string,
    variantId: string,
    bufferKey: string,
  ) {
    const activeStep = getActiveStreamProcessStep(bufferKey);
    if (activeStep?.type === "thinking" && activeStep.id) {
      return activeStep.id;
    }

    const thinkingStepId = createId();
    appendAssistantProcessSteps(chatId, assistantMessageId, variantId, [
      { id: thinkingStepId, type: "thinking", content: "" },
    ]);
    setActiveStreamProcessStep(bufferKey, {
      type: "thinking",
      id: thinkingStepId,
    });

    return thinkingStepId;
  }

  function selectAssistantVariant(messageId: string, variantIndex: number) {
    updateActiveChatMessages(
      (currentMessages) =>
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
      { touch: false },
    );
  }

  function updateProvidersState(
    updater: (state: ProvidersState) => ProvidersState,
  ) {
    setProvidersState((currentState) => {
      const nextState = updater(currentState);
      const providers = nextState.providers.length
        ? nextState.providers.map(normalizeProviderForState)
        : [normalizeProviderForState(defaultProvider)];
      const activeProviderId = providers.some(
        (provider) => provider.id === nextState.activeProviderId,
      )
        ? nextState.activeProviderId
        : providers[0].id;

      return { providers, activeProviderId };
    });
  }

  function updateProviderSetting(patch: Partial<ProviderConfig>) {
    setProvidersState((currentState) => ({
      ...currentState,
      providers: currentState.providers.map((provider) =>
        provider.id === currentState.activeProviderId
          ? {
              ...provider,
              ...patch,
              id: provider.id,
            }
          : provider,
      ),
    }));
  }

  function addProvider() {
    const provider = createNewProvider();
    updateProvidersState((currentState) => ({
      providers: [...currentState.providers, provider],
      activeProviderId: provider.id,
    }));
  }

  function duplicateProvider(providerId: string) {
    const source = providers.find((provider) => provider.id === providerId);
    if (!source) return;

    const provider = normalizeProviderForState({
      ...source,
      id: createProviderId(),
      name: `${source.name} copy`,
    });

    updateProvidersState((currentState) => ({
      providers: [...currentState.providers, provider],
      activeProviderId: provider.id,
    }));
  }

  function deleteProvider(providerId: string) {
    if (providers.length <= 1) {
      showInfo("At least one provider is required.");
      return;
    }

    const remainingProviders = providers.filter(
      (provider) => provider.id !== providerId,
    );
    const fallbackProvider =
      remainingProviders.find((provider) => provider.id !== providerId) ??
      remainingProviders[0];

    updateProvidersState((currentState) => ({
      providers: currentState.providers.filter(
        (provider) => provider.id !== providerId,
      ),
      activeProviderId:
        currentState.activeProviderId === providerId
          ? fallbackProvider.id
          : currentState.activeProviderId,
    }));

    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.providerId === providerId
          ? {
              ...chat,
              providerId: fallbackProvider.id,
              model: getProviderFallbackModel(fallbackProvider),
            }
          : chat,
      ),
    );
  }

  function selectActiveChatProviderModel(providerId: string, model: string) {
    const normalizedModel = model.trim();
    if (!normalizedModel) return;

    if (activeChat) {
      updateChat(activeChat.id, (chat) => ({
        ...chat,
        providerId,
        model: normalizedModel,
      }));
    }

    setProvidersState((currentState) => ({
      ...currentState,
      activeProviderId: providerId,
      providers: currentState.providers.map((provider) =>
        provider.id === providerId
          ? { ...provider, model: normalizedModel }
          : provider,
      ),
    }));
    setIsSidebarModelComboboxOpen(false);
    setSidebarModelSearchValue("");
  }

  async function saveSettingsChanges() {
    try {
      await Promise.all([
        saveProvidersState(providersState),
        saveSystemPrompt(systemPrompt),
      ]);
      showSuccess("Providers saved.");
      setSettingsOpen(false);
    } catch (error) {
      console.error("Failed to save providers:", error);
      showError("Failed to save providers", labelForError(error));
    }
  }

  function validateProviderForGeneration(providerForRun: ProviderConfig) {
    if (!providerForRun.baseUrl.trim()) {
      showError("Provider base URL is required.");
      setSettingsOpen(true);
      return false;
    }

    if (!providerForRun.model.trim()) {
      showError(
        "Model name is required",
        "Select a visible model in the sidebar model selector.",
      );
      return false;
    }

    return true;
  }

  function resolveProviderForChat(chat: ChatSession) {
    const provider =
      providers.find((item) => item.id === chat.providerId) ?? activeProvider;
    const model = chat.model?.trim() || getProviderFallbackModel(provider);

    return normalizeProviderForState({ ...provider, model });
  }

  function setChatGenerating(chatId: string, isGenerating: boolean) {
    setGeneratingChatIds((currentChatIds) => {
      const nextChatIds = isGenerating
        ? [...new Set([...currentChatIds, chatId])]
        : currentChatIds.filter((currentChatId) => currentChatId !== chatId);
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
    const generation = generationRefs.current[chatId];
    if (!generation) return;

    flushBufferedAssistantVariant(
      getStreamBufferKey(
        chatId,
        generation.assistantMessageId,
        generation.variantId,
      ),
    );
    const chat = chats.find((item) => item.id === chatId);
    const assistantMessage = chat?.messages.find(
      (message): message is Extract<ChatMessage, { role: "assistant" }> =>
        message.id === generation.assistantMessageId &&
        message.role === "assistant",
    );
    const activeVariant = assistantMessage
      ? getActiveVariant(assistantMessage)
      : undefined;
    const visualFlushKeys = [
      generation.assistantMessageId,
      ...(activeVariant?.processSteps ?? []).map(
        (step) => `${generation.assistantMessageId}:${step.id}`,
      ),
    ];

    setVisualFlushRequests((current) => {
      const next = { ...current };
      for (const key of visualFlushKeys) {
        next[key] = (next[key] ?? 0) + 1;
      }
      return next;
    });
    updateAssistantVariant(
      chatId,
      generation.assistantMessageId,
      generation.variantId,
      (variant) => ({
        ...variant,
        processSteps: keepOnlyLatestChecklistListStep(
          cancelUnfinishedChecklistListSteps(variant.processSteps ?? []),
        ),
      }),
      { touch: false },
    );
    generation.controller.abort();
  }

  async function runAssistantVariant({
    chatId,
    contextMessages,
    userMessage,
    assistantMessageId,
    variantId,
    responseStartedAtMs,
    providerForRun,
    toolsForRun,
  }: {
    chatId: string;
    contextMessages: ChatMessage[];
    userMessage: string;
    assistantMessageId: string;
    variantId: string;
    responseStartedAtMs: number;
    providerForRun: ProviderConfig;
    toolsForRun: LoadedToolInfo[];
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
      armStickyScrollToBottom();
    }

    toast.dismiss();

    let toolCallsForContext: ChatToolCall[] = [];
    let toolResultsForContext: ChatToolResult[] = [];
    let accumulatedContent = "";
    let accumulatedReasoning = "";

    const markVariantDone = (
      streamResult: Awaited<ReturnType<typeof streamProviderChat>>,
    ) => {
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
    };

    const appendToolCallsToVariant = (toolCalls: ChatToolCall[]) => {
      toolCallsForContext = [...toolCallsForContext, ...toolCalls];
      const toolSteps: ChatAssistantProcessStep[] = toolCalls.map(
        (toolCall) => {
          if (toolCall.function.name === ASK_USER_TOOL_NAME) {
            try {
              return {
                id: createId(),
                type: "user_input" as const,
                status: "waiting" as const,
                toolCall,
                request: parseAskUserRequestFromToolCall(toolCall),
              };
            } catch {
              // Keep invalid ask_user calls visible as failed tool executions once
              // executeToolCall returns the validation error.
            }
          }

          if (toolCall.function.name === CHECKLIST_WRITE_TOOL_NAME) {
            try {
              return {
                id: createId(),
                type: "checklist" as const,
                status: "pending" as const,
                toolCall,
                request: parseChecklistWriteRequestFromToolCall(toolCall),
              };
            } catch {
              // Keep invalid checklist_write calls visible as failed tool executions once
              // executeToolCall returns the validation error.
            }
          }

          return {
            id: createId(),
            type: "tool_execution" as const,
            status: "pending" as const,
            toolCall,
          };
        },
      );

      updateAssistantVariant(
        chatId,
        assistantMessageId,
        variantId,
        (variant) => ({
          ...variant,
          toolCalls: [...(variant.toolCalls ?? []), ...toolCalls],
          processSteps: [...(variant.processSteps ?? []), ...toolSteps],
        }),
        { touch: false },
      );

      return new Map(
        toolCalls.map(
          (toolCall, index) =>
            [toolCall.id, toolSteps[index]?.id ?? toolCall.id] as const,
        ),
      );
    };

    const applyToolResultToVisibleStep = (toolResult: ChatToolResult) => {
      updateAssistantVariant(
        chatId,
        assistantMessageId,
        variantId,
        (variant) => ({
          ...variant,
          processSteps: keepOnlyLatestChecklistListStep(
            (variant.processSteps ?? []).map((step) => {
              if (
                step.type !== "tool_execution" &&
                step.type !== "user_input" &&
                step.type !== "checklist"
              ) {
                return step;
              }

              if (step.toolCall.id !== toolResult.toolCallId) return step;

              return {
                ...step,
                status: toolResult.isError ? "failed" : "complete",
                toolResult,
              };
            }),
          ),
        }),
        { touch: false },
      );
    };

    const applyToolResultsToVariant = (toolResults: ChatToolResult[]) => {
      toolResultsForContext = [...toolResultsForContext, ...toolResults];

      updateAssistantVariant(
        chatId,
        assistantMessageId,
        variantId,
        (variant) => {
          const existingResults = variant.toolResults ?? [];
          const existingResultIds = new Set(
            existingResults.map((result) => result.toolCallId),
          );
          const newResults = toolResults.filter(
            (toolResult) => !existingResultIds.has(toolResult.toolCallId),
          );

          return {
            ...variant,
            toolResults: [...existingResults, ...newResults],
          };
        },
        { touch: false },
      );
    };

    const bufferKey = getStreamBufferKey(chatId, assistantMessageId, variantId);

    const buildContinuationMessages = (): ChatMessage[] => [
      ...contextMessages,
      {
        id: createId(),
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString(),
      },
      {
        id: assistantMessageId,
        role: "assistant",
        activeVariantIndex: 0,
        createdAt: new Date().toISOString(),
        variants: [
          {
            id: variantId,
            content: accumulatedContent,
            reasoning: accumulatedReasoning,
            status: "streaming",
            createdAt: new Date().toISOString(),
            toolCalls: toolCallsForContext,
            toolResults: toolResultsForContext,
          },
        ],
      },
    ];

    try {
      let currentMessages = contextMessages;
      let currentUserMessage: string | undefined = userMessage;
      let lastStreamResult:
        | Awaited<ReturnType<typeof streamProviderChat>>
        | undefined;

      for (let toolRound = 0; toolRound <= MAX_TOOL_ROUNDS; toolRound += 1) {
        const thinkingStepId = createId();
        appendAssistantProcessSteps(chatId, assistantMessageId, variantId, [
          { id: thinkingStepId, type: "thinking", content: "" },
        ]);
        setActiveStreamProcessStep(bufferKey, {
          type: "thinking",
          id: thinkingStepId,
        });

        if (chatId === activeChatId) {
          scheduleStickyScrollToBottom({
            settleFrames: STICKY_SCROLL_SETTLE_FRAMES,
          });
        }

        const streamResult = await streamProviderChat({
          provider: providerForRun,
          systemPrompt,
          messages: currentMessages,
          userMessage: currentUserMessage,
          signal: controller.signal,
          tools: toolsForRun,
          onContentDelta: (delta) => {
            accumulatedContent += delta;
            const assistantMessageStepId = ensureAssistantMessageProcessStep(
              chatId,
              assistantMessageId,
              variantId,
              bufferKey,
            );
            appendBufferedAssistantVariant(
              chatId,
              assistantMessageId,
              variantId,
              {
                type: "content",
                delta,
                assistantMessageStepId,
              },
            );

            if (chatId === activeChatId) {
              scheduleStickyScrollToBottom();
            }
          },
          onReasoningDelta: (delta) => {
            accumulatedReasoning += delta;

            const activeStep = getActiveStreamProcessStep(bufferKey);
            const isWhitespaceOnlyReasoning = delta.trim().length === 0;

            // Some OpenAI-compatible providers emit whitespace-only reasoning
            // deltas in the middle of normal content streaming. Those invisible
            // reasoning chunks should not split one visible assistant answer into
            // multiple message blocks.
            if (isWhitespaceOnlyReasoning && activeStep?.type !== "thinking") {
              return;
            }

            const reasoningStepId = ensureThinkingProcessStep(
              chatId,
              assistantMessageId,
              variantId,
              bufferKey,
            );
            appendBufferedAssistantVariant(
              chatId,
              assistantMessageId,
              variantId,
              {
                type: "reasoning",
                delta,
                reasoningStepId,
              },
            );

            if (chatId === activeChatId) {
              scheduleStickyScrollToBottom();
            }
          },
        });

        lastStreamResult = streamResult;

        flushBufferedAssistantVariant(bufferKey);

        const toolCalls = streamResult.toolCalls ?? [];
        if (!toolCalls.length) break;

        if (toolRound >= MAX_TOOL_ROUNDS) {
          throw new Error(
            `Stopped after ${MAX_TOOL_ROUNDS} tool rounds to avoid an infinite loop.`,
          );
        }

        const toolStepIdsByToolCallId = appendToolCallsToVariant(toolCalls);
        setActiveStreamProcessStep(bufferKey, { type: "tool_execution" });

        if (chatId === activeChatId) {
          scheduleStickyScrollToBottom({
            force: true,
            settleFrames: STICKY_SCROLL_SETTLE_FRAMES,
          });
        }

        const toolResults = await Promise.all(
          toolCalls.map(async (toolCall) => {
            const toolResult = await executeToolCall(toolCall, {
              chatId,
              assistantMessageId,
              variantId,
              stepId: toolStepIdsByToolCallId.get(toolCall.id) ?? toolCall.id,
              signal: controller.signal,
            });

            applyToolResultToVisibleStep(toolResult);

            if (chatId === activeChatId) {
              scheduleStickyScrollToBottom({
                force: true,
                settleFrames: STICKY_SCROLL_SETTLE_FRAMES,
              });
            }

            return toolResult;
          }),
        );
        applyToolResultsToVariant(toolResults);

        if (chatId === activeChatId) {
          scheduleStickyScrollToBottom({
            force: true,
            settleFrames: STICKY_SCROLL_SETTLE_FRAMES,
          });
        }

        currentMessages = buildContinuationMessages();
        currentUserMessage = undefined;
      }

      flushBufferedAssistantVariant(bufferKey);

      markVariantDone(lastStreamResult ?? {});
    } catch (error) {
      const wasAborted =
        error instanceof DOMException && error.name === "AbortError";

      flushBufferedAssistantVariant(bufferKey);

      const durationMs = Math.max(1, performance.now() - responseStartedAtMs);

      if (wasAborted) {
        setVisualFlushRequests((current) => ({
          ...current,
          [assistantMessageId]: (current[assistantMessageId] ?? 0) + 1,
        }));
      }
      updateAssistantVariant(
        chatId,
        assistantMessageId,
        variantId,
        (variant) => {
          const currentContent = variant.content.trim();
          const appendedContent = wasAborted
            ? variant.content
              ? ""
              : "Generation stopped."
            : currentContent
              ? `\n\nError: ${labelForError(error)}`
              : `Error: ${labelForError(error)}`;
          const content = `${variant.content}${appendedContent}`;
          const baseProcessSteps = keepOnlyLatestChecklistListStep(
            cancelUnfinishedChecklistListSteps(variant.processSteps ?? []),
          );
          const processSteps = appendedContent.trim()
            ? [
                ...baseProcessSteps,
                {
                  id: createId(),
                  type: "assistant_message" as const,
                  content: appendedContent,
                },
              ]
            : baseProcessSteps;

          return {
            ...variant,
            status: wasAborted ? "done" : "error",
            content,
            processSteps,
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
      delete streamActiveProcessStepRefs.current[bufferKey];
      delete streamBuffersRef.current[bufferKey];
      const currentGeneration = generationRefs.current[chatId];
      if (currentGeneration?.controller === controller) {
        delete generationRefs.current[chatId];
        setChatGenerating(chatId, false);
        setStreamingAssistantByChatId((current) => {
          const { [chatId]: _removed, ...remaining } = current;
          return remaining;
        });
      }

      if (chatId === activeChatId) {
        if (autoScrollEnabledRef.current && !isStickyScrollSuppressed()) {
          scheduleStickyScrollToBottom({
            force: true,
            settleFrames: STICKY_SCROLL_SETTLE_FRAMES,
          });
        } else {
          syncChatScrollState();
        }
      }
    }
  }

  async function sendMessage(content: string) {
    const userMessage = content.trim();

    if (!activeChat) return false;
    if (isChatGenerating(activeChat.id)) return false;

    const providerForRun = resolveProviderForChat(activeChat);
    if (!validateProviderForGeneration(providerForRun)) return false;

    if (!userMessage) {
      showError("Message is required.");
      return false;
    }

    const oneShotToolNames = validateToolMentionsForRequest(userMessage);
    if (!oneShotToolNames) return false;

    const toolsForRun = getEnabledToolsForChat(activeChat, oneShotToolNames);

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
          processSteps: [],
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

    // Enable sticky bottom behavior for this new generation.
    armStickyScrollToBottom();
    updateChat(activeChat.id, (chat) => ({
      ...chat,
      title:
        chat.messages.length === 0 && chat.title === "New chat"
          ? titleFromMessage(userMessage)
          : chat.title,
      messages: nextMessages,
      providerId: providerForRun.id,
      model: providerForRun.model,
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
      toolsForRun,
    });

    return true;
  }

  async function regenerateAssistantMessage(assistantMessageId: string) {
    if (!activeChat) return;
    if (isChatGenerating(activeChat.id)) return;

    const providerForRun = resolveProviderForChat(activeChat);
    if (!validateProviderForGeneration(providerForRun)) return;

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
    const oneShotToolNames = validateToolMentionsForRequest(userMessage);
    if (!oneShotToolNames) return;

    const toolsForRun = getEnabledToolsForChat(activeChat, oneShotToolNames);
    const contextMessages = activeChat.messages.slice(0, userIndex);
    const variantId = createId();
    const responseStartedAtMs = performance.now();
    const responseStartedAt = new Date().toISOString();

    armStickyScrollToBottom();

    updateActiveChatMessages(
      (currentMessages) =>
        currentMessages.slice(0, assistantIndex + 1).map((message) => {
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
                processSteps: [],
              },
            ],
            activeVariantIndex: message.variants.length,
          };
        }),
      { touch: false },
    );

    armStickyScrollToBottom();

    await runAssistantVariant({
      chatId: activeChat.id,
      contextMessages,
      userMessage,
      assistantMessageId,
      variantId,
      responseStartedAtMs,
      providerForRun,
      toolsForRun,
    });
  }

  async function submitEditedUserMessage(
    messageId: string,
    editedContent: string,
  ) {
    if (!activeChat) return;
    if (isChatGenerating(activeChat.id)) return;

    const providerForRun = resolveProviderForChat(activeChat);
    if (!validateProviderForGeneration(providerForRun)) return;

    const userMessage = editedContent.trim();
    if (!userMessage) {
      showError("Message is required.");
      return;
    }

    const oneShotToolNames = validateToolMentionsForRequest(userMessage);
    if (!oneShotToolNames) return;

    const toolsForRun = getEnabledToolsForChat(activeChat, oneShotToolNames);

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
          processSteps: [],
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

    armStickyScrollToBottom();
    setEditingMessageId(null);

    updateChat(activeChat.id, (chat) => ({
      ...chat,
      title: userIndex === 0 ? titleFromMessage(userMessage) : chat.title,
      messages: nextMessages,
      providerId: providerForRun.id,
      model: providerForRun.model,
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
      toolsForRun,
    });
  }

  const {
    startEditingUserMessage,
    cancelEditingUserMessage,
    copyLinkHref,
    deleteMessage,
    copyMessageContent,
    saveEditedUserMessage,
    stopGeneration,
    createNewChat,
    switchChat,
    clearCurrentChat,
    removeChat,
    toggleActiveChatTool,
  } = useChatActions({
    activeChat,
    activeChatId,
    activeProvider,
    availableTools,
    chats,
    globallyEnabledToolNames,
    isSending,
    messageElementRefs,
    setActiveChatId,
    setChats,
    setCopiedMessageId,
    setEditingMessageId,
    resetChatScrollState,
    focusDraftTextarea,
    isChatGenerating,
    stopChatGeneration,
    showError,
    showInfo,
    showSuccess,
    updateActiveChatMessages,
    updateChat,
  });

  const handleProvidersStateChange = useStableCallback(updateProvidersState);
  const handleProviderSettingChange = useStableCallback(updateProviderSetting);
  const handleAddProvider = useStableCallback(addProvider);
  const handleDuplicateProvider = useStableCallback(duplicateProvider);
  const handleDeleteProvider = useStableCallback(deleteProvider);
  const handleSaveSettingsChanges = useStableCallback(saveSettingsChanges);
  const stableShowSuccess = useStableCallback(showSuccess);
  const stableShowError = useStableCallback(showError);
  const toolDisplayKey = useMemo(
    () =>
      loadedTools
        .map((tool) => `${tool.name}:${tool.description ?? ""}`)
        .join("\n"),
    [loadedTools],
  );
  const stableRegisterMessageElement = useStableCallback(registerMessageElement);
  const stableRenderToolExecutionBlock = useStableCallback(renderToolExecutionBlock);
  const stableCanSubmitAskUserResponse = useStableCallback((toolCallId: string) =>
    Boolean(pendingAskUserRequestsRef.current[toolCallId]),
  );
  const stableCaptureMessageContext = useStableCallback(captureMessageContext);
  const stableCloseMessageContextMenu = useStableCallback(closeMessageContextMenu);
  const stableCopyLinkHref = useStableCallback(copyLinkHref);
  const stableCopyMessageContent = useStableCallback(copyMessageContent);
  const stableRegenerateAssistantMessage = useStableCallback(
    regenerateAssistantMessage,
  );
  const stableStartEditingUserMessage = useStableCallback(startEditingUserMessage);
  const stableDeleteMessage = useStableCallback(deleteMessage);
  const stableCancelEditingUserMessage = useStableCallback(
    cancelEditingUserMessage,
  );
  const stableSaveEditedUserMessage = useStableCallback(saveEditedUserMessage);
  const stableSubmitEditedUserMessage = useStableCallback(submitEditedUserMessage);
  const stableSelectAssistantVariant = useStableCallback(selectAssistantVariant);
  const stableToggleToolExecutionCollapsed = useStableCallback(
    toggleToolExecutionCollapsed,
  );
  const stableSubmitAskUserResponse = useStableCallback(submitAskUserResponse);
  const stableCancelAskUserRequest = useStableCallback(cancelAskUserRequest);
  const stableHandleAskUserLayoutChange = useStableCallback(
    handleAskUserLayoutChange,
  );
  const stableHandleAssistantVisualProgress = useStableCallback(
    handleAssistantVisualProgress,
  );
  const stableHandleAssistantVisualStreamingChange = useStableCallback(
    handleAssistantVisualStreamingChange,
  );

  if (!mounted) {
    return (
      <main className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
        Loading...
      </main>
    );
  }

  return (
    <main className="relative flex h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <ChatSidebar
        appName={APP_NAME}
        appVersionLabel={APP_VERSION_LABEL}
        groupedChats={groupedChats}
        activeChatId={activeChat?.id}
        isCollapsed={isSidebarCollapsed}
        resolvedTheme={resolvedTheme}
        onCollapsedChange={setIsSidebarCollapsed}
        onSwitchChat={switchChat}
        onRemoveChat={removeChat}
        onCreateNewChat={createNewChat}
        onOpenProviders={() => setSettingsOpen(true)}
        onOpenTools={() => setToolsOpen(true)}
        onOpenSystemPrompt={() => setSystemPromptOpen(true)}
        onSetTheme={setTheme}
        onClearCurrentChat={clearCurrentChat}
      />

      <section className="relative grid min-h-0 flex-1 grid-rows-[1fr_auto] bg-background">
        {findBarOpen && (
          <FindBar
            inputRef={findInputRef}
            query={findQuery}
            activeMatchOrdinal={findResult.activeMatchOrdinal}
            matches={findResult.matches}
            onQueryChange={setFindQuery}
            onFindNext={findNextMatch}
            onClose={closeFindBar}
          />
        )}

        <div
          className="relative min-h-0 overflow-hidden"
          onWheel={handleChatWheel}
          onPointerDown={handleChatPointerDown}
        >
          <div
            ref={chatScrollRef}
            data-chat-scroll
            onScroll={handleChatScroll}
            className={cn(
              "chat-scrollbar h-full w-full [overflow-anchor:none]",
              hasMessages ? "overflow-y-auto py-3 md:py-6" : "overflow-hidden",
            )}
          >
            <div
              ref={chatContentRef}
              className={cn(
                "mx-auto flex w-full min-w-0 max-w-3xl flex-col [overflow-anchor:none]",
                hasMessages ? "gap-5" : "h-full",
              )}
            >
              {!hasMessages ? (
                <EmptyChatState onOpenProviders={() => setSettingsOpen(true)} />
              ) : (
                <ChatMessageList
                  messages={messages}
                  activeChatId={activeChat?.id ?? ""}
                  isSending={isSending}
                  editingMessageId={editingMessageId}
                  copiedMessageId={copiedMessageId}
                  messageContextMenu={messageContextMenu}
                  visualFlushRequests={visualFlushRequests}
                  visualStreamingMessageIds={visualStreamingMessageIds}
                  collapsedToolStepIds={collapsedToolStepIds}
                  toolDisplayKey={toolDisplayKey}
                  registerMessageElement={stableRegisterMessageElement}
                  renderToolExecutionBlock={stableRenderToolExecutionBlock}
                  canSubmitAskUserResponse={stableCanSubmitAskUserResponse}
                  onCaptureMessageContext={stableCaptureMessageContext}
                  onCloseMessageContextMenu={stableCloseMessageContextMenu}
                  onCopyLinkHref={stableCopyLinkHref}
                  onCopyMessageContent={stableCopyMessageContent}
                  onRegenerateAssistantMessage={stableRegenerateAssistantMessage}
                  onStartEditingUserMessage={stableStartEditingUserMessage}
                  onDeleteMessage={stableDeleteMessage}
                  onCancelEditingUserMessage={stableCancelEditingUserMessage}
                  onSaveEditedUserMessage={stableSaveEditedUserMessage}
                  onSubmitEditedUserMessage={stableSubmitEditedUserMessage}
                  onSelectAssistantVariant={stableSelectAssistantVariant}
                  onToggleToolExecutionCollapsed={stableToggleToolExecutionCollapsed}
                  onSubmitAskUserResponse={stableSubmitAskUserResponse}
                  onCancelAskUserRequest={stableCancelAskUserRequest}
                  onAskUserLayoutChange={stableHandleAskUserLayoutChange}
                  onAssistantVisualProgress={stableHandleAssistantVisualProgress}
                  onAssistantVisualStreamingChange={
                    stableHandleAssistantVisualStreamingChange
                  }
                />
              )}
              <div
                ref={chatBottomRef}
                aria-hidden="true"
                className="h-px w-full shrink-0"
              />
            </div>
          </div>

          {hasMessages &&
            isChatScrollable &&
            !isNearChatBottom &&
            showScrollToBottomButton && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 right-[-74px] z-10 px-3 md:px-4">
                <div className="mx-auto flex w-full max-w-3xl justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="pointer-events-auto rounded-lg shadow-md opacity-80 hover:opacity-100"
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
          draftKey={activeChatId ?? ""}
          draft={activeComposerDraft}
          onDraftChange={updateActiveComposerDraft}
          onSend={sendMessage}
          onStop={stopGeneration}
          footerStart={<ComposerFooter
            activeChatExists={Boolean(activeChat)}
            isSending={isSending}
            activeChatProvider={activeChatProvider}
            activeChatModel={activeChatModel}
            visibleProviderGroups={visibleProviderGroups}
            isModelPickerOpen={isSidebarModelComboboxOpen}
            onModelPickerOpenChange={setIsSidebarModelComboboxOpen}
            modelSearchValue={sidebarModelSearchValue}
            onModelSearchValueChange={setSidebarModelSearchValue}
            onSelectProviderModel={selectActiveChatProviderModel}
            visibleChatTools={visibleChatTools}
            selectedToolNames={activeChatEnabledToolNames}
            isToolPickerOpen={isChatToolPickerOpen}
            onToolPickerOpenChange={setIsChatToolPickerOpen}
            toolSearchValue={chatToolSearchValue}
            onToolSearchValueChange={setChatToolSearchValue}
            onToggleTool={toggleActiveChatTool}
          />}
          toolMentionOptions={toolMentionOptions}
        />
      </section>

      <ProviderSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        providers={providers}
        activeProvider={activeProvider}
        onProvidersStateChange={handleProvidersStateChange}
        onProviderSettingChange={handleProviderSettingChange}
        onAddProvider={handleAddProvider}
        onDuplicateProvider={handleDuplicateProvider}
        onDeleteProvider={handleDeleteProvider}
        onSave={handleSaveSettingsChanges}
        showSuccess={stableShowSuccess}
      />

      <ToolsDialog
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        toolsSettings={toolsSettings}
        onToolsSettingsChange={setToolsSettings}
        loadedTools={loadedTools}
        onLoadedToolsChange={setLoadedTools}
        showSuccess={stableShowSuccess}
        showError={stableShowError}
      />

      <SystemPromptDialog
        open={systemPromptOpen}
        value={systemPrompt}
        onOpenChange={setSystemPromptOpen}
        onValueChange={setSystemPrompt}
        showSuccess={stableShowSuccess}
        showError={stableShowError}
      />
    </main>
  );
}
