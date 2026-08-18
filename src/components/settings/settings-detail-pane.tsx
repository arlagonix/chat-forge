import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";

import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SettingsDetailWidthContext = createContext<string | undefined>(undefined);

type SettingsDetailPaneProps = ComponentProps<"section"> & {
  contentWidthClassName?: string;
};

export function SettingsDetailPane({
  className,
  contentWidthClassName,
  children,
  ...props
}: SettingsDetailPaneProps) {
  return (
    <SettingsDetailWidthContext.Provider value={contentWidthClassName}>
      <section
        className={cn(
          "settings-detail-pane flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
          className,
        )}
        {...props}
      >
        {children}
      </section>
    </SettingsDetailWidthContext.Provider>
  );
}

export function SettingsDetailHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  const contentWidthClassName = useContext(SettingsDetailWidthContext);

  return (
    <header className="app-glass-card z-20 shrink-0 border-b">
      <div
        className={cn("mx-auto w-full min-w-0", contentWidthClassName, className)}
        {...props}
      />
    </header>
  );
}

export function SettingsDetailContent({
  className,
  children,
  ...props
}: ComponentProps<"main">) {
  const contentWidthClassName = useContext(SettingsDetailWidthContext);

  return (
    <main
      className="app-glass-panel-strong min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain chat-message-scrollbar"
      {...props}
    >
      <div
        className={cn(
          "mx-auto min-h-full w-full min-w-0",
          contentWidthClassName,
          className,
        )}
      >
        {children}
      </div>
    </main>
  );
}

export function SettingsDetailFooter({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogFooter> & { children?: ReactNode }) {
  const contentWidthClassName = useContext(SettingsDetailWidthContext);

  return (
    <footer className="app-glass-card z-20 shrink-0 border-t">
      <DialogFooter
        className={cn("mx-auto w-full min-w-0", contentWidthClassName, className)}
        {...props}
      >
        {children}
      </DialogFooter>
    </footer>
  );
}
