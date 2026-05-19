import { memo } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { labelForError } from "@/lib/ai-chat/chat-utils";
import { saveSystemPrompt } from "@/lib/ai-chat/storage";

type SystemPromptDialogProps = {
  open: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
  showSuccess: (message: string) => void;
  showError: (title: string, description?: string) => void;
};

export const SystemPromptDialog = memo(function SystemPromptDialog({
  open,
  value,
  onOpenChange,
  onValueChange,
  showSuccess,
  showError,
}: SystemPromptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <DialogTitle>System prompt</DialogTitle>
          <DialogDescription>
            Define the instruction sent before every chat message. Leave it empty
            to send no system prompt.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <Textarea
            id="system-prompt"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            className="min-h-[320px] resize-y leading-6"
            placeholder="You are a helpful assistant."
          />
        </div>

        <DialogFooter className="shrink-0 border-t px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            className="rounded-lg"
            onClick={() => onValueChange("You are a helpful assistant.")}
          >
            Reset
          </Button>
          <Button
            type="button"
            className="rounded-lg"
            onClick={async () => {
              try {
                await saveSystemPrompt(value);
                showSuccess("System prompt saved.");
                onOpenChange(false);
              } catch (error) {
                console.error("Failed to save system prompt:", error);
                showError("Failed to save system prompt", labelForError(error));
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
