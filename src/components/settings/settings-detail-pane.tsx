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
          "settings-detail-pane app-glass-panel-strong h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain chat-message-scrollbar",
          className,
        )}
        {...props}
      >
        <div className="flex min-h-full min-w-0 flex-col">{children}</div>
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
    <header className="sticky top-0 z-20 shrink-0 border-b bg-transparent">
      <div
        className={cn("mx-auto w-full min-w-0", contentWidthClassName, className)}
        {...props}
      />
    </header>
  );
}

export function SettingsDetailContent({
  className,
  ...props
}: ComponentProps<"main">) {
  const contentWidthClassName = useContext(SettingsDetailWidthContext);

  return (
    <main
      className={cn(
        "mx-auto w-full min-w-0 flex-1",
        contentWidthClassName,
        className,
      )}
      {...props}
    />
  );
}

export function SettingsDetailFooter({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogFooter> & { children?: ReactNode }) {
  const contentWidthClassName = useContext(SettingsDetailWidthContext);

  return (
    <footer className="sticky bottom-0 z-20 shrink-0 border-t bg-transparent">
      <DialogFooter
        className={cn("mx-auto w-full min-w-0", contentWidthClassName, className)}
        {...props}
      >
        {children}
      </DialogFooter>
    </footer>
  );
}
