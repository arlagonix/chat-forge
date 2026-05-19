import { Check, ChevronDown, ChevronRight, Wrench, X } from "lucide-react";

import { MarkdownMessage } from "@/components/ai-chat/markdown-message";
import { Spinner } from "@/components/ui/spinner";
import { buildToolExecutionPreviewForCall } from "@/lib/ai-chat/tool-preview";
import type {
  ChatToolCall,
  ChatToolResult,
  LoadedToolInfo,
  ToolExecutionPreview,
  ToolExecutionStatus,
} from "@/lib/ai-chat/types";

const TOOL_DESCRIPTION_PREVIEW_MAX_LENGTH = 95;

function formatJsonLikeCodeBlock(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "{}";

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

function renderJsonCodeBlock(value: string, className = "chat-markdown-compact") {
  const normalized = formatJsonLikeCodeBlock(value);
  return (
    <MarkdownMessage
      className={className}
      content={`~~~json\n${normalized}\n~~~`}
    />
  );
}

function renderCodeBlock(
  value: string,
  language = "text",
  className = "chat-markdown-compact",
) {
  return (
    <MarkdownMessage
      className={className}
      content={`~~~${language}
${value}
~~~`}
    />
  );
}

function renderCommandCodeBlock(value: string) {
  return renderCodeBlock(value, "bash");
}

function renderToolExecutionPreview(execution?: ToolExecutionPreview) {
  if (!execution) return null;

  return (
    <>
      <div className="grid gap-1.5">
        <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground/80">
          Command
        </div>
        {renderCommandCodeBlock(execution.displayCommand)}
      </div>
      {execution.cwd?.trim() && (
        <div className="grid gap-1.5">
          <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground/80">
            Working directory
          </div>
          {renderCodeBlock(execution.cwd, "text")}
        </div>
      )}
    </>
  );
}

function formatToolDescriptionPreview(description?: string) {
  const normalizedDescription = description?.replace(/\s+/g, " ").trim() || "";
  if (!normalizedDescription) return "";

  if (normalizedDescription.length <= TOOL_DESCRIPTION_PREVIEW_MAX_LENGTH) {
    return normalizedDescription;
  }

  return `${normalizedDescription
    .slice(0, TOOL_DESCRIPTION_PREVIEW_MAX_LENGTH)
    .trimEnd()}…`;
}

function getEffectiveToolStatus(
  status: ToolExecutionStatus | undefined,
  result?: ChatToolResult,
): ToolExecutionStatus {
  if (result?.isError) return "failed";
  if (result) return "complete";
  return status ?? "running";
}

function renderToolStatus(status: ToolExecutionStatus) {
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
        <X className="size-3.5" />
        Failed
      </span>
    );
  }

  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
        <Check className="size-3.5" />
        Complete
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
      <Spinner className="size-3.5" />
      {status === "pending" ? "Waiting" : "Running"}
    </span>
  );
}

function hasMeaningfulToolInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed == null) return false;
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed).length > 0;
    }
    if (Array.isArray(parsed)) return parsed.length > 0;
    return true;
  } catch {
    return Boolean(trimmed);
  }
}

export function ToolExecutionBlock({
  id,
  toolCall,
  toolResult,
  status,
  loadedTools,
  isCollapsed,
  onToggleCollapsed,
}: {
  id: string;
  toolCall: ChatToolCall;
  toolResult?: ChatToolResult;
  status?: ToolExecutionStatus;
  loadedTools: LoadedToolInfo[];
  isCollapsed: boolean;
  onToggleCollapsed: (stepId: string, nextCollapsed: boolean) => void;
}) {
  const effectiveStatus = getEffectiveToolStatus(status, toolResult);
  const executionPreview = buildToolExecutionPreviewForCall(
    toolCall,
    loadedTools,
    toolResult,
  );
  const toolInfo = loadedTools.find(
    (candidate) => candidate.name === toolCall.function.name,
  );
  const toolDescription = formatToolDescriptionPreview(toolInfo?.description);
  const showToolInput =
    hasMeaningfulToolInput(toolCall.function.arguments || "") &&
    (!executionPreview || executionPreview.usesStdin);

  return (
    <article key={id} className="flex min-w-0 max-w-full justify-start">
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-muted/25 px-4 py-3 text-sm leading-5 text-muted-foreground shadow-xs [overflow-wrap:anywhere]">
        <button
          type="button"
          className="w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onToggleCollapsed(id, !isCollapsed)}
          aria-expanded={!isCollapsed}
        >
          <div className="flex min-w-0 items-center justify-between gap-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              <Wrench className="size-3.5 shrink-0" />
              <span className="truncate">{toolCall.function.name}</span>
              <span className="text-muted-foreground/60">•</span>
              {renderToolStatus(effectiveStatus)}
            </div>
            {isCollapsed ? (
              <ChevronRight className="size-3.5 shrink-0" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0" />
            )}
          </div>
          {toolDescription && (
            <div className="mt-2 text-sm normal-case leading-5 tracking-normal text-muted-foreground/85">
              {toolDescription}
            </div>
          )}
        </button>

        {!isCollapsed && (
          <div className="mt-3 grid gap-3">
            {renderToolExecutionPreview(executionPreview)}
            {showToolInput && (
              <div className="grid gap-1.5">
                <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground/80">
                  Input
                </div>
                {renderJsonCodeBlock(toolCall.function.arguments || "{}")}
              </div>
            )}
            {toolResult?.content.trim() && (
              <div className="grid gap-1.5">
                <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground/80">
                  Output
                </div>
                {renderJsonCodeBlock(toolResult.content)}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
