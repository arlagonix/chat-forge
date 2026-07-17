import { describe, expect, it } from "vitest";

import {
  createBuiltInAgents,
  formatAgentDisplayName,
} from "@/lib/ai-chat/builtin-agents";

describe("built-in agents", () => {
  it("applies independent model preferences", () => {
    const agents = createBuiltInAgents(
      { general: 3, general_full: 4 },
      {
        general: { providerId: "provider-a", model: "model-a" },
        general_full: { providerId: "provider-b", model: "model-b" },
      },
    );

    expect(agents[0]).toMatchObject({
      name: "general",
      providerId: "provider-a",
      model: "model-a",
      maxNestingDepth: 3,
    });
    expect(agents[1]).toMatchObject({
      name: "general_full",
      providerId: "provider-b",
      model: "model-b",
      maxNestingDepth: 4,
    });
  });

  it("capitalizes only the first character for display", () => {
    expect(formatAgentDisplayName("general_full")).toBe("General_full");
    expect(formatAgentDisplayName("Reviewer")).toBe("Reviewer");
    expect(formatAgentDisplayName("")).toBe("");
  });
});
