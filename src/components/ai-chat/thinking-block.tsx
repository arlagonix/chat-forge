import {
  Brain,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { SmoothAssistantMessageContent } from "@/components/ai-chat/smooth-assistant-message";
import { Spinner } from "@/components/ui/spinner";
import type { ThinkingStatus } from "@/lib/ai-chat/types";

function getEffectiveThinkingStatus(
  status: ThinkingStatus | undefined,
  isStreaming: boolean,
) {
  if (status === "complete") return "complete";
  if (isStreaming || status === "in_progress") return "in_progress";
  return status ?? "complete";
}

function cleanThinkingPreviewLine(value: string) {
  return value
    .trim()
    .replace(/^[\s#>*_`~\-+\d.)[\]]+/, "")
    .replace(/[*_`~]+$/g, "")
    .trim();
}

function getFirstContentLine(content: string) {
  const lines = content.split("\n");
  for (const line of lines) {
    const cleaned = cleanThinkingPreviewLine(line);
    if (cleaned) return cleaned;
  }
  return "";
}

function getLastContentLine(content: string) {
  const lines = content.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const cleaned = cleanThinkingPreviewLine(lines[i]);
    if (cleaned) return cleaned;
  }
  return "";
}

function HoverSwapIcon({
  icon: Icon,
  hoverIcon: HoverIcon,
}: {
  icon: LucideIcon;
  hoverIcon: LucideIcon;
}) {
  return (
    <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
      <Icon className="size-3.5 group-hover:hidden group-focus:hidden" />
      <HoverIcon className="hidden size-3.5 group-hover:block group-focus:block" />
    </span>
  );
}

function getNearestScrollableParent(element: HTMLElement | null) {
  let current = element?.parentElement ?? null;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = `${style.overflowY} ${style.overflow}`;
    if (
      /(auto|scroll|overlay)/.test(overflowY) &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return window;
}

function adjustScrollToPreserveBlockPosition(
  element: HTMLElement,
  scrollContainer: HTMLElement | Window,
  beforeTop: number,
) {
  const afterTop = element.getBoundingClientRect().top;
  const delta = afterTop - beforeTop;
  if (Math.abs(delta) < 1) return;

  if (scrollContainer === window) {
    window.scrollBy?.({ top: delta, behavior: "auto" });
    return;
  }

  const scrollElement = scrollContainer as HTMLElement;
  scrollElement.scrollTop += delta;
}

function toggleAndPreserveBlockPosition(
  element: HTMLElement | null,
  onToggleCollapsed: () => void,
) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    onToggleCollapsed();
    return;
  }

  const scrollContainer = getNearestScrollableParent(element);
  const beforeTop = element.getBoundingClientRect().top;
  const requestFrame = (callback: FrameRequestCallback) => {
    if (typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(callback);
    }
    return window.setTimeout(callback, 0);
  };

  flushSync(onToggleCollapsed);
  adjustScrollToPreserveBlockPosition(element, scrollContainer, beforeTop);

  requestFrame(() => {
    adjustScrollToPreserveBlockPosition(element, scrollContainer, beforeTop);
    requestFrame(() => {
      adjustScrollToPreserveBlockPosition(element, scrollContainer, beforeTop);
    });
  });
}

function ThinkingBlockComponent({
  id,
  content,
  status,
  startedAt,
  completedAt,
  isStreaming,
  isCollapsed,
  flushVersion,
  forceInstant = false,
  renderMarkdownWhileStreaming = true,
  onToggleCollapsed,
  onVisualProgress,
  onVisualStreamingChange,
}: {
  id: string;
  content: string;
  status?: ThinkingStatus;
  startedAt?: string;
  completedAt?: string;
  isStreaming: boolean;
  isCollapsed: boolean;
  flushVersion: number;
  forceInstant?: boolean;
  renderMarkdownWhileStreaming?: boolean;
  onToggleCollapsed: () => void;
  onVisualProgress?: () => void;
  onVisualStreamingChange?: (isStreaming: boolean) => void;
}) {
  const effectiveStatus = getEffectiveThinkingStatus(status, isStreaming);
  const headerRef = useRef<HTMLButtonElement | null>(null);
  const onVisualStreamingChangeRef = useRef(onVisualStreamingChange);

  onVisualStreamingChangeRef.current = onVisualStreamingChange;

  useEffect(() => {
    if (!isCollapsed) return;

    onVisualStreamingChangeRef.current?.(false);
  }, [isCollapsed]);

  // Extract preview lines from thinking content, stripping leading markdown
  // markers so the compact header reads like prose.
  const firstContentLine = useMemo(() => getFirstContentLine(content), [content]);
  const lastContentLine = useMemo(() => {
    return getLastContentLine(content);
  }, [content]);

  // Throttle updates to ~1 second so the user has time to read.
  const [displayedLastLine, setDisplayedLastLine] = useState(lastContentLine);
  const lastContentLineRef = useRef(lastContentLine);
  lastContentLineRef.current = lastContentLine;

  useEffect(() => {
    if (effectiveStatus === "in_progress") return;

    setDisplayedLastLine(firstContentLine);
  }, [effectiveStatus, firstContentLine]);

  useEffect(() => {
    if (effectiveStatus !== "in_progress" || !isCollapsed) return;

    setDisplayedLastLine(lastContentLineRef.current);

    const intervalId = window.setInterval(() => {
      const nextLastLine = lastContentLineRef.current;
      setDisplayedLastLine((currentLastLine) =>
        currentLastLine === nextLastLine ? currentLastLine : nextLastLine,
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [effectiveStatus, isCollapsed]);

  const previewLine =
    effectiveStatus === "complete" ? firstContentLine : displayedLastLine;
  const shouldShowPreviewLine = isCollapsed && previewLine;
  const HoverIcon = isCollapsed ? ChevronRight : ChevronDown;

  function handleToggleCollapsed() {
    toggleAndPreserveBlockPosition(headerRef.current, onToggleCollapsed);
  }

  return (
    <article className="flex w-full min-w-0 max-w-full justify-start">
      <div className="w-full min-w-0 max-w-full overflow-hidden text-base leading-none text-muted-foreground [overflow-wrap:anywhere]">
        <button
          ref={headerRef}
          type="button"
          className="group w-full min-w-0 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-controls={`${id}-thinking-content`}
          title={isCollapsed ? "Expand thinking" : "Collapse thinking"}
          aria-label={isCollapsed ? "Expand thinking" : "Collapse thinking"}
        >
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <HoverSwapIcon icon={Brain} hoverIcon={HoverIcon} />
              <span className="shrink-0 whitespace-nowrap text-muted-foreground/85">
                Thinking
              </span>
              {effectiveStatus !== "complete" ? (
                <Spinner className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : null}
              {shouldShowPreviewLine ? (
                <>
                  <span className="shrink-0 text-muted-foreground/60">·</span>
                  <span
                    className="min-w-0 flex-1 truncate font-normal normal-case tracking-normal text-muted-foreground/85"
                    title={previewLine}
                  >
                    {previewLine}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </button>

        {!isCollapsed && (
          <div
            id={`${id}-thinking-content`}
            className="mt-2 ml-[7px] min-w-0 overflow-visible border-l border-border/70 pl-4 text-sm leading-5 text-muted-foreground/90"
          >
            <SmoothAssistantMessageContent
              content={content}
              className="chat-markdown-compact shrink-0"
              isApiStreaming={isStreaming}
              skipSyntaxHighlight={isStreaming}
              renderMarkdownWhileStreaming={renderMarkdownWhileStreaming}
              flushVersion={flushVersion}
              forceInstant={forceInstant}
              onVisualProgress={onVisualProgress}
              onVisualStreamingChange={onVisualStreamingChange}
            />
          </div>
        )}
      </div>
    </article>
  );
}

export const ThinkingBlock = memo(
  ThinkingBlockComponent,
  (previous, next) =>
    previous.id === next.id &&
    previous.content === next.content &&
    previous.status === next.status &&
    previous.startedAt === next.startedAt &&
    previous.completedAt === next.completedAt &&
    previous.isStreaming === next.isStreaming &&
    previous.isCollapsed === next.isCollapsed &&
    previous.flushVersion === next.flushVersion &&
    previous.forceInstant === next.forceInstant &&
    previous.renderMarkdownWhileStreaming === next.renderMarkdownWhileStreaming,
);
