"use client";

import {
  BookOpen,
  Bot,
  Brain,
  Cpu,
  FileText,
  Info,
  Layers3,
  Maximize2,
  MessageSquareText,
  Moon,
  Network,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Type as TypeIcon,
  Wrench,
} from "lucide-react";
import { memo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GroupHeading } from "@/components/ui/group-heading";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  AppFontFamily,
  ChatTitleGenerationMode,
  ChatWidth,
} from "@/lib/ai-chat/types";
import type { ThemePreference } from "@/lib/theme";

function SettingsSwitchRow({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onCheckedChange(!checked)}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          onCheckedChange(!checked);
        }
      }}
      className="flex cursor-pointer select-none items-center justify-between gap-4 border-b p-3 transition-colors last:border-b-0 hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-[5px] text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <div className="text-base font-medium leading-6">{title}</div>
          <div className="text-sm leading-5 text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
      {/* Presentational only — the whole block is the click target. */}
      <Switch
        checked={checked}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none"
      />
    </div>
  );
}

function SettingsSelectRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  options,
  triggerClassName = "h-8 w-[7.5rem] shrink-0",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  triggerClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b p-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-[5px] text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <div className="text-base font-medium leading-6">{title}</div>
          <div className="text-sm leading-5 text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={triggerClassName} aria-label={title}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SettingsGroupedSelectRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  defaultOption,
  groups,
  triggerClassName = "h-8 w-[7.5rem] shrink-0",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  value: string;
  onValueChange: (value: string) => void;
  defaultOption: { value: string; label: string };
  groups: {
    id: string;
    heading: string;
    options: { value: string; label: string }[];
  }[];
  triggerClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b p-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-[5px] text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <div className="text-base font-medium leading-6">{title}</div>
          <div className="text-sm leading-5 text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={triggerClassName} aria-label={title}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" className="min-w-[20rem]">
          <SelectItem value={defaultOption.value}>
            {defaultOption.label}
          </SelectItem>
          {groups.map((group) => (
            <SelectGroup key={group.id}>
              <SelectLabel>{group.heading}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SettingsTextRow({
  icon,
  title,
  description,
  value,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b p-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-[5px] text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <div className="text-base font-medium leading-6">{title}</div>
          <div className="text-sm leading-5 text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
      <span className="shrink-0 text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

function SettingsButtonRow({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-[5px] text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <div className="text-base font-medium leading-6">{title}</div>
          <div className="text-sm leading-5 text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
      <Button type="button" variant="outline" onClick={onClick}>
        {buttonLabel}
      </Button>
    </div>
  );
}

function SettingsActionRow({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto w-full justify-start p-3 text-left"
      onClick={onClick}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-[5px] text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <div className="text-base font-medium leading-6">{title}</div>
          <div className="whitespace-normal text-sm font-normal leading-5 text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
    </Button>
  );
}

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedded?: boolean;
  appVersionLabel: string;
  chatTitleGenerationMode: ChatTitleGenerationMode;
  titleGenerationModelValue: string;
  titleGenerationDefaultModelOption: { value: string; label: string };
  titleGenerationModelGroups: {
    id: string;
    heading: string;
    options: { value: string; label: string }[];
  }[];
  appFontFamily: AppFontFamily;
  thinkingAutoCollapse: boolean;
  renderMarkdownWhileStreaming: boolean;
  chatWidth: ChatWidth;
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  onToggleAiTitleGeneration: (checked: boolean) => void;
  onTitleGenerationModelChange: (value: string) => void;
  onSetTheme: (theme: ThemePreference) => void;
  onSetAppFontFamily: (fontFamily: AppFontFamily) => void;
  onThinkingAutoCollapseChange: (checked: boolean) => void;
  onRenderMarkdownWhileStreamingChange: (checked: boolean) => void;
  onChatWidthChange: (chatWidth: ChatWidth) => void;
  onRestoreDefaults: () => void;
  onOpenProviders: () => void;
  onOpenTools: () => void;
  onOpenSkills: () => void;
  onOpenAgents: () => void;
  onOpenModes: () => void;
  onOpenMcp: () => void;
  onOpenSystemPrompt: () => void;
};

export const SettingsDialog = memo(function SettingsDialog({
  open,
  onOpenChange,
  embedded = false,
  appVersionLabel,
  chatTitleGenerationMode,
  titleGenerationModelValue,
  titleGenerationDefaultModelOption,
  titleGenerationModelGroups,
  appFontFamily,
  thinkingAutoCollapse,
  renderMarkdownWhileStreaming,
  chatWidth,
  theme,
  resolvedTheme,
  onToggleAiTitleGeneration,
  onTitleGenerationModelChange,
  onSetTheme,
  onSetAppFontFamily,
  onThinkingAutoCollapseChange,
  onRenderMarkdownWhileStreamingChange,
  onChatWidthChange,
  onRestoreDefaults,
  onOpenProviders,
  onOpenTools,
  onOpenSkills,
  onOpenAgents,
  onOpenModes,
  onOpenMcp,
  onOpenSystemPrompt,
}: SettingsDialogProps) {
  return (
    <Dialog embedded={embedded} open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          embedded
            ? "grid h-[min(1000px,calc(100dvh-2rem))] grid-rows-[1fr] gap-0 p-0 sm:max-w-3xl"
            : "grid h-[min(1000px,calc(100dvh-2rem))] grid-rows-[auto_1fr] gap-0 p-0 sm:max-w-3xl"
        }
      >
        {!embedded ? (
          <DialogHeader className="border-b px-4 py-4">
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
        ) : null}

        <div
          className={
            embedded
              ? "min-h-0 overflow-y-auto py-4 chat-scrollbar"
              : "min-h-0 overflow-y-auto p-4 chat-scrollbar"
          }
        >
          <div className="grid gap-6">
            {!embedded ? (
              <section className="grid gap-3">
                <GroupHeading className="mt-0">Configuration</GroupHeading>
                <div className="grid gap-2">
                  <SettingsActionRow
                    icon={<Cpu className="size-4" />}
                    title="Providers"
                    description="Manage OpenAI-compatible providers and model settings."
                    onClick={onOpenProviders}
                  />
                  <SettingsActionRow
                    icon={<Wrench className="size-4" />}
                    title="Tools"
                    description="Manage callable tools and their global availability."
                    onClick={onOpenTools}
                  />
                  <SettingsActionRow
                    icon={<BookOpen className="size-4" />}
                    title="Skills"
                    description="Manage reusable context and instructions."
                    onClick={onOpenSkills}
                  />
                  <SettingsActionRow
                    icon={<Bot className="size-4" />}
                    title="Agents"
                    description="Manage delegated agent profiles and permissions."
                    onClick={onOpenAgents}
                  />
                  <SettingsActionRow
                    icon={<Layers3 className="size-4" />}
                    title="Modes"
                    description="Manage chat modes, instructions, and default capabilities."
                    onClick={onOpenModes}
                  />
                  <SettingsActionRow
                    icon={<Network className="size-4" />}
                    title="MCP"
                    description="Connect MCP servers and expose their tools to the model."
                    onClick={onOpenMcp}
                  />
                  <SettingsActionRow
                    icon={<MessageSquareText className="size-4" />}
                    title="System prompt"
                    description="Edit the global default instructions used by the assistant."
                    onClick={onOpenSystemPrompt}
                  />
                </div>
              </section>
            ) : null}

            <section className="grid gap-3">
              <GroupHeading className="mt-0">General</GroupHeading>
              <div className="overflow-hidden rounded-lg border bg-card">
                <SettingsSelectRow
                  icon={
                    resolvedTheme === "light" ? (
                      <Sun className="size-4" />
                    ) : (
                      <Moon className="size-4" />
                    )
                  }
                  title="Theme"
                  description="Choose the app appearance, or follow your system."
                  value={theme}
                  onValueChange={(value) =>
                    onSetTheme(value as ThemePreference)
                  }
                  options={[
                    { value: "system", label: "System" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                />
                <SettingsSelectRow
                  icon={<TypeIcon className="size-4" />}
                  title="Font"
                  description="Choose the regular app font."
                  value={appFontFamily}
                  onValueChange={(value) =>
                    onSetAppFontFamily(value as AppFontFamily)
                  }
                  options={[
                    { value: "sans", label: "Sans" },
                    { value: "mono", label: "Mono" },
                  ]}
                />
                <SettingsSwitchRow
                  icon={<Brain className="size-4" />}
                  title="Auto-collapse thinking"
                  description="Always collapse thinking blocks, including while the model is still reasoning."
                  checked={thinkingAutoCollapse}
                  onCheckedChange={onThinkingAutoCollapseChange}
                />
                <SettingsSwitchRow
                  icon={<FileText className="size-4" />}
                  title="Render Markdown while streaming"
                  description="Render assistant text as Markdown before the response finishes. This looks better for live lists, links, and formatting, but can use more CPU on long or fast responses. Disable it if streaming feels laggy."
                  checked={renderMarkdownWhileStreaming}
                  onCheckedChange={onRenderMarkdownWhileStreamingChange}
                />
                <SettingsSelectRow
                  icon={<Maximize2 className="size-4" />}
                  title="Chat width"
                  description="Set the maximum width of the message column and composer."
                  value={chatWidth}
                  onValueChange={(value) =>
                    onChatWidthChange(value as ChatWidth)
                  }
                  options={[
                    { value: "720", label: "720 px" },
                    { value: "768", label: "768 px" },
                    { value: "896", label: "896 px" },
                    { value: "1024", label: "1024 px" },
                    { value: "full", label: "Full" },
                  ]}
                />
              </div>
            </section>

            <section className="grid gap-3">
              <GroupHeading className="mt-0">Title</GroupHeading>
              <div className="overflow-hidden rounded-lg border bg-card/80">
                <SettingsSwitchRow
                  icon={<SlidersHorizontal className="size-4" />}
                  title="Generate title"
                  description="Automatically generate chat titles with the selected model."
                  checked={chatTitleGenerationMode === "ai"}
                  onCheckedChange={onToggleAiTitleGeneration}
                />
                <SettingsGroupedSelectRow
                  icon={<Cpu className="size-4" />}
                  title="Title model"
                  description="Choose the model used for automatic and manual title generation."
                  value={titleGenerationModelValue}
                  onValueChange={onTitleGenerationModelChange}
                  defaultOption={titleGenerationDefaultModelOption}
                  groups={titleGenerationModelGroups}
                  triggerClassName="h-8 w-[14rem] shrink-0"
                />
              </div>
            </section>

            <section className="grid gap-3">
              <GroupHeading className="mt-0">About</GroupHeading>
              <div className="overflow-hidden rounded-lg border bg-card/80">
                <SettingsTextRow
                  icon={<Info className="size-4" />}
                  title="Version"
                  description="Current version of the app"
                  value={appVersionLabel}
                />
                <SettingsButtonRow
                  icon={<RotateCcw className="size-4" />}
                  title="Restore defaults"
                  description="Restore the default settings."
                  buttonLabel="Restore defaults"
                  onClick={onRestoreDefaults}
                />
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
