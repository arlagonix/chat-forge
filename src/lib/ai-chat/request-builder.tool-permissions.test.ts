import { describe, expect, it } from "vitest";

import { DEFAULT_TOOLS_SETTINGS } from "@/lib/ai-chat/builtin-tools";
import { getEffectiveGlobalToolPermission } from "@/lib/ai-chat/request-builder";

describe("tool permission resolution", () => {
  it("does not apply the global tools master permission to MCP tools", () => {
    expect(
      getEffectiveGlobalToolPermission("mcp_serena_read_memory", {
        ...DEFAULT_TOOLS_SETTINGS,
        toolsPermission: "deny",
        toolPermissions: {
          mcp_serena_read_memory: "allow",
        },
      }),
    ).toBe("allow");
  });

  it("uses Ask as the default global permission for MCP tools", () => {
    expect(
      getEffectiveGlobalToolPermission("mcp_serena_read_memory", {
        ...DEFAULT_TOOLS_SETTINGS,
        toolsPermission: "allow",
        toolPermissions: {},
      }),
    ).toBe("ask");
  });
});
