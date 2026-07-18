import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { SettingsSidebar } from "@/components/settings/settings-sidebar";

function renderSidebar(
  overrides: Partial<ComponentProps<typeof SettingsSidebar>> = {},
) {
  const props: ComponentProps<typeof SettingsSidebar> = {
    appName: "Molten Forge",
    appVersionLabel: "1.16.9",
    activeSection: "general",
    collapsed: false,
    onCollapsedChange: vi.fn(),
    width: 320,
    onResizePointerDown: vi.fn(),
    onSectionChange: vi.fn(),
    onBackToChat: vi.fn(),
    onCreateNewChat: vi.fn(),
    onCloseWindow: vi.fn(),
    ...overrides,
  };

  render(<SettingsSidebar {...props} />);
  return props;
}

describe("SettingsSidebar", () => {
  it("shows flat settings navigation and preserves the app header", () => {
    renderSidebar();

    expect(screen.getByText("Molten Forge")).toBeInTheDocument();
    expect(screen.getByText("1.16.9")).toBeInTheDocument();
    expect(screen.queryByText("AI Configuration")).not.toBeInTheDocument();
    expect(screen.queryByText("Capabilities")).not.toBeInTheDocument();
    expect(screen.queryByText("Integrations")).not.toBeInTheDocument();
    const navigationLabels = screen
      .getAllByRole("button")
      .map((button: HTMLElement) => button.textContent?.trim())
      .filter(Boolean);
    expect(navigationLabels.indexOf("System Prompt")).toBe(
      navigationLabels.indexOf("General") + 1,
    );
    expect(screen.getByRole("button", { name: "App menu" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Settings" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("General").closest("button")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("forwards section, collapse, and back navigation", () => {
    const onCollapsedChange = vi.fn();
    const onSectionChange = vi.fn();
    const onBackToChat = vi.fn();

    renderSidebar({
      onCollapsedChange,
      onSectionChange,
      onBackToChat,
    });

    fireEvent.click(screen.getByRole("button", { name: "Providers" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: /Back to chat/ }));

    expect(onSectionChange).toHaveBeenCalledWith("providers");
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    expect(onBackToChat).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while collapsed", () => {
    const { container } = render(
      <SettingsSidebar
        appName="Molten Forge"
        appVersionLabel="1.16.9"
        activeSection="general"
        collapsed
        onCollapsedChange={vi.fn()}
        width={320}
        onResizePointerDown={vi.fn()}
        onSectionChange={vi.fn()}
        onBackToChat={vi.fn()}
        onCreateNewChat={vi.fn()}
        onCloseWindow={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
