import { Save as SaveIcon, Send, X } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { Textarea } from "@/components/ui/textarea";

import { TooltipIconButton } from "./tooltip-icon-button";

export const UserMessageEditor = memo(function UserMessageEditor({
  initialContent,
  disabled,
  onCancel,
  onSave,
  onSubmit,
}: {
  initialContent: string;
  disabled: boolean;
  onCancel: () => void;
  onSave: (content: string) => void | Promise<void>;
  onSubmit: (content: string) => void | Promise<void>;
}) {
  const [content, setContent] = useState(initialContent);
  const trimmedContent = content.trim();

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  function handleSave() {
    if (disabled || !trimmedContent) return;

    void onSave(content);
  }

  function handleSubmit() {
    if (disabled || !trimmedContent) return;

    void onSubmit(content);
  }

  return (
    <div className="grid min-w-0 max-w-full gap-2">
      <article className="flex justify-end">
        <div className="min-w-0 w-full overflow-hidden bg-primary rounded-lg px-4 py-3 text-base leading-6 text-primary-foreground shadow-xs [overflow-wrap:anywhere]">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }

              if ((event.ctrlKey || event.metaKey) && event.key === "s") {
                event.preventDefault();
                handleSave();
              }

              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              }
            }}
            autoFocus
            disabled={disabled}
            className="min-h-[12rem] max-h-[32rem] w-full resize-y rounded-none border-0 !bg-transparent p-0 text-primary-foreground shadow-none outline-none placeholder:text-primary-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-80"
          />
        </div>
      </article>

      <div className="flex justify-end gap-1.5 text-sm leading-5 text-muted-foreground">
        <TooltipIconButton
          type="button"
          variant="ghost"
          size="icon-sm"
          label="Save edit"
          onClick={handleSave}
          disabled={disabled || !trimmedContent}
        >
          <SaveIcon className="size-3" />
        </TooltipIconButton>
        <TooltipIconButton
          type="button"
          variant="ghost"
          size="icon-sm"
          label="Submit edit and regenerate"
          onClick={handleSubmit}
          disabled={disabled || !trimmedContent}
        >
          <Send className="size-3" />
        </TooltipIconButton>
        <TooltipIconButton
          type="button"
          variant="ghost"
          size="icon-sm"
          label="Cancel edit"
          onClick={onCancel}
          disabled={disabled}
        >
          <X className="size-3" />
        </TooltipIconButton>
      </div>
    </div>
  );
});
