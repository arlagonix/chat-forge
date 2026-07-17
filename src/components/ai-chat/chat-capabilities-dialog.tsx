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
  ModeSkillFeatureAvailability,
  Permission,
  SkillAvailability,
} from "@/lib/ai-chat/types";

type ChatCapabilitiesProps = {
  tools: LoadedToolInfo[];
  toolPermissions: Map<string, Permission>;
  globalToolPermissions: Map<string, Permission>;
  modeToolPermissions?: Map<string, ModeFeaturePermission>;
  skills: LoadedSkillInfo[];
  skillAvailability: Map<string, SkillAvailability>;
  globalSkillAvailability: Map<string, SkillAvailability>;
  modeSkillAvailability?: Map<string, ModeSkillFeatureAvailability>;
  agents: LoadedAgentInfo[];
  agentPermissions: Map<string, Permission>;
  globalAgentPermissions: Map<string, Permission>;
  modeAgentPermissions?: Map<string, ModeFeaturePermission>;
  modeName: string;
  autoApprove: boolean;
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

function formatSkillAvailability(value: SkillAvailability) {
  return value === "on" ? "On" : "Off";
}

type CapabilityDetail = {
  label: string;
  value: string;
};

function PermissionSourceTooltip({ details }: { details: CapabilityDetail[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Capability details"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[22rem] text-left">
        <div className="grid gap-1">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2"
            >
              <span className="font-medium">{detail.label}:</span>
              <span>{detail.value}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function getModePermissionLabel({
  modePermission,
  modeFeaturePermission,
}: {
  modePermission?: ModeFeaturePermission;
  modeFeaturePermission?: ModeFeaturePermission;
}) {
  if (modeFeaturePermission && modeFeaturePermission !== "custom") {
    return modeFeaturePermission === "global"
      ? "Global"
      : formatPermission(modeFeaturePermission);
  }

  if (modePermission && modePermission !== "custom") {
    return modePermission === "global"
      ? "Global"
      : formatPermission(modePermission);
  }

  return "Global";
}

function permissionSourceDetails({
  modeName,
  permission,
  globalPermission,
  modePermission,
  modeFeaturePermission,
  autoApprove,
}: {
  modeName: string;
  permission: Permission;
  globalPermission: Permission;
  modePermission?: ModeFeaturePermission;
  modeFeaturePermission?: ModeFeaturePermission;
  autoApprove: boolean;
}): CapabilityDetail[] {
  const details: CapabilityDetail[] = [
    { label: "Global", value: formatPermission(globalPermission) },
    {
      label: `Mode "${modeName}"`,
      value: getModePermissionLabel({
        modePermission,
        modeFeaturePermission,
      }),
    },
  ];

  if (autoApprove) {
    details.push({ label: "Auto Approve", value: "On" });
  }

  details.push({ label: "Permission", value: formatPermission(permission) });
  return details;
}

function getModeSkillAvailabilityLabel({
  modeAvailability,
  modeFeatureAvailability,
}: {
  modeAvailability?: ModeSkillFeatureAvailability;
  modeFeatureAvailability?: ModeSkillFeatureAvailability;
}) {
  if (modeFeatureAvailability && modeFeatureAvailability !== "custom") {
    return modeFeatureAvailability === "global"
      ? "Global"
      : formatSkillAvailability(modeFeatureAvailability);
  }

  if (modeAvailability && modeAvailability !== "custom") {
    return modeAvailability === "global"
      ? "Global"
      : formatSkillAvailability(modeAvailability);
  }

  return "Global";
}

function skillAvailabilitySourceDetails({
  modeName,
  availability,
  globalAvailability,
  modeAvailability,
  modeFeatureAvailability,
}: {
  modeName: string;
  availability: SkillAvailability;
  globalAvailability: SkillAvailability;
  modeAvailability?: ModeSkillFeatureAvailability;
  modeFeatureAvailability?: ModeSkillFeatureAvailability;
}): CapabilityDetail[] {
  return [
    { label: "Global", value: formatSkillAvailability(globalAvailability) },
    {
      label: `Mode "${modeName}"`,
      value: getModeSkillAvailabilityLabel({
        modeAvailability,
        modeFeatureAvailability,
      }),
    },
    { label: "Availability", value: formatSkillAvailability(availability) },
  ];
}

function SkillCapabilitySection({
  skills,
  availability,
  globalAvailability,
  modeAvailability,
  modeName,
}: {
  skills: LoadedSkillInfo[];
  availability: Map<string, SkillAvailability>;
  globalAvailability: Map<string, SkillAvailability>;
  modeAvailability?: Map<string, ModeSkillFeatureAvailability>;
  modeName: string;
}) {
  const visibleSkills = skills.filter(
    (skill) => availability.get(skill.name) === "on",
  );
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Skills
        </Label>
        <span className="text-sm text-muted-foreground">
          {visibleSkills.length}
        </span>
      </div>
      <div className="grid gap-1.5">
        {visibleSkills.map((skill) => {
          const value = availability.get(skill.name) ?? "off";
          const globalValue = globalAvailability.get(skill.name) ?? value;
          const modeValue = modeAvailability?.get(skill.name);
          const modeFeatureValue = modeAvailability?.get(
            FEATURE_PERMISSION_KEY,
          );
          return (
            <div
              key={skill.name}
              className="flex min-w-0 items-start gap-3 rounded-sm border border-transparent bg-transparent py-2 transition-colors"
            >
              <span className="mt-1 shrink-0 text-muted-foreground">
                <BookOpen className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="truncate text-base font-medium leading-6">
                    {skill.name}
                  </div>
                  <PermissionSourceTooltip
                    details={skillAvailabilitySourceDetails({
                      modeName,
                      availability: value,
                      globalAvailability: globalValue,
                      modeAvailability: modeValue,
                      modeFeatureAvailability: modeFeatureValue,
                    })}
                  />
                </div>
                {skill.description ? (
                  <div className="mt-0.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
                    {skill.description}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {visibleSkills.length === 0 ? (
          <div className="rounded-sm border border-dashed px-3 py-4 text-sm text-muted-foreground">
            No skills available.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CapabilitySection({
  title,
  icon,
  items,
  permissions,
  globalPermissions,
  modePermissions,
  modeName,
  autoApprove,
}: {
  title: string;
  icon: ReactNode;
  items: Array<{ name: string; description?: string }>;
  permissions: Map<string, Permission>;
  globalPermissions: Map<string, Permission>;
  modePermissions?: Map<string, ModeFeaturePermission>;
  modeName: string;
  autoApprove: boolean;
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
          const sourceDetails = permissionSourceDetails({
            modeName,
            permission,
            globalPermission,
            modePermission,
            modeFeaturePermission,
            autoApprove,
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
                  <PermissionSourceTooltip details={sourceDetails} />
                </div>
                {item.description ? (
                  <div className="mt-0.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
                    {item.description}
                  </div>
                ) : null}
              </div>
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
  skillAvailability,
  globalSkillAvailability,
  modeSkillAvailability,
  agents,
  agentPermissions,
  globalAgentPermissions,
  modeAgentPermissions,
  modeName,
  autoApprove,
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
            <div key={group.id}>
              <CapabilitySection
                title={group.title}
                icon={<Wrench className="size-4" />}
                items={group.tools}
                permissions={toolPermissions}
                globalPermissions={globalToolPermissions}
                modePermissions={modeToolPermissions}
                modeName={modeName}
                autoApprove={autoApprove}
              />
            </div>
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
            autoApprove={autoApprove}
          />
        )}
        <SkillCapabilitySection
          skills={skills}
          availability={skillAvailability}
          globalAvailability={globalSkillAvailability}
          modeAvailability={modeSkillAvailability}
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
          autoApprove={false}
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
            Available tools, skills, and agents for this chat. Hover the info
            icons to inspect how each capability is resolved.
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
