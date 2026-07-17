import { Bot, Maximize2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo } from "react";

import type { RenderAgentToolExecutionBlock } from "@/components/ai-chat/agent-call-utils";
import { AgentStatusInline } from "@/components/ai-chat/agent-status-inline";
import { useAgentRunRowText } from "@/components/ai-chat/use-agent-run-row-text";
import { getAgentRunRenderSignature } from "@/lib/ai-chat/agent-status-label";
import { formatAgentDisplayName } from "@/lib/ai-chat/builtin-agents";
import { ASK_USER_TOOL_NAME } from "@/lib/ai-chat/builtin-tools";
import type {
  AgentCallStatus,
  AskUserRequest,
  AskUserResponse,
  ChatAgentCall,
  ChatToolCall,
} from "@/lib/ai-chat/types";

function getEffectiveStatus(
  agentCall: ChatAgentCall,
  status?: AgentCallStatus,
) {
  return agentCall.status ?? status ?? "running";
}

function hasPendingAskUser(
  agentCall: ChatAgentCall,
  canSubmitAskUserResponse: (toolCallId: string) => boolean,
): boolean {
  const hasLocalPending = (agentCall.toolCalls ?? []).some(
    (toolCall) =>
      toolCall.function.name === ASK_USER_TOOL_NAME &&
      canSubmitAskUserResponse(toolCall.id),
  );

  if (hasLocalPending) return true;

  return (agentCall.childAgentCalls ?? []).some((child) =>
    hasPendingAskUser(child, canSubmitAskUserResponse),
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

const AgentCallSummaryButton = memo(function AgentCallSummaryButton({
  agentCall,
  agentName,
  status,
  isWaitingForUser,
  onOpen,
}: {
  agentCall: ChatAgentCall;
  agentName: string;
  status: AgentCallStatus;
  isWaitingForUser: boolean;
  onOpen: () => void;
}) {
  const { statusLabel, previewLine } = useAgentRunRowText(agentCall);
  const shouldShowStatus = statusLabel !== "Complete" || status === "complete";
  const visibleStatusLabel =
    status === "running" || status === "pending"
      ? isWaitingForUser
        ? "Waiting"
        : statusLabel
      : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      className="group w-full min-w-0 max-w-full cursor-pointer overflow-hidden text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere] hover:text-muted-foreground focus:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      title="Open agent run"
      aria-label={`Open agent run: ${agentName}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm font-medium text-muted-foreground">
            <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
              <Bot className="size-3.5 group-hover:hidden group-focus:hidden" />
              <Maximize2 className="hidden size-3.5 group-hover:block group-focus:block" />
            </span>
            <span className="shrink-0 truncate text-muted-foreground/85">
              {agentName}
            </span>
            {shouldShowStatus ? (
              <>
                <span className="shrink-0 text-muted-foreground/60">·</span>
                <AgentStatusInline
                  status={status}
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
  );
}, areAgentCallSummaryPropsEqual);

function areAgentCallSummaryPropsEqual(
  previous: {
    agentCall: ChatAgentCall;
    agentName: string;
    status: AgentCallStatus;
    isWaitingForUser: boolean;
    onOpen: () => void;
  },
  next: {
    agentCall: ChatAgentCall;
    agentName: string;
    status: AgentCallStatus;
    isWaitingForUser: boolean;
    onOpen: () => void;
  },
) {
  return (
    previous.agentCall.id === next.agentCall.id &&
    previous.agentName === next.agentName &&
    previous.status === next.status &&
    previous.isWaitingForUser === next.isWaitingForUser &&
    previous.onOpen === next.onOpen &&
    getAgentRunRenderSignature(previous.agentCall) ===
      getAgentRunRenderSignature(next.agentCall)
  );
}

function AgentCallBlockComponent({
  agentCall,
  status,
  renderToolExecutionBlock,
  canSubmitAskUserResponse,
  pendingInteractionIds,
  onSubmitAskUserResponse,
  onCancelAskUserRequest,
  onAskUserLayoutChange,
  onOpenAgentCall,
}: {
  id: string;
  agentCall: ChatAgentCall;
  status?: AgentCallStatus;
  renderToolExecutionBlock?: RenderAgentToolExecutionBlock;
  canSubmitAskUserResponse: (toolCallId: string) => boolean;
  pendingInteractionIds: string[];
  onSubmitAskUserResponse: (
    toolCall: ChatToolCall,
    request: AskUserRequest,
    response: AskUserResponse,
  ) => void | Promise<void>;
  onCancelAskUserRequest: (toolCallId: string) => void;
  onAskUserLayoutChange?: () => void;
  onOpenAgentCall: (agentCallId: string) => void;
}) {
  const effectiveStatus = getEffectiveStatus(agentCall, status);
  const agentName = formatAgentDisplayName(agentCall.agentName);
  const handleOpen = useCallback(
    () => onOpenAgentCall(agentCall.id),
    [agentCall.id, onOpenAgentCall],
  );
  const shouldOpenForAskUser = useMemo(
    () => hasPendingAskUser(agentCall, canSubmitAskUserResponse),
    [agentCall, canSubmitAskUserResponse],
  );
  const isWaitingForUser = useMemo(
    () =>
      hasPendingUserInteraction(agentCall, new Set(pendingInteractionIds)),
    [agentCall, pendingInteractionIds],
  );
  useEffect(() => {
    if (shouldOpenForAskUser) onOpenAgentCall(agentCall.id);
  }, [agentCall.id, onOpenAgentCall, shouldOpenForAskUser]);

  return (
    <article className="flex min-w-0 max-w-full justify-start">
      <AgentCallSummaryButton
        agentCall={agentCall}
        agentName={agentName}
        status={effectiveStatus}
        isWaitingForUser={isWaitingForUser}
        onOpen={handleOpen}
      />
    </article>
  );
}

export const AgentCallBlock = memo(
  AgentCallBlockComponent,
  (previous, next) =>
    previous.id === next.id &&
    previous.status === next.status &&
    previous.agentCall.id === next.agentCall.id &&
    previous.pendingInteractionIds === next.pendingInteractionIds &&
    previous.canSubmitAskUserResponse === next.canSubmitAskUserResponse &&
    previous.onOpenAgentCall === next.onOpenAgentCall &&
    getAgentRunRenderSignature(previous.agentCall) ===
      getAgentRunRenderSignature(next.agentCall),
);
