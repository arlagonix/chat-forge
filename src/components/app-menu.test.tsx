import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppMenu } from "@/components/app-menu";

const originalDesktop = window.moltenForgeDesktop;

function installDesktopMock() {
  const executeMenuCommand = vi.fn().mockResolvedValue(undefined);
  const closeWindow = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(window, "moltenForgeDesktop", {
    configurable: true,
    writable: true,
    value: {
      platform: "win32",
      usesCustomWindowControls: true,
      executeMenuCommand,
      minimizeWindow: vi.fn().mockResolvedValue(undefined),
      toggleMaximizeWindow: vi
        .fn()
        .mockResolvedValue({ maximized: false, fullscreen: false }),
      closeWindow,
      getWindowState: vi
        .fn()
        .mockResolvedValue({ maximized: false, fullscreen: false }),
      setThemeSource: vi.fn().mockResolvedValue({
        source: "system",
        resolved: "dark",
      }),
      onWindowStateChange: vi.fn(() => vi.fn()),
    } satisfies NonNullable<Window["moltenForgeDesktop"]>,
  });

  return { executeMenuCommand, closeWindow };
}

afterEach(() => {
  Object.defineProperty(window, "moltenForgeDesktop", {
    configurable: true,
    writable: true,
    value: originalDesktop,
  });
});

describe("AppMenu", () => {
  it("uses the themed dropdown structure with four submenus", async () => {
    installDesktopMock();
    const user = userEvent.setup();

    render(<AppMenu onCreateNewChat={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "App menu" }));

    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Window" })).toBeInTheDocument();
  });

  it("uses compact submenu spacing", async () => {
    installDesktopMock();
    const user = userEvent.setup();

    render(<AppMenu onCreateNewChat={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "App menu" }));
    await user.hover(screen.getByRole("menuitem", { name: "File" }));

    const newChatItem = await screen.findByRole("menuitem", { name: /New chat/ });
    const submenu = newChatItem.closest(
      '[data-slot="dropdown-menu-sub-content"]',
    );

    expect(submenu).toHaveClass(
      "[&_[data-slot=dropdown-menu-item]]:text-sm",
      "[&_[data-slot=dropdown-menu-separator]]:my-1",
      "[&_[data-slot=dropdown-menu-separator]]:min-h-0",
      "[&_[data-slot=dropdown-menu-separator]]:bg-border/70",
    );
  });

  it("runs app and Electron actions from submenu items", async () => {
    const { executeMenuCommand } = installDesktopMock();
    const onCreateNewChat = vi.fn();
    const user = userEvent.setup();

    render(<AppMenu onCreateNewChat={onCreateNewChat} />);

    await user.click(screen.getByRole("button", { name: "App menu" }));
    await user.hover(screen.getByRole("menuitem", { name: "File" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /New chat/ }));
    expect(onCreateNewChat).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "App menu" }));
    await user.hover(screen.getByRole("menuitem", { name: "View" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Reload/ }));
    expect(executeMenuCommand).toHaveBeenCalledWith("reload");
  });

  it("uses a guarded close callback when one is provided", async () => {
    const { closeWindow } = installDesktopMock();
    const onCloseWindow = vi.fn();
    const user = userEvent.setup();

    render(
      <AppMenu onCreateNewChat={vi.fn()} onCloseWindow={onCloseWindow} />,
    );

    await user.click(screen.getByRole("button", { name: "App menu" }));
    await user.hover(screen.getByRole("menuitem", { name: "File" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Close window/ }),
    );

    expect(onCloseWindow).toHaveBeenCalledTimes(1);
    expect(closeWindow).not.toHaveBeenCalled();
  });
});
