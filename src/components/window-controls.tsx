import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const controlClassName =
  "app-region-no-drag inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

type WindowState = {
  maximized: boolean;
  fullscreen: boolean;
};

export function WindowControls() {
  const desktop = window.moltenForgeDesktop;
  const [windowState, setWindowState] = useState<WindowState>({
    maximized: false,
    fullscreen: false,
  });

  useEffect(() => {
    if (!desktop?.usesCustomWindowControls) return;

    let disposed = false;
    void desktop
      .getWindowState()
      .then((state) => {
        if (!disposed) setWindowState(state);
      })
      .catch(() => {});

    const unsubscribe = desktop.onWindowStateChange((state) => {
      setWindowState(state);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [desktop]);

  if (!desktop?.usesCustomWindowControls || windowState.fullscreen) {
    return null;
  }

  return (
    <div
      className="app-region-no-drag flex h-8 shrink-0 items-center"
      aria-label="Window controls"
    >
      <button
        type="button"
        className={controlClassName}
        onClick={() => void desktop.minimizeWindow()}
        title="Minimize"
        aria-label="Minimize"
      >
        <Minus className="size-3.5" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={controlClassName}
        onClick={() => {
          void desktop
            .toggleMaximizeWindow()
            .then(setWindowState)
            .catch(() => {});
        }}
        title={windowState.maximized ? "Restore" : "Maximize"}
        aria-label={windowState.maximized ? "Restore" : "Maximize"}
      >
        {windowState.maximized ? (
          <Copy className="size-3.5" strokeWidth={1.5} />
        ) : (
          <Square className="size-3.5" strokeWidth={1.5} />
        )}
      </button>
      <button
        type="button"
        className={cn(
          controlClassName,
          "hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white",
        )}
        onClick={() => void desktop.closeWindow()}
        title="Close"
        aria-label="Close"
      >
        <X className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}
