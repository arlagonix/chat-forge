import { describe, expect, it } from "vitest";

import { FEATURE_PERMISSION_KEY, normalizeModesState } from "./modes";
import {
  getEffectiveSkillAvailability,
  getEffectiveWorkspaceRoots,
} from "./request-builder";
import type { ChatWorkspaceRoot, LoadedModeInfo, SkillsSettings } from "./types";

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

describe("skills workspace and availability behavior", () => {
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

  it("defaults missing skill availability to on", () => {
    const settings: SkillsSettings = {
      enabled: true,
      skillAvailability: {},
      availabilityModelVersion: 1,
    };

    expect(
      getEffectiveSkillAvailability({
        skillName: "docs",
        skillsSettings: settings,
      }),
    ).toBe("on");
  });

  it("allows a mode to turn a skill on when global skills are off", () => {
    const settings: SkillsSettings = {
      enabled: false,
      skillAvailability: {},
      availabilityModelVersion: 1,
    };
    const mode: LoadedModeInfo = {
      id: "mode-1",
      name: "Skill mode",
      enabled: true,
      description: "",
      instructions: "",
      allowedToolNames: [],
      allowedSkillNames: [],
      allowedAgentNames: [],
      toolPermissions: {},
      skillAvailability: { [FEATURE_PERMISSION_KEY]: "custom", docs: "on" },
      agentPermissions: {},
      permissionModelVersion: 2,
      skillAvailabilityModelVersion: 1,
    };

    expect(
      getEffectiveSkillAvailability({
        skillName: "docs",
        skillsSettings: settings,
        mode,
        modeCapabilityContext: {
          availableTools: [],
          availableSkills: [],
          availableAgents: [],
        },
      }),
    ).toBe("on");
  });

  it("migrates legacy mode skill permissions to availability", () => {
    const migrated = normalizeModesState({
      modes: [
        {
          id: "legacy-mode",
          name: "Legacy mode",
          enabled: true,
          description: "",
          instructions: "",
          allowedToolNames: [],
          allowedSkillNames: [],
          allowedAgentNames: [],
          toolPermissions: {},
          skillPermissions: {
            [FEATURE_PERMISSION_KEY]: "ask",
            docs: "deny",
            slides: "allow",
          },
          agentPermissions: {},
          permissionModelVersion: 2,
        },
      ],
    });
    const mode = migrated.modes.find(
      (candidate) => candidate.id === "legacy-mode",
    );

    expect(mode?.skillAvailabilityModelVersion).toBe(1);
    expect(mode?.skillAvailability).toEqual({
      [FEATURE_PERMISSION_KEY]: "on",
      docs: "off",
      slides: "on",
    });
  });
});
