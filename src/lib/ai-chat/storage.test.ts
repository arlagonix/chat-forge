import { describe, expect, it } from "vitest";

import { normalizeAppSettings } from "./storage";
import type { AppSettings } from "./types";

const oldDate = "2026-01-01T00:00:00.000Z";

describe("chat storage normalization", () => {
  it("preserves a folder default accessible path across app settings save/load", () => {
    const settings: AppSettings = {
      chatTitleGenerationMode: "local",
      fontFamily: "sans",
      thinkingAutoCollapse: false,
      chatFolders: [
        {
          id: "folder-1",
          name: "Project folder",
          createdAt: oldDate,
          updatedAt: oldDate,
          workspaceRoots: [
            {
              id: "workspace-1",
              name: "Project A",
              path: "/work/project-a",
              createdAt: oldDate,
              kind: "manual",
            },
          ],
        },
      ],
    };

    expect(
      normalizeAppSettings(settings).chatFolders[0]?.workspaceRoots,
    ).toEqual([
      {
        id: "workspace-1",
        name: "Project A",
        path: "/work/project-a",
        createdAt: oldDate,
        automatic: undefined,
        kind: "manual",
        pathKind: "folder",
      },
    ]);
  });

  it("keeps all persisted folder accessible paths", () => {
    const normalized = normalizeAppSettings({
      chatTitleGenerationMode: "local",
      fontFamily: "sans",
      chatFolders: [
        {
          id: "folder-1",
          name: "Project folder",
          createdAt: oldDate,
          updatedAt: oldDate,
          workspaceRoots: [
            {
              id: "workspace-1",
              name: "Project A",
              path: "/work/project-a",
              createdAt: oldDate,
            },
            {
              id: "workspace-2",
              name: "Project B",
              path: "/work/project-b",
              createdAt: oldDate,
            },
          ],
        },
      ],
    });

    expect(
      normalized.chatFolders[0]?.workspaceRoots?.map((root) => root.path),
    ).toEqual(["/work/project-a", "/work/project-b"]);
  });

  it("normalizes persisted folder workspaces without removing the folder workspace option", () => {
    const normalized = normalizeAppSettings({
      chatTitleGenerationMode: "local",
      fontFamily: "sans",
      chatFolders: [
        {
          id: "folder-1",
          name: "Project folder",
          createdAt: oldDate,
          updatedAt: oldDate,
          workspaceRoots: [
            {
              id: "workspace-1",
              name: "  Project A  ",
              path: "  /work/project-a  ",
              createdAt: oldDate,
              kind: "manual",
            },
            {
              id: "workspace-empty",
              name: "Broken",
              path: "   ",
              createdAt: oldDate,
            },
          ],
        },
      ],
    });

    expect(normalized.chatFolders[0]?.workspaceRoots).toEqual([
      {
        id: "workspace-1",
        name: "Project A",
        path: "/work/project-a",
        createdAt: oldDate,
        automatic: undefined,
        kind: "manual",
        pathKind: "folder",
      },
    ]);
  });

  it("defaults streaming Markdown rendering to enabled", () => {
    expect(normalizeAppSettings({}).renderMarkdownWhileStreaming).toBe(true);
  });

  it("preserves disabled streaming Markdown rendering", () => {
    expect(
      normalizeAppSettings({ renderMarkdownWhileStreaming: false })
        .renderMarkdownWhileStreaming,
    ).toBe(false);
  });

  it("preserves enabled streaming Markdown rendering", () => {
    expect(
      normalizeAppSettings({ renderMarkdownWhileStreaming: true })
        .renderMarkdownWhileStreaming,
    ).toBe(true);
  });


  it("defaults background images to enabled", () => {
    expect(normalizeAppSettings({}).backgroundImagesEnabled).toBe(true);
  });

  it("preserves disabled background images", () => {
    expect(
      normalizeAppSettings({ backgroundImagesEnabled: false })
        .backgroundImagesEnabled,
    ).toBe(false);
  });

  it("defaults chat width to the current 896px layout", () => {
    expect(normalizeAppSettings({}).chatWidth).toBe("896");
  });

  it("preserves valid persisted chat width", () => {
    expect(normalizeAppSettings({ chatWidth: "720" }).chatWidth).toBe("720");
    expect(normalizeAppSettings({ chatWidth: "full" }).chatWidth).toBe("full");
  });

  it("falls back to 896px for invalid chat width", () => {
    expect(
      normalizeAppSettings({ chatWidth: "wide" as never }).chatWidth,
    ).toBe("896");
  });

  it("preserves managed light and dark background images", () => {
    expect(
      normalizeAppSettings({
        backgroundImages: {
          light: {
            path: "  /app-data/background-light.jpg  ",
            originalName: "  light.jpg  ",
          },
          dark: {
            path: "/app-data/background-dark.webp",
            originalName: "dark.webp",
          },
        },
      }).backgroundImages,
    ).toEqual({
      light: {
        path: "/app-data/background-light.jpg",
        originalName: "light.jpg",
      },
      dark: {
        path: "/app-data/background-dark.webp",
        originalName: "dark.webp",
      },
    });
  });

  it("drops invalid managed background image entries", () => {
    expect(
      normalizeAppSettings({
        backgroundImages: {
          light: { path: "", originalName: "empty.jpg" },
          dark: undefined,
        },
      }).backgroundImages,
    ).toBeUndefined();
  });

});
