"use client";

import {
  ChevronDown,
  ChevronUp,
  MessageSquareText,
  RefreshCcw,
  Send,
  Settings,
  Square,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { ThemeToggle } from "@/components/prompt-forge/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  loadProviderModels,
  streamProviderChat,
} from "@/lib/ai-chat/direct-provider-client";
import {
  defaultProvider,
  providerPresets,
} from "@/lib/ai-chat/provider-presets";
import {
  loadMessages,
  loadProvider,
  loadSystemPrompt,
  saveMessages,
  saveProvider,
  saveSystemPrompt,
} from "@/lib/ai-chat/storage";
import type { ChatMessage, ProviderConfig } from "@/lib/ai-chat/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function labelForError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error.";
}

function providerLabel(provider: ProviderConfig) {
  const model = provider.model.trim() || "No model selected";
  return `${provider.name || "Custom provider"} · ${model}`;
}

function takeBufferedChunk(buffer: string) {
  if (!buffer) return "";

  const maxChunkLength =
    buffer.length > 900 ? 24 : buffer.length > 300 ? 12 : 5;
  if (buffer.length <= maxChunkLength) return buffer;

  const slice = buffer.slice(0, maxChunkLength);
  const lastWhitespace = Math.max(
    slice.lastIndexOf(" "),
    slice.lastIndexOf("\n"),
    slice.lastIndexOf("\t"),
  );

  if (lastWhitespace >= 4) {
    return buffer.slice(0, lastWhitespace + 1);
  }

  return slice;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [provider, setProvider] = useState<ProviderConfig>(defaultProvider);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful assistant.",
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<
    Record<string, boolean>
  >({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const streamBufferRef = useRef({
    assistantMessageId: "",
    content: "",
    reasoning: "",
  });
  const streamDrainTimerRef = useRef<ReturnType<
    typeof window.setInterval
  > | null>(null);

  useEffect(() => {
    setProvider(loadProvider());
    setSystemPrompt(loadSystemPrompt());
    setMessages(loadMessages());
    setMounted(true);

    return () => {
      if (streamDrainTimerRef.current) {
        window.clearInterval(streamDrainTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mounted) saveProvider(provider);
  }, [mounted, provider]);

  useEffect(() => {
    if (mounted) saveSystemPrompt(systemPrompt);
  }, [mounted, systemPrompt]);

  useEffect(() => {
    if (mounted) saveMessages(messages);
  }, [mounted, messages]);

  useEffect(() => {
    const textarea = draftTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
    const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
    const maxHeight = lineHeight * 11 + paddingTop + paddingBottom;

    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    const scrollElement = chatScrollRef.current;
    if (!scrollElement || !shouldStickToBottomRef.current) return;

    scrollElement.scrollTop = scrollElement.scrollHeight;
  }, [messages]);

  const canSend = useMemo(() => {
    return Boolean(
      provider.baseUrl.trim() &&
      provider.model.trim() &&
      draft.trim() &&
      !isSending,
    );
  }, [draft, isSending, provider.baseUrl, provider.model]);

  function showSuccess(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function showError(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function showInfo(message: string, description?: string) {
    toast(message, description ? { description } : undefined);
  }

  function getReasoningPreview(reasoning: string) {
    const lines = reasoning.trimEnd().split(/\r?\n/);
    const previewLines = 6;

    if (lines.length <= previewLines) {
      return reasoning;
    }

    return lines.slice(-previewLines).join("\n");
  }

  function toggleReasoning(messageId: string) {
    setExpandedReasoningIds((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  }

  function handleChatScroll() {
    const scrollElement = chatScrollRef.current;
    if (!scrollElement) return;

    const distanceFromBottom =
      scrollElement.scrollHeight -
      scrollElement.scrollTop -
      scrollElement.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 96;
  }

  function appendToAssistantMessage(
    assistantMessageId: string,
    patch: Partial<Pick<ChatMessage, "content" | "reasoning">>,
  ) {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== assistantMessageId) return message;

        return {
          ...message,
          content: patch.content
            ? message.content + patch.content
            : message.content,
          reasoning: patch.reasoning
            ? `${message.reasoning ?? ""}${patch.reasoning}`
            : message.reasoning,
        };
      }),
    );
  }

  function drainStreamBuffer(assistantMessageId: string, flushAll = false) {
    const buffer = streamBufferRef.current;
    if (buffer.assistantMessageId !== assistantMessageId) return;

    const contentDelta = flushAll
      ? buffer.content
      : takeBufferedChunk(buffer.content);
    const reasoningDelta = flushAll
      ? buffer.reasoning
      : takeBufferedChunk(buffer.reasoning);

    if (!contentDelta && !reasoningDelta) return;

    buffer.content = buffer.content.slice(contentDelta.length);
    buffer.reasoning = buffer.reasoning.slice(reasoningDelta.length);

    appendToAssistantMessage(assistantMessageId, {
      content: contentDelta,
      reasoning: reasoningDelta,
    });
  }

  function hasPendingStreamBuffer(assistantMessageId: string) {
    const buffer = streamBufferRef.current;
    return (
      buffer.assistantMessageId === assistantMessageId &&
      Boolean(buffer.content || buffer.reasoning)
    );
  }

  async function finishStreamBufferDrain(assistantMessageId: string) {
    stopStreamBufferDrain();

    while (hasPendingStreamBuffer(assistantMessageId)) {
      drainStreamBuffer(assistantMessageId);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 35));
    }
  }

  function stopStreamBufferDrain() {
    if (!streamDrainTimerRef.current) return;

    window.clearInterval(streamDrainTimerRef.current);
    streamDrainTimerRef.current = null;
  }

  function startStreamBufferDrain(assistantMessageId: string) {
    stopStreamBufferDrain();

    streamDrainTimerRef.current = window.setInterval(() => {
      drainStreamBuffer(assistantMessageId);
    }, 55);
  }

  function applyPreset(id: string) {
    const preset = providerPresets.find((item) => item.id === id);
    if (!preset) return;

    setProvider(preset);
    setModels([]);
    showSuccess("Provider preset loaded", preset.name);
  }

  async function loadModelsFromProvider() {
    setIsLoadingModels(true);
    toast.dismiss();

    try {
      const loadedModels = await loadProviderModels(provider);
      setModels(loadedModels);

      if (!provider.model.trim() && loadedModels.length > 0) {
        setProvider((currentProvider) => ({
          ...currentProvider,
          model: loadedModels[0],
        }));
      }

      if (loadedModels.length) {
        showSuccess(
          `Loaded ${loadedModels.length} model${loadedModels.length === 1 ? "" : "s"}`,
        );
      } else {
        showInfo(
          "No models returned",
          "You can enter the model name manually.",
        );
      }
    } catch (error) {
      showError("Model lookup failed", labelForError(error));
      console.error("Model lookup failed:", error);
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();

    const userMessage = draft.trim();

    if (isSending) return;

    if (!provider.baseUrl.trim()) {
      showError("Provider base URL is required.");
      setSettingsOpen(true);
      return;
    }

    if (!provider.model.trim()) {
      showError(
        "Model name is required",
        "Load models or enter the model name manually.",
      );
      setSettingsOpen(true);
      return;
    }

    if (!userMessage) {
      showError("Message is required.");
      return;
    }

    const userChatMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };

    const assistantMessageId = createId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      reasoning: "",
      status: "streaming",
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, userChatMessage, assistantMessage];
    const controller = new AbortController();
    abortControllerRef.current = controller;

    shouldStickToBottomRef.current = true;
    setMessages(nextMessages);
    setDraft("");
    setIsSending(true);
    toast.dismiss();

    streamBufferRef.current = {
      assistantMessageId,
      content: "",
      reasoning: "",
    };
    startStreamBufferDrain(assistantMessageId);

    try {
      await streamProviderChat({
        provider,
        systemPrompt,
        messages,
        userMessage,
        signal: controller.signal,
        onContentDelta: (delta) => {
          streamBufferRef.current.content += delta;
        },
        onReasoningDelta: (delta) => {
          streamBufferRef.current.reasoning += delta;
        },
      });

      await finishStreamBufferDrain(assistantMessageId);

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessageId
            ? { ...message, status: "done" }
            : message,
        ),
      );
    } catch (error) {
      const wasAborted =
        error instanceof DOMException && error.name === "AbortError";

      stopStreamBufferDrain();
      drainStreamBuffer(assistantMessageId, true);

      setMessages((currentMessages) =>
        currentMessages.map((message) => {
          if (message.id !== assistantMessageId) return message;

          const currentContent = message.content.trim();
          return {
            ...message,
            status: wasAborted ? "done" : "error",
            content: wasAborted
              ? message.content || "Generation stopped."
              : currentContent
                ? `${message.content}\n\nError: ${labelForError(error)}`
                : `Error: ${labelForError(error)}`,
          };
        }),
      );
    } finally {
      stopStreamBufferDrain();

      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsSending(false);
    }
  }

  function stopGeneration() {
    abortControllerRef.current?.abort();
  }

  function clearChat() {
    setMessages([]);
    showSuccess("Chat cleared.");
  }

  if (!mounted) {
    return (
      <main className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
        Loading...
      </main>
    );
  }

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
            <MessageSquareText className="size-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-5">
              AI Chat MVP
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {providerLabel(provider)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <Settings className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearChat}
            title="Clear chat"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      <section className="grid min-h-0 flex-1 grid-rows-[1fr_auto] bg-background">
        <div
          ref={chatScrollRef}
          onScroll={handleChatScroll}
          className="min-h-0 overflow-y-auto"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-3 md:py-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[calc(100dvh-15rem)] items-center justify-center">
                <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-xs">
                  <h2 className="text-base font-semibold">
                    Start a conversation
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Open settings, choose a provider, load or enter a model
                    name, and send your first message.
                  </p>
                  <Button
                    className="mt-4"
                    variant="secondary"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <Settings className="size-4" />
                    Open settings
                  </Button>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className="grid gap-2">
                  {message.role === "assistant" &&
                    message.reasoning?.trim() &&
                    (() => {
                      const isExpanded = Boolean(
                        expandedReasoningIds[message.id],
                      );
                      const reasoningLineCount = message.reasoning
                        .trimEnd()
                        .split(/\r?\n/).length;
                      const reasoningText = isExpanded
                        ? message.reasoning
                        : getReasoningPreview(message.reasoning);
                      const canToggle = reasoningLineCount > 6;

                      return (
                        <article className="flex justify-start">
                          <div className="w-full rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground shadow-xs [overflow-wrap:anywhere]">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-xs font-medium uppercase tracking-wide">
                                Thinking
                                {message.status === "streaming" ? "..." : ""}
                              </div>
                              {canToggle && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-muted-foreground"
                                  onClick={() => toggleReasoning(message.id)}
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="size-3" />
                                      Shrink
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="size-3" />
                                      Expand
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                            <div
                              className={cn(
                                "whitespace-pre-wrap text-xs leading-5",
                                isExpanded
                                  ? "max-h-[32rem] overflow-auto pr-1"
                                  : "max-h-40 overflow-hidden",
                              )}
                            >
                              {reasoningText}
                            </div>
                          </div>
                        </article>
                      );
                    })()}

                  {(message.content ||
                    message.role !== "assistant" ||
                    message.status !== "streaming") && (
                    <article
                      className={cn(
                        "flex",
                        message.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 max-w-[85%] rounded-lg border px-4 py-3 text-sm leading-6 shadow-xs [overflow-wrap:anywhere]",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-card text-card-foreground",
                          message.status === "error" && "border-destructive/50",
                        )}
                      >
                        <div
                          className={cn(
                            "whitespace-pre-wrap",
                            message.role === "assistant" &&
                              message.status === "streaming" &&
                              message.content &&
                              "streaming-caret",
                          )}
                        >
                          {message.content}
                        </div>
                      </div>
                    </article>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <form onSubmit={sendMessage} className="bg-background px-3 py-3 md:px-4 md:py-4">
          <div className="mx-auto w-full max-w-[51rem] rounded-3xl border bg-card p-3 shadow-sm">
            <div className="mx-auto grid w-full max-w-3xl gap-2">
              <Textarea
                ref={draftTextareaRef}
                value={draft}
                rows={3}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;

                  if (event.shiftKey) return;

                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
                placeholder="Type your message... Enter to send, Shift+Enter for newline"
                className="min-h-[5.5rem] resize-none border-0 bg-transparent px-1 shadow-none leading-6 focus-visible:ring-0"
              />
              <div className="flex justify-end">
                {isSending ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={stopGeneration}
                    className="shrink-0 rounded-full"
                    title="Stop generation"
                  >
                    <Square className="size-4" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!canSend}
                    className="shrink-0 rounded-full"
                    title="Send message"
                  >
                    <Send className="size-4" />
                    Send
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </section>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Provider settings</DialogTitle>
            <DialogDescription>
              Configure any OpenAI-compatible endpoint. Requests are sent
              directly from the browser.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(100dvh-12rem)] px-5 py-4">
            <div className="grid gap-5 pb-1">
              <div className="grid gap-2">
                <Label>Preset</Label>
                <Select value={provider.id} onValueChange={applyPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {providerPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="provider-name">Name</Label>
                  <Input
                    id="provider-name"
                    value={provider.name}
                    onChange={(event) =>
                      setProvider({
                        ...provider,
                        id: "custom",
                        name: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="provider-model">Model</Label>
                  <Input
                    id="provider-model"
                    value={provider.model}
                    onChange={(event) =>
                      setProvider({
                        ...provider,
                        id: "custom",
                        model: event.target.value,
                      })
                    }
                    placeholder="qwen/qwen3.5-9b"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="provider-url">Base URL</Label>
                <Input
                  id="provider-url"
                  value={provider.baseUrl}
                  onChange={(event) =>
                    setProvider({
                      ...provider,
                      id: "custom",
                      baseUrl: event.target.value,
                    })
                  }
                  placeholder="http://localhost:1234/v1"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="provider-api-key">API key</Label>
                <Input
                  id="provider-api-key"
                  value={provider.apiKey}
                  onChange={(event) =>
                    setProvider({
                      ...provider,
                      id: "custom",
                      apiKey: event.target.value,
                    })
                  }
                  placeholder="not-needed"
                  type="password"
                />
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={loadModelsFromProvider}
                disabled={isLoadingModels || !provider.baseUrl.trim()}
                className="w-full"
              >
                <RefreshCcw
                  className={cn("size-4", isLoadingModels && "animate-spin")}
                />
                {isLoadingModels ? "Loading models..." : "Load models"}
              </Button>

              {models.length > 0 && (
                <div className="grid gap-2">
                  <Label>Detected models</Label>
                  <Select
                    value={provider.model}
                    onValueChange={(model) =>
                      setProvider({ ...provider, model })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select detected model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              <div className="grid gap-2">
                <Label htmlFor="system-prompt">System prompt</Label>
                <Textarea
                  id="system-prompt"
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  rows={6}
                  className="min-h-32"
                />
              </div>

              <div className="rounded-md border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                Cloud API keys are stored in localStorage and used directly in
                the browser. This is intended for a local personal app, not a
                public deployment.
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="border-t px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
