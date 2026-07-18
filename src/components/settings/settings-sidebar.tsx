import {
  ArrowLeft,
  Bot,
  BookOpen,
  Cpu,
  Layers3,
  Menu,
  MessageSquareText,
  Network,
  Settings2,
  Wrench,
} from "lucide-react";
import type { ComponentType, PointerEvent as ReactPointerEvent } from "react";

import { AppMenu } from "@/components/app-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SettingsSection =
  | "general"
  | "providers"
  | "modes"
  | "system-prompt"
  | "tools"
  | "skills"
  | "agents"
  | "mcp";

type SettingsSidebarProps = {
  appName: string;
  activeSection: SettingsSection;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  width: number;
  onResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSectionChange: (section: SettingsSection) => void;
  onBackToChat: () => void;
  onCreateNewChat: () => void;
  onCloseWindow: () => void;
};

type NavigationItem = {
  id: SettingsSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "system-prompt", label: "System Prompt", icon: MessageSquareText },
  { id: "providers", label: "Providers", icon: Cpu },
  { id: "modes", label: "Modes", icon: Layers3 },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "skills", label: "Skills", icon: BookOpen },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "mcp", label: "MCP", icon: Network },
];

export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> =
  Object.fromEntries(
    NAVIGATION_ITEMS.map((item) => [item.id, item.label]),
  ) as Record<SettingsSection, string>;

export function SettingsSidebar({
  appName,
  activeSection,
  collapsed,
  onCollapsedChange,
  width,
  onResizePointerDown,
  onSectionChange,
  onBackToChat,
  onCreateNewChat,
  onCloseWindow,
}: SettingsSidebarProps) {
  if (collapsed) return null;

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r bg-card"
      style={{ width }}
    >
      <div
        className="group absolute inset-y-0 right-0 z-20 w-2 translate-x-1/2 cursor-col-resize"
        onPointerDown={onResizePointerDown}
        title="Resize sidebar"
        aria-hidden="true"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div data-sidebar-titlebar className="app-region-drag select-none px-2 py-1">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={() => onCollapsedChange(true)}
            title="Hide sidebar"
            aria-label="Hide sidebar"
          >
            <Menu className="size-4" />
          </Button>

          <h1 className="min-w-0 flex-1 truncate text-base font-semibold leading-6">
            <span className="molten-forge-title truncate">{appName}</span>
          </h1>

          <div className="app-region-no-drag flex shrink-0 items-center">
            <AppMenu
              onCreateNewChat={onCreateNewChat}
              onCloseWindow={onCloseWindow}
              triggerClassName="shrink-0"
            />
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto border-t p-2 chat-scrollbar">
        <div className="grid gap-0.5">
          {NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            const selected = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-sm transition-colors",
                  selected
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
                onClick={() => onSectionChange(item.id)}
                aria-current={selected ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="border-t p-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={onBackToChat}
        >
          <ArrowLeft className="size-4" />
          Back to chat
        </Button>
      </div>
    </aside>
  );
}
