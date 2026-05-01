import { memo, useCallback, useEffect, useRef, useState } from "react";

import { MarkdownMessage } from "./markdown-message";

const AssistantMessageContent = memo(function AssistantMessageContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return <MarkdownMessage content={content} className={className} />;
});

function takeSafeVisibleSlice(remaining: string, maxChars: number) {
  if (remaining.length <= maxChars) return remaining;

  const slice = remaining.slice(0, maxChars);
  const boundaries = [
    slice.lastIndexOf("\n"),
    slice.lastIndexOf(" "),
    slice.lastIndexOf("."),
    slice.lastIndexOf(","),
    slice.lastIndexOf(";"),
    slice.lastIndexOf(":"),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?"),
  ];
  const boundary = Math.max(...boundaries);

  if (boundary >= Math.min(12, Math.max(0, maxChars - 1))) {
    return remaining.slice(0, boundary + 1);
  }

  return slice;
}

function takeVisibleWords(
  remaining: string,
  maxWords: number,
  fallbackChars: number,
) {
  let end = 0;
  let words = 0;
  const wordPattern = /\s*\S+\s*/g;
  let wordMatch: RegExpExecArray | null;

  while ((wordMatch = wordPattern.exec(remaining)) && words < maxWords) {
    end = wordPattern.lastIndex;
    words += 1;
  }

  return end > 0
    ? remaining.slice(0, end)
    : takeSafeVisibleSlice(remaining, fallbackChars);
}

function getSmoothRevealSlice(remaining: string, isApiStreaming: boolean) {
  if (!remaining) return "";

  if (!isApiStreaming) {
    return takeSafeVisibleSlice(
      remaining,
      Math.max(160, Math.ceil(remaining.length / 10)),
    );
  }

  if (remaining.length < 80) {
    return remaining.slice(0, remaining.length < 24 ? 1 : 2);
  }

  if (remaining.length < 500) {
    return takeVisibleWords(remaining, 2, 32);
  }

  if (remaining.length < 1500) {
    return takeVisibleWords(remaining, 6, 96);
  }

  return takeSafeVisibleSlice(remaining, 220);
}

function useSmoothStreamingText({
  content,
  isApiStreaming,
  flushVersion,
  forceInstant = false,
  onVisualProgress,
  onVisualStreamingChange,
}: {
  content: string;
  isApiStreaming: boolean;
  flushVersion: number;
  forceInstant?: boolean;
  onVisualProgress?: () => void;
  onVisualStreamingChange?: (isVisuallyStreaming: boolean) => void;
}) {
  const [visibleContent, setVisibleContent] = useState(content);
  const visibleContentRef = useRef(content);
  const visualStreamingRef = useRef(false);
  const lastFlushVersionRef = useRef(flushVersion);

  const setVisualStreaming = useCallback(
    (isVisuallyStreaming: boolean) => {
      if (visualStreamingRef.current === isVisuallyStreaming) return;
      visualStreamingRef.current = isVisuallyStreaming;
      onVisualStreamingChange?.(isVisuallyStreaming);
    },
    [onVisualStreamingChange],
  );

  useEffect(() => {
    if (forceInstant) {
      lastFlushVersionRef.current = flushVersion;
      visibleContentRef.current = content;
      setVisibleContent(content);
      setVisualStreaming(false);
      onVisualProgress?.();
      return;
    }

    if (flushVersion !== lastFlushVersionRef.current) {
      lastFlushVersionRef.current = flushVersion;
      visibleContentRef.current = content;
      setVisibleContent(content);
      setVisualStreaming(false);
      onVisualProgress?.();
      return;
    }

    if (!content.startsWith(visibleContentRef.current)) {
      visibleContentRef.current = content;
      setVisibleContent(content);
      setVisualStreaming(false);
      onVisualProgress?.();
      return;
    }

    setVisualStreaming(visibleContentRef.current.length < content.length);
  }, [
    content,
    flushVersion,
    forceInstant,
    onVisualProgress,
    setVisualStreaming,
  ]);

  useEffect(() => {
    if (forceInstant) return;

    let timeoutId: number | undefined;
    let cancelled = false;

    function tick() {
      if (cancelled) return;

      const current = visibleContentRef.current;
      if (current.length >= content.length) {
        setVisualStreaming(false);
        return;
      }

      const remaining = content.slice(current.length);
      const nextSlice = getSmoothRevealSlice(remaining, isApiStreaming);
      if (!nextSlice) {
        setVisualStreaming(false);
        return;
      }

      const nextVisibleContent = current + nextSlice;
      visibleContentRef.current = nextVisibleContent;
      setVisibleContent(nextVisibleContent);
      setVisualStreaming(nextVisibleContent.length < content.length);
      onVisualProgress?.();

      if (nextVisibleContent.length < content.length) {
        timeoutId = window.setTimeout(tick, isApiStreaming ? 22 : 16);
      }
    }

    if (visibleContentRef.current.length < content.length) {
      setVisualStreaming(true);
      timeoutId = window.setTimeout(tick, isApiStreaming ? 24 : 12);
    } else {
      setVisualStreaming(false);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [
    content,
    forceInstant,
    isApiStreaming,
    onVisualProgress,
    setVisualStreaming,
  ]);

  return visibleContent;
}

export const SmoothAssistantMessageContent = memo(
  function SmoothAssistantMessageContent({
    content,
    className,
    isApiStreaming,
    flushVersion,
    forceInstant = false,
    onVisualProgress,
    onVisualStreamingChange,
  }: {
    content: string;
    className?: string;
    isApiStreaming: boolean;
    flushVersion: number;
    forceInstant?: boolean;
    onVisualProgress?: () => void;
    onVisualStreamingChange?: (isVisuallyStreaming: boolean) => void;
  }) {
    const visibleContent = useSmoothStreamingText({
      content,
      isApiStreaming,
      flushVersion,
      forceInstant,
      onVisualProgress,
      onVisualStreamingChange,
    });

    return (
      <AssistantMessageContent content={visibleContent} className={className} />
    );
  },
);
