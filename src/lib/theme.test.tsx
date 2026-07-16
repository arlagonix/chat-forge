import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/lib/theme";

const originalDesktop = window.moltenForgeDesktop;
const originalMatchMedia = window.matchMedia;

function ThemeControls() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div>
      <span>{`${theme}:${resolvedTheme}`}</span>
      <button type="button" onClick={() => setTheme("dark")}>
        Dark
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

afterEach(() => {
  Object.defineProperty(window, "moltenForgeDesktop", {
    configurable: true,
    writable: true,
    value: originalDesktop,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

describe("ThemeProvider", () => {
  it("synchronizes the stored preference with Electron nativeTheme", async () => {
    const setThemeSource = vi.fn().mockResolvedValue({
      source: "system",
      resolved: "light",
    });

    Object.defineProperty(window, "moltenForgeDesktop", {
      configurable: true,
      writable: true,
      value: {
        platform: "win32",
        usesCustomWindowControls: true,
        executeMenuCommand: vi.fn().mockResolvedValue(undefined),
        minimizeWindow: vi.fn().mockResolvedValue(undefined),
        toggleMaximizeWindow: vi
          .fn()
          .mockResolvedValue({ maximized: false, fullscreen: false }),
        closeWindow: vi.fn().mockResolvedValue(undefined),
        getWindowState: vi
          .fn()
          .mockResolvedValue({ maximized: false, fullscreen: false }),
        setThemeSource,
        onWindowStateChange: vi.fn(() => vi.fn()),
      } satisfies NonNullable<Window["moltenForgeDesktop"]>,
    });

    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(setThemeSource).toHaveBeenCalledWith("system");
    });

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    await waitFor(() => {
      expect(setThemeSource).toHaveBeenLastCalledWith("dark");
      expect(document.documentElement).toHaveClass("dark");
      expect(document.documentElement.style.colorScheme).toBe("dark");
      expect(screen.getByText("dark:dark")).toBeInTheDocument();
    });
  });
});
