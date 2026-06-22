import { describe, expect, it } from "vitest";

import {
  getEffectiveSkillPermission,
  getEffectiveWorkspaceRoots,
} from "./request-builder";
import type { ChatWorkspaceRoot, SkillsSettings } from "./types";

const oldDate = "2026-01-01T00:00:00.000Z";

function workspaceRoot(
  overrides: Partial<ChatWorkspaceRoot> = {},
): ChatWorkspaceRoot {
  return {
    id: "workspace-1",
    name: "Project A",
    path: "/work/project-a",
    createdAt: oldDate,
    ...overrides,
  };
}

describe("skills workspace and permission behavior", () => {
  it("ignores legacy automatic chat workspaces", () => {
    expect(
      getEffectiveWorkspaceRoots({
        workspaceRoots: [
          workspaceRoot({
            id: "chat",
            name: "Chat workspace",
            kind: "chat",
            automatic: true,
            path: "/app/generated-chat-workspace",
          }),
        ],
        activeSkillNames: [],
        availableSkillsByName: new Map(),
      }),
    ).toEqual([]);
  });

  it("ignores automatically injected skill folders as workspace roots", () => {
    expect(
      getEffectiveWorkspaceRoots({
        workspaceRoots: [
          workspaceRoot({ id: "skill:docs:0", kind: "skill", automatic: true }),
          workspaceRoot({ id: "workspace-2", path: "/work/project-b" }),
        ],
        activeSkillNames: [],
        availableSkillsByName: new Map(),
      }),
    ).toEqual([
      {
        ...workspaceRoot({ id: "workspace-2", path: "/work/project-b" }),
        kind: "manual",
        automatic: false,
        pathKind: "folder",
      },
    ]);
  });

  it("defaults missing skill permissions to allow", () => {
    const settings: SkillsSettings = {
      enabled: true,
      skillsPermission: "custom",
      skillPermissions: {},
      permissionModelVersion: 2,
    };

    expect(
      getEffectiveSkillPermission({ skillName: "docs", skillsSettings: settings }),
    ).toBe("allow");
  });
});
