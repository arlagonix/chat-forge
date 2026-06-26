import { describe, expect, it } from "vitest";

import { groupToolsBySource } from "@/lib/ai-chat/tool-groups";
import type { LoadedToolInfo } from "@/lib/ai-chat/types";

function tool(
  partial: Partial<LoadedToolInfo> & Pick<LoadedToolInfo, "name">,
): LoadedToolInfo {
  return {
    description: "",
    parameters: {},
    command: "",
    args: [],
    input: "json-stdin",
    timeoutMs: 30_000,
    ...partial,
    id: partial.id ?? partial.name,
    name: partial.name,
  };
}

describe("tool display groups", () => {
  it("groups tools by built-in, custom, and MCP server", () => {
    const groups = groupToolsBySource([
      tool({ name: "bash" }),
      tool({ name: "project_search", source: "custom" }),
      tool({
        name: "mcp_serena_read_memory",
        source: "mcp",
        mcp: {
          serverId: "server-1",
          serverName: "serena",
          originalToolName: "read_memory",
          exposedName: "mcp_serena_read_memory",
          transport: "stdio",
        },
      }),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "Built-in tools",
      "Custom user tools",
      "MCP serena tools",
    ]);
  });
});
