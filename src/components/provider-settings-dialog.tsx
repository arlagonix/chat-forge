"use client";

import {
  Copy,
  Eye,
  EyeOff,
  MoreVertical,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { ComponentProps } from "react";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

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
import { Switch } from "@/components/ui/switch";
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog";
import {
  createNewProvider,
  formatOptionalNumber,
  getModelConfig,
  getProviderModelIds,
  getShownProviderModels,
  isModelEnabled,
  isModelShownInMenu,
  isProviderEnabled,
  normalizeProviderForState,
  normalizeProviderModels,
  providerDisplayName,
  sanitizeGenerationSettings,
} from "@/lib/ai-chat/chat-utils";
import {
  getActiveModelSettings,
  loadProviderModels,
} from "@/lib/ai-chat/direct-provider-client";
import { defaultGenerationSettings } from "@/lib/ai-chat/provider-presets";
import { saveCachedProviderModels } from "@/lib/ai-chat/storage";
import type {
  ProviderConfig,
  ProviderGenerationSettings,
  ProviderModelConfig,
  ProvidersState,
} from "@/lib/ai-chat/types";
import { cn } from "@/lib/utils";

const EMPTY_MODEL_CONFIG: ProviderModelConfig = {};

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
  onSave: (providersStateOverride?: ProvidersState) => void;
  showSuccess: (message: string, description?: string) => void;
};

function modelConfigWithPatch(
  current: ProviderModelConfig | undefined,
  patch: Partial<ProviderModelConfig>,
): ProviderModelConfig {
  return {
    ...(current ?? EMPTY_MODEL_CONFIG),
    ...patch,
  };
}

function providerDraftKey(provider: ProviderConfig) {
  return JSON.stringify(normalizeProviderForState(provider));
}

function providerUniqueName(provider: ProviderConfig) {
  return providerDisplayName(provider).trim().toLowerCase();
}

type BufferedTextInputProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

const BufferedTextInput = memo(function BufferedTextInput({
  value,
  onValueChange,
  ...props
}: BufferedTextInputProps) {
  const [draftValue, setDraftValue] = useState(value);
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (
      typeof props.id === "string" &&
      document.activeElement?.id === props.id
    ) {
      return;
    }
    setDraftValue(value);
  }, [props.id, value]);

  return (
    <Input
      {...props}
      value={draftValue}
      onChange={(event) => {
        const nextValue = event.target.value;
        setDraftValue(nextValue);
        startTransition(() => onValueChange(nextValue));
      }}
    />
  );
});

type PositiveIntegerInputProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "inputMode" | "pattern"
> & {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
};

const PositiveIntegerInput = memo(function PositiveIntegerInput({
  value,
  onValueChange,
  ...props
}: PositiveIntegerInputProps) {
  const [draftValue, setDraftValue] = useState(formatOptionalNumber(value));
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (
      typeof props.id === "string" &&
      document.activeElement?.id === props.id
    ) {
      return;
    }
    setDraftValue(formatOptionalNumber(value));
  }, [props.id, value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draftValue}
      onChange={(event) => {
        const nextValue = event.target.value.trim();
        if (nextValue !== "" && !/^[1-9]\d*$/.test(nextValue)) return;

        setDraftValue(nextValue);
        startTransition(() => {
          onValueChange(nextValue === "" ? undefined : Number(nextValue));
        });
      }}
    />
  );
});

type BoundedDecimalInputProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "inputMode" | "pattern" | "min" | "max"
> & {
  value: number | undefined;
  min: number;
  max: number;
  onValueChange: (value: number | undefined) => void;
};

const BoundedDecimalInput = memo(function BoundedDecimalInput({
  value,
  min,
  max,
  onValueChange,
  ...props
}: BoundedDecimalInputProps) {
  const [draftValue, setDraftValue] = useState(formatOptionalNumber(value));
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (
      typeof props.id === "string" &&
      document.activeElement?.id === props.id
    ) {
      return;
    }
    setDraftValue(formatOptionalNumber(value));
  }, [props.id, value]);

  function commit(nextValue: string) {
    if (nextValue === "") {
      startTransition(() => onValueChange(undefined));
      return;
    }

    if (nextValue.endsWith(".")) return;

    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
    startTransition(() => onValueChange(parsed));
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={draftValue}
      onBlur={() => {
        if (draftValue.endsWith(".")) {
          const normalized = draftValue.slice(0, -1);
          setDraftValue(normalized);
          commit(normalized);
        }
      }}
      onChange={(event) => {
        const nextValue = event.target.value.trim();
        if (nextValue !== "" && !/^\d+(?:\.\d*)?$/.test(nextValue)) return;

        if (nextValue !== "") {
          const parsed = Number(nextValue);
          if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
        }

        setDraftValue(nextValue);
        commit(nextValue);
      }}
    />
  );
});

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
  const [providerSearchQuery, setProviderSearchQuery] = useState("");
  const [loadedModelSearchQuery, setLoadedModelSearchQuery] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();
  const [newProviderDraft, setNewProviderDraft] =
    useState<ProviderConfig | null>(null);
  const [newProviderInitialDraft, setNewProviderInitialDraft] =
    useState<ProviderConfig | null>(null);
  const [editingProviderDraft, setEditingProviderDraft] =
    useState<ProviderConfig>(() => normalizeProviderForState(activeProvider));
  const [customModelValue, setCustomModelValue] = useState("");
  const [unsavedChangesDialogOpen, setUnsavedChangesDialogOpen] =
    useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const modelLoadStatusTimerRef = useRef<number | null>(null);
  const activeProviderModelIds = useMemo(
    () => getProviderModelIds(editingProviderDraft),
    [editingProviderDraft],
  );
  const editingProvider = newProviderDraft ?? editingProviderDraft;
  const isCreatingProvider = newProviderDraft !== null;

  const selectedModel =
    selectedModelId && activeProviderModelIds.includes(selectedModelId)
      ? selectedModelId
      : undefined;
  const selectedModelSettings = useMemo(
    () =>
      selectedModel
        ? getActiveModelSettings({
            ...editingProviderDraft,
            model: selectedModel,
          })
        : undefined,
    [editingProviderDraft, selectedModel],
  );
  const selectedModelConfig = selectedModel
    ? getModelConfig(editingProviderDraft, selectedModel)
    : undefined;
  const hasDraftChanges = newProviderDraft
    ? !newProviderInitialDraft ||
      providerDraftKey(newProviderDraft) !==
        providerDraftKey(newProviderInitialDraft)
    : providerDraftKey(editingProviderDraft) !==
      providerDraftKey(activeProvider);
  const duplicateProvider = useMemo(() => {
    const draftName = providerUniqueName(editingProvider);
    if (!draftName) return undefined;

    return providers.find((provider) => {
      if (providerUniqueName(provider) !== draftName) return false;
      return isCreatingProvider || provider.id !== editingProvider.id;
    });
  }, [editingProvider, isCreatingProvider, providers]);
  const providerNameValidationError = duplicateProvider
    ? `A provider named "${providerDisplayName(editingProvider)}" already exists.`
    : undefined;
  const canSaveDraft = hasDraftChanges && !providerNameValidationError;
  const canCreateProvider = !providerNameValidationError;

  useEffect(() => {
    return () => {
      if (modelLoadStatusTimerRef.current !== null) {
        window.clearTimeout(modelLoadStatusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setEditingProviderDraft(normalizeProviderForState(activeProvider));
  }, [activeProvider.id, open]);

  useEffect(() => {
    if (selectedModelId && !activeProviderModelIds.includes(selectedModelId)) {
      setSelectedModelId(undefined);
    }
  }, [activeProvider.id, activeProviderModelIds, selectedModelId]);

  useEffect(() => {
    setCustomModelValue("");
    setLoadedModelSearchQuery("");
  }, [editingProvider.id]);

  function setTemporaryModelLoadStatus(
    status: Exclude<ModelLoadStatus, "idle">,
  ) {
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

  function discardCurrentDraftChanges() {
    setPendingAction(null);
    setNewProviderDraft(null);
    setNewProviderInitialDraft(null);
    setEditingProviderDraft(normalizeProviderForState(activeProvider));
    setCustomModelValue("");
    setLoadedModelSearchQuery("");
  }

  function requestWithUnsavedCheck(action: () => void) {
    if (hasDraftChanges) {
      setPendingAction(() => action);
      setUnsavedChangesDialogOpen(true);
      return;
    }

    action();
  }

  function confirmDiscardUnsavedChanges() {
    const action = pendingAction;
    setPendingAction(null);
    setUnsavedChangesDialogOpen(false);
    discardCurrentDraftChanges();
    if (action) action();
  }

  function requestOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    requestWithUnsavedCheck(() => onOpenChange(false));
  }

  function selectProvider(providerId: string) {
    requestWithUnsavedCheck(() => {
      setNewProviderDraft(null);
      setNewProviderInitialDraft(null);
      setSelectedModelId(undefined);
      onProvidersStateChange((currentState) => ({
        ...currentState,
        activeProviderId: providerId,
      }));
    });
  }

  function selectModel(providerId: string, model: string) {
    requestWithUnsavedCheck(() => {
      setNewProviderDraft(null);
      setNewProviderInitialDraft(null);
      setSelectedModelId(model);
      onProvidersStateChange((currentState) => ({
        ...currentState,
        activeProviderId: providerId,
      }));
    });
  }

  function startCreateProvider() {
    requestWithUnsavedCheck(() => {
      const provider = createNewProvider();
      setSelectedModelId(undefined);
      setCustomModelValue("");
      setLoadedModelSearchQuery("");
      setNewProviderDraft(provider);
      setNewProviderInitialDraft(provider);
    });
  }

  function cancelCreateProvider() {
    requestWithUnsavedCheck(() => {
      setNewProviderDraft(null);
      setNewProviderInitialDraft(null);
      setCustomModelValue("");
      setLoadedModelSearchQuery("");
    });
  }

  function createProviderFromDraft() {
    if (!newProviderDraft || !canCreateProvider) return;

    const provider = normalizeProviderForState(newProviderDraft);
    onProvidersStateChange((currentState) => ({
      ...currentState,
      providers: [...currentState.providers, provider],
      activeProviderId: provider.id,
    }));
    setNewProviderDraft(null);
    setNewProviderInitialDraft(null);
    setEditingProviderDraft(provider);
    setSelectedModelId(undefined);
  }

  function buildProvidersStateWithProvider(
    providerForSave: ProviderConfig,
  ): ProvidersState {
    const normalizedProvider = normalizeProviderForState(providerForSave);
    const nextProviders = providers.map((provider) =>
      provider.id === normalizedProvider.id ? normalizedProvider : provider,
    );

    return {
      providers: nextProviders,
      activeProviderId: normalizedProvider.id,
    };
  }

  function resetEditingProvider() {
    setEditingProviderDraft(normalizeProviderForState(activeProvider));
    setCustomModelValue("");
    setLoadedModelSearchQuery("");
  }

  function saveEditingProvider() {
    if (!canSaveDraft) return;

    const nextState = buildProvidersStateWithProvider(editingProviderDraft);
    onProvidersStateChange(() => nextState);
    onSave(nextState);
  }

  function updateProviderInState(
    providerId: string,
    updater: (provider: ProviderConfig) => ProviderConfig,
  ) {
    onProvidersStateChange((currentState) => ({
      ...currentState,
      providers: currentState.providers.map((provider) =>
        provider.id === providerId
          ? normalizeProviderForState(updater(provider))
          : provider,
      ),
    }));
  }

  function updateEditingProvider(
    updater: (provider: ProviderConfig) => ProviderConfig,
  ) {
    if (newProviderDraft) {
      setNewProviderDraft((current) =>
        current ? normalizeProviderForState(updater(current)) : current,
      );
      return;
    }

    setEditingProviderDraft((current) =>
      normalizeProviderForState(updater(current)),
    );
  }

  function updateEditingProviderSetting(patch: Partial<ProviderConfig>) {
    if (newProviderDraft) {
      setNewProviderDraft((current) =>
        current ? normalizeProviderForState({ ...current, ...patch }) : current,
      );
      return;
    }

    setEditingProviderDraft((current) =>
      normalizeProviderForState({ ...current, ...patch, id: current.id }),
    );
  }

  function toggleProvider(providerId: string, checked: boolean) {
    if (!newProviderDraft && providerId === activeProvider.id) {
      setEditingProviderDraft((current) =>
        normalizeProviderForState({ ...current, enabled: checked }),
      );
    }

    updateProviderInState(providerId, (provider) => ({
      ...provider,
      enabled: checked,
    }));
  }

  function toggleModel(providerId: string, model: string, checked: boolean) {
    if (!newProviderDraft && providerId === activeProvider.id) {
      setEditingProviderDraft((current) => {
        const currentConfig = current.modelConfigs?.[model] ?? {};
        return normalizeProviderForState({
          ...current,
          modelConfigs: {
            ...(current.modelConfigs ?? {}),
            [model]: modelConfigWithPatch(currentConfig, {
              enabled: checked,
            }),
          },
        });
      });
    }

    updateProviderInState(providerId, (provider) => {
      const currentConfig = provider.modelConfigs?.[model] ?? {};
      return {
        ...provider,
        modelConfigs: {
          ...(provider.modelConfigs ?? {}),
          [model]: modelConfigWithPatch(currentConfig, {
            enabled: checked,
          }),
        },
      };
    });
  }

  function toggleEditingModelShownInMenu(model: string, checked: boolean) {
    updateEditingProvider((provider) => {
      const currentConfig = provider.modelConfigs?.[model] ?? {};
      return {
        ...provider,
        modelConfigs: {
          ...(provider.modelConfigs ?? {}),
          [model]: modelConfigWithPatch(currentConfig, {
            showInMenu: checked,
          }),
        },
      };
    });
  }

  function applyLoadedModelsToProvider(
    provider: ProviderConfig,
    loadedModelIds: string[],
    loadedModels: Awaited<ReturnType<typeof loadProviderModels>>,
  ) {
    const loadedModelIdSet = new Set(loadedModelIds);
    const loadedModelsById = new Map(
      loadedModels.map((loadedModel) => [loadedModel.id, loadedModel]),
    );
    const modelConfigs: Record<string, ProviderModelConfig> = {};

    for (const loadedModelId of loadedModelIds) {
      const loadedModel = loadedModelsById.get(loadedModelId);
      const currentConfig = provider.modelConfigs?.[loadedModelId] ?? {};
      const context = { ...(currentConfig.context ?? {}) };
      if (loadedModel?.contextLength !== undefined) {
        if (loadedModel.contextLengthSource === "detected") {
          context.detectedContextLength = loadedModel.contextLength;
        } else {
          context.speculatedContextLength = loadedModel.contextLength;
        }
      }

      const enabled =
        typeof currentConfig.enabled === "boolean"
          ? currentConfig.enabled
          : false;
      const showInMenu =
        typeof currentConfig.showInMenu === "boolean"
          ? currentConfig.showInMenu
          : false;

      modelConfigs[loadedModelId] = {
        ...currentConfig,
        enabled,
        showInMenu,
        context,
      };
    }

    const customModelIds = normalizeProviderModels(
      provider.customModels ?? [],
    ).filter((modelId) => !loadedModelIdSet.has(modelId));

    for (const customModelId of customModelIds) {
      const currentConfig = provider.modelConfigs?.[customModelId] ?? {};
      const enabled =
        typeof currentConfig.enabled === "boolean"
          ? currentConfig.enabled
          : true;
      const showInMenu =
        typeof currentConfig.showInMenu === "boolean"
          ? currentConfig.showInMenu
          : enabled;

      modelConfigs[customModelId] = {
        ...currentConfig,
        enabled,
        showInMenu,
      };
    }

    const availableModelIds = normalizeProviderModels([
      ...loadedModelIds,
      ...customModelIds,
    ]);
    const selectedModelStillExists = availableModelIds.includes(provider.model);
    const fallbackModel =
      (selectedModelStillExists ? provider.model : "") ||
      availableModelIds.find((modelId) => {
        const config = modelConfigs[modelId];
        return config.enabled !== false && config.showInMenu !== false;
      }) ||
      provider.model ||
      "";

    return normalizeProviderForState({
      ...provider,
      model: fallbackModel,
      models: loadedModelIds,
      customModels: customModelIds,
      modelConfigs,
      enabledModelIds: [],
      modelSettings: {},
    });
  }

  async function loadModelsFromProvider(providerForLoad = editingProvider) {
    setIsLoadingModels(true);
    setModelLoadStatus("idle");

    if (modelLoadStatusTimerRef.current !== null) {
      window.clearTimeout(modelLoadStatusTimerRef.current);
      modelLoadStatusTimerRef.current = null;
    }

    try {
      const loadedModels = await loadProviderModels(providerForLoad);
      const loadedModelIds = normalizeProviderModels(
        loadedModels.map((model) => model.id),
      );
      await saveCachedProviderModels(providerForLoad, loadedModelIds);

      if (newProviderDraft?.id === providerForLoad.id) {
        setNewProviderDraft((current) =>
          current
            ? applyLoadedModelsToProvider(current, loadedModelIds, loadedModels)
            : current,
        );
      } else {
        setEditingProviderDraft((current) =>
          current.id === providerForLoad.id
            ? applyLoadedModelsToProvider(current, loadedModelIds, loadedModels)
            : current,
        );
      }

      setTemporaryModelLoadStatus(loadedModelIds.length ? "success" : "empty");
    } catch (error) {
      setTemporaryModelLoadStatus("error");
      console.error("Model lookup failed:", error);
    } finally {
      setIsLoadingModels(false);
    }
  }

  function addCustomModel() {
    const model = customModelValue.trim();
    if (!model) return;

    updateEditingProvider((provider) => {
      const loadedModels = normalizeProviderModels(provider.models ?? []);
      const customModels = normalizeProviderModels(provider.customModels ?? []);
      const isLoadedModel = loadedModels.includes(model);
      const nextCustomModels = isLoadedModel
        ? customModels
        : normalizeProviderModels([...customModels, model]);
      const currentConfig = provider.modelConfigs?.[model] ?? {};

      return {
        ...provider,
        customModels: nextCustomModels,
        modelConfigs: {
          ...(provider.modelConfigs ?? {}),
          [model]: modelConfigWithPatch(currentConfig, {
            enabled: true,
            showInMenu: true,
          }),
        },
      };
    });
    setCustomModelValue("");
  }

  function deleteCustomModel(model: string) {
    updateEditingProvider((provider) => {
      const normalizedModel = model.trim();
      const loadedModels = normalizeProviderModels(provider.models ?? []);
      const customModels = normalizeProviderModels(
        provider.customModels ?? [],
      ).filter((customModel) => customModel !== normalizedModel);
      const modelConfigs = { ...(provider.modelConfigs ?? {}) };

      if (!loadedModels.includes(normalizedModel)) {
        delete modelConfigs[normalizedModel];
      }

      return {
        ...provider,
        model: provider.model === normalizedModel ? "" : provider.model,
        customModels,
        modelConfigs,
      };
    });
  }

  function updateSelectedModelConfig(patch: Partial<ProviderModelConfig>) {
    if (!selectedModel) return;

    updateEditingProvider((provider) => {
      const currentConfig = provider.modelConfigs?.[selectedModel] ?? {};
      return {
        ...provider,
        modelConfigs: {
          ...(provider.modelConfigs ?? {}),
          [selectedModel]: modelConfigWithPatch(currentConfig, patch),
        },
      };
    });
  }

  function updateSelectedModelGenerationSettings(
    patch: ProviderGenerationSettings,
  ) {
    updateSelectedModelConfig(
      sanitizeGenerationSettings({
        ...(selectedModelSettings ?? defaultGenerationSettings),
        ...patch,
      }),
    );
  }

  const filteredProviders = useMemo(() => {
    const query = providerSearchQuery.trim().toLowerCase();

    return providers
      .map((provider, index) => ({ provider, index }))
      .filter(({ provider }) => {
        if (!query) return true;
        const name = providerDisplayName(provider).toLowerCase();
        const baseUrl = provider.baseUrl.toLowerCase();
        return name.includes(query) || baseUrl.includes(query);
      })
      .sort((first, second) => {
        const firstEnabled = isProviderEnabled(first.provider);
        const secondEnabled = isProviderEnabled(second.provider);
        if (firstEnabled !== secondEnabled) return firstEnabled ? -1 : 1;
        return first.index - second.index;
      })
      .map(({ provider }) => provider);
  }, [providers, providerSearchQuery]);

  const editingProviderEnabled = isProviderEnabled(editingProvider);
  const editingProviderLoadedModels = useMemo(
    () => normalizeProviderModels(editingProvider.models ?? []),
    [editingProvider.models],
  );
  const filteredLoadedModels = useMemo(() => {
    const query = loadedModelSearchQuery.trim().toLowerCase();
    return editingProviderLoadedModels
      .map((model, index) => ({ model, index }))
      .filter(({ model }) =>
        query ? model.toLowerCase().includes(query) : true,
      )
      .sort((first, second) => {
        const firstShown = isModelShownInMenu(editingProvider, first.model);
        const secondShown = isModelShownInMenu(editingProvider, second.model);
        if (firstShown !== secondShown) return firstShown ? -1 : 1;
        return first.index - second.index;
      })
      .map(({ model }) => model);
  }, [
    editingProvider.enabled,
    editingProvider.modelConfigs,
    editingProviderLoadedModels,
    loadedModelSearchQuery,
  ]);

  const selectedModelThinkingMode = (() => {
    if (selectedModelSettings?.reasoningMode === "off") return "off";
    if (selectedModelSettings?.reasoningMode === "enabled") {
      return selectedModelSettings.reasoningEffort ?? "medium";
    }
    return "auto";
  })();

  function updateSelectedModelThinkingMode(value: string) {
    if (value === "auto") {
      updateSelectedModelGenerationSettings({
        reasoningMode: "auto",
        reasoningEffort: undefined,
      });
      return;
    }

    if (value === "off") {
      updateSelectedModelGenerationSettings({
        reasoningMode: "off",
        reasoningEffort: "low",
      });
      return;
    }

    if (value === "low" || value === "medium" || value === "high") {
      updateSelectedModelGenerationSettings({
        reasoningMode: "enabled",
        reasoningEffort: value,
      });
    }
  }

  function updateSelectedModelMaxTokens(maxTokens: number | undefined) {
    updateSelectedModelGenerationSettings({ maxTokens });
  }

  function updateSelectedModelManualContext(
    manualContextLength: number | undefined,
  ) {
    if (!selectedModel) return;

    updateSelectedModelConfig({
      context: {
        ...(selectedModelConfig?.context ?? {}),
        manualContextLength,
      },
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent
          className="flex h-[min(1000px,calc(100dvh-2rem))] max-h-none flex-col gap-0 overflow-hidden p-0 outline-none focus:outline-none focus-visible:ring-0 sm:max-w-6xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>Providers</DialogTitle>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[400px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-b bg-card/70 md:border-b-0 md:border-r">
              <div className="shrink-0 border-b bg-card/90 p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={providerSearchQuery}
                    onChange={(event) =>
                      setProviderSearchQuery(event.target.value)
                    }
                    placeholder="Search providers"
                    aria-label="Search providers by name or base URL"
                    autoFocus={false}
                    className="h-9 pl-8 pr-8"
                  />
                  {providerSearchQuery ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setProviderSearchQuery("")}
                      title="Clear search"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div>
                  {filteredProviders.length > 0 ? (
                    filteredProviders.map((item) => {
                      const providerEnabled = isProviderEnabled(item);
                      const shownModels = getShownProviderModels(item);
                      const modelCount = shownModels.length;
                      const providerSelected =
                        !isCreatingProvider &&
                        item.id === activeProvider.id &&
                        !selectedModel;

                      return (
                        <div
                          key={item.id}
                          className="border-b last:border-b-0 pl-2 py-1"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            className={cn(
                              "group flex min-w-0 cursor-pointer items-center gap-2 px-2 py-2 outline-none",
                              providerSelected
                                ? "bg-accent text-accent-foreground"
                                : "hover:bg-muted/60",
                            )}
                            onClick={() => selectProvider(item.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                selectProvider(item.id);
                              }
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-medium leading-6">
                                {providerDisplayName(item)}
                              </div>
                              <div className="truncate text-sm leading-5 text-muted-foreground">
                                {item.baseUrl || "No base URL"}
                              </div>
                            </div>

                            <Switch
                              aria-label={`${providerDisplayName(item)} provider`}
                              checked={providerEnabled}
                              onClick={(event) => event.stopPropagation()}
                              onCheckedChange={(checked) =>
                                toggleProvider(item.id, checked)
                              }
                              title={
                                providerEnabled
                                  ? "Disable provider"
                                  : "Enable provider"
                              }
                            />
                          </div>

                          <div className="grid gap-1 pl-4">
                            {modelCount > 0 ? (
                              shownModels.map((model) => {
                                const modelSelected =
                                  !isCreatingProvider &&
                                  item.id === activeProvider.id &&
                                  selectedModel === model;
                                const checked =
                                  providerEnabled &&
                                  isModelEnabled(item, model);

                                return (
                                  <div
                                    key={`${item.id}:${model}`}
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                      "flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1.5 outline-none",
                                      modelSelected
                                        ? "bg-accent text-accent-foreground"
                                        : "hover:bg-muted/60",
                                      !providerEnabled &&
                                        "cursor-default opacity-50 hover:bg-transparent",
                                    )}
                                    onClick={() => selectModel(item.id, model)}
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                      ) {
                                        event.preventDefault();
                                        selectModel(item.id, model);
                                      }
                                    }}
                                    title={model}
                                  >
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5">
                                      {model}
                                    </span>
                                    <Switch
                                      aria-label={`${providerDisplayName(item)} ${model} model`}
                                      checked={checked}
                                      disabled={!providerEnabled}
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                      onCheckedChange={(nextChecked) =>
                                        toggleModel(item.id, model, nextChecked)
                                      }
                                      title={
                                        checked
                                          ? "Disable model"
                                          : "Enable model"
                                      }
                                    />
                                  </div>
                                );
                              })
                            ) : (
                              <p className="px-2 py-2 text-sm leading-5 text-muted-foreground">
                                No models shown. Select models in provider
                                settings.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-dashed px-3 py-4 text-center text-base text-muted-foreground">
                      {providers.length > 0
                        ? "No providers match the search."
                        : "No providers configured."}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 gap-2 border-t bg-card/90 p-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-[36px] flex-1"
                  onClick={startCreateProvider}
                >
                  <Plus className="size-4" />
                  Add provider
                </Button>
              </div>
            </aside>

            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="z-20 flex shrink-0 items-center border-b bg-background px-4 py-[10px]">
                <div className="flex min-h-8 w-full items-center justify-between gap-4">
                  <Label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {isCreatingProvider
                      ? "New provider"
                      : selectedModel
                        ? "Edit model"
                        : "Edit provider"}
                  </Label>
                  {!isCreatingProvider && !selectedModel ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="Provider actions"
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() => onDuplicateProvider(activeProvider.id)}
                        >
                          <Copy className="size-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={providers.length <= 1}
                          onClick={() => onDeleteProvider(activeProvider.id)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 chat-message-scrollbar">
                {!selectedModel ? (
                  <div className="grid gap-5 pb-1">
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="provider-name">Provider name</Label>
                        <BufferedTextInput
                          id="provider-name"
                          value={editingProvider.name}
                          onValueChange={(value) =>
                            updateEditingProviderSetting({ name: value })
                          }
                          placeholder="Provider name"
                          aria-invalid={
                            providerNameValidationError ? true : undefined
                          }
                        />
                        {providerNameValidationError ? (
                          <p className="text-sm leading-5 text-destructive">
                            {providerNameValidationError}
                          </p>
                        ) : null}
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="provider-url">Base URL</Label>
                        <BufferedTextInput
                          id="provider-url"
                          value={editingProvider.baseUrl}
                          onValueChange={(value) =>
                            updateEditingProviderSetting({ baseUrl: value })
                          }
                          placeholder="http://localhost:1234/v1"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="provider-api-key">API key</Label>
                        <div className="relative">
                          <BufferedTextInput
                            id="provider-api-key"
                            value={editingProvider.apiKey}
                            onValueChange={(value) =>
                              updateEditingProviderSetting({ apiKey: value })
                            }
                            placeholder="Provider API key"
                            type={isApiKeyVisible ? "text" : "password"}
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                            onClick={() =>
                              setIsApiKeyVisible((current) => !current)
                            }
                            title={
                              isApiKeyVisible ? "Hide API key" : "Show API key"
                            }
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

                    <div className="grid gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label>Loaded models</Label>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            loadModelsFromProvider(editingProvider)
                          }
                          disabled={
                            isLoadingModels || !editingProvider.baseUrl.trim()
                          }
                        >
                          <RefreshCcw
                            className={cn(
                              "size-4",
                              isLoadingModels && "animate-spin",
                            )}
                          />
                          {getLoadModelsButtonLabel(editingProvider)}
                        </Button>
                      </div>
                      {editingProviderLoadedModels.length > 0 ? (
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={loadedModelSearchQuery}
                            onChange={(event) =>
                              setLoadedModelSearchQuery(event.target.value)
                            }
                            placeholder="Search loaded models"
                            aria-label="Search loaded models"
                            autoFocus={false}
                            className="h-9 pl-8 pr-8"
                          />
                          {loadedModelSearchQuery ? (
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => setLoadedModelSearchQuery("")}
                              title="Clear loaded model search"
                            >
                              <X className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {editingProviderLoadedModels.length > 0 ? (
                        filteredLoadedModels.length > 0 ? (
                          <div className="grid max-h-80 gap-1 overflow-y-auto">
                            {filteredLoadedModels.map((model) => {
                              const checked =
                                editingProviderEnabled &&
                                isModelShownInMenu(editingProvider, model);

                              return (
                                <div
                                  key={`${editingProvider.id}:${model}:shown`}
                                  role="button"
                                  tabIndex={editingProviderEnabled ? 0 : -1}
                                  className={cn(
                                    "flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1.5 text-sm leading-5 hover:bg-muted/60",
                                    !editingProviderEnabled &&
                                      "cursor-default opacity-50 hover:bg-transparent",
                                  )}
                                  title={model}
                                  onClick={() => {
                                    if (!editingProviderEnabled) return;
                                    toggleEditingModelShownInMenu(
                                      model,
                                      !isModelShownInMenu(
                                        editingProvider,
                                        model,
                                      ),
                                    );
                                  }}
                                  onKeyDown={(event) => {
                                    if (!editingProviderEnabled) return;
                                    if (
                                      event.key === "Enter" ||
                                      event.key === " "
                                    ) {
                                      event.preventDefault();
                                      toggleEditingModelShownInMenu(
                                        model,
                                        !isModelShownInMenu(
                                          editingProvider,
                                          model,
                                        ),
                                      );
                                    }
                                  }}
                                >
                                  <span className="min-w-0 flex-1 truncate font-medium">
                                    {model}
                                  </span>
                                  <Switch
                                    aria-label={`${model} selectable`}
                                    checked={checked}
                                    disabled={!editingProviderEnabled}
                                    onClick={(event) => event.stopPropagation()}
                                    onCheckedChange={(nextChecked) =>
                                      toggleEditingModelShownInMenu(
                                        model,
                                        nextChecked,
                                      )
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm leading-5 text-muted-foreground">
                            No loaded models match the search.
                          </p>
                        )
                      ) : (
                        <p className="text-sm leading-5 text-muted-foreground">
                          No models loaded yet. Load models from the provider
                          first.
                        </p>
                      )}
                    </div>

                    <div className="grid gap-3">
                      <div>
                        <Label>Custom models</Label>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                          Add model IDs manually when they are not returned by
                          the provider. Custom models are enabled immediately.
                        </p>
                      </div>

                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                        <Input
                          value={customModelValue}
                          onChange={(event) =>
                            setCustomModelValue(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            addCustomModel();
                          }}
                          placeholder="openai/gpt-4.1-mini"
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          className="shrink-0"
                          disabled={!customModelValue.trim()}
                          onClick={addCustomModel}
                        >
                          <Plus className="size-4" />
                          Add model
                        </Button>
                      </div>

                      {normalizeProviderModels(
                        editingProvider.customModels ?? [],
                      ).length > 0 ? (
                        <div className="grid max-h-64 gap-1 overflow-y-auto">
                          {normalizeProviderModels(
                            editingProvider.customModels ?? [],
                          ).map((model) => {
                            const checked =
                              editingProviderEnabled &&
                              isModelShownInMenu(editingProvider, model);

                            return (
                              <div
                                key={`${editingProvider.id}:${model}:custom`}
                                role="button"
                                tabIndex={editingProviderEnabled ? 0 : -1}
                                className={cn(
                                  "flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1.5 text-sm leading-5 hover:bg-muted/60",
                                  !editingProviderEnabled &&
                                    "cursor-default opacity-50 hover:bg-transparent",
                                )}
                                title={model}
                                onClick={() => {
                                  if (!editingProviderEnabled) return;
                                  toggleEditingModelShownInMenu(
                                    model,
                                    !isModelShownInMenu(editingProvider, model),
                                  );
                                }}
                                onKeyDown={(event) => {
                                  if (!editingProviderEnabled) return;
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    toggleEditingModelShownInMenu(
                                      model,
                                      !isModelShownInMenu(
                                        editingProvider,
                                        model,
                                      ),
                                    );
                                  }
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate font-medium">
                                  {model}
                                </span>
                                <Switch
                                  aria-label={`${model} selectable`}
                                  checked={checked}
                                  disabled={!editingProviderEnabled}
                                  onClick={(event) => event.stopPropagation()}
                                  onCheckedChange={(nextChecked) =>
                                    toggleEditingModelShownInMenu(
                                      model,
                                      nextChecked,
                                    )
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteCustomModel(model);
                                  }}
                                  title="Delete custom model"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm leading-5 text-muted-foreground">
                          No custom models yet.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-5 pb-1">
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="model-name">Model name</Label>
                        <Input
                          id="model-name"
                          value={selectedModel ?? ""}
                          disabled
                          readOnly
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="manual-context-size">
                          Context size
                        </Label>
                        <PositiveIntegerInput
                          id="manual-context-size"
                          className="w-full"
                          value={
                            selectedModelConfig?.context?.manualContextLength
                          }
                          onValueChange={updateSelectedModelManualContext}
                          placeholder="No manual override"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="generation-temperature">
                          Temperature
                        </Label>
                        <BoundedDecimalInput
                          id="generation-temperature"
                          min={0}
                          max={2}
                          value={selectedModelSettings?.temperature}
                          onValueChange={(value) =>
                            updateSelectedModelGenerationSettings({
                              temperature: value,
                            })
                          }
                          placeholder="Provider default"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="generation-top-p">Top P</Label>
                        <BoundedDecimalInput
                          id="generation-top-p"
                          min={0}
                          max={1}
                          value={selectedModelSettings?.topP}
                          onValueChange={(value) =>
                            updateSelectedModelGenerationSettings({
                              topP: value,
                            })
                          }
                          placeholder="Provider default"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="generation-max-tokens">
                          Max output tokens
                        </Label>
                        <PositiveIntegerInput
                          id="generation-max-tokens"
                          value={selectedModelSettings?.maxTokens}
                          onValueChange={updateSelectedModelMaxTokens}
                          placeholder="Provider default"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="generation-thinking-mode">
                          Thinking mode
                        </Label>
                        <Select
                          value={selectedModelThinkingMode}
                          onValueChange={updateSelectedModelThinkingMode}
                        >
                          <SelectTrigger id="generation-thinking-mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="off">No thinking</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="generation-timeout">
                          Request timeout, ms
                        </Label>
                        <PositiveIntegerInput
                          id="generation-timeout"
                          value={selectedModelSettings?.requestTimeoutMs}
                          onValueChange={(value) =>
                            updateSelectedModelGenerationSettings({
                              requestTimeoutMs: value,
                            })
                          }
                          placeholder="30000"
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="model-supports-vision">
                          Vision input
                        </Label>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                          Mark this model as able to receive image attachments.
                        </p>
                      </div>
                      <Switch
                        id="model-supports-vision"
                        checked={selectedModelConfig?.supportsVision === true}
                        onCheckedChange={(checked) =>
                          updateSelectedModelConfig({ supportsVision: checked })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="shrink-0 items-center border-t bg-background px-4 py-2 sm:justify-between">
                <div />
                <div className="flex gap-2">
                  {isCreatingProvider ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={cancelCreateProvider}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={createProviderFromDraft}
                        disabled={!canCreateProvider}
                      >
                        Create
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetEditingProvider}
                      >
                        Reset
                      </Button>
                      <Button
                        type="button"
                        onClick={saveEditingProvider}
                        disabled={!canSaveDraft}
                      >
                        Save
                      </Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </main>
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
