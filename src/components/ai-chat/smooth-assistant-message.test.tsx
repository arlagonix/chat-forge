import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ai-chat/code-block-preview-dialog", () => ({
  CodeBlockDisplayMode: { Preview: "preview", Source: "source" },
  CodeBlockPreviewDialog: () => null,
  CodeBlockSourceView: ({ code }: { code: string }) => <pre>{code}</pre>,
  RenderablePreview: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import { SmoothAssistantMessageContent } from "@/components/ai-chat/smooth-assistant-message";

describe("SmoothAssistantMessageContent", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("renders Markdown while streaming when enabled", () => {
    const { container } = render(
      <SmoothAssistantMessageContent
        content="**live markdown**"
        isApiStreaming
        flushVersion={0}
        renderMarkdownWhileStreaming
      />,
    );

    expect(container.querySelector("strong")?.textContent).toBe(
      "live markdown",
    );
    expect(container.querySelector("pre")).not.toBeInTheDocument();
  });

  it("renders plain text while streaming when disabled", () => {
    const { container } = render(
      <SmoothAssistantMessageContent
        content="**live markdown**"
        isApiStreaming
        flushVersion={0}
        renderMarkdownWhileStreaming={false}
      />,
    );

    expect(container.querySelector("strong")).not.toBeInTheDocument();
    expect(container.querySelector("pre")?.textContent).toBe(
      "**live markdown**",
    );
  });

  it("renders Markdown after streaming regardless of the streaming preference", () => {
    const { container } = render(
      <SmoothAssistantMessageContent
        content="**finished markdown**"
        isApiStreaming={false}
        flushVersion={0}
        renderMarkdownWhileStreaming={false}
      />,
    );

    expect(container.querySelector("strong")?.textContent).toBe(
      "finished markdown",
    );
  });

  it("throttles Markdown updates while streaming", () => {
    vi.useFakeTimers();

    const { container, rerender } = render(
      <SmoothAssistantMessageContent
        content="**first**"
        isApiStreaming
        flushVersion={0}
        renderMarkdownWhileStreaming
      />,
    );

    expect(container.querySelector("strong")?.textContent).toBe("first");

    rerender(
      <SmoothAssistantMessageContent
        content="**second**"
        isApiStreaming
        flushVersion={1}
        renderMarkdownWhileStreaming
      />,
    );

    expect(container.querySelector("strong")?.textContent).toBe("first");

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(container.querySelector("strong")?.textContent).toBe("second");
  });
});
