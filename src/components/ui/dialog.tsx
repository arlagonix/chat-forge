"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const DialogPresentationContext = React.createContext<"dialog" | "embedded">(
  "dialog",
);

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  embedded?: boolean;
};

function isWindowControlsInteraction(event: {
  target: EventTarget | null;
  detail?: unknown;
}) {
  const directTarget = event.target as HTMLElement | null;
  if (directTarget?.closest?.("[data-window-controls]")) return true;

  const detail = event.detail as
    | { originalEvent?: { target?: EventTarget | null } }
    | undefined;
  const originalTarget = detail?.originalEvent?.target as HTMLElement | null;
  return Boolean(originalTarget?.closest?.("[data-window-controls]"));
}

function Dialog({ embedded = false, children, ...props }: DialogProps) {
  if (embedded) {
    return (
      <DialogPresentationContext.Provider value="embedded">
        {children}
      </DialogPresentationContext.Provider>
    );
  }

  return (
    <DialogPresentationContext.Provider value="dialog">
      <DialogPrimitive.Root data-slot="dialog" {...props}>
        {children}
      </DialogPrimitive.Root>
    </DialogPresentationContext.Provider>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  const presentation = React.useContext(DialogPresentationContext);
  if (presentation === "embedded") return null;
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayStyle,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  overlayStyle?: React.CSSProperties;
  overlayClassName?: string;
}) {
  const presentation = React.useContext(DialogPresentationContext);

  if (presentation === "embedded") {
    return (
      <div
        data-slot="dialog-content"
        className={cn(
          className,
          "relative inset-auto top-auto left-auto z-auto h-full max-h-none min-h-0 w-full max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-none sm:max-w-none",
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} style={overlayStyle} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "glass-surface bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-sm border p-6 shadow-lg duration-200 sm:max-w-4xl",
          className,
        )}
        {...props}
        onPointerDownOutside={(event) => {
          if (isWindowControlsInteraction(event)) {
            event.preventDefault();
          }
          props.onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (isWindowControlsInteraction(event)) {
            event.preventDefault();
          }
          props.onInteractOutside?.(event);
        }}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const presentation = React.useContext(DialogPresentationContext);

  if (presentation === "embedded") {
    return (
      <h1
        data-slot="dialog-title"
        className={cn("text-lg leading-none font-semibold", className)}
      >
        {children}
      </h1>
    );
  }

  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Title>
  );
}

function DialogDescription({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const presentation = React.useContext(DialogPresentationContext);

  if (presentation === "embedded") {
    return (
      <p
        data-slot="dialog-description"
        className={cn("text-muted-foreground text-base", className)}
      >
        {children}
      </p>
    );
  }

  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-base", className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Description>
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
