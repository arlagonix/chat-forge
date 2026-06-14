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
import type { ChatToolCall, LoadedToolInfo } from "@/lib/ai-chat/types";

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

  it("shows persisted MCP descriptions in details when the tool is no longer loaded", () => {
    const mcpToolCall: ChatToolCall = {
      id: "mcp-tool-call-1",
      type: "function",
      function: {
        name: "mcp_memory_search_memory",
        arguments: JSON.stringify({ query: "project" }),
      },
      uiMetadata: {
        displayName: "search_memory · memory",
        description: "Search stored memories.",
        source: "mcp",
        mcp: {
          serverId: "server-1",
          serverName: "memory",
          originalToolName: "search_memory",
          exposedName: "mcp_memory_search_memory",
          transport: "stdio",
        },
      },
    };

    render(
      <ToolExecutionBlock
        id="mcp-tool-call-1"
        toolCall={mcpToolCall}
        loadedTools={[]}
        isCollapsed
        onToggleCollapsed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByTitle("Open tool call details")[0]);

    expect(screen.getByText("Search stored memories.")).toBeInTheDocument();
    expect(screen.queryByText("Server: memory")).not.toBeInTheDocument();
    expect(screen.queryByText("Original name: search_memory")).not.toBeInTheDocument();
  });

  it("shows current MCP descriptions in details before uiMetadata is persisted", () => {
    const mcpToolCall: ChatToolCall = {
      id: "mcp-tool-call-2",
      type: "function",
      function: {
        name: "mcp_memory_search_memory",
        arguments: JSON.stringify({ query: "project" }),
      },
    };
    const loadedTools: LoadedToolInfo[] = [
      {
        id: "mcp:server-1:search_memory",
        name: "mcp_memory_search_memory",
        displayName: "search_memory · memory",
        description: "Search stored memories.",
        parameters: {},
        command: "",
        args: [],
        input: "none",
        timeoutMs: 30000,
        source: "mcp",
        mcp: {
          serverId: "server-1",
          serverName: "memory",
          originalToolName: "search_memory",
          exposedName: "mcp_memory_search_memory",
          transport: "stdio",
        },
      },
    ];

    render(
      <ToolExecutionBlock
        id="mcp-tool-call-2"
        toolCall={mcpToolCall}
        loadedTools={loadedTools}
        isCollapsed
        onToggleCollapsed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByTitle("Open tool call details")[0]);

    expect(screen.getByText("Search stored memories.")).toBeInTheDocument();
    expect(screen.queryByText("Exposed name: mcp_memory_search_memory")).not.toBeInTheDocument();
  });

});
