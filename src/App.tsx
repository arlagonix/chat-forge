"use client";

import {
  ArrowLeft,
  ChevronDown,
  Menu,
  Plus,
  Settings,
  Settings2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { AgentsDialog } from "@/components/agents-dialog";
import {
  AgentTranscriptChatView,
  AgentTranscriptSidebar,
} from "@/components/ai-chat/agent-transcript-dialog";
import { ChatCapabilitiesSidebar } from "@/components/ai-chat/chat-capabilities-dialog";
import {
  ChatComposer,
  type ChatComposerHandle,
} from "@/components/ai-chat/chat-composer";
import { InteractionDock } from "@/components/ai-chat/interaction-dock";
import {
  ChatMessageList,
  GenerationInfoSidebar,
} from "@/components/ai-chat/chat-message-list";
import { ComposerFooter } from "@/components/ai-chat/composer-footer";
import {
  ContextUsageIndicator,
  ContextUsageSidebar,
} from "@/components/ai-chat/context-usage-indicator";
import { EmptyChatState } from "@/components/ai-chat/empty-chat-state";
import { FindBar } from "@/components/ai-chat/find-bar";
import {
  ToolExecutionBlock,
  ToolExecutionDetailsSidebar,
  type ToolExecutionDetails,
} from "@/components/ai-chat/tool-execution-block";
import { WorkspaceRootsControl } from "@/components/ai-chat/workspace-roots-control";
import { AppMenu } from "@/components/app-menu";
import { ChatSidebar } from "@/components/chat-sidebar";
import { SystemPromptDialog } from "@/components/dialogs/system-prompt-dialog";
import { McpDialog } from "@/components/mcp-dialog";
import { ModesDialog } from "@/components/modes-dialog";
import { ProviderSettingsDialog } from "@/components/provider-settings-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import {
  SETTINGS_SECTION_LABELS,
  SettingsSidebar,
  type SettingsSection,
} from "@/components/settings/settings-sidebar";
import { SkillsDialog } from "@/components/skills-dialog";
import { ToolsDialog } from "@/components/tools-dialog";
import { Button } from "@/components/ui/button";
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog";
import { WindowControls } from "@/components/window-controls";
import { useChatActions } from "@/hooks/use-chat-actions";
import { useChatAutoscroll } from "@/hooks/use-chat-autoscroll";
import { useChatGeneration } from "@/hooks/use-chat-generation";
import { useMessageContextMenu } from "@/hooks/use-message-context-menu";
import { useStableCallback } from "@/hooks/use-stable-callback";
import {
  collectAgentRunsFromMessages,
  findAgentCallInMessages,
  findAgentRunItem,
} from "@/lib/ai-chat/agent-runs";
import { estimateAttachmentsTokens } from "@/lib/ai-chat/attachment-limits";
import {
  createBuiltInAgents,
  formatAgentDisplayName,
  isBuiltInAgentName,
} from "@/lib/ai-chat/builtin-agents";
import {
  applyBuiltInToolSettings,
  ASK_USER_TOOL,
  BASH_TOOL,
  BASH_TOOL_NAME,
  buildFileToolAutoApprovalFromToolsSettings,
  CALL_AGENT_TOOL,
  compareToolsByDisplayOrder,
  DEFAULT_AGENTS_SETTINGS,
  DEFAULT_SKILLS_SETTINGS,
  DEFAULT_TOOLS_SETTINGS,
  EDIT_TOOL,
  FILE_FIND_TOOL,
  FILE_SEARCH_TOOL,
  isValidToolName,
  READ_TOOL,
  TASK_TOOLS,
  WEB_FETCH_TOOL,
  WRITE_TOOL,
} from "@/lib/ai-chat/builtin-tools";
import {
  applyNewChatDraftSettings,
  buildNewChatDraftSettings,
  getFolderDefaultWorkspaceRoots,
  type NewChatDraftSettings,
} from "@/lib/ai-chat/chat-session-actions";
import {
  createId,
  createNewProvider,
  createProviderId,
  getEffectiveModelContext,
  getEnabledProviderModels,
  getProviderFallbackModel,
  getProviderThinkingLevels,
  labelForError,
  modelSupportsVision,
  normalizeProviderForState,
  providerDisplayName,
  sortChatsByUpdatedAt,
} from "@/lib/ai-chat/chat-utils";
import { buildContextUsageDetails } from "@/lib/ai-chat/context-usage";
import {
  buildLoadedMcpTools,
  createMcpExposedToolName,
  DEFAULT_MCP_SETTINGS,
  getMcpLegacyToolPermission,
  isValidMcpExposedToolName,
} from "@/lib/ai-chat/mcp";
import {
  DEFAULT_MODE_ID,
  getModePermissionMaps,
  normalizeModesState,
  resolveModeForChat,
} from "@/lib/ai-chat/modes";
import {
  getProjectInstructionsSnapshot,
  shouldRefreshProjectInstructions,
  type ProjectInstructionsSnapshot,
  type ProjectInstructionsState,
} from "@/lib/ai-chat/project-instructions";
import { defaultProvider } from "@/lib/ai-chat/provider-presets";
import {
  getEffectiveAgentPermission,
  getEffectiveGlobalAgentPermission,
  getEffectiveGlobalSkillAvailability,
  getEffectiveGlobalToolPermission,
  getEffectiveSkillAvailability,
  getEffectiveToolPermission,
  getEffectiveWorkspaceRoots,
  resolveProviderForChat,
  validateProviderForGeneration,
} from "@/lib/ai-chat/request-builder";
import {
  createEmptyChat,
  deleteChat,
  loadActiveChatId,
  loadAgents,
  loadAgentsSettings,
  loadAppSettings,
  loadChats,
  loadMcpSettings,
  loadModesState,
  loadProvidersState,
  loadSkills,
  loadSkillsSettings,
  loadSystemPrompt,
  loadTools,
  loadToolsSettings,
  DEFAULT_APP_SETTINGS,
  saveActiveChatId,
  saveAgentsSettings,
  saveAppSettings,
  saveChat,
  saveMcpSettings,
  saveModesState,
  saveProvidersState,
  saveSkillsSettings,
  saveSystemPrompt,
  saveToolsSettings,
} from "@/lib/ai-chat/storage";
import { createLoadSkillAssistantMessage } from "@/lib/ai-chat/skill-load-messages";
import {
  generateTitleFromChatContext,
  resolveTitleGenerationProvider,
} from "@/lib/ai-chat/title-generation";
import type {
  AgentsSettings,
  AppSettings,
  ChatAgentCall,
  ChatAssistantVariant,
  ChatAttachment,
  ChatFolder,
  ChatMessage,
  ChatSession,
  ChatThinkingMode,
  ChatToolCall,
  ChatToolResult,
  ChatWidth,
  ChatWorkspaceRoot,
  LoadedAgentInfo,
  LoadedSkillInfo,
  LoadedToolInfo,
  McpSettings,
  ModesState,
  ProviderConfig,
  ProvidersState,
  SkillsSettings,
  TerminalStreamEvent,
  TitleGenerationModelPreference,
  ToolCommandResult,
  ToolExecutionStatus,
  ToolsSettings,
} from "@/lib/ai-chat/types";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { toast } from "sonner";

const CHAT_WIDTH_CLASS_NAMES: Record<ChatWidth, string> = {
  "720": "max-w-[720px]",
  "768": "max-w-3xl",
  "896": "max-w-4xl",
  "1024": "max-w-5xl",
  full: "max-w-none",
};

const APP_NAME = "Molten Forge";
const APP_VERSION_LABEL = `v${__APP_VERSION__}`;
const APP_TITLE = `${APP_NAME} ${APP_VERSION_LABEL}`;
const CHAT_BOTTOM_OVERLAY_FADE_HEIGHT_PX = 48;
const CHAT_BOTTOM_CONTENT_CLEARANCE_PX = 16;
const SCROLL_TO_BOTTOM_GUTTER_REQUIRED_PX = 48;
const TITLE_GENERATION_CHAT_DEFAULT_VALUE = "chat-default";
const TITLE_GENERATION_CHAT_DEFAULT_OPTION = {
  value: TITLE_GENERATION_CHAT_DEFAULT_VALUE,
  label: "Chat default",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "molten-forge-sidebar-collapsed";
const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "molten-forge-left-sidebar-width";
const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "molten-forge-right-sidebar-width";

function encodeTitleGenerationModelValue(
  preference: TitleGenerationModelPreference,
) {
  return JSON.stringify(preference);
}

function decodeTitleGenerationModelValue(
  value: string,
): TitleGenerationModelPreference | undefined {
  if (value === TITLE_GENERATION_CHAT_DEFAULT_VALUE) return undefined;

  try {
    const parsed = JSON.parse(value) as Partial<TitleGenerationModelPreference>;
    const providerId = parsed.providerId?.trim() ?? "";
    const model = parsed.model?.trim() ?? "";
    return providerId && model ? { providerId, model } : undefined;
  } catch {
    return undefined;
  }
}
const COMPOSER_DRAFTS_STORAGE_KEY = "molten-forge-composer-drafts";
// Draft-state key for the unsaved "New chat" composer. A real chat is only
// created (and persisted) once the user sends the first message.
const NEW_CHAT_DRAFT_KEY = "__new_chat_draft__";

function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function loadStoredPanelWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof window === "undefined") return fallback;

  const storedValue = window.localStorage.getItem(key);
  if (storedValue === null) return fallback;

  const stored = Number(storedValue);
  if (!Number.isFinite(stored)) return fallback;

  return clampPanelWidth(stored, min, max);
}

function estimateTokens(value: unknown): number {
  if (typeof value === "string") return Math.ceil(value.length / 4);
  if (typeof value === "number" || typeof value === "boolean") {
    return Math.ceil(String(value).length / 4);
  }
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + estimateTokens(item), 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (sum, item) => sum + estimateTokens(item),
      0,
    );
  }
  return 0;
}

function buildAgentContextMessages(agentCall: ChatAgentCall): ChatMessage[] {
  const estimatedInputTokens = estimateTokens(agentCall.task);
  const estimatedOutputTokens =
    estimateTokens(agentCall.output) + estimateTokens(agentCall.reasoning);
  const estimatedToolTokens =
    estimateTokens(agentCall.toolCalls ?? []) +
    estimateTokens(agentCall.toolResults ?? []);
  const totalTokens =
    estimatedInputTokens + estimatedOutputTokens + estimatedToolTokens;

  return [
    {
      id: `${agentCall.id}:task`,
      role: "user",
      content: agentCall.task,
      createdAt: agentCall.startedAt,
    },
    {
      id: `${agentCall.id}:assistant`,
      role: "assistant",
      activeVariantIndex: 0,
      createdAt: agentCall.startedAt,
      variants: [
        {
          id: `${agentCall.id}:variant`,
          content: agentCall.output,
          reasoning: agentCall.reasoning,
          status:
            agentCall.status === "running" || agentCall.status === "pending"
              ? "streaming"
              : agentCall.status === "failed"
                ? "error"
                : "done",
          createdAt: agentCall.startedAt,
          metrics: {
            startedAt: agentCall.startedAt,
            completedAt: agentCall.completedAt,
            tokenUsage: {
              promptTokens: estimatedInputTokens,
              completionTokens: estimatedOutputTokens + estimatedToolTokens,
              totalTokens,
              breakdown: {
                input: estimatedInputTokens,
                output: estimatedOutputTokens + estimatedToolTokens,
              },
            },
            providerName: agentCall.providerName,
            model: agentCall.model,
          },
          toolCalls: agentCall.toolCalls,
          toolResults: agentCall.toolResults,
        },
      ],
    },
  ];
}

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

type FindInPageResultState = {
  activeMatchOrdinal: number;
  matches: number;
};

const EMPTY_FIND_RESULT: FindInPageResultState = {
  activeMatchOrdinal: 0,
  matches: 0,
};

function getMcpPermissionToolName(
  server: McpSettings["servers"][number],
  tool: NonNullable<McpSettings["servers"][number]["tools"]>[string],
) {
  return createMcpExposedToolName(server.name, tool.originalName);
}

function getStoredMcpPermissionToolName(
  server: McpSettings["servers"][number],
  tool: NonNullable<McpSettings["servers"][number]["tools"]>[string],
) {
  return tool.exposedName || getMcpPermissionToolName(server, tool);
}

function migrateMcpToolPermissions(
  toolsSettings: ToolsSettings,
  nextMcpSettings: McpSettings,
  previousMcpSettings?: McpSettings,
): ToolsSettings {
  const nextToolPermissions = { ...(toolsSettings.toolPermissions ?? {}) };
  const nextMcpToolNames = new Set<string>();
  let changed = false;

  for (const server of nextMcpSettings.servers) {
    for (const tool of Object.values(server.tools ?? {})) {
      const exposedName = getMcpPermissionToolName(server, tool);
      if (isValidMcpExposedToolName(exposedName)) {
        nextMcpToolNames.add(exposedName);
      }
    }
  }

  const previousServersById = new Map(
    (previousMcpSettings?.servers ?? []).map((server) => [server.id, server]),
  );

  for (const server of nextMcpSettings.servers) {
    const previousServer = previousServersById.get(server.id);

    for (const tool of Object.values(server.tools ?? {})) {
      const exposedName = getMcpPermissionToolName(server, tool);
      if (!isValidMcpExposedToolName(exposedName)) continue;

      const previousTool = previousServer?.tools?.[tool.originalName];
      const previousExposedName =
        previousServer && previousTool
          ? getStoredMcpPermissionToolName(previousServer, previousTool)
          : tool.exposedName && tool.exposedName !== exposedName
            ? tool.exposedName
            : undefined;

      if (
        previousExposedName &&
        previousExposedName !== exposedName &&
        isValidMcpExposedToolName(previousExposedName) &&
        nextToolPermissions[previousExposedName] &&
        !nextToolPermissions[exposedName]
      ) {
        nextToolPermissions[exposedName] =
          nextToolPermissions[previousExposedName];
        changed = true;
      }

      if (!nextToolPermissions[exposedName]) {
        nextToolPermissions[exposedName] = getMcpLegacyToolPermission(
          server,
          tool,
        );
        changed = true;
      }

      if (
        previousExposedName &&
        previousExposedName !== exposedName &&
        isValidMcpExposedToolName(previousExposedName) &&
        !nextMcpToolNames.has(previousExposedName) &&
        nextToolPermissions[previousExposedName]
      ) {
        delete nextToolPermissions[previousExposedName];
        changed = true;
      }
    }
  }

  if (!changed) return toolsSettings;

  return {
    ...toolsSettings,
    enabled: toolsSettings.toolsPermission !== "deny",
    permissionModelVersion: 2,
    toolPermissions: nextToolPermissions,
  };
}

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
  const [skillsSettings, setSkillsSettings] = useState<SkillsSettings>(
    DEFAULT_SKILLS_SETTINGS,
  );
  const [agentsSettings, setAgentsSettings] = useState<AgentsSettings>(
    DEFAULT_AGENTS_SETTINGS,
  );
  const [appSettings, setAppSettings] = useState<AppSettings>({
    chatTitleGenerationMode: "local",
    titleGenerationModel: undefined,
    fontFamily: "sans",
    chatFolders: [],
    thinkingAutoCollapse: false,
    renderMarkdownWhileStreaming: true,
    chatWidth: "896",
  });
  const [mcpSettings, setMcpSettings] =
    useState<McpSettings>(DEFAULT_MCP_SETTINGS);
  const [modesState, setModesState] = useState<ModesState>(() =>
    normalizeModesState(undefined),
  );
  const [loadedTools, setLoadedTools] = useState<LoadedToolInfo[]>([]);
  const [loadedSkills, setLoadedSkills] = useState<LoadedSkillInfo[]>([]);
  const [loadedAgents, setLoadedAgents] = useState<LoadedAgentInfo[]>([]);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [projectInstructionsByChatId, setProjectInstructionsByChatId] =
    useState<Record<string, ProjectInstructionsState | undefined>>({});
  const projectInstructionsByChatIdRef = useRef<
    Record<string, ProjectInstructionsState | undefined>
  >({});
  const [activeChatId, setActiveChatId] = useState<string | undefined>();
  const [selectedAgentChatId, setSelectedAgentChatId] = useState<
    string | undefined
  >();
  const [selectedAgentSidebarId, setSelectedAgentSidebarId] = useState<
    string | undefined
  >();
  const [selectedAgentSidebarStack, setSelectedAgentSidebarStack] = useState<
    string[]
  >([]);
  const [isContextUsageSidebarOpen, setIsContextUsageSidebarOpen] =
    useState(false);
  const [isChatCapabilitiesSidebarOpen, setIsChatCapabilitiesSidebarOpen] =
    useState(false);
  const [selectedToolSidebarDetails, setSelectedToolSidebarDetails] =
    useState<ToolExecutionDetails>();
  const [selectedGenerationInfoVariant, setSelectedGenerationInfoVariant] =
    useState<ChatAssistantVariant>();
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() =>
    loadStoredPanelWidth(LEFT_SIDEBAR_WIDTH_STORAGE_KEY, 320, 240, 520),
  );
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() =>
    loadStoredPanelWidth(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY, 680, 560, 920),
  );
  // When true, we're composing an unsaved "New chat". No chat exists yet; the
  // real chat is created on first send. The composer draft lives under
  // NEW_CHAT_DRAFT_KEY so it survives switching to another chat and back.
  const [isNewChatDraft, setIsNewChatDraft] = useState(false);
  const pendingDraftSendRef = useRef<{
    chatId: string;
    content: string;
    attachments: ChatAttachment[];
  } | null>(null);
  const pendingAgentSubchatSwitchRef = useRef<{
    chatId: string;
    agentCallId: string;
  } | null>(null);
  const mainChatScrollTopBeforeAgentRef = useRef<number | null>(null);
  const [chatSwitchLoadingChatId, setChatSwitchLoadingChatId] = useState<
    string | null
  >(null);
  const [initialComposerDrafts] = useState<Record<string, string>>(() =>
    loadComposerDrafts(),
  );
  const composerDraftsRef = useRef<Record<string, string>>(
    initialComposerDrafts,
  );
  const [composerAttachmentsByKey, setComposerAttachmentsByKey] = useState<
    Record<string, ChatAttachment[]>
  >({});
  const [newChatDraftWorkspaceRoots, setNewChatDraftWorkspaceRoots] = useState<
    ChatWorkspaceRoot[]
  >([]);
  const [systemAccessibleRoots, setSystemAccessibleRoots] = useState<
    ChatWorkspaceRoot[]
  >([]);
  const [newChatDraftFolderId, setNewChatDraftFolderId] = useState<
    string | undefined
  >();
  const [newChatDraftModeId, setNewChatDraftModeId] = useState(DEFAULT_MODE_ID);
  const [newChatDraftSettings, setNewChatDraftSettings] = useState<
    NewChatDraftSettings | undefined
  >();
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [composerEditState, setComposerEditState] = useState<{
    chatId: string;
    messageId: string;
    previousDraft: string;
    previousAttachments: ChatAttachment[];
    preview: string;
  } | null>(null);
  const [generatingChatIds, setGeneratingChatIds] = useState<string[]>([]);
  const [completedGenerationChatIds, setCompletedGenerationChatIds] = useState<
    string[]
  >([]);
  const [titleGenerationChatIds, setTitleGenerationChatIds] = useState<
    string[]
  >([]);
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
  const [isModePickerOpen, setIsModePickerOpen] = useState(false);
  const [modeSearchValue, setModeSearchValue] = useState("");
  const [isThinkingModePickerOpen, setIsThinkingModePickerOpen] =
    useState(false);
  const [isChatToolPickerOpen, setIsChatToolPickerOpen] = useState(false);
  const [chatToolSearchValue, setChatToolSearchValue] = useState("");
  const [isWorkspacePickerOpen, setIsWorkspacePickerOpen] = useState(false);
  const [isChatSkillPickerOpen, setIsChatSkillPickerOpen] = useState(false);
  const [chatSkillSearchValue, setChatSkillSearchValue] = useState("");
  const [isChatAgentPickerOpen, setIsChatAgentPickerOpen] = useState(false);
  const [chatAgentSearchValue, setChatAgentSearchValue] = useState("");
  const [appView, setAppView] = useState<"chat" | "settings">("chat");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");
  const [isSettingsSidebarCollapsed, setIsSettingsSidebarCollapsed] =
    useState(false);
  const [settingsPageDirty, setSettingsPageDirty] = useState(false);
  const [settingsDiscardDialogOpen, setSettingsDiscardDialogOpen] =
    useState(false);
  const [pendingSettingsNavigation, setPendingSettingsNavigation] = useState<
    SettingsSection | "chat" | "new-chat" | "close" | null
  >(null);

  const openSettingsSection = useCallback((section: SettingsSection) => {
    setSettingsSection(section);
    setSettingsPageDirty(false);
    setIsSettingsSidebarCollapsed(false);
    setAppView("settings");
  }, []);

  const setSettingsOpen = useCallback(
    (nextValue: boolean | ((current: boolean) => boolean)) => {
      const currentOpen = appView === "settings";
      const nextOpen =
        typeof nextValue === "function"
          ? nextValue(currentOpen)
          : nextValue;
      if (nextOpen) {
        setIsSettingsSidebarCollapsed(false);
        setAppView("settings");
      } else {
        setAppView("chat");
      }
    },
    [appView],
  );
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
  const [collapsedThinkingStepIds, setCollapsedThinkingStepIds] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    projectInstructionsByChatIdRef.current = projectInstructionsByChatId;
  }, [projectInstructionsByChatId]);
  const { messageContextMenu, captureMessageContext, closeMessageContextMenu } =
    useMessageContextMenu();
  const messageElementRefs = useRef(new Map<string, HTMLDivElement>());
  const messageElementRefCallbacks = useRef(
    new Map<string, (element: HTMLDivElement | null) => void>(),
  );
  // Published by the virtualized ChatMessageList; lets useChatAutoscroll resolve
  // a saved scroll anchor to a scrollTop even when the message is windowed out.
  const messageOffsetResolverRef = useRef<
    ((messageId: string) => number | null) | null
  >(null);
  const chatComposerRef = useRef<ChatComposerHandle | null>(null);
  const [bottomPanelElement, setBottomPanelElement] =
    useState<HTMLDivElement | null>(null);
  const bottomPanelRef = useCallback((element: HTMLDivElement | null) => {
    setBottomPanelElement(element);
  }, []);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(0);
  const [scrollButtonAnchorElement, setScrollButtonAnchorElement] =
    useState<HTMLDivElement | null>(null);
  const scrollButtonAnchorRef = useCallback(
    (element: HTMLDivElement | null) => {
      setScrollButtonAnchorElement(element);
    },
    [],
  );
  const [scrollButtonPlacement, setScrollButtonPlacement] = useState<
    "right" | "above"
  >("above");
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const didHydrateRef = useRef(false);
  const composerDraftSaveTimeoutRef = useRef<number | null>(null);
  const chatSaveTimeoutRef = useRef<number | null>(null);
  const savedChatSnapshotsRef = useRef<Record<string, string>>({});
  const pendingChatSwitchTargetRef = useRef<string | null>(null);
  const pendingChatSwitchFrameRef = useRef<number | null>(null);
  const finishChatSwitchLoadingFrameRef = useRef<number | null>(null);

  const { theme, resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    document.title = APP_TITLE;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.chatFont = appSettings.fontFamily;
  }, [appSettings.fontFamily]);

  useEffect(() => {
    return window.moltenForgeFind?.onFoundInPage((result) => {
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
        event.code === "KeyF";

      if (!isFindShortcut || appView !== "chat") return;

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
  }, [appView]);

  useEffect(() => {
    if (!findBarOpen) {
      void window.moltenForgeFind?.stopFindInPage("clearSelection");
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

  useEffect(() => {
    window.localStorage.setItem(
      LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
      String(leftSidebarWidth),
    );
  }, [leftSidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
      String(rightSidebarWidth),
    );
  }, [rightSidebarWidth]);

  function runFindInPage(
    query: string,
    options: { forward?: boolean; findNext?: boolean } = {},
  ) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      void window.moltenForgeFind?.stopFindInPage("clearSelection");
      setFindResult(EMPTY_FIND_RESULT);
      return;
    }

    if (!window.moltenForgeFind) {
      setFindResult(EMPTY_FIND_RESULT);
      return;
    }

    void window.moltenForgeFind.findInPage({
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

  useEffect(() => {
    if (!findBarOpen) return;

    function handleFindNavigationShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeFindBar();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        findNextMatch(!event.shiftKey);
        return;
      }

      if (event.key === "F3") {
        event.preventDefault();
        event.stopPropagation();
        findNextMatch(!event.shiftKey);
      }
    }

    document.addEventListener("keydown", handleFindNavigationShortcut);

    return () => {
      document.removeEventListener("keydown", handleFindNavigationShortcut);
    };
  }, [closeFindBar, findBarOpen, findNextMatch]);

  function focusDraftTextarea() {
    chatComposerRef.current?.focus();
  }

  function registerMessageElement(messageId: string) {
    const existingCallback = messageElementRefCallbacks.current.get(messageId);

    if (existingCallback) {
      return existingCallback;
    }

    const callback = (element: HTMLDivElement | null) => {
      if (element) {
        messageElementRefs.current.set(messageId, element);
      } else {
        messageElementRefs.current.delete(messageId);
        messageElementRefCallbacks.current.delete(messageId);
      }
    };

    messageElementRefCallbacks.current.set(messageId, callback);
    return callback;
  }

  const sortedChats = useMemo(() => sortChatsByUpdatedAt(chats), [chats]);

  const activeChat = useMemo(() => {
    if (isNewChatDraft) return undefined;
    return (
      sortedChats.find((chat) => chat.id === activeChatId) ?? sortedChats[0]
    );
  }, [isNewChatDraft, activeChatId, sortedChats]);
  const activeOrDraftAutoApprove = isNewChatDraft
    ? newChatDraftSettings?.autoApprove === true
    : activeChat?.autoApprove === true;
  const composerDraftKey = isNewChatDraft
    ? NEW_CHAT_DRAFT_KEY
    : (activeChatId ?? "");
  const activeComposerDraft = composerDraftKey
    ? (composerDraftsRef.current[composerDraftKey] ?? "")
    : "";
  const activeComposerAttachments = composerDraftKey
    ? (composerAttachmentsByKey[composerDraftKey] ?? [])
    : [];
  const enabledModes = useMemo(
    () => normalizeModesState(modesState).modes.filter((mode) => mode.enabled),
    [modesState],
  );
  const activeMode = useMemo(
    () =>
      resolveModeForChat(
        isNewChatDraft ? newChatDraftModeId : activeChat?.modeId,
        modesState,
      ),
    [activeChat?.modeId, isNewChatDraft, modesState, newChatDraftModeId],
  );
  const visibleModes = useMemo(() => {
    const search = modeSearchValue.trim().toLowerCase();

    return enabledModes.filter((mode) =>
      search
        ? `${mode.name} ${mode.description}`.toLowerCase().includes(search)
        : true,
    );
  }, [enabledModes, modeSearchValue]);

  const providers = providersState.providers.length
    ? providersState.providers
    : [normalizeProviderForState(defaultProvider)];
  const activeProvider =
    providers.find(
      (provider) => provider.id === providersState.activeProviderId,
    ) ?? providers[0];
  const messages = activeChat?.messages ?? [];
  const hasMessages = messages.length > 0;
  const activeChatProvider = activeProvider;
  const activeChatModel = getProviderFallbackModel(activeChatProvider);
  const titleGenerationDefaultModelOption = TITLE_GENERATION_CHAT_DEFAULT_OPTION;
  const titleGenerationModelGroups = useMemo(
    () =>
      providers
        .map((provider) => ({
          id: provider.id,
          heading: providerDisplayName(provider),
          options: getEnabledProviderModels(provider).map((model) => ({
            value: encodeTitleGenerationModelValue({
              providerId: provider.id,
              model,
            }),
            label: model,
          })),
        }))
        .filter((group) => group.options.length > 0),
    [providers],
  );
  const titleGenerationModelOptions = useMemo(
    () => [
      titleGenerationDefaultModelOption,
      ...titleGenerationModelGroups.flatMap((group) => group.options),
    ],
    [titleGenerationDefaultModelOption, titleGenerationModelGroups],
  );
  const titleGenerationModelValue = appSettings.titleGenerationModel
    ? encodeTitleGenerationModelValue(appSettings.titleGenerationModel)
    : TITLE_GENERATION_CHAT_DEFAULT_VALUE;
  const resolvedTitleGenerationModelValue = titleGenerationModelOptions.some(
    (option) => option.value === titleGenerationModelValue,
  )
    ? titleGenerationModelValue
    : TITLE_GENERATION_CHAT_DEFAULT_VALUE;
  const agentSubchats = useMemo(
    () => collectAgentRunsFromMessages(messages),
    [messages],
  );
  const selectedAgentChat = useMemo(
    () => findAgentCallInMessages(messages, selectedAgentChatId),
    [messages, selectedAgentChatId],
  );
  const selectedAgentChatItem = useMemo(
    () => findAgentRunItem(agentSubchats, selectedAgentChatId),
    [agentSubchats, selectedAgentChatId],
  );
  const selectedAgentSidebarCall = useMemo(
    () => findAgentCallInMessages(messages, selectedAgentSidebarId),
    [messages, selectedAgentSidebarId],
  );
  useEffect(() => {
    if (selectedAgentChatId && !selectedAgentChat) {
      setSelectedAgentChatId(undefined);
    }
  }, [selectedAgentChat, selectedAgentChatId]);
  useEffect(() => {
    if (selectedAgentSidebarId && !selectedAgentSidebarCall) {
      setSelectedAgentSidebarId(undefined);
      setSelectedAgentSidebarStack([]);
    }
  }, [selectedAgentSidebarCall, selectedAgentSidebarId]);
  useEffect(() => {
    const pending = pendingAgentSubchatSwitchRef.current;
    if (!pending) return;
    if (activeChatId !== pending.chatId) return;

    pendingAgentSubchatSwitchRef.current = null;
    setSelectedAgentChatId(pending.agentCallId);
  }, [activeChatId]);
  const isSending = activeChat
    ? generatingChatIds.includes(activeChat.id)
    : false;
  const visibleProviderGroups = useMemo(() => {
    const search = sidebarModelSearchValue.trim().toLowerCase();

    return providers
      .map((provider) => {
        const models = getEnabledProviderModels(provider).filter((model) =>
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

  const loadedMcpTools = useMemo(
    () => buildLoadedMcpTools(mcpSettings),
    [mcpSettings],
  );

  const handleMcpSettingsChange = useCallback(
    (nextSettings: McpSettings) => {
      setToolsSettings((current) =>
        migrateMcpToolPermissions(current, nextSettings, mcpSettings),
      );
      setMcpSettings(nextSettings);
    },
    [mcpSettings],
  );

  const executableTools = useMemo(
    () => [...loadedTools, ...loadedMcpTools],
    [loadedTools, loadedMcpTools],
  );

  const availableTools = useMemo(() => {
    const byName = new Map<string, LoadedToolInfo>();

    for (const tool of [
      ASK_USER_TOOL,
      CALL_AGENT_TOOL,
      ...TASK_TOOLS,
      WEB_FETCH_TOOL,
      READ_TOOL,
      BASH_TOOL,
      EDIT_TOOL,
      WRITE_TOOL,
      FILE_FIND_TOOL,
      FILE_SEARCH_TOOL,
      ...loadedTools,
      ...loadedMcpTools,
    ]) {
      if (!isValidToolName(tool.name) || byName.has(tool.name)) continue;
      byName.set(tool.name, applyBuiltInToolSettings(tool, toolsSettings));
    }

    return [...byName.values()].sort(compareToolsByDisplayOrder);
  }, [loadedMcpTools, loadedTools, toolsSettings]);

  const availableToolsByName = useMemo(() => {
    return new Map(availableTools.map((tool) => [tool.name, tool] as const));
  }, [availableTools]);

  const effectiveToolPermissions = useMemo(() => {
    const context = {
      availableTools,
      availableSkills: [],
      availableAgents: [],
    };
    return new Map(
      availableTools.map(
        (tool) =>
          [
            tool.name,
            getEffectiveToolPermission({
              toolName: tool.name,
              toolsSettings,
              mode: activeMode,
              modeCapabilityContext: context,
              autoApprove: activeOrDraftAutoApprove,
            }),
          ] as const,
      ),
    );
  }, [
    activeMode,
    activeOrDraftAutoApprove,
    availableTools,
    toolsSettings,
  ]);

  const globalToolPermissions = useMemo(() => {
    return new Map(
      availableTools.map(
        (tool) =>
          [
            tool.name,
            getEffectiveGlobalToolPermission(tool.name, toolsSettings),
          ] as const,
      ),
    );
  }, [availableTools, toolsSettings]);

  const globallyEnabledToolNames = useMemo(() => {
    return new Set(
      availableTools
        .filter((tool) => effectiveToolPermissions.get(tool.name) !== "deny")
        .map((tool) => tool.name),
    );
  }, [availableTools, effectiveToolPermissions]);

  const modeDefaultEnabledToolNames = globallyEnabledToolNames;
  const activeChatEnabledToolNames = useMemo(
    () => [...modeDefaultEnabledToolNames],
    [modeDefaultEnabledToolNames],
  );

  const visibleChatTools = useMemo(() => {
    const search = chatToolSearchValue.trim().toLowerCase();
    if (!search) return availableTools;
    return availableTools.filter((tool) =>
      `${tool.name} ${tool.description}`.toLowerCase().includes(search),
    );
  }, [availableTools, chatToolSearchValue]);

  const availableSkills = useMemo(() => {
    const byName = new Map<string, LoadedSkillInfo>();

    for (const skill of loadedSkills) {
      if (!isValidToolName(skill.name)) continue;
      const existing = byName.get(skill.name);
      if (!existing) {
        byName.set(skill.name, skill);
        continue;
      }

      if (
        existing.sourceKind !== "workspace" &&
        skill.sourceKind === "workspace"
      ) {
        byName.set(skill.name, skill);
      }
    }

    return [...byName.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [loadedSkills]);

  const availableSkillsByName = useMemo(() => {
    return new Map(
      availableSkills.map((skill) => [skill.name, skill] as const),
    );
  }, [availableSkills]);

  const activeChatVisibleWorkspaceRoots = useMemo(() => {
    const userRoots = isNewChatDraft
      ? newChatDraftWorkspaceRoots
      : activeChat
        ? (activeChat.workspaceRoots ?? [])
        : [];

    return getEffectiveWorkspaceRoots({
      workspaceRoots: [...systemAccessibleRoots, ...userRoots],
      activeSkillNames: [],
      availableSkillsByName,
    });
  }, [
    activeChat,
    isNewChatDraft,
    newChatDraftWorkspaceRoots,
    systemAccessibleRoots,
    availableSkillsByName,
  ]);

  const effectiveSkillAvailability = useMemo(() => {
    const context = {
      availableTools,
      availableSkills,
      availableAgents: [],
    };
    return new Map(
      availableSkills.map(
        (skill) =>
          [
            skill.name,
            getEffectiveSkillAvailability({
              skillName: skill.name,
              skillsSettings,
              mode: activeMode,
              modeCapabilityContext: context,
            }),
          ] as const,
      ),
    );
  }, [activeMode, availableSkills, availableTools, skillsSettings]);

  const globalSkillAvailability = useMemo(() => {
    return new Map(
      availableSkills.map(
        (skill) =>
          [
            skill.name,
            getEffectiveGlobalSkillAvailability(skill.name, skillsSettings),
          ] as const,
      ),
    );
  }, [availableSkills, skillsSettings]);

  const globallyEnabledSkillNames = useMemo(() => {
    return new Set(
      availableSkills
        .filter((skill) => effectiveSkillAvailability.get(skill.name) === "on")
        .map((skill) => skill.name),
    );
  }, [availableSkills, effectiveSkillAvailability]);

  const modeDefaultEnabledSkillNames = globallyEnabledSkillNames;
  const activeChatEnabledSkillNames = useMemo(
    () => [...modeDefaultEnabledSkillNames],
    [modeDefaultEnabledSkillNames],
  );

  const visibleChatSkills = useMemo(() => {
    const search = chatSkillSearchValue.trim().toLowerCase();
    if (!search) return availableSkills;
    return availableSkills.filter((skill) =>
      `${skill.name} ${skill.description}`.toLowerCase().includes(search),
    );
  }, [availableSkills, chatSkillSearchValue]);

  const skillMentionOptions = useMemo(() => {
    return availableSkills.map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }, [availableSkills]);

  const availableAgents = useMemo(() => {
    const byName = new Map<string, LoadedAgentInfo>();

    for (const agent of createBuiltInAgents(
      agentsSettings.builtInAgentMaxNestingDepths,
      agentsSettings.builtInAgentModels,
    )) {
      byName.set(agent.name, agent);
    }

    for (const agent of loadedAgents) {
      if (
        !isValidToolName(agent.name) ||
        isBuiltInAgentName(agent.name) ||
        byName.has(agent.name)
      ) {
        continue;
      }
      byName.set(agent.name, agent);
    }

    return [...byName.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [
    agentsSettings.builtInAgentMaxNestingDepths,
    agentsSettings.builtInAgentModels,
    loadedAgents,
  ]);

  const availableAgentsByName = useMemo(() => {
    return new Map(
      availableAgents.map((agent) => [agent.name, agent] as const),
    );
  }, [availableAgents]);

  const effectiveAgentPermissions = useMemo(() => {
    const context = {
      availableTools,
      availableSkills,
      availableAgents,
    };
    return new Map(
      availableAgents.map(
        (agent) =>
          [
            agent.name,
            getEffectiveAgentPermission({
              agentName: agent.name,
              agentsSettings,
              mode: activeMode,
              modeCapabilityContext: context,
            }),
          ] as const,
      ),
    );
  }, [
    activeMode,
    agentsSettings,
    availableAgents,
    availableSkills,
    availableTools,
  ]);

  const globalAgentPermissions = useMemo(() => {
    return new Map(
      availableAgents.map(
        (agent) =>
          [
            agent.name,
            getEffectiveGlobalAgentPermission(agent.name, agentsSettings),
          ] as const,
      ),
    );
  }, [agentsSettings, availableAgents]);

  const activeModePermissionMaps = useMemo(() => {
    return getModePermissionMaps(activeMode, {
      availableTools,
      availableSkills,
      availableAgents,
    });
  }, [activeMode, availableAgents, availableSkills, availableTools]);

  const activeModeToolPermissions = useMemo(
    () => new Map(Object.entries(activeModePermissionMaps.toolPermissions)),
    [activeModePermissionMaps],
  );
  const activeModeSkillAvailability = useMemo(
    () => new Map(Object.entries(activeModePermissionMaps.skillAvailability)),
    [activeModePermissionMaps],
  );
  const activeModeAgentPermissions = useMemo(
    () => new Map(Object.entries(activeModePermissionMaps.agentPermissions)),
    [activeModePermissionMaps],
  );

  const globallyEnabledAgentNames = useMemo(() => {
    return new Set(
      availableAgents
        .filter((agent) => effectiveAgentPermissions.get(agent.name) !== "deny")
        .map((agent) => agent.name),
    );
  }, [availableAgents, effectiveAgentPermissions]);

  const modeDefaultEnabledAgentNames = globallyEnabledAgentNames;
  const activeChatEnabledAgentNames = useMemo(
    () => [...modeDefaultEnabledAgentNames],
    [modeDefaultEnabledAgentNames],
  );

  const visibleChatAgents = useMemo(() => {
    const search = chatAgentSearchValue.trim().toLowerCase();
    if (!search) return availableAgents;
    return availableAgents.filter((agent) =>
      `${agent.name} ${agent.description}`.toLowerCase().includes(search),
    );
  }, [availableAgents, chatAgentSearchValue]);

  const agentDisplayKey = useMemo(
    () =>
      availableAgents
        .map((agent) => `${agent.name}:${agent.enabled ? 1 : 0}`)
        .join("|"),
    [availableAgents],
  );

  const {
    chatScrollRef,
    chatContentRef,
    chatBottomRef,
    autoScrollEnabledRef,
    isNearChatBottom,
    showScrollToBottomButton,
    isChatScrollable,
    isReaderScrollLocked,
    resetChatScrollState,
    saveCurrentChatScrollSnapshot,
    forgetChatScrollSnapshot,
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
    messageOffsetResolverRef,
  });

  useLayoutEffect(() => {
    const scrollElement = chatScrollRef.current;
    if (!scrollElement) return;

    if (selectedAgentChatId) {
      const shouldOpenAtBottom =
        selectedAgentChat?.status === "running" ||
        selectedAgentChat?.status === "pending";
      const nextScrollTop = shouldOpenAtBottom
        ? Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight)
        : 0;
      scrollElement.scrollTop = nextScrollTop;
      window.requestAnimationFrame(() => {
        const currentScrollElement = chatScrollRef.current;
        if (!currentScrollElement) return;
        currentScrollElement.scrollTop = shouldOpenAtBottom
          ? Math.max(
              0,
              currentScrollElement.scrollHeight -
                currentScrollElement.clientHeight,
            )
          : 0;
      });
      return;
    }

    const mainChatScrollTop = mainChatScrollTopBeforeAgentRef.current;
    if (mainChatScrollTop === null) return;

    scrollElement.scrollTop = mainChatScrollTop;
    window.requestAnimationFrame(() => {
      const currentScrollElement = chatScrollRef.current;
      if (currentScrollElement)
        currentScrollElement.scrollTop = mainChatScrollTop;
    });
    mainChatScrollTopBeforeAgentRef.current = null;
  }, [chatScrollRef, selectedAgentChat?.status, selectedAgentChatId]);

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
          loadedSkillsSettings,
          loadedAgentsSettings,
          loadedAppSettings,
          loadedMcpSettings,
          loadedModesState,
          loadedToolManifests,
          loadedSkillManifests,
          loadedAgentManifests,
          loadedSystemAccessibleRoots,
        ] = await Promise.all([
          loadProvidersState(),
          loadSystemPrompt(),
          loadChats(),
          loadActiveChatId(),
          loadToolsSettings(),
          loadSkillsSettings(),
          loadAgentsSettings(),
          loadAppSettings(),
          loadMcpSettings(),
          loadModesState(),
          loadTools(),
          loadSkills(),
          loadAgents(),
          window.moltenForgeWorkspace?.getSystemAccessiblePaths?.() ??
            Promise.resolve([]),
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
        const nextChats = loadedChats;
        let nextActiveChatId = loadedActiveChatId;
        // Don't auto-create a chat when there are none — start in the unsaved
        // "New chat" draft state and only persist once the user sends.
        const startInNewChatDraft = nextChats.length === 0;

        if (startInNewChatDraft) {
          nextActiveChatId = undefined;
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
        setToolsSettings(
          migrateMcpToolPermissions(loadedToolsSettings, loadedMcpSettings),
        );
        setSkillsSettings(loadedSkillsSettings);
        setAgentsSettings(loadedAgentsSettings);
        setAppSettings(loadedAppSettings);
        setMcpSettings(loadedMcpSettings);
        setModesState(loadedModesState);
        setLoadedTools(loadedToolManifests);
        setLoadedSkills(loadedSkillManifests);
        setLoadedAgents(loadedAgentManifests);
        setSystemAccessibleRoots(loadedSystemAccessibleRoots);
        savedChatSnapshotsRef.current = Object.fromEntries(
          nextChats.map((chat) => [chat.id, JSON.stringify(chat)]),
        );
        setChats(nextChats);
        setActiveChatId(nextActiveChatId);
        setIsNewChatDraft(startInNewChatDraft);
        didHydrateRef.current = true;
        setMounted(true);
      } catch (error) {
        console.error("Failed to load app data:", error);
        const fallbackProvider = normalizeProviderForState(defaultProvider);
        savedChatSnapshotsRef.current = {};
        setProvidersState({
          providers: [fallbackProvider],
          activeProviderId: fallbackProvider.id,
        });
        setChats([]);
        setActiveChatId(undefined);
        setIsNewChatDraft(true);
        // IMPORTANT: do NOT set didHydrateRef.current = true here. Hydration
        // failed, so the in-memory state is a placeholder default — enabling
        // the auto-save effects would persist that default OVER the real
        // on-disk data (this is what was wiping providers). Leaving it false
        // keeps the app usable while protecting existing data; a restart will
        // retry the load.
        setMounted(true);
        showError(
          "Storage failed",
          `${labelForError(error)} Your saved data was left untouched — restart the app to retry. Avoid reconfiguring providers until it loads correctly.`,
        );
      }
    }

    hydrate();

    return () => {
      cancelled = true;
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

        if (appView === "settings") {
          if (settingsPageDirty) {
            setPendingSettingsNavigation("new-chat");
            setSettingsDiscardDialogOpen(true);
          } else {
            createNewChatWithEmptyDraftState();
            setAppView("chat");
            setIsSettingsSidebarCollapsed(false);
          }
          return;
        }

        createNewChatWithEmptyDraftState();
        return;
      }

      if (event.code === "Delete" && appView === "chat") {
        event.preventDefault();
        event.stopPropagation();
        if (activeChatId) void clearChat(activeChatId);
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
  }, [activeChat, appView, isSending, settingsPageDirty]);

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
    if (!didHydrateRef.current) return;
    saveSkillsSettings(skillsSettings).catch((error) =>
      console.error("Failed to save skills settings:", error),
    );
  }, [skillsSettings]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    saveAgentsSettings(agentsSettings).catch((error) =>
      console.error("Failed to save agents settings:", error),
    );
  }, [agentsSettings]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    saveAppSettings(appSettings).catch((error) =>
      console.error("Failed to save app settings:", error),
    );
  }, [appSettings]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    saveMcpSettings(mcpSettings).catch((error) =>
      console.error("Failed to save MCP settings:", error),
    );
  }, [mcpSettings]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    setToolsSettings((current) =>
      migrateMcpToolPermissions(current, mcpSettings),
    );
  }, [mcpSettings]);

  useEffect(() => {
    if (!didHydrateRef.current) return;
    saveModesState(modesState).catch((error) =>
      console.error("Failed to save modes:", error),
    );
  }, [modesState]);

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

      if (chatSaveTimeoutRef.current !== null) {
        window.clearTimeout(chatSaveTimeoutRef.current);
      }

      saveComposerDrafts(composerDraftsRef.current);
    };
  }, []);

  useEffect(() => {
    if (!didHydrateRef.current || chats.length === 0) return;

    if (chatSaveTimeoutRef.current !== null) {
      window.clearTimeout(chatSaveTimeoutRef.current);
    }

    const saveDelayMs = generatingChatIds.length > 0 ? 1000 : 250;

    chatSaveTimeoutRef.current = window.setTimeout(() => {
      chatSaveTimeoutRef.current = null;

      const nextSnapshots: Record<string, string> = {};
      const changedChats: ChatSession[] = [];

      for (const chat of chats) {
        const snapshot = JSON.stringify(chat);
        nextSnapshots[chat.id] = snapshot;

        if (savedChatSnapshotsRef.current[chat.id] !== snapshot) {
          changedChats.push(chat);
        }
      }

      savedChatSnapshotsRef.current = nextSnapshots;

      if (changedChats.length === 0) return;

      Promise.all(changedChats.map((chat) => saveChat(chat))).catch((error) =>
        console.error("Failed to save chats:", error),
      );
    }, saveDelayMs);

    return () => {
      if (chatSaveTimeoutRef.current !== null) {
        window.clearTimeout(chatSaveTimeoutRef.current);
        chatSaveTimeoutRef.current = null;
      }
    };
  }, [chats, generatingChatIds.length]);

  function showSuccess(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function showError(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function showInfo(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function getProjectInstructionsPathFromState(
    state: ProjectInstructionsState | undefined,
  ) {
    if (!state) return undefined;
    if (state.status === "none") {
      return state.event === "discarded" ? state.discardedPath : undefined;
    }
    return state.path;
  }

  function getProjectInstructionsRootForChat(chat: ChatSession | undefined) {
    return (chat?.workspaceRoots ?? []).find(
      (root) =>
        root.pathKind !== "file" &&
        root.automatic !== true &&
        root.kind !== "system" &&
        root.kind !== "skill" &&
        !root.id.startsWith("skill:"),
    );
  }

  const ensureProjectInstructionsForChat = useStableCallback(
    async (
      chat: ChatSession | undefined,
      options: { force?: boolean; approveOversized?: boolean } = {},
    ): Promise<ProjectInstructionsSnapshot | undefined> => {
      if (!chat) return undefined;

      const workspaceRoot = getProjectInstructionsRootForChat(chat);
      const previousState = projectInstructionsByChatIdRef.current[chat.id];
      const previousPath = getProjectInstructionsPathFromState(previousState);

      if (!workspaceRoot) {
        const nextState: ProjectInstructionsState = previousPath
          ? {
              status: "none",
              event: "discarded",
              discardedPath: previousPath,
            }
          : { status: "none" };
        setProjectInstructionsByChatId((current) => ({
          ...current,
          [chat.id]: nextState,
        }));
        projectInstructionsByChatIdRef.current = {
          ...projectInstructionsByChatIdRef.current,
          [chat.id]: nextState,
        };
        return undefined;
      }

      if (
        !options.force &&
        !options.approveOversized &&
        !shouldRefreshProjectInstructions(previousState, workspaceRoot) &&
        previousState?.status === "loaded"
      ) {
        return getProjectInstructionsSnapshot(previousState);
      }

      try {
        const result = await getWorkspaceBridge().loadProjectInstructions({
          workspaceRoot,
          // Project instructions load silently in the background; there is no
          // chat-timeline approval block for oversized AGENTS.md files.
          approveOversized: true,
        });

        let nextState: ProjectInstructionsState;
        if (result.status === "loaded") {
          const unchanged =
            previousState?.status === "loaded" &&
            previousState.path === result.path &&
            previousState.sizeBytes === result.sizeBytes &&
            previousState.mtimeMs === result.mtimeMs;

          if (unchanged) return previousState;

          nextState = {
            ...result,
            event: previousState?.status === "loaded" ? "updated" : "loaded",
            ...(previousPath && previousPath !== result.path
              ? { replacedPath: previousPath }
              : {}),
          };
        } else if (result.status === "approval_required") {
          if (
            previousState?.status === "loaded" &&
            previousState.path === result.path &&
            previousState.sizeBytes === result.sizeBytes &&
            previousState.mtimeMs === result.mtimeMs
          ) {
            return previousState;
          }

          if (
            previousState?.status === "skipped" &&
            previousState.path === result.path &&
            previousState.sizeBytes === result.sizeBytes &&
            previousState.mtimeMs === result.mtimeMs
          ) {
            return undefined;
          }

          nextState = {
            ...result,
            event: "approval_required",
          };
        } else if (result.status === "failed") {
          nextState = {
            ...result,
            event: "failed",
          };
        } else {
          nextState = previousPath
            ? {
                status: "none",
                event: "discarded",
                workspacePath: workspaceRoot.path,
                discardedPath: previousPath,
              }
            : { status: "none", workspacePath: workspaceRoot.path };
        }

        setProjectInstructionsByChatId((current) => ({
          ...current,
          [chat.id]: nextState,
        }));
        projectInstructionsByChatIdRef.current = {
          ...projectInstructionsByChatIdRef.current,
          [chat.id]: nextState,
        };
        return getProjectInstructionsSnapshot(nextState);
      } catch (error) {
        const nextState: ProjectInstructionsState = {
          status: "failed",
          event: "failed",
          workspaceRoot,
          path: `${workspaceRoot.path.replace(/[\\/]+$/, "")}/AGENTS.md`,
          error: labelForError(error),
        };
        setProjectInstructionsByChatId((current) => ({
          ...current,
          [chat.id]: nextState,
        }));
        projectInstructionsByChatIdRef.current = {
          ...projectInstructionsByChatIdRef.current,
          [chat.id]: nextState,
        };
        return undefined;
      }
    },
  );

  useEffect(() => {
    if (!activeChat || isNewChatDraft) return;
    void ensureProjectInstructionsForChat(activeChat);
  }, [
    activeChat?.id,
    activeChatVisibleWorkspaceRoots[0]?.path,
    isNewChatDraft,
    ensureProjectInstructionsForChat,
  ]);

  const activeChatIdRef = useRef(activeChatId);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    if (!activeChatId) return;
    setCompletedGenerationChatIds((currentChatIds) =>
      currentChatIds.filter((chatId) => chatId !== activeChatId),
    );
  }, [activeChatId]);

  useEffect(() => {
    setCompletedGenerationChatIds((currentChatIds) =>
      currentChatIds.filter(
        (chatId) =>
          !generatingChatIds.includes(chatId) &&
          chats.some((chat) => chat.id === chatId),
      ),
    );
  }, [chats, generatingChatIds]);

  function getToolsBridge() {
    if (!window.moltenForgeTools) {
      throw new Error("Electron tools bridge is not available.");
    }

    return window.moltenForgeTools;
  }

  function getWorkspaceBridge() {
    if (!window.moltenForgeWorkspace) {
      throw new Error("Electron workspace bridge is not available.");
    }

    return window.moltenForgeWorkspace;
  }

  async function addActiveChatWorkspaceRoot() {
    if (!activeChat && !isNewChatDraft) return;

    try {
      const result = await getWorkspaceBridge().selectFolder();
      if (result.cancelled) return;

      const now = new Date().toISOString();
      const root: ChatWorkspaceRoot = {
        id: createId(),
        name: result.name || result.path,
        path: result.path,
        createdAt: now,
        kind: "manual",
        pathKind: "folder",
      };

      if (isNewChatDraft) {
        setNewChatDraftWorkspaceRoots((currentRoots) => {
          if (currentRoots.some((item) => item.path === root.path)) {
            return currentRoots;
          }

          return [...currentRoots, root];
        });
        showSuccess("Accessible folder added.");
        return;
      }

      if (!activeChat) return;

      updateChat(activeChat.id, (chat) => {
        const existingRoots = chat.workspaceRoots ?? [];
        if (existingRoots.some((item) => item.path === root.path)) {
          return chat;
        }

        return {
          ...chat,
          workspaceRoots: [...existingRoots, root],
          updatedAt: now,
        };
      });

      showSuccess("Accessible folder added.");
    } catch (error) {
      console.error("Failed to add accessible folder:", error);
      showError("Failed to add accessible folder.", labelForError(error));
    }
  }

  async function addActiveChatAccessibleFile() {
    if (!activeChat && !isNewChatDraft) return;

    try {
      const result = await getWorkspaceBridge().selectFile();
      if (result.cancelled) return;

      const now = new Date().toISOString();
      const root: ChatWorkspaceRoot = {
        id: createId(),
        name: result.name || result.path,
        path: result.path,
        createdAt: now,
        kind: "manual",
        pathKind: "file",
      };

      if (isNewChatDraft) {
        setNewChatDraftWorkspaceRoots((currentRoots) => {
          if (currentRoots.some((item) => item.path === root.path)) {
            return currentRoots;
          }

          return [...currentRoots, root];
        });
        showSuccess("Accessible file added.");
        return;
      }

      if (!activeChat) return;

      updateChat(activeChat.id, (chat) => {
        const existingRoots = chat.workspaceRoots ?? [];
        if (existingRoots.some((item) => item.path === root.path)) {
          return chat;
        }

        return {
          ...chat,
          workspaceRoots: [...existingRoots, root],
          updatedAt: now,
        };
      });

      showSuccess("Accessible file added.");
    } catch (error) {
      console.error("Failed to add accessible file:", error);
      showError("Failed to add accessible file.", labelForError(error));
    }
  }

  function removeActiveChatWorkspaceRoot(rootId: string) {
    if (isNewChatDraft) {
      setNewChatDraftWorkspaceRoots((currentRoots) =>
        currentRoots.filter((root) => root.id !== rootId),
      );
      showSuccess("Accessible path removed from chat.");
      return;
    }

    if (!activeChat) return;

    updateChat(activeChat.id, (chat) => ({
      ...chat,
      workspaceRoots: (chat.workspaceRoots ?? []).filter(
        (root) => root.id !== rootId,
      ),
      updatedAt: new Date().toISOString(),
    }));
    showSuccess("Accessible path removed from chat.");
  }

  async function openWorkspaceRoot(root: ChatWorkspaceRoot) {
    try {
      await getWorkspaceBridge().openFolder(root.path);
    } catch (error) {
      console.error("Failed to open workspace folder:", error);
      showError("Failed to open workspace folder.", labelForError(error));
    }
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

  function toggleThinkingCollapsed(stepId: string, nextCollapsed: boolean) {
    setCollapsedThinkingStepIds((current) => ({
      ...current,
      [stepId]: nextCollapsed,
    }));
  }

  function renderToolExecutionBlock({
    id,
    toolCall,
    toolResult,
    status,
    isCollapsed,
    onToggleCollapsed,
    returnToAgentCallId,
  }: {
    id: string;
    toolCall: ChatToolCall;
    toolResult?: ChatToolResult;
    status?: ToolExecutionStatus;
    isCollapsed?: boolean;
    onToggleCollapsed?: (stepId: string, nextCollapsed: boolean) => void;
    returnToAgentCallId?: string;
  }) {
    return (
      <ToolExecutionBlock
        key={id}
        id={id}
        toolCall={toolCall}
        toolResult={toolResult}
        status={status}
        loadedTools={executableTools}
        isCollapsed={isCollapsed ?? isToolExecutionCollapsed(id)}
        onToggleCollapsed={onToggleCollapsed ?? toggleToolExecutionCollapsed}
        returnToAgentCallId={returnToAgentCallId}
        onOpenDetails={(details) => {
          setSelectedToolSidebarDetails(details);
          setSelectedGenerationInfoVariant(undefined);
          setIsContextUsageSidebarOpen(false);
          setIsChatCapabilitiesSidebarOpen(false);
          if (details.returnToAgentCallId) {
            setSelectedAgentSidebarId(details.returnToAgentCallId);
          }
        }}
      />
    );
  }
  function updateChat(
    chatId: string,
    updater: (chat: ChatSession) => ChatSession,
  ) {
    setChats((currentChats) => {
      let didChange = false;
      const nextChats = currentChats.map((chat) => {
        if (chat.id !== chatId) return chat;

        const nextChat = updater(chat);
        if (nextChat !== chat) didChange = true;
        return nextChat;
      });

      return didChange ? nextChats : currentChats;
    });
  }

  function updateChatMessages(
    chatId: string,
    updater: (messages: ChatMessage[]) => ChatMessage[],
    options: { touch?: boolean } = {},
  ) {
    const shouldTouch = options.touch ?? true;

    updateChat(chatId, (chat) => {
      const nextMessages = updater(chat.messages);

      if (nextMessages === chat.messages && !shouldTouch) return chat;

      return {
        ...chat,
        messages: nextMessages,
        ...(shouldTouch ? { updatedAt: new Date().toISOString() } : {}),
      };
    });
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
      const key = isNewChatDraft ? NEW_CHAT_DRAFT_KEY : activeChatId;
      if (!key) return;

      const nextDrafts = { ...composerDraftsRef.current };

      if (draft.length === 0) delete nextDrafts[key];
      else nextDrafts[key] = draft;

      composerDraftsRef.current = nextDrafts;

      if (composerDraftSaveTimeoutRef.current !== null) {
        window.clearTimeout(composerDraftSaveTimeoutRef.current);
      }

      composerDraftSaveTimeoutRef.current = window.setTimeout(() => {
        composerDraftSaveTimeoutRef.current = null;
        saveComposerDrafts(composerDraftsRef.current);
      }, 250);
    },
    [isNewChatDraft, activeChatId],
  );

  const updateActiveComposerAttachments = useCallback(
    (attachments: ChatAttachment[]) => {
      const key = isNewChatDraft ? NEW_CHAT_DRAFT_KEY : activeChatId;
      if (!key) return;

      setComposerAttachmentsByKey((current) => {
        const next = { ...current };
        if (attachments.length === 0) delete next[key];
        else next[key] = attachments;
        return next;
      });
    },
    [isNewChatDraft, activeChatId],
  );

  const setComposerDraftText = useCallback(
    (draft: string) => {
      updateActiveComposerDraft(draft);
      chatComposerRef.current?.setDraft(draft);
    },
    [updateActiveComposerDraft],
  );

  function startEditingMessageInComposer(messageId: string) {
    if (!activeChat) return;
    if (isSending) {
      showInfo("Wait until generation finishes before editing messages.");
      return;
    }

    const message = activeChat.messages.find(
      (candidate) => candidate.id === messageId && candidate.role === "user",
    );
    if (!message || message.role !== "user") {
      showError("Could not find the message to edit.");
      return;
    }

    const currentDraft = composerDraftKey
      ? (composerDraftsRef.current[composerDraftKey] ?? "")
      : "";
    const previousDraft = composerEditState?.previousDraft ?? currentDraft;
    const previousAttachments =
      composerEditState?.previousAttachments ?? activeComposerAttachments;
    const preview =
      message.content.trim() ||
      message.attachments?.[0]?.name ||
      "Attached files";

    setComposerEditState({
      chatId: activeChat.id,
      messageId,
      previousDraft,
      previousAttachments,
      preview,
    });
    setEditingMessageId(messageId);
    setComposerDraftText(message.content);
    updateActiveComposerAttachments(message.attachments ?? []);
    chatComposerRef.current?.focus();
  }

  function cancelComposerEdit() {
    if (!composerEditState) {
      setEditingMessageId(null);
      return;
    }

    setComposerDraftText(composerEditState.previousDraft);
    updateActiveComposerAttachments(composerEditState.previousAttachments);
    setComposerEditState(null);
    setEditingMessageId(null);
    chatComposerRef.current?.focus();
  }

  useEffect(() => {
    if (!composerEditState) return;
    if (
      activeChat?.id === composerEditState.chatId &&
      editingMessageId === composerEditState.messageId
    ) {
      return;
    }

    const nextDrafts = { ...composerDraftsRef.current };
    if (composerEditState.previousDraft.length === 0) {
      delete nextDrafts[composerEditState.chatId];
    } else {
      nextDrafts[composerEditState.chatId] = composerEditState.previousDraft;
    }
    composerDraftsRef.current = nextDrafts;
    saveComposerDrafts(nextDrafts);
    setComposerAttachmentsByKey((current) => {
      const next = { ...current };
      if (composerEditState.previousAttachments.length === 0) {
        delete next[composerEditState.chatId];
      } else {
        next[composerEditState.chatId] = composerEditState.previousAttachments;
      }
      return next;
    });
    setComposerEditState(null);
  }, [activeChat?.id, composerEditState, editingMessageId]);

  const {
    sendMessage,
    regenerateAssistantMessage,
    continueAssistantMessage,
    submitEditedUserMessage,
    selectAssistantVariant,
    stopChatGeneration,
    isChatGenerating,
    preparedContextUsageByChatId,
    pendingInteractions,
    submitAskUserResponse,
    submitFileToolApprovalResponse,
    cancelAskUserRequest,
    canSubmitAskUserResponse,
  } = useChatGeneration({
    activeChat,
    activeChatId,
    activeProvider,
    providers,
    chats,
    systemPrompt,
    toolsSettings,
    skillsSettings,
    agentsSettings,
    modesState,
    chatTitleGenerationMode: appSettings.chatTitleGenerationMode,
    titleGenerationModel: appSettings.titleGenerationModel,
    loadedTools: executableTools,
    availableToolsByName,
    loadedSkills,
    availableSkillsByName,
    systemAccessibleRoots,
    loadedAgents: availableAgents,
    availableAgentsByName,
    autoScrollEnabledRef,
    generatingChatIds,
    setGeneratingChatIds,
    setEditingMessageId,
    setSettingsOpen,
    setVisualFlushRequests,
    updateActiveChatMessages,
    updateChat,
    updateChatMessages,
    armStickyScrollToBottom,
    scheduleStickyScrollToBottom,
    isStickyScrollSuppressed,
    syncChatScrollState,
    executeExternalTool: (toolName, args, context) => {
      const tool =
        availableToolsByName.get(toolName) ??
        executableTools.find((candidate) => candidate.name === toolName);
      const executionId = createId();
      const isMcpTool = tool?.source === "mcp";
      const bridge = isMcpTool ? window.moltenForgeMcp : getToolsBridge();
      const skillWorkspaceRoots: ChatWorkspaceRoot[] = loadedSkills
        .filter((skill) => skill.directoryPath)
        .map((skill, index) => ({
          id: `skill:${skill.name}:${index}`,
          name: skill.name,
          path: skill.directoryPath!,
          createdAt: new Date(0).toISOString(),
          automatic: true,
          kind: "skill" as const,
          pathKind: "folder" as const,
        }));
      const workspaceRootsWithSkills = [
        ...(context?.workspaceRoots ?? []),
        ...skillWorkspaceRoots,
      ];

      if (!bridge) {
        return Promise.reject(
          new Error(
            isMcpTool
              ? "MCP bridge is unavailable."
              : "Tools bridge is unavailable.",
          ),
        );
      }

      return new Promise<ToolCommandResult>((resolve, reject) => {
        let settled = false;

        let cleanup = () => {
          context?.signal?.removeEventListener("abort", abortHandler);
        };

        const settleResolve = (value: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value as ToolCommandResult);
        };

        const settleReject = (error: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };

        const abortHandler = () => {
          void bridge.cancel(executionId).catch(() => undefined);
          settleReject(
            new DOMException("Tool execution was cancelled.", "AbortError"),
          );
        };

        if (context?.signal?.aborted) {
          abortHandler();
          return;
        }

        context?.signal?.addEventListener("abort", abortHandler, {
          once: true,
        });

        if (isMcpTool) {
          window.moltenForgeMcp
            ?.executeTool({ executionId, tool, args })
            .then(settleResolve, settleReject);
          return;
        }

        if (toolName === BASH_TOOL_NAME) {
          const toolsBridge = getToolsBridge();
          const unsubscribe = toolsBridge.onStreamEvent?.(
            (event: TerminalStreamEvent) => {
              if (event.executionId !== executionId) return;
              context?.onTerminalStreamEvent?.(event);
            },
          );
          const originalCleanup = cleanup;
          const cleanupWithStream = () => {
            unsubscribe?.();
            originalCleanup();
          };
          cleanup = cleanupWithStream;

          toolsBridge
            .executeStream({
              executionId,
              name: toolName,
              args,
              workspaceRoots: workspaceRootsWithSkills,
              allowedExactFilePaths: context?.allowedExactFilePaths,
              allowedReadRoots: context?.allowedReadRoots,
              timeoutMs: tool?.timeoutMs,
            })
            .then(settleResolve, settleReject);
          return;
        }

        getToolsBridge()
          .execute({
            executionId,
            name: toolName,
            args,
            workspaceRoots: workspaceRootsWithSkills,
            allowedExactFilePaths: context?.allowedExactFilePaths,
            allowedReadRoots: context?.allowedReadRoots,
            timeoutMs: tool?.timeoutMs,
          })
          .then(settleResolve, settleReject);
      });
    },
    onChatGenerationFinished: (chatId, options) => {
      if (options.wasCancelled || activeChatIdRef.current === chatId) return;
      setCompletedGenerationChatIds((currentChatIds) => [
        ...new Set([...currentChatIds, chatId]),
      ]);
    },
    ensureProjectInstructionsForChat,
    showError,
  });

  const latestContextUsage = useMemo(() => {
    const context = getEffectiveModelContext(
      activeChatProvider,
      activeChatModel,
    );
    const attachmentTokens = estimateAttachmentsTokens(
      activeComposerAttachments,
    );
    const preparedRequestEstimate = activeChat?.id
      ? preparedContextUsageByChatId[activeChat.id]
      : undefined;

    const details = buildContextUsageDetails({
      messages,
      contextLimit: context.length,
      limitSource: context.source,
      attachmentTokens,
      systemPrompt,
      preparedRequestEstimate,
    });

    return details.usedTokens && details.usedTokens > 0 ? details : undefined;
  }, [
    activeChat?.id,
    activeChatModel,
    activeChatProvider,
    activeComposerAttachments,
    messages,
    preparedContextUsageByChatId,
    systemPrompt,
  ]);
  const selectedAgentContextUsage = useMemo(() => {
    if (!selectedAgentChat) return undefined;

    const context = getEffectiveModelContext(
      activeChatProvider,
      selectedAgentChat.model || activeChatModel,
    );
    const details = buildContextUsageDetails({
      messages: buildAgentContextMessages(selectedAgentChat),
      contextLimit: context.length,
      limitSource: context.source,
      systemPrompt:
        selectedAgentChat.description ?? selectedAgentChat.agentName,
    });

    return details.usedTokens && details.usedTokens > 0 ? details : undefined;
  }, [activeChatModel, activeChatProvider, selectedAgentChat]);

  // Once the chat created on first send is committed to state (so `activeChat`
  // reflects it), dispatch the queued message.
  useEffect(() => {
    const pending = pendingDraftSendRef.current;
    if (!pending) return;
    if (activeChat?.id !== pending.chatId) return;

    pendingDraftSendRef.current = null;
    void sendMessage(pending.content, pending.attachments);
  }, [activeChat, sendMessage]);

  const handleComposerSend = useCallback(
    async (content: string, attachments: ChatAttachment[]) => {
      if (composerEditState && activeChat?.id === composerEditState.chatId) {
        const wasSubmitted = await submitEditedUserMessage(
          composerEditState.messageId,
          content,
          attachments,
        );
        if (wasSubmitted) {
          setComposerEditState(null);
        }
        return wasSubmitted;
      }

      if (!isNewChatDraft) {
        return sendMessage(content, attachments);
      }

      const trimmed = content.trim();
      if (!trimmed && attachments.length === 0) {
        showError("Message is required.");
        return false;
      }

      // Create and persist the real chat now, then queue the send for after
      // the new chat becomes the active chat (see the effect above).
      const emptyChat = createEmptyChat();
      const workspaceRoots = newChatDraftWorkspaceRoots.map((root) => ({
        ...root,
      }));

      const draftFolderId = appSettings.chatFolders.some(
        (folder) => folder.id === newChatDraftFolderId,
      )
        ? newChatDraftFolderId
        : undefined;

      const chat: ChatSession = applyNewChatDraftSettings({
        baseChat: emptyChat,
        draftSettings: newChatDraftSettings,
        modeId: activeMode.id,
        folderId: draftFolderId,
        workspaceRoots,
        fileToolAutoApprovalDefaults:
          buildFileToolAutoApprovalFromToolsSettings(toolsSettings),
      });

      saveCurrentChatScrollSnapshot();
      setChats((currentChats) => [chat, ...currentChats]);
      setActiveChatId(chat.id);
      setIsNewChatDraft(false);
      setEditingMessageId(null);
      resetChatScrollState();

      // Clear the draft stored under the new-chat key now that it's consumed.
      const nextDrafts = { ...composerDraftsRef.current };
      delete nextDrafts[NEW_CHAT_DRAFT_KEY];
      composerDraftsRef.current = nextDrafts;
      saveComposerDrafts(nextDrafts);
      setComposerAttachmentsByKey((current) => {
        const next = { ...current };
        delete next[NEW_CHAT_DRAFT_KEY];
        return next;
      });
      setNewChatDraftWorkspaceRoots([]);
      setNewChatDraftFolderId(undefined);
      setNewChatDraftSettings(undefined);

      pendingDraftSendRef.current = {
        chatId: chat.id,
        content: trimmed,
        attachments,
      };

      try {
        await saveChat(chat);
        await saveActiveChatId(chat.id);
      } catch (error) {
        console.error("Failed to save new chat:", error);
      }

      return true;
    },
    [
      activeChat?.id,
      activeMode.id,
      composerEditState,
      isNewChatDraft,
      sendMessage,
      submitEditedUserMessage,
      toolsSettings,
      newChatDraftWorkspaceRoots,
      newChatDraftFolderId,
      newChatDraftSettings,
      appSettings.chatFolders,
      saveCurrentChatScrollSnapshot,
      resetChatScrollState,
      showError,
    ],
  );

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
          ? normalizeProviderForState({
              ...provider,
              ...patch,
              id: provider.id,
            })
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
  }

  function selectActiveChatProviderModel(providerId: string, model: string) {
    const normalizedModel = model.trim();
    if (!normalizedModel) return;

    setProvidersState((currentState) => ({
      ...currentState,
      activeProviderId: providerId,
      providers: currentState.providers.map((provider) =>
        provider.id === providerId
          ? normalizeProviderForState({ ...provider, model: normalizedModel })
          : provider,
      ),
    }));
    setIsSidebarModelComboboxOpen(false);
    setSidebarModelSearchValue("");
  }

  function selectActiveChatMode(modeId: string) {
    if (!enabledModes.some((mode) => mode.id === modeId)) return;

    if (isNewChatDraft || !activeChat) {
      setNewChatDraftModeId(modeId);
    } else {
      updateChat(activeChat.id, (chat) => ({
        ...chat,
        modeId,
      }));
    }

    setIsModePickerOpen(false);
    setModeSearchValue("");
  }

  async function saveSettingsChanges(providersStateOverride?: ProvidersState) {
    const nextProvidersState = providersStateOverride ?? providersState;

    if (providersStateOverride) {
      setProvidersState(providersStateOverride);
    }

    try {
      await Promise.all([
        saveProvidersState(nextProvidersState),
        saveSystemPrompt(systemPrompt),
      ]);
      showSuccess("Providers saved.");
    } catch (error) {
      console.error("Failed to save providers:", error);
      showError("Failed to save providers", labelForError(error));
    }
  }

  const {
    copyLinkHref,
    deleteMessage,
    copyMessageContent,
    stopGeneration,
    createNewChat,
    cloneChat,
    switchChat,
    clearChat,
    removeChat,
    branchChatFromMessage,
    toggleActiveChatTool,
    toggleActiveChatFileToolAutoApproval,
    setActiveChatThinkingMode,
    setActiveChatAutoApprove,
    toggleActiveChatSkill,
    toggleActiveChatAgent,
    renameChat,
    toggleChatPinned,
  } = useChatActions({
    activeChat,
    activeChatId,
    availableTools,
    availableSkills,
    availableAgents,
    chats,
    globallyEnabledToolNames: modeDefaultEnabledToolNames,
    globallyEnabledSkillNames: modeDefaultEnabledSkillNames,
    globallyEnabledAgentNames: modeDefaultEnabledAgentNames,
    fileToolAutoApprovalDefaults:
      buildFileToolAutoApprovalFromToolsSettings(toolsSettings),
    isSending,
    messageElementRefs,
    setActiveChatId,
    setChats,
    setIsNewChatDraft,
    setCopiedMessageId,
    setEditingMessageId,
    resetChatScrollState,
    armStickyScrollToBottom,
    saveCurrentChatScrollSnapshot,
    forgetChatScrollSnapshot,
    focusDraftTextarea,
    isChatGenerating,
    stopChatGeneration,
    showError,
    showInfo,
    showSuccess,
    updateActiveChatMessages,
    updateChat,
  });

  function createNewChatWithEmptyDraftState() {
    setNewChatDraftWorkspaceRoots([]);
    setNewChatDraftFolderId(undefined);
    setNewChatDraftModeId(DEFAULT_MODE_ID);
    setNewChatDraftSettings(undefined);
    createNewChat();
  }

  function createNewChatWithSameSettings(chatId: string) {
    const sourceChat = chats.find((chat) => chat.id === chatId);
    if (!sourceChat) return;

    const settings = buildNewChatDraftSettings(sourceChat);
    const folderId = settings.folderId;
    const draftFolderId = appSettings.chatFolders.some(
      (folder) => folder.id === folderId,
    )
      ? folderId
      : undefined;

    setNewChatDraftSettings({ ...settings, folderId: draftFolderId });
    setNewChatDraftWorkspaceRoots(settings.workspaceRoots ?? []);
    setNewChatDraftFolderId(draftFolderId);
    setNewChatDraftModeId(settings.modeId ?? DEFAULT_MODE_ID);
    createNewChat();
  }

  function setActiveOrDraftChatThinkingMode(thinkingMode: ChatThinkingMode) {
    if (isNewChatDraft) {
      setNewChatDraftSettings((currentSettings) => ({
        ...(currentSettings ?? {}),
        thinkingMode,
      }));
      return;
    }

    setActiveChatThinkingMode(thinkingMode);
  }
  function setActiveOrDraftChatAutoApprove(autoApprove: boolean) {
    if (isNewChatDraft || !activeChat) {
      setNewChatDraftSettings((currentSettings: NewChatDraftSettings | undefined) => ({
        ...(currentSettings ?? {}),
        autoApprove,
      }));
      return;
    }

    setActiveChatAutoApprove(autoApprove);
  }

  const loadSkillFromComposerMention = useCallback(
    (skillName: string, nextDraft: string) => {
      const skill = availableSkillsByName.get(skillName);

      if (!skill) {
        showError(`Skill not found: ${skillName}`);
        return false;
      }

      if (isNewChatDraft) {
        const createdAt = new Date().toISOString();
        const emptyChat = createEmptyChat();
        const workspaceRoots = newChatDraftWorkspaceRoots.map((root) => ({
          ...root,
        }));
        const draftFolderId = appSettings.chatFolders.some(
          (folder) => folder.id === newChatDraftFolderId,
        )
          ? newChatDraftFolderId
          : undefined;
        const draftSettings: NewChatDraftSettings = {
          ...(newChatDraftSettings ?? {}),
          activeSkillNames: [
            ...new Set([
              ...(newChatDraftSettings?.activeSkillNames ?? []),
              skillName,
            ]),
          ],
        };

        const chat: ChatSession = {
          ...applyNewChatDraftSettings({
            baseChat: emptyChat,
            draftSettings,
            modeId: activeMode.id,
            folderId: draftFolderId,
            workspaceRoots,
            fileToolAutoApprovalDefaults:
              buildFileToolAutoApprovalFromToolsSettings(toolsSettings),
          }),
          title: `Skill: ${skillName}`,
          titleMode: "auto",
          messages: [createLoadSkillAssistantMessage({ skill, createdAt })],
          updatedAt: createdAt,
        };

        saveCurrentChatScrollSnapshot();
        setChats((currentChats) => [chat, ...currentChats]);
        setActiveChatId(chat.id);
        setIsNewChatDraft(false);
        setEditingMessageId(null);
        resetChatScrollState();
        armStickyScrollToBottom();

        const nextDrafts = { ...composerDraftsRef.current };
        delete nextDrafts[NEW_CHAT_DRAFT_KEY];
        if (nextDraft.length > 0) nextDrafts[chat.id] = nextDraft;
        composerDraftsRef.current = nextDrafts;
        saveComposerDrafts(nextDrafts);

        setComposerAttachmentsByKey((current) => {
          const next = { ...current };
          const draftAttachments = next[NEW_CHAT_DRAFT_KEY] ?? [];
          delete next[NEW_CHAT_DRAFT_KEY];
          if (draftAttachments.length > 0) next[chat.id] = draftAttachments;
          return next;
        });

        setNewChatDraftWorkspaceRoots([]);
        setNewChatDraftFolderId(undefined);
        setNewChatDraftSettings(undefined);

        void saveChat(chat).catch((error) => {
          console.error("Failed to save skill load chat:", error);
        });
        void saveActiveChatId(chat.id).catch((error) => {
          console.error("Failed to save active chat after skill load:", error);
        });

        showSuccess(`Skill loaded: ${skillName}`);
        return true;
      }

      if (!activeChat) {
        showError("Open or create a chat before loading a skill.");
        return false;
      }

      const loadedMessage = createLoadSkillAssistantMessage({ skill });

      updateChat(activeChat.id, (chat) => ({
        ...chat,
        messages: [...chat.messages, loadedMessage],
        activeSkillNames: [
          ...new Set([...(chat.activeSkillNames ?? []), skillName]),
        ],
        updatedAt: loadedMessage.createdAt,
      }));
      showSuccess(`Skill loaded: ${skillName}`);
      return true;
    },
    [
      activeChat,
      availableSkillsByName,
      activeMode.id,
      appSettings.chatFolders,
      armStickyScrollToBottom,
      newChatDraftFolderId,
      newChatDraftSettings,
      newChatDraftWorkspaceRoots,
      resetChatScrollState,
      saveCurrentChatScrollSnapshot,
      setEditingMessageId,
      toolsSettings,
      isNewChatDraft,
      showError,
      showSuccess,
      updateChat,
    ],
  );

  async function removeChatAndResetDraftState(chatId: string) {
    const willOpenNewChatDraft = chats.every((chat) => chat.id === chatId);
    if (willOpenNewChatDraft) {
      setNewChatDraftWorkspaceRoots([]);
      setNewChatDraftFolderId(undefined);
      setNewChatDraftSettings(undefined);
      setNewChatDraftModeId(DEFAULT_MODE_ID);
    }

    await removeChat(chatId);
  }

  function updateChatFolders(updater: (folders: ChatFolder[]) => ChatFolder[]) {
    setAppSettings((currentSettings) => ({
      ...currentSettings,
      chatFolders: updater(currentSettings.chatFolders),
    }));
  }

  function createFolder(name: string) {
    const requestedName = name.trim();
    if (!requestedName) return;

    const now = new Date().toISOString();

    updateChatFolders((folders) => {
      const existingNames = new Set(folders.map((folder) => folder.name));
      let uniqueName = requestedName;
      let index = 2;

      while (existingNames.has(uniqueName)) {
        uniqueName = `${requestedName} ${index}`;
        index += 1;
      }

      const folder: ChatFolder = {
        id: `folder-${createId()}`,
        name: uniqueName,
        createdAt: now,
        updatedAt: now,
      };

      return [folder, ...folders];
    });
    showSuccess("Folder created.");
  }

  function renameFolder(folderId: string, name: string) {
    const nextName = name.trim();
    if (!nextName) return;

    const now = new Date().toISOString();
    updateChatFolders((folders) =>
      folders.map((folder) =>
        folder.id === folderId
          ? { ...folder, name: nextName, updatedAt: now }
          : folder,
      ),
    );
  }

  async function addFolderDefaultFolder(folderId: string) {
    try {
      const result = await getWorkspaceBridge().selectFolder();
      if (result.cancelled) return;

      const now = new Date().toISOString();
      const root: ChatWorkspaceRoot = {
        id: createId(),
        name: result.name || result.path,
        path: result.path,
        createdAt: now,
        kind: "manual",
        pathKind: "folder",
      };

      updateChatFolders((folders) =>
        folders.map((folder) => {
          if (folder.id !== folderId) return folder;
          const existingRoots = folder.workspaceRoots ?? [];
          if (existingRoots.some((item) => item.path === root.path))
            return folder;

          return {
            ...folder,
            workspaceRoots: [...existingRoots, root],
            updatedAt: now,
          };
        }),
      );
      showSuccess("Default accessible folder added.");
    } catch (error) {
      console.error("Failed to add default accessible folder:", error);
      showError(
        "Failed to add default accessible folder.",
        labelForError(error),
      );
    }
  }

  async function addFolderDefaultFile(folderId: string) {
    try {
      const result = await getWorkspaceBridge().selectFile();
      if (result.cancelled) return;

      const now = new Date().toISOString();
      const root: ChatWorkspaceRoot = {
        id: createId(),
        name: result.name || result.path,
        path: result.path,
        createdAt: now,
        kind: "manual",
        pathKind: "file",
      };

      updateChatFolders((folders) =>
        folders.map((folder) => {
          if (folder.id !== folderId) return folder;
          const existingRoots = folder.workspaceRoots ?? [];
          if (existingRoots.some((item) => item.path === root.path))
            return folder;

          return {
            ...folder,
            workspaceRoots: [...existingRoots, root],
            updatedAt: now,
          };
        }),
      );
      showSuccess("Default accessible file added.");
    } catch (error) {
      console.error("Failed to add default accessible file:", error);
      showError("Failed to add default accessible file.", labelForError(error));
    }
  }

  function removeFolderDefaultPath(folderId: string, rootId: string) {
    const now = new Date().toISOString();
    updateChatFolders((folders) =>
      folders.map((folder) => {
        if (folder.id !== folderId) return folder;
        const workspaceRoots = (folder.workspaceRoots ?? []).filter(
          (root) => root.id !== rootId,
        );
        return {
          ...folder,
          workspaceRoots: workspaceRoots.length ? workspaceRoots : undefined,
          updatedAt: now,
        };
      }),
    );
    showSuccess("Default accessible path removed.");
  }

  function clearFolderDefaultPaths(folderId: string) {
    const now = new Date().toISOString();
    updateChatFolders((folders) =>
      folders.map((folder) =>
        folder.id === folderId
          ? { ...folder, workspaceRoots: undefined, updatedAt: now }
          : folder,
      ),
    );
    showSuccess("Default accessible paths removed.");
  }

  function createNewChatInFolder(folderId: string) {
    const folder = appSettings.chatFolders.find((item) => item.id === folderId);
    if (!folder) return;

    setNewChatDraftWorkspaceRoots(getFolderDefaultWorkspaceRoots(folder));
    setNewChatDraftFolderId(folder.id);
    setNewChatDraftModeId(DEFAULT_MODE_ID);
    setNewChatDraftSettings(undefined);
    createNewChat();
  }

  function moveChatToFolder(chatId: string, folderId: string) {
    const folderExists = appSettings.chatFolders.some(
      (folder) => folder.id === folderId,
    );
    if (!folderExists) return;

    updateChat(chatId, (chat) => ({
      ...chat,
      folderId,
      isPinned: false,
    }));
  }

  function removeChatFromFolder(chatId: string) {
    updateChat(chatId, (chat) => ({
      ...chat,
      folderId: undefined,
    }));
  }

  async function deleteFolder(folderId: string, mode: "move" | "delete") {
    const folder = appSettings.chatFolders.find((item) => item.id === folderId);
    if (!folder) return;

    updateChatFolders((folders) =>
      folders.filter((item) => item.id !== folderId),
    );

    if (newChatDraftFolderId === folderId) {
      setNewChatDraftFolderId(undefined);
      setNewChatDraftWorkspaceRoots([]);
    }

    if (mode === "move") {
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.folderId === folderId ? { ...chat, folderId: undefined } : chat,
        ),
      );
      showSuccess("Folder deleted. Chats moved to Chats.");
      return;
    }

    const deletingChatIds = chats
      .filter((chat) => chat.folderId === folderId)
      .map((chat) => chat.id);
    const deletingChatIdSet = new Set(deletingChatIds);

    for (const chatId of deletingChatIds) {
      if (isChatGenerating(chatId)) stopChatGeneration(chatId);
      forgetChatScrollSnapshot(chatId);
    }

    setCompletedGenerationChatIds((currentChatIds) =>
      currentChatIds.filter((chatId) => !deletingChatIdSet.has(chatId)),
    );

    const remainingChats = sortChatsByUpdatedAt(
      chats.filter((chat) => !deletingChatIdSet.has(chat.id)),
    );
    const activeChatWasDeleted = activeChatId
      ? deletingChatIdSet.has(activeChatId)
      : false;

    setChats(remainingChats);

    if (activeChatWasDeleted) {
      resetChatScrollState();
      if (remainingChats.length > 0) {
        setActiveChatId(remainingChats[0].id);
        setIsNewChatDraft(false);
        try {
          await saveActiveChatId(remainingChats[0].id);
        } catch (error) {
          console.error("Failed to save active chat id:", error);
        }
      } else {
        setActiveChatId(undefined);
        setIsNewChatDraft(true);
      }
    }

    try {
      await Promise.all(deletingChatIds.map((chatId) => deleteChat(chatId)));
      showSuccess(
        deletingChatIds.length > 0
          ? "Folder and chats deleted."
          : "Folder deleted.",
      );
    } catch (error) {
      console.error("Failed to delete folder chats:", error);
      showError("Failed to delete some folder chats.", labelForError(error));
    }
  }

  function cancelPendingChatSwitchFrames() {
    if (pendingChatSwitchFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingChatSwitchFrameRef.current);
      pendingChatSwitchFrameRef.current = null;
    }

    if (finishChatSwitchLoadingFrameRef.current !== null) {
      window.cancelAnimationFrame(finishChatSwitchLoadingFrameRef.current);
      finishChatSwitchLoadingFrameRef.current = null;
    }
  }

  function switchChatWithLoading(chatId: string) {
    if (chatId === activeChatId) {
      void switchChat(chatId);
      return;
    }

    cancelPendingChatSwitchFrames();
    pendingChatSwitchTargetRef.current = chatId;
    setChatSwitchLoadingChatId(chatId);

    pendingChatSwitchFrameRef.current = window.requestAnimationFrame(() => {
      pendingChatSwitchFrameRef.current = window.requestAnimationFrame(() => {
        pendingChatSwitchFrameRef.current = null;

        if (pendingChatSwitchTargetRef.current !== chatId) return;

        void switchChat(chatId);
      });
    });
  }

  useEffect(() => {
    if (!chatSwitchLoadingChatId) return;
    if (activeChatId !== chatSwitchLoadingChatId) return;

    finishChatSwitchLoadingFrameRef.current = window.requestAnimationFrame(
      () => {
        finishChatSwitchLoadingFrameRef.current = null;

        if (pendingChatSwitchTargetRef.current !== chatSwitchLoadingChatId) {
          return;
        }

        pendingChatSwitchTargetRef.current = null;
        setChatSwitchLoadingChatId(null);
      },
    );

    return () => {
      if (finishChatSwitchLoadingFrameRef.current !== null) {
        window.cancelAnimationFrame(finishChatSwitchLoadingFrameRef.current);
        finishChatSwitchLoadingFrameRef.current = null;
      }
    };
  }, [activeChatId, chatSwitchLoadingChatId]);

  useEffect(() => {
    return () => {
      cancelPendingChatSwitchFrames();
    };
  }, []);

  async function generateChatTitle(chatId: string) {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;

    if (isChatGenerating(chatId) || titleGenerationChatIds.includes(chatId)) {
      showInfo("Wait until generation finishes before generating a title.");
      return;
    }

    if (chat.messages.length === 0) {
      showInfo("Send a message before generating a title.");
      return;
    }

    const chatProviderForRun = resolveProviderForChat({
      chat,
      providers,
      activeProvider,
    });
    const providerForRun = resolveTitleGenerationProvider({
      preference: appSettings.titleGenerationModel,
      providers,
      fallbackProvider: chatProviderForRun,
    });
    const validation = validateProviderForGeneration(providerForRun);

    if (!validation.ok) {
      showError(validation.message, validation.description);
      if (validation.shouldOpenSettings) setSettingsOpen(true);
      return;
    }

    setTitleGenerationChatIds((currentChatIds) => [
      ...new Set([...currentChatIds, chatId]),
    ]);

    try {
      const title = await generateTitleFromChatContext({
        provider: providerForRun,
        messages: chat.messages,
      });

      if (!title) {
        showError("Failed to generate title.");
        return;
      }

      updateChat(chatId, (currentChat) => ({
        ...currentChat,
        title,
        titleMode: "manual",
        updatedAt: new Date().toISOString(),
      }));
      showSuccess("Title generated.");
    } catch (error) {
      console.error("Failed to generate chat title:", error);
      showError("Failed to generate title", labelForError(error));
    } finally {
      setTitleGenerationChatIds((currentChatIds) =>
        currentChatIds.filter((currentChatId) => currentChatId !== chatId),
      );
    }
  }

  const handleProvidersStateChange = useStableCallback(updateProvidersState);
  const handleProviderSettingChange = useStableCallback(updateProviderSetting);
  const handleAddProvider = useStableCallback(addProvider);
  const handleDuplicateProvider = useStableCallback(duplicateProvider);
  const handleDeleteProvider = useStableCallback(deleteProvider);
  const handleSaveSettingsChanges = useStableCallback(saveSettingsChanges);
  const stableRenameChat = useStableCallback(renameChat);
  const stableToggleChatPinned = useStableCallback(toggleChatPinned);
  const stableGenerateChatTitle = useStableCallback(generateChatTitle);
  const stableCloneChat = useStableCallback(cloneChat);
  const stableShowSuccess = useStableCallback(showSuccess);
  const stableShowError = useStableCallback(showError);

  const activeWorkspaceRootsKey = useMemo(
    () =>
      (isNewChatDraft
        ? newChatDraftWorkspaceRoots
        : (activeChat?.workspaceRoots ?? [])
      )
        .map((root) => root.path)
        .join("\n"),
    [activeChat?.workspaceRoots, isNewChatDraft, newChatDraftWorkspaceRoots],
  );

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;
    void (async () => {
      try {
        const skills = await loadSkills();
        if (!cancelled) setLoadedSkills(skills);
      } catch (error) {
        if (!cancelled)
          stableShowError("Failed to reload skills", labelForError(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceRootsKey, mounted, stableShowError]);
  const toolDisplayKey = useMemo(
    () =>
      executableTools
        .map((tool) => `${tool.name}:${tool.description ?? ""}`)
        .join("\n"),
    [executableTools],
  );
  const skillDisplayKey = useMemo(
    () =>
      availableSkills
        .map((skill) => `${skill.name}:${skill.description ?? ""}`)
        .join("\n"),
    [availableSkills],
  );
  const stableRegisterMessageElement = useStableCallback(
    registerMessageElement,
  );
  const stableRenderToolExecutionBlock = useStableCallback(
    renderToolExecutionBlock,
  );
  const stableCanSubmitAskUserResponse = useStableCallback(
    canSubmitAskUserResponse,
  );
  const stableCaptureMessageContext = useStableCallback(captureMessageContext);
  const stableCloseMessageContextMenu = useStableCallback(
    closeMessageContextMenu,
  );
  const stableCopyLinkHref = useStableCallback(copyLinkHref);
  const stableCopyMessageContent = useStableCallback(copyMessageContent);
  const stableBranchChatFromMessage = useStableCallback(branchChatFromMessage);
  const stableRegenerateAssistantMessage = useStableCallback(
    regenerateAssistantMessage,
  );
  const stableContinueAssistantMessage = useStableCallback(
    continueAssistantMessage,
  );
  const stableStartEditingUserMessage = useStableCallback(
    startEditingMessageInComposer,
  );
  const stableDeleteMessage = useStableCallback(deleteMessage);
  const stableSelectAssistantVariant = useStableCallback(
    selectAssistantVariant,
  );
  const stableToggleToolExecutionCollapsed = useStableCallback(
    toggleToolExecutionCollapsed,
  );
  const stableToggleThinkingCollapsed = useStableCallback(
    toggleThinkingCollapsed,
  );
  const stableSubmitAskUserResponse = useStableCallback(submitAskUserResponse);
  const stableSubmitFileToolApprovalResponse = useStableCallback(
    submitFileToolApprovalResponse,
  );
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
  const stableOpenAgentSidebar = useStableCallback((agentCallId: string) => {
    setSelectedToolSidebarDetails(undefined);
    setSelectedGenerationInfoVariant(undefined);
    setIsContextUsageSidebarOpen(false);
    setIsChatCapabilitiesSidebarOpen(false);
    setSelectedAgentSidebarStack((current) =>
      selectedAgentSidebarId && selectedAgentSidebarId !== agentCallId
        ? [...current, selectedAgentSidebarId]
        : current,
    );
    setSelectedAgentSidebarId(agentCallId);
  });
  const stableOpenAgentChat = useStableCallback((agentCallId: string) => {
    if (!selectedAgentChatId) {
      mainChatScrollTopBeforeAgentRef.current =
        chatScrollRef.current?.scrollTop ?? null;
    }
    setSelectedAgentChatId(agentCallId);
  });
  const stableOpenAgentSubchat = useStableCallback(
    (chatId: string, agentCallId: string) => {
      setSelectedAgentSidebarId(undefined);
      setSelectedAgentSidebarStack([]);
      setSelectedToolSidebarDetails(undefined);
      setSelectedGenerationInfoVariant(undefined);
      setIsContextUsageSidebarOpen(false);
      setIsChatCapabilitiesSidebarOpen(false);
      if (chatId !== activeChat?.id) {
        pendingAgentSubchatSwitchRef.current = { chatId, agentCallId };
        setSelectedAgentChatId(undefined);
        setCompletedGenerationChatIds((currentChatIds) =>
          currentChatIds.filter((currentChatId) => currentChatId !== chatId),
        );
        switchChatWithLoading(chatId);
        return;
      }
      pendingAgentSubchatSwitchRef.current = null;
      if (!selectedAgentChatId) {
        mainChatScrollTopBeforeAgentRef.current =
          chatScrollRef.current?.scrollTop ?? null;
      }
      setSelectedAgentChatId(agentCallId);
    },
  );
  const selectedAgentParentId = selectedAgentChatItem?.parentId;
  const selectedAgentParent = useMemo(
    () => findAgentCallInMessages(messages, selectedAgentParentId),
    [messages, selectedAgentParentId],
  );
  const handleLeftSidebarResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = leftSidebarWidth;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setLeftSidebarWidth(
          clampPanelWidth(startWidth + moveEvent.clientX - startX, 240, 520),
        );
      };
      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [leftSidebarWidth],
  );
  const handleRightSidebarResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = rightSidebarWidth;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setRightSidebarWidth(
          clampPanelWidth(startWidth + startX - moveEvent.clientX, 560, 920),
        );
      };
      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [rightSidebarWidth],
  );

  const showChatSwitchLoading = Boolean(chatSwitchLoadingChatId);
  const chatWidth = appSettings.chatWidth ?? "896";
  const chatWidthClassName = CHAT_WIDTH_CLASS_NAMES[chatWidth];
  const isViewingAgentChat = Boolean(selectedAgentChat);
  const headerTitle = selectedAgentChat
    ? formatAgentDisplayName(selectedAgentChat.agentName)
    : activeChat?.title || APP_NAME;
  const headerContextUsage = selectedAgentChat
    ? selectedAgentContextUsage
    : latestContextUsage;
  const visibleHeaderContextUsage = headerContextUsage;
  const isRightSidebarOpen = Boolean(
    selectedToolSidebarDetails ||
      selectedGenerationInfoVariant ||
      selectedAgentSidebarCall ||
      isChatCapabilitiesSidebarOpen ||
      (isContextUsageSidebarOpen && headerContextUsage),
  );
  const visiblePendingInteractions = useMemo(
    () =>
      pendingInteractions.filter(
        (interaction) => interaction.chatId === activeChat?.id,
      ),
    [activeChat?.id, pendingInteractions],
  );
  const visiblePendingInteractionIds = useMemo(
    () => visiblePendingInteractions.map((interaction) => interaction.id),
    [visiblePendingInteractions],
  );
  const hasBottomOverlay =
    visiblePendingInteractions.length > 0 || !selectedAgentChat;
  const bottomOverlayHeight = hasBottomOverlay
    ? bottomPanelHeight +
      CHAT_BOTTOM_OVERLAY_FADE_HEIGHT_PX +
      CHAT_BOTTOM_CONTENT_CLEARANCE_PX
    : 0;

  useLayoutEffect(() => {
    const panelElement = bottomPanelElement;

    if (!hasBottomOverlay || !panelElement) {
      setBottomPanelHeight(0);
      return;
    }

    let resizeFrame: number | null = null;

    const updatePanelHeight = () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        const nextHeight = Math.ceil(
          panelElement.getBoundingClientRect().height,
        );
        setBottomPanelHeight((currentHeight) =>
          currentHeight === nextHeight ? currentHeight : nextHeight,
        );
      });
    };

    const resizeObserver = new ResizeObserver(updatePanelHeight);
    resizeObserver.observe(panelElement);
    updatePanelHeight();

    return () => {
      resizeObserver.disconnect();
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
    };
  }, [bottomPanelElement, hasBottomOverlay]);

  useLayoutEffect(() => {
    const anchorElement = scrollButtonAnchorElement;
    const overlayElement = anchorElement?.closest<HTMLElement>(
      "[data-chat-bottom-overlay]",
    );

    if (!anchorElement || !overlayElement) {
      setScrollButtonPlacement("above");
      return;
    }

    let resizeFrame: number | null = null;

    const updatePlacement = () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        const anchorRect = anchorElement.getBoundingClientRect();
        const overlayRect = overlayElement.getBoundingClientRect();
        const availableRightSpace = overlayRect.right - anchorRect.right;
        const nextPlacement =
          availableRightSpace >= SCROLL_TO_BOTTOM_GUTTER_REQUIRED_PX
            ? "right"
            : "above";

        setScrollButtonPlacement((currentPlacement) =>
          currentPlacement === nextPlacement
            ? currentPlacement
            : nextPlacement,
        );
      });
    };

    const resizeObserver = new ResizeObserver(updatePlacement);
    resizeObserver.observe(anchorElement);
    resizeObserver.observe(overlayElement);
    updatePlacement();

    return () => {
      resizeObserver.disconnect();
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
    };
  }, [scrollButtonAnchorElement]);

  const headerWorkspaceRoots = selectedAgentChat
    ? (selectedAgentChat.workspaceRoots ?? activeChatVisibleWorkspaceRoots)
    : activeChatVisibleWorkspaceRoots;
  const activeOrDraftThinkingMode: ChatThinkingMode = isNewChatDraft
    ? (newChatDraftSettings?.thinkingMode ?? "model_default")
    : (activeChat?.thinkingMode ?? "model_default");
  const activeThinkingLevels = useMemo(
    () => getProviderThinkingLevels(activeChatProvider, activeChatModel),
    [activeChatProvider, activeChatModel],
  );
  const effectiveThinkingMode = activeThinkingLevels.some(
    (level) => level.id === activeOrDraftThinkingMode,
  )
    ? activeOrDraftThinkingMode
    : (activeThinkingLevels[0]?.id ?? activeOrDraftThinkingMode);
  const activeComposerEditState =
    composerEditState?.chatId === activeChat?.id ? composerEditState : null;

  const commitSettingsNavigation = useCallback(
    (target: SettingsSection | "chat" | "new-chat" | "close") => {
      setSettingsPageDirty(false);
      setPendingSettingsNavigation(null);
      setSettingsDiscardDialogOpen(false);

      if (target === "close") {
        void window.moltenForgeDesktop?.closeWindow();
        return;
      }

      if (target === "chat" || target === "new-chat") {
        if (target === "new-chat") createNewChatWithEmptyDraftState();
        setAppView("chat");
        setIsSettingsSidebarCollapsed(false);
        return;
      }

      setSettingsSection(target);
    },
    [createNewChatWithEmptyDraftState],
  );

  const requestSettingsNavigation = useCallback(
    (target: SettingsSection | "chat" | "new-chat" | "close") => {
      if (
        target !== "chat" &&
        target !== "new-chat" &&
        target !== "close" &&
        target === settingsSection
      ) {
        return;
      }

      if (settingsPageDirty) {
        setPendingSettingsNavigation(target);
        setSettingsDiscardDialogOpen(true);
        return;
      }

      commitSettingsNavigation(target);
    },
    [commitSettingsNavigation, settingsPageDirty, settingsSection],
  );

  const requestWindowClose = useCallback(() => {
    if (appView === "settings" && settingsPageDirty) {
      requestSettingsNavigation("close");
      return;
    }
    void window.moltenForgeDesktop?.closeWindow();
  }, [appView, requestSettingsNavigation, settingsPageDirty]);

  if (!mounted) {
    return (
      <main className="relative flex h-dvh items-center justify-center bg-background text-foreground">
        <div className="absolute inset-x-0 top-0 flex h-10 items-center pr-[100px]">
          <div className="app-region-drag min-w-0 flex-1" aria-hidden="true" />
        </div>
        <WindowControls
          className="fixed right-0 top-1 z-[100] bg-background/85 backdrop-blur-sm"
        />
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="molten-forge-loading-text text-muted-foreground"
            aria-label="Loading app data"
          />
        </div>
      </main>
    );
  }

  const handleRestoreGeneralDefaults = () => {
    setTheme("system");
    setAppSettings((currentSettings) => ({
      ...currentSettings,
      chatTitleGenerationMode: DEFAULT_APP_SETTINGS.chatTitleGenerationMode,
      titleGenerationModel: DEFAULT_APP_SETTINGS.titleGenerationModel,
      fontFamily: DEFAULT_APP_SETTINGS.fontFamily,
      thinkingAutoCollapse: DEFAULT_APP_SETTINGS.thinkingAutoCollapse,
      renderMarkdownWhileStreaming:
        DEFAULT_APP_SETTINGS.renderMarkdownWhileStreaming,
      chatWidth: DEFAULT_APP_SETTINGS.chatWidth,
    }));
  };

  if (appView === "settings") {
    let settingsPage: ReactNode;

    switch (settingsSection) {
      case "providers":
        settingsPage = (
          <ProviderSettingsDialog
            embedded
            open
            onOpenChange={() => {}}
            onDirtyChange={setSettingsPageDirty}
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
        );
        break;
      case "modes":
        settingsPage = (
          <ModesDialog
            embedded
            open
            onOpenChange={() => {}}
            onDirtyChange={setSettingsPageDirty}
            modesState={modesState}
            onModesStateChange={setModesState}
            availableTools={availableTools}
            availableSkills={availableSkills}
            availableAgents={availableAgents}
            toolsSettings={toolsSettings}
            skillsSettings={skillsSettings}
            agentsSettings={agentsSettings}
            showSuccess={stableShowSuccess}
            showError={stableShowError}
          />
        );
        break;
      case "system-prompt":
        settingsPage = (
          <SystemPromptDialog
            embedded
            open
            value={systemPrompt}
            onOpenChange={() => {}}
            onDirtyChange={setSettingsPageDirty}
            onValueChange={setSystemPrompt}
            showSuccess={stableShowSuccess}
            showError={stableShowError}
          />
        );
        break;
      case "tools":
        settingsPage = (
          <ToolsDialog
            embedded
            open
            onOpenChange={() => {}}
            onDirtyChange={setSettingsPageDirty}
            toolsSettings={toolsSettings}
            onToolsSettingsChange={setToolsSettings}
            availableTools={availableTools}
            loadedTools={loadedTools}
            onLoadedToolsChange={setLoadedTools}
            callAgentEnabled={availableAgents.some(
              (agent) => effectiveAgentPermissions.get(agent.name) !== "deny",
            )}
            showSuccess={stableShowSuccess}
            showError={stableShowError}
          />
        );
        break;
      case "skills":
        settingsPage = (
          <SkillsDialog
            embedded
            open
            onOpenChange={() => {}}
            onDirtyChange={setSettingsPageDirty}
            skillsSettings={skillsSettings}
            onSkillsSettingsChange={setSkillsSettings}
            loadedSkills={loadedSkills}
            onLoadedSkillsChange={setLoadedSkills}
            availableTools={availableTools}
            workspaceRoots={[]}
            showSuccess={stableShowSuccess}
            showError={stableShowError}
          />
        );
        break;
      case "agents":
        settingsPage = (
          <AgentsDialog
            embedded
            open
            onOpenChange={() => {}}
            onDirtyChange={setSettingsPageDirty}
            agentsSettings={agentsSettings}
            onAgentsSettingsChange={setAgentsSettings}
            loadedAgents={loadedAgents}
            onLoadedAgentsChange={setLoadedAgents}
            availableTools={availableTools}
            availableSkills={availableSkills}
            toolsSettings={toolsSettings}
            skillsSettings={skillsSettings}
            providers={providers}
            showSuccess={stableShowSuccess}
            showError={stableShowError}
          />
        );
        break;
      case "mcp":
        settingsPage = (
          <McpDialog
            embedded
            open
            onOpenChange={() => {}}
            onDirtyChange={setSettingsPageDirty}
            mcpSettings={mcpSettings}
            onMcpSettingsChange={handleMcpSettingsChange}
            toolsSettings={toolsSettings}
            onToolsSettingsChange={setToolsSettings}
            showSuccess={stableShowSuccess}
            showError={stableShowError}
          />
        );
        break;
      case "general":
      default:
        settingsPage = (
          <div className="h-full w-full px-4">
            <div
              className={cn(
                "mx-auto h-full w-full",
                chatWidthClassName,
              )}
            >
              <SettingsDialog
                embedded
                open
                appVersionLabel={APP_VERSION_LABEL}
                onOpenChange={() => {}}
                chatTitleGenerationMode={appSettings.chatTitleGenerationMode}
                titleGenerationModelValue={resolvedTitleGenerationModelValue}
                titleGenerationDefaultModelOption={titleGenerationDefaultModelOption}
                titleGenerationModelGroups={titleGenerationModelGroups}
                appFontFamily={appSettings.fontFamily}
                thinkingAutoCollapse={appSettings.thinkingAutoCollapse ?? true}
                renderMarkdownWhileStreaming={
                  appSettings.renderMarkdownWhileStreaming ?? true
                }
                chatWidth={appSettings.chatWidth ?? "896"}
                theme={theme}
                resolvedTheme={resolvedTheme}
                onToggleAiTitleGeneration={(checked) =>
                  setAppSettings((currentSettings) => ({
                    ...currentSettings,
                    chatTitleGenerationMode: checked ? "ai" : "local",
                  }))
                }
                onTitleGenerationModelChange={(value) =>
                  setAppSettings((currentSettings) => ({
                    ...currentSettings,
                    titleGenerationModel:
                      decodeTitleGenerationModelValue(value),
                  }))
                }
                onSetTheme={setTheme}
                onSetAppFontFamily={(fontFamily) =>
                  setAppSettings((currentSettings) => ({
                    ...currentSettings,
                    fontFamily,
                  }))
                }
                onThinkingAutoCollapseChange={(checked) =>
                  setAppSettings((currentSettings) => ({
                    ...currentSettings,
                    thinkingAutoCollapse: checked,
                  }))
                }
                onRenderMarkdownWhileStreamingChange={(checked) =>
                  setAppSettings((currentSettings) => ({
                    ...currentSettings,
                    renderMarkdownWhileStreaming: checked,
                  }))
                }
                onChatWidthChange={(nextChatWidth) =>
                  setAppSettings((currentSettings) => ({
                    ...currentSettings,
                    chatWidth: nextChatWidth,
                  }))
                }
                onRestoreDefaults={handleRestoreGeneralDefaults}
                onOpenProviders={() => openSettingsSection("providers")}
                onOpenTools={() => openSettingsSection("tools")}
                onOpenSkills={() => openSettingsSection("skills")}
                onOpenAgents={() => openSettingsSection("agents")}
                onOpenModes={() => openSettingsSection("modes")}
                onOpenMcp={() => openSettingsSection("mcp")}
                onOpenSystemPrompt={() =>
                  openSettingsSection("system-prompt")
                }
              />
            </div>
          </div>
        );
        break;
    }

    return (
      <main className="relative flex h-dvh min-h-0 overflow-hidden bg-background text-foreground">
        <SettingsSidebar
          appName={APP_NAME}
          activeSection={settingsSection}
          collapsed={isSettingsSidebarCollapsed}
          onCollapsedChange={setIsSettingsSidebarCollapsed}
          width={leftSidebarWidth}
          onResizePointerDown={handleLeftSidebarResizePointerDown}
          onSectionChange={requestSettingsNavigation}
          onBackToChat={() => requestSettingsNavigation("chat")}
          onCreateNewChat={() => requestSettingsNavigation("new-chat")}
          onCloseWindow={requestWindowClose}
        />

        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          <div className="app-region-drag flex h-[41px] shrink-0 items-center border-b px-2 pr-[100px]">
            {isSettingsSidebarCollapsed ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="app-region-no-drag shrink-0"
                onClick={() => setIsSettingsSidebarCollapsed(false)}
                title="Show sidebar"
                aria-label="Show sidebar"
              >
                <Menu className="size-4" />
              </Button>
            ) : null}
            <span className="ml-2 text-base font-medium text-foreground">
              {SETTINGS_SECTION_LABELS[settingsSection as SettingsSection]}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{settingsPage}</div>
        </section>

        <WindowControls
          className="fixed right-0 top-1 z-[100] bg-background/85 backdrop-blur-sm"
          onCloseRequest={requestWindowClose}
        />

        <UnsavedChangesDialog
          open={settingsDiscardDialogOpen}
          onCancel={() => {
            setPendingSettingsNavigation(null);
            setSettingsDiscardDialogOpen(false);
          }}
          onDiscard={() => {
            if (pendingSettingsNavigation) {
              commitSettingsNavigation(pendingSettingsNavigation);
            }
          }}
        />
      </main>
    );
  }

  return (
    <main className="relative flex h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <WindowControls
        className="fixed right-0 top-1 z-[100] bg-background/85 backdrop-blur-sm"
        onCloseRequest={requestWindowClose}
      />
      <ChatSidebar
        appName={APP_NAME}
        chats={sortedChats}
        folders={appSettings.chatFolders}
        activeChatId={activeChat?.id}
        isCollapsed={isSidebarCollapsed}
        width={leftSidebarWidth}
        onResizePointerDown={handleLeftSidebarResizePointerDown}
        generatingChatIds={generatingChatIds}
        completedGenerationChatIds={completedGenerationChatIds}
        titleGenerationChatIds={titleGenerationChatIds}
        onCollapsedChange={setIsSidebarCollapsed}
        onSwitchChat={(chatId) => {
          setSelectedAgentChatId(undefined);
          setSelectedAgentSidebarId(undefined);
          setSelectedAgentSidebarStack([]);
          setSelectedToolSidebarDetails(undefined);
          setSelectedGenerationInfoVariant(undefined);
          setIsContextUsageSidebarOpen(false);
          setIsChatCapabilitiesSidebarOpen(false);
          pendingAgentSubchatSwitchRef.current = null;
          setCompletedGenerationChatIds((currentChatIds) =>
            currentChatIds.filter((currentChatId) => currentChatId !== chatId),
          );
          switchChatWithLoading(chatId);
        }}
        onRenameChat={stableRenameChat}
        onToggleChatPinned={stableToggleChatPinned}
        onGenerateChatTitle={stableGenerateChatTitle}
        onCloneChat={stableCloneChat}
        onRemoveChat={(chatId) => {
          setCompletedGenerationChatIds((currentChatIds) =>
            currentChatIds.filter((currentChatId) => currentChatId !== chatId),
          );
          void removeChatAndResetDraftState(chatId);
        }}
        onCreateNewChat={createNewChatWithEmptyDraftState}
        onCreateChatInFolder={createNewChatInFolder}
        onCreateChatWithSameSettings={createNewChatWithSameSettings}
        onOpenSettings={() => setSettingsOpen(true)}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onAddFolderDefaultPath={addFolderDefaultFolder}
        onAddFileDefaultPath={addFolderDefaultFile}
        onRemoveFolderDefaultPath={removeFolderDefaultPath}
        onClearFolderDefaultPaths={clearFolderDefaultPaths}
        onMoveChatToFolder={moveChatToFolder}
        onRemoveChatFromFolder={removeChatFromFolder}
        agentSubchats={agentSubchats}
        activeAgentCallId={selectedAgentChatId}
        onOpenAgentSubchat={stableOpenAgentSubchat}
        onClearChat={(chatId) => {
          setCompletedGenerationChatIds((currentChatIds) =>
            currentChatIds.filter((currentChatId) => currentChatId !== chatId),
          );
          void clearChat(chatId);
        }}
      />

      <section className="relative flex min-h-0 flex-1 flex-col bg-background px-4">
        <div className="-mx-4 flex min-w-0 items-center border-b">
          <div
            data-main-titlebar
            data-sidebar-collapsed={isSidebarCollapsed ? "true" : "false"}
            data-right-sidebar-open={isRightSidebarOpen ? "true" : "false"}
            className="app-region-drag grid min-w-0 flex-1 select-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-1"
          >
            <div className="flex min-w-0 items-center gap-1">
              {isSidebarCollapsed ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    onClick={() => setIsSidebarCollapsed(false)}
                    title="Show sidebar"
                    aria-label="Show sidebar"
                  >
                    <Menu className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="app-region-no-drag shrink-0"
                    onClick={createNewChatWithEmptyDraftState}
                    title="New chat (Ctrl+N)"
                    aria-label="New chat"
                  >
                    <Plus className="size-4" />
                  </Button>
                  <AppMenu
                    onCreateNewChat={createNewChatWithEmptyDraftState}
                    triggerClassName="shrink-0"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="app-region-no-drag shrink-0"
                    onClick={() => setSettingsOpen(true)}
                    title="Settings"
                    aria-label="Settings"
                  >
                    <Settings className="size-4" />
                  </Button>
                </>
              ) : null}
              {isViewingAgentChat ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  onClick={() =>
                    selectedAgentParent
                      ? setSelectedAgentChatId(selectedAgentParent.id)
                      : setSelectedAgentChatId(undefined)
                  }
                  title={
                    selectedAgentParent
                      ? "Back to parent agent"
                      : "Back to main chat"
                  }
                  aria-label={
                    selectedAgentParent
                      ? "Back to parent agent"
                      : "Back to main chat"
                  }
                >
                  <ArrowLeft className="size-4" />
                </Button>
              ) : null}
              <WorkspaceRootsControl
                activeChatExists={
                  Boolean(activeChat) || isNewChatDraft || isViewingAgentChat
                }
                disabled={!isViewingAgentChat && isSending}
                readOnly={isViewingAgentChat}
                roots={headerWorkspaceRoots}
                open={isWorkspacePickerOpen}
                onOpenChange={setIsWorkspacePickerOpen}
                onAddRoot={addActiveChatWorkspaceRoot}
                onAddFile={addActiveChatAccessibleFile}
                onRemoveRoot={removeActiveChatWorkspaceRoot}
                onOpenRoot={openWorkspaceRoot}
              />
            </div>
            <div className="min-w-0 text-center">
              <div className="truncate text-sm font-medium leading-5 text-foreground">
                {headerTitle}
              </div>
            </div>
            <div className="flex min-w-0 items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                disabled={!activeChat && !isNewChatDraft}
                onClick={() => {
                  setSelectedToolSidebarDetails(undefined);
                  setSelectedGenerationInfoVariant(undefined);
                  setSelectedAgentSidebarId(undefined);
                  setIsContextUsageSidebarOpen(false);
                  setIsChatCapabilitiesSidebarOpen(true);
                }}
                title="Chat capabilities"
                aria-label="Chat capabilities"
              >
                <Settings2 className="size-4" />
              </Button>
              {visibleHeaderContextUsage ? (
                <ContextUsageIndicator
                  usage={visibleHeaderContextUsage}
                  onOpen={() => {
                    setSelectedToolSidebarDetails(undefined);
                    setSelectedGenerationInfoVariant(undefined);
                    setSelectedAgentSidebarId(undefined);
                    setIsChatCapabilitiesSidebarOpen(false);
                    setIsContextUsageSidebarOpen(true);
                  }}
                />
              ) : null}
            </div>
          </div>
          {!isRightSidebarOpen ? (
            <div className="h-8 w-[100px] shrink-0" aria-hidden />
          ) : null}
        </div>

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

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {showChatSwitchLoading && (
            <div
              className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center text-foreground backdrop-blur-lg"
              aria-label="Loading chat"
              aria-live="polite"
            >
              <div className="select-none px-8 py-4 text-[30px] font-bold leading-tight text-muted-foreground">
                Loading...
              </div>
            </div>
          )}

          <div
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            onWheel={handleChatWheel}
            onPointerDown={handleChatPointerDown}
            className={cn(
              "chat-scrollbar absolute inset-0 w-full [overflow-anchor:none]",
              hasMessages
                ? "overflow-y-auto pt-3 pb-3 md:pt-6 md:pb-6"
                : selectedAgentChat
                  ? "overflow-y-auto"
                  : "overflow-hidden",
            )}
          >
            <div
              ref={chatContentRef}
              className={cn(
                "mx-auto flex w-full min-w-0 flex-col [overflow-anchor:none]",
                selectedAgentChat ? "max-w-4xl" : chatWidthClassName,
                hasMessages || selectedAgentChat ? "gap-5" : "h-full",
              )}
            >
              {selectedAgentChat ? (
                <AgentTranscriptChatView
                  agentCall={selectedAgentChat}
                  renderToolExecutionBlock={stableRenderToolExecutionBlock}
                  canSubmitAskUserResponse={stableCanSubmitAskUserResponse}
                  pendingInteractionIds={visiblePendingInteractionIds}
                  onSubmitAskUserResponse={stableSubmitAskUserResponse}
                  onCancelAskUserRequest={stableCancelAskUserRequest}
                  onAskUserLayoutChange={stableHandleAskUserLayoutChange}
                  onOpenAgentCall={stableOpenAgentSidebar}
                />
              ) : !hasMessages ? (
                <EmptyChatState
                  onOpenProviders={() => openSettingsSection("providers")}
                />
              ) : (
                <ChatMessageList
                  messages={messages}
                  activeChatId={activeChat?.id ?? ""}
                  scrollElementRef={chatScrollRef}
                  offsetResolverRef={messageOffsetResolverRef}
                  isSending={isSending}
                  editingMessageId={editingMessageId}
                  copiedMessageId={copiedMessageId}
                  messageContextMenu={messageContextMenu}
                  visualFlushRequests={visualFlushRequests}
                  visualStreamingMessageIds={visualStreamingMessageIds}
                  collapsedToolStepIds={collapsedToolStepIds}
                  collapsedThinkingStepIds={collapsedThinkingStepIds}
                  thinkingAutoCollapse={
                    appSettings.thinkingAutoCollapse ?? true
                  }
                  renderMarkdownWhileStreaming={
                    appSettings.renderMarkdownWhileStreaming ?? true
                  }
                  freezeAssistantStreaming={isReaderScrollLocked}
                  toolDisplayKey={toolDisplayKey}
                  skillDisplayKey={skillDisplayKey}
                  agentDisplayKey={agentDisplayKey}
                  registerMessageElement={stableRegisterMessageElement}
                  renderToolExecutionBlock={stableRenderToolExecutionBlock}
                  canSubmitAskUserResponse={stableCanSubmitAskUserResponse}
                  pendingInteractionIds={visiblePendingInteractionIds}
                  onCaptureMessageContext={stableCaptureMessageContext}
                  onCloseMessageContextMenu={stableCloseMessageContextMenu}
                  onCopyLinkHref={stableCopyLinkHref}
                  onCopyMessageContent={stableCopyMessageContent}
                  onBranchFromMessage={stableBranchChatFromMessage}
                  onRegenerateAssistantMessage={
                    stableRegenerateAssistantMessage
                  }
                  onContinueAssistantMessage={stableContinueAssistantMessage}
                  onStartEditingUserMessage={stableStartEditingUserMessage}
                  onDeleteMessage={stableDeleteMessage}
                  onSelectAssistantVariant={stableSelectAssistantVariant}
                  onToggleToolExecutionCollapsed={
                    stableToggleToolExecutionCollapsed
                  }
                  onToggleThinkingCollapsed={stableToggleThinkingCollapsed}
                  onSubmitAskUserResponse={stableSubmitAskUserResponse}
                  onCancelAskUserRequest={stableCancelAskUserRequest}
                  onAskUserLayoutChange={stableHandleAskUserLayoutChange}
                  onAssistantVisualProgress={
                    stableHandleAssistantVisualProgress
                  }
                  onAssistantVisualStreamingChange={
                    stableHandleAssistantVisualStreamingChange
                  }
                  onOpenAgentCall={stableOpenAgentSidebar}
                  onOpenGenerationInfo={(variant) => {
                    setSelectedGenerationInfoVariant(variant);
                    setSelectedToolSidebarDetails(undefined);
                    setSelectedAgentSidebarId(undefined);
                    setSelectedAgentSidebarStack([]);
                    setIsContextUsageSidebarOpen(false);
                    setIsChatCapabilitiesSidebarOpen(false);
                  }}
                />
              )}
              <div
                ref={chatBottomRef}
                aria-hidden="true"
                className="w-full shrink-0"
                style={{
                  height:
                    hasMessages || selectedAgentChat
                      ? Math.max(bottomOverlayHeight, 1)
                      : 1,
                }}
              />
            </div>
          </div>

          {hasBottomOverlay ? (
            <div
              data-chat-bottom-overlay
              className="chat-bottom-overlay pointer-events-none absolute -inset-x-4 bottom-0 z-20 pt-12"
            >
              <div ref={bottomPanelRef} className="pointer-events-auto px-4">
                <div className="relative">
                  {hasMessages &&
                  !selectedAgentChat &&
                  isChatScrollable &&
                  !isNearChatBottom &&
                  showScrollToBottomButton ? (
                    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 md:top-4">
                      <div
                        ref={scrollButtonAnchorRef}
                        className={cn(
                          "relative mx-auto w-full",
                          chatWidthClassName,
                        )}
                      >
                        <div
                          className={cn(
                            "absolute",
                            scrollButtonPlacement === "right"
                              ? "left-full top-0 ml-2"
                              : "bottom-full right-0 mb-2",
                          )}
                        >
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="pointer-events-auto shadow-md opacity-80 hover:opacity-100"
                            onClick={() => scrollChatToBottom()}
                            title="Scroll to bottom"
                            aria-label="Scroll to bottom"
                          >
                            <ChevronDown className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {visiblePendingInteractions.length > 0 ? (
                  <InteractionDock
                    interactions={visiblePendingInteractions}
                    contentWidthClassName={
                      selectedAgentChat ? "max-w-4xl" : chatWidthClassName
                    }
                    canSubmit={stableCanSubmitAskUserResponse}
                    onSubmitAskUserResponse={stableSubmitAskUserResponse}
                    onSubmitToolApprovalResponse={
                      stableSubmitFileToolApprovalResponse
                    }
                    onCancelAskUserRequest={stableCancelAskUserRequest}
                  />
                ) : !selectedAgentChat ? (
                  <ChatComposer
                    ref={chatComposerRef}
                    disabled={!activeChat && !isNewChatDraft}
                    isSending={isSending}
                    draftKey={composerDraftKey}
                    draft={activeComposerDraft}
                    onDraftChange={updateActiveComposerDraft}
                    attachments={activeComposerAttachments}
                    onAttachmentsChange={updateActiveComposerAttachments}
                    onSend={handleComposerSend}
                    onStop={stopGeneration}
                    editPreview={activeComposerEditState?.preview}
                    onCancelEdit={
                      activeComposerEditState ? cancelComposerEdit : undefined
                    }
                    supportsVision={modelSupportsVision(
                      activeChatProvider,
                      activeChatModel,
                    )}
                    footerStart={
                      <ComposerFooter
                        activeChatExists={Boolean(activeChat) || isNewChatDraft}
                        isSending={isSending}
                        activeChatProvider={activeChatProvider}
                        activeChatModel={activeChatModel}
                        visibleProviderGroups={visibleProviderGroups}
                        isModelPickerOpen={isSidebarModelComboboxOpen}
                        onModelPickerOpenChange={setIsSidebarModelComboboxOpen}
                        modelSearchValue={sidebarModelSearchValue}
                        onModelSearchValueChange={setSidebarModelSearchValue}
                        onSelectProviderModel={selectActiveChatProviderModel}
                        activeMode={activeMode}
                        visibleModes={visibleModes}
                        isModePickerOpen={isModePickerOpen}
                        onModePickerOpenChange={setIsModePickerOpen}
                        modeSearchValue={modeSearchValue}
                        onModeSearchValueChange={setModeSearchValue}
                        onSelectMode={selectActiveChatMode}
                        thinkingMode={effectiveThinkingMode}
                        thinkingLevels={activeThinkingLevels}
                        isThinkingModePickerOpen={isThinkingModePickerOpen}
                        onThinkingModePickerOpenChange={
                          setIsThinkingModePickerOpen
                        }
                        onThinkingModeChange={setActiveOrDraftChatThinkingMode}
                        autoApprove={activeOrDraftAutoApprove}
                        onAutoApproveChange={setActiveOrDraftChatAutoApprove}
                      />
                    }
                    contentWidthClassName={chatWidthClassName}
                    skillMentionOptions={skillMentionOptions}
                    onLoadSkillMention={loadSkillFromComposerMention}
                  />
                ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {isRightSidebarOpen ? (
        <div
          className="relative z-20 h-dvh shrink-0"
          style={{ width: rightSidebarWidth }}
        >
          <div
            className="group absolute inset-y-0 left-0 z-30 w-2 -translate-x-1/2 cursor-col-resize"
            onPointerDown={handleRightSidebarResizePointerDown}
            title="Resize right sidebar"
            aria-hidden="true"
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          {selectedToolSidebarDetails ? (
            <ToolExecutionDetailsSidebar
              windowControls={<div className="h-8 w-[100px] shrink-0" aria-hidden />}
              details={selectedToolSidebarDetails}
              loadedTools={executableTools}
              width={rightSidebarWidth}
              onBack={
                selectedToolSidebarDetails.returnToAgentCallId
                  ? () => setSelectedToolSidebarDetails(undefined)
                  : undefined
              }
              onClose={() => setSelectedToolSidebarDetails(undefined)}
            />
          ) : selectedGenerationInfoVariant ? (
            <GenerationInfoSidebar
              windowControls={<div className="h-8 w-[100px] shrink-0" aria-hidden />}
              variant={selectedGenerationInfoVariant}
              width={rightSidebarWidth}
              onClose={() => setSelectedGenerationInfoVariant(undefined)}
            />
          ) : selectedAgentSidebarCall ? (
            <AgentTranscriptSidebar
              windowControls={<div className="h-8 w-[100px] shrink-0" aria-hidden />}
              agentCall={selectedAgentSidebarCall}
              width={rightSidebarWidth}
              renderToolExecutionBlock={stableRenderToolExecutionBlock}
              canSubmitAskUserResponse={stableCanSubmitAskUserResponse}
              pendingInteractionIds={visiblePendingInteractionIds}
              onSubmitAskUserResponse={stableSubmitAskUserResponse}
              onCancelAskUserRequest={stableCancelAskUserRequest}
              onAskUserLayoutChange={stableHandleAskUserLayoutChange}
              onOpenAgentCall={stableOpenAgentSidebar}
              onBack={
                selectedAgentSidebarStack.length > 0
                  ? () => {
                      const nextStack = [...selectedAgentSidebarStack];
                      const previousAgentId = nextStack.pop();
                      if (previousAgentId) {
                        setSelectedAgentSidebarId(previousAgentId);
                      }
                      setSelectedAgentSidebarStack(nextStack);
                    }
                  : undefined
              }
              onOpenAsChat={(agentCallId) => {
                setSelectedAgentChatId(agentCallId);
                setSelectedAgentSidebarId(undefined);
                setSelectedAgentSidebarStack([]);
                setSelectedToolSidebarDetails(undefined);
                setIsContextUsageSidebarOpen(false);
                setIsChatCapabilitiesSidebarOpen(false);
              }}
              onClose={() => {
                setSelectedAgentSidebarId(undefined);
                setSelectedAgentSidebarStack([]);
              }}
            />
          ) : isChatCapabilitiesSidebarOpen ? (
            <ChatCapabilitiesSidebar
              windowControls={<div className="h-8 w-[100px] shrink-0" aria-hidden />}
              width={rightSidebarWidth}
              tools={availableTools}
              toolPermissions={effectiveToolPermissions}
              globalToolPermissions={globalToolPermissions}
              modeToolPermissions={activeModeToolPermissions}
              skills={availableSkills}
              skillAvailability={effectiveSkillAvailability}
              globalSkillAvailability={globalSkillAvailability}
              modeSkillAvailability={activeModeSkillAvailability}
              agents={availableAgents}
              agentPermissions={effectiveAgentPermissions}
              globalAgentPermissions={globalAgentPermissions}
              modeAgentPermissions={activeModeAgentPermissions}
              modeName={activeMode.name || "Default"}
              autoApprove={activeOrDraftAutoApprove}
              onClose={() => setIsChatCapabilitiesSidebarOpen(false)}
            />
          ) : (
            <ContextUsageSidebar
              windowControls={<div className="h-8 w-[100px] shrink-0" aria-hidden />}
              usage={isContextUsageSidebarOpen ? headerContextUsage : undefined}
              width={rightSidebarWidth}
              onClose={() => setIsContextUsageSidebarOpen(false)}
            />
          )}
        </div>
      ) : null}

    </main>
  );
}
