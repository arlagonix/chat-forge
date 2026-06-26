import { isBuiltInToolName } from "@/lib/ai-chat/builtin-tools";
import type { LoadedToolInfo } from "@/lib/ai-chat/types";

export type ToolDisplayGroup = {
  id: string;
  title: string;
  tools: LoadedToolInfo[];
};

function normalizeGroupId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "unknown";
}

function compareToolNames(left: LoadedToolInfo, right: LoadedToolInfo) {
  return left.name.localeCompare(right.name);
}

export function getToolSearchText(tool: LoadedToolInfo) {
  return [
    tool.name,
    tool.displayName,
    tool.description,
    tool.source,
    tool.mcp?.serverName,
    tool.mcp?.originalToolName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterToolsForSearch(
  tools: LoadedToolInfo[],
  searchText: string,
) {
  const query = searchText.trim().toLowerCase();
  if (!query) return tools;
  return tools.filter((tool) => getToolSearchText(tool).includes(query));
}

export function groupToolsBySource(tools: LoadedToolInfo[]): ToolDisplayGroup[] {
  const builtInTools: LoadedToolInfo[] = [];
  const customTools: LoadedToolInfo[] = [];
  const mcpToolsByServer = new Map<string, LoadedToolInfo[]>();

  for (const tool of tools) {
    if (tool.source === "mcp") {
      const serverName = tool.mcp?.serverName?.trim() || "Unknown";
      const serverTools = mcpToolsByServer.get(serverName) ?? [];
      serverTools.push(tool);
      mcpToolsByServer.set(serverName, serverTools);
      continue;
    }

    if (isBuiltInToolName(tool.name)) {
      builtInTools.push(tool);
      continue;
    }

    customTools.push(tool);
  }

  const groups: ToolDisplayGroup[] = [];

  if (builtInTools.length > 0) {
    groups.push({
      id: "built-in",
      title: "Built-in tools",
      tools: [...builtInTools].sort(compareToolNames),
    });
  }

  if (customTools.length > 0) {
    groups.push({
      id: "custom",
      title: "Custom user tools",
      tools: [...customTools].sort(compareToolNames),
    });
  }

  for (const [serverName, serverTools] of [...mcpToolsByServer.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    groups.push({
      id: `mcp-${normalizeGroupId(serverName)}`,
      title: `MCP ${serverName} tools`,
      tools: [...serverTools].sort(compareToolNames),
    });
  }

  return groups;
}
