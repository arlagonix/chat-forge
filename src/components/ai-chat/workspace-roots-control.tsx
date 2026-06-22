import { Check, ExternalLink, File, FolderOpen, Lock, Trash2 } from "lucide-react";
import { memo } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ChatWorkspaceRoot } from "@/lib/ai-chat/types";
import { cn } from "@/lib/utils";

type WorkspaceRootsControlProps = {
  activeChatExists: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  roots: ChatWorkspaceRoot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddRoot: () => void;
  onAddFile: () => void;
  onRemoveRoot: (rootId: string) => void;
  onOpenRoot: (root: ChatWorkspaceRoot) => void;
};

function isAutomaticRoot(root: ChatWorkspaceRoot) {
  return root.automatic === true || root.kind === "system" || root.id === "chat" || root.id.startsWith("skill:");
}

function isManualFolderRoot(root: ChatWorkspaceRoot) {
  return !isAutomaticRoot(root) && root.pathKind !== "file";
}

export const WorkspaceRootsControl = memo(function WorkspaceRootsControl({
  activeChatExists,
  disabled,
  readOnly = false,
  roots,
  open,
  onOpenChange,
  onAddRoot,
  onAddFile,
  onRemoveRoot,
  onOpenRoot,
}: WorkspaceRootsControlProps) {
  const manualFolderRoots = roots.filter(isManualFolderRoot);
  const label =
    manualFolderRoots.length === 0
      ? "No paths"
      : manualFolderRoots.length === 1
        ? manualFolderRoots[0].name
        : `${manualFolderRoots.length} paths`;
  const canEdit = activeChatExists && !disabled && !readOnly;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          disabled={!activeChatExists}
          aria-expanded={open}
          className={cn(
            "h-8 max-w-[12rem] shrink-0 justify-start gap-2 overflow-hidden px-2 font-normal",
            manualFolderRoots.length === 0 && "text-muted-foreground",
          )}
          title={
            disabled
              ? "Wait until this chat finishes generating"
              : readOnly
                ? manualFolderRoots.length > 0
                  ? `${label}: view accessible paths for this chat`
                  : "No accessible paths configured for this chat"
              : manualFolderRoots.length > 0
                ? `${label}: manage accessible paths for this chat`
                : "Add accessible files or folders for this chat"
          }
          aria-label="Manage accessible paths for this chat"
        >
          <FolderOpen className="size-4 shrink-0 opacity-70" />
          <span className="min-w-0 truncate font-normal">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden p-0">
        <Command shouldFilter={false}>
          <CommandList>
            <CommandGroup heading="Accessible paths">
              {canEdit ? (
                <>
                  <CommandItem
                    value="add-folder"
                    onSelect={onAddRoot}
                    className="cursor-pointer gap-2 rounded-sm"
                  >
                    <FolderOpen className="size-4 shrink-0" />
                    <span>Add folder...</span>
                  </CommandItem>
                  <CommandItem
                    value="add-file"
                    onSelect={onAddFile}
                    className="cursor-pointer gap-2 rounded-sm"
                  >
                    <File className="size-4 shrink-0" />
                    <span>Add file...</span>
                  </CommandItem>
                </>
              ) : null}
              {roots.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No accessible paths configured.
                </div>
              ) : (
                roots.map((root) => {
                  const isAutomatic = isAutomaticRoot(root);
                  const isFile = root.pathKind === "file";

                  return (
                    <CommandItem
                      key={root.id}
                      value={`${root.name} ${root.path}`}
                      onSelect={() => onOpenRoot(root)}
                      className="min-w-0 cursor-pointer items-start gap-2 rounded-sm"
                      title={root.path}
                    >
                      {isFile ? (
                        <File className="mt-0.5 size-4 shrink-0 opacity-70" />
                      ) : (
                        <Check className="mt-0.5 size-4 shrink-0 opacity-70" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate font-medium">{root.name}</div>
                          {isAutomatic ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                              <Lock className="size-3" />
                              Locked
                            </span>
                          ) : null}
                          <span className="shrink-0 rounded-sm border px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                            {isFile ? "File" : "Folder"}
                          </span>
                        </div>
                        <div className="truncate text-sm text-muted-foreground">{root.path}</div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Open folder"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onOpenRoot(root);
                        }}
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                      {!isAutomatic && canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Clear workspace"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onRemoveRoot(root.id);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
