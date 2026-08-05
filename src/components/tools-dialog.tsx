import {
  BookOpen,
  Bot,
  Check,
  Copy,
  Download,
  FolderOpen,
  FolderSearch,
  Globe,
  Info,
  ListTodo,
  Lock,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Terminal,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { memo, useEffect, useMemo, useState } from "react";

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
import { GroupHeading } from "@/components/ui/group-heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog";
import { createId, labelForError } from "@/lib/ai-chat/chat-utils";
import { getEffectiveGlobalToolPermission } from "@/lib/ai-chat/request-builder";
import {
  deleteTool as deleteStoredTool,
  exportTool,
  exportTools,
  importTools,
  loadTools,
  openToolsFolder,
  saveTool,
} from "@/lib/ai-chat/storage";
import { runQueuedTool } from "@/lib/ai-chat/tool-execution-queue";
import type {
  FeaturePermission,
  LoadedToolInfo,
  Permission,
  ToolCommandResult,
  ToolExecutionPreview,
  ToolImportResult,
  ToolsSettings,
} from "@/lib/ai-chat/types";
import {
  SettingsDetailContent,
  SettingsDetailFooter,
  SettingsDetailHeader,
  SettingsDetailPane,
} from "@/components/settings/settings-detail-pane";
import { cn } from "@/lib/utils";

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

const TOOL_TEST_STATES_STORAGE_KEY = "molten-forge-tool-test-states";
const TOOL_TEST_STATE_SAVE_DELAY_MS = 350;
const BUILTIN_ASK_USER_TOOL_NAME = "ask_user";
const BUILTIN_ASK_USER_TOOL_ID = "builtin-ask-user";
const BUILTIN_TASK_TOOL_NAMES = ["update_tasks"] as const;
const BUILTIN_TASK_TOOL_META = [
  {
    id: "builtin-update-tasks",
    name: "update_tasks",
    description:
      "Updates the visible task checklist for the current chat by setting the full current list.",
  },
] as const;
const BUILTIN_LOAD_SKILL_TOOL_NAME = "skill";
const BUILTIN_LOAD_SKILL_TOOL_ID = "builtin-load-skill";
const BUILTIN_CALL_AGENT_TOOL_NAME = "call_agent";
const BUILTIN_CALL_AGENT_TOOL_ID = "builtin-call-agent";
const BUILTIN_WEB_FETCH_TOOL_NAME = "web_fetch";
const BUILTIN_WEB_FETCH_TOOL_ID = "builtin-web-fetch";
const BUILTIN_READ_TOOL_NAME = "read";
const BUILTIN_BASH_TOOL_NAME = "bash";
const BUILTIN_EDIT_TOOL_NAME = "edit";
const BUILTIN_WRITE_TOOL_NAME = "write";
const BUILTIN_FILE_FIND_TOOL_NAME = "file_find";
const BUILTIN_FILE_SEARCH_TOOL_NAME = "file_search";
const BUILTIN_FILE_TOOL_NAMES = [
  BUILTIN_READ_TOOL_NAME,
  BUILTIN_BASH_TOOL_NAME,
  BUILTIN_EDIT_TOOL_NAME,
  BUILTIN_WRITE_TOOL_NAME,
  BUILTIN_FILE_FIND_TOOL_NAME,
  BUILTIN_FILE_SEARCH_TOOL_NAME,
];
const BUILTIN_FILE_TOOL_META = [
  {
    id: "builtin-read",
    name: BUILTIN_READ_TOOL_NAME,
    setting: "readEnabled" as const,
    autoApproveSetting: "readAutoApproveEnabled" as const,
    icon: FolderOpen,
    description:
      "Read the contents of a file. Supports text files and images. For text files, output is truncated to 2000 lines or 128KB; use offset/limit for large files.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description:
            "Exact absolute path to the file to read. The path must be inside an accessible path or match an attached file exactly.",
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (1-indexed).",
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to read.",
        },
      },
      required: ["path"],
    },
  },
  {
    id: "builtin-bash",
    name: BUILTIN_BASH_TOOL_NAME,
    setting: "bashEnabled" as const,
    autoApproveSetting: "bashAutoApproveEnabled" as const,
    icon: Terminal,
    description:
      "Execute a bash command from an exact accessible working directory. Uses Pi-style shell resolution, preferring Git Bash on Windows and bash/sh on Unix.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        command: { type: "string", description: "Bash command to execute." },
        cwd: {
          type: "string",
          description:
            "Exact absolute working directory for the command. Must be an accessible folder.",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (optional).",
        },
      },
      required: ["command", "cwd"],
    },
  },
  {
    id: "builtin-edit",
    name: BUILTIN_EDIT_TOOL_NAME,
    setting: "editEnabled" as const,
    autoApproveSetting: "editAutoApproveEnabled" as const,
    icon: FolderOpen,
    description:
      "Edit a single file using exact text replacement. Supports multiple disjoint edits in one call.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description:
            "Exact absolute path to the file to edit. The path must be inside an accessible path.",
        },
        edits: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              oldText: { type: "string" },
              newText: { type: "string" },
            },
            required: ["oldText", "newText"],
          },
        },
      },
      required: ["path", "edits"],
    },
  },
  {
    id: "builtin-write",
    name: BUILTIN_WRITE_TOOL_NAME,
    setting: "writeEnabled" as const,
    autoApproveSetting: "writeAutoApproveEnabled" as const,
    icon: FolderOpen,
    description:
      "Create or overwrite files. Automatically creates parent directories.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description:
            "Exact absolute path to write. The path must be inside an accessible path.",
        },
        content: {
          type: "string",
          description: "Content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    id: "builtin-file-find",
    name: BUILTIN_FILE_FIND_TOOL_NAME,
    icon: FolderOpen,
    description:
      "Find files and folders inside accessible paths. By default, list immediate children; set recursive to true for deep search. Returned absolute paths can be passed directly to read/edit/write.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description: "Optional absolute or relative folder/path to search.",
        },
        query: {
          type: "string",
          description:
            "Optional case-insensitive substring to match against paths and names.",
        },
        include: {
          type: "array",
          items: { type: "string" },
          description: "Optional glob patterns to include.",
        },
        exclude: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional glob/path fragments to exclude in addition to defaults.",
        },
        includeDirectories: {
          type: "boolean",
          description:
            "Whether to include directories. Defaults to true when recursive is false and false when recursive is true.",
        },
        recursive: {
          type: "boolean",
          description:
            "Whether to search recursively under the path. Defaults to false.",
        },
        depth: {
          type: "number",
          description:
            "Optional maximum folder depth. Overrides recursive depth behavior when provided.",
        },
        maxResults: {
          type: "number",
          description: "Maximum results to return. Defaults to 100.",
        },
        respectGitIgnore: {
          type: "boolean",
          description:
            "Whether to respect .gitignore/.ignore/.rgignore. Defaults to true.",
        },
        includeHidden: {
          type: "boolean",
          description:
            "Whether to include hidden files and folders. Defaults to false.",
        },
        includeMetadata: {
          type: "boolean",
          description:
            "Whether to include sizeBytes and modifiedAt for each result. Defaults to false.",
        },
      },
    },
  },
  {
    id: "builtin-file-search",
    name: BUILTIN_FILE_SEARCH_TOOL_NAME,
    icon: FolderSearch,
    description:
      "Search text file contents inside accessible paths. Supports literal search by default, regex when mode is set to regex, and count-only results.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description: "Optional absolute or relative folder/path to search.",
        },
        query: {
          type: "string",
          description: "Text or regex pattern to search for.",
        },
        mode: {
          type: "string",
          enum: ["literal", "regex"],
          description: "Defaults to literal.",
        },
        resultMode: {
          type: "string",
          enum: ["matches", "count"],
          description:
            "Return snippets or only aggregate counts. Defaults to matches.",
        },
        match: {
          type: "string",
          enum: ["contains", "word", "whole"],
          description:
            "Match style. contains is default; word uses word boundaries; whole matches whole lines.",
        },
        include: {
          type: "array",
          items: { type: "string" },
          description: "Optional glob patterns to include.",
        },
        exclude: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional glob/path fragments to exclude in addition to defaults.",
        },
        caseSensitive: {
          type: "boolean",
          description: "Defaults to false.",
        },
        contextLines: {
          type: "number",
          description: "Context lines around matches. Defaults to 0.",
        },
        maxSnippetBytes: {
          type: "number",
          description: "Maximum bytes per returned snippet. Defaults to 2000.",
        },
        maxResults: {
          type: "number",
          description: "Maximum matches to return. Defaults to 100.",
        },
        respectGitIgnore: {
          type: "boolean",
          description:
            "Whether to respect .gitignore/.ignore/.rgignore. Defaults to true.",
        },
        includeHidden: {
          type: "boolean",
          description:
            "Whether to include hidden files and folders. Defaults to false.",
        },
      },
      required: ["query"],
    },
  },
];
const BUILTIN_ASK_USER_TOOL_DESCRIPTION =
  "Pauses the assistant so it can ask focused clarification questions, including single-choice, multi-select, and text answers, then resumes the same response.";
const BUILTIN_ASK_USER_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: ["single_choice", "multi_select", "text"],
            description:
              "single_choice chooses one option, multi_select chooses several options, text asks for a custom-only answer.",
          },
          question: { type: "string" },
          description: { type: "string" },
          options: {
            type: "array",
            description:
              "Required for single_choice and multi_select. Use concise labels and strongly prefer one-sentence descriptions. Do not include Other/custom; Molten Forge adds a custom typed answer option automatically for choice questions.",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: {
                  type: "string",
                  description: "Short option label, usually 1-5 words.",
                },
                description: {
                  type: "string",
                  description:
                    "Strongly recommended one-sentence explanation shown below the label.",
                },
              },
              required: ["id", "label"],
            },
          },
        },
        required: ["id", "type", "question"],
      },
    },
  },
  required: ["questions"],
};
const BUILTIN_TASK_TOOLS_DESCRIPTION =
  "The assistant uses one task list tool (`update_tasks`) to show and update a checklist in the current chat. It always sends the full current list; sending an empty list clears it.";
const BUILTIN_LOAD_SKILL_TOOL_DESCRIPTION =
  "Load a discovered skill by name. Returns the skill's SKILL.md content and reference path so the model can follow skill-specific instructions.";
const BUILTIN_CALL_AGENT_TOOL_DESCRIPTION =
  "Delegates a focused subtask to one enabled agent. The actual runtime schema is rebuilt per chat so agentName is limited to currently available agents.";
const BUILTIN_WEB_FETCH_TOOL_DESCRIPTION =
  "Fetches readable text from a specific HTTP/HTTPS URL. It can read official docs or user-provided links, but it does not search the web.";
const BUILTIN_LOAD_SKILL_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Exact skill name to load from the available skills list.",
    },
  },
  required: ["name"],
};

const TOOL_INFO_CODE_BLOCK_CLASS_NAME =
  "chat-markdown-compact chat-tool-info-codeblock";

function getToolsMasterPermission(settings: ToolsSettings): FeaturePermission {
  return settings.toolsPermission ?? "custom";
}

function getDisplayedToolPermission(
  settings: ToolsSettings,
  toolName: string,
): Permission {
  return getEffectiveGlobalToolPermission(toolName, settings);
}

function PermissionSelect({
  value,
  onChange,
  disabled,
}: {
  value: Permission;
  onChange: (value: Permission) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as Permission)}
      disabled={disabled}
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

function MasterPermissionSelect({
  value,
  onChange,
}: {
  value: FeaturePermission;
  onChange: (value: FeaturePermission) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as FeaturePermission)}
    >
      <SelectTrigger
        className="h-8 w-27 shrink-0"
        onClick={(event) => event.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="custom">Custom</SelectItem>
        <SelectItem value="allow">Allow</SelectItem>
        <SelectItem value="ask">Ask</SelectItem>
        <SelectItem value="deny">Deny</SelectItem>
      </SelectContent>
    </Select>
  );
}

const BUILTIN_CALL_AGENT_TOOL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    agentName: {
      type: "string",
      description: "Name of the configured agent to call.",
    },
    task: {
      type: "string",
      description:
        "Focused task for the agent. Include all important constraints and what output you need back.",
    },
  },
  required: ["agentName", "task"],
};

const BUILTIN_WEB_FETCH_TOOL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    url: {
      type: "string",
      description:
        "Exact HTTP or HTTPS URL to fetch. URL fragments like #section are supported for documentation anchors.",
    },
  },
  required: ["url"],
};

const BUILTIN_TASK_TOOL_PARAMETERS = {
  update_tasks: {
    type: "object",
    additionalProperties: false,
    properties: {
      tasks: {
        type: "array",
        description:
          "The full desired current checklist. Include both incomplete and completed tasks that should remain visible. Send [] to clear the list.",
        maxItems: 50,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            subject: {
              type: "string",
              description: "Short user-visible task subject.",
              maxLength: 180,
            },
            done: {
              type: "boolean",
              description: "Whether the task is complete.",
            },
          },
          required: ["subject", "done"],
        },
      },
    },
    required: ["tasks"],
  },
};

type ToolDraft = {
  id: string;
  name: string;
  description: string;
  parametersText: string;
  command: string;
  argsText: string;
  cwd: string;
  input: "none" | "json-stdin";
  timeoutMs: string;
  maxConcurrentRuns: string;
  delayBetweenRunsMs: string;
};

type ToolTestState = {
  argsText: string;
  result: ToolCommandResult | null;
  status?: "pending" | "running";
  runId?: string;
};

type BuiltInToolDraft = {
  timeoutMs: string;
};

const BUILTIN_TOOL_TIMEOUT_FALLBACKS_MS: Record<string, number> = {
  [BUILTIN_WEB_FETCH_TOOL_NAME]: 15_000,
  [BUILTIN_READ_TOOL_NAME]: 30_000,
  [BUILTIN_BASH_TOOL_NAME]: 30_000,
  [BUILTIN_EDIT_TOOL_NAME]: 30_000,
  [BUILTIN_WRITE_TOOL_NAME]: 30_000,
  [BUILTIN_FILE_FIND_TOOL_NAME]: 30_000,
  [BUILTIN_FILE_SEARCH_TOOL_NAME]: 30_000,
};

function supportsBuiltInTimeout(toolName: string) {
  return Object.prototype.hasOwnProperty.call(
    BUILTIN_TOOL_TIMEOUT_FALLBACKS_MS,
    toolName,
  );
}

function normalizeBuiltInTimeoutText(value: string, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return String(fallback);
  return String(Math.min(Math.round(numeric), 10 * 60_000));
}

function getSavedBuiltInToolDraft(
  settings: ToolsSettings,
  toolName: string,
): BuiltInToolDraft {
  const saved = settings.builtInToolSettings?.[toolName];
  const fallbackTimeout = BUILTIN_TOOL_TIMEOUT_FALLBACKS_MS[toolName] ?? 0;
  return {
    timeoutMs: String(saved?.timeoutMs ?? fallbackTimeout),
  };
}

function areBuiltInToolDraftsEqual(
  left: BuiltInToolDraft,
  right: BuiltInToolDraft,
) {
  return left.timeoutMs === right.timeoutMs;
}

type ToolsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolsSettings: ToolsSettings;
  onToolsSettingsChange: Dispatch<SetStateAction<ToolsSettings>>;
  availableTools: LoadedToolInfo[];
  loadedTools: LoadedToolInfo[];
  onLoadedToolsChange: Dispatch<SetStateAction<LoadedToolInfo[]>>;
  callAgentEnabled: boolean;
  showSuccess: (message: string, description?: string) => void;
  showError: (message: string, description?: string) => void;
  embedded?: boolean;
  contentWidthClassName?: string;
  onDirtyChange?: (dirty: boolean) => void;
};

function getToolsBridge() {
  if (!window.moltenForgeTools) {
    throw new Error("Electron tools bridge is not available.");
  }

  return window.moltenForgeTools;
}

function createBlankToolDraft(): ToolDraft {
  return {
    id: createId(),
    name: "",
    description: "",
    parametersText: JSON.stringify(
      { type: "object", properties: {}, required: [] },
      null,
      2,
    ),
    command: "",
    argsText: "",
    cwd: "",
    input: "json-stdin",
    timeoutMs: "30000",
    maxConcurrentRuns: "",
    delayBetweenRunsMs: "0",
  };
}

function areToolDraftsEqual(left: ToolDraft, right: ToolDraft) {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.description === right.description &&
    left.parametersText === right.parametersText &&
    left.command === right.command &&
    left.argsText === right.argsText &&
    left.cwd === right.cwd &&
    left.input === right.input &&
    left.timeoutMs === right.timeoutMs &&
    left.maxConcurrentRuns === right.maxConcurrentRuns &&
    left.delayBetweenRunsMs === right.delayBetweenRunsMs
  );
}

function toolToDraft(tool: LoadedToolInfo): ToolDraft {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    parametersText: JSON.stringify(tool.parameters, null, 2),
    command: tool.command,
    argsText: tool.args.join("\n"),
    cwd: tool.cwd ?? "",
    input: tool.input,
    timeoutMs: String(tool.timeoutMs),
    maxConcurrentRuns:
      tool.maxConcurrentRuns === undefined
        ? ""
        : String(tool.maxConcurrentRuns),
    delayBetweenRunsMs: String(tool.delayBetweenRunsMs ?? 0),
  };
}

function isToolExecutionPreview(value: unknown): value is ToolExecutionPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ToolExecutionPreview>;

  return (
    typeof candidate.command === "string" &&
    Array.isArray(candidate.args) &&
    candidate.args.every((arg) => typeof arg === "string") &&
    (candidate.cwd === undefined || typeof candidate.cwd === "string") &&
    (candidate.inputMode === "none" || candidate.inputMode === "json-stdin") &&
    (candidate.stdin === undefined || typeof candidate.stdin === "string") &&
    typeof candidate.displayCommand === "string" &&
    typeof candidate.usesStdin === "boolean" &&
    typeof candidate.usesPlaceholders === "boolean"
  );
}

function isToolCommandResult(value: unknown): value is ToolCommandResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ToolCommandResult>;

  return (
    (candidate.toolName === undefined ||
      typeof candidate.toolName === "string") &&
    typeof candidate.content === "string" &&
    (typeof candidate.exitCode === "number" || candidate.exitCode === null) &&
    typeof candidate.stdout === "string" &&
    typeof candidate.stderr === "string" &&
    typeof candidate.timedOut === "boolean" &&
    (candidate.execution === undefined ||
      isToolExecutionPreview(candidate.execution))
  );
}

function loadToolTestStates(): Record<string, ToolTestState> {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(TOOL_TEST_STATES_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([toolId, value]) => {
          if (typeof toolId !== "string") return null;
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            return null;
          }

          const candidate = value as Partial<ToolTestState>;
          const argsText =
            typeof candidate.argsText === "string" ? candidate.argsText : "{}";
          const result = isToolCommandResult(candidate.result)
            ? candidate.result
            : null;

          return [
            toolId,
            { argsText, result } satisfies ToolTestState,
          ] as const;
        })
        .filter(
          (entry): entry is readonly [string, ToolTestState] => entry !== null,
        ),
    );
  } catch {
    return {};
  }
}

function saveToolTestStates(states: Record<string, ToolTestState>) {
  if (typeof window === "undefined") return;

  const persisted = Object.fromEntries(
    Object.entries(states)
      .map(([toolId, state]) => {
        const argsText = state.argsText || "{}";
        const result = state.result ?? null;

        if (argsText.trim() === "{}" && !result) return null;

        return [toolId, { argsText, result }] as const;
      })
      .filter(
        (
          entry,
        ): entry is readonly [
          string,
          { argsText: string; result: ToolCommandResult | null },
        ] => entry !== null,
      ),
  );

  if (Object.keys(persisted).length === 0) {
    window.localStorage.removeItem(TOOL_TEST_STATES_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    TOOL_TEST_STATES_STORAGE_KEY,
    JSON.stringify(persisted),
  );
}

function formatJsonLikeCodeBlock(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "{}";

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

function renderJsonCodeBlock(
  value: string,
  className = TOOL_INFO_CODE_BLOCK_CLASS_NAME,
) {
  const normalized = formatJsonLikeCodeBlock(value);
  return (
    <MarkdownMessage
      className={className}
      content={`~~~json\n${normalized}\n~~~`}
    />
  );
}

function renderCodeBlock(
  value: string,
  language = "text",
  className = TOOL_INFO_CODE_BLOCK_CLASS_NAME,
) {
  return (
    <MarkdownMessage
      className={className}
      content={`~~~${language}\n${value}\n~~~`}
    />
  );
}

function renderCommandCodeBlock(value: string) {
  return renderCodeBlock(value, "bash");
}

function renderToolExecutionPreview(execution?: ToolExecutionPreview) {
  if (!execution) return null;

  return (
    <>
      {execution.displayCommand && (
        <div className="grid gap-1.5">
          <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground/80">
            Command
          </div>
          {renderCommandCodeBlock(execution.displayCommand)}
        </div>
      )}
      {execution.cwd?.trim() && (
        <div className="grid gap-1.5">
          <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground/80">
            Working directory
          </div>
          {renderCodeBlock(execution.cwd, "text")}
        </div>
      )}
    </>
  );
}

function extractTemplatePlaceholders(args: string[]) {
  const placeholders = new Set<string>();
  const pattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  for (const arg of args) {
    for (const match of arg.matchAll(pattern)) placeholders.add(match[1]);
  }
  return [...placeholders];
}

function getToolArgValue(args: unknown, key: string) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    !(key in args)
  ) {
    throw new Error(`Missing required tool argument: ${key}`);
  }

  return (args as Record<string, unknown>)[key];
}

function stringifyCommandArgValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function materializeCommandArgs(templateArgs: string[], modelArgs: unknown) {
  const templatePattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

  return templateArgs.map((templateArg) =>
    templateArg.replace(templatePattern, (_full, key: string) =>
      stringifyCommandArgValue(getToolArgValue(modelArgs, key)),
    ),
  );
}

function quoteCommandPreviewPart(value: string) {
  if (!value) return '""';
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function formatCommandPreview(command: string, args: string[]) {
  return [command, ...args].map(quoteCommandPreviewPart).join(" ");
}

function parseToolArgumentsText(value: string) {
  return value.trim() ? JSON.parse(value) : {};
}

function parseArgsLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);
}

function buildToolExecutionPreview(
  tool: Pick<LoadedToolInfo, "command" | "args" | "cwd" | "input">,
  modelArgs: unknown,
): ToolExecutionPreview {
  const commandArgs = materializeCommandArgs(tool.args, modelArgs);
  const hasCommand = tool.command.trim().length > 0 || tool.args.length > 0;
  const stdin =
    tool.input === "json-stdin" || !hasCommand
      ? JSON.stringify(modelArgs ?? {})
      : undefined;

  return {
    command: tool.command,
    args: commandArgs,
    cwd: tool.cwd,
    inputMode: tool.input,
    stdin,
    displayCommand: hasCommand
      ? formatCommandPreview(tool.command, commandArgs)
      : "",
    usesStdin: tool.input === "json-stdin" || !hasCommand,
    usesPlaceholders: extractTemplatePlaceholders(tool.args).length > 0,
  };
}

function buildToolExecutionPreviewForDraft(draft: ToolDraft, argsText: string) {
  try {
    return buildToolExecutionPreview(
      {
        command: draft.command,
        args: parseArgsLines(draft.argsText),
        cwd: draft.cwd.trim() || undefined,
        input: draft.input,
      },
      parseToolArgumentsText(argsText),
    );
  } catch {
    return undefined;
  }
}

function draftToTool(draft: ToolDraft): LoadedToolInfo {
  let parameters: Record<string, unknown>;

  try {
    const parsed = JSON.parse(draft.parametersText || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Parameters schema must be a JSON object.");
    }
    parameters = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid parameters JSON: ${labelForError(error)}`);
  }

  const args = parseArgsLines(draft.argsText);
  const timeoutMs = Number(draft.timeoutMs);
  const maxConcurrentRuns = Number(draft.maxConcurrentRuns);
  const delayBetweenRunsMs = Number(draft.delayBetweenRunsMs);

  return {
    id: draft.id,
    name: draft.name.trim(),
    description: draft.description.trim(),
    parameters,
    command: draft.command.trim(),
    args,
    cwd: draft.cwd.trim() || undefined,
    input: draft.input,
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? Math.round(timeoutMs)
        : 30000,
    maxConcurrentRuns:
      draft.maxConcurrentRuns.trim() &&
      Number.isFinite(maxConcurrentRuns) &&
      maxConcurrentRuns > 0
        ? Math.floor(maxConcurrentRuns)
        : undefined,
    delayBetweenRunsMs:
      Number.isFinite(delayBetweenRunsMs) && delayBetweenRunsMs > 0
        ? Math.round(delayBetweenRunsMs)
        : 0,
  };
}

function validateToolDraft(tool: LoadedToolInfo) {
  if (!tool.name) throw new Error("Tool name is required.");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name)) {
    throw new Error(
      "Tool name must use only letters, numbers, underscores, or hyphens.",
    );
  }
  if (
    tool.name === BUILTIN_ASK_USER_TOOL_NAME ||
    BUILTIN_TASK_TOOL_NAMES.includes(
      tool.name as (typeof BUILTIN_TASK_TOOL_NAMES)[number],
    ) ||
    tool.name === BUILTIN_LOAD_SKILL_TOOL_NAME ||
    tool.name === BUILTIN_CALL_AGENT_TOOL_NAME ||
    tool.name === BUILTIN_WEB_FETCH_TOOL_NAME ||
    BUILTIN_FILE_TOOL_NAMES.includes(tool.name)
  ) {
    throw new Error(
      `${tool.name} is a built-in tool name and cannot be used by a custom tool.`,
    );
  }
  if (!tool.description) throw new Error("Tool description is required.");
  if (tool.parameters.type !== "object") {
    throw new Error('Parameters schema must include "type": "object".');
  }
  if (!tool.command) throw new Error("Command is required.");

  const properties =
    tool.parameters.properties &&
    typeof tool.parameters.properties === "object" &&
    !Array.isArray(tool.parameters.properties)
      ? Object.keys(tool.parameters.properties as Record<string, unknown>)
      : [];
  const required = Array.isArray(tool.parameters.required)
    ? tool.parameters.required.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const propertySet = new Set(properties);
  const requiredSet = new Set(required);

  for (const placeholder of extractTemplatePlaceholders(tool.args)) {
    if (!propertySet.has(placeholder)) {
      throw new Error(
        `Unknown placeholder: ${placeholder}. Add it to schema properties or update args.`,
      );
    }
    if (!requiredSet.has(placeholder)) {
      throw new Error(
        `Placeholder ${placeholder} is used in args, so it must be listed in schema.required for now.`,
      );
    }
  }
}

function formatToolImportSummary(result: ToolImportResult) {
  return [
    `${result.imported} imported`,
    `${result.updated} updated`,
    `${result.renamed.length} renamed`,
    `${result.skipped.length} skipped`,
    `${result.invalid.length} invalid`,
  ].join(" · ");
}

function createUniqueToolCloneName(baseName: string, tools: LoadedToolInfo[]) {
  const existingNames = new Set(tools.map((tool) => tool.name));
  const normalizedBase = baseName.trim() || "tool";

  for (let index = 1; index < 1000; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${normalizedBase.slice(0, 64 - suffix.length)}${suffix}`;
    if (!existingNames.has(candidate)) return candidate;
  }

  return `${normalizedBase.slice(0, 55)}_${createId().slice(0, 8)}`;
}

export const ToolsDialog = memo(function ToolsDialog({
  open,
  onOpenChange,
  toolsSettings,
  onToolsSettingsChange,
  loadedTools,
  onLoadedToolsChange,
  callAgentEnabled,
  showSuccess,
  showError,
  embedded = false,
  contentWidthClassName,
  onDirtyChange,
}: ToolsDialogProps) {
  const [toolLoadErrors, setToolLoadErrors] = useState<
    Array<{ source: string; message: string }>
  >([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [toolDraft, setToolDraft] = useState<ToolDraft | null>(null);
  const [isSavingTool, setIsSavingTool] = useState(false);
  const [toolTestStatesByToolId, setToolTestStatesByToolId] = useState<
    Record<string, ToolTestState>
  >(() => loadToolTestStates());
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [builtInToolDrafts, setBuiltInToolDrafts] = useState<
    Record<string, BuiltInToolDraft>
  >({});
  const [toolSearchQuery, setToolSearchQuery] = useState("");
  const [unsavedChangesDialogOpen, setUnsavedChangesDialogOpen] =
    useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(
    null,
  );

  const isAskUserToolSelected = selectedToolName === BUILTIN_ASK_USER_TOOL_NAME;
  const selectedTaskToolInfo = BUILTIN_TASK_TOOL_META.find(
    (tool) => tool.name === selectedToolName,
  );
  const isTaskToolsSelected = Boolean(selectedTaskToolInfo);
  const isLoadSkillToolSelected =
    selectedToolName === BUILTIN_LOAD_SKILL_TOOL_NAME;
  const isCallAgentToolSelected =
    selectedToolName === BUILTIN_CALL_AGENT_TOOL_NAME;
  const isWebFetchToolSelected =
    selectedToolName === BUILTIN_WEB_FETCH_TOOL_NAME;
  const selectedFileToolInfo = BUILTIN_FILE_TOOL_META.find(
    (tool) => tool.name === selectedToolName,
  );
  const builtInToolNames = useMemo(
    () =>
      [
        BUILTIN_ASK_USER_TOOL_NAME,
        ...BUILTIN_TASK_TOOL_NAMES,
        BUILTIN_LOAD_SKILL_TOOL_NAME,
        BUILTIN_CALL_AGENT_TOOL_NAME,
        BUILTIN_WEB_FETCH_TOOL_NAME,
        ...BUILTIN_FILE_TOOL_NAMES,
      ] as string[],
    [],
  );
  const builtInToolItems = useMemo(
    () => [
      {
        id: BUILTIN_ASK_USER_TOOL_ID,
        name: BUILTIN_ASK_USER_TOOL_NAME,
        description: BUILTIN_ASK_USER_TOOL_DESCRIPTION,
        icon: MessageSquareText,
      },
      ...BUILTIN_TASK_TOOL_META.map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        icon: ListTodo,
      })),
      {
        id: BUILTIN_LOAD_SKILL_TOOL_ID,
        name: BUILTIN_LOAD_SKILL_TOOL_NAME,
        description: BUILTIN_LOAD_SKILL_TOOL_DESCRIPTION,
        icon: BookOpen,
      },
      {
        id: BUILTIN_CALL_AGENT_TOOL_ID,
        name: BUILTIN_CALL_AGENT_TOOL_NAME,
        description: BUILTIN_CALL_AGENT_TOOL_DESCRIPTION,
        icon: Bot,
      },
      {
        id: BUILTIN_WEB_FETCH_TOOL_ID,
        name: BUILTIN_WEB_FETCH_TOOL_NAME,
        description: BUILTIN_WEB_FETCH_TOOL_DESCRIPTION,
        icon: Globe,
      },
      ...BUILTIN_FILE_TOOL_META.map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        icon: tool.icon,
      })),
    ],
    [],
  );
  const toolListSearchText = toolSearchQuery.trim().toLowerCase();
  const matchesToolListSearch = (name: string, description: string) => {
    if (!toolListSearchText) return true;
    return `${name} ${description}`.toLowerCase().includes(toolListSearchText);
  };
  const filteredBuiltInToolItems = builtInToolItems.filter((tool) =>
    matchesToolListSearch(tool.name, tool.description),
  );
  const filteredLoadedTools = loadedTools.filter((tool) =>
    matchesToolListSearch(tool.name, tool.description || "Custom command tool."),
  );
  const hasFilteredTools =
    filteredBuiltInToolItems.length > 0 || filteredLoadedTools.length > 0;
  const selectedBuiltInToolName =
    selectedToolName && builtInToolNames.includes(selectedToolName)
      ? selectedToolName
      : null;
  const selectedTool = useMemo(
    () => loadedTools.find((tool) => tool.name === selectedToolName) ?? null,
    [loadedTools, selectedToolName],
  );
  const totalToolsCount = loadedTools.length + builtInToolNames.length;
  const currentToolTestState = toolDraft
    ? toolTestStatesByToolId[toolDraft.id]
    : undefined;
  const currentToolTestArgsText = currentToolTestState?.argsText ?? "{}";
  const currentToolTestResult = currentToolTestState?.result ?? null;
  const isTestingCurrentTool =
    currentToolTestState?.status === "pending" ||
    currentToolTestState?.status === "running";
  const currentToolTestExecutionPreview =
    currentToolTestResult?.execution ??
    (isTestingCurrentTool && toolDraft
      ? buildToolExecutionPreviewForDraft(toolDraft, currentToolTestArgsText)
      : undefined);
  const toolsMasterPermission = getToolsMasterPermission(toolsSettings);
  const childPermissionsLocked = toolsMasterPermission !== "custom";
  useEffect(() => {
    if (!selectedBuiltInToolName) return;
    setBuiltInToolDrafts((current) => {
      if (current[selectedBuiltInToolName]) return current;
      return {
        ...current,
        [selectedBuiltInToolName]: getSavedBuiltInToolDraft(
          toolsSettings,
          selectedBuiltInToolName,
        ),
      };
    });
  }, [selectedBuiltInToolName, toolsSettings]);

  useEffect(() => {
    const isEditingUnsavedTool =
      toolDraft &&
      !selectedToolName &&
      !loadedTools.some((tool) => tool.id === toolDraft.id);

    if (isEditingUnsavedTool) return;

    if (
      selectedToolName === BUILTIN_ASK_USER_TOOL_NAME ||
      isTaskToolsSelected ||
      selectedToolName === BUILTIN_CALL_AGENT_TOOL_NAME ||
      selectedToolName === BUILTIN_LOAD_SKILL_TOOL_NAME ||
      selectedToolName === BUILTIN_WEB_FETCH_TOOL_NAME ||
      Boolean(
        selectedToolName && BUILTIN_FILE_TOOL_NAMES.includes(selectedToolName),
      )
    ) {
      return;
    }

    if (
      !selectedToolName ||
      !loadedTools.some((tool) => tool.name === selectedToolName)
    ) {
      setSelectedToolName(BUILTIN_ASK_USER_TOOL_NAME);
    }
  }, [isTaskToolsSelected, loadedTools, selectedToolName, toolDraft]);

  useEffect(() => {
    if (
      selectedToolName === BUILTIN_ASK_USER_TOOL_NAME ||
      isTaskToolsSelected ||
      selectedToolName === BUILTIN_CALL_AGENT_TOOL_NAME ||
      selectedToolName === BUILTIN_LOAD_SKILL_TOOL_NAME ||
      selectedToolName === BUILTIN_WEB_FETCH_TOOL_NAME ||
      Boolean(
        selectedToolName && BUILTIN_FILE_TOOL_NAMES.includes(selectedToolName),
      )
    ) {
      setToolDraft(null);
      return;
    }

    const selected = loadedTools.find((tool) => tool.name === selectedToolName);
    if (selected) {
      setToolDraft(toolToDraft(selected));
    }
  }, [isTaskToolsSelected, loadedTools, selectedToolName]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      saveToolTestStates(toolTestStatesByToolId);
    }, TOOL_TEST_STATE_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [toolTestStatesByToolId]);

  function updateToolDraft(patch: Partial<ToolDraft>) {
    setToolDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateBuiltInToolDraft(
    toolName: string,
    patch: Partial<BuiltInToolDraft>,
  ) {
    setBuiltInToolDrafts((current) => ({
      ...current,
      [toolName]: {
        ...getSavedBuiltInToolDraft(toolsSettings, toolName),
        ...(current[toolName] ?? {}),
        ...patch,
      },
    }));
  }

  function getDraftModelDescription(_toolName: string, fallback: string) {
    return fallback;
  }

  function saveBuiltInToolDraft(toolName: string) {
    if (!supportsBuiltInTimeout(toolName)) return;

    const fallbackTimeout = BUILTIN_TOOL_TIMEOUT_FALLBACKS_MS[toolName] ?? 0;
    const draft =
      builtInToolDrafts[toolName] ??
      getSavedBuiltInToolDraft(toolsSettings, toolName);
    const normalizedTimeout = supportsBuiltInTimeout(toolName)
      ? Number(normalizeBuiltInTimeoutText(draft.timeoutMs, fallbackTimeout))
      : undefined;

    onToolsSettingsChange((current) => ({
      ...current,
      builtInToolSettings: {
        ...(current.builtInToolSettings ?? {}),
        [toolName]: {
          ...(current.builtInToolSettings?.[toolName] ?? {}),
          ...(normalizedTimeout !== undefined
            ? { timeoutMs: normalizedTimeout }
            : {}),
        },
      },
    }));

    setBuiltInToolDrafts((current) => ({
      ...current,
      [toolName]: {
        ...draft,
        ...(normalizedTimeout !== undefined
          ? { timeoutMs: String(normalizedTimeout) }
          : {}),
      },
    }));
    showSuccess("Built-in tool settings saved", toolName);
  }

  function resetBuiltInToolDraft(toolName: string) {
    setBuiltInToolDrafts((current) => ({
      ...current,
      [toolName]: getSavedBuiltInToolDraft(toolsSettings, toolName),
    }));
  }

  function renderBuiltInToolTimeoutField(name: string) {
    if (!supportsBuiltInTimeout(name)) return null;

    const draft =
      builtInToolDrafts[name] ?? getSavedBuiltInToolDraft(toolsSettings, name);

    return (
      <div className="grid gap-2">
        <Label htmlFor={`builtin-${name}-timeout`}>Timeout ms</Label>
        <Input
          id={`builtin-${name}-timeout`}
          value={draft.timeoutMs}
          onChange={(event) =>
            updateBuiltInToolDraft(name, { timeoutMs: event.target.value })
          }
          inputMode="numeric"
        />
      </div>
    );
  }

  const hasToolDraftChanges = useMemo(() => {
    if (
      !toolDraft ||
      isAskUserToolSelected ||
      isTaskToolsSelected ||
      isLoadSkillToolSelected ||
      isCallAgentToolSelected ||
      isWebFetchToolSelected
    ) {
      return false;
    }

    const originalDraft = selectedTool
      ? toolToDraft(selectedTool)
      : { ...createBlankToolDraft(), id: toolDraft.id };

    return !areToolDraftsEqual(toolDraft, originalDraft);
  }, [
    isAskUserToolSelected,
    isTaskToolsSelected,
    isLoadSkillToolSelected,
    isCallAgentToolSelected,
    isWebFetchToolSelected,
    selectedTool,
    toolDraft,
  ]);
  const savedBuiltInToolDraft = selectedBuiltInToolName
    ? getSavedBuiltInToolDraft(toolsSettings, selectedBuiltInToolName)
    : null;
  const currentBuiltInToolDraft = selectedBuiltInToolName
    ? (builtInToolDrafts[selectedBuiltInToolName] ?? savedBuiltInToolDraft)
    : null;
  const hasBuiltInToolDraftChanges = Boolean(
    selectedBuiltInToolName &&
      supportsBuiltInTimeout(selectedBuiltInToolName) &&
      currentBuiltInToolDraft &&
      savedBuiltInToolDraft &&
      !areBuiltInToolDraftsEqual(
        currentBuiltInToolDraft,
        savedBuiltInToolDraft,
      ),
  );
  const hasUnsavedToolChanges =
    hasToolDraftChanges || hasBuiltInToolDraftChanges;
  useEffect(() => {
    onDirtyChange?.(hasUnsavedToolChanges);
  }, [hasUnsavedToolChanges, onDirtyChange]);

  const isCreatingTool = Boolean(toolDraft && !selectedTool);

  async function saveCurrentToolDraft() {
    if (!toolDraft) return;
    setIsSavingTool(true);

    try {
      const tool = draftToTool(toolDraft);
      validateToolDraft(tool);
      const savedTool = await saveTool(tool);
      onLoadedToolsChange((current) => {
        const next = current.filter((item) => item.id !== savedTool.id);
        next.push(savedTool);
        return next.sort((left, right) => left.name.localeCompare(right.name));
      });
      setSelectedToolName(savedTool.name);
      setToolDraft(toolToDraft(savedTool));
      showSuccess("Tool saved");
    } catch (error) {
      showError("Failed to save tool", labelForError(error));
    } finally {
      setIsSavingTool(false);
    }
  }

  async function deleteCurrentTool() {
    if (!toolDraft) return;

    try {
      await deleteStoredTool(toolDraft.id);
      onLoadedToolsChange((current) =>
        current.filter((tool) => tool.id !== toolDraft.id),
      );
      setToolDraft(null);
      setSelectedToolName(null);
      setToolTestStatesByToolId((current) => {
        const { [toolDraft.id]: _deleted, ...rest } = current;
        void _deleted;
        return rest;
      });
      showSuccess("Tool deleted");
    } catch (error) {
      showError("Failed to delete tool", labelForError(error));
    }
  }

  async function importToolFiles() {
    setIsLoadingTools(true);

    try {
      const result = await importTools();
      if (result.cancelled) return;

      const tools = await loadTools();
      onLoadedToolsChange(tools);
      setToolLoadErrors([...result.invalid, ...result.skipped]);

      const summary = formatToolImportSummary(result);
      if (result.imported + result.updated > 0) {
        showSuccess("Tools import completed", summary);
      } else {
        showError("No tools imported", summary);
      }
    } catch (error) {
      showError("Failed to import tools", labelForError(error));
    } finally {
      setIsLoadingTools(false);
    }
  }

  async function exportAllTools() {
    if (loadedTools.length === 0) {
      showError("No custom tools to export");
      return;
    }

    try {
      const result = await exportTools(loadedTools);
      if (result.cancelled) return;
      showSuccess(
        `Exported ${result.exported} tool${result.exported === 1 ? "" : "s"}.`,
        result.path,
      );
    } catch (error) {
      showError("Failed to export tools", labelForError(error));
    }
  }

  async function cloneToolDraft(sourceDraft: ToolDraft) {

    try {
      const clonedDraft = {
        ...sourceDraft,
        id: createId(),
        name: createUniqueToolCloneName(sourceDraft.name, loadedTools),
      };
      const clonedTool = draftToTool(clonedDraft);
      validateToolDraft(clonedTool);
      const savedTool = await saveTool(clonedTool);

      onLoadedToolsChange((current) => {
        const next = current.filter((item) => item.id !== savedTool.id);
        next.push(savedTool);
        return next.sort((left, right) => left.name.localeCompare(right.name));
      });
      setSelectedToolName(savedTool.name);
      setToolDraft(toolToDraft(savedTool));
      showSuccess("Tool cloned", savedTool.name);
    } catch (error) {
      showError("Failed to clone tool", labelForError(error));
    }
  }

  async function exportCurrentTool() {
    if (!toolDraft) return;

    try {
      const tool = draftToTool(toolDraft);
      validateToolDraft(tool);
      const result = await exportTool(tool);
      if (result.cancelled) return;
      showSuccess("Tool exported", result.path);
    } catch (error) {
      showError("Failed to export tool", labelForError(error));
    }
  }

  async function openToolStorageFolder() {
    try {
      await openToolsFolder();
    } catch (error) {
      showError("Failed to open tools folder", labelForError(error));
    }
  }

  function requestWithUnsavedCheck(action: () => void) {
    if (hasUnsavedToolChanges) {
      setPendingAction(() => action);
      setUnsavedChangesDialogOpen(true);
      return;
    }
    action();
  }

  function discardCurrentToolDraftChanges() {
    if (selectedBuiltInToolName) {
      resetBuiltInToolDraft(selectedBuiltInToolName);
      return;
    }

    if (toolDraft && selectedTool) {
      setToolDraft(toolToDraft(selectedTool));
      return;
    }

    if (toolDraft && !selectedTool) {
      setSelectedToolName(BUILTIN_ASK_USER_TOOL_NAME);
      setToolDraft(null);
    }
  }

  function confirmDiscardUnsavedChanges() {
    const action = pendingAction;
    setPendingAction(null);
    setUnsavedChangesDialogOpen(false);
    discardCurrentToolDraftChanges();
    if (action) action();
  }

  function requestClose(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    requestWithUnsavedCheck(() => onOpenChange(false));
  }

  function createNewToolDraft() {
    const draft = createBlankToolDraft();
    setSelectedToolName(null);
    setToolDraft(draft);
  }

  function requestCreateTool() {
    requestWithUnsavedCheck(createNewToolDraft);
  }

  function cancelNewToolDraft() {
    setSelectedToolName(BUILTIN_ASK_USER_TOOL_NAME);
    setToolDraft(null);
  }

  function requestCancelNewToolDraft() {
    requestWithUnsavedCheck(cancelNewToolDraft);
  }

  function resetCurrentToolDraft() {
    if (!toolDraft) return;
    if (selectedTool) setToolDraft(toolToDraft(selectedTool));
    else setToolDraft(createBlankToolDraft());
  }

  function selectToolName(name: string) {
    setSelectedToolName(name);
    if (builtInToolNames.includes(name)) {
      setToolDraft(null);
      return;
    }

    const tool = loadedTools.find((item) => item.name === name);
    setToolDraft(tool ? toolToDraft(tool) : null);
  }

  function requestSelectToolName(name: string) {
    if (!isCreatingTool && selectedToolName === name) return;
    requestWithUnsavedCheck(() => selectToolName(name));
  }

  function requestCloneCurrentTool() {
    const sourceDraft = hasToolDraftChanges && selectedTool
      ? toolToDraft(selectedTool)
      : toolDraft;
    if (!sourceDraft) return;
    requestWithUnsavedCheck(() => void cloneToolDraft(sourceDraft));
  }

  function requestDeleteCurrentTool() {
    requestWithUnsavedCheck(() => void deleteCurrentTool());
  }

  function requestImportToolFiles() {
    requestWithUnsavedCheck(() => void importToolFiles());
  }

  function updateCurrentToolTestArgsText(argsText: string) {
    if (!toolDraft) return;

    setToolTestStatesByToolId((current) => ({
      ...current,
      [toolDraft.id]: {
        argsText,
        result: current[toolDraft.id]?.result ?? null,
        status: current[toolDraft.id]?.status,
        runId: current[toolDraft.id]?.runId,
      },
    }));
  }

  function clearCurrentToolTest() {
    if (!toolDraft) return;

    setToolTestStatesByToolId((current) => {
      const { [toolDraft.id]: _cleared, ...rest } = current;
      void _cleared;
      return rest;
    });
  }

  function setToolPermission(toolName: string, permission: Permission) {
    onToolsSettingsChange((current) => ({
      ...current,
      enabled: true,
      permissionModelVersion: 2,
      toolPermissions: {
        ...(current.toolPermissions ?? {}),
        [toolName]: permission,
      },
      askUserEnabled:
        toolName === BUILTIN_ASK_USER_TOOL_NAME
          ? permission !== "deny"
          : current.askUserEnabled,
      taskToolsEnabled: (BUILTIN_TASK_TOOL_NAMES as readonly string[]).includes(
        toolName,
      )
        ? permission !== "deny"
        : current.taskToolsEnabled,
      loadSkillEnabled:
        toolName === BUILTIN_LOAD_SKILL_TOOL_NAME
          ? permission !== "deny"
          : current.loadSkillEnabled,
      webFetchEnabled:
        toolName === BUILTIN_WEB_FETCH_TOOL_NAME
          ? permission !== "deny"
          : current.webFetchEnabled,
      readEnabled:
        toolName === BUILTIN_READ_TOOL_NAME
          ? permission !== "deny"
          : current.readEnabled,
      bashEnabled:
        toolName === BUILTIN_BASH_TOOL_NAME
          ? permission !== "deny"
          : current.bashEnabled,
      editEnabled:
        toolName === BUILTIN_EDIT_TOOL_NAME
          ? permission !== "deny"
          : current.editEnabled,
      writeEnabled:
        toolName === BUILTIN_WRITE_TOOL_NAME
          ? permission !== "deny"
          : current.writeEnabled,
    }));
  }

  function renderBuiltInToolRow({
    id,
    name,
    description,
    icon: Icon,
    selected,
    locked = true,
  }: {
    id: string;
    name: string;
    description: string;
    icon: typeof Wrench;
    selected: boolean;
    locked?: boolean;
  }) {
    const permission = getDisplayedToolPermission(toolsSettings, name);

    return (
      <div
        key={id}
        role="button"
        tabIndex={0}
        className={cn(
          "group flex min-w-0 cursor-pointer items-start gap-2 px-2 py-2 outline-none transition-colors",
          selected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted/60",
        )}
        onClick={() => requestSelectToolName(name)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            requestSelectToolName(name);
          }
        }}
      >
        <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 truncate text-base leading-6">
            <span className="truncate">{name}</span>
            {locked ? (
              <Lock className="size-3 shrink-0 text-muted-foreground" />
            ) : null}
          </div>
          <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        <PermissionSelect
          value={permission}
          disabled={childPermissionsLocked}
          onChange={(next) => setToolPermission(name, next)}
        />
      </div>
    );
  }

  async function runCurrentToolTest() {
    if (!toolDraft) return;

    const tool = draftToTool(toolDraft);
    const argsText = currentToolTestArgsText;
    const runId = createId();

    setToolTestStatesByToolId((current) => ({
      ...current,
      [tool.id]: {
        argsText,
        result: null,
        status: "running",
        runId,
      },
    }));

    function finish(result: ToolCommandResult) {
      setToolTestStatesByToolId((current) => {
        const previous = current[tool.id] ?? { argsText, result: null };
        if (previous.runId && previous.runId !== runId) return current;

        return {
          ...current,
          [tool.id]: {
            argsText: previous.argsText ?? argsText,
            result,
          },
        };
      });
    }

    try {
      validateToolDraft(tool);
      const args = parseToolArgumentsText(argsText);
      const result = await runQueuedTool(
        tool.name,
        tool,
        () => getToolsBridge().test({ tool, args }),
        (status) => {
          setToolTestStatesByToolId((current) => {
            const previous = current[tool.id] ?? { argsText, result: null };
            if (previous.runId && previous.runId !== runId) return current;

            return {
              ...current,
              [tool.id]: {
                ...previous,
                argsText: previous.argsText ?? argsText,
                result: null,
                status,
                runId,
              },
            };
          });
        },
      );
      finish(result);
    } catch (error) {
      finish({
        content: `Error: ${labelForError(error)}`,
        exitCode: null,
        stdout: "",
        stderr: labelForError(error),
        timedOut: false,
      });
    }
  }

  return (
    <>
      <Dialog embedded={embedded} open={open} onOpenChange={requestClose}>
        <DialogContent
          className="flex h-[min(1000px,calc(100dvh-2rem))] max-h-none flex-col gap-0 overflow-hidden p-0 outline-none focus:outline-none focus-visible:ring-0 sm:max-w-6xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest?.("[data-sonner-toaster]")) {
              event.preventDefault();
            }
          }}
        >
          {!embedded ? (
            <DialogHeader className="shrink-0 border-b p-4 pr-12">
              <DialogTitle>Tools</DialogTitle>
            </DialogHeader>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[400px_minmax(0,1fr)]">
            <aside className="app-glass-card flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
              <div className="shrink-0 border-b border-border bg-transparent p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={toolSearchQuery}
                    onChange={(event) => setToolSearchQuery(event.target.value)}
                    placeholder="Search tools"
                    aria-label="Search tools by name or description"
                    autoFocus={false}
                    className="h-9 pl-8 pr-8"
                  />
                  {toolSearchQuery ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setToolSearchQuery("")}
                      title="Clear search"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto chat-message-scrollbar">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-transparent px-2 py-2 text-base">
                  <span className="flex min-h-8 min-w-0 select-none items-center gap-1.5 font-medium">
                    Tools globally
                    <InfoTooltip label="Tools globally">
                      Master permission for the whole tools feature. Modes can
                      override it.
                    </InfoTooltip>
                  </span>
                  <MasterPermissionSelect
                    value={toolsMasterPermission}
                    onChange={(permission) =>
                      onToolsSettingsChange((current) => ({
                        ...current,
                        enabled: permission !== "deny",
                        toolsPermission: permission,
                        permissionModelVersion: 2,
                      }))
                    }
                  />
                </div>

                <div>
                  {hasFilteredTools ? (
                    <>
                      {filteredBuiltInToolItems.length > 0 ? (
                        <div>
                          <GroupHeading className="mb-0 mt-0 px-2 py-2">
                            Built-in
                          </GroupHeading>
                          {filteredBuiltInToolItems.map((tool) =>
                            renderBuiltInToolRow({
                              id: tool.id,
                              name: tool.name,
                              description: getDraftModelDescription(
                                tool.name,
                                tool.description,
                              ),
                              icon: tool.icon,
                              selected: selectedToolName === tool.name,
                            }),
                          )}
                        </div>
                      ) : null}

                      {filteredLoadedTools.length > 0 ? (
                        <div>
                          <GroupHeading className="mb-0 mt-0 px-2 py-2">
                            Custom tools
                          </GroupHeading>
                          {filteredLoadedTools.map((tool) => (
                            <div
                              key={tool.id}
                              role="button"
                              tabIndex={0}
                              className={cn(
                                "group flex min-w-0 cursor-pointer items-start gap-2 px-2 py-2 outline-none transition-colors",
                                selectedTool?.id === tool.id
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-muted/60",
                              )}
                              onClick={() => requestSelectToolName(tool.name)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  requestSelectToolName(tool.name);
                                }
                              }}
                            >
                              <Wrench className="mt-1 size-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-base leading-6">
                                  {tool.name}
                                </div>
                                <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
                                  {tool.description || "Custom command tool."}
                                </p>
                              </div>
                              <PermissionSelect
                                value={getDisplayedToolPermission(
                                  toolsSettings,
                                  tool.name,
                                )}
                                disabled={childPermissionsLocked}
                                onChange={(next) =>
                                  setToolPermission(tool.name, next)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="m-2 rounded-sm border border-dashed px-3 py-4 text-center text-base text-muted-foreground">
                      {totalToolsCount > 0
                        ? "No tools match the search."
                        : "No custom tools configured."}
                    </div>
                  )}
                </div>

                {toolLoadErrors.length > 0 && (
                  <div className="m-2 mt-4 grid gap-2">
                    <GroupHeading className="mt-0">Tool file issues</GroupHeading>
                    {toolLoadErrors.map((error) => (
                      <div
                        key={`${error.source}:${error.message}`}
                        className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-sm leading-5"
                      >
                        <div
                          className="truncate font-medium text-destructive"
                          title={error.source}
                        >
                          {error.source}
                        </div>
                        <div className="text-muted-foreground">{error.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 gap-2 border-t bg-transparent p-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-[36px] flex-1"
                  onClick={requestCreateTool}
                >
                  <Plus className="size-4" />
                  Create tool
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-[36px]"
                      title="Tool actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuItem
                      disabled={isLoadingTools}
                      onSelect={requestImportToolFiles}
                    >
                      <Upload className="size-4" />
                      Import tools...
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void exportAllTools()}>
                      <Download className="size-4" />
                      Export all tools...
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void openToolStorageFolder()}>
                      <FolderOpen className="size-4" />
                      Open tools folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </aside>

          <SettingsDetailPane contentWidthClassName={contentWidthClassName}>
            {isAskUserToolSelected ? (
              <>
                <SettingsDetailHeader className="flex min-h-[50px] items-center px-4 py-[10px]">
                  <div className="flex min-h-[32px] w-full items-center justify-between gap-4">
                    <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      Built-in tool
                    </Label>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border bg-muted/40 px-2 py-1 text-sm text-muted-foreground">
                      <Lock className="size-3.5" />
                      Locked
                    </span>
                  </div>
                </SettingsDetailHeader>

                <SettingsDetailContent className="px-4 py-4">
                  <div className="grid gap-5 pb-1">
                    <div className="grid gap-1">
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                        <MessageSquareText className="size-5 text-muted-foreground" />
                        {BUILTIN_ASK_USER_TOOL_NAME}
                      </h3>
                      <p className="max-w-2xl text-base leading-6 text-muted-foreground">
                        {getDraftModelDescription(
                          BUILTIN_ASK_USER_TOOL_NAME,
                          BUILTIN_ASK_USER_TOOL_DESCRIPTION,
                        )}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label>Behavior</Label>
                      <div className="grid gap-2 text-base leading-6 text-muted-foreground">
                        <p>
                          The assistant can call this tool when it needs a
                          decision before continuing. The response pauses, shows
                          one compact form, and resumes after you submit the
                          answers.
                        </p>
                        <p>
                          It supports up to 5 questions per form. Questions can
                          be single-choice, multi-select, or text-only. Choice
                          questions support up to 8 model-provided options, and
                          each option should include a short label plus a gray
                          helper description when useful. Molten Forge always
                          adds a custom “Type your answer” option to choice
                          questions.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Parameters JSON schema</Label>
                      {renderJsonCodeBlock(
                        JSON.stringify(
                          BUILTIN_ASK_USER_TOOL_PARAMETERS,
                          null,
                          2,
                        ),
                      )}
                    </div>

                    {selectedBuiltInToolName
                      ? renderBuiltInToolTimeoutField(selectedBuiltInToolName)
                      : null}

                  </div>
                </SettingsDetailContent>
              </>
            ) : isTaskToolsSelected ? (
              <>
                <SettingsDetailHeader className="flex min-h-[50px] items-center px-4 py-[10px]">
                  <div className="flex min-h-[32px] w-full items-center justify-between gap-4">
                    <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      Built-in tool
                    </Label>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border bg-muted/40 px-2 py-1 text-sm text-muted-foreground">
                      <Lock className="size-3.5" />
                      Locked
                    </span>
                  </div>
                </SettingsDetailHeader>

                <SettingsDetailContent className="px-4 py-4">
                  <div className="grid gap-5 pb-1">
                    <div className="grid gap-1">
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                        <ListTodo className="size-5 text-muted-foreground" />
                        {selectedTaskToolInfo?.name}
                      </h3>
                      <p className="max-w-2xl text-base leading-6 text-muted-foreground">
                        {selectedTaskToolInfo
                          ? getDraftModelDescription(
                              selectedTaskToolInfo.name,
                              selectedTaskToolInfo.description,
                            )
                          : BUILTIN_TASK_TOOLS_DESCRIPTION}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label>Behavior</Label>
                      <div className="grid gap-2 text-base leading-6 text-muted-foreground">
                        <p>
                          The assistant can use the task list tool during
                          complex work to show and update the checklist in the
                          current chat. It always sends the full current list in
                          one call.
                        </p>
                        <p>
                          Each task has a short subject and a done boolean.
                          Sending an empty tasks array clears the visible
                          checklist. Every successful task tool call renders the
                          current task list in chat.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Parameters JSON schema</Label>
                      {renderJsonCodeBlock(
                        JSON.stringify(
                          selectedTaskToolInfo
                            ? BUILTIN_TASK_TOOL_PARAMETERS[
                                selectedTaskToolInfo.name
                              ]
                            : {},
                          null,
                          2,
                        ),
                      )}
                    </div>

                    {selectedBuiltInToolName
                      ? renderBuiltInToolTimeoutField(selectedBuiltInToolName)
                      : null}

                  </div>
                </SettingsDetailContent>
              </>
            ) : isLoadSkillToolSelected ? (
              <>
                <SettingsDetailHeader className="flex min-h-[50px] items-center px-4 py-[10px]">
                  <div className="flex min-h-[32px] w-full items-center justify-between gap-4">
                    <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      Built-in tool
                    </Label>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border bg-muted/40 px-2 py-1 text-sm text-muted-foreground">
                      <Lock className="size-3.5" />
                      Locked
                    </span>
                  </div>
                </SettingsDetailHeader>

                <SettingsDetailContent className="px-4 py-4">
                  <div className="grid gap-5 pb-1">
                    <div className="grid gap-1">
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                        <BookOpen className="size-5 text-muted-foreground" />
                        {BUILTIN_LOAD_SKILL_TOOL_NAME}
                      </h3>
                      <p className="max-w-2xl text-base leading-6 text-muted-foreground">
                        {getDraftModelDescription(
                          BUILTIN_LOAD_SKILL_TOOL_NAME,
                          BUILTIN_LOAD_SKILL_TOOL_DESCRIPTION,
                        )}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label>Behavior</Label>
                      <div className="grid gap-2 text-base leading-6 text-muted-foreground">
                        <p>
                          The assistant can call this tool to load full SKILL.md
                          instructions for a discovered skill by exact name.
                        </p>
                        <p>
                          The result includes the skill file location and the
                          directory used to resolve relative references such as
                          examples or scripts.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Parameters JSON schema</Label>
                      {renderJsonCodeBlock(
                        JSON.stringify(
                          BUILTIN_LOAD_SKILL_TOOL_PARAMETERS,
                          null,
                          2,
                        ),
                      )}
                    </div>

                    {selectedBuiltInToolName
                      ? renderBuiltInToolTimeoutField(selectedBuiltInToolName)
                      : null}

                  </div>
                </SettingsDetailContent>
              </>
            ) : isCallAgentToolSelected ? (
              <>
                <SettingsDetailHeader className="flex min-h-[50px] items-center px-4 py-[10px]">
                  <div className="flex min-h-[32px] w-full items-center justify-between gap-4">
                    <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      Built-in tool
                    </Label>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border bg-muted/40 px-2 py-1 text-sm text-muted-foreground">
                      <Lock className="size-3.5" />
                      Locked
                    </span>
                  </div>
                </SettingsDetailHeader>

                <SettingsDetailContent className="px-4 py-4">
                  <div className="grid gap-5 pb-1">
                    <div className="grid gap-1">
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                        <Bot className="size-5 text-muted-foreground" />
                        {BUILTIN_CALL_AGENT_TOOL_NAME}
                      </h3>
                      <p className="max-w-2xl text-base leading-6 text-muted-foreground">
                        {getDraftModelDescription(
                          BUILTIN_CALL_AGENT_TOOL_NAME,
                          BUILTIN_CALL_AGENT_TOOL_DESCRIPTION,
                        )}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label>Behavior</Label>
                      <div className="grid gap-2 text-base leading-6 text-muted-foreground">
                        <p>
                          The assistant can call this tool to delegate a focused
                          subtask to an enabled agent, then use that agent's
                          result in the same response.
                        </p>
                        <p>
                          Availability is controlled by Agents settings, enabled
                          agents for the current chat, and this chat's tool
                          picker. Custom tool settings do not affect it.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Parameters JSON schema</Label>
                      {renderJsonCodeBlock(
                        JSON.stringify(
                          BUILTIN_CALL_AGENT_TOOL_PARAMETERS,
                          null,
                          2,
                        ),
                      )}
                    </div>

                    {selectedBuiltInToolName
                      ? renderBuiltInToolTimeoutField(selectedBuiltInToolName)
                      : null}

                  </div>
                </SettingsDetailContent>
              </>
            ) : isWebFetchToolSelected ? (
              <>
                <SettingsDetailHeader className="flex min-h-[50px] items-center px-4 py-[10px]">
                  <div className="flex min-h-[32px] w-full items-center justify-between gap-4">
                    <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      Built-in tool
                    </Label>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border bg-muted/40 px-2 py-1 text-sm text-muted-foreground">
                      <Lock className="size-3.5" />
                      Locked
                    </span>
                  </div>
                </SettingsDetailHeader>

                <SettingsDetailContent className="px-4 py-4">
                  <div className="grid gap-5 pb-1">
                    <div className="grid gap-1">
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                        <Globe className="size-5 text-muted-foreground" />
                        {BUILTIN_WEB_FETCH_TOOL_NAME}
                      </h3>
                      <p className="max-w-2xl text-base leading-6 text-muted-foreground">
                        {getDraftModelDescription(
                          BUILTIN_WEB_FETCH_TOOL_NAME,
                          BUILTIN_WEB_FETCH_TOOL_DESCRIPTION,
                        )}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label>Behavior</Label>
                      <div className="grid gap-2 text-base leading-6 text-muted-foreground">
                        <p>
                          The assistant can call this tool only when it already
                          has an exact URL, such as a documentation link from a
                          skill or a link pasted by the user. It does not search
                          for unknown pages.
                        </p>
                        <p>
                          Molten Forge fetches the page safely, blocks local or
                          private network addresses, extracts readable text,
                          supports URL fragments like #commands, and truncates
                          long results automatically.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Parameters JSON schema</Label>
                      {renderJsonCodeBlock(
                        JSON.stringify(
                          BUILTIN_WEB_FETCH_TOOL_PARAMETERS,
                          null,
                          2,
                        ),
                      )}
                    </div>

                    {selectedBuiltInToolName
                      ? renderBuiltInToolTimeoutField(selectedBuiltInToolName)
                      : null}

                  </div>
                </SettingsDetailContent>
              </>
            ) : selectedFileToolInfo ? (
              <>
                <SettingsDetailHeader className="flex min-h-[50px] items-center px-4 py-[10px]">
                  <div className="flex min-h-[32px] w-full items-center justify-between gap-4">
                    <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      Built-in tool
                    </Label>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border bg-muted/40 px-2 py-1 text-sm text-muted-foreground">
                      <Lock className="size-3.5" />
                      Locked
                    </span>
                  </div>
                </SettingsDetailHeader>

                <SettingsDetailContent className="px-4 py-4">
                  <div className="grid gap-5 pb-1">
                    <div className="grid gap-1">
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                        {(() => {
                          const Icon = selectedFileToolInfo.icon;
                          return (
                            <Icon className="size-5 text-muted-foreground" />
                          );
                        })()}
                        {selectedFileToolInfo.name}
                      </h3>
                      <p className="max-w-2xl text-base leading-6 text-muted-foreground">
                        {getDraftModelDescription(
                          selectedFileToolInfo.name,
                          selectedFileToolInfo.description,
                        )}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label>Behavior</Label>
                      <div className="grid gap-2 text-base leading-6 text-muted-foreground">
                        <p>
                          File tools use exact absolute paths listed in
                          Accessible paths. Bash requires an exact accessible
                          working directory.
                        </p>
                        <p>
                          Use the global and mode permission selectors to choose
                          Allow, Ask, or Deny.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Parameters JSON schema</Label>
                      {renderJsonCodeBlock(
                        JSON.stringify(
                          selectedFileToolInfo.parameters,
                          null,
                          2,
                        ),
                      )}
                    </div>

                    {selectedBuiltInToolName
                      ? renderBuiltInToolTimeoutField(selectedBuiltInToolName)
                      : null}

                  </div>
                </SettingsDetailContent>
              </>
            ) : toolDraft ? (
              <>
                <SettingsDetailHeader className="flex min-h-[50px] items-center px-4 py-[10px]">
                  <div className="flex w-full items-center justify-between gap-4">
                    <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      {selectedTool ? "Edit tool" : "New tool"}
                    </Label>
                    {selectedTool && toolDraft && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className=""
                            title="Tool options"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={requestCloneCurrentTool}>
                            <Copy className="size-4" />
                            Clone
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void exportCurrentTool()}
                          >
                            <Download className="size-4" />
                            Export
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={requestDeleteCurrentTool}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </SettingsDetailHeader>

                <SettingsDetailContent className="px-4 py-4">
                  <div className="grid gap-5 pb-1">
                    <div className="grid gap-1">
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                        <Wrench className="size-5 text-muted-foreground" />
                        {toolDraft.name || "Custom tool"}
                      </h3>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="tool-name">Name</Label>
                      <Input
                        id="tool-name"
                        value={toolDraft.name}
                        onChange={(event) =>
                          updateToolDraft({ name: event.target.value })
                        }
                        placeholder="calculate_square_root"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="tool-description">Description</Label>
                      <Textarea
                        id="tool-description"
                        value={toolDraft.description}
                        onChange={(event) =>
                          updateToolDraft({ description: event.target.value })
                        }
                        placeholder="Describe when the model should use this tool."
                        className="min-h-40 resize-y"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="tool-command">Command</Label>
                      <Input
                        id="tool-command"
                        value={toolDraft.command}
                        onChange={(event) =>
                          updateToolDraft({ command: event.target.value })
                        }
                        placeholder="node / python / rg / git"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Parameters JSON schema</Label>
                      <CodeEditor
                        value={toolDraft.parametersText}
                        onChange={(value) =>
                          updateToolDraft({ parametersText: value })
                        }
                        className="h-72 max-h-[45dvh]"
                        ariaLabel="Tool parameters JSON schema"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="tool-args">Arguments, one per line</Label>
                      <Textarea
                        id="tool-args"
                        value={toolDraft.argsText}
                        onChange={(event) =>
                          updateToolDraft({ argsText: event.target.value })
                        }
                        placeholder={
                          "C:/Prime/Tools/math-tool/dist/index.js\n--query\n{{query}}"
                        }
                        className="min-h-32 resize-y font-mono text-sm"
                        spellCheck={false}
                      />
                      <p className="text-sm leading-5 text-muted-foreground">
                        Use <code>{"{{fieldName}}"}</code> placeholders for
                        existing CLIs. Every placeholder must exist in
                        schema.properties and schema.required.
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="tool-input-mode">Input mode</Label>
                        <Select
                          value={toolDraft.input}
                          onValueChange={(value) =>
                            updateToolDraft({
                              input: value === "none" ? "none" : "json-stdin",
                            })
                          }
                        >
                          <SelectTrigger id="tool-input-mode" className="">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="json-stdin">
                              JSON stdin
                            </SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-sm leading-5 text-muted-foreground">
                          JSON stdin is best for scripts you write. None is best
                          for existing CLI flags/placeholders.
                        </p>
                      </div>
                      <div className="grid gap-2 content-start">
                        <Label htmlFor="tool-timeout">Timeout ms</Label>
                        <Input
                          id="tool-timeout"
                          value={toolDraft.timeoutMs}
                          onChange={(event) =>
                            updateToolDraft({ timeoutMs: event.target.value })
                          }
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-sm border bg-muted/20 p-3">
                      <div>
                        <Label>Execution limits</Label>
                        <p className="text-sm leading-5 text-muted-foreground">
                          Leave concurrency empty for the current parallel
                          behavior. Use 1 plus a delay for rate-limited tools.
                        </p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="tool-max-concurrent-runs">
                            Max concurrent runs
                          </Label>
                          <Input
                            id="tool-max-concurrent-runs"
                            value={toolDraft.maxConcurrentRuns}
                            onChange={(event) =>
                              updateToolDraft({
                                maxConcurrentRuns: event.target.value,
                              })
                            }
                            inputMode="numeric"
                            placeholder="Empty = unlimited"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="tool-delay-between-runs">
                            Delay between runs, ms
                          </Label>
                          <Input
                            id="tool-delay-between-runs"
                            value={toolDraft.delayBetweenRunsMs}
                            onChange={(event) =>
                              updateToolDraft({
                                delayBetweenRunsMs: event.target.value,
                              })
                            }
                            inputMode="numeric"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="tool-cwd">Working directory</Label>
                      <Input
                        id="tool-cwd"
                        value={toolDraft.cwd}
                        onChange={(event) =>
                          updateToolDraft({ cwd: event.target.value })
                        }
                        placeholder="Optional. Example: C:/Prime/Tools/math-tool"
                      />
                    </div>

                    <Separator />

                    <div className="grid gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label>Test tool</Label>
                          <p className="text-sm leading-5 text-muted-foreground">
                            Run this manifest locally with sample model
                            arguments.
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            className=""
                            onClick={clearCurrentToolTest}
                            disabled={
                              !currentToolTestState || isTestingCurrentTool
                            }
                          >
                            Clear test
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className=""
                            onClick={runCurrentToolTest}
                            disabled={isTestingCurrentTool}
                          >
                            {currentToolTestState?.status === "pending"
                              ? "Waiting..."
                              : isTestingCurrentTool
                                ? "Running..."
                                : "Run test"}
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        value={currentToolTestArgsText}
                        onChange={(event) =>
                          updateCurrentToolTestArgsText(event.target.value)
                        }
                        disabled={isTestingCurrentTool}
                        className="min-h-24 resize-y font-mono text-sm"
                        spellCheck={false}
                        placeholder='{ "value": 144 }'
                      />
                      {(currentToolTestResult ||
                        currentToolTestExecutionPreview) && (
                        <div className="grid gap-3 app-glass-panel-medium rounded-sm border p-3">
                          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                            {currentToolTestResult ? (
                              <span>
                                Exit: {currentToolTestResult.exitCode ?? "null"}{" "}
                                ·{" "}
                                {currentToolTestResult.timedOut
                                  ? "Timed out"
                                  : "Completed"}
                              </span>
                            ) : (
                              <span>
                                {currentToolTestState?.status === "pending"
                                  ? "Waiting for execution slot"
                                  : "Running command"}
                              </span>
                            )}
                            {currentToolTestResult ? (
                              currentToolTestResult.exitCode !== 0 ||
                              currentToolTestResult.timedOut ? (
                                <span className="inline-flex items-center gap-1 text-destructive shrink-0">
                                  <X className="size-3.5" />
                                  Failed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 shrink-0">
                                  <Check className="size-3.5" />
                                  Complete
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 shrink-0">
                                <Spinner className="size-3.5" />
                                {currentToolTestState?.status === "pending"
                                  ? "Waiting"
                                  : "Running"}
                              </span>
                            )}
                          </div>
                          {renderToolExecutionPreview(
                            currentToolTestExecutionPreview,
                          )}
                          {currentToolTestResult && (
                            <div className="grid gap-1.5">
                              <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground/80">
                                Output
                              </div>
                              {renderJsonCodeBlock(
                                currentToolTestResult.content,
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </SettingsDetailContent>
              </>
            ) : (
              <SettingsDetailContent className="p-4">
                <div className="flex h-full items-center justify-center rounded-sm border border-dashed p-8 text-center text-base text-muted-foreground">
                  Select a tool or add a new one.
                </div>
              </SettingsDetailContent>
            )}
            {(toolDraft || selectedBuiltInToolName) ? (
          <SettingsDetailFooter className="items-center px-4 py-2 sm:justify-between">
            <div className="text-sm text-muted-foreground" aria-live="polite">
              {hasUnsavedToolChanges ? "Unsaved changes" : null}
            </div>
            <div className="flex gap-2">
              {toolDraft ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={
                      isCreatingTool
                        ? requestCancelNewToolDraft
                        : resetCurrentToolDraft
                    }
                    disabled={
                      !isCreatingTool && (!hasToolDraftChanges || isSavingTool)
                    }
                  >
                    {isCreatingTool ? "Cancel" : "Reset"}
                  </Button>
                  <Button
                    type="button"
                    onClick={saveCurrentToolDraft}
                    disabled={!hasToolDraftChanges || isSavingTool}
                  >
                    {isSavingTool
                      ? "Saving..."
                      : isCreatingTool
                        ? "Create"
                        : "Save"}
                  </Button>
                </>
              ) : selectedBuiltInToolName ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resetBuiltInToolDraft(selectedBuiltInToolName)}
                    disabled={!hasBuiltInToolDraftChanges}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    onClick={() => saveBuiltInToolDraft(selectedBuiltInToolName)}
                    disabled={!hasBuiltInToolDraftChanges}
                  >
                    Save
                  </Button>
                </>
              ) : null}
            </div>
          </SettingsDetailFooter>
            ) : null}
          </SettingsDetailPane>
        </div>


        </DialogContent>
      </Dialog>

      <UnsavedChangesDialog
        open={unsavedChangesDialogOpen}
        onCancel={() => {
          setPendingAction(null);
          setUnsavedChangesDialogOpen(false);
        }}
        onDiscard={confirmDiscardUnsavedChanges}
      />
    </>
  );
});
