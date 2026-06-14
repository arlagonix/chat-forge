import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildToolExecutionPreviewForCall: vi.fn(() => undefined),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/ai-chat/markdown-message", () => ({
  MarkdownMessage: ({ content }: { content: string }) => <pre>{content}</pre>,
}));

vi.mock("@/lib/ai-chat/tool-preview", () => ({
  buildToolExecutionPreviewForCall: mocks.buildToolExecutionPreviewForCall,
}));

vi.mock("sonner", () => ({
  toast: mocks.toast,
}));

import { ToolExecutionBlock } from "@/components/ai-chat/tool-execution-block";
import { BASH_TOOL_NAME } from "@/lib/ai-chat/builtin-tools";
import type { ChatToolCall } from "@/lib/ai-chat/types";

const toolCall: ChatToolCall = {
  id: "tool-call-1",
  type: "function",
  function: {
    name: BASH_TOOL_NAME,
    arguments: JSON.stringify({ command: "echo hello" }),
  },
};

describe("ToolExecutionBlock", () => {
  it("does not build heavy details until the details dialog opens", () => {
    mocks.buildToolExecutionPreviewForCall.mockClear();

    render(
      <ToolExecutionBlock
        id="tool-call-1"
        toolCall={toolCall}
        loadedTools={[]}
        isCollapsed
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(mocks.buildToolExecutionPreviewForCall).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByTitle("Open tool call details")[0]);

    expect(mocks.buildToolExecutionPreviewForCall).toHaveBeenCalledTimes(1);
  });
});
