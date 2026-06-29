import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InteractionDock } from "@/components/ai-chat/interaction-dock";
import type { PendingChatInteraction } from "@/lib/ai-chat/chat-interactions";

function approval(id: string): PendingChatInteraction {
  return {
    id,
    kind: "tool_approval",
    chatId: "chat-1",
    assistantMessageId: "assistant-1",
    variantId: "variant-1",
    stepId: `step-${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    sourceLabel: "general",
    toolCall: {
      id,
      type: "function",
      function: {
        name: "bash",
        arguments: JSON.stringify({ command: `npm test ${id}` }),
      },
    },
    request: {
      title: "Approve command",
      toolName: "bash",
      action: "operation",
      description: "Run the project tests.",
      details: [
        { label: "Command", value: `npm test ${id}` },
        { label: "Working directory", value: "/workspace" },
        {
          label: "Approval mode",
          value: "Manual user approval required",
        },
      ],
    },
  };
}

function askUser(id: string): PendingChatInteraction {
  return {
    id,
    kind: "ask_user",
    chatId: "chat-1",
    assistantMessageId: "assistant-1",
    variantId: "variant-1",
    stepId: `step-${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    toolCall: {
      id,
      type: "function",
      function: { name: "ask_user", arguments: "{}" },
    },
    request: {
      title: "Configure the run",
      questions: [
        {
          id: "name",
          type: "text",
          question: "What should this run be called?",
          options: [],
        },
      ],
    },
  };
}

function agentApproval(id: string): PendingChatInteraction {
  return {
    ...approval(id),
    toolCall: {
      id,
      type: "function",
      function: {
        name: "call_agent",
        arguments: JSON.stringify({
          agentName: "general",
          task: "Review the pending changes",
        }),
      },
    },
    request: {
      title: "Approve agent call",
      toolName: "call_agent",
      action: "operation",
      description: "Delegate this task to a configured agent.",
    },
  };
}

describe("InteractionDock", () => {
  it("shows one queued interaction outside the transcript and advances by state", async () => {
    const submit = vi.fn();
    const interactions = [approval("call-1"), approval("call-2")];
    const user = userEvent.setup();

    const { rerender } = render(
      <InteractionDock
        interactions={interactions}
        canSubmit={() => true}
        onSubmitAskUserResponse={vi.fn()}
        onSubmitToolApprovalResponse={submit}
        onCancelAskUserRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("Requested by general")).toBeInTheDocument();
    expect(screen.getByText("2 pending")).toBeInTheDocument();
    expect(screen.getByText("bash", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText("npm test call-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(submit).toHaveBeenCalledWith(
      interactions[0].toolCall,
      expect.objectContaining({ approved: true }),
    );

    rerender(
      <InteractionDock
        interactions={interactions.slice(1)}
        canSubmit={() => true}
        onSubmitAskUserResponse={vi.fn()}
        onSubmitToolApprovalResponse={submit}
        onCancelAskUserRequest={vi.fn()}
      />,
    );

    expect(screen.queryByText("2 pending")).not.toBeInTheDocument();
    expect(screen.getByText("npm test call-2")).toBeInTheDocument();
  });

  it("keeps mixed interactions in FIFO order and explains queue cancellation", async () => {
    const cancel = vi.fn();
    const user = userEvent.setup();
    const interactions = [askUser("ask-1"), approval("approval-1")];
    const { rerender } = render(
      <InteractionDock
        interactions={interactions}
        canSubmit={() => true}
        onSubmitAskUserResponse={vi.fn()}
        onSubmitToolApprovalResponse={vi.fn()}
        onCancelAskUserRequest={cancel}
      />,
    );

    expect(
      screen.getByText("What should this run be called?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("bash", { selector: "code" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("2 pending")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Stop generation" }),
    );
    expect(cancel).toHaveBeenCalledWith("ask-1");

    rerender(
      <InteractionDock
        interactions={interactions.slice(1)}
        canSubmit={() => true}
        onSubmitAskUserResponse={vi.fn()}
        onSubmitToolApprovalResponse={vi.fn()}
        onCancelAskUserRequest={cancel}
      />,
    );

    expect(screen.getByText("bash", { selector: "code" })).toBeInTheDocument();
    expect(
      screen.queryByText("What should this run be called?"),
    ).not.toBeInTheDocument();
  });

  it("submits free-text answers from the dedicated question panel", async () => {
    const submit = vi.fn();
    const user = userEvent.setup();
    render(
      <InteractionDock
        interactions={[askUser("ask-1")]}
        canSubmit={() => true}
        onSubmitAskUserResponse={submit}
        onSubmitToolApprovalResponse={vi.fn()}
        onCancelAskUserRequest={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("textbox"), "Nightly checks");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ask-1" }),
      expect.any(Object),
      expect.objectContaining({
        answers: { name: "Nightly checks" },
        answerLabels: { name: "Nightly checks" },
      }),
    );
  });

  it("uses a generalized approval title and readable agent arguments", () => {
    render(
      <InteractionDock
        interactions={[agentApproval("agent-1")]}
        canSubmit={() => true}
        onSubmitAskUserResponse={vi.fn()}
        onSubmitToolApprovalResponse={vi.fn()}
        onCancelAskUserRequest={vi.fn()}
      />,
    );

    expect(
      screen.getByText("call_agent", { selector: "code" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Agent Name")).toBeInTheDocument();
    expect(screen.getByText("general")).toBeInTheDocument();
    expect(screen.getByText("Task")).toBeInTheDocument();
    expect(screen.getByText("Review the pending changes")).toBeInTheDocument();
  });

  it("keeps skill approvals concise even when tool metadata is verbose", () => {
    const interaction: PendingChatInteraction = {
      ...approval("skill-1"),
      toolCall: {
        id: "skill-1",
        type: "function",
        function: { name: "skill", arguments: '{"name":"imagegen"}' },
      },
      request: {
        title: "Approve skill loading",
        toolName: "skill",
        action: "operation",
        description: "The model wants to load a skill.",
        details: [
          {
            label: "Description",
            value: "A very long generated list of every available skill.",
          },
          {
            label: "Approval mode",
            value: "Manual user approval required",
          },
        ],
      },
    };

    render(
      <InteractionDock
        interactions={[interaction]}
        canSubmit={() => true}
        onSubmitAskUserResponse={vi.fn()}
        onSubmitToolApprovalResponse={vi.fn()}
        onCancelAskUserRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("skill", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText("Skill")).toBeInTheDocument();
    expect(screen.getByText("imagegen")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Load this skill's instructions so the model can use them.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("A very long generated list of every available skill."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Approval mode")).not.toBeInTheDocument();
  });

  it("omits generic interaction labels and the dock top border", () => {
    const interaction = { ...approval("call-1"), sourceLabel: undefined };
    const { container } = render(
      <InteractionDock
        interactions={[interaction]}
        canSubmit={() => true}
        onSubmitAskUserResponse={vi.fn()}
        onSubmitToolApprovalResponse={vi.fn()}
        onCancelAskUserRequest={vi.fn()}
      />,
    );

    expect(screen.queryByText("Permission required")).not.toBeInTheDocument();
    expect(screen.queryByText("Input requested")).not.toBeInTheDocument();
    expect(container.querySelector("section")).toHaveClass("py-3", "md:py-4");
    expect(container.querySelector("section")).not.toHaveClass("border-t");
    expect(container.querySelector(".shadow-sm")).not.toBeInTheDocument();
  });
});
