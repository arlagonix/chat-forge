import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentCallBlock } from "@/components/ai-chat/agent-call-block";
import type { ChatAgentCall } from "@/lib/ai-chat/types";

const agentCall: ChatAgentCall = {
  id: "agent-call-1",
  agentName: "General",
  task: "Inspect the project",
  status: "running",
  contextMode: "task_only",
  depth: 0,
  startedAt: "2026-01-01T00:00:00.000Z",
  model: "test-model",
  output: "Hidden live output",
  reasoning: "Hidden live reasoning",
  messages: [],
  childAgentCalls: [],
};

const baseProps = {
  id: "agent-call-1",
  agentCall,
  canSubmitAskUserResponse: vi.fn(() => false),
  onSubmitAskUserResponse: vi.fn(),
  onCancelAskUserRequest: vi.fn(),
  onOpenAgentCall: vi.fn(),
};

describe("AgentCallBlock", () => {
  it("shows the agent name, live status, and task without the model", () => {
    render(<AgentCallBlock {...baseProps} />);

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Composing")).toBeInTheDocument();
    expect(screen.getByText("Hidden live output")).toBeInTheDocument();
    expect(screen.queryByText("test-model")).not.toBeInTheDocument();
  });

  it("opens the global agent viewer when clicked", () => {
    const onOpenAgentCall = vi.fn();
    render(<AgentCallBlock {...baseProps} onOpenAgentCall={onOpenAgentCall} />);

    fireEvent.click(screen.getByRole("button", { name: /general/i }));

    expect(onOpenAgentCall).toHaveBeenCalledWith("agent-call-1");
  });

  it("shows a muted checkmark for completed agents", () => {
    render(
      <AgentCallBlock
        {...baseProps}
        agentCall={{ ...agentCall, status: "complete" }}
      />,
    );

    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Agent complete")).toBeInTheDocument();
  });
});
