import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { McpDialog } from "@/components/mcp-dialog";
import { DEFAULT_TOOLS_SETTINGS } from "@/lib/ai-chat/builtin-tools";
import type { McpSettings } from "@/lib/ai-chat/types";

function createSettings(): McpSettings {
  return {
    enabled: true,
    servers: [
      {
        id: "server-1",
        name: "serena",
        enabled: true,
        transport: "stdio",
        command: "npx",
        args: [],
        timeoutMs: 60_000,
        requireApproval: true,
        tools: {
          edit_memory: {
            originalName: "edit_memory",
            exposedName: "mcp_serena_edit_memory",
            enabled: false,
            description: "Edit memory",
            inputSchema: { type: "object", properties: {} },
          },
        },
      },
      {
        id: "server-2",
        name: "github",
        enabled: true,
        transport: "http",
        url: "http://localhost:3000/mcp",
        timeoutMs: 60_000,
        requireApproval: true,
        tools: {},
      },
    ],
  };
}

function renderMcpDialog(initialSettings = createSettings()) {
  const showSuccess = vi.fn();
  const showError = vi.fn();

  function Harness() {
    const [open, setOpen] = useState(true);
    const [settings, setSettings] = useState(initialSettings);
    const [toolsSettings, setToolsSettings] = useState(DEFAULT_TOOLS_SETTINGS);

    return (
      <>
        <McpDialog
          open={open}
          onOpenChange={setOpen}
          mcpSettings={settings}
          onMcpSettingsChange={setSettings}
          toolsSettings={toolsSettings}
          onToolsSettingsChange={setToolsSettings}
          showSuccess={showSuccess}
          showError={showError}
        />
        <pre data-testid="mcp-settings-state">{JSON.stringify(settings)}</pre>
      </>
    );
  }

  return {
    user: userEvent.setup(),
    showSuccess,
    showError,
    ...render(<Harness />),
  };
}

function readRenderedMcpSettings(): McpSettings {
  const rawState = screen.getByTestId("mcp-settings-state").textContent ?? "";
  return JSON.parse(rawState) as McpSettings;
}

describe("McpDialog", () => {
  it("keeps global MCP independent from the server form Save button", async () => {
    const { user } = renderMcpDialog();
    const saveButton = screen.getByRole("button", { name: "Save" });

    expect(saveButton).toBeDisabled();

    await user.click(screen.getByText("Enable MCP globally"));

    expect(saveButton).toBeDisabled();
  });

  it("does not show unsaved server name edits in the sidebar", async () => {
    const { user } = renderMcpDialog();
    const sidebarServer = screen.getByText("serena");
    const nameInput = screen.getByLabelText("Name");

    await user.clear(nameInput);
    await user.type(nameInput, "serena-renamed");

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(sidebarServer).toHaveTextContent("serena");
    expect(screen.queryByText("serena-renamed")).not.toBeInTheDocument();
  });

  it("shows an unsaved changes dialog before switching servers", async () => {
    const { user } = renderMcpDialog();

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "serena-renamed");
    await user.click(screen.getByText("github"));

    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
  });

  it("shows global-off server switches as disabled and unchecked", async () => {
    const { user } = renderMcpDialog();

    await user.click(screen.getByText("Enable MCP globally"));

    const firstServerSwitch = screen.getByRole("switch", {
      name: "serena MCP server",
    });

    expect(firstServerSwitch).toBeDisabled();
    expect(firstServerSwitch).toHaveAttribute("data-state", "unchecked");
  });

  it("expands and collapses the selected MCP server without changing enablement", async () => {
    const { user } = renderMcpDialog();
    const serverSwitch = screen.getByRole("switch", {
      name: "serena MCP server",
    });
    const serverRow = serverSwitch.closest('[role="button"]');

    expect(serverRow).toBeInstanceOf(HTMLElement);
    expect(serverSwitch).toHaveAttribute("data-state", "checked");
    expect(
      screen.getByRole("button", { name: "Expand serena tools" }),
    ).toBeInTheDocument();

    await user.click(serverRow as HTMLElement);

    expect(serverSwitch).toHaveAttribute("data-state", "checked");
    expect(
      screen.getByRole("button", { name: "Collapse serena tools" }),
    ).toBeInTheDocument();

    await user.click(serverRow as HTMLElement);

    expect(serverSwitch).toHaveAttribute("data-state", "checked");
    expect(
      screen.getByRole("button", { name: "Expand serena tools" }),
    ).toBeInTheDocument();
  });

  it("selects and expands an unselected MCP server with one row click", async () => {
    const { user } = renderMcpDialog();

    await user.click(screen.getByText("github"));

    expect(screen.getByLabelText("Name")).toHaveValue("github");
    expect(
      screen.getByRole("button", { name: "Collapse github tools" }),
    ).toBeInTheDocument();
  });

  it("changes MCP server enablement only through its switch", async () => {
    const { user } = renderMcpDialog();
    const serverSwitch = screen.getByRole("switch", {
      name: "serena MCP server",
    });

    await user.click(serverSwitch);

    expect(serverSwitch).toHaveAttribute("data-state", "unchecked");
  });

  it("renders MCP tool visibility switches without the old permission label", () => {
    renderMcpDialog();

    expect(screen.queryByText("Permission in Tools")).not.toBeInTheDocument();
    expect(screen.getByText("edit_memory")).toBeInTheDocument();
    expect(screen.getByText("mcp_serena_edit_memory")).toBeInTheDocument();
  });

  it("keeps discovered tool visibility guidance in the info tooltip", () => {
    renderMcpDialog();

    expect(screen.getByLabelText("Discovered tools info")).toBeInTheDocument();
  });

  it("offers a server reload action instead of the old refresh-only action", async () => {
    const { user } = renderMcpDialog();

    await user.click(screen.getByTitle("MCP server options"));

    expect(screen.getByRole("menuitem", { name: "Reload server" })).toBeEnabled();
    expect(screen.queryByText("Refresh tools")).not.toBeInTheDocument();
  });

  it("uses Create and Cancel actions for a new unchanged server", async () => {
    const { user } = renderMcpDialog();

    await user.click(screen.getByRole("button", { name: "Add server" }));

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("does not show discard changes for an untouched new server", async () => {
    const { user } = renderMcpDialog();

    await user.click(screen.getByRole("button", { name: "Add server" }));
    await user.click(screen.getByText("github"));

    expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument();
  });

  it("allows typing incomplete environment variable lines before they become valid", async () => {
    const { user } = renderMcpDialog();
    const envTextarea = screen.getByLabelText("Environment variables");

    fireEvent.change(envTextarea, { target: { value: "A" } });

    expect(screen.getByLabelText("Environment variables")).toBe(envTextarea);
    expect(envTextarea).toHaveValue("A");

    fireEvent.change(envTextarea, { target: { value: "API_KEY=" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(readRenderedMcpSettings().servers[0].env).toEqual({
      API_KEY: "",
    });
  });

  it("preserves blank arg lines while editing but stores only real args", async () => {
    const { user } = renderMcpDialog();
    const argsTextarea = screen.getByLabelText("Args, one per line");

    fireEvent.change(argsTextarea, { target: { value: "--foo\n\n--bar" } });

    expect(screen.getByLabelText("Args, one per line")).toBe(argsTextarea);
    expect(argsTextarea).toHaveValue("--foo\n\n--bar");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(readRenderedMcpSettings().servers[0].args).toEqual([
      "--foo",
      "--bar",
    ]);
  });

  it("restores saved multiline values when resetting raw edits", async () => {
    const settings = createSettings();
    settings.servers[0].args = ["--saved"];
    settings.servers[0].env = { API_KEY: "saved" };
    const { user } = renderMcpDialog(settings);

    const argsTextarea = screen.getByLabelText("Args, one per line");
    const envTextarea = screen.getByLabelText("Environment variables");
    await user.clear(argsTextarea);
    await user.type(argsTextarea, "--draft{enter}{enter}");
    await user.clear(envTextarea);
    await user.type(envTextarea, "INCOMPLETE");

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByLabelText("Args, one per line")).toHaveValue("--saved");
    expect(screen.getByLabelText("Environment variables")).toHaveValue(
      "API_KEY=saved",
    );
  });
});
