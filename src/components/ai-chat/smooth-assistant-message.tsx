import { memo, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { MarkdownMessage } from "./markdown-message";

const FENCED_CODE_BLOCK_PATTERN = /(^|\n) {0,3}(```+|~~~+)/g;
const STREAMING_MARKDOWN_RENDER_INTERVAL_MS = 120;

function hasUnclosedFencedCodeBlock(content: string) {
  FENCED_CODE_BLOCK_PATTERN.lastIndex = 0;

  let hasUnclosedFence = false;
  while (FENCED_CODE_BLOCK_PATTERN.exec(content)) {
    hasUnclosedFence = !hasUnclosedFence;
  }

  return hasUnclosedFence;
}

const StreamingPlainTextContent = memo(function StreamingPlainTextContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("chat-markdown w-full min-w-0 max-w-full", className)}>
      <pre className="m-0 whitespace-pre-wrap break-words font-sans text-inherit [line-height:inherit] [overflow-wrap:anywhere]">
        {content}
      </pre>
    </div>
  );
});

const AssistantMessageContent = memo(function AssistantMessageContent({
  content,
  className,
  messageId,
  isStreaming = false,
  skipSyntaxHighlight = false,
  renderMarkdownWhileStreaming = true,
}: {
  content: string;
  className?: string;
  messageId?: string;
  isStreaming?: boolean;
  skipSyntaxHighlight?: boolean;
  renderMarkdownWhileStreaming?: boolean;
}) {
  if (isStreaming && !renderMarkdownWhileStreaming) {
    return (
      <StreamingPlainTextContent content={content} className={className} />
    );
  }

  return (
    <MarkdownMessage
      content={content}
      className={className}
      messageId={messageId}
      skipSyntaxHighlight={skipSyntaxHighlight}
    />
  );
});

type SmoothAssistantMessageContentProps = {
  content: string;
  className?: string;
  messageId?: string;
  isApiStreaming: boolean;
  flushVersion: number;
  forceInstant?: boolean;
  onVisualProgress?: () => void;
  onVisualStreamingChange?: (isVisuallyStreaming: boolean) => void;
  skipSyntaxHighlight?: boolean;
  renderMarkdownWhileStreaming?: boolean;
};

export const SmoothAssistantMessageContent = memo(
  function SmoothAssistantMessageContent({
    content,
    className,
    messageId,
    flushVersion,
    forceInstant = false,
    onVisualProgress,
    onVisualStreamingChange,
    isApiStreaming,
    skipSyntaxHighlight = false,
    renderMarkdownWhileStreaming = true,
  }: SmoothAssistantMessageContentProps) {
    const onVisualProgressRef = useRef(onVisualProgress);
    const onVisualStreamingChangeRef = useRef(onVisualStreamingChange);
    const lastMarkdownRenderTimeRef = useRef(0);
    const [renderedContent, setRenderedContent] = useState(content);
    const [renderedFlushVersion, setRenderedFlushVersion] =
      useState(flushVersion);

    onVisualProgressRef.current = onVisualProgress;
    onVisualStreamingChangeRef.current = onVisualStreamingChange;

    useEffect(() => {
      if (!isApiStreaming || forceInstant || !renderMarkdownWhileStreaming) {
        lastMarkdownRenderTimeRef.current = performance.now();
        setRenderedContent(content);
        setRenderedFlushVersion(flushVersion);
        return;
      }

      const elapsedMs = performance.now() - lastMarkdownRenderTimeRef.current;
      if (elapsedMs >= STREAMING_MARKDOWN_RENDER_INTERVAL_MS) {
        lastMarkdownRenderTimeRef.current = performance.now();
        setRenderedContent(content);
        setRenderedFlushVersion(flushVersion);
        return;
      }

      const timeoutId = window.setTimeout(() => {
        lastMarkdownRenderTimeRef.current = performance.now();
        setRenderedContent(content);
        setRenderedFlushVersion(flushVersion);
      }, STREAMING_MARKDOWN_RENDER_INTERVAL_MS - elapsedMs);

      return () => window.clearTimeout(timeoutId);
    }, [
      content,
      flushVersion,
      forceInstant,
      isApiStreaming,
      renderMarkdownWhileStreaming,
    ]);

    useEffect(() => {
      onVisualProgressRef.current?.();
      onVisualStreamingChangeRef.current?.(false);
    }, [renderedContent, renderedFlushVersion]);

    const shouldSkipSyntaxHighlight =
      skipSyntaxHighlight || hasUnclosedFencedCodeBlock(renderedContent);

    return (
      <AssistantMessageContent
        content={renderedContent}
        className={className}
        messageId={messageId}
        isStreaming={isApiStreaming}
        skipSyntaxHighlight={shouldSkipSyntaxHighlight}
        renderMarkdownWhileStreaming={renderMarkdownWhileStreaming}
      />
    );
  },
  (previous, next) =>
    previous.content === next.content &&
    previous.className === next.className &&
    previous.messageId === next.messageId &&
    previous.isApiStreaming === next.isApiStreaming &&
    previous.flushVersion === next.flushVersion &&
    previous.forceInstant === next.forceInstant &&
    previous.skipSyntaxHighlight === next.skipSyntaxHighlight &&
    previous.renderMarkdownWhileStreaming === next.renderMarkdownWhileStreaming,
);
