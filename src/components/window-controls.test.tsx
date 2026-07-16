import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WindowControls } from "@/components/window-controls";

const originalDesktop = window.moltenForgeDesktop;

afterEach(() => {
  Object.defineProperty(window, "moltenForgeDesktop", {
    configurable: true,
    writable: true,
    value: originalDesktop,
  });
});

describe("WindowControls", () => {
  it("renders custom controls and forwards window actions", async () => {
    let onStateChange: ((state: { maximized: boolean; fullscreen: boolean }) => void) | undefined;
    const minimizeWindow = vi.fn().mockResolvedValue(undefined);
    const toggleMaximizeWindow = vi
      .fn()
      .mockResolvedValue({ maximized: true, fullscreen: false });
    const closeWindow = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(window, "moltenForgeDesktop", {
      configurable: true,
      writable: true,
      value: {
        platform: "win32",
        usesCustomWindowControls: true,
        executeMenuCommand: vi.fn().mockResolvedValue(undefined),
        minimizeWindow,
        toggleMaximizeWindow,
        closeWindow,
        getWindowState: vi
          .fn()
          .mockResolvedValue({ maximized: false, fullscreen: false }),
        setThemeSource: vi.fn().mockResolvedValue({
          source: "system",
          resolved: "dark",
        }),
        onWindowStateChange: vi.fn((callback) => {
          onStateChange = callback;
          return vi.fn();
        }),
      } satisfies NonNullable<Window["moltenForgeDesktop"]>,
    });

    render(<WindowControls />);

    const controls = await screen.findByLabelText("Window controls");
    expect(controls).not.toHaveClass("absolute");
    expect(screen.getByRole("button", { name: "Minimize" })).toHaveClass(
      "h-8",
      "w-8",
    );

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    expect(minimizeWindow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    expect(toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    await screen.findByRole("button", { name: "Restore" });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(closeWindow).toHaveBeenCalledTimes(1);

    act(() => {
      onStateChange?.({ maximized: true, fullscreen: true });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Window controls")).not.toBeInTheDocument();
    });
  });

  it("does not render custom controls when the platform keeps native controls", () => {
    Object.defineProperty(window, "moltenForgeDesktop", {
      configurable: true,
      writable: true,
      value: {
        platform: "darwin",
        usesCustomWindowControls: false,
        executeMenuCommand: vi.fn().mockResolvedValue(undefined),
        minimizeWindow: vi.fn().mockResolvedValue(undefined),
        toggleMaximizeWindow: vi
          .fn()
          .mockResolvedValue({ maximized: false, fullscreen: false }),
        closeWindow: vi.fn().mockResolvedValue(undefined),
        getWindowState: vi
          .fn()
          .mockResolvedValue({ maximized: false, fullscreen: false }),
        setThemeSource: vi.fn().mockResolvedValue({
          source: "system",
          resolved: "light",
        }),
        onWindowStateChange: vi.fn(() => vi.fn()),
      } satisfies NonNullable<Window["moltenForgeDesktop"]>,
    });

    render(<WindowControls />);

    expect(screen.queryByLabelText("Window controls")).not.toBeInTheDocument();
  });
});
