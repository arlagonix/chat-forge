import { useEffect, useRef, useState } from "react";

import {
  getAgentRunPreviewLine,
  getAgentRunStatusLabel,
  type AgentRunDisplay,
  type AgentRunStatusLabel,
} from "@/lib/ai-chat/agent-status-label";

type AgentRunRowText = {
  statusLabel: AgentRunStatusLabel;
  previewLine: string;
};

function getAgentRunRowText(agentRun: AgentRunDisplay): AgentRunRowText {
  return {
    statusLabel: getAgentRunStatusLabel(agentRun),
    previewLine: getAgentRunPreviewLine(agentRun),
  };
}

function isRunningAgent(agentRun: AgentRunDisplay) {
  return agentRun.status === "pending" || agentRun.status === "running";
}

function areRowTextsEqual(left: AgentRunRowText, right: AgentRunRowText) {
  return (
    left.statusLabel === right.statusLabel &&
    left.previewLine === right.previewLine
  );
}

export function useAgentRunRowText(agentRun: AgentRunDisplay) {
  const agentRunRef = useRef(agentRun);
  const isRunning = isRunningAgent(agentRun);
  const [displayedText, setDisplayedText] = useState(() =>
    getAgentRunRowText(agentRun),
  );

  agentRunRef.current = agentRun;

  useEffect(() => {
    const latestText = getAgentRunRowText(agentRunRef.current);
    setDisplayedText((current) =>
      areRowTextsEqual(current, latestText) ? current : latestText,
    );

    if (!isRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const latestText = getAgentRunRowText(agentRunRef.current);
      setDisplayedText((current) =>
        areRowTextsEqual(current, latestText)
          ? current
          : latestText,
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [agentRun.id, isRunning]);

  return displayedText;
}
