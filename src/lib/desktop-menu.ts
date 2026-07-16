export const DESKTOP_MENU_COMMANDS = [
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "delete",
  "select-all",
  "reload",
  "force-reload",
  "toggle-dev-tools",
  "reset-zoom",
  "zoom-in",
  "zoom-out",
  "toggle-fullscreen",
  "quit",
] as const;

export type DesktopMenuCommand = (typeof DESKTOP_MENU_COMMANDS)[number];

export function isDesktopMenuCommand(
  value: unknown,
): value is DesktopMenuCommand {
  return (
    typeof value === "string" &&
    (DESKTOP_MENU_COMMANDS as readonly string[]).includes(value)
  );
}
