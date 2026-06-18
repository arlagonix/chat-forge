import { Bot, Maximize2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import type { RenderAgentToolExecutionBlock } from "@/components/ai-chat/agent-call-utils";
import { AgentStatusInline } from "@/components/ai-chat/agent-status-inline";
import { AgentTranscriptDialog } from "@/components/ai-chat/agent-transcript-dialog";
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

const AgentCallSummaryButton = memo(function AgentCallSummaryButton({
  agentName,
  status,
  model,
  onOpen,
}: {
  agentName: string;
  status: AgentCallStatus;
  model: string;
  onOpen: () => void;
}) {
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
            <span className="truncate text-card-foreground">{agentName}</span>
            {status !== "complete" ? (
              <>
                <span className="text-muted-foreground/60">·</span>
                <AgentStatusInline status={status} />
              </>
            ) : null}
            {model ? (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span className="truncate font-normal normal-case tracking-normal text-muted-foreground/85">
                  {model}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

export const AgentCallBlock = memo(function AgentCallBlock({
  agentCall,
  status,
  renderToolExecutionBlock,
  canSubmitAskUserResponse,
  onSubmitAskUserResponse,
  onCancelAskUserRequest,
  onAskUserLayoutChange,
}: {
  id: string;
  agentCall: ChatAgentCall;
  status?: AgentCallStatus;
  renderToolExecutionBlock?: RenderAgentToolExecutionBlock;
  canSubmitAskUserResponse: (toolCallId: string) => boolean;
  onSubmitAskUserResponse: (
    toolCall: ChatToolCall,
    request: AskUserRequest,
    response: AskUserResponse,
  ) => void | Promise<void>;
  onCancelAskUserRequest: (toolCallId: string) => void;
  onAskUserLayoutChange?: () => void;
}) {
  const [expandedOpen, setExpandedOpen] = useState(false);
  const effectiveStatus = getEffectiveStatus(agentCall, status);
  const agentName = agentCall.agentName;
  const model = agentCall.model?.trim() ?? "";
  const handleOpen = useCallback(() => setExpandedOpen(true), []);
  const shouldOpenForAskUser = useMemo(
    () => hasPendingAskUser(agentCall, canSubmitAskUserResponse),
    [agentCall, canSubmitAskUserResponse],
  );
  const shouldRenderTranscriptDialog = expandedOpen || shouldOpenForAskUser;

  useEffect(() => {
    if (shouldOpenForAskUser) setExpandedOpen(true);
  }, [shouldOpenForAskUser]);

  return (
    <article className="flex min-w-0 max-w-full justify-start">
      <AgentCallSummaryButton
        agentName={agentName}
        status={effectiveStatus}
        model={model}
        onOpen={handleOpen}
      />

      {shouldRenderTranscriptDialog ? (
        <AgentTranscriptDialog
          open={expandedOpen}
          onOpenChange={setExpandedOpen}
          agentCall={agentCall}
          renderToolExecutionBlock={renderToolExecutionBlock}
          canSubmitAskUserResponse={canSubmitAskUserResponse}
          onSubmitAskUserResponse={onSubmitAskUserResponse}
          onCancelAskUserRequest={onCancelAskUserRequest}
          onAskUserLayoutChange={onAskUserLayoutChange}
        />
      ) : null}
    </article>
  );
});
