import { X } from "lucide-react";
import { memo } from "react";

import { Button } from "@/components/ui/button";
import type { ContextUsageDetails } from "@/lib/ai-chat/context-usage";
import { cn } from "@/lib/utils";

export type ContextUsageInfo = ContextUsageDetails;

function formatNumber(value: number | undefined, approximate = false) {
  if (value === undefined || !Number.isFinite(value)) return "—";

  return `${approximate ? "~" : ""}${new Intl.NumberFormat().format(
    Math.round(value),
  )}`;
}

function formatCompact(value: number | undefined, approximate = false) {
  const safeValue =
    value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
  const prefix = approximate ? "~" : "";

  if (safeValue >= 1_000_000) {
    return `${prefix}${Math.round(safeValue / 1_000_000)}M`;
  }

  if (safeValue >= 1_000) {
    return `${prefix}${Math.round(safeValue / 1_000)}k`;
  }

  return `${prefix}${Math.round(safeValue)}`;
}

function formatPercent(value: number | undefined, approximate = false) {
  return value === undefined || !Number.isFinite(value)
    ? "—"
    : `${approximate ? "~" : ""}${Math.min(value, 999).toFixed(1)}%`;
}

function formatMoney(value: number | undefined) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value && Number.isFinite(value) ? value : 0);
}

function getUsageColor(percentage: number | undefined) {
  if (percentage === undefined || !Number.isFinite(percentage)) {
    return "text-muted-foreground";
  }
  if (percentage < 75) return "text-muted-foreground";
  if (percentage < 90) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getUsageBarColor(percentage: number | undefined) {
  if (percentage === undefined || !Number.isFinite(percentage)) {
    return "bg-primary";
  }
  if (percentage < 75) return "bg-primary";
  if (percentage < 90) return "bg-yellow-500";
  return "bg-red-500";
}

function formatField(
  value: number | undefined,
  kind: "count" | "percent",
  approximate = false,
) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return kind === "percent"
    ? formatPercent(value, approximate)
    : formatNumber(value, approximate);
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-4 py-3">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function SegmentLegend({
  label,
  value,
  total,
  className,
}: {
  label: string;
  value: number;
  total: number;
  className: string;
}) {
  const percent = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className={cn("size-2 rounded-full", className)} />
      <span>
        {label} <span className="tabular-nums">{percent.toFixed(0)}%</span>
      </span>
    </div>
  );
}

function ContextUsageModalContent({ usage }: { usage: ContextUsageInfo }) {
  const hasLimit =
    usage.limitTokens !== undefined &&
    Number.isFinite(usage.limitTokens) &&
    usage.limitTokens > 0;
  const usagePercent = usage.usagePercent;
  const progressWidth =
    hasLimit && usagePercent !== undefined
      ? `${Math.min(100, Math.max(0, usagePercent))}%`
      : "0%";
  const breakdown = usage.lastAssistantBreakdown;
  const approximateUsage = usage.isApproximate ?? false;
  const approximateBreakdown = breakdown?.isApproximate ?? false;
  const segments = [
    {
      key: "user",
      label: "User",
      value: usage.distribution.user,
      className: "bg-emerald-500",
    },
    {
      key: "assistant",
      label: "Assistant",
      value: usage.distribution.assistant,
      className: "bg-blue-500",
    },
    {
      key: "tool",
      label: "Tool Calls",
      value: usage.distribution.tool,
      className: "bg-yellow-400",
    },
    {
      key: "other",
      label: "Other",
      value: usage.distribution.other,
      className: "bg-muted-foreground/60",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-muted/50 px-5 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-muted-foreground">Context</span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatNumber(usage.usedTokens, approximateUsage)}
            {hasLimit ? ` / ${formatNumber(usage.limitTokens)}` : ""}
          </span>
        </div>
        {hasLimit ? (
          <>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300",
                  getUsageBarColor(usagePercent),
                )}
                style={{ width: progressWidth }}
              />
            </div>
            <div className="mt-2 text-sm font-medium tabular-nums text-foreground">
              {formatPercent(usagePercent, approximateUsage)} used
            </div>
          </>
        ) : (
          <div className="mt-2 text-sm text-muted-foreground">
            Context limit is unknown.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Messages" value={formatNumber(usage.messagesCount)} />
        <StatCard label="User" value={formatNumber(usage.userMessagesCount)} />
        <StatCard
          label="Assistant"
          value={formatNumber(usage.assistantMessagesCount)}
        />
        <StatCard label="Cost" value={formatMoney(usage.costUsd)} />
      </div>

      <div className="rounded-lg bg-muted/50 px-5 py-4">
        <div className="mb-3 text-sm text-muted-foreground">
          Last Assistant Message
        </div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-3">
          {[
            { label: "Input", value: breakdown?.input, kind: "count" as const },
            {
              label: "Output",
              value: breakdown?.output,
              kind: "count" as const,
            },
            {
              label: "Reasoning",
              value: breakdown?.reasoning,
              kind: "count" as const,
            },
            {
              label: "Cache Read",
              value: breakdown?.cacheRead,
              kind: "count" as const,
            },
            {
              label: "Cache Write",
              value: breakdown?.cacheWrite,
              kind: "count" as const,
            },
            {
              label: "Cache Hit",
              value: usage.cacheHitPercent,
              kind: "percent" as const,
            },
          ].map((item) => (
            <div key={item.label}>
              <div className="text-sm text-muted-foreground">{item.label}</div>
              <div className="mt-1 tabular-nums text-foreground">
                {formatField(
                  item.value,
                  item.kind,
                  item.kind === "count" && approximateBreakdown,
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
          {segments.map((segment) => {
            if (segment.value <= 0 || usage.distributionTotal <= 0) return null;

            return (
              <div
                key={segment.key}
                className={segment.className}
                style={{
                  width: `${(segment.value / usage.distributionTotal) * 100}%`,
                }}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {segments.map((segment) => (
            <SegmentLegend
              key={segment.key}
              label={segment.label}
              value={segment.value}
              total={usage.distributionTotal}
              className={segment.className}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export const ContextUsageIndicator = memo(function ContextUsageIndicator({
  usage,
  onOpen,
}: {
  usage: ContextUsageInfo;
  onOpen?: () => void;
}) {
  const hasLimit =
    usage.limitTokens !== undefined &&
    Number.isFinite(usage.limitTokens) &&
    usage.limitTokens > 0;
  const label = hasLimit
    ? formatPercent(usage.usagePercent, usage.isApproximate)
    : formatCompact(usage.usedTokens, usage.isApproximate);
  const colorClass = getUsageColor(usage.usagePercent);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "context-usage-token-label h-8 shrink-0 px-2 text-sm font-medium leading-none tabular-nums",
        colorClass,
      )}
      onClick={onOpen}
      title="Context usage"
      aria-label="Context usage"
    >
      {label}
    </Button>
  );
});

export const ContextUsageSidebar = memo(function ContextUsageSidebar({
  usage,
  width,
  onClose,
}: {
  usage?: ContextUsageInfo;
  width?: number;
  onClose: () => void;
}) {
  if (!usage) return null;

  return (
    <aside
      className="z-20 flex h-dvh min-w-[560px] shrink-0 flex-col border-l bg-background text-base leading-6 shadow-xl"
      style={{ width: width ?? 620 }}
    >
      <div className="flex min-w-0 items-center gap-3 border-b py-2 pl-4 pr-2">
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          Context usage
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={onClose}
          title="Close context usage"
          aria-label="Close context usage"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 chat-message-scrollbar">
        <ContextUsageModalContent usage={usage} />
      </div>
    </aside>
  );
});
