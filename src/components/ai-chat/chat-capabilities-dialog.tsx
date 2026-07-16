import { BookOpen, Bot, Info, Wrench, X } from "lucide-react";
import { memo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FEATURE_PERMISSION_KEY } from "@/lib/ai-chat/modes";
import { groupToolsBySource } from "@/lib/ai-chat/tool-groups";
import type {
  LoadedAgentInfo,
  LoadedSkillInfo,
  LoadedToolInfo,
  ModeFeaturePermission,
  Permission,
} from "@/lib/ai-chat/types";

type ChatCapabilitiesProps = {
  tools: LoadedToolInfo[];
  toolPermissions: Map<string, Permission>;
  globalToolPermissions: Map<string, Permission>;
  modeToolPermissions?: Map<string, ModeFeaturePermission>;
  skills: LoadedSkillInfo[];
  skillPermissions: Map<string, Permission>;
  globalSkillPermissions: Map<string, Permission>;
  modeSkillPermissions?: Map<string, ModeFeaturePermission>;
  agents: LoadedAgentInfo[];
  agentPermissions: Map<string, Permission>;
  globalAgentPermissions: Map<string, Permission>;
  modeAgentPermissions?: Map<string, ModeFeaturePermission>;
  modeName: string;
};

type ChatCapabilitiesDialogProps = ChatCapabilitiesProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatPermission(permission: Permission) {
  if (permission === "allow") return "Allow";
  if (permission === "ask") return "Ask";
  return "Deny";
}

function PermissionSelect({ value }: { value: Permission }) {
  return (
    <Select value={value} disabled>
      <SelectTrigger
        className="h-8 w-[6.25rem] shrink-0"
        onClick={(event) => event.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="allow">Allow</SelectItem>
        <SelectItem value="ask">Ask</SelectItem>
        <SelectItem value="deny">Deny</SelectItem>
      </SelectContent>
    </Select>
  );
}

function PermissionSourceTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Permission source"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[22rem] text-left">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function permissionSourceText({
  modeName,
  permission,
  globalPermission,
  modePermission,
  modeFeaturePermission,
}: {
  modeName: string;
  permission: Permission;
  globalPermission: Permission;
  modePermission?: ModeFeaturePermission;
  modeFeaturePermission?: ModeFeaturePermission;
}) {
  if (modeFeaturePermission === "global") {
    return `Mode "${modeName}" master uses global: ${formatPermission(globalPermission)}`;
  }
  if (
    modeFeaturePermission === "allow" ||
    modeFeaturePermission === "ask" ||
    modeFeaturePermission === "deny"
  ) {
    return `Mode "${modeName}" master forces: ${formatPermission(modeFeaturePermission)}`;
  }
  if (
    !modePermission ||
    modePermission === "global" ||
    modePermission === "custom"
  ) {
    if (permission === globalPermission)
      return `Uses global setting: ${formatPermission(globalPermission)}`;
    return `Mode "${modeName}" overrides global: ${formatPermission(globalPermission)} → ${formatPermission(permission)}`;
  }
  if (modePermission === globalPermission)
    return `Mode "${modeName}" matches global: ${formatPermission(globalPermission)}`;
  return `Mode "${modeName}" overrides global: ${formatPermission(globalPermission)} → ${formatPermission(permission)}`;
}

function CapabilitySection({
  title,
  icon,
  items,
  permissions,
  globalPermissions,
  modePermissions,
  modeName,
}: {
  title: string;
  icon: ReactNode;
  items: Array<{ name: string; description?: string }>;
  permissions: Map<string, Permission>;
  globalPermissions: Map<string, Permission>;
  modePermissions?: Map<string, ModeFeaturePermission>;
  modeName: string;
}) {
  const visibleItems = items.filter(
    (item) => permissions.get(item.name) !== "deny",
  );
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </Label>
        <span className="text-sm text-muted-foreground">
          {visibleItems.length}
        </span>
      </div>
      <div className="grid gap-1.5">
        {visibleItems.map((item) => {
          const permission = permissions.get(item.name) ?? "ask";
          const globalPermission =
            globalPermissions.get(item.name) ?? permission;
          const modePermission = modePermissions?.get(item.name);
          const modeFeaturePermission = modePermissions?.get(
            FEATURE_PERMISSION_KEY,
          );
          const sourceText = permissionSourceText({
            modeName,
            permission,
            globalPermission,
            modePermission,
            modeFeaturePermission,
          });
          return (
            <div
              key={item.name}
              className="flex min-w-0 items-start gap-3 rounded-sm border border-transparent bg-transparent py-2 transition-colors"
            >
              <span className="mt-1 shrink-0 text-muted-foreground">
                {icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="truncate text-base font-medium leading-6">
                    {item.name}
                  </div>
                  <PermissionSourceTooltip text={sourceText} />
                </div>
                {item.description ? (
                  <div className="mt-0.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
                    {item.description}
                  </div>
                ) : null}
              </div>
              <PermissionSelect value={permission} />
            </div>
          );
        })}
        {visibleItems.length === 0 ? (
          <div className="rounded-sm border border-dashed px-3 py-4 text-sm text-muted-foreground">
            No enabled {title.toLowerCase()}.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ChatCapabilitiesContent({
  tools,
  toolPermissions,
  globalToolPermissions,
  modeToolPermissions,
  skills,
  skillPermissions,
  globalSkillPermissions,
  modeSkillPermissions,
  agents,
  agentPermissions,
  globalAgentPermissions,
  modeAgentPermissions,
  modeName,
}: ChatCapabilitiesProps) {
  const toolGroups = groupToolsBySource(tools)
    .map((group) => ({
      ...group,
      tools: group.tools.filter(
        (tool) => toolPermissions.get(tool.name) !== "deny",
      ),
    }))
    .filter((group) => group.tools.length > 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="grid gap-4">
        {toolGroups.length > 0 ? (
          toolGroups.map((group) => (
            <CapabilitySection
              key={group.id}
              title={group.title}
              icon={<Wrench className="size-4" />}
              items={group.tools}
              permissions={toolPermissions}
              globalPermissions={globalToolPermissions}
              modePermissions={modeToolPermissions}
              modeName={modeName}
            />
          ))
        ) : (
          <CapabilitySection
            title="Tools"
            icon={<Wrench className="size-4" />}
            items={[]}
            permissions={toolPermissions}
            globalPermissions={globalToolPermissions}
            modePermissions={modeToolPermissions}
            modeName={modeName}
          />
        )}
        <CapabilitySection
          title="Skills"
          icon={<BookOpen className="size-4" />}
          items={skills}
          permissions={skillPermissions}
          globalPermissions={globalSkillPermissions}
          modePermissions={modeSkillPermissions}
          modeName={modeName}
        />
        <CapabilitySection
          title="Agents"
          icon={<Bot className="size-4" />}
          items={agents}
          permissions={agentPermissions}
          globalPermissions={globalAgentPermissions}
          modePermissions={modeAgentPermissions}
          modeName={modeName}
        />
      </div>
    </div>
  );
}

export const ChatCapabilitiesDialog = memo(function ChatCapabilitiesDialog({
  open,
  onOpenChange,
  ...props
}: ChatCapabilitiesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden p-0 outline-none focus:outline-none focus-visible:outline-none sm:max-w-[760px]">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>Chat capabilities</DialogTitle>
          <DialogDescription>
            Readonly effective permissions from global settings and the selected
            mode.
          </DialogDescription>
        </DialogHeader>

        <ChatCapabilitiesContent {...props} />
      </DialogContent>
    </Dialog>
  );
});

export const ChatCapabilitiesSidebar = memo(function ChatCapabilitiesSidebar({
  width,
  onClose,
  windowControls,
  ...props
}: ChatCapabilitiesProps & {
  width?: number;
  onClose: () => void;
  windowControls?: ReactNode;
}) {
  return (
    <aside
      className="z-20 flex h-dvh min-w-[560px] shrink-0 flex-col border-l bg-background text-base leading-6 shadow-xl"
      style={{ width: width ?? 680 }}
    >
      <div className="flex min-w-0 items-center border-b">
        <div
          data-right-sidebar-titlebar
          className="app-region-drag flex min-w-0 flex-1 select-none items-center gap-3 py-1 pl-4 pr-2"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">
              Chat capabilities
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={onClose}
            title="Close chat capabilities"
            aria-label="Close chat capabilities"
          >
            <X className="size-4" />
          </Button>
        </div>
        {windowControls}
      </div>
      <ChatCapabilitiesContent {...props} />
    </aside>
  );
});
