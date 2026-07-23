import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function GroupHeading({
  children,
  className,
  labelClassName,
  action,
  showDivider = true,
}: {
  children: ReactNode;
  className?: string;
  labelClassName?: string;
  action?: ReactNode;
  showDivider?: boolean;
}) {
  return (
    <div className={cn("mt-3 flex items-center gap-2 px-1", className)}>
      <Label
        className={cn(
          "flex items-center gap-2 select-none text-xs font-medium uppercase tracking-wide text-muted-foreground",
          labelClassName,
        )}
      >
        {children}
      </Label>
      {showDivider ? (
        <div className="min-w-0 flex-1 border-t border-border" />
      ) : null}
      {action}
    </div>
  );
}
