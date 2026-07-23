import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";

const editorRenderCounts = vi.hoisted(() => new Map<string, number>());

vi.mock("@/components/code-editor", () => ({
  CodeEditor: ({
    ariaLabel,
    value,
    onChange,
    placeholder,
  }: {
    ariaLabel?: string;
    value: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => {
    const label = ariaLabel ?? "Code editor";
    editorRenderCounts.set(label, (editorRenderCounts.get(label) ?? 0) + 1);

    return (
      <textarea
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          onChange?.(event.target.value)
        }
      />
    );
  },
}));

import { McpDialog } from "@/components/mcp-dialog";
import { DEFAULT_TOOLS_SETTINGS } from "@/lib/ai-chat/builtin-tools";
import type { McpSettings } from "@/lib/ai-chat/types";

const INITIAL_SETTINGS: McpSettings = {
  enabled: true,
  servers: [
    {
      id: "server-1",
      name: "serena",
      enabled: true,
      transport: "stdio",
      command: "npx",
      args: [],
      env: {},
      timeoutMs: 60_000,
      requireApproval: true,
      tools: {},
    },
  ],
};

describe("McpDialog rendering", () => {
  it("does not rerender unchanged multiline editors when another field changes", () => {
    editorRenderCounts.clear();

    function Harness() {
      const [settings, setSettings] = useState(INITIAL_SETTINGS);
      const [toolsSettings, setToolsSettings] = useState(DEFAULT_TOOLS_SETTINGS);

      return (
        <McpDialog
          open
          onOpenChange={() => undefined}
          mcpSettings={settings}
          onMcpSettingsChange={setSettings}
          toolsSettings={toolsSettings}
          onToolsSettingsChange={setToolsSettings}
          showSuccess={() => undefined}
          showError={() => undefined}
        />
      );
    }

    render(<Harness />);

    const argsBefore = editorRenderCounts.get("Args, one per line") ?? 0;
    const envBefore = editorRenderCounts.get("Environment variables") ?? 0;

    fireEvent.change(screen.getByLabelText("Args, one per line"), {
      target: { value: "--foo" },
    });

    expect(editorRenderCounts.get("Args, one per line") ?? 0).toBeGreaterThan(
      argsBefore,
    );
    expect(editorRenderCounts.get("Environment variables") ?? 0).toBe(
      envBefore,
    );
  });
});
