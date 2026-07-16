import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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

import {
  ToolExecutionBlock,
  ToolExecutionDetailsSidebar,
  type ToolExecutionDetails,
} from "@/components/ai-chat/tool-execution-block";
import {
  BASH_TOOL_NAME,
  CALL_AGENT_TOOL_NAME,
  READ_TOOL_NAME,
} from "@/lib/ai-chat/builtin-tools";
import type {
  ChatToolCall,
  ChatToolResult,
  LoadedToolInfo,
} from "@/lib/ai-chat/types";

const toolCall: ChatToolCall = {
  id: "tool-call-1",
  type: "function",
  function: {
    name: BASH_TOOL_NAME,
    arguments: JSON.stringify({ command: "echo hello" }),
  },
};

function ToolBlockWithSidebar({
  call = toolCall,
  result,
  loadedTools = [],
}: {
  call?: ChatToolCall;
  result?: ChatToolResult;
  loadedTools?: LoadedToolInfo[];
}) {
  const [details, setDetails] = useState<ToolExecutionDetails>();

  return (
    <>
      <ToolExecutionBlock
        id={call.id}
        toolCall={call}
        toolResult={result}
        loadedTools={loadedTools}
        isCollapsed
        onToggleCollapsed={vi.fn()}
        onOpenDetails={setDetails}
      />
      <ToolExecutionDetailsSidebar
        details={details}
        loadedTools={loadedTools}
        onClose={() => setDetails(undefined)}
      />
    </>
  );
}

describe("ToolExecutionBlock", () => {
  it("does not build heavy details until the details sidebar opens", () => {
    mocks.buildToolExecutionPreviewForCall.mockClear();

    render(<ToolBlockWithSidebar />);

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

    render(<ToolBlockWithSidebar call={mcpToolCall} />);

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

    render(<ToolBlockWithSidebar call={mcpToolCall} loadedTools={loadedTools} />);

    fireEvent.click(screen.getAllByTitle("Open tool call details")[0]);

    expect(screen.getByText("Search stored memories.")).toBeInTheDocument();
    expect(screen.queryByText("Exposed name: mcp_memory_search_memory")).not.toBeInTheDocument();
  });

  it("capitalizes only the first character of tool names in compact and details headers", () => {
    const customToolCall: ChatToolCall = {
      id: "tool-call-custom-1",
      type: "function",
      function: {
        name: "call_agent",
        arguments: "{}",
      },
    };

    render(<ToolBlockWithSidebar call={customToolCall} />);

    expect(screen.getByText("Call_agent")).toBeInTheDocument();
    expect(screen.queryByText("call_agent")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Open tool call details"));

    expect(screen.getAllByText("Call_agent")).toHaveLength(2);
    expect(screen.queryByText("call_agent")).not.toBeInTheDocument();
  });

  it("shows a muted checkmark for successful tool calls", () => {
    const toolResult: ChatToolResult = {
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      content: "done",
    };

    render(
      <ToolExecutionBlock
        id="tool-call-1"
        toolCall={toolCall}
        toolResult={toolResult}
        status="complete"
        loadedTools={[]}
        isCollapsed
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tool complete")).toBeInTheDocument();
    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.getByText("echo hello")).toBeInTheDocument();
  });

  it("treats a final result as complete even when status is stale", () => {
    const toolResult: ChatToolResult = {
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      content: "done",
    };

    render(
      <ToolExecutionBlock
        id="tool-call-1"
        toolCall={toolCall}
        toolResult={toolResult}
        status="running"
        loadedTools={[]}
        isCollapsed
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Tool complete")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument();
  });

  it("compacts absolute file paths in the header", () => {
    const readToolCall: ChatToolCall = {
      id: "tool-call-read-1",
      type: "function",
      function: {
        name: READ_TOOL_NAME,
        arguments: JSON.stringify({
          path: String.raw`C:\Prime\GitHub\project\docs\example.mdx`,
        }),
      },
    };

    render(
      <ToolExecutionBlock
        id="tool-call-read-1"
        toolCall={readToolCall}
        loadedTools={[]}
        isCollapsed
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(screen.getByText("example.mdx")).toBeInTheDocument();
    expect(screen.queryByText(/C:\\Prime/)).not.toBeInTheDocument();
  });

  it("hides running status text for active tool calls", () => {
    render(
      <ToolExecutionBlock
        id="tool-call-1"
        toolCall={toolCall}
        status="running"
        loadedTools={[]}
        isCollapsed
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting")).not.toBeInTheDocument();
  });

  it("shows only the agent name in call_agent compact headers", () => {
    const callAgentToolCall: ChatToolCall = {
      id: "tool-call-agent-1",
      type: "function",
      function: {
        name: CALL_AGENT_TOOL_NAME,
        arguments: JSON.stringify({
          agentName: "general",
          task: "Think of the funniest pun involving a cat.",
        }),
      },
    };

    render(
      <ToolExecutionBlock
        id="tool-call-agent-1"
        toolCall={callAgentToolCall}
        status="complete"
        loadedTools={[]}
        isCollapsed
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(screen.getByText("Call_agent")).toBeInTheDocument();
    expect(screen.getByText("general")).toBeInTheDocument();
    expect(screen.queryByText(/funniest pun/)).not.toBeInTheDocument();
  });

});
