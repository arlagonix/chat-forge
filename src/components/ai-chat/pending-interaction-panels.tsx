import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { memo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ASK_USER_CUSTOM_ANSWER_ID,
  CALL_AGENT_TOOL_NAME,
  getAskUserQuestionType,
  LOAD_SKILL_TOOL_NAME,
} from "@/lib/ai-chat/builtin-tools";
import { isFileToolName } from "@/lib/ai-chat/file-tool-names";
import type {
  AskUserOption,
  AskUserQuestion,
  AskUserRequest,
  AskUserResponse,
  ChatToolCall,
  ToolApprovalRequest,
  ToolApprovalResponse,
} from "@/lib/ai-chat/types";
import { cn } from "@/lib/utils";

const MAX_CUSTOM_ANSWER_LENGTH = 2000;

function createDefaultAnswers(request: AskUserRequest) {
  return Object.fromEntries(
    request.questions.map((question) => {
      const type = getAskUserQuestionType(question);
      if (type === "text" || type === "multi_select") {
        return [question.id, ""];
      }
      return [question.id, question.options[0]?.id ?? ""];
    }),
  );
}

function createDefaultMultiAnswers(request: AskUserRequest) {
  return Object.fromEntries(
    request.questions.map((question) => [question.id, [] as string[]]),
  );
}

function createEmptyCustomAnswers(request: AskUserRequest) {
  return Object.fromEntries(
    request.questions.map((question) => [question.id, ""]),
  );
}

function QuestionChoice({
  question,
  option,
  checked,
  multiple,
  disabled,
  onSelect,
}: {
  question: AskUserQuestion;
  option: AskUserOption;
  checked: boolean;
  multiple: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        checked ? "bg-primary/8" : "hover:bg-muted/50",
      )}
    >
      <input
        type={multiple ? "checkbox" : "radio"}
        name={multiple ? undefined : question.id}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <span className="grid min-w-0 gap-0.5">
        <span className="text-base font-medium leading-6 text-foreground">
          {option.label}
        </span>
        {option.description?.trim() ? (
          <span className="text-sm leading-5 text-muted-foreground">
            {option.description.trim()}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export const PendingAskUserPanel = memo(function PendingAskUserPanel({
  request,
  canSubmit,
  cancelLabel,
  onSubmit,
  onCancel,
}: {
  request: AskUserRequest;
  canSubmit: boolean;
  cancelLabel: string;
  onSubmit: (response: AskUserResponse) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    createDefaultAnswers(request),
  );
  const [multiAnswers, setMultiAnswers] = useState<Record<string, string[]>>(
    () => createDefaultMultiAnswers(request),
  );
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>(
    () => createEmptyCustomAnswers(request),
  );
  const activeQuestion = request.questions[activeQuestionIndex];
  const questionCount = request.questions.length;

  function isQuestionAnswered(question: AskUserQuestion) {
    const type = getAskUserQuestionType(question);
    if (type === "text") return Boolean(answers[question.id]?.trim());
    if (type === "multi_select") {
      return (multiAnswers[question.id] ?? []).some((optionId) =>
        optionId === ASK_USER_CUSTOM_ANSWER_ID
          ? Boolean(customAnswers[question.id]?.trim())
          : true,
      );
    }

    const selected = answers[question.id];
    if (!selected) return false;
    return selected === ASK_USER_CUSTOM_ANSWER_ID
      ? Boolean(customAnswers[question.id]?.trim())
      : true;
  }

  const canSubmitAll =
    canSubmit &&
    request.questions.length > 0 &&
    request.questions.every(isQuestionAnswered);

  function selectCustomAnswer(question: AskUserQuestion) {
    const type = getAskUserQuestionType(question);
    if (type === "multi_select") {
      setMultiAnswers((current) => {
        const selected = current[question.id] ?? [];
        return selected.includes(ASK_USER_CUSTOM_ANSWER_ID)
          ? current
          : {
              ...current,
              [question.id]: [...selected, ASK_USER_CUSTOM_ANSWER_ID],
            };
      });
      return;
    }

    setAnswers((current) => ({
      ...current,
      [question.id]: ASK_USER_CUSTOM_ANSWER_ID,
    }));
  }

  function toggleCustomAnswer(question: AskUserQuestion) {
    const type = getAskUserQuestionType(question);
    if (type !== "multi_select") {
      selectCustomAnswer(question);
      return;
    }

    setMultiAnswers((current) => {
      const selected = current[question.id] ?? [];
      return {
        ...current,
        [question.id]: selected.includes(ASK_USER_CUSTOM_ANSWER_ID)
          ? selected.filter((item) => item !== ASK_USER_CUSTOM_ANSWER_ID)
          : [...selected, ASK_USER_CUSTOM_ANSWER_ID],
      };
    });
  }

  function getAnswerLabel(question: AskUserQuestion) {
    const type = getAskUserQuestionType(question);
    if (type === "text") return answers[question.id]?.trim() ?? "";
    if (type === "multi_select") {
      return (multiAnswers[question.id] ?? [])
        .map((optionId) =>
          optionId === ASK_USER_CUSTOM_ANSWER_ID
            ? customAnswers[question.id]?.trim() ?? ""
            : question.options.find((option) => option.id === optionId)?.label ??
              optionId,
        )
        .filter(Boolean);
    }

    const selected = answers[question.id];
    return selected === ASK_USER_CUSTOM_ANSWER_ID
      ? customAnswers[question.id]?.trim() ?? ""
      : question.options.find((option) => option.id === selected)?.label ??
          selected ??
          "";
  }

  function submit() {
    if (!canSubmitAll) return;

    const normalizedAnswers = Object.fromEntries(
      request.questions.map((question) => [
        question.id,
        getAskUserQuestionType(question) === "multi_select"
          ? ""
          : answers[question.id] ?? "",
      ]),
    );
    const normalizedMultiAnswers = Object.fromEntries(
      request.questions
        .filter(
          (question) => getAskUserQuestionType(question) === "multi_select",
        )
        .map((question) => [
          question.id,
          (multiAnswers[question.id] ?? []).filter((optionId) =>
            optionId === ASK_USER_CUSTOM_ANSWER_ID
              ? Boolean(customAnswers[question.id]?.trim())
              : true,
          ),
        ]),
    );
    const normalizedCustomAnswers = Object.fromEntries(
      request.questions
        .filter((question) => {
          const type = getAskUserQuestionType(question);
          if (type === "single_choice") {
            return answers[question.id] === ASK_USER_CUSTOM_ANSWER_ID;
          }
          return (
            type === "multi_select" &&
            (multiAnswers[question.id] ?? []).includes(
              ASK_USER_CUSTOM_ANSWER_ID,
            )
          );
        })
        .map((question) => [
          question.id,
          customAnswers[question.id]?.trim() ?? "",
        ]),
    );

    void onSubmit({
      answers: normalizedAnswers,
      multiAnswers:
        Object.keys(normalizedMultiAnswers).length > 0
          ? normalizedMultiAnswers
          : undefined,
      customAnswers:
        Object.keys(normalizedCustomAnswers).length > 0
          ? normalizedCustomAnswers
          : undefined,
      answerLabels: Object.fromEntries(
        request.questions.map((question) => [
          question.id,
          getAnswerLabel(question),
        ]),
      ),
      answeredAt: new Date().toISOString(),
    });
  }

  function handleTextKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();

    if (activeQuestionIndex < questionCount - 1 && activeQuestion) {
      if (isQuestionAnswered(activeQuestion)) {
        setActiveQuestionIndex((current) => current + 1);
      }
      return;
    }
    submit();
  }

  function renderQuestionInput() {
    if (!activeQuestion) return null;
    const type = getAskUserQuestionType(activeQuestion);
    if (type === "text") {
      return (
        <div className="p-0.5">
          <Textarea
            autoFocus
            value={answers[activeQuestion.id] ?? ""}
            maxLength={MAX_CUSTOM_ANSWER_LENGTH}
            disabled={!canSubmit}
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                [activeQuestion.id]: event.target.value.slice(
                  0,
                  MAX_CUSTOM_ANSWER_LENGTH,
                ),
              }))
            }
            onKeyDown={handleTextKeyDown}
            className="min-h-24 resize-y bg-background shadow-none"
          />
        </div>
      );
    }

    const selected =
      type === "multi_select"
        ? multiAnswers[activeQuestion.id] ?? []
        : [answers[activeQuestion.id] ?? ""];
    const customSelected = selected.includes(ASK_USER_CUSTOM_ANSWER_ID);

    return (
      <div className="overflow-hidden rounded-sm border bg-background">
        <div className="divide-y">
          {activeQuestion.options.map((option) => (
            <QuestionChoice
              key={option.id}
              question={activeQuestion}
              option={option}
              checked={selected.includes(option.id)}
              multiple={type === "multi_select"}
              disabled={!canSubmit}
              onSelect={() => {
                if (type === "multi_select") {
                  setMultiAnswers((current) => {
                    const currentIds = current[activeQuestion.id] ?? [];
                    return {
                      ...current,
                      [activeQuestion.id]: currentIds.includes(option.id)
                        ? currentIds.filter((item) => item !== option.id)
                        : [...currentIds, option.id],
                    };
                  });
                  return;
                }
                setAnswers((current) => ({
                  ...current,
                  [activeQuestion.id]: option.id,
                }));
              }}
            />
          ))}
          <div
            className={cn(
              "grid gap-2 px-3 py-2.5 transition-colors",
              customSelected ? "bg-primary/8" : "hover:bg-muted/50",
            )}
          >
            <label
              className={cn(
                "flex items-start gap-3",
                canSubmit
                  ? "cursor-pointer"
                  : "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type={type === "multi_select" ? "checkbox" : "radio"}
                name={type === "multi_select" ? undefined : activeQuestion.id}
                checked={customSelected}
                disabled={!canSubmit}
                onChange={() => toggleCustomAnswer(activeQuestion)}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="text-base font-medium leading-6 text-foreground">
                Something else
              </span>
            </label>
            {customSelected ? (
              <div className="p-0.5">
                <Textarea
                  autoFocus
                  value={customAnswers[activeQuestion.id] ?? ""}
                  maxLength={MAX_CUSTOM_ANSWER_LENGTH}
                  disabled={!canSubmit}
                  placeholder="Type your answer"
                  onFocus={() => selectCustomAnswer(activeQuestion)}
                  onChange={(event) =>
                    setCustomAnswers((current) => ({
                      ...current,
                      [activeQuestion.id]: event.target.value.slice(
                        0,
                        MAX_CUSTOM_ANSWER_LENGTH,
                      ),
                    }))
                  }
                  onKeyDown={handleTextKeyDown}
                  className="min-h-20 resize-y bg-background shadow-none"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const currentAnswered = activeQuestion
    ? isQuestionAnswered(activeQuestion)
    : false;
  const isFirst = activeQuestionIndex === 0;
  const isLast = activeQuestionIndex === questionCount - 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-4">
          {(request.title?.trim() || request.description?.trim()) && (
            <div className="grid gap-1">
              {request.title?.trim() ? (
                <div className="text-base font-semibold leading-6 text-foreground">
                  {request.title.trim()}
                </div>
              ) : null}
              {request.description?.trim() ? (
                <div className="text-base leading-6 text-muted-foreground">
                  {request.description.trim()}
                </div>
              ) : null}
            </div>
          )}

          {activeQuestion ? (
            <div className="grid gap-3">
              {questionCount > 1 ? (
                <div className="text-sm font-medium text-muted-foreground">
                  Question {activeQuestionIndex + 1} of {questionCount}
                </div>
              ) : null}
              <div className="grid gap-1">
                <div className="text-lg font-medium leading-7 text-foreground">
                  {activeQuestion.question}
                </div>
                {activeQuestion.description?.trim() ? (
                  <div className="text-base leading-6 text-muted-foreground">
                    {activeQuestion.description.trim()}
                  </div>
                ) : null}
              </div>
              {renderQuestionInput()}
            </div>
          ) : (
            <div className="text-base text-muted-foreground">
              No questions were provided.
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pt-4">
        <Button
          type="button"
          variant="ghost"
          disabled={!canSubmit}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          {!isFirst ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setActiveQuestionIndex((current) => Math.max(0, current - 1))
              }
            >
              Back
            </Button>
          ) : null}
          {!isLast ? (
            <Button
              type="button"
              disabled={!canSubmit || !currentAnswered}
              onClick={() =>
                setActiveQuestionIndex((current) =>
                  Math.min(questionCount - 1, current + 1),
                )
              }
            >
              Next
            </Button>
          ) : (
            <Button type="button" disabled={!canSubmitAll} onClick={submit}>
              Submit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

function humanizeLabel(value: string) {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function stringifyDetailValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getArgumentDetails(toolCall: ChatToolCall) {
  try {
    const parsed = JSON.parse(toolCall.function.arguments || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }
    return Object.entries(parsed as Record<string, unknown>).map(
      ([label, value]) => ({
        label: humanizeLabel(label),
        value: stringifyDetailValue(value),
      }),
    );
  } catch {
    return [];
  }
}

function isPrimaryApprovalDetail(label: string) {
  return /^(command|skill|skill name|agent|agent name|task|target)$/i.test(
    label.trim(),
  );
}

export const PendingToolApprovalPanel = memo(
  function PendingToolApprovalPanel({
    request,
    toolCall,
    canSubmit,
    onSubmit,
  }: {
    request: ToolApprovalRequest;
    toolCall: ChatToolCall;
    canSubmit: boolean;
    onSubmit: (response: ToolApprovalResponse) => void | Promise<void>;
  }) {
    const providedDetails = (request.details ?? []).filter(
      (detail) => !/^approval mode$/i.test(detail.label.trim()),
    );
    const toolName = request.toolName.trim() || toolCall.function.name;
    const descriptionDetail = providedDetails.find((detail) =>
      /^description$/i.test(detail.label.trim()),
    );
    const description =
      toolName === LOAD_SKILL_TOOL_NAME
        ? "Load this skill's instructions so the model can use them."
        : toolName === CALL_AGENT_TOOL_NAME
          ? "Delegate this task to a configured agent."
          : descriptionDetail?.value.trim() || request.description?.trim();
    const detailLabels = new Set(
      providedDetails.map((detail) => detail.label.trim().toLowerCase()),
    );
    const argumentDetails = isFileToolName(toolName)
      ? []
      : getArgumentDetails(toolCall)
          .map((detail) =>
            toolName === LOAD_SKILL_TOOL_NAME && /^name$/i.test(detail.label)
              ? { ...detail, label: "Skill" }
              : detail,
          )
          .filter((detail) => {
            const label = detail.label.trim().toLowerCase();
            if (detailLabels.has(label)) return false;
            if (request.path?.trim() && label === "path") return false;
            if (
              detailLabels.has("skill") &&
              (label === "name" || label === "skill name")
            ) {
              return false;
            }
            if (
              detailLabels.has("agent") &&
              (label === "agent" || label === "agent name")
            ) {
              return false;
            }
            return true;
          });
    const details = [
      ...providedDetails.filter(
        (detail) => !/^description$/i.test(detail.label.trim()),
      ),
      ...argumentDetails,
    ];
    const primaryDetails = details.filter((detail) =>
      isPrimaryApprovalDetail(detail.label),
    );
    const secondaryDetails = details.filter(
      (detail) => !isPrimaryApprovalDetail(detail.label),
    );
    function submit(approved: boolean) {
      if (!canSubmit) return;
      void onSubmit({ approved, answeredAt: new Date().toISOString() });
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <div className="text-lg font-medium leading-7 text-foreground">
                Run <code className="font-mono">{toolName}</code>?
              </div>
              {description ? (
                <div className="text-base leading-6 text-muted-foreground">
                  {description}
                </div>
              ) : (
                <div className="text-base leading-6 text-muted-foreground">
                  This tool needs your permission before it can run.
                </div>
              )}
            </div>

            {request.path?.trim() ? (
              <div className="grid gap-1">
                <div className="text-sm font-medium text-muted-foreground">
                  Target
                </div>
                <div className="rounded-sm bg-muted px-3 py-2 font-mono text-sm leading-5 text-foreground [overflow-wrap:anywhere]">
                  {request.path.trim()}
                </div>
              </div>
            ) : null}

            {primaryDetails.map((detail) => (
              <div key={`${detail.label}:${detail.value}`} className="grid gap-1">
                <div className="text-sm font-medium text-muted-foreground">
                  {detail.label}
                </div>
                <div
                  className={cn(
                    "rounded-sm bg-muted px-3 py-2 text-base leading-6 text-foreground [overflow-wrap:anywhere]",
                    /^command$/i.test(detail.label.trim()) &&
                      "font-mono text-sm leading-5 whitespace-pre-wrap",
                  )}
                >
                  {detail.value}
                </div>
              </div>
            ))}

            {secondaryDetails.length > 0 ? (
              <details className="group text-sm text-muted-foreground">
                <summary className="cursor-pointer select-none font-medium text-foreground/80">
                  Details
                </summary>
                <div className="mt-2 grid gap-2 rounded-sm bg-muted/60 px-3 py-2.5">
                  {secondaryDetails.map((detail) => (
                    <div
                      key={`${detail.label}:${detail.value}`}
                      className="grid gap-0.5"
                    >
                      <div className="font-medium text-muted-foreground">
                        {detail.label}
                      </div>
                      <div className="text-sm leading-5 text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {detail.value}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={!canSubmit}
            onClick={() => submit(false)}
          >
            Deny
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => submit(true)}
          >
            Approve
          </Button>
        </div>
      </div>
    );
  },
);
