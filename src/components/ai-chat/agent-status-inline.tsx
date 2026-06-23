import { Check, X } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import type { AgentCallStatus } from "@/lib/ai-chat/types";

export function AgentStatusInline({
  status,
  label,
}: {
  status: AgentCallStatus;
  label?: string;
}) {
  if (status === "failed") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-red-600 dark:text-red-400"
        aria-label={label ?? "Agent failed"}
      >
        <X className="size-3.5 shrink-0" />
      </span>
    );
  }

  if (status === "cancelled") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-muted-foreground"
        aria-label={label ?? "Agent cancelled"}
      >
        <X className="size-3.5 shrink-0" />
      </span>
    );
  }

  if (status === "complete") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-muted-foreground/85"
        aria-label={label ?? "Agent complete"}
      >
        <Check className="size-3.5 shrink-0" />
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-400"
      aria-label={
        label ?? (status === "pending" ? "Agent waiting" : "Agent running")
      }
    >
      <Spinner className="size-3.5 shrink-0" />
      {label ? (
        <span className="shrink-0 whitespace-nowrap">{label}</span>
      ) : null}
    </span>
  );
}
