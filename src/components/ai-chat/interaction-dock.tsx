import { memo } from "react";

import {
  PendingAskUserPanel,
  PendingToolApprovalPanel,
} from "@/components/ai-chat/pending-interaction-panels";
import type { PendingChatInteraction } from "@/lib/ai-chat/chat-interactions";
import type {
  AskUserRequest,
  AskUserResponse,
  ChatToolCall,
  ToolApprovalResponse,
} from "@/lib/ai-chat/types";
import { cn } from "@/lib/utils";

export const InteractionDock = memo(function InteractionDock({
  interactions,
  contentWidthClassName,
  canSubmit,
  onSubmitAskUserResponse,
  onSubmitToolApprovalResponse,
  onCancelAskUserRequest,
}: {
  interactions: PendingChatInteraction[];
  contentWidthClassName?: string;
  canSubmit: (toolCallId: string) => boolean;
  onSubmitAskUserResponse: (
    toolCall: ChatToolCall,
    request: AskUserRequest,
    response: AskUserResponse,
  ) => void | Promise<void>;
  onSubmitToolApprovalResponse: (
    toolCall: ChatToolCall,
    response: ToolApprovalResponse,
  ) => void | Promise<void>;
  onCancelAskUserRequest: (toolCallId: string) => void;
}) {
  const interaction = interactions[0];

  if (!interaction) return null;

  const showMeta = Boolean(interaction.sourceLabel || interactions.length > 1);

  return (
    <section
      className="shrink-0 bg-background px-3 py-3 md:px-4 md:py-4"
      aria-label="Pending interaction"
      aria-live="polite"
    >
      <div
        className={cn(
          "mx-auto flex max-h-[min(45dvh,36rem)] w-full flex-col rounded-sm border bg-card p-4",
          contentWidthClassName,
        )}
      >
        {showMeta ? (
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
            {interaction.sourceLabel ? (
              <span className="truncate">
                Requested by {interaction.sourceLabel}
              </span>
            ) : (
              <span />
            )}
            {interactions.length > 1 ? (
              <span className="shrink-0 tabular-nums">
                {interactions.length} pending
              </span>
            ) : null}
          </div>
        ) : null}

        {interaction.kind === "ask_user" ? (
          <PendingAskUserPanel
            key={interaction.id}
            request={interaction.request}
            canSubmit={canSubmit(interaction.toolCall.id)}
            cancelLabel={
              interactions.length > 1 ? "Stop generation" : "Cancel"
            }
            onSubmit={(response) =>
              onSubmitAskUserResponse(
                interaction.toolCall,
                interaction.request,
                response,
              )
            }
            onCancel={() => onCancelAskUserRequest(interaction.toolCall.id)}
          />
        ) : (
          <PendingToolApprovalPanel
            key={interaction.id}
            request={interaction.request}
            toolCall={interaction.toolCall}
            canSubmit={canSubmit(interaction.toolCall.id)}
            onSubmit={(response) =>
              onSubmitToolApprovalResponse(interaction.toolCall, response)
            }
          />
        )}
      </div>
    </section>
  );
});
