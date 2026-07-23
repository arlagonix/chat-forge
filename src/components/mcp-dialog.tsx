"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { MarkdownMessage } from "@/components/ai-chat/markdown-message";
import { CodeEditor } from "@/components/code-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog";
import { useMcpSettingsForm } from "@/hooks/use-mcp-settings-form";
import { createMcpExposedToolName } from "@/lib/ai-chat/mcp";
import type {
  McpServerConfig,
  McpSettings,
  McpToolConfig,
  Permission,
  ToolsSettings,
} from "@/lib/ai-chat/types";
import {
  SettingsDetailContent,
  SettingsDetailFooter,
  SettingsDetailHeader,
  SettingsDetailPane,
} from "@/components/settings/settings-detail-pane";
import { cn } from "@/lib/utils";

const TLS_WARNING =
  "Use only for local, self-signed, or corporate-proxy MCP servers you trust.";
const MCP_INFO_CODE_BLOCK_CLASS_NAME =
  "chat-markdown-compact chat-tool-info-codeblock";

function renderJsonCodeBlock(value: unknown) {
  return (
    <MarkdownMessage
      className={MCP_INFO_CODE_BLOCK_CLASS_NAME}
      content={`~~~json\n${JSON.stringify(value ?? {}, null, 2)}\n~~~`}
    />
  );
}

function InfoTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label} info`}
          className="inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={6}
        className="max-w-xs text-sm leading-5"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function FieldLabel({
  htmlFor,
  label,
  description,
}: {
  htmlFor?: string;
  label: string;
  description: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <InfoTooltip label={label}>{description}</InfoTooltip>
    </div>
  );
}

// Keep each CodeMirror instance isolated so editing one raw multiline field
// does not rerender the other editors.
const McpMultilineEditor = memo(function McpMultilineEditor({
  label,
  description,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className: string;
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel label={label} description={description} />
      <CodeEditor
        ariaLabel={label}
        className={className}
        language="plain"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </div>
  );
});

/** A bordered container that acts as a single large switch target. */
function ToggleBlock({
  title,
  description,
  info,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: ReactNode;
  info?: ReactNode;
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
      className="flex cursor-pointer select-none items-center justify-between gap-4 rounded-sm border p-3 transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Label className="cursor-pointer">{title}</Label>
          {info ? <InfoTooltip label={title}>{info}</InfoTooltip> : null}
        </div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      {/* Presentational only — the whole block is the click target. */}
      <Switch
        checked={checked}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none shrink-0"
      />
    </div>
  );
}

type McpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpSettings: McpSettings;
  onMcpSettingsChange: (settings: McpSettings) => void;
  toolsSettings: ToolsSettings;
  onToolsSettingsChange: Dispatch<SetStateAction<ToolsSettings>>;
  showSuccess: (message: string, description?: string) => void;
  showError: (message: string, description?: string) => void;
  embedded?: boolean;
  contentWidthClassName?: string;
  onDirtyChange?: (dirty: boolean) => void;
};

function sortTools(tools?: Record<string, McpToolConfig>) {
  return Object.values(tools ?? {}).sort((left, right) =>
    left.originalName.localeCompare(right.originalName),
  );
}

type SavedMcpToolEntry = {
  server: McpServerConfig;
  tool: McpToolConfig;
  exposedName: string;
};

function getSavedEnabledTools(server: McpServerConfig) {
  return sortTools(server.tools).filter((tool) => tool.enabled);
}

function getSavedToolEntryKey(serverId: string, toolName: string) {
  return `${serverId}:${toolName}`;
}

function getMcpToolSearchText(server: McpServerConfig, tool: McpToolConfig) {
  return [
    server.name,
    server.transport,
    tool.originalName,
    tool.exposedName,
    tool.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getMcpToolPermission(
  settings: ToolsSettings,
  toolName: string,
): Permission {
  return settings.toolPermissions?.[toolName] ?? "ask";
}

function PermissionSelect({
  value,
  onChange,
}: {
  value: Permission;
  onChange: (value: Permission) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as Permission)}
    >
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

export const McpDialog = memo(function McpDialog({
  open,
  onOpenChange,
  mcpSettings,
  onMcpSettingsChange,
  toolsSettings,
  onToolsSettingsChange,
  showSuccess,
  showError,
  embedded = false,
  contentWidthClassName,
  onDirtyChange,
}: McpDialogProps) {
  const {
    activeServer,
    activeServerText,
    busyServerId,
    cancelDiscardUnsavedChanges,
    confirmDiscardUnsavedChanges,
    deleteActiveServer,
    discardNewServer,
    hasChanges,
    isNewServer,
    isSaving,
    loadServerTools,
    mcpEnabled,
    reloadServer,
    requestAddServer,
    requestClose,
    requestSelectServer,
    resetCurrentDraft,
    savedServers,
    selectedServerId,
    setTestResult,
    testResult,
    testServer,
    unsavedChangesDialogOpen,
    updateActiveServer,
    updateActiveServerArgs,
    updateActiveServerEnv,
    updateActiveServerHeaders,
    updateActiveServerToolEnabled,
    updateGlobalEnabled,
    updateServerEnabled,
    saveCurrentDraft,
  } = useMcpSettingsForm({
    open,
    mcpSettings,
    onOpenChange,
    onMcpSettingsChange,
    showSuccess,
    showError,
  });
  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  const [serverSearch, setServerSearch] = useState("");
  const [discoveredToolSearch, setDiscoveredToolSearch] = useState("");
  const [expandedServerIds, setExpandedServerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedToolEntryKey, setSelectedToolEntryKey] = useState<
    string | null
  >(null);

  const activeServerTools = useMemo(
    () => sortTools(activeServer?.tools),
    [activeServer?.tools],
  );

  const filteredActiveServerTools = useMemo(() => {
    const query = discoveredToolSearch.trim().toLowerCase();
    if (!activeServer || !query) return activeServerTools;

    return activeServerTools.filter((tool) =>
      getMcpToolSearchText(activeServer, {
        ...tool,
        exposedName: createMcpExposedToolName(
          activeServer.name,
          tool.originalName,
        ),
      }).includes(query),
    );
  }, [activeServer, activeServerTools, discoveredToolSearch]);

  const visibleSavedServers = useMemo(() => {
    const serverQuery = serverSearch.trim().toLowerCase();

    return savedServers
      .map((server, index) => ({ server, index }))
      .filter(({ server }) =>
        !serverQuery
          ? true
          : [server.name, server.transport, server.url, server.command]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(serverQuery),
      )
      .sort((left, right) => {
        if (left.server.enabled !== right.server.enabled) {
          return left.server.enabled ? -1 : 1;
        }
        return left.index - right.index;
      })
      .map(({ server }) => server);
  }, [savedServers, serverSearch]);

  const selectedSavedToolEntry = useMemo<SavedMcpToolEntry | null>(() => {
    if (!selectedToolEntryKey) return null;

    for (const server of savedServers) {
      for (const tool of getSavedEnabledTools(server)) {
        const entryKey = getSavedToolEntryKey(server.id, tool.originalName);
        if (entryKey !== selectedToolEntryKey) continue;
        const exposedName = createMcpExposedToolName(
          server.name,
          tool.originalName,
        );
        return { server, tool, exposedName };
      }
    }

    return null;
  }, [savedServers, selectedToolEntryKey]);

  useEffect(() => {
    if (!selectedToolEntryKey) return;
    if (!selectedSavedToolEntry) setSelectedToolEntryKey(null);
  }, [selectedSavedToolEntry, selectedToolEntryKey]);

  const toggleServerExpanded = useCallback((serverId: string) => {
    setExpandedServerIds((current) => {
      const next = new Set(current);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  }, []);

  const expandServer = useCallback((serverId: string) => {
    setExpandedServerIds((current) => {
      if (current.has(serverId)) return current;
      const next = new Set(current);
      next.add(serverId);
      return next;
    });
  }, []);

  const selectServerForEditing = useCallback(
    (serverId: string) => {
      setSelectedToolEntryKey(null);
      requestSelectServer(serverId);
    },
    [requestSelectServer],
  );

  const activateServer = useCallback(
    (serverId: string, isSelected: boolean) => {
      if (isSelected) {
        toggleServerExpanded(serverId);
        return;
      }

      expandServer(serverId);
      selectServerForEditing(serverId);
    },
    [expandServer, selectServerForEditing, toggleServerExpanded],
  );

  const setMcpToolPermission = useCallback(
    (toolName: string, permission: Permission) => {
      onToolsSettingsChange((current) => ({
        ...current,
        permissionModelVersion: 2,
        toolPermissions: {
          ...(current.toolPermissions ?? {}),
          [toolName]: permission,
        },
      }));
    },
    [onToolsSettingsChange],
  );

  function renderSavedToolDetails(entry: SavedMcpToolEntry) {
    return (
      <>
        <SettingsDetailHeader className="flex items-center px-4 py-2.5">
          <Label className="min-h-8 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            MCP tool
          </Label>
        </SettingsDetailHeader>
        <SettingsDetailContent className="px-4 py-4">
          <div className="grid gap-5 pb-1">
            <div className="grid gap-1">
              <h3 className="min-w-0 break-all text-lg font-semibold text-foreground">
                {entry.tool.originalName}
              </h3>
              <p className="max-w-2xl text-base leading-6 text-muted-foreground">
                {entry.tool.description || "No description."}
              </p>
            </div>

            <div className="grid gap-1 text-sm leading-5">
              <Label>Generated tool name</Label>
              <div className="break-all font-mono text-muted-foreground">
                {entry.exposedName}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Input schema</Label>
              {renderJsonCodeBlock(entry.tool.inputSchema ?? {})}
            </div>
          </div>
        </SettingsDetailContent>
      </>
    );
  }

  // The saved-server sidebar does not depend on raw form text. Keeping the
  // element stable avoids rebuilding the full server/tool list per keystroke.
  const sidebar = useMemo(
    () => (
      <aside className="flex min-h-0 flex-col border-b bg-card md:border-b-0 md:border-r">
        <div className="shrink-0 border-b border-border bg-card p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={serverSearch}
              onChange={(event) => setServerSearch(event.target.value)}
              placeholder="Search MCP servers"
              aria-label="Search MCP servers"
              autoFocus={false}
              className="h-9 pl-8 pr-8"
            />
            {serverSearch ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setServerSearch("")}
                title="Clear server search"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            role="button"
            tabIndex={0}
            className="flex cursor-pointer items-center justify-between gap-3 border-b border-border bg-transparent px-2 py-2 text-base outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => updateGlobalEnabled(!mcpEnabled)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                updateGlobalEnabled(!mcpEnabled);
              }
            }}
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-medium select-none min-h-8">
                Enable MCP globally
                <InfoTooltip label="Enable MCP globally">
                  Master switch for MCP. When disabled, all server
                  switches appear off and all MCP tools stay out of model
                  context, but saved values are preserved.
                </InfoTooltip>
              </span>
            </span>
            <Switch
              checked={mcpEnabled}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={updateGlobalEnabled}
              className="shrink-0 cursor-pointer"
            />
          </div>

          <div>
            {visibleSavedServers.map((server) => {
              const savedEnabledTools = getSavedEnabledTools(server);
              const visibleTools = savedEnabledTools;
              const toolCount = savedEnabledTools.length;
              const serverSwitchChecked = mcpEnabled
                ? server.enabled
                : false;
              const expanded = expandedServerIds.has(server.id);
              const isSelectedServer =
                !isNewServer &&
                !selectedSavedToolEntry &&
                selectedServerId === server.id;

              return (
                <div key={server.id} className="border-b last:border-b-0">
                  <div
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "group flex min-w-0 cursor-pointer select-none items-start gap-2 px-2 py-2 outline-none transition-colors",
                      isSelectedServer
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/60",
                      !server.enabled && "opacity-70",
                    )}
                    onClick={() =>
                      activateServer(server.id, isSelectedServer)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        activateServer(server.id, isSelectedServer);
                      }
                    }}
                  >
                    <button
                      type="button"
                      className="mt-[3px] inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleServerExpanded(server.id);
                      }}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${server.name} tools`}
                      title={`${expanded ? "Collapse" : "Expand"} tools`}
                    >
                      {expanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-medium leading-6">
                        {server.name}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {server.transport} · {toolCount} active tool
                        {toolCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Switch
                      aria-label={`${server.name} MCP server`}
                      checked={serverSwitchChecked}
                      disabled={!mcpEnabled}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={(checked) =>
                        updateServerEnabled(server.id, checked)
                      }
                      className="mt-0.5 shrink-0 cursor-pointer"
                      title={
                        server.enabled
                          ? "Disable MCP server"
                          : "Enable MCP server"
                      }
                    />
                  </div>

                  {expanded && visibleTools.length > 0 ? (
                    <div className="grid gap-0">
                      {visibleTools.map((tool) => {
                        const exposedName = createMcpExposedToolName(
                          server.name,
                          tool.originalName,
                        );
                        const entryKey = getSavedToolEntryKey(
                          server.id,
                          tool.originalName,
                        );
                        const selected =
                          selectedSavedToolEntry?.server.id ===
                            server.id &&
                          selectedSavedToolEntry.tool.originalName ===
                            tool.originalName;
                        return (
                          <div
                            key={entryKey}
                            role="button"
                            tabIndex={0}
                            className={cn(
                              "group flex min-w-0 cursor-pointer items-start gap-2 px-2 py-2 outline-none transition-colors",
                              selected
                                ? "bg-accent text-accent-foreground"
                                : "hover:bg-muted/60",
                            )}
                            onClick={() => {
                              if (hasChanges) return;
                              setSelectedToolEntryKey(entryKey);
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" ||
                                event.key === " "
                              ) {
                                event.preventDefault();
                                if (!hasChanges)
                                  setSelectedToolEntryKey(entryKey);
                              }
                            }}
                            title={
                              hasChanges
                                ? "Save or reset changes before viewing tool details."
                                : tool.description
                            }
                          >
                            <Wrench className="mt-1 size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base leading-6">
                                {tool.originalName}
                              </div>
                              <div className="mt-0.5 break-all font-mono text-sm leading-5 text-muted-foreground">
                                {exposedName}
                              </div>
                              {tool.description ? (
                                <div className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                                  {tool.description}
                                </div>
                              ) : null}
                            </div>
                            <PermissionSelect
                              value={getMcpToolPermission(
                                toolsSettings,
                                exposedName,
                              )}
                              onChange={(permission) =>
                                setMcpToolPermission(
                                  exposedName,
                                  permission,
                                )
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {savedServers.length === 0 && (
              <div className="m-2 rounded-sm border border-dashed px-3 py-4 text-center text-base text-muted-foreground">
                No MCP servers configured.
              </div>
            )}

            {savedServers.length > 0 &&
              visibleSavedServers.length === 0 && (
                <div className="m-2 rounded-sm border border-dashed px-3 py-4 text-center text-base text-muted-foreground">
                  No MCP servers match your search.
                </div>
              )}
          </div>
        </div>

        <div className="shrink-0 border-t bg-card p-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-[36px] w-full"
            onClick={() => {
              setSelectedToolEntryKey(null);
              requestAddServer();
            }}
          >
            <Plus className="size-4" />
            Add server
          </Button>
        </div>
      </aside>
    ),
    [
      activateServer,
      expandedServerIds,
      isNewServer,
      mcpEnabled,
      requestAddServer,
      savedServers.length,
      selectedSavedToolEntry,
      selectedServerId,
      serverSearch,
      setMcpToolPermission,
      toggleServerExpanded,
      toolsSettings,
      updateGlobalEnabled,
      updateServerEnabled,
      visibleSavedServers,
    ],
  );

  return (
    <>
      <Dialog embedded={embedded} open={open} onOpenChange={requestClose}>
        <DialogContent
          className="flex h-[min(1000px,calc(100dvh-2rem))] max-h-none flex-col gap-0 overflow-hidden p-0 outline-none focus:outline-none focus-visible:ring-0 sm:max-w-6xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            window.requestAnimationFrame(() => {
              const activeElement =
                document.activeElement as HTMLElement | null;
              if (activeElement?.closest?.('[data-slot="dialog-content"]')) {
                activeElement.blur();
              }
            });
          }}
          onInteractOutside={(event) => {
            // Toasts render outside the dialog (at the app root). Selecting or
            // clicking toast text must not be treated as an outside click that
            // closes the modal.
            const target = event.target as HTMLElement | null;
            if (target?.closest?.("[data-sonner-toaster]")) {
              event.preventDefault();
            }
          }}
        >
          {!embedded ? (
            <DialogHeader className="shrink-0 border-b p-4 pr-12">
              <DialogTitle>MCP</DialogTitle>
            </DialogHeader>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[400px_minmax(0,1fr)]">
            {sidebar}

            <SettingsDetailPane contentWidthClassName={contentWidthClassName}>
              {selectedSavedToolEntry ? (
                renderSavedToolDetails(selectedSavedToolEntry)
              ) : activeServer ? (
                <>
                  <SettingsDetailHeader className="flex items-center px-4 py-2.5">
                    <div className="flex w-full items-center justify-between gap-4">
                      <div>
                        <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground min-h-8">
                          {isNewServer ? "New MCP server" : "Edit MCP server"}
                        </Label>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="MCP server options"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            disabled={busyServerId === activeServer.id}
                            onSelect={() => void testServer(activeServer)}
                          >
                            <Wand2 className="size-4" />
                            Test connection
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              busyServerId === activeServer.id ||
                              isNewServer ||
                              hasChanges ||
                              !activeServer.enabled
                            }
                            onSelect={() => void reloadServer(activeServer)}
                          >
                            <RefreshCw className="size-4" />
                            Reload server
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {isNewServer ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={discardNewServer}
                            >
                              <Trash2 className="size-4 text-destructive" />
                              Discard
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={deleteActiveServer}
                            >
                              <Trash2 className="size-4 text-destructive" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </SettingsDetailHeader>

                  <SettingsDetailContent className="px-4 py-4">
                    <div className="grid gap-5 pb-1">
                      {testResult &&
                        testResult.serverId === activeServer.id && (
                          <div
                            role={testResult.ok ? "status" : "alert"}
                            className={cn(
                              "relative grid gap-1 rounded-sm border px-3 py-2.5 pr-9 text-sm",
                              testResult.ok
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-destructive/40 bg-destructive/10 text-destructive",
                            )}
                          >
                            <div className="flex items-center gap-2 font-medium">
                              {testResult.ok ? (
                                <CheckCircle2 className="size-4 shrink-0" />
                              ) : (
                                <AlertTriangle className="size-4 shrink-0" />
                              )}
                              {testResult.title}
                            </div>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/80 select-text">
                              {testResult.message}
                            </pre>
                            <button
                              type="button"
                              onClick={() => setTestResult(null)}
                              className="absolute right-2 top-2 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
                              title="Dismiss"
                              aria-label="Dismiss test result"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        )}
                      <div className="grid gap-2">
                        <FieldLabel
                          htmlFor="mcp-server-name"
                          label="Name"
                          description="Display name used for this server and its generated MCP tool names. Must be unique, 1–48 characters, using letters, numbers, underscores, or hyphens."
                        />
                        <Input
                          id="mcp-server-name"
                          value={activeServer.name}
                          onChange={(event) =>
                            updateActiveServer({ name: event.target.value })
                          }
                          placeholder="github"
                        />
                        <div className="text-sm text-muted-foreground">
                          Use 1–48 letters, numbers, underscores, or hyphens.
                          Names are unique case-insensitively.
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <FieldLabel
                          label="Transport"
                          description="Connection type. Stdio starts a local process; HTTP connects to a Streamable HTTP MCP endpoint."
                        />
                        <Select
                          value={activeServer.transport}
                          onValueChange={(transport) =>
                            updateActiveServer({
                              transport:
                                transport === "http" ? "http" : "stdio",
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="stdio">stdio</SelectItem>
                            <SelectItem value="http">
                              HTTP / Streamable HTTP
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {activeServer.transport === "stdio" ? (
                        <>
                          <div className="grid gap-2">
                            <FieldLabel
                              label="Command"
                              description="Executable used to start a stdio MCP server, such as npx, node, python, uvx, or a full path."
                            />
                            <Input
                              placeholder="npx"
                              value={activeServer.command ?? ""}
                              onChange={(event) =>
                                updateActiveServer({
                                  command: event.target.value,
                                })
                              }
                            />
                          </div>

                          <McpMultilineEditor
                            label="Args, one per line"
                            description="Arguments passed to the command. Put each argument on a separate line."
                            className="h-24"
                            placeholder={
                              "-y\n@modelcontextprotocol/server-filesystem\nC:/Users/..."
                            }
                            value={activeServerText?.args ?? ""}
                            onChange={updateActiveServerArgs}
                          />

                          <div className="grid gap-2">
                            <FieldLabel
                              label="Working directory"
                              description="Folder where the command runs. Use it when the server expects local config files or project-relative paths."
                            />
                            <Input
                              value={activeServer.cwd ?? ""}
                              onChange={(event) =>
                                updateActiveServer({
                                  cwd: event.target.value || undefined,
                                })
                              }
                            />
                          </div>

                          <McpMultilineEditor
                            label="Environment variables"
                            description="KEY=value entries passed to the server process. Use for API keys, tokens, secrets, flags, or environment-based config."
                            className="h-20"
                            placeholder="API_KEY=..."
                            value={activeServerText?.env ?? ""}
                            onChange={updateActiveServerEnv}
                          />
                        </>
                      ) : (
                        <>
                          <div className="grid gap-2">
                            <FieldLabel
                              label="URL"
                              description="Streamable HTTP MCP endpoint for this server, for example a local or remote /mcp URL."
                            />
                            <Input
                              placeholder="http://localhost:3000/mcp"
                              value={activeServer.url ?? ""}
                              onChange={(event) =>
                                updateActiveServer({ url: event.target.value })
                              }
                            />
                          </div>

                          <McpMultilineEditor
                            label="Headers"
                            description="HTTP headers sent to the server. Put one key=value entry per line, for example Authorization=Bearer ..."
                            className="h-20"
                            placeholder="Authorization=Bearer ..."
                            value={activeServerText?.headers ?? ""}
                            onChange={updateActiveServerHeaders}
                          />
                        </>
                      )}

                      <div className="grid gap-2">
                        <FieldLabel
                          label="Timeout, ms"
                          description="Maximum time to wait for startup, tool discovery, and tool calls before failing."
                        />
                        <Input
                          type="number"
                          min={1000}
                          value={activeServer.timeoutMs}
                          onChange={(event) =>
                            updateActiveServer({
                              timeoutMs: Number(event.target.value) || 60_000,
                            })
                          }
                        />
                      </div>

                      {activeServer.transport === "http" && (
                        <ToggleBlock
                          title="Skip TLS certificate verification"
                          description={TLS_WARNING}
                          info="Disables TLS certificate validation. Useful for trusted local or corporate-proxy servers only."
                          checked={activeServer.insecureSkipTlsVerify ?? false}
                          onCheckedChange={(checked) =>
                            updateActiveServer({
                              insecureSkipTlsVerify: checked,
                            })
                          }
                        />
                      )}

                      <div className="grid gap-3 pt-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-base font-medium leading-6">
                                Discovered tools
                              </h4>
                              <InfoTooltip label="Discovered tools">
                                Tools discovered from this server. Enable a tool
                                here to show it under this MCP server and make
                                it available to model context after saving.
                                Disabled tools stay hidden from model context.
                                Ask, Allow, and Deny are configured from the
                                saved tool rows on the left.
                              </InfoTooltip>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 gap-2"
                            disabled={busyServerId === activeServer.id}
                            onClick={() => void loadServerTools(activeServer)}
                            title="Load tools from this server"
                          >
                            <RefreshCw
                              className={cn(
                                "size-4",
                                busyServerId === activeServer.id &&
                                  "animate-spin",
                              )}
                            />
                            Load tools
                          </Button>
                        </div>

                        {activeServerTools.length > 0 ? (
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={discoveredToolSearch}
                              onChange={(event) =>
                                setDiscoveredToolSearch(event.target.value)
                              }
                              placeholder="Search MCP tools"
                              aria-label="Search MCP tools"
                              autoFocus={false}
                              className="h-9 pl-8 pr-8"
                            />
                            {discoveredToolSearch ? (
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => setDiscoveredToolSearch("")}
                                title="Clear MCP tool search"
                              >
                                <X className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="grid gap-0">
                          {activeServerTools.length === 0 ? (
                            <div className="rounded-sm border border-dashed px-3 py-4 text-center text-base text-muted-foreground">
                              No tools discovered yet. Use Load tools after
                              configuring the server.
                            </div>
                          ) : filteredActiveServerTools.length === 0 ? (
                            <p className="text-sm leading-5 text-muted-foreground">
                              No MCP tools match the search.
                            </p>
                          ) : (
                            filteredActiveServerTools.map((tool) => (
                              <div
                                key={tool.originalName}
                                role="button"
                                aria-pressed={tool.enabled}
                                tabIndex={0}
                                className="cursor-pointer select-none rounded-sm px-2 py-2 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => {
                                  updateActiveServerToolEnabled(
                                    tool.originalName,
                                    !tool.enabled,
                                  );
                                }}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    updateActiveServerToolEnabled(
                                      tool.originalName,
                                      !tool.enabled,
                                    );
                                  }
                                }}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <div className="truncate text-base font-medium leading-6">
                                      {tool.originalName}
                                    </div>
                                    <div className="mt-0.5 break-all font-mono text-sm leading-5 text-muted-foreground">
                                      {createMcpExposedToolName(
                                        activeServer.name,
                                        tool.originalName,
                                      )}
                                    </div>
                                    {tool.description && (
                                      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                        {tool.description}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                                    <Switch
                                      id={`mcp-tool-${activeServer.id}-${tool.originalName}`}
                                      checked={tool.enabled}
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                      onCheckedChange={(checked) =>
                                        updateActiveServerToolEnabled(
                                          tool.originalName,
                                          checked,
                                        )
                                      }
                                      className="shrink-0 cursor-pointer"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </SettingsDetailContent>

                  <SettingsDetailFooter className="items-center px-4 py-2 sm:justify-between">
                    <div
                      className="text-sm text-muted-foreground"
                      aria-live="polite"
                    >
                      {hasChanges ? "Unsaved changes" : null}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetCurrentDraft}
                        disabled={isSaving || (!isNewServer && !hasChanges)}
                      >
                        {isNewServer ? "Cancel" : "Reset"}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void saveCurrentDraft()}
                        disabled={!hasChanges || isSaving}
                      >
                        {isSaving
                          ? isNewServer
                            ? "Creating..."
                            : "Saving..."
                          : isNewServer
                            ? "Create"
                            : "Save"}
                      </Button>
                    </div>
                  </SettingsDetailFooter>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-muted-foreground">
                  <div className="grid max-w-sm gap-2">
                    <div className="text-lg font-medium text-foreground">
                      No MCP server selected
                    </div>
                    <p className="text-base leading-6">
                      Create a server or select one from the list to edit its
                      connection settings.
                    </p>
                  </div>
                </div>
              )}
            </SettingsDetailPane>
          </div>
        </DialogContent>
      </Dialog>

      <UnsavedChangesDialog
        open={unsavedChangesDialogOpen}
        onCancel={cancelDiscardUnsavedChanges}
        onDiscard={confirmDiscardUnsavedChanges}
      />
    </>
  );
});
