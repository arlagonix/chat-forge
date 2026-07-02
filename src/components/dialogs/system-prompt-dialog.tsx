import { memo, useEffect, useMemo, useState } from "react";

import { CodeEditor } from "@/components/code-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog";
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
  const [draftValue, setDraftValue] = useState(value);
  const [unsavedChangesDialogOpen, setUnsavedChangesDialogOpen] =
    useState(false);
  const hasChanges = useMemo(
    () => draftValue !== value,
    [draftValue, value],
  );

  useEffect(() => {
    if (open) setDraftValue(value);
  }, [open, value]);

  function requestOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    if (hasChanges) {
      setUnsavedChangesDialogOpen(true);
      return;
    }

    setDraftValue(value);
    onOpenChange(false);
  }

  function discardChangesAndClose() {
    setUnsavedChangesDialogOpen(false);
    setDraftValue(value);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent className="flex h-[min(1000px,calc(100dvh-2rem))] max-h-none flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <DialogTitle>System prompt</DialogTitle>
            <DialogDescription>
              Define the instruction sent before every chat message. Leave it
              empty to send no system prompt.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <CodeEditor
              value={draftValue}
              onChange={setDraftValue}
              className="min-h-0 flex-1 rounded-none border-0"
              ariaLabel="System prompt"
            />
          </div>

          <DialogFooter className="shrink-0 border-t px-5 py-3">
            <Button
              type="button"
              variant="secondary"
              disabled={!hasChanges}
              onClick={() => setDraftValue(value)}
            >
              Reset
            </Button>
            <Button
              type="button"
              disabled={!hasChanges}
              onClick={async () => {
                try {
                  await saveSystemPrompt(draftValue);
                  onValueChange(draftValue);
                  showSuccess("System prompt saved.");
                  onOpenChange(false);
                } catch (error) {
                  console.error("Failed to save system prompt:", error);
                  showError(
                    "Failed to save system prompt",
                    labelForError(error),
                  );
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UnsavedChangesDialog
        open={unsavedChangesDialogOpen}
        onCancel={() => setUnsavedChangesDialogOpen(false)}
        onDiscard={discardChangesAndClose}
      />
    </>
  );
});
