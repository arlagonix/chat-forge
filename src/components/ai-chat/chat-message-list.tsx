import { Spinner as RadixSpinner } from "@radix-ui/themes";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  Info,
  Pencil,
  RefreshCcw,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type {
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { AgentCallBlock } from "@/components/ai-chat/agent-call-block";
import { AttachmentChips } from "@/components/ai-chat/attachment-chips";
import { SmoothAssistantMessageContent } from "@/components/ai-chat/smooth-assistant-message";
import { ThinkingBlock } from "@/components/ai-chat/thinking-block";
import {
  AskUserBlock,
  TaskListBlock,
  ToolApprovalBlock,
} from "@/components/ai-chat/tool-interaction-blocks";
import { TooltipIconButton } from "@/components/ai-chat/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { getActiveVariant } from "@/lib/ai-chat/chat-utils";
import { getAssistantGenerationStatusLabel } from "@/lib/ai-chat/generation-status-label";
import {
  getToolBatchGroupLabel,
  getVisibleAssistantProcessSteps,
  groupVisibleAssistantProcessSteps,
  type VisibleAssistantProcessStep as SharedVisibleAssistantProcessStep,
  type VisibleAssistantProcessStepGroup as SharedVisibleAssistantProcessStepGroup,
} from "@/lib/ai-chat/process-step-groups";
import { getToolBuildingVisibleMetadata } from "@/lib/ai-chat/tool-building";
import type {
  AskUserRequest,
  AskUserResponse,
  ChatAssistantProcessStep,
  ChatAssistantVariant,
  ChatMessage,
  ChatToolCall,
  ChatToolResult,
  ToolApprovalResponse,
  ToolExecutionStatus,
} from "@/lib/ai-chat/types";
import { cn } from "@/lib/utils";

type ParsedSkillInvocation = {
  name: string;
  location: string;
  content: string;
  rest: string;
};

function parseSkillInvocationMessage(
  content: string,
): ParsedSkillInvocation | null {
  const match =
    /^<skill\s+name="([^"]+)"\s+location="([^"]*)">\s*([\s\S]*?)\s*<\/skill>\s*([\s\S]*)$/.exec(
      content.trim(),
    );
  if (!match) return null;

  return {
    name: match[1] ?? "",
    location: match[2] ?? "",
    content: (match[3] ?? "").trim(),
    rest: (match[4] ?? "").trim(),
  };
}

function formatSkillDirectory(location: string) {
  const normalized = location.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return location;
  return location.slice(0, index);
}

function parseSlashInvocation(content: string) {
  const match = /^(\s*)(\/(?:skill|s|agent|a):[A-Za-z0-9_-]+)([\s\S]*)$/.exec(
    content,
  );
  if (!match) return null;
  return {
    leading: match[1] ?? "",
    command: match[2] ?? "",
    rest: match[3] ?? "",
  };
}

function MarkdownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15V9l3 4 3-4v6" />
      <path d="M16 9v6" />
      <path d="m14 13 2 2 2-2" />
    </svg>
  );
}

type VisibleAssistantProcessStep = SharedVisibleAssistantProcessStep;
type VisibleAssistantProcessStepGroup = SharedVisibleAssistantProcessStepGroup;

export type MessageContextMenuState = {
  messageId: string;
  x: number;
  y: number;
  linkHref: string | null;
  selectedText: string;
  renderedText: string;
};

type RenderToolExecutionBlockArgs = {
  id: string;
  toolCall: ChatToolCall;
  toolResult?: ChatToolResult;
  status?: ToolExecutionStatus;
  returnToAgentCallId?: string;
};

type ChatMessageListProps = {
  messages: ChatMessage[];
  activeChatId: string;
  // The scroll container that owns the message viewport. Shared with
  // useChatAutoscroll so virtualization, sticky-scroll, and position
  // restoration all operate on the same element.
  scrollElementRef: RefObject<HTMLDivElement | null>;
  // Populated by the list with a function that maps a message id to the
  // scrollTop at which that message's top aligns with the viewport top, using
  // the virtualizer's measurements. Lets the autoscroll hook restore a saved
  // position even when the anchored message is not currently mounted.
  offsetResolverRef?: RefObject<((messageId: string) => number | null) | null>;
  isSending: boolean;
  editingMessageId: string | null;
  copiedMessageId: string | null;
  messageContextMenu: MessageContextMenuState | null;
  visualFlushRequests: Record<string, number>;
  visualStreamingMessageIds: string[];
  collapsedToolStepIds: Record<string, boolean>;
  collapsedThinkingStepIds: Record<string, boolean>;
  thinkingAutoCollapse?: boolean;
  renderMarkdownWhileStreaming?: boolean;
  freezeAssistantStreaming?: boolean;
  toolDisplayKey: string;
  skillDisplayKey: string;
  agentDisplayKey: string;
  registerMessageElement: (
    messageId: string,
  ) => (element: HTMLDivElement | null) => void;
  renderToolExecutionBlock: (args: RenderToolExecutionBlockArgs) => ReactNode;
  canSubmitAskUserResponse: (toolCallId: string) => boolean;
  onCaptureMessageContext: (
    event: ReactMouseEvent<HTMLElement>,
    messageId: string,
  ) => void;
  onCloseMessageContextMenu: () => void;
  onCopyLinkHref: (href: string | null) => void | Promise<void>;
  onCopyMessageContent: (
    messageId: string,
    content: string,
  ) => void | Promise<void>;
  onBranchFromMessage: (messageId: string) => void | Promise<void>;
  onRegenerateAssistantMessage: (messageId: string) => void | Promise<void>;
  onContinueAssistantMessage: (messageId: string) => void | Promise<void>;
  onStartEditingUserMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onSelectAssistantVariant: (messageId: string, variantIndex: number) => void;
  onToggleToolExecutionCollapsed: (
    stepId: string,
    nextCollapsed: boolean,
  ) => void;
  onToggleThinkingCollapsed: (stepId: string, nextCollapsed: boolean) => void;
  onSubmitAskUserResponse: (
    toolCall: ChatToolCall,
    request: AskUserRequest,
    response: AskUserResponse,
  ) => void | Promise<void>;
  onSubmitFileToolApprovalResponse: (
    toolCall: ChatToolCall,
    response: ToolApprovalResponse,
  ) => void | Promise<void>;
  onCancelAskUserRequest: (toolCallId: string) => void;
  onAskUserLayoutChange: () => void;
  onAssistantVisualProgress: (chatId: string) => void;
  onAssistantVisualStreamingChange: (
    streamingMessageId: string,
    isStreaming: boolean,
  ) => void;
  onOpenAgentCall: (agentCallId: string) => void;
  onOpenGenerationInfo: (variant: ChatAssistantVariant) => void;
};

function formatHumanDuration(durationMs?: number) {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return "";
  }

  let seconds = Math.max(1, Math.round(durationMs / 1000));
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatNumber(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString()
    : "—";
}

function formatTps(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(value >= 10 ? 1 : 2)} tok/s`
    : "—";
}

function parseDateMs(value?: string) {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function getAgentDurationMs(agentCall: {
  startedAt: string;
  completedAt?: string;
}) {
  const startedAt = parseDateMs(agentCall.startedAt);
  const completedAt = parseDateMs(agentCall.completedAt);
  if (startedAt === undefined || completedAt === undefined) return 0;
  return Math.max(0, completedAt - startedAt);
}

function getStepDurationMs(step: ChatAssistantProcessStep) {
  if ("startedAt" in step && "completedAt" in step) {
    const startedAt = parseDateMs(step.startedAt);
    const completedAt = parseDateMs(step.completedAt);
    if (startedAt !== undefined && completedAt !== undefined) {
      return Math.max(0, completedAt - startedAt);
    }
  }
  return 0;
}

function getKnownNonGenerationDurationMs(
  steps: ChatAssistantProcessStep[] = [],
) {
  return steps.reduce((total, step) => {
    if (
      step.type === "tool_execution" ||
      step.type === "tasks" ||
      step.type === "user_input" ||
      step.type === "approval" ||
      step.type === "file_approval"
    ) {
      return (
        total +
        (getStepDurationMs(step) || step.toolResult?.terminal?.durationMs || 0)
      );
    }
    if (step.type === "agent_call") {
      return total + getAgentDurationMs(step.agentCall);
    }
    return total;
  }, 0);
}

function getAdjustedTokensPerSecond(variant?: ChatAssistantVariant) {
  const metrics = variant?.metrics;
  if (!metrics?.durationMs) return undefined;

  const outputTokens =
    metrics.outputTokens ?? metrics.tokenUsage?.completionTokens;
  if (!outputTokens || outputTokens <= 0) return undefined;

  const nonGenerationMs = getKnownNonGenerationDurationMs(
    variant?.processSteps,
  );
  const activeDurationMs = Math.max(1000, metrics.durationMs - nonGenerationMs);
  return outputTokens / (activeDurationMs / 1000);
}

function GenerationStatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-sm bg-muted/50 px-4 py-3">
      <div className="truncate text-sm text-muted-foreground">{label}</div>
      <div
        className="mt-1 truncate text-base font-medium tabular-nums text-foreground"
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function GenerationInfoDetails({
  variant,
}: {
  variant?: ChatAssistantVariant;
}) {
  const metrics = variant?.metrics;
  if (!metrics) return null;

  const adjustedTps = getAdjustedTokensPerSecond(variant);
  const knownWaitingMs = getKnownNonGenerationDurationMs(variant.processSteps);
  const completionTokens =
    metrics.tokenUsage?.completionTokens ?? metrics.outputTokens;

  return (
    <div className="space-y-5">
      <div className="rounded-sm bg-muted/50 px-5 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-muted-foreground">Generation</span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatHumanDuration(metrics.durationMs) || "—"}
          </span>
        </div>
        <div className="mt-2 truncate text-sm font-medium text-foreground">
          {metrics.model || "Unknown model"}
        </div>
        <div className="mt-1 truncate text-sm text-muted-foreground">
          {metrics.providerName || "Unknown provider"} ·{" "}
          {metrics.modeName || "Default"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <GenerationStatCard
          label="Active TPS"
          value={formatTps(adjustedTps ?? metrics.tokensPerSecond)}
        />
        <GenerationStatCard
          label="Wait excluded"
          value={formatHumanDuration(knownWaitingMs) || "—"}
        />
        <GenerationStatCard
          label="Total tokens"
          value={formatNumber(metrics.tokenUsage?.totalTokens)}
        />
        <GenerationStatCard
          label="Finish"
          value={metrics.finishReason || "—"}
        />
      </div>

      <div className="rounded-sm bg-muted/50 px-5 py-4">
        <div className="mb-3 text-sm text-muted-foreground">Token usage</div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-3">
          {[
            ["Prompt", metrics.tokenUsage?.promptTokens],
            ["Completion", completionTokens],
            ["Total", metrics.tokenUsage?.totalTokens],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="mt-1 tabular-nums text-foreground">
                {formatNumber(typeof value === "number" ? value : undefined)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-sm bg-muted/50 px-5 py-4">
        <div className="mb-3 text-sm text-muted-foreground">Timing</div>
        <div className="grid gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Started</div>
            <div className="mt-1 text-sm text-foreground">
              {metrics.startedAt
                ? new Date(metrics.startedAt).toLocaleString()
                : "—"}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Completed</div>
            <div className="mt-1 text-sm text-foreground">
              {metrics.completedAt
                ? new Date(metrics.completedAt).toLocaleString()
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {metrics.isApproximate ? (
        <div className="rounded-sm border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
          Token counts are approximate for this provider response.
        </div>
      ) : null}
    </div>
  );
}

export const GenerationInfoSidebar = memo(function GenerationInfoSidebar({
  variant,
  width,
  onClose,
}: {
  variant?: ChatAssistantVariant;
  width?: number;
  onClose: () => void;
}) {
  if (!variant?.metrics) return null;

  return (
    <aside
      className="z-20 flex h-dvh min-w-[560px] shrink-0 flex-col border-l bg-background text-base leading-6 shadow-xl"
      style={{ width: width ?? 680 }}
    >
      <div className="flex min-w-0 items-center gap-3 border-b py-2 pl-4 pr-2">
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          Generation info
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={onClose}
          title="Close generation info"
          aria-label="Close generation info"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 chat-message-scrollbar">
        <GenerationInfoDetails variant={variant} />
      </div>
    </aside>
  );
});

const UserMessageContent = memo(function UserMessageContent({
  content,
}: {
  content: string;
}) {
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const skillInvocation = parseSkillInvocationMessage(content);

  if (!skillInvocation) {
    const slashInvocation = parseSlashInvocation(content);
    if (!slashInvocation) {
      return <div className="whitespace-pre-wrap">{content}</div>;
    }

    return (
      <div className="whitespace-pre-wrap">
        {slashInvocation.leading}
        <span className="rounded-sm bg-primary-foreground/15 px-1 py-0.5 font-mono text-[0.95em]">
          {slashInvocation.command}
        </span>
        {slashInvocation.rest}
      </div>
    );
  }

  const skillDirectory = formatSkillDirectory(skillInvocation.location);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex w-full min-w-0 items-start gap-2 rounded-sm border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-2 text-left transition hover:bg-primary-foreground/15"
        onClick={() => setSkillModalOpen(true)}
        title={skillInvocation.location}
      >
        <BookOpen className="mt-0.5 size-4 shrink-0 opacity-80" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            Skill: {skillInvocation.name}
          </span>
          <span className="block truncate font-mono text-xs opacity-80">
            {skillInvocation.location}
          </span>
        </span>
      </button>

      {skillInvocation.rest ? (
        <div className="whitespace-pre-wrap">{skillInvocation.rest}</div>
      ) : null}

      <Dialog open={skillModalOpen} onOpenChange={setSkillModalOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle>Skill: {skillInvocation.name}</DialogTitle>
            <div className="break-all font-mono text-xs text-muted-foreground">
              {skillInvocation.location}
            </div>
            {skillDirectory ? (
              <div className="break-all text-xs text-muted-foreground">
                References are relative to {skillDirectory}.
              </div>
            ) : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto p-5 chat-message-scrollbar">
            <pre className="whitespace-pre-wrap break-words rounded-sm border bg-muted/30 p-4 font-mono text-sm leading-6">
              <code>{skillInvocation.content}</code>
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

const SourceMarkdownContent = memo(function SourceMarkdownContent({
  content,
}: {
  content: string;
}) {
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 sm:text-base">
      {content}
    </pre>
  );
});

function getRenderedMessageText(trigger: HTMLElement) {
  const messageElement = trigger.closest<HTMLElement>("[data-message-id]");
  const contentElement = messageElement?.querySelector<HTMLElement>(
    "[data-message-content]",
  );

  if (!contentElement) return "";

  const clone = contentElement.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      [
        "[data-codeblock-ui='true']",
        "[data-slot='dialog-title']",
        "[data-slot='dialog-description']",
        ".sr-only",
        ".chat-code-header",
        ".chat-code-toolbar-actions",
        ".chat-code-action",
      ].join(","),
    )
    .forEach((node) => node.remove());

  return clone.innerText.trim();
}

function getMessageCopyContent(
  isSourceView: boolean,
  trigger: HTMLElement,
  sourceContent: string,
) {
  if (isSourceView) return sourceContent;

  return getRenderedMessageText(trigger) || sourceContent;
}

function getSourceViewToggleLabel(isSourceView: boolean) {
  return isSourceView ? "Show rendered Markdown" : "Show Markdown source";
}

function getRelevantVisualFlushKeys(message: ChatMessage) {
  if (message.role !== "assistant") return [message.id];

  const activeVariant = getActiveVariant(message);
  const processSteps = activeVariant?.processSteps ?? [];
  const visibleProcessSteps = getVisibleAssistantProcessSteps(processSteps);
  const keys = new Set<string>([message.id]);

  for (const step of visibleProcessSteps) {
    for (const sourceStepId of step.sourceStepIds) {
      keys.add(`${message.id}:${sourceStepId}`);
    }
  }

  return [...keys];
}

function getRelevantCollapsedKeys(message: ChatMessage) {
  if (message.role !== "assistant") return [];

  const activeVariant = getActiveVariant(message);
  const processSteps = activeVariant?.processSteps ?? [];
  const visibleProcessSteps = getVisibleAssistantProcessSteps(processSteps);
  const keys = new Set<string>();

  for (const step of visibleProcessSteps) {
    if (
      step.type === "tool_execution" ||
      step.type === "agent_call" ||
      step.type === "user_input" ||
      step.type === "approval" ||
      step.type === "file_approval" ||
      step.type === "tasks"
    ) {
      keys.add(step.id);
    }
  }

  for (const toolCall of activeVariant?.toolCalls ?? []) {
    keys.add(toolCall.id);
  }

  return [...keys];
}

function getRelevantThinkingCollapsedKeys(message: ChatMessage) {
  if (message.role !== "assistant") return [];

  const activeVariant = getActiveVariant(message);
  const processSteps = activeVariant?.processSteps ?? [];
  const visibleProcessSteps = getVisibleAssistantProcessSteps(processSteps);
  const keys = new Set<string>();

  for (const step of visibleProcessSteps) {
    if (step.type === "thinking") keys.add(step.id);
  }

  if (keys.size === 0 && activeVariant?.reasoning?.trim()) {
    keys.add(`${message.id}:reasoning`);
  }

  return [...keys];
}

function hasVisualStreamingForMessage(
  visualStreamingMessageIds: string[],
  messageId: string,
) {
  return visualStreamingMessageIds.some(
    (streamingMessageId) =>
      streamingMessageId === messageId ||
      streamingMessageId.startsWith(`${messageId}:`),
  );
}

function areRecordValuesEqual(
  keys: string[],
  previous: Record<string, number | boolean | undefined>,
  next: Record<string, number | boolean | undefined>,
) {
  return keys.every((key) => previous[key] === next[key]);
}

function areContextMenusEqualForMessage(
  previous: MessageContextMenuState | null,
  next: MessageContextMenuState | null,
  messageId: string,
) {
  const previousRelevant = previous?.messageId === messageId ? previous : null;
  const nextRelevant = next?.messageId === messageId ? next : null;

  if (!previousRelevant && !nextRelevant) return true;
  if (!previousRelevant || !nextRelevant) return false;

  return (
    previousRelevant.x === nextRelevant.x &&
    previousRelevant.y === nextRelevant.y &&
    previousRelevant.linkHref === nextRelevant.linkHref &&
    previousRelevant.selectedText === nextRelevant.selectedText &&
    previousRelevant.renderedText === nextRelevant.renderedText
  );
}

type ChatMessageItemProps = Omit<
  ChatMessageListProps,
  "messages" | "scrollElementRef" | "offsetResolverRef"
> & {
  message: ChatMessage;
};

const ChatMessageItem = memo(
  function ChatMessageItem({
    message,
    activeChatId,
    isSending,
    editingMessageId,
    copiedMessageId,
    messageContextMenu,
    visualFlushRequests,
    visualStreamingMessageIds,
    collapsedToolStepIds,
    collapsedThinkingStepIds,
    thinkingAutoCollapse,
    renderMarkdownWhileStreaming = true,
    freezeAssistantStreaming = false,
    registerMessageElement,
    renderToolExecutionBlock,
    canSubmitAskUserResponse,
    onCaptureMessageContext,
    onCloseMessageContextMenu,
    onCopyLinkHref,
    onCopyMessageContent,
    onBranchFromMessage,
    onRegenerateAssistantMessage,
    onContinueAssistantMessage,
    onStartEditingUserMessage,
    onDeleteMessage,
    onSelectAssistantVariant,
    onToggleToolExecutionCollapsed,
    onToggleThinkingCollapsed,
    onSubmitAskUserResponse,
    onSubmitFileToolApprovalResponse,
    onCancelAskUserRequest,
    onAskUserLayoutChange,
    onAssistantVisualProgress,
    onAssistantVisualStreamingChange,
    onOpenAgentCall,
    onOpenGenerationInfo,
  }: ChatMessageItemProps) {
    const activeVariant =
      message.role === "assistant" ? getActiveVariant(message) : undefined;
    const content =
      message.role === "assistant"
        ? (activeVariant?.content ?? "")
        : message.content;
    const [isSourceView, setIsSourceView] = useState(false);
    const reasoning = activeVariant?.reasoning ?? "";
    const toolCalls = activeVariant?.toolCalls ?? [];
    const toolResults = activeVariant?.toolResults ?? [];
    const processSteps = activeVariant?.processSteps ?? [];
    const visibleProcessSteps = useMemo(
      () => getVisibleAssistantProcessSteps(processSteps),
      [processSteps],
    );
    const hasVisibleProcessSteps = visibleProcessSteps.length > 0;
    const latestProcessStepId = processSteps[processSteps.length - 1]?.id;
    const assistantMessageProcessSteps = useMemo(
      () =>
        visibleProcessSteps.filter((step) => step.type === "assistant_message"),
      [visibleProcessSteps],
    );
    const messageSourceContent =
      content ||
      assistantMessageProcessSteps.map((step) => step.content).join("\n\n");
    const hasMessageSourceContent = messageSourceContent.trim().length > 0;
    const hasInlineAssistantMessageSteps =
      assistantMessageProcessSteps.length > 0;
    const status = activeVariant?.status;
    const metrics = activeVariant?.metrics;
    const generatedModelName = metrics?.model?.trim() ?? "";
    const generatedModeName = metrics?.modeName?.trim() || "Default";
    const generatedDuration = formatHumanDuration(metrics?.durationMs);
    const generatedModeAndDuration = generatedDuration
      ? `${generatedModeName} · ${generatedDuration}`
      : generatedModeName;
    const generatedModelAndMode = generatedModelName
      ? `${generatedModelName} · ${generatedModeAndDuration}`
      : "";
    const isMessageStreaming = status === "streaming";
    const generationStatusLabel =
      getAssistantGenerationStatusLabel(activeVariant);
    const variantCount =
      message.role === "assistant" ? message.variants.length : 0;
    const activeVariantNumber =
      message.role === "assistant" ? message.activeVariantIndex + 1 : 0;

    const processStepGroups = useMemo(
      () => groupVisibleAssistantProcessSteps(visibleProcessSteps),
      [visibleProcessSteps],
    );

    const renderProcessStep = (step: VisibleAssistantProcessStep) => {
      const isLatestProcessStep = step.sourceStepIds.includes(
        latestProcessStepId ?? "",
      );
      const stepFlushVersion = step.sourceStepIds.reduce(
        (total, sourceStepId) =>
          total + (visualFlushRequests[`${message.id}:${sourceStepId}`] ?? 0),
        0,
      );

      if (step.type === "thinking") {
        if (!step.content.trim()) return null;

        const isThinkingStreaming =
          status === "streaming" && isLatestProcessStep;

        const manualCollapsed = collapsedThinkingStepIds[step.id];
        const isCollapsed =
          manualCollapsed ??
          (thinkingAutoCollapse ? true : !isThinkingStreaming);

        return (
          <ThinkingBlock
            key={step.id}
            id={step.id}
            content={step.content}
            status={step.status}
            startedAt={step.startedAt}
            completedAt={step.completedAt}
            isStreaming={isThinkingStreaming}
            isCollapsed={isCollapsed}
            flushVersion={stepFlushVersion}
            forceInstant={!isThinkingStreaming}
            freezeVisualUpdates={
              freezeAssistantStreaming && isThinkingStreaming
            }
            renderMarkdownWhileStreaming={renderMarkdownWhileStreaming}
            onToggleCollapsed={() => {
              const nextCollapsed = !isCollapsed;
              if (nextCollapsed) {
                onAssistantVisualStreamingChange(
                  `${message.id}:${step.id}`,
                  false,
                );
              }
              onToggleThinkingCollapsed(step.id, nextCollapsed);
            }}
            onVisualProgress={() => onAssistantVisualProgress(activeChatId)}
            onVisualStreamingChange={(isStreaming) =>
              onAssistantVisualStreamingChange(
                `${message.id}:${step.id}`,
                isStreaming,
              )
            }
          />
        );
      }

      if (step.type === "assistant_message") {
        if (!step.content.trim()) return null;

        const isAssistantBlockStreaming =
          status === "streaming" && isLatestProcessStep;
        return (
          <div key={step.id} className="grid gap-1">
            <article
              className="flex w-full min-w-0 max-w-full justify-start"
              onContextMenu={(event) =>
                onCaptureMessageContext(event, message.id)
              }
            >
              <div
                className={cn(
                  "w-full min-w-0 max-w-full overflow-visible  px-0 py-1 text-base leading-6 text-card-foreground [overflow-wrap:anywhere]",
                )}
                data-message-content
                data-message-view-mode={isSourceView ? "source" : "rendered"}
              >
                {isSourceView ? (
                  <SourceMarkdownContent content={step.content} />
                ) : (
                  <SmoothAssistantMessageContent
                    content={step.content}
                    messageId={`${message.id}:${step.id}`}
                    isApiStreaming={isAssistantBlockStreaming}
                    skipSyntaxHighlight={isAssistantBlockStreaming}
                    freezeVisualUpdates={
                      freezeAssistantStreaming && isAssistantBlockStreaming
                    }
                    renderMarkdownWhileStreaming={renderMarkdownWhileStreaming}
                    flushVersion={stepFlushVersion}
                    onVisualProgress={() =>
                      onAssistantVisualProgress(activeChatId)
                    }
                    onVisualStreamingChange={(isStreaming) =>
                      onAssistantVisualStreamingChange(
                        `${message.id}:${step.id}`,
                        isStreaming,
                      )
                    }
                  />
                )}
              </div>
            </article>
          </div>
        );
      }

      if (step.type === "tool_building") {
        const toolNames = step.toolCalls
          ? getToolBuildingVisibleMetadata(step.toolCalls).toolNames
          : (step.toolNames ?? []);
        const toolName = toolNames.join(", ");

        return (
          <article
            key={step.id}
            className="flex w-full min-w-0 max-w-full justify-start"
          >
            <div className="w-full min-w-0 max-w-full overflow-hidden text-base leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
                <div className="flex min-w-0 items-center gap-2">
                  <Wrench className="size-3.5 shrink-0" />
                  <span className="shrink-0 truncate text-muted-foreground/85">
                    Tool building
                  </span>
                  <span className="shrink-0 text-muted-foreground/60">·</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Spinner className="size-3.5" />
                  </span>
                  {toolName ? (
                    <>
                      <span className="shrink-0 text-muted-foreground/60">
                        ·
                      </span>
                      <span className="min-w-0 truncate font-normal normal-case tracking-normal text-muted-foreground/85">
                        {toolName}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        );
      }

      if (step.type === "agent_call") {
        void isLatestProcessStep;
        void stepFlushVersion;

        return (
          <AgentCallBlock
            key={step.id}
            id={step.id}
            agentCall={step.agentCall}
            status={step.status}
            renderToolExecutionBlock={renderToolExecutionBlock}
            canSubmitAskUserResponse={canSubmitAskUserResponse}
            onSubmitAskUserResponse={onSubmitAskUserResponse}
            onCancelAskUserRequest={onCancelAskUserRequest}
            onAskUserLayoutChange={onAskUserLayoutChange}
            onOpenAgentCall={onOpenAgentCall}
          />
        );
      }

      if (step.type === "user_input") {
        const manualCollapsed = collapsedToolStepIds[step.id];
        const isCollapsed = manualCollapsed ?? step.status !== "waiting";

        return (
          <AskUserBlock
            key={step.id}
            id={step.id}
            request={step.request}
            response={step.response}
            status={step.status}
            canSubmit={canSubmitAskUserResponse(step.toolCall.id)}
            isCollapsed={isCollapsed}
            onToggleCollapsed={() =>
              onToggleToolExecutionCollapsed(step.id, !isCollapsed)
            }
            onSubmit={(response) =>
              onSubmitAskUserResponse(step.toolCall, step.request, response)
            }
            onCancel={() => onCancelAskUserRequest(step.toolCall.id)}
            onLayoutChange={onAskUserLayoutChange}
          />
        );
      }

      if (step.type === "approval" || step.type === "file_approval") {
        const manualCollapsed = collapsedToolStepIds[step.id];
        const isCollapsed = manualCollapsed ?? step.status !== "waiting";

        return (
          <ToolApprovalBlock
            key={step.id}
            id={step.id}
            request={step.request}
            response={step.response}
            toolResult={step.toolResult}
            status={step.status}
            canSubmit={canSubmitAskUserResponse(step.toolCall.id)}
            isCollapsed={isCollapsed}
            onToggleCollapsed={() =>
              onToggleToolExecutionCollapsed(step.id, !isCollapsed)
            }
            onSubmit={(response) =>
              onSubmitFileToolApprovalResponse(step.toolCall, response)
            }
            onLayoutChange={onAskUserLayoutChange}
          />
        );
      }

      if (step.type === "tasks") {
        const manualCollapsed = collapsedToolStepIds[step.id];
        const isCollapsed = manualCollapsed ?? false;

        return (
          <TaskListBlock
            key={step.id}
            id={step.id}
            toolCall={step.toolCall}
            toolResult={step.toolResult}
            status={step.status}
            isCollapsed={isCollapsed}
            onToggleCollapsed={() =>
              onToggleToolExecutionCollapsed(step.id, !isCollapsed)
            }
            onLayoutChange={onAskUserLayoutChange}
          />
        );
      }

      if (step.type === "tool_execution") {
        return renderToolExecutionBlock({
          id: step.id,
          toolCall: step.toolCall,
          toolResult: step.toolResult,
          status: step.status,
        });
      }

      return null;
    };

    const renderProcessStepGroup = (
      group: VisibleAssistantProcessStepGroup,
      options?: {
        insideThinkingToolGroup?: boolean;
        insideRuntimeGroup?: boolean;
      },
    ): ReactNode => {
      if (group.kind === "tool_batch") {
        const insideThinkingToolGroup = Boolean(
          options?.insideThinkingToolGroup,
        );
        const insideRuntimeGroup = Boolean(options?.insideRuntimeGroup);
        const groupLabel = getToolBatchGroupLabel(group);

        return (
          <div
            key={group.toolBatchId}
            className={cn(
              "grid gap-2 bg-transparent",
              insideThinkingToolGroup || insideRuntimeGroup
                ? ""
                : "rounded-sm border border-dashed bg-muted/70 px-2 py-2 shadow-xs",
            )}
          >
            {groupLabel ? (
              <div className={cn("text-xs text-muted-foreground/80 uppercase")}>
                {groupLabel}
              </div>
            ) : null}
            <div className="grid gap-2">
              {group.steps.map(renderProcessStep)}
            </div>
          </div>
        );
      }

      if (group.kind === "runtime_group") {
        const key = group.groups
          .map((baseGroup) =>
            baseGroup.kind === "single"
              ? baseGroup.step.id
              : baseGroup.toolBatchId,
          )
          .join(":");

        return (
          <div
            key={`${key}:runtime-group`}
            className="grid gap-2 border border-dashed rounded-sm bg-muted/70 px-2 py-2 shadow-xs"
          >
            {group.groups.map((baseGroup) =>
              renderProcessStepGroup(baseGroup, { insideRuntimeGroup: true }),
            )}
          </div>
        );
      }

      if (group.kind === "thinking_tool_group") {
        const key = `${group.thinkingStep.id}:tool-group`;
        return (
          <div
            key={key}
            className="grid gap-2 rounded-sm border border-dashed bg-muted/70 px-2 py-2 shadow-xs"
          >
            {renderProcessStep(group.thinkingStep)}
            {group.toolGroups.map((toolGroup) =>
              renderProcessStepGroup(toolGroup, {
                insideThinkingToolGroup: true,
              }),
            )}
          </div>
        );
      }

      return renderProcessStep(group.step);
    };

    return (
      <div
        ref={registerMessageElement(message.id)}
        data-message-id={message.id}
        className="group/message grid min-w-0 max-w-full gap-4"
      >
        {message.role === "assistant" && hasVisibleProcessSteps && (
          <div className="grid gap-2">
            {processStepGroups.map((group) => renderProcessStepGroup(group))}
          </div>
        )}

        {message.role === "assistant" &&
          !hasVisibleProcessSteps &&
          reasoning.trim() &&
          (() => {
            const reasoningStepId = `${message.id}:reasoning`;
            const isReasoningStreaming = status === "streaming" && !content;
            const manualCollapsed = collapsedThinkingStepIds[reasoningStepId];
            const isCollapsed = manualCollapsed ?? !isReasoningStreaming;

            return (
              <ThinkingBlock
                id={reasoningStepId}
                content={reasoning}
                isStreaming={isReasoningStreaming}
                isCollapsed={isCollapsed}
                flushVersion={visualFlushRequests[message.id] ?? 0}
                forceInstant={Boolean(content)}
                freezeVisualUpdates={
                  freezeAssistantStreaming && isReasoningStreaming
                }
                onToggleCollapsed={() => {
                  const nextCollapsed = !isCollapsed;
                  if (nextCollapsed) {
                    onAssistantVisualStreamingChange(
                      `${message.id}:reasoning`,
                      false,
                    );
                  }
                  onToggleThinkingCollapsed(reasoningStepId, nextCollapsed);
                }}
                onVisualProgress={() => onAssistantVisualProgress(activeChatId)}
                onVisualStreamingChange={(isStreaming) =>
                  onAssistantVisualStreamingChange(
                    `${message.id}:reasoning`,
                    isStreaming,
                  )
                }
              />
            );
          })()}

        {message.role === "assistant" &&
          !hasVisibleProcessSteps &&
          toolCalls.length > 0 && (
            <div className="grid gap-2">
              {toolCalls.map((toolCall) => {
                const result = toolResults.find(
                  (item) => item.toolCallId === toolCall.id,
                );

                return renderToolExecutionBlock({
                  id: toolCall.id,
                  toolCall,
                  toolResult: result,
                  status: result
                    ? result.isError
                      ? "failed"
                      : "complete"
                    : "running",
                });
              })}
            </div>
          )}

        {(message.role === "user" ||
          (!hasInlineAssistantMessageSteps &&
            (content || status !== "streaming"))) && (
          <>
            <article
              className={cn(
                "flex min-w-0 max-w-full",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
              onContextMenu={(event) =>
                onCaptureMessageContext(event, message.id)
              }
            >
              <div
                data-message-content
                className={cn(
                  "min-w-0 text-base leading-6 [overflow-wrap:anywhere] w-full ",
                  message.role === "user"
                    ? "max-h-[32rem] overflow-y-auto overflow-x-hidden chat-message-scrollbar rounded-sm bg-primary px-4 py-3 text-primary-foreground shadow-xs"
                    : "min-w-0 max-w-full overflow-visible px-0 py-1 text-card-foreground shadow-xs",
                  status === "error" && "border-destructive/50",
                )}
                data-message-view-mode={isSourceView ? "source" : "rendered"}
              >
                {message.role === "user" && message.attachments?.length ? (
                  <AttachmentChips
                    attachments={message.attachments}
                    readOnly
                    tone="onPrimary"
                    className={cn(content && "mb-3")}
                  />
                ) : null}
                {isSourceView ? (
                  <SourceMarkdownContent content={content} />
                ) : message.role === "assistant" ? (
                  <SmoothAssistantMessageContent
                    content={content}
                    messageId={`${message.id}:content`}
                    isApiStreaming={status === "streaming"}
                    skipSyntaxHighlight={status === "streaming"}
                    freezeVisualUpdates={
                      freezeAssistantStreaming && status === "streaming"
                    }
                    renderMarkdownWhileStreaming={renderMarkdownWhileStreaming}
                    flushVersion={visualFlushRequests[message.id] ?? 0}
                    onVisualProgress={() =>
                      onAssistantVisualProgress(activeChatId)
                    }
                    onVisualStreamingChange={(isStreaming) =>
                      onAssistantVisualStreamingChange(
                        `${message.id}:content`,
                        isStreaming,
                      )
                    }
                  />
                ) : (
                  <UserMessageContent content={message.content} />
                )}
              </div>
            </article>
          </>
        )}

        {messageContextMenu?.messageId === message.id &&
          createPortal(
            <div
              data-message-context-menu
              className="fixed z-50 min-w-55 rounded-sm border bg-popover p-1 text-base text-popover-foreground shadow-md"
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
                    className="flex w-full items-center gap-2  px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => {
                      void onCopyLinkHref(messageContextMenu.linkHref);
                      onCloseMessageContextMenu();
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
                className="flex w-full items-center gap-2  px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                disabled={
                  !messageContextMenu.selectedText.trim() &&
                  !hasMessageSourceContent
                }
                onClick={(event) => {
                  void onCopyMessageContent(
                    message.id,
                    messageContextMenu.selectedText ||
                      (isSourceView
                        ? messageSourceContent
                        : messageContextMenu.renderedText ||
                          messageSourceContent),
                  );
                  onCloseMessageContextMenu();
                }}
              >
                <Copy className="size-4" />
                {messageContextMenu.selectedText.trim()
                  ? "Copy selection"
                  : isSourceView
                    ? "Copy source"
                    : message.role === "assistant"
                      ? "Copy answer"
                      : "Copy message"}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2  px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                disabled={!hasMessageSourceContent}
                onClick={() => {
                  setIsSourceView((current) => !current);
                  onCloseMessageContextMenu();
                }}
              >
                <MarkdownIcon className="size-4" />
                {getSourceViewToggleLabel(isSourceView)}
              </button>
              <div className="-mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                className="flex w-full items-center gap-2  px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                disabled={isSending || isMessageStreaming}
                onClick={() => {
                  void onBranchFromMessage(message.id);
                  onCloseMessageContextMenu();
                }}
              >
                <GitBranch className="size-4" />
                Branch from here
              </button>
              {message.role === "assistant" && (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2  px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                    disabled={isSending}
                    onClick={() => {
                      void onRegenerateAssistantMessage(message.id);
                      onCloseMessageContextMenu();
                    }}
                  >
                    <RefreshCcw className="size-4" />
                    {status === "error" ? "Retry answer" : "Regenerate answer"}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2  px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                    disabled={isSending || isMessageStreaming}
                    onClick={() => {
                      void onContinueAssistantMessage(message.id);
                      onCloseMessageContextMenu();
                    }}
                  >
                    <ChevronRight className="size-4" />
                    Continue generating
                  </button>
                </>
              )}
              {message.role === "user" && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2  px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                  disabled={isSending}
                  onClick={() => {
                    onStartEditingUserMessage(message.id);
                    onCloseMessageContextMenu();
                  }}
                >
                  <Pencil className="size-4" />
                  Edit message
                </button>
              )}
              <div className="-mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                className="flex w-full items-center gap-2  px-2 py-1.5 text-left text-destructive hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-destructive/20"
                disabled={isSending}
                onClick={() => {
                  onDeleteMessage(message.id);
                  onCloseMessageContextMenu();
                }}
              >
                <Trash2 className="size-4" />
                Delete message
              </button>
            </div>,
            document.body,
          )}

        {message.role === "user" && editingMessageId !== message.id && (
          <div className="flex justify-end gap-1.5 text-sm leading-5 text-muted-foreground">
            <TooltipIconButton
              type="button"
              variant="ghost"
              size="icon-sm"
              label="Branch from here"
              onClick={() => onBranchFromMessage(message.id)}
              disabled={isSending}
            >
              <GitBranch className="size-3" />
            </TooltipIconButton>

            <TooltipIconButton
              type="button"
              variant="ghost"
              size="icon-sm"
              label="Delete message"
              onClick={() => onDeleteMessage(message.id)}
              disabled={isSending}
            >
              <Trash2 className="size-3" />
            </TooltipIconButton>

            <TooltipIconButton
              type="button"
              variant="ghost"
              size="icon-sm"
              label={getSourceViewToggleLabel(isSourceView)}
              onClick={() => setIsSourceView((current) => !current)}
              disabled={!message.content.trim()}
            >
              <MarkdownIcon className="size-3" />
            </TooltipIconButton>

            <TooltipIconButton
              type="button"
              variant="ghost"
              size="icon-sm"
              label={
                copiedMessageId === message.id
                  ? "Copied"
                  : isSourceView
                    ? "Copy source"
                    : "Copy message"
              }
              onClick={(event) =>
                onCopyMessageContent(
                  message.id,
                  getMessageCopyContent(
                    isSourceView,
                    event.currentTarget,
                    message.content,
                  ),
                )
              }
              disabled={!message.content.trim()}
            >
              {copiedMessageId === message.id ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
            </TooltipIconButton>

            <TooltipIconButton
              type="button"
              variant="ghost"
              size="icon-sm"
              label="Edit message"
              onClick={() => onStartEditingUserMessage(message.id)}
              disabled={isSending}
            >
              <Pencil className="size-3" />
            </TooltipIconButton>
          </div>
        )}

        {message.role === "assistant" && (
          <div className="grid gap-2 text-sm leading-5 text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="min-h-6 min-w-0 flex-1 text-left">
                {isMessageStreaming ? (
                  <span
                    className="inline-flex select-none items-center gap-1.5 text-muted-foreground"
                    aria-live="polite"
                  >
                    <RadixSpinner
                      aria-hidden="true"
                      className="generating-radix-spinner"
                      size="1"
                    />
                    <span className="generating-gradient-text font-medium">
                      {generationStatusLabel}
                    </span>
                  </span>
                ) : generatedModelAndMode ? (
                  <span
                    className="block truncate text-muted-foreground"
                    title={`Generated with ${generatedModelAndMode}`}
                  >
                    {generatedModelAndMode}
                  </span>
                ) : (
                  <span aria-hidden="true" />
                )}
              </div>

              {!isSending ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {variantCount > 1 && (
                    <div className="flex items-center gap-1">
                      <TooltipIconButton
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        label="Previous answer"
                        onClick={() =>
                          onSelectAssistantVariant(
                            message.id,
                            message.activeVariantIndex - 1,
                          )
                        }
                        disabled={message.activeVariantIndex <= 0 || isSending}
                      >
                        <ChevronLeft className="size-3.5" />
                      </TooltipIconButton>
                      <span className="min-w-9 text-center tabular-nums">
                        {activeVariantNumber}/{variantCount}
                      </span>
                      <TooltipIconButton
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        label="Next answer"
                        onClick={() =>
                          onSelectAssistantVariant(
                            message.id,
                            message.activeVariantIndex + 1,
                          )
                        }
                        disabled={
                          message.activeVariantIndex >= variantCount - 1 ||
                          isSending
                        }
                      >
                        <ChevronRight className="size-3.5" />
                      </TooltipIconButton>
                    </div>
                  )}

                  <TooltipIconButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label="Generation info"
                    onClick={() =>
                      activeVariant && onOpenGenerationInfo(activeVariant)
                    }
                    disabled={metrics?.durationMs === undefined}
                  >
                    <Info className="size-3" />
                  </TooltipIconButton>

                  <TooltipIconButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label="Branch from here"
                    onClick={() => onBranchFromMessage(message.id)}
                    disabled={isSending || isMessageStreaming}
                  >
                    <GitBranch className="size-3" />
                  </TooltipIconButton>

                  <TooltipIconButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label="Delete message"
                    onClick={() => onDeleteMessage(message.id)}
                    disabled={isSending}
                  >
                    <Trash2 className="size-3" />
                  </TooltipIconButton>

                  <TooltipIconButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label={
                      status === "error" ? "Retry answer" : "Regenerate answer"
                    }
                    onClick={() => onRegenerateAssistantMessage(message.id)}
                    disabled={isSending}
                  >
                    <RefreshCcw className="size-3" />
                  </TooltipIconButton>

                  <TooltipIconButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label="Continue generating"
                    onClick={() => onContinueAssistantMessage(message.id)}
                    disabled={isSending || isMessageStreaming}
                  >
                    <ChevronRight className="size-3.5" />
                  </TooltipIconButton>

                  <TooltipIconButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label={getSourceViewToggleLabel(isSourceView)}
                    onClick={() => setIsSourceView((current) => !current)}
                    disabled={!hasMessageSourceContent}
                  >
                    <MarkdownIcon className="size-3" />
                  </TooltipIconButton>

                  <TooltipIconButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label={
                      copiedMessageId === message.id
                        ? "Copied"
                        : isSourceView
                          ? "Copy source"
                          : "Copy answer"
                    }
                    onClick={(event) =>
                      onCopyMessageContent(
                        message.id,
                        getMessageCopyContent(
                          isSourceView,
                          event.currentTarget,
                          messageSourceContent,
                        ),
                      )
                    }
                    disabled={!hasMessageSourceContent}
                  >
                    {copiedMessageId === message.id ? (
                      <Check className="size-3" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </TooltipIconButton>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  },
  (previous, next) => {
    if (previous.message !== next.message) return false;
    if (previous.activeChatId !== next.activeChatId) return false;
    if (previous.isSending !== next.isSending) return false;
    if (previous.toolDisplayKey !== next.toolDisplayKey) return false;
    if (previous.skillDisplayKey !== next.skillDisplayKey) return false;
    if (previous.agentDisplayKey !== next.agentDisplayKey) return false;
    if (
      previous.renderMarkdownWhileStreaming !==
      next.renderMarkdownWhileStreaming
    ) {
      return false;
    }
    if (previous.freezeAssistantStreaming !== next.freezeAssistantStreaming) {
      return false;
    }

    const messageId = previous.message.id;
    if (
      (previous.editingMessageId === messageId) !==
      (next.editingMessageId === messageId)
    ) {
      return false;
    }
    if (
      (previous.copiedMessageId === messageId) !==
      (next.copiedMessageId === messageId)
    ) {
      return false;
    }
    if (
      !areContextMenusEqualForMessage(
        previous.messageContextMenu,
        next.messageContextMenu,
        messageId,
      )
    ) {
      return false;
    }
    if (
      hasVisualStreamingForMessage(
        previous.visualStreamingMessageIds,
        messageId,
      ) !==
      hasVisualStreamingForMessage(next.visualStreamingMessageIds, messageId)
    ) {
      return false;
    }

    const visualFlushKeys = getRelevantVisualFlushKeys(previous.message);
    if (
      !areRecordValuesEqual(
        visualFlushKeys,
        previous.visualFlushRequests,
        next.visualFlushRequests,
      )
    ) {
      return false;
    }

    const collapsedKeys = getRelevantCollapsedKeys(previous.message);
    if (
      !areRecordValuesEqual(
        collapsedKeys,
        previous.collapsedToolStepIds,
        next.collapsedToolStepIds,
      )
    ) {
      return false;
    }

    const thinkingCollapsedKeys = getRelevantThinkingCollapsedKeys(
      previous.message,
    );
    if (
      !areRecordValuesEqual(
        thinkingCollapsedKeys,
        previous.collapsedThinkingStepIds,
        next.collapsedThinkingStepIds,
      )
    ) {
      return false;
    }

    return true;
  },
);

// Controls the gap between virtualized message rows. This must be applied
// through the virtualizer because items are absolutely positioned.
const MESSAGE_GAP_PX = 32;
const VIRTUAL_MESSAGE_OVERSCAN = 6;
const ESTIMATED_TEXT_CHARS_PER_LINE = 80;
const ESTIMATED_LINE_HEIGHT_PX = 22;
const ESTIMATED_COLLAPSED_BLOCK_HEIGHT_PX = 54;

function estimateTextHeight(text: string) {
  const lines = Math.max(
    1,
    Math.ceil(text.length / ESTIMATED_TEXT_CHARS_PER_LINE),
  );
  return lines * ESTIMATED_LINE_HEIGHT_PX;
}

function estimateProcessStepHeight(step: VisibleAssistantProcessStep) {
  if (step.type === "assistant_message") {
    return 24 + estimateTextHeight(step.content);
  }

  // Thinking, tool, agent, approval, and task blocks are collapsed/header-only
  // by default. Keep their initial estimates close to that stable height so
  // streaming updates cause fewer virtualizer measurement corrections.
  return ESTIMATED_COLLAPSED_BLOCK_HEIGHT_PX;
}

function estimateMessageHeight(message: ChatMessage) {
  if (message.role === "user") {
    return Math.min(4000, 80 + estimateTextHeight(message.content));
  }

  const activeVariant = getActiveVariant(message);
  const content = activeVariant?.content ?? "";
  const processSteps = activeVariant?.processSteps ?? [];
  const visibleProcessSteps = getVisibleAssistantProcessSteps(processSteps);
  const processStepsHeight = visibleProcessSteps.reduce(
    (total, step) => total + estimateProcessStepHeight(step),
    0,
  );
  const legacyReasoningHeight =
    visibleProcessSteps.length === 0 && activeVariant?.reasoning?.trim()
      ? ESTIMATED_COLLAPSED_BLOCK_HEIGHT_PX
      : 0;
  const legacyToolHeight =
    visibleProcessSteps.length === 0
      ? (activeVariant?.toolCalls?.length ?? 0) *
        ESTIMATED_COLLAPSED_BLOCK_HEIGHT_PX
      : 0;

  // A rough starting estimate only — the virtualizer measures the real height
  // once each item mounts and corrects the layout.
  return Math.min(
    5000,
    72 +
      estimateTextHeight(content) +
      processStepsHeight +
      legacyReasoningHeight +
      legacyToolHeight,
  );
}

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  scrollElementRef,
  offsetResolverRef,
  ...itemProps
}: ChatMessageListProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // The scroll container is an ancestor; React attaches its ref only after this
  // component's layout effects run, so on the first mount the virtualizer
  // initializes against a null element and renders nothing. Once the element is
  // available we force a single re-render — the virtualizer rebinds to the
  // scroll element on every render — so the initial chat is no longer blank.
  const [, setScrollElementReady] = useState(false);

  const timelineItemCount = messages.length;

  const virtualizer = useVirtualizer({
    count: timelineItemCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: (index) => estimateMessageHeight(messages[index]),
    overscan: VIRTUAL_MESSAGE_OVERSCAN,
    gap: MESSAGE_GAP_PX,
    scrollMargin,
    getItemKey: (index) => messages[index].id,
  });

  useEffect(() => {
    if (scrollElementRef.current) {
      setScrollElementReady(true);
    }
  }, [scrollElementRef]);

  // The list does not begin at the very top of the scroll element (the content
  // wrapper carries vertical padding), so the virtualizer needs that offset to
  // translate scroll positions into item coordinates. It only changes when the
  // layout resizes, so recompute on mount and on resize rather than per render.
  useLayoutEffect(() => {
    const scrollElement = scrollElementRef.current;
    if (!scrollElement) return;

    const measureScrollMargin = () => {
      const list = listRef.current;
      if (!list || !scrollElement) return;

      const nextMargin =
        list.getBoundingClientRect().top -
        scrollElement.getBoundingClientRect().top +
        scrollElement.scrollTop;

      setScrollMargin((previous) =>
        Math.abs(previous - nextMargin) < 1 ? previous : nextMargin,
      );
    };

    measureScrollMargin();

    const resizeObserver = new ResizeObserver(measureScrollMargin);
    resizeObserver.observe(scrollElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [scrollElementRef]);

  // Publish a measurement-based offset resolver so position restoration works
  // even when the anchored message is currently virtualized out of the DOM.
  const resolveMessageOffset = useCallback(
    (messageId: string) => {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return null;

      const offset = virtualizer.getOffsetForIndex(index, "start");
      return offset ? offset[0] : null;
    },
    [messages, virtualizer],
  );

  useLayoutEffect(() => {
    if (!offsetResolverRef) return;

    offsetResolverRef.current = resolveMessageOffset;
    return () => {
      offsetResolverRef.current = null;
    };
  }, [offsetResolverRef, resolveMessageOffset]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={listRef}
      className="relative w-full min-w-0"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualItems.map((virtualItem) => (
        <div
          key={virtualItem.key}
          data-index={virtualItem.index}
          ref={virtualizer.measureElement}
          // Position with `top` rather than `transform`: a transform would
          // establish a containing block, which breaks `position: sticky`
          // descendants (code-block headers) and re-anchors `position: fixed`
          // popups (message context menu) to the item instead of the viewport.
          className="absolute left-0 w-full min-w-0"
          style={{ top: virtualItem.start - scrollMargin }}
        >
          <ChatMessageItem
            message={messages[virtualItem.index]}
            {...itemProps}
          />
        </div>
      ))}
    </div>
  );
});
