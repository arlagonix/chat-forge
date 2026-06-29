import type {
  AskUserRequest,
  AskUserResponse,
  ChatToolCall,
  ToolApprovalRequest,
} from "@/lib/ai-chat/types";

const ASK_USER_CUSTOM_ANSWER_ID = "__custom__";

export type AskUserAnswerSummary = {
  id: string;
  question: string;
  answer: string;
};

function getAskUserAnswerText(
  request: AskUserRequest,
  response: AskUserResponse,
  questionId: string,
) {
  const question = request.questions.find((item) => item.id === questionId);
  if (!question) return "";

  const answerLabel = response.answerLabels?.[question.id];
  if (Array.isArray(answerLabel)) {
    return answerLabel.map((item) => item.trim()).filter(Boolean).join(", ");
  }
  if (answerLabel?.trim()) return answerLabel.trim();

  if (question.type === "multi_select") {
    return (response.multiAnswers?.[question.id] ?? [])
      .map((optionId) =>
        optionId === ASK_USER_CUSTOM_ANSWER_ID
          ? response.customAnswers?.[question.id]?.trim() ?? ""
          : question.options.find((option) => option.id === optionId)?.label ??
            optionId,
      )
      .filter(Boolean)
      .join(", ");
  }

  if (question.type === "text") {
    return response.answers[question.id]?.trim() ?? "";
  }

  const selectedOptionId = response.answers[question.id] ?? "";
  if (selectedOptionId === ASK_USER_CUSTOM_ANSWER_ID) {
    return response.customAnswers?.[question.id]?.trim() ?? "";
  }

  return (
    question.options.find((option) => option.id === selectedOptionId)?.label ??
    selectedOptionId
  ).trim();
}

export function getAskUserAnswerSummaries(
  request: AskUserRequest,
  response: AskUserResponse,
): AskUserAnswerSummary[] {
  return request.questions
    .map((question) => ({
      id: question.id,
      question: question.question.trim(),
      answer: getAskUserAnswerText(request, response, question.id),
    }))
    .filter((item) => item.question && item.answer.trim());
}

type PendingChatInteractionBase = {
  id: string;
  chatId: string;
  assistantMessageId: string;
  variantId: string;
  stepId: string;
  toolCall: ChatToolCall;
  sourceAgentCallId?: string;
  sourceLabel?: string;
  createdAt: string;
};

export type PendingChatInteraction =
  | (PendingChatInteractionBase & {
      kind: "ask_user";
      request: AskUserRequest;
    })
  | (PendingChatInteractionBase & {
      kind: "tool_approval";
      request: ToolApprovalRequest;
    });
