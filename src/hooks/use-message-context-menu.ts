import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import type { MessageContextMenuState } from "@/components/ai-chat/chat-message-list";

function getSelectedTextWithin(element: HTMLElement) {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed) {
    return "";
  }

  const selectedText = selection.toString();

  if (!selectedText.trim()) {
    return "";
  }

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);

    try {
      if (range.intersectsNode(element)) {
        return selectedText;
      }
    } catch {
      // Ignore detached selection ranges.
    }
  }

  return "";
}

export function useMessageContextMenu() {
  const [messageContextMenu, setMessageContextMenu] =
    useState<MessageContextMenuState | null>(null);

  function closeMessageContextMenu() {
    setMessageContextMenu(null);
  }

  function captureMessageContext(
    event: ReactMouseEvent<HTMLElement>,
    messageId: string,
  ) {
    event.preventDefault();

    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest("a[href]");
    const menuWidth = 220;
    const menuHeight = 180;
    const margin = 8;
    const x = Math.max(
      margin,
      Math.min(event.clientX, window.innerWidth - menuWidth - margin),
    );
    const y = Math.max(
      margin,
      Math.min(event.clientY, window.innerHeight - menuHeight - margin),
    );

    setMessageContextMenu({
      messageId,
      x,
      y,
      linkHref: link instanceof HTMLAnchorElement ? link.href : null,
      selectedText: getSelectedTextWithin(event.currentTarget),
    });
  }

  useEffect(() => {
    if (!messageContextMenu) return;

    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;

      if (target?.closest("[data-message-context-menu]")) {
        return;
      }

      closeMessageContextMenu();
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMessageContextMenu();
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleDocumentPointerDown,
        true,
      );
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [messageContextMenu]);

  return {
    messageContextMenu,
    captureMessageContext,
    closeMessageContextMenu,
  };
}
