"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  MessageSquareText,
  RefreshCcw,
  Send,
  Settings,
  Trash2,
  User,
} from "lucide-react";

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
import { cn } from "@/lib/utils";
import { loadProviderModels, sendProviderChat } from "@/lib/ai-chat/direct-provider-client";
import { defaultProvider, providerPresets } from "@/lib/ai-chat/provider-presets";
import {
  loadMessages,
  loadProvider,
  loadSystemPrompt,
  saveMessages,
  saveProvider,
  saveSystemPrompt,
} from "@/lib/ai-chat/storage";
import type { ChatMessage, ProviderConfig } from "@/lib/ai-chat/types";

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

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [provider, setProvider] = useState<ProviderConfig>(defaultProvider);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setProvider(loadProvider());
    setSystemPrompt(loadSystemPrompt());
    setMessages(loadMessages());
    setMounted(true);
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
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const canSend = useMemo(() => {
    return Boolean(provider.baseUrl.trim() && provider.model.trim() && draft.trim() && !isSending);
  }, [draft, isSending, provider.baseUrl, provider.model]);

  function applyPreset(id: string) {
    const preset = providerPresets.find((item) => item.id === id);
    if (!preset) return;

    setProvider(preset);
    setModels([]);
    setStatus(`Loaded ${preset.name} preset.`);
  }

  async function loadModelsFromProvider() {
    setIsLoadingModels(true);
    setStatus("");

    try {
      const loadedModels = await loadProviderModels(provider);
      setModels(loadedModels);

      if (!provider.model.trim() && loadedModels.length > 0) {
        setProvider((currentProvider) => ({
          ...currentProvider,
          model: loadedModels[0],
        }));
      }

      setStatus(
        loadedModels.length
          ? `Loaded ${loadedModels.length} model(s).`
          : "Provider responded, but no models were returned. Enter the model name manually.",
      );
    } catch (error) {
      setStatus(`Model lookup failed: ${labelForError(error)}`);
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();

    const userMessage = draft.trim();

    if (isSending) return;

    if (!provider.baseUrl.trim()) {
      setStatus("Provider base URL is required.");
      setSettingsOpen(true);
      return;
    }

    if (!provider.model.trim()) {
      setStatus("Model name is required. Load models or enter the model name manually.");
      setSettingsOpen(true);
      return;
    }

    if (!userMessage) {
      setStatus("Message is required.");
      return;
    }

    const userChatMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, userChatMessage];

    setMessages(nextMessages);
    setDraft("");
    setIsSending(true);
    setStatus("");

    try {
      const content = await sendProviderChat({
        provider,
        systemPrompt,
        messages,
        userMessage,
      });

      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
      };

      setMessages([...nextMessages, assistantMessage]);
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: `Error: ${labelForError(error)}`,
        createdAt: new Date().toISOString(),
      };

      setMessages([...nextMessages, assistantMessage]);
    } finally {
      setIsSending(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setStatus("Chat cleared.");
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
            <h1 className="truncate text-sm font-semibold leading-5">AI Chat MVP</h1>
            <p className="truncate text-xs text-muted-foreground">{providerLabel(provider)}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle />
          <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(true)} title="Settings">
            <Settings className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={clearChat} title="Clear chat">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      <section className="grid min-h-0 flex-1 grid-rows-[1fr_auto] bg-background">
        <ScrollArea className="min-h-0">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 md:p-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[calc(100dvh-15rem)] items-center justify-center">
                <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-xs">
                  <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-md border bg-background">
                    <Bot className="size-5 text-muted-foreground" />
                  </div>
                  <h2 className="text-base font-semibold">Start a conversation</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Open settings, choose a provider, load or enter a model name, and send your first message.
                  </p>
                  <Button className="mt-4" variant="secondary" onClick={() => setSettingsOpen(true)}>
                    <Settings className="size-4" />
                    Open settings
                  </Button>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border bg-card">
                      <Bot className="size-4" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[min(760px,85%)] whitespace-pre-wrap rounded-lg border px-4 py-3 text-sm leading-6 shadow-xs [overflow-wrap:anywhere]",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-card-foreground",
                    )}
                  >
                    {message.content}
                  </div>

                  {message.role === "user" && (
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border bg-card">
                      <User className="size-4" />
                    </div>
                  )}
                </article>
              ))
            )}

            {isSending && (
              <article className="flex justify-start gap-3">
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border bg-card">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground shadow-xs">
                  Thinking...
                </div>
              </article>
            )}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <form onSubmit={sendMessage} className="border-t bg-card p-3 md:p-4">
          <div className="mx-auto grid w-full max-w-5xl gap-2">
            {status && (
              <div className="rounded-md border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                {status}
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Type your message... Ctrl+Enter to send"
                className="min-h-20 resize-none bg-background"
              />
              <Button type="submit" disabled={!canSend} className="h-auto self-stretch px-4">
                <Send className="size-4" />
                <span className="hidden sm:inline">Send</span>
              </Button>
            </div>
          </div>
        </form>
      </section>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Provider settings</DialogTitle>
            <DialogDescription>
              Configure any OpenAI-compatible endpoint. Requests are sent directly from the browser.
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
                      setProvider({ ...provider, id: "custom", name: event.target.value })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="provider-model">Model</Label>
                  <Input
                    id="provider-model"
                    value={provider.model}
                    onChange={(event) =>
                      setProvider({ ...provider, id: "custom", model: event.target.value })
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
                    setProvider({ ...provider, id: "custom", baseUrl: event.target.value })
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
                    setProvider({ ...provider, id: "custom", apiKey: event.target.value })
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
                {isLoadingModels ? (
                  <RefreshCcw className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Load models
              </Button>

              {models.length > 0 && (
                <div className="grid gap-2">
                  <Label>Detected models</Label>
                  <Select
                    value={provider.model}
                    onValueChange={(model) => setProvider({ ...provider, model })}
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
                Cloud API keys are stored in localStorage and used directly in the browser. This is intended for a local personal app, not a public deployment.
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="border-t px-5 py-4">
            <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
