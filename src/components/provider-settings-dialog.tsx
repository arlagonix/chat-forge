"use client";

import {
  ChevronDown,
  ChevronRight,
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
import type {
  ComponentProps,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
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
import { Textarea } from "@/components/ui/textarea";
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
import {
  CUSTOM_THINKING_PRESET_ID,
  defaultGenerationSettings,
  thinkingLevelPresets,
} from "@/lib/ai-chat/provider-presets";
import { saveCachedProviderModels } from "@/lib/ai-chat/storage";
import type {
  ProviderConfig,
  ProviderGenerationSettings,
  ProviderModelConfig,
  ProvidersState,
  ThinkingLevel,
} from "@/lib/ai-chat/types";
import {
  SettingsDetailContent,
  SettingsDetailFooter,
  SettingsDetailHeader,
  SettingsDetailPane,
} from "@/components/settings/settings-detail-pane";
import { cn } from "@/lib/utils";

const EMPTY_MODEL_CONFIG: ProviderModelConfig = {};

type ModelLoadStatus = "idle" | "success" | "empty" | "error";

type SelectedModelTarget = {
  providerId: string;
  model: string;
};

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
  embedded?: boolean;
  contentWidthClassName?: string;
  onDirtyChange?: (dirty: boolean) => void;
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

function formatRequestBodyJson(value: Record<string, unknown>) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseRequestBodyJson(value: string) {
  const parsed = JSON.parse(value || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request JSON must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function createUniqueThinkingLevelId(label: string, levels: ThinkingLevel[]) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "level";
  const usedIds = new Set(levels.map((level) => level.id));
  if (!usedIds.has(base)) return base;

  let suffix = 2;
  while (usedIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

type ThinkingLevelJsonEditorProps = {
  level: ThinkingLevel;
  disabled?: boolean;
  onChange: (level: ThinkingLevel) => void;
};

const ThinkingLevelJsonEditor = memo(function ThinkingLevelJsonEditor({
  level,
  disabled = false,
  onChange,
}: ThinkingLevelJsonEditorProps) {
  const [draftJson, setDraftJson] = useState(
    formatRequestBodyJson(level.requestBody),
  );
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setDraftJson(formatRequestBodyJson(level.requestBody));
    setError(undefined);
  }, [level.id, level.requestBody]);

  function validateRequestBody(nextJson: string) {
    try {
      parseRequestBodyJson(nextJson);
      setError(undefined);
    } catch (parseError) {
      setError(
        parseError instanceof Error ? parseError.message : "Invalid JSON.",
      );
    }
  }

  function commitRequestBody() {
    if (disabled) return;
    try {
      const requestBody = parseRequestBodyJson(draftJson);
      setError(undefined);
      onChange({ ...level, requestBody });
    } catch (parseError) {
      setError(
        parseError instanceof Error ? parseError.message : "Invalid JSON.",
      );
    }
  }

  function insertTab(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (disabled || event.key !== "Tab") return;

    event.preventDefault();
    const textarea = event.currentTarget;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const nextJson = `${draftJson.slice(0, selectionStart)}\t${draftJson.slice(
      selectionEnd,
    )}`;

    setDraftJson(nextJson);
    validateRequestBody(nextJson);
    window.requestAnimationFrame(() => {
      textarea.selectionStart = selectionStart + 1;
      textarea.selectionEnd = selectionStart + 1;
    });
  }

  return (
    <div className="grid gap-1.5">
      <Textarea
        value={draftJson}
        onBlur={commitRequestBody}
        onKeyDown={insertTab}
        onChange={(event) => {
          if (disabled) return;
          const nextJson = event.target.value;
          setDraftJson(nextJson);
          validateRequestBody(nextJson);
        }}
        disabled={disabled}
        spellCheck={false}
        className="h-[180px] resize-y font-mono text-xs"
      />
      {error ? (
        <p className="text-xs leading-5 text-destructive">{error}</p>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          Appended to the final request JSON when this level is selected.
        </p>
      )}
    </div>
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
  embedded = false,
  contentWidthClassName,
  onDirtyChange,
}: ProviderSettingsDialogProps) {
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelLoadStatus, setModelLoadStatus] =
    useState<ModelLoadStatus>("idle");
  const [providerSearchQuery, setProviderSearchQuery] = useState("");
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<string>>(
    () => new Set([activeProvider.id]),
  );
  const [loadedModelSearchQuery, setLoadedModelSearchQuery] = useState("");
  const [selectedModelTarget, setSelectedModelTarget] =
    useState<SelectedModelTarget | null>(null);
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
    selectedModelTarget &&
    selectedModelTarget.providerId === editingProviderDraft.id &&
    activeProviderModelIds.includes(selectedModelTarget.model)
      ? selectedModelTarget.model
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
  useEffect(() => {
    onDirtyChange?.(hasDraftChanges);
  }, [hasDraftChanges, onDirtyChange]);

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
    if (!selectedModelTarget) return;
    if (selectedModelTarget.providerId !== editingProviderDraft.id) return;
    if (activeProviderModelIds.includes(selectedModelTarget.model)) return;

    setSelectedModelTarget(null);
  }, [activeProviderModelIds, editingProviderDraft.id, selectedModelTarget]);

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
      setSelectedModelTarget(null);
      onProvidersStateChange((currentState) => ({
        ...currentState,
        activeProviderId: providerId,
      }));
    });
  }

  function toggleProviderExpanded(providerId: string) {
    setExpandedProviderIds((current) => {
      const next = new Set(current);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }

  function expandProvider(providerId: string) {
    setExpandedProviderIds((current) => {
      if (current.has(providerId)) return current;
      const next = new Set(current);
      next.add(providerId);
      return next;
    });
  }

  function activateProvider(providerId: string, isSelected: boolean) {
    if (isSelected) {
      toggleProviderExpanded(providerId);
      return;
    }

    expandProvider(providerId);
    selectProvider(providerId);
  }

  function selectModel(providerId: string, model: string) {
    requestWithUnsavedCheck(() => {
      setNewProviderDraft(null);
      setNewProviderInitialDraft(null);
      setSelectedModelTarget({ providerId, model });
      onProvidersStateChange((currentState) => ({
        ...currentState,
        activeProviderId: providerId,
      }));
    });
  }

  function startCreateProvider() {
    requestWithUnsavedCheck(() => {
      const provider = createNewProvider();
      setSelectedModelTarget(null);
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
    setSelectedModelTarget(null);
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
          [model]: modelConfigWithPatch(
            currentConfig,
            checked
              ? { showInMenu: true, enabled: true }
              : { showInMenu: false },
          ),
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
        const modelMatches = getShownProviderModels(provider).some((model) =>
          model.toLowerCase().includes(query),
        );
        return name.includes(query) || baseUrl.includes(query) || modelMatches;
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

  const selectedModelThinkingLevels = selectedModelConfig?.thinkingLevels ?? [];
  const selectedThinkingPresetId =
    selectedModelConfig?.thinkingPresetId ?? "default";
  const selectedThinkingPreset =
    thinkingLevelPresets.find(
      (preset) => preset.id === selectedThinkingPresetId,
    ) ?? thinkingLevelPresets[0];
  const customThinkingPreset = thinkingLevelPresets.find(
    (preset) => preset.id === CUSTOM_THINKING_PRESET_ID,
  );
  const selectedThinkingPresetIsCustom =
    selectedThinkingPreset.id === CUSTOM_THINKING_PRESET_ID;
  const displayedThinkingLevels = selectedThinkingPresetIsCustom
    ? selectedModelThinkingLevels
    : selectedThinkingPreset.levels;

  function updateSelectedModelThinkingPreset(presetId: string) {
    const preset = thinkingLevelPresets.find(
      (candidate) => candidate.id === presetId,
    );
    if (!preset) return;

    updateSelectedModelConfig({
      thinkingPresetId: preset.id,
      ...(preset.id === CUSTOM_THINKING_PRESET_ID &&
      selectedModelThinkingLevels.length === 0
        ? {
            thinkingLevels: customThinkingPreset?.levels.map((level) => ({
              ...level,
              requestBody: level.requestBody,
            })),
          }
        : {}),
    });
  }

  function updateSelectedModelThinkingLevels(levels: ThinkingLevel[]) {
    updateSelectedModelConfig({
      thinkingLevels: levels,
    });
  }

  function addSelectedModelThinkingLevel() {
    const label = "Custom";
    const id = createUniqueThinkingLevelId(label, selectedModelThinkingLevels);
    updateSelectedModelThinkingLevels([
      ...selectedModelThinkingLevels,
      { id, label, requestBody: {} },
    ]);
  }

  function applyThinkingLevelPreset(presetId: string) {
    const preset = thinkingLevelPresets.find(
      (candidate) => candidate.id === presetId,
    );
    if (!preset || preset.id === CUSTOM_THINKING_PRESET_ID) return;

    updateSelectedModelThinkingLevels(
      preset.levels.map((level) => ({
        id: level.id,
        label: level.label,
        requestBody: level.requestBody,
      })),
    );
  }

  function updateSelectedModelThinkingLevel(
    levelId: string,
    patch: Partial<ThinkingLevel>,
  ) {
    updateSelectedModelThinkingLevels(
      selectedModelThinkingLevels.map((level) =>
        level.id === levelId ? { ...level, ...patch } : level,
      ),
    );
  }

  function deleteSelectedModelThinkingLevel(levelId: string) {
    updateSelectedModelThinkingLevels(
      selectedModelThinkingLevels.filter((level) => level.id !== levelId),
    );
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
      <Dialog embedded={embedded} open={open} onOpenChange={requestOpenChange}>
        <DialogContent
          className="flex h-[min(1000px,calc(100dvh-2rem))] max-h-none flex-col gap-0 overflow-hidden p-0 outline-none focus:outline-none focus-visible:ring-0 sm:max-w-6xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {!embedded ? (
            <DialogHeader className="shrink-0 border-b p-4 pr-12">
              <DialogTitle>Providers</DialogTitle>
            </DialogHeader>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[400px_minmax(0,1fr)]">
            <aside className="app-glass-card flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
              <div className="shrink-0 border-b border-border bg-transparent p-2">
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
                      const searchActive = Boolean(
                        providerSearchQuery.trim(),
                      );
                      const expanded =
                        searchActive || expandedProviderIds.has(item.id);

                      return (
                        <div
                          key={item.id}
                          className="border-b last:border-b-0"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            className={cn(
                              "group flex min-w-0 cursor-pointer items-start gap-2 px-2 py-2 outline-none transition-colors",
                              providerSelected
                                ? "bg-accent text-accent-foreground"
                                : "hover:bg-muted/60",
                            )}
                            onClick={() =>
                              activateProvider(item.id, providerSelected)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                activateProvider(item.id, providerSelected);
                              }
                            }}
                          >
                            <button
                              type="button"
                              className="mt-[3px] inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleProviderExpanded(item.id);
                              }}
                              aria-label={`${expanded ? "Collapse" : "Expand"} ${providerDisplayName(item)} models`}
                              title={`${expanded ? "Collapse" : "Expand"} models`}
                            >
                              {expanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-medium leading-6">
                                {providerDisplayName(item)}
                              </div>
                              <div className="truncate text-sm leading-5 text-muted-foreground">
                                {item.baseUrl || "No base URL"} · {modelCount}{" "}
                                model{modelCount === 1 ? "" : "s"}
                              </div>
                            </div>

                            <Switch
                              aria-label={`${providerDisplayName(item)} provider`}
                              checked={providerEnabled}
                              onClick={(event) => event.stopPropagation()}
                              onCheckedChange={(checked) =>
                                toggleProvider(item.id, checked)
                              }
                              className="mt-0.5 shrink-0 cursor-pointer"
                              title={
                                providerEnabled
                                  ? "Disable provider"
                                  : "Enable provider"
                              }
                            />
                          </div>

                          {expanded ? (
                            <div className="grid gap-0">
                              {modelCount > 0 ? (
                                shownModels.map((model) => {
                                  const modelSelected =
                                    !isCreatingProvider &&
                                    item.id === activeProvider.id &&
                                    selectedModel === model;
                                  const checked = isModelEnabled(item, model);

                                  return (
                                    <div
                                      key={`${item.id}:${model}`}
                                      role="button"
                                      tabIndex={0}
                                      className={cn(
                                        "flex min-w-0 cursor-pointer items-center gap-2 px-2 py-2 pl-9 outline-none transition-colors",
                                        modelSelected
                                          ? "bg-accent text-accent-foreground"
                                          : "hover:bg-muted/60",
                                      )}
                                      onClick={() =>
                                        selectModel(item.id, model)
                                      }
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
                                          toggleModel(
                                            item.id,
                                            model,
                                            nextChecked,
                                          )
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
                                <p className="px-2 py-2 pl-9 text-sm leading-5 text-muted-foreground">
                                  No models shown. Select models in provider
                                  settings.
                                </p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="m-2 rounded-sm border border-dashed px-3 py-4 text-center text-base text-muted-foreground">
                      {providers.length > 0
                        ? "No providers match the search."
                        : "No providers configured."}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 gap-2 border-t bg-transparent p-2">
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

            <SettingsDetailPane contentWidthClassName={contentWidthClassName}>
              <SettingsDetailHeader className="flex items-center px-4 py-[10px]">
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
              </SettingsDetailHeader>

              <SettingsDetailContent className="px-4 py-4">
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
                              const checked = isModelShownInMenu(
                                editingProvider,
                                model,
                              );

                              return (
                                <div
                                  key={`${editingProvider.id}:${model}:shown`}
                                  role="button"
                                  tabIndex={0}
                                  className="flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1.5 text-sm leading-5 hover:bg-muted/60"
                                  title={model}
                                  onClick={() => {
                                    toggleEditingModelShownInMenu(
                                      model,
                                      !isModelShownInMenu(
                                        editingProvider,
                                        model,
                                      ),
                                    );
                                  }}
                                  onKeyDown={(event) => {
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
                            const checked = isModelShownInMenu(
                              editingProvider,
                              model,
                            );

                            return (
                              <div
                                key={`${editingProvider.id}:${model}:custom`}
                                role="button"
                                tabIndex={0}
                                className="flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1.5 text-sm leading-5 hover:bg-muted/60"
                                title={model}
                                onClick={() => {
                                  toggleEditingModelShownInMenu(
                                    model,
                                    !isModelShownInMenu(editingProvider, model),
                                  );
                                }}
                                onKeyDown={(event) => {
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
                        <Label htmlFor="generation-top-k">Top K</Label>
                        <PositiveIntegerInput
                          id="generation-top-k"
                          value={selectedModelSettings?.topK}
                          onValueChange={(value) =>
                            updateSelectedModelGenerationSettings({
                              topK: value,
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

                      <div className="grid gap-3">
                        <div className="grid gap-2">
                          <Label htmlFor="thinking-preset">
                            Thinking preset
                          </Label>
                          <Select
                            value={selectedThinkingPreset.id}
                            onValueChange={updateSelectedModelThinkingPreset}
                          >
                            <SelectTrigger id="thinking-preset">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {thinkingLevelPresets.map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-sm leading-5 text-muted-foreground">
                            {selectedThinkingPreset.description}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label>Thinking levels</Label>
                          {selectedThinkingPresetIsCustom ? (
                            <div className="flex shrink-0 gap-2">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                  >
                                    Apply preset
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {thinkingLevelPresets
                                    .filter(
                                      (preset) =>
                                        preset.id !== CUSTOM_THINKING_PRESET_ID,
                                    )
                                    .map((preset) => (
                                      <DropdownMenuItem
                                        key={preset.id}
                                        onSelect={() =>
                                          applyThinkingLevelPreset(preset.id)
                                        }
                                      >
                                        {preset.label}
                                      </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addSelectedModelThinkingLevel}
                              >
                                Add level
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        {displayedThinkingLevels.length > 0 ? (
                          <div className="grid gap-3">
                            {displayedThinkingLevels.map((level) => {
                              const isEditable = selectedThinkingPresetIsCustom;

                              return (
                                <div
                                  key={level.id}
                                  className="grid gap-3 rounded-md border p-3"
                                >
                                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                                    <div className="grid gap-1.5">
                                      <Label
                                        htmlFor={`thinking-level-${level.id}-label`}
                                      >
                                        Label
                                      </Label>
                                      <Input
                                        id={`thinking-level-${level.id}-label`}
                                        value={level.label}
                                        disabled={!isEditable}
                                        onChange={(event) =>
                                          updateSelectedModelThinkingLevel(
                                            level.id,
                                            { label: event.target.value },
                                          )
                                        }
                                      />
                                    </div>
                                    {isEditable ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="self-end text-muted-foreground hover:text-destructive"
                                        onClick={() =>
                                          deleteSelectedModelThinkingLevel(
                                            level.id,
                                          )
                                        }
                                        title="Delete thinking level"
                                      >
                                        <Trash2 className="size-4" />
                                      </Button>
                                    ) : null}
                                  </div>
                                  <ThinkingLevelJsonEditor
                                    level={level}
                                    disabled={!isEditable}
                                    onChange={(nextLevel) =>
                                      updateSelectedModelThinkingLevel(
                                        level.id,
                                        {
                                          requestBody: nextLevel.requestBody,
                                        },
                                      )
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="rounded-md border border-dashed p-3 text-sm leading-5 text-muted-foreground">
                            This preset does not define request JSON levels.
                          </p>
                        )}
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
              </SettingsDetailContent>

              <SettingsDetailFooter className="items-center px-4 py-2 sm:justify-between">
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
              </SettingsDetailFooter>
            </SettingsDetailPane>
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
