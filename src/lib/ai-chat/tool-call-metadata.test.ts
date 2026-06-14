import { describe, expect, it } from "vitest";

import {
  attachToolCallUiMetadata,
  stripToolCallUiMetadataForProvider,
} from "./tool-call-metadata";
import type { ChatToolCall, LoadedToolInfo } from "./types";

const mcpTool: LoadedToolInfo = {
  id: "mcp:server-1:search_memory",
  name: "mcp_memory_search_memory",
  displayName: "search_memory · memory",
  description: "Search stored memories.",
  parameters: {},
  command: "",
  args: [],
  input: "none",
  timeoutMs: 30_000,
  requiresApproval: true,
  source: "mcp",
  mcp: {
    serverId: "server-1",
    serverName: "memory",
    originalToolName: "search_memory",
    exposedName: "mcp_memory_search_memory",
    transport: "stdio",
  },
};

const toolCall: ChatToolCall = {
  id: "tool-call-1",
  type: "function",
  function: {
    name: "mcp_memory_search_memory",
    arguments: JSON.stringify({ query: "test" }),
  },
};

describe("tool call UI metadata", () => {
  it("persists only tool descriptions on tool calls", () => {
    expect(attachToolCallUiMetadata(toolCall, [mcpTool])).toMatchObject({
      uiMetadata: {
        description: "Search stored memories.",
      },
    });
    expect(attachToolCallUiMetadata(toolCall, [mcpTool]).uiMetadata).not.toHaveProperty(
      "mcp",
    );
    expect(attachToolCallUiMetadata(toolCall, [mcpTool]).uiMetadata).not.toHaveProperty(
      "source",
    );
    expect(attachToolCallUiMetadata(toolCall, [mcpTool]).uiMetadata).not.toHaveProperty(
      "displayName",
    );
  });

  it("does not send UI metadata to providers", () => {
    const decorated = attachToolCallUiMetadata(toolCall, [mcpTool]);
    const stripped = stripToolCallUiMetadataForProvider(decorated);

    expect(stripped).toEqual(toolCall);
    expect(stripped).not.toHaveProperty("uiMetadata");
  });
});
