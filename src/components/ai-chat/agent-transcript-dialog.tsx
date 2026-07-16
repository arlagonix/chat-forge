import { Spinner as RadixSpinner } from "@radix-ui/themes";
import { ArrowLeft, Bot, Maximize2, Wrench, X } from "lucide-react";
import {
  Fragment,
  memo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { RenderAgentToolExecutionBlock } from "@/components/ai-chat/agent-call-utils";
import { AgentStatusInline } from "@/components/ai-chat/agent-status-inline";
import { MarkdownMessage } from "@/components/ai-chat/markdown-message";
import { SmoothAssistantMessageContent } from "@/components/ai-chat/smooth-assistant-message";
import { ThinkingBlock } from "@/components/ai-chat/thinking-block";
import { AskUserBlock } from "@/components/ai-chat/tool-interaction-blocks";
import { useAgentRunRowText } from "@/components/ai-chat/use-agent-run-row-text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { getAgentRunRenderSignature } from "@/lib/ai-chat/agent-status-label";
import {
  ASK_USER_TOOL_NAME,
  parseAskUserRequestFromToolCall,
} from "@/lib/ai-chat/builtin-tools";
import {
  getToolBatchGroupLabel,
  getVisibleAssistantProcessSteps,
  groupVisibleAssistantProcessSteps,
  type VisibleAssistantProcessStep,
  type VisibleAssistantProcessStepGroup,
} from "@/lib/ai-chat/process-step-groups";
import { getToolBuildingVisibleMetadata } from "@/lib/ai-chat/tool-building";
import type {
  AgentCallStatus,
  AskUserResponse,
  ChatAgentCall,
  ChatToolCall,
  ChatToolResult,
  ToolExecutionStatus,
} from "@/lib/ai-chat/types";
import { cn } from "@/lib/utils";

const AGENT_TRANSCRIPT_LIVE_UPDATE_MS = 500;

function HighlightedMentionContent({
  content,
}: {
  content: string;
  isUser: boolean;
}) {
  return <div className="whitespace-pre-wrap">{content}</div>;
}

function getToolStatus(toolResult?: ChatToolResult): ToolExecutionStatus {
  if (!toolResult) return "running";
  return toolResult.isError ? "failed" : "complete";
}

function parseAskUserResponseFromToolResult(
  toolResult: ChatToolResult | undefined,
): AskUserResponse | undefined {
  if (!toolResult || toolResult.isError) return undefined;

  try {
    const parsed = JSON.parse(toolResult.content) as {
      answered_at?: unknown;
      answers?: Record<
        string,
        {
          answer_type?: unknown;
          answer?: unknown;
          selected_option_id?: unknown;
          selected_option_ids?: unknown;
          selected_option_label?: unknown;
          selected_option_labels?: unknown;
          custom_answer?: unknown;
        }
      >;
    };

    if (!parsed.answers || typeof parsed.answers !== "object") {
      return undefined;
    }

    const answers: Record<string, string> = {};
    const multiAnswers: Record<string, string[]> = {};
    const answerLabels: Record<string, string | string[]> = {};
    const customAnswers: Record<string, string> = {};

    for (const [questionId, value] of Object.entries(parsed.answers)) {
      if (!value || typeof value !== "object") continue;

      if (Array.isArray(value.selected_option_ids)) {
        const selectedIds = value.selected_option_ids.filter(
          (item): item is string => typeof item === "string",
        );
        multiAnswers[questionId] = selectedIds;

        if (Array.isArray(value.selected_option_labels)) {
          answerLabels[questionId] = value.selected_option_labels.filter(
            (item): item is string => typeof item === "string",
          );
        }
      } else if (typeof value.answer === "string") {
        answers[questionId] = value.answer;
        answerLabels[questionId] = value.answer;
      } else if (typeof value.selected_option_id === "string") {
        answers[questionId] = value.selected_option_id;

        if (typeof value.selected_option_label === "string") {
          answerLabels[questionId] = value.selected_option_label;
        }
      }

      if (typeof value.custom_answer === "string") {
        customAnswers[questionId] = value.custom_answer;
      }
    }

    return {
      answers,
      ...(Object.keys(multiAnswers).length ? { multiAnswers } : {}),
      ...(Object.keys(answerLabels).length ? { answerLabels } : {}),
      ...(Object.keys(customAnswers).length ? { customAnswers } : {}),
      answeredAt:
        typeof parsed.answered_at === "string"
          ? parsed.answered_at
          : new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
}

function getAgentTranscriptToolBlockId(
  agentCall: ChatAgentCall,
  toolCall: ChatToolCall,
  index: number,
) {
  const toolCallId = toolCall.id?.trim() || `index-${index}`;
  return `agent:${agentCall.id}:tool:${toolCallId}`;
}

function hasPendingAskUser(
  agentCall: ChatAgentCall,
  canSubmit: (id: string) => boolean,
): boolean {
  const hasLocalPending = (agentCall.toolCalls ?? []).some(
    (toolCall) =>
      toolCall.function.name === ASK_USER_TOOL_NAME && canSubmit(toolCall.id),
  );

  if (hasLocalPending) return true;

  return (agentCall.childAgentCalls ?? []).some((child) =>
    hasPendingAskUser(child, canSubmit),
  );
}

function hasPendingUserInteraction(
  agentCall: ChatAgentCall,
  pendingInteractionIds: Set<string>,
): boolean {
  if (
    (agentCall.toolCalls ?? []).some((toolCall) =>
      pendingInteractionIds.has(toolCall.id),
    )
  ) {
    return true;
  }

  return (agentCall.childAgentCalls ?? []).some((child) =>
    hasPendingUserInteraction(child, pendingInteractionIds),
  );
}

function MiniChatMessage({
  role,
  content,
  messageId,
  isStreaming = false,
}: {
  role: "user" | "assistant";
  content: string;
  messageId?: string;
  isStreaming?: boolean;
}) {
  if (!content.trim()) return null;

  const isUser = role === "user";

  return (
    <article
      className={cn(
        "flex min-w-0 max-w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "min-w-0 max-w-full text-base leading-6 [overflow-wrap:anywhere]",
          isUser
            ? "w-full rounded-sm bg-primary px-4 py-3 text-primary-foreground shadow-xs"
            : "w-full px-0 py-1 text-card-foreground shadow-xs",
        )}
      >
        {isUser ? (
          <HighlightedMentionContent content={content} isUser={isUser} />
        ) : isStreaming ? (
          <SmoothAssistantMessageContent
            content={content}
            messageId={messageId}
            isApiStreaming
            skipSyntaxHighlight
            renderMarkdownWhileStreaming={false}
            flushVersion={0}
          />
        ) : (
          <MarkdownMessage content={content} messageId={messageId} />
        )}
      </div>
    </article>
  );
}

function FallbackToolCallBlock({
  toolCall,
}: {
  toolCall: ChatToolCall;
  toolResult?: ChatToolResult;
}) {
  return (
    <article className="flex min-w-0 max-w-full justify-start">
      <div className="w-full min-w-0 max-w-full overflow-hidden text-base leading-5 text-muted-foreground [overflow-wrap:anywhere]">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="truncate text-muted-foreground/85">
            {toolCall.function.name}
          </span>
        </div>
      </div>
    </article>
  );
}

function AgentHeaderTitle({ agentCall }: { agentCall: ChatAgentCall }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm font-medium text-muted-foreground">
        <span className="min-w-0 shrink-0 truncate text-muted-foreground/85">
          {agentCall.agentName}
        </span>
      </div>
    </div>
  );
}

function formatAgentDuration(startedAt: string, completedAt?: string) {
  const startedTime = new Date(startedAt).getTime();
  const completedTime = completedAt ? new Date(completedAt).getTime() : NaN;
  if (!Number.isFinite(startedTime) || !Number.isFinite(completedTime)) {
    return "";
  }

  let seconds = Math.max(1, Math.round((completedTime - startedTime) / 1000));
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function isLiveAgentCall(agentCall: ChatAgentCall | undefined) {
  return agentCall?.status === "running" || agentCall?.status === "pending";
}

function useThrottledLiveAgentCall(agentCall: ChatAgentCall): ChatAgentCall;
function useThrottledLiveAgentCall(agentCall: undefined): undefined;
function useThrottledLiveAgentCall(
  agentCall: ChatAgentCall | undefined,
): ChatAgentCall | undefined;
function useThrottledLiveAgentCall(agentCall: ChatAgentCall | undefined) {
  const latestAgentCallRef = useRef(agentCall);
  const [displayedAgentCall, setDisplayedAgentCall] = useState(agentCall);
  const isLive = isLiveAgentCall(agentCall);

  latestAgentCallRef.current = agentCall;

  useEffect(() => {
    setDisplayedAgentCall(agentCall);

    if (!isLive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setDisplayedAgentCall(latestAgentCallRef.current);
    }, AGENT_TRANSCRIPT_LIVE_UPDATE_MS);

    return () => window.clearInterval(intervalId);
  }, [agentCall?.id, agentCall?.status, isLive]);

  return displayedAgentCall;
}

const AgentResultFooter = memo(function AgentResultFooter({
  agentCall,
  pendingInteractionIds,
}: {
  agentCall: ChatAgentCall;
  pendingInteractionIds: string[];
}) {
  const { statusLabel } = useAgentRunRowText(agentCall);
  const visibleStatusLabel = hasPendingUserInteraction(
    agentCall,
    new Set(pendingInteractionIds),
  )
    ? "Waiting"
    : statusLabel;
  const isRunning =
    agentCall.status === "running" || agentCall.status === "pending";
  const generatedModelName = agentCall.model?.trim() ?? "";
  const duration = formatAgentDuration(
    agentCall.startedAt,
    agentCall.completedAt,
  );
  const details = [generatedModelName, agentCall.agentName, duration].filter(
    Boolean,
  );

  return (
    <div className="grid gap-2 text-sm leading-5 text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-h-6 min-w-0 flex-1 text-left">
          {isRunning ? (
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
                {visibleStatusLabel}
              </span>
            </span>
          ) : details.length > 0 ? (
            <span
              className="block truncate text-muted-foreground"
              title={details.join(" · ")}
            >
              {details.join(" · ")}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
});

function ToolBuildingBlock({
  step,
}: {
  step: Extract<VisibleAssistantProcessStep, { type: "tool_building" }>;
}) {
  const toolNames = step.toolCalls
    ? getToolBuildingVisibleMetadata(step.toolCalls).toolNames
    : (step.toolNames ?? []);
  const toolName = toolNames.join(", ");

  return (
    <article className="flex w-full min-w-0 max-w-full justify-start">
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
                <span className="shrink-0 text-muted-foreground/60">·</span>
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

function AgentModalHeader({ agentCall }: { agentCall: ChatAgentCall }) {
  return (
    <DialogHeader className="border-b px-5 py-4">
      <DialogTitle className="flex min-w-0 items-start gap-2 overflow-hidden">
        <Bot className="size-4 shrink-0" />
        <AgentHeaderTitle agentCall={agentCall} />
      </DialogTitle>
      {agentCall.description?.trim() ? (
        <div className="line-clamp-2 text-sm text-muted-foreground">
          {agentCall.description}
        </div>
      ) : null}
    </DialogHeader>
  );
}

type AgentInteractionProps = {
  canSubmitAskUserResponse: (toolCallId: string) => boolean;
  pendingInteractionIds: string[];
  onSubmitAskUserResponse: (
    toolCall: ChatToolCall,
    request: ReturnType<typeof parseAskUserRequestFromToolCall>,
    response: AskUserResponse,
  ) => void | Promise<void>;
  onCancelAskUserRequest: (toolCallId: string) => void;
  onAskUserLayoutChange?: () => void;
};

type AgentTranscriptBodyProps = {
  agentCall: ChatAgentCall;
  renderToolExecutionBlock?: RenderAgentToolExecutionBlock;
  nested?: boolean;
  returnToolDetailsToAgentSidebar?: boolean;
  onOpenChildAgent: (agentCallId: string) => void;
} & AgentInteractionProps;

const AgentTranscriptBody = memo(function AgentTranscriptBody(
  props: AgentTranscriptBodyProps,
) {
  const hasOrderedSteps = (props.agentCall.processSteps?.length ?? 0) > 0;

  return (
    <div className={cn("grid gap-4", props.nested && "gap-3")}>
      <MiniChatMessage role="user" content={props.agentCall.task} />
      {hasOrderedSteps ? (
        <AgentTranscriptStepsBody {...props} />
      ) : (
        <AgentTranscriptFlatBody {...props} />
      )}
    </div>
  );
});

function AgentTranscriptFlatBody({
  agentCall,
  renderToolExecutionBlock,
  canSubmitAskUserResponse,
  pendingInteractionIds,
  onSubmitAskUserResponse,
  onCancelAskUserRequest,
  onAskUserLayoutChange,
  onOpenChildAgent,
  returnToolDetailsToAgentSidebar,
}: AgentTranscriptBodyProps) {
  const visibleToolCalls = agentCall.toolCalls ?? [];
  const visibleToolResults = agentCall.toolResults ?? [];
  const childAgentCalls = agentCall.childAgentCalls ?? [];
  const [collapsedInteractionIds, setCollapsedInteractionIds] = useState<
    Record<string, boolean>
  >({});
  const hasRuntimeAfterThinking =
    agentCall.output.trim().length > 0 ||
    visibleToolCalls.length > 0 ||
    childAgentCalls.length > 0 ||
    (agentCall.status !== "running" && agentCall.status !== "pending");
  const isThinkingActive =
    (agentCall.status === "running" || agentCall.status === "pending") &&
    !hasRuntimeAfterThinking;
  const [thinkingCollapsed, setThinkingCollapsed] = useState(
    () => !isThinkingActive,
  );
  const [thinkingCompletedAt, setThinkingCompletedAt] = useState<
    string | undefined
  >(() => (isThinkingActive ? undefined : agentCall.completedAt));
  const wasThinkingActiveRef = useRef(isThinkingActive);

  useEffect(() => {
    const wasThinkingActive = wasThinkingActiveRef.current;

    if (wasThinkingActive && !isThinkingActive) {
      setThinkingCollapsed(true);
      setThinkingCompletedAt(new Date().toISOString());
    } else if (!wasThinkingActive && isThinkingActive) {
      setThinkingCollapsed(false);
      setThinkingCompletedAt(undefined);
    }

    wasThinkingActiveRef.current = isThinkingActive;
  }, [isThinkingActive]);

  const thinkingStatus = isThinkingActive ? "in_progress" : "complete";
  const effectiveThinkingCompletedAt = isThinkingActive
    ? undefined
    : (thinkingCompletedAt ?? agentCall.completedAt);

  return (
    <>
      {agentCall.reasoning?.trim() ? (
        <ThinkingBlock
          id={`${agentCall.id}:thinking`}
          content={agentCall.reasoning}
          status={thinkingStatus}
          startedAt={agentCall.startedAt}
          completedAt={effectiveThinkingCompletedAt}
          isStreaming={isThinkingActive}
          isCollapsed={thinkingCollapsed}
          flushVersion={0}
          forceInstant
          onToggleCollapsed={() => setThinkingCollapsed((value) => !value)}
        />
      ) : null}

      {visibleToolCalls.map((toolCall, index) => {
        const toolResult = visibleToolResults.find(
          (result) => result.toolCallId === toolCall.id,
        );
        const blockId = getAgentTranscriptToolBlockId(
          agentCall,
          toolCall,
          index,
        );

        if (toolCall.function.name === ASK_USER_TOOL_NAME) {
          try {
            const request = parseAskUserRequestFromToolCall(toolCall);
            if (canSubmitAskUserResponse(toolCall.id)) return null;
            const response = parseAskUserResponseFromToolResult(toolResult);
            if (!response) throw new Error("No completed response");
            const isCollapsed = collapsedInteractionIds[blockId] ?? true;

            return (
              <AskUserBlock
                key={blockId}
                id={blockId}
                request={request}
                response={response}
                status="complete"
                canSubmit={false}
                isCollapsed={isCollapsed}
                onToggleCollapsed={() =>
                  setCollapsedInteractionIds((current) => ({
                    ...current,
                    [blockId]: !isCollapsed,
                  }))
                }
                onSubmit={(nextResponse) =>
                  onSubmitAskUserResponse(toolCall, request, nextResponse)
                }
                onCancel={() => onCancelAskUserRequest(toolCall.id)}
                onLayoutChange={onAskUserLayoutChange}
              />
            );
          } catch {
            // Fall through to the normal tool block so validation errors remain visible.
          }
        }

        const manualCollapsed = collapsedInteractionIds[blockId];
        const isCollapsed = manualCollapsed ?? true;

        return renderToolExecutionBlock ? (
          renderToolExecutionBlock({
            id: blockId,
            toolCall,
            toolResult,
            status: getToolStatus(toolResult),
            isCollapsed,
            returnToAgentCallId: returnToolDetailsToAgentSidebar
              ? agentCall.id
              : undefined,
            onToggleCollapsed: (stepId, nextCollapsed) =>
              setCollapsedInteractionIds((current) => ({
                ...current,
                [stepId]: nextCollapsed,
              })),
          })
        ) : (
          <FallbackToolCallBlock
            key={blockId}
            toolCall={toolCall}
            toolResult={toolResult}
          />
        );
      })}

      {childAgentCalls.map((child) => (
        <ChildAgentBlock
          key={child.id}
          child={child}
          canSubmitAskUserResponse={canSubmitAskUserResponse}
          pendingInteractionIds={pendingInteractionIds}
          onOpenChildAgent={onOpenChildAgent}
        />
      ))}

      <MiniChatMessage
        role="assistant"
        content={agentCall.output}
        messageId={`${agentCall.id}:output`}
        isStreaming={isLiveAgentCall(agentCall)}
      />

      {!agentCall.output.trim() &&
      !agentCall.reasoning?.trim() &&
      visibleToolCalls.length === 0 &&
      childAgentCalls.length === 0 ? (
        <div className="rounded-sm border bg-muted/35 px-3 py-2 text-base text-muted-foreground">
          {agentCall.status === "running" || agentCall.status === "pending"
            ? "Waiting for agent output..."
            : "No runtime output recorded."}
        </div>
      ) : null}
    </>
  );
}

function AgentTranscriptStepsBody({
  agentCall,
  renderToolExecutionBlock,
  canSubmitAskUserResponse,
  pendingInteractionIds,
  onSubmitAskUserResponse,
  onCancelAskUserRequest,
  onAskUserLayoutChange,
  onOpenChildAgent,
  returnToolDetailsToAgentSidebar,
}: AgentTranscriptBodyProps) {
  const [collapsedInteractionIds, setCollapsedInteractionIds] = useState<
    Record<string, boolean>
  >({});
  const [thinkingCollapsedIds, setThinkingCollapsedIds] = useState<
    Record<string, boolean>
  >({});

  const processSteps = agentCall.processSteps ?? [];
  const visibleSteps = useMemo(
    () => getVisibleAssistantProcessSteps(processSteps),
    [processSteps],
  );
  const groups = useMemo(
    () => groupVisibleAssistantProcessSteps(visibleSteps),
    [visibleSteps],
  );
  const lastStepId = useMemo(
    () => visibleSteps[visibleSteps.length - 1]?.sourceStepIds.at(-1),
    [visibleSteps],
  );
  const agentRunning =
    agentCall.status === "running" || agentCall.status === "pending";

  const childById = useMemo(
    () =>
      new Map(
        (agentCall.childAgentCalls ?? []).map((child) => [child.id, child]),
      ),
    [agentCall.childAgentCalls],
  );

  const renderStep = (step: VisibleAssistantProcessStep): ReactNode => {
    if (step.type === "thinking") {
      if (!step.content.trim()) return null;
      const isLast = step.sourceStepIds.includes(lastStepId ?? "");
      const isStreaming = agentRunning && isLast;
      const manualCollapsed = thinkingCollapsedIds[step.id];
      const isCollapsed = manualCollapsed ?? !isStreaming;
      return (
        <ThinkingBlock
          key={step.id}
          id={step.id}
          content={step.content}
          status={step.status}
          startedAt={step.startedAt}
          completedAt={step.completedAt}
          isStreaming={isStreaming}
          isCollapsed={isCollapsed}
          flushVersion={0}
          forceInstant
          onToggleCollapsed={() =>
            setThinkingCollapsedIds((current) => ({
              ...current,
              [step.id]: !isCollapsed,
            }))
          }
        />
      );
    }

    if (step.type === "assistant_message") {
      if (!step.content.trim()) return null;
      const isStreaming =
        agentRunning && step.sourceStepIds.includes(lastStepId ?? "");
      return (
        <MiniChatMessage
          key={step.id}
          role="assistant"
          content={step.content}
          messageId={`${agentCall.id}:${step.id}`}
          isStreaming={isStreaming}
        />
      );
    }

    if (step.type === "tool_building") {
      return <ToolBuildingBlock key={step.id} step={step} />;
    }

    if (step.type === "agent_call") {
      const liveChild = childById.get(step.agentCall.id) ?? step.agentCall;
      return (
        <ChildAgentBlock
          key={step.id}
          child={liveChild}
          canSubmitAskUserResponse={canSubmitAskUserResponse}
          pendingInteractionIds={pendingInteractionIds}
          onOpenChildAgent={onOpenChildAgent}
        />
      );
    }

    if (step.type === "user_input") {
      if (!step.response) return null;
      const isCollapsed = collapsedInteractionIds[step.id] ?? true;
      return (
        <AskUserBlock
          key={step.id}
          id={step.id}
          request={step.request}
          response={step.response}
          status="complete"
          canSubmit={false}
          isCollapsed={isCollapsed}
          onToggleCollapsed={() =>
            setCollapsedInteractionIds((current) => ({
              ...current,
              [step.id]: !isCollapsed,
            }))
          }
          onSubmit={(response) =>
            onSubmitAskUserResponse(step.toolCall, step.request, response)
          }
          onCancel={() => onCancelAskUserRequest(step.toolCall.id)}
          onLayoutChange={onAskUserLayoutChange}
        />
      );
    }

    if (step.type === "tool_execution") {
      const isAskUser = step.toolCall.function.name === ASK_USER_TOOL_NAME;
      if (isAskUser) {
        try {
          const request = parseAskUserRequestFromToolCall(step.toolCall);
          if (canSubmitAskUserResponse(step.toolCall.id)) return null;
          const response = parseAskUserResponseFromToolResult(step.toolResult);
          if (response) {
            const isCollapsed = collapsedInteractionIds[step.id] ?? true;
            return (
              <AskUserBlock
                key={step.id}
                id={step.id}
                request={request}
                response={response}
                status="complete"
                canSubmit={false}
                isCollapsed={isCollapsed}
                onToggleCollapsed={() =>
                  setCollapsedInteractionIds((current) => ({
                    ...current,
                    [step.id]: !isCollapsed,
                  }))
                }
                onSubmit={(nextResponse) =>
                  onSubmitAskUserResponse(
                    step.toolCall,
                    request,
                    nextResponse,
                  )
                }
                onCancel={() => onCancelAskUserRequest(step.toolCall.id)}
                onLayoutChange={onAskUserLayoutChange}
              />
            );
          }
        } catch {
          // Fall through to a normal tool block.
        }
      }

      const manualCollapsed = collapsedInteractionIds[step.id];
      const isCollapsed = manualCollapsed ?? true;
      return renderToolExecutionBlock ? (
        renderToolExecutionBlock({
          id: step.id,
          toolCall: step.toolCall,
          toolResult: step.toolResult,
          status:
            step.status ??
            (step.toolResult
              ? step.toolResult.isError
                ? "failed"
                : "complete"
              : "running"),
          isCollapsed,
          returnToAgentCallId: returnToolDetailsToAgentSidebar
            ? agentCall.id
            : undefined,
          onToggleCollapsed: (stepId, nextCollapsed) =>
            setCollapsedInteractionIds((current) => ({
              ...current,
              [stepId]: nextCollapsed,
            })),
        })
      ) : (
        <FallbackToolCallBlock
          key={step.id}
          toolCall={step.toolCall}
          toolResult={step.toolResult}
        />
      );
    }

    if (step.type === "approval" || step.type === "file_approval") {
      return null;
    }

    if (step.type === "tasks") {
      return renderToolExecutionBlock ? (
        renderToolExecutionBlock({
          id: step.id,
          toolCall: step.toolCall,
          toolResult: step.toolResult,
          status: step.status === "failed" ? "failed" : "complete",
          isCollapsed: collapsedInteractionIds[step.id] ?? false,
          returnToAgentCallId: returnToolDetailsToAgentSidebar
            ? agentCall.id
            : undefined,
          onToggleCollapsed: (stepId, nextCollapsed) =>
            setCollapsedInteractionIds((current) => ({
              ...current,
              [stepId]: nextCollapsed,
            })),
        })
      ) : (
        <FallbackToolCallBlock key={step.id} toolCall={step.toolCall} />
      );
    }

    return null;
  };

  const renderBaseGroup = (
    group: VisibleAssistantProcessStepGroup,
    options?: {
      insideThinkingToolGroup?: boolean;
      insideRuntimeGroup?: boolean;
    },
  ): ReactNode => {
    if (group.kind === "tool_batch") {
      const insideThinkingToolGroup = Boolean(options?.insideThinkingToolGroup);
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
          <div className="grid gap-2">{group.steps.map(renderStep)}</div>
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
          className="grid gap-2 rounded-sm border border-dashed bg-muted/70 px-2 py-2 shadow-xs"
        >
          {group.groups.map((baseGroup) =>
            renderBaseGroup(baseGroup, { insideRuntimeGroup: true }),
          )}
        </div>
      );
    }

    if (group.kind === "thinking_tool_group") {
      return (
        <div
          key={`${group.thinkingStep.id}:tool-group`}
          className="grid gap-2 rounded-sm border border-dashed bg-muted/70 px-2 py-2 shadow-xs"
        >
          {renderStep(group.thinkingStep)}
          {group.toolGroups.map((toolGroup) =>
            renderBaseGroup(toolGroup, { insideThinkingToolGroup: true }),
          )}
        </div>
      );
    }

    return renderStep(group.step);
  };

  const hasAnyContent = visibleSteps.length > 0;

  return (
    <>
      {groups.map((group) => renderBaseGroup(group))}

      {!hasAnyContent ? (
        <div className="rounded-sm border bg-muted/35 px-3 py-2 text-base text-muted-foreground">
          {agentRunning
            ? "Waiting for agent output..."
            : "No runtime output recorded."}
        </div>
      ) : null}
    </>
  );
}

const ChildAgentBlock = memo(function ChildAgentBlock({
  child,
  canSubmitAskUserResponse,
  pendingInteractionIds,
  onOpenChildAgent,
}: {
  child: ChatAgentCall;
  onOpenChildAgent: (agentCallId: string) => void;
  canSubmitAskUserResponse: (toolCallId: string) => boolean;
  pendingInteractionIds: string[];
}) {
  const { statusLabel, previewLine } = useAgentRunRowText(child);
  const isWaitingForUser = hasPendingUserInteraction(
    child,
    new Set(pendingInteractionIds),
  );
  const visibleStatusLabel =
    child.status === "running" || child.status === "pending"
      ? isWaitingForUser
        ? "Waiting"
        : statusLabel
      : undefined;
  const shouldOpenForAskUser = hasPendingAskUser(
    child,
    canSubmitAskUserResponse,
  );

  useEffect(() => {
    if (shouldOpenForAskUser) onOpenChildAgent(child.id);
  }, [child.id, onOpenChildAgent, shouldOpenForAskUser]);

  return (
    <article className="flex min-w-0 max-w-full justify-start">
      <div
        role="button"
        tabIndex={0}
        className="group w-full min-w-0 max-w-full cursor-pointer overflow-hidden text-base leading-5 text-muted-foreground [overflow-wrap:anywhere] hover:text-muted-foreground focus:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => onOpenChildAgent(child.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenChildAgent(child.id);
          }
        }}
        title="Open agent run"
        aria-label={`Open agent run: ${child.agentName}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm font-medium text-muted-foreground">
              <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
                <Bot className="size-3.5 group-hover:hidden group-focus:hidden" />
                <Maximize2 className="hidden size-3.5 group-hover:block group-focus:block" />
              </span>
              <span className="shrink-0 truncate text-muted-foreground/85">
                {child.agentName}
              </span>
              {statusLabel !== "Complete" || child.status === "complete" ? (
                <>
                  <span className="shrink-0 text-muted-foreground/60">·</span>
                  <AgentStatusInline
                    status={child.status}
                    label={visibleStatusLabel}
                  />
                </>
              ) : null}
              {previewLine ? (
                <>
                  <span className="shrink-0 text-muted-foreground/60">·</span>
                  <span className="min-w-0 flex-1 truncate font-normal normal-case tracking-normal text-muted-foreground/85">
                    {previewLine}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}, areChildAgentBlockPropsEqual);

function areChildAgentBlockPropsEqual(
  previous: {
    child: ChatAgentCall;
    onOpenChildAgent: (agentCallId: string) => void;
    canSubmitAskUserResponse: (toolCallId: string) => boolean;
    pendingInteractionIds: string[];
  },
  next: {
    child: ChatAgentCall;
    onOpenChildAgent: (agentCallId: string) => void;
    canSubmitAskUserResponse: (toolCallId: string) => boolean;
    pendingInteractionIds: string[];
  },
) {
  return (
    previous.child.id === next.child.id &&
    previous.onOpenChildAgent === next.onOpenChildAgent &&
    previous.canSubmitAskUserResponse === next.canSubmitAskUserResponse &&
    previous.pendingInteractionIds === next.pendingInteractionIds &&
    getAgentRunRenderSignature(previous.child) ===
      getAgentRunRenderSignature(next.child)
  );
}

export const AgentTranscriptDialog = memo(function AgentTranscriptDialog({
  open,
  onOpenChange,
  agentCall,
  renderToolExecutionBlock,
  canSubmitAskUserResponse,
  pendingInteractionIds,
  onSubmitAskUserResponse,
  onCancelAskUserRequest,
  onAskUserLayoutChange,
  modalDepth = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentCall: ChatAgentCall;
  renderToolExecutionBlock?: RenderAgentToolExecutionBlock;
  modalDepth?: number;
} & AgentInteractionProps) {
  const [expandedChildAgentId, setExpandedChildAgentId] = useState<string>();
  const displayedAgentCall = useThrottledLiveAgentCall(agentCall);
  const expandedChildAgent = useMemo(
    () =>
      (displayedAgentCall.childAgentCalls ?? []).find(
        (child) => child.id === expandedChildAgentId,
      ),
    [displayedAgentCall.childAgentCalls, expandedChildAgentId],
  );
  const modalZIndex = 50 + modalDepth * 20;

  useEffect(() => {
    if (!open) setExpandedChildAgentId(undefined);
  }, [open]);

  return (
    <Fragment>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="agent-transcript-dialog flex h-[min(1000px,calc(100dvh-2rem))] max-h-none flex-col overflow-hidden p-0 text-base leading-6"
          overlayStyle={{ zIndex: modalZIndex }}
          style={{ zIndex: modalZIndex + 1 }}
        >
          <AgentModalHeader agentCall={displayedAgentCall} />

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-base leading-6 chat-message-scrollbar">
            <AgentTranscriptBody
              agentCall={displayedAgentCall}
              renderToolExecutionBlock={renderToolExecutionBlock}
              canSubmitAskUserResponse={canSubmitAskUserResponse}
              pendingInteractionIds={pendingInteractionIds}
              onSubmitAskUserResponse={onSubmitAskUserResponse}
              onCancelAskUserRequest={onCancelAskUserRequest}
              onAskUserLayoutChange={onAskUserLayoutChange}
              onOpenChildAgent={setExpandedChildAgentId}
            />
            <AgentResultFooter
              agentCall={displayedAgentCall}
              pendingInteractionIds={pendingInteractionIds}
            />
          </div>
        </DialogContent>
      </Dialog>

      {open && expandedChildAgent ? (
        <AgentTranscriptDialog
          open={Boolean(expandedChildAgent)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setExpandedChildAgentId(undefined);
          }}
          agentCall={expandedChildAgent}
          renderToolExecutionBlock={renderToolExecutionBlock}
          canSubmitAskUserResponse={canSubmitAskUserResponse}
          pendingInteractionIds={pendingInteractionIds}
          onSubmitAskUserResponse={onSubmitAskUserResponse}
          onCancelAskUserRequest={onCancelAskUserRequest}
          onAskUserLayoutChange={onAskUserLayoutChange}
          modalDepth={modalDepth + 1}
        />
      ) : null}
    </Fragment>
  );
});

export const AgentTranscriptSidebar = memo(function AgentTranscriptSidebar({
  agentCall,
  renderToolExecutionBlock,
  canSubmitAskUserResponse,
  pendingInteractionIds,
  onSubmitAskUserResponse,
  onCancelAskUserRequest,
  onAskUserLayoutChange,
  onOpenAgentCall,
  onOpenAsChat,
  onBack,
  onClose,
  width,
  windowControls,
}: {
  agentCall?: ChatAgentCall;
  renderToolExecutionBlock?: RenderAgentToolExecutionBlock;
  onOpenAgentCall: (agentCallId: string) => void;
  onOpenAsChat?: (agentCallId: string) => void;
  onBack?: () => void;
  onClose: () => void;
  width?: number;
  windowControls?: ReactNode;
} & AgentInteractionProps) {
  const displayedAgentCall = useThrottledLiveAgentCall(agentCall);

  if (!agentCall) return null;
  if (!displayedAgentCall) return null;

  return (
    <aside
      className="z-20 flex h-dvh min-w-[560px] shrink-0 flex-col border-l bg-background text-base leading-6 shadow-xl"
      style={{ width: width ?? 440 }}
    >
      <div className="flex min-w-0 items-center border-b">
        <div
          data-right-sidebar-titlebar
          className="app-region-drag flex min-w-0 flex-1 select-none items-center gap-3 py-1 pl-4 pr-2"
        >
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={onBack}
              title="Back to parent agent"
              aria-label="Back to parent agent"
            >
              <ArrowLeft className="size-4" />
            </Button>
          ) : null}
          <Bot className="size-4 shrink-0 text-muted-foreground" />
          <AgentHeaderTitle agentCall={displayedAgentCall} />
          {onOpenAsChat ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => onOpenAsChat(displayedAgentCall.id)}
              title="Open as subchat"
              aria-label="Open as subchat"
            >
              <Maximize2 className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={onClose}
            title="Close agent run"
            aria-label="Close agent run"
          >
            <X className="size-4" />
          </Button>
        </div>
        {windowControls}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 chat-message-scrollbar">
        <AgentTranscriptBody
          agentCall={displayedAgentCall}
          renderToolExecutionBlock={renderToolExecutionBlock}
          returnToolDetailsToAgentSidebar
          canSubmitAskUserResponse={canSubmitAskUserResponse}
          pendingInteractionIds={pendingInteractionIds}
          onSubmitAskUserResponse={onSubmitAskUserResponse}
          onCancelAskUserRequest={onCancelAskUserRequest}
          onAskUserLayoutChange={onAskUserLayoutChange}
          onOpenChildAgent={onOpenAgentCall}
        />
        <AgentResultFooter
          agentCall={displayedAgentCall}
          pendingInteractionIds={pendingInteractionIds}
        />
      </div>
    </aside>
  );
});

export const AgentTranscriptChatView = memo(function AgentTranscriptChatView({
  agentCall,
  renderToolExecutionBlock,
  canSubmitAskUserResponse,
  pendingInteractionIds,
  onSubmitAskUserResponse,
  onCancelAskUserRequest,
  onAskUserLayoutChange,
  onOpenAgentCall,
}: {
  agentCall: ChatAgentCall;
  renderToolExecutionBlock?: RenderAgentToolExecutionBlock;
  onOpenAgentCall: (agentCallId: string) => void;
} & AgentInteractionProps) {
  const displayedAgentCall = useThrottledLiveAgentCall(agentCall);

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-5 px-0 pt-3 pb-0 md:pt-6">
      <AgentTranscriptBody
        agentCall={displayedAgentCall}
        renderToolExecutionBlock={renderToolExecutionBlock}
        canSubmitAskUserResponse={canSubmitAskUserResponse}
        pendingInteractionIds={pendingInteractionIds}
        onSubmitAskUserResponse={onSubmitAskUserResponse}
        onCancelAskUserRequest={onCancelAskUserRequest}
        onAskUserLayoutChange={onAskUserLayoutChange}
        onOpenChildAgent={onOpenAgentCall}
      />
      <AgentResultFooter
        agentCall={displayedAgentCall}
        pendingInteractionIds={pendingInteractionIds}
      />
      <div aria-hidden="true" className="h-[10vh] min-h-10 shrink-0" />
    </div>
  );
});
