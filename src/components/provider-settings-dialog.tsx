"use client";

import {
  Copy,
  Eye,
  EyeOff,
  MoreVertical,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  formatOptionalNumber,
  normalizeProviderForState,
  normalizeProviderModels,
  parseOptionalNumber,
  providerDisplayName,
  sanitizeGenerationSettings,
} from "@/lib/ai-chat/chat-utils";
import {
  defaultGenerationSettings,
  defaultProvider,
  providerPresets,
} from "@/lib/ai-chat/provider-presets";
import { saveCachedProviderModels } from "@/lib/ai-chat/storage";
import type {
  ProviderConfig,
  ProviderGenerationSettings,
  ProvidersState,
} from "@/lib/ai-chat/types";
import { cn } from "@/lib/utils";
import {
  getActiveModelSettings,
  loadProviderModels,
} from "@/lib/ai-chat/direct-provider-client";

type ModelLoadStatus = "idle" | "success" | "empty" | "error";

type ProviderSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: ProviderConfig[];
  activeProvider: ProviderConfig;
  onProvidersStateChange: (
    updater: (state: ProvidersState) => ProvidersState,
  ) => void;
  onProviderSettingChange: (patch: Partial<ProviderConfig>) => void;
  onAddProvider: () => void;
  onDuplicateProvider: (providerId: string) => void;
  onDeleteProvider: (providerId: string) => void;
  onSave: () => void;
  showSuccess: (message: string, description?: string) => void;
};

export const ProviderSettingsDialog = memo(function ProviderSettingsDialog({
  open,
  onOpenChange,
  providers,
  activeProvider,
  onProvidersStateChange,
  onProviderSettingChange,
  onAddProvider,
  onDuplicateProvider,
  onDeleteProvider,
  onSave,
  showSuccess,
}: ProviderSettingsDialogProps) {
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelLoadStatus, setModelLoadStatus] =
    useState<ModelLoadStatus>("idle");
  const modelLoadStatusTimerRef = useRef<number | null>(null);

  const activeModelSettings = useMemo(
    () => getActiveModelSettings({ ...activeProvider, model: "" }),
    [activeProvider],
  );

  useEffect(() => {
    return () => {
      if (modelLoadStatusTimerRef.current !== null) {
        window.clearTimeout(modelLoadStatusTimerRef.current);
      }
    };
  }, []);

  function setTemporaryModelLoadStatus(status: Exclude<ModelLoadStatus, "idle">) {
    setModelLoadStatus(status);

    if (modelLoadStatusTimerRef.current !== null) {
      window.clearTimeout(modelLoadStatusTimerRef.current);
    }

    modelLoadStatusTimerRef.current = window.setTimeout(() => {
      setModelLoadStatus("idle");
      modelLoadStatusTimerRef.current = null;
    }, 1800);
  }

  function getLoadModelsButtonLabel(provider = activeProvider) {
    if (isLoadingModels) return "Loading models...";
    if (modelLoadStatus === "success") {
      const count = provider.models?.length ?? 0;
      return `Loaded ${count} model${count === 1 ? "" : "s"}`;
    }
    if (modelLoadStatus === "empty") return "No models returned";
    if (modelLoadStatus === "error") return "Model lookup failed";

    return "Load models";
  }

  async function loadModelsFromProvider(providerForLoad = activeProvider) {
    setIsLoadingModels(true);
    setModelLoadStatus("idle");

    if (modelLoadStatusTimerRef.current !== null) {
      window.clearTimeout(modelLoadStatusTimerRef.current);
      modelLoadStatusTimerRef.current = null;
    }

    try {
      const loadedModels = await loadProviderModels(providerForLoad);
      await saveCachedProviderModels(providerForLoad, loadedModels);

      onProvidersStateChange((currentState) => ({
        ...currentState,
        providers: currentState.providers.map((provider) => {
          if (provider.id !== providerForLoad.id) return provider;

          const enabledModelIds = normalizeProviderModels(
            (provider.enabledModelIds ?? []).filter((model) =>
              loadedModels.includes(model),
            ),
          );
          const model = enabledModelIds.includes(provider.model)
            ? provider.model
            : "";

          return normalizeProviderForState({
            ...provider,
            models: loadedModels,
            enabledModelIds,
            model,
          });
        }),
      }));

      setTemporaryModelLoadStatus(loadedModels.length ? "success" : "empty");
    } catch (error) {
      setTemporaryModelLoadStatus("error");
      console.error("Model lookup failed:", error);
    } finally {
      setIsLoadingModels(false);
    }
  }

  function applyPreset(id: string) {
    const preset = providerPresets.find((item) => item.id === id);
    if (!preset) return;

    onProviderSettingChange({
      ...preset,
      id: activeProvider.id,
      defaultSettings: {
        ...defaultGenerationSettings,
        ...(preset.defaultSettings ?? {}),
      },
      modelSettings: preset.modelSettings ?? {},
    });
    setModelLoadStatus("idle");
    showSuccess("Provider preset loaded", preset.name);
  }

  function toggleVisibleModel(model: string, checked: boolean) {
    const normalizedModel = model.trim();
    if (!normalizedModel) return;

    onProvidersStateChange((currentState) => ({
      ...currentState,
      providers: currentState.providers.map((provider) => {
        if (provider.id !== currentState.activeProviderId) return provider;

        const enabledModelIds = checked
          ? normalizeProviderModels([
              ...(provider.enabledModelIds ?? []),
              normalizedModel,
            ])
          : normalizeProviderModels(
              (provider.enabledModelIds ?? []).filter(
                (item) => item !== normalizedModel,
              ),
            );
        const model = enabledModelIds.includes(provider.model)
          ? provider.model
          : "";

        return normalizeProviderForState({
          ...provider,
          models: normalizeProviderModels([
            ...(provider.models ?? []),
            normalizedModel,
          ]),
          enabledModelIds,
          model,
        });
      }),
    }));
  }

  function updateActiveModelSettings(patch: ProviderGenerationSettings) {
    onProviderSettingChange({
      defaultSettings: sanitizeGenerationSettings({
        ...defaultGenerationSettings,
        ...(activeProvider.defaultSettings ?? {}),
        ...patch,
      }),
    });
  }

  function resetActiveModelSettings() {
    onProviderSettingChange({ defaultSettings: defaultGenerationSettings });
  }

  function resetSelectedProvider() {
    onProviderSettingChange({
      ...defaultProvider,
      id: activeProvider.id,
      defaultSettings: defaultGenerationSettings,
      modelSettings: {},
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(1000px,calc(100dvh-2rem))] max-h-none flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <DialogTitle>Providers</DialogTitle>
          <DialogDescription>
            Manage providers, choose visible models, and configure generation
            defaults.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b bg-card/70 p-3 md:border-b-0 md:border-r">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Providers
              </Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 rounded-lg px-2 text-sm"
                onClick={onAddProvider}
              >
                <Plus className="size-3.5" />
                Add
              </Button>
            </div>

            <div className="grid gap-1.5">
              {providers.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "group flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    item.id === activeProvider.id
                      ? "border-primary/30 bg-accent text-accent-foreground"
                      : "border-transparent hover:border-border hover:bg-muted/60",
                  )}
                  onClick={() =>
                    onProvidersStateChange((currentState) => ({
                      ...currentState,
                      activeProviderId: item.id,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onProvidersStateChange((currentState) => ({
                        ...currentState,
                        activeProviderId: item.id,
                      }));
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base leading-6">
                      {providerDisplayName(item)}
                    </div>
                    <div className="truncate text-sm leading-5 text-muted-foreground">
                      {(item.enabledModelIds ?? []).length} visible ·{" "}
                      {item.baseUrl || "No base URL"}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 shrink-0 rounded-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                        title="Provider actions"
                      >
                        <MoreVertical className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-lg">
                      <DropdownMenuItem
                        onClick={(event) => {
                          event.stopPropagation();
                          onDuplicateProvider(item.id);
                        }}
                      >
                        <Copy className="size-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={providers.length <= 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteProvider(item.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="grid gap-5 pb-1">
              <div className="grid gap-2">
                <Label>Preset</Label>
                <Select value="" onValueChange={applyPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Load a preset into selected provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providerPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="provider-name">Provider name</Label>
                  <Input
                    id="provider-name"
                    value={activeProvider.name}
                    onChange={(event) =>
                      onProviderSettingChange({ name: event.target.value })
                    }
                    placeholder="Provide the provider name"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="provider-url">Base URL</Label>
                  <Input
                    id="provider-url"
                    value={activeProvider.baseUrl}
                    onChange={(event) =>
                      onProviderSettingChange({ baseUrl: event.target.value })
                    }
                    placeholder="http://localhost:1234/v1"
                  />
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="provider-api-key">API key</Label>
                  <div className="relative">
                    <Input
                      id="provider-api-key"
                      value={activeProvider.apiKey}
                      onChange={(event) =>
                        onProviderSettingChange({ apiKey: event.target.value })
                      }
                      placeholder="Provide your API key"
                      type={isApiKeyVisible ? "text" : "password"}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-lg text-muted-foreground"
                      onClick={() => setIsApiKeyVisible((current) => !current)}
                      title={isApiKeyVisible ? "Hide API key" : "Show API key"}
                    >
                      {isApiKeyVisible ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Label>Visible models</Label>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      Only checked models appear in the sidebar model selector.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => loadModelsFromProvider(activeProvider)}
                      disabled={isLoadingModels || !activeProvider.baseUrl.trim()}
                    >
                      <RefreshCcw
                        className={cn(
                          "size-4",
                          isLoadingModels && "animate-spin",
                        )}
                      />
                      {getLoadModelsButtonLabel(activeProvider)}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-lg"
                      onClick={() =>
                        onProviderSettingChange({
                          enabledModelIds: normalizeProviderModels(
                            activeProvider.models ?? [],
                          ),
                        })
                      }
                      disabled={(activeProvider.models ?? []).length === 0}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-lg"
                      onClick={() =>
                        onProviderSettingChange({
                          enabledModelIds: [],
                          model: "",
                        })
                      }
                      disabled={(activeProvider.enabledModelIds ?? []).length === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-lg border bg-background p-2">
                  {(activeProvider.models ?? []).length > 0 ? (
                    <div className="grid gap-1">
                      {(activeProvider.models ?? []).map((model) => {
                        const checked = (
                          activeProvider.enabledModelIds ?? []
                        ).includes(model);

                        return (
                          <label
                            key={model}
                            className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-base hover:bg-accent hover:text-accent-foreground"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) =>
                                toggleVisibleModel(
                                  model,
                                  event.target.checked,
                                )
                              }
                              className="size-4 shrink-0 accent-primary"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {model}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="px-2 py-4 text-base text-muted-foreground">
                      Load models to choose which ones should be visible.
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Generation settings</Label>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      Saved per selected provider and used for that provider's
                      visible models.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-lg"
                    onClick={resetActiveModelSettings}
                  >
                    Reset
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="generation-temperature">Temperature</Label>
                    <Input
                      id="generation-temperature"
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={formatOptionalNumber(activeModelSettings.temperature)}
                      onChange={(event) =>
                        updateActiveModelSettings({
                          temperature: parseOptionalNumber(event.target.value),
                        })
                      }
                      placeholder="Provider default"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="generation-top-p">Top P</Label>
                    <Input
                      id="generation-top-p"
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={formatOptionalNumber(activeModelSettings.topP)}
                      onChange={(event) =>
                        updateActiveModelSettings({
                          topP: parseOptionalNumber(event.target.value),
                        })
                      }
                      placeholder="Provider default"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="generation-max-tokens">Max tokens</Label>
                    <Input
                      id="generation-max-tokens"
                      type="number"
                      min="1"
                      step="1"
                      value={formatOptionalNumber(activeModelSettings.maxTokens)}
                      onChange={(event) =>
                        updateActiveModelSettings({
                          maxTokens: parseOptionalNumber(event.target.value),
                        })
                      }
                      placeholder="Provider default"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Thinking controls</Label>
                    <Select
                      value={activeModelSettings.reasoningMode ?? "auto"}
                      onValueChange={(reasoningMode) =>
                        updateActiveModelSettings({
                          reasoningMode:
                            reasoningMode as ProviderGenerationSettings["reasoningMode"],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                        <SelectItem value="enabled">Force enabled</SelectItem>
                        <SelectItem value="off">Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Reasoning effort</Label>
                    <Select
                      value={activeModelSettings.reasoningEffort ?? "medium"}
                      onValueChange={(reasoningEffort) =>
                        updateActiveModelSettings({
                          reasoningEffort:
                            reasoningEffort as ProviderGenerationSettings["reasoningEffort"],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="generation-timeout">Request timeout, ms</Label>
                    <Input
                      id="generation-timeout"
                      type="number"
                      min="1000"
                      step="1000"
                      value={formatOptionalNumber(
                        activeModelSettings.requestTimeoutMs,
                      )}
                      onChange={(event) =>
                        updateActiveModelSettings({
                          requestTimeoutMs: parseOptionalNumber(
                            event.target.value,
                          ),
                        })
                      }
                      placeholder="30000"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="h-[72px] shrink-0 items-center border-t px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            className="rounded-lg"
            onClick={resetSelectedProvider}
          >
            Reset selected provider
          </Button>
          <Button type="button" className="rounded-lg" onClick={onSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
