import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const controlClassName =
  "window-control-button app-region-no-drag inline-flex h-8 w-8 items-center justify-center text-muted-foreground";

function MinimizeIcon() {
  return (
    <svg
      className="window-control-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg
      className="window-control-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="14" height="14" rx="1" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg
      className="window-control-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="8" y="4" width="12" height="12" rx="1" />
      <path d="M16 16v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="window-control-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

type WindowState = {
  maximized: boolean;
  fullscreen: boolean;
};

export function WindowControls({
  className,
  onCloseRequest,
}: {
  className?: string;
  onCloseRequest?: () => void;
} = {}) {
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
      data-window-controls
      className={cn(
        "app-region-no-drag pointer-events-auto flex h-8 shrink-0 items-center pr-1",
        className,
      )}
      aria-label="Window controls"
    >
      <button
        type="button"
        className={controlClassName}
        onClick={() => void desktop.minimizeWindow()}
        title="Minimize"
        aria-label="Minimize"
      >
        <MinimizeIcon />
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
        {windowState.maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        className={`${controlClassName} window-control-button-close`}
        onClick={() => {
          if (onCloseRequest) {
            onCloseRequest();
            return;
          }
          void desktop.closeWindow();
        }}
        title="Close"
        aria-label="Close"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
