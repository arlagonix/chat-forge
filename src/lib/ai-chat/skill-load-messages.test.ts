import { describe, expect, it } from "vitest";

import {
  collectLoadedSkillNamesFromMessage,
  createLoadSkillAssistantMessage,
  pruneActiveSkillNamesAfterDeletingLoadedSkillMessage,
} from "@/lib/ai-chat/skill-load-messages";
import type { LoadedSkillInfo } from "@/lib/ai-chat/types";

function skill(name: string): LoadedSkillInfo {
  return {
    name,
    description: `${name} description`,
    enabled: true,
    recommendedToolNames: [],
    manifestPath: `/skills/${name}/SKILL.md`,
    directoryPath: `/skills/${name}`,
    manifestContent: `---\nname: ${name}\ndescription: ${name} description\n---\nUse ${name}.`,
    instructions: "",
  };
}

describe("skill load messages", () => {
  it("creates a visible assistant tool execution for a loaded skill", () => {
    const message = createLoadSkillAssistantMessage({ skill: skill("docs") });

    expect(message.role).toBe("assistant");
    expect([...collectLoadedSkillNamesFromMessage(message)]).toEqual(["docs"]);
    if (message.role !== "assistant") throw new Error("Expected assistant");
    expect(message.variants[0]?.processSteps?.[0]?.type).toBe("tool_execution");
  });

  it("keeps a duplicated active skill when another load remains", () => {
    const firstLoad = createLoadSkillAssistantMessage({ skill: skill("docs") });
    const secondLoad = createLoadSkillAssistantMessage({ skill: skill("docs") });

    expect(
      pruneActiveSkillNamesAfterDeletingLoadedSkillMessage({
        activeSkillNames: ["docs"],
        deletedMessage: secondLoad,
        remainingMessages: [firstLoad],
      }),
    ).toEqual(["docs"]);
  });

  it("removes an active skill when the last load is deleted", () => {
    const load = createLoadSkillAssistantMessage({ skill: skill("docs") });

    expect(
      pruneActiveSkillNamesAfterDeletingLoadedSkillMessage({
        activeSkillNames: ["docs", "search"],
        deletedMessage: load,
        remainingMessages: [],
      }),
    ).toEqual(["search"]);
  });
});
