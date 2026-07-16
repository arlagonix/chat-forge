import {
  AppWindow,
  Clipboard,
  Code2,
  Copy,
  Edit3,
  EllipsisVertical,
  FileText,
  Fullscreen,
  LogOut,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RefreshCcw,
  RotateCcw,
  Scissors,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DesktopMenuCommand } from "@/lib/desktop-menu";
import { cn } from "@/lib/utils";

type AppMenuProps = {
  onCreateNewChat: () => void;
  triggerClassName?: string;
};

type WindowState = {
  maximized: boolean;
  fullscreen: boolean;
};

const APP_MENU_ROOT_TEXT_CLASS =
  "[&_[data-slot=dropdown-menu-sub-trigger]]:text-sm";
const APP_MENU_ITEM_TEXT_CLASS =
  "[&_[data-slot=dropdown-menu-item]]:text-sm [&_[data-slot=dropdown-menu-shortcut]]:text-xs [&_[data-slot=dropdown-menu-separator]]:my-1 [&_[data-slot=dropdown-menu-separator]]:min-h-0 [&_[data-slot=dropdown-menu-separator]]:bg-border/70";

function shortcutLabel(platform: NodeJS.Platform | undefined, keys: string) {
  if (platform === "darwin") {
    return keys
      .replaceAll("Ctrl", "⌘")
      .replaceAll("Cmd", "⌘")
      .replaceAll("Shift", "⇧")
      .replaceAll("Alt", "⌥")
      .replaceAll("+", "");
  }
  return keys;
}

export function AppMenu({
  onCreateNewChat,
  triggerClassName,
}: AppMenuProps) {
  const desktop = window.moltenForgeDesktop;
  const platform = desktop?.platform;
  const [windowState, setWindowState] = useState<WindowState>({
    maximized: false,
    fullscreen: false,
  });

  const execute = useCallback(
    (command: DesktopMenuCommand) => {
      void desktop?.executeMenuCommand(command).catch((error) => {
        console.warn(`Failed to execute app menu command: ${command}`, error);
      });
    },
    [desktop],
  );

  const refreshWindowState = useCallback(() => {
    void desktop
      ?.getWindowState()
      .then(setWindowState)
      .catch(() => {});
  }, [desktop]);

  const mod = platform === "darwin" ? "Cmd" : "Ctrl";

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) refreshWindowState();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn("app-region-no-drag", triggerClassName)}
          title="App menu"
          aria-label="App menu"
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn("min-w-44", APP_MENU_ROOT_TEXT_CLASS)}
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FileText className="size-4" />
            File
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={4}
            className={cn("min-w-52", APP_MENU_ITEM_TEXT_CLASS)}
          >
            <DropdownMenuItem onClick={onCreateNewChat}>
              <Plus className="size-4" />
              New chat
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+N`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void desktop?.closeWindow()}>
              <X className="size-4" />
              Close window
              <DropdownMenuShortcut>
                {platform === "darwin" ? "⌘W" : "Alt+F4"}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => execute("quit")}>
              <LogOut className="size-4" />
              Quit
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+Q`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Edit3 className="size-4" />
            Edit
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={4}
            className={cn("min-w-52", APP_MENU_ITEM_TEXT_CLASS)}
          >
            <DropdownMenuItem onClick={() => execute("undo")}>
              <Undo2 className="size-4" />
              Undo
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+Z`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => execute("redo")}>
              <Redo2 className="size-4" />
              Redo
              <DropdownMenuShortcut>
                {shortcutLabel(
                  platform,
                  platform === "darwin" ? "Cmd+Shift+Z" : "Ctrl+Y",
                )}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => execute("cut")}>
              <Scissors className="size-4" />
              Cut
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+X`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => execute("copy")}>
              <Copy className="size-4" />
              Copy
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+C`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => execute("paste")}>
              <Clipboard className="size-4" />
              Paste
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+V`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => execute("delete")}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => execute("select-all")}>
              <MousePointer2 className="size-4" />
              Select all
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+A`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <AppWindow className="size-4" />
            View
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={4}
            className={cn("min-w-56", APP_MENU_ITEM_TEXT_CLASS)}
          >
            <DropdownMenuItem onClick={() => execute("reload")}>
              <RefreshCcw className="size-4" />
              Reload
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+R`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => execute("force-reload")}>
              <RotateCcw className="size-4" />
              Force reload
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+Shift+R`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => execute("toggle-dev-tools")}>
              <Code2 className="size-4" />
              Toggle developer tools
              <DropdownMenuShortcut>
                {platform === "darwin" ? "⌥⌘I" : "Ctrl+Shift+I"}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => execute("reset-zoom")}>
              <Fullscreen className="size-4" />
              Actual size
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+0`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => execute("zoom-in")}>
              <ZoomIn className="size-4" />
              Zoom in
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}++`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => execute("zoom-out")}>
              <ZoomOut className="size-4" />
              Zoom out
              <DropdownMenuShortcut>
                {shortcutLabel(platform, `${mod}+-`)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => execute("toggle-fullscreen")}>
              <Maximize2 className="size-4" />
              {windowState.fullscreen ? "Exit full screen" : "Toggle full screen"}
              <DropdownMenuShortcut>
                {platform === "darwin" ? "⌃⌘F" : "F11"}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <AppWindow className="size-4" />
            Window
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={4}
            className={cn("min-w-48", APP_MENU_ITEM_TEXT_CLASS)}
          >
            <DropdownMenuItem onClick={() => void desktop?.minimizeWindow()}>
              <Minus className="size-4" />
              Minimize
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void desktop
                  ?.toggleMaximizeWindow()
                  .then(setWindowState)
                  .catch(() => {});
              }}
            >
              <Maximize2 className="size-4" />
              {windowState.maximized ? "Restore" : "Maximize"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void desktop?.closeWindow()}>
              <X className="size-4" />
              Close
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
