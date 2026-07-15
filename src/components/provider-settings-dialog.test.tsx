import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderSettingsDialog } from "@/components/provider-settings-dialog";
import type { ProviderConfig, ProvidersState } from "@/lib/ai-chat/types";

const providerClientMocks = vi.hoisted(() => ({
  getActiveModelSettings: vi.fn(() => ({})),
  loadProviderModels: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  saveCachedProviderModels: vi.fn(),
}));

vi.mock("@/lib/ai-chat/direct-provider-client", () => providerClientMocks);
vi.mock("@/lib/ai-chat/storage", () => storageMocks);

function createProvider(
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  return {
    id: "lmstudio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "",
    model: "alpha",
    models: ["alpha", "beta"],
    customModels: ["custom-alpha"],
    enabled: true,
    modelConfigs: {
      alpha: { enabled: true, showInMenu: true },
      beta: { enabled: true, showInMenu: true },
      "custom-alpha": { enabled: true, showInMenu: true },
    },
    ...overrides,
  };
}

function renderProviderSettingsDialog(
  initialState: ProvidersState = {
    activeProviderId: "lmstudio",
    providers: [
      createProvider(),
      createProvider({
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "or-model",
        models: ["or-model"],
        customModels: [],
        modelConfigs: {
          "or-model": { enabled: true, showInMenu: true },
        },
      }),
    ],
  },
) {
  const onAddProvider = vi.fn();
  const onDuplicateProvider = vi.fn();
  const onDeleteProvider = vi.fn();
  const onSave = vi.fn();
  const showSuccess = vi.fn();

  function Harness() {
    const [open, setOpen] = useState(true);
    const [state, setState] = useState(initialState);
    const activeProvider =
      state.providers.find(
        (provider) => provider.id === state.activeProviderId,
      ) ?? state.providers[0]!;

    return (
      <>
        <ProviderSettingsDialog
          open={open}
          onOpenChange={setOpen}
          providers={state.providers}
          activeProvider={activeProvider}
          onProvidersStateChange={(updater) => setState(updater)}
          onProviderSettingChange={(patch) =>
            setState((current) => ({
              ...current,
              providers: current.providers.map((provider) =>
                provider.id === activeProvider.id
                  ? { ...provider, ...patch }
                  : provider,
              ),
            }))
          }
          onAddProvider={onAddProvider}
          onDuplicateProvider={onDuplicateProvider}
          onDeleteProvider={onDeleteProvider}
          onSave={onSave}
          showSuccess={showSuccess}
        />
        <pre data-testid="providers-state">{JSON.stringify(state)}</pre>
      </>
    );
  }

  return {
    user: userEvent.setup(),
    onAddProvider,
    onDuplicateProvider,
    onDeleteProvider,
    onSave,
    showSuccess,
    ...render(<Harness />),
  };
}

function readRenderedState(): ProvidersState {
  const rawState = screen.getByTestId("providers-state").textContent ?? "";
  return JSON.parse(rawState) as ProvidersState;
}

describe("ProviderSettingsDialog", () => {
  beforeEach(() => {
    providerClientMocks.getActiveModelSettings.mockReturnValue({});
    providerClientMocks.loadProviderModels.mockReset();
    storageMocks.saveCachedProviderModels.mockReset();
  });

  it("renders providers without the old expand/collapse controls", () => {
    renderProviderSettingsDialog();

    expect(screen.queryByTitle("Collapse models")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Expand models")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Manage provider connections and per-model settings."),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("or-model").length).toBeGreaterThan(0);
  });

  it("filters providers by name and base URL and clears the search", async () => {
    const { user } = renderProviderSettingsDialog();
    const searchInput = screen.getByLabelText(
      "Search providers by name or base URL",
    );

    await user.type(searchInput, "openrouter");

    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    expect(screen.queryByText("LM Studio")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Clear search"));
    await user.type(searchInput, "localhost");

    expect(screen.getByText("LM Studio")).toBeInTheDocument();
    expect(screen.queryByText("OpenRouter")).not.toBeInTheDocument();
  });

  it("sorts disabled providers below enabled providers", () => {
    renderProviderSettingsDialog({
      activeProviderId: "lmstudio",
      providers: [
        createProvider({ enabled: false }),
        createProvider({
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          model: "or-model",
          models: ["or-model"],
          customModels: [],
          enabled: true,
          modelConfigs: {
            "or-model": { enabled: true, showInMenu: true },
          },
        }),
      ],
    });

    const openRouter = screen.getByText("OpenRouter");
    const lmStudio = screen.getByText("LM Studio");

    expect(
      openRouter.compareDocumentPosition(lmStudio) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not show the loaded models helper description", () => {
    renderProviderSettingsDialog();

    expect(
      screen.queryByText(
        /Enable models here to make them selectable in the app/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("does not autofocus provider search when opened", () => {
    renderProviderSettingsDialog();

    expect(
      screen.getByLabelText("Search providers by name or base URL"),
    ).not.toHaveFocus();
  });

  it("keeps new providers as drafts until they are created", async () => {
    const { user, onAddProvider } = renderProviderSettingsDialog();

    expect(readRenderedState().providers).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Add provider" }));

    expect(onAddProvider).not.toHaveBeenCalled();
    expect(readRenderedState().providers).toHaveLength(2);
    expect(screen.getByText("New provider")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(readRenderedState().providers).toHaveLength(3);
    expect(readRenderedState().providers[2].name).toBe("New provider");
  });

  it("disables only the selected provider model switches when a provider is turned off", async () => {
    const { user } = renderProviderSettingsDialog();

    await user.click(
      screen.getByRole("switch", { name: "LM Studio provider" }),
    );

    const lmStudioModelSwitch = screen.getByRole("switch", {
      name: "LM Studio alpha model",
    });
    const openRouterModelSwitch = screen.getByRole("switch", {
      name: "OpenRouter or-model model",
    });

    expect(lmStudioModelSwitch).toBeDisabled();
    expect(lmStudioModelSwitch).toHaveAttribute("data-state", "checked");
    expect(openRouterModelSwitch).toBeEnabled();
    expect(openRouterModelSwitch).toHaveAttribute("data-state", "checked");
  });


  it("keeps disabled-provider model rows interactive and normally styled", async () => {
    const { user } = renderProviderSettingsDialog();

    await user.click(
      screen.getByRole("switch", { name: "LM Studio provider" }),
    );

    const modelSwitch = screen.getByRole("switch", {
      name: "LM Studio alpha model",
    });
    const modelRow = modelSwitch.closest('[role="button"]');

    expect(modelSwitch).toBeDisabled();
    expect(modelSwitch).toBeChecked();
    expect(modelRow).toHaveClass("cursor-pointer");
    expect(modelRow).toHaveClass("hover:bg-muted/60");
    expect(modelRow).not.toHaveClass("cursor-default");
    expect(modelRow).not.toHaveClass("opacity-50");
    expect(modelRow).not.toHaveClass("hover:bg-transparent");

    await user.click(modelRow as HTMLElement);

    expect(screen.getByLabelText("Model name")).toHaveValue("alpha");
  });

  it("allows loaded and custom model visibility changes while the provider is disabled", async () => {
    const { user } = renderProviderSettingsDialog();

    await user.click(
      screen.getByRole("switch", { name: "LM Studio provider" }),
    );

    const betaSwitch = screen.getByRole("switch", { name: "beta selectable" });
    const customSwitch = screen.getByRole("switch", {
      name: "custom-alpha selectable",
    });

    expect(betaSwitch).toBeEnabled();
    expect(customSwitch).toBeEnabled();

    await user.click(betaSwitch);
    await user.click(customSwitch);
    await user.click(screen.getByRole("button", { name: "Save" }));

    const provider = readRenderedState().providers[0];
    expect(provider.enabled).toBe(false);
    expect(provider.modelConfigs?.beta).toMatchObject({
      enabled: true,
      showInMenu: false,
    });
    expect(provider.modelConfigs?.["custom-alpha"]).toMatchObject({
      enabled: true,
      showInMenu: false,
    });
  });

  it("filters loaded models with the loaded model search", async () => {
    const { user } = renderProviderSettingsDialog();

    await user.type(screen.getByLabelText("Search loaded models"), "beta");

    expect(
      screen.getByRole("switch", { name: "beta selectable" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "alpha selectable" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Clear loaded model search"));

    expect(screen.getByRole("switch", { name: "alpha selectable" })).toBeInTheDocument();
  });

  it("keeps provider field edits as local drafts until save", async () => {
    const { user, onSave } = renderProviderSettingsDialog();
    const nameInput = screen.getByLabelText("Provider name");

    await user.clear(nameInput);
    await user.type(nameInput, "Renamed provider");

    expect(readRenderedState().providers[0].name).toBe("LM Studio");
    expect(screen.getByText("LM Studio")).toBeInTheDocument();
    expect(screen.queryByText("Renamed provider")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalled();
    expect(readRenderedState().providers[0].name).toBe("Renamed provider");
    expect(screen.getByText("Renamed provider")).toBeInTheDocument();
  });

  it("resets provider draft edits without updating state", async () => {
    const { user } = renderProviderSettingsDialog();
    const nameInput = screen.getByLabelText("Provider name");
    const baseUrlInput = screen.getByLabelText("Base URL");

    await user.clear(nameInput);
    await user.type(nameInput, "Temporary provider");
    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "http://temporary.local/v1");
    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(nameInput).toHaveValue("LM Studio");
    expect(baseUrlInput).toHaveValue("http://localhost:1234/v1");
    expect(readRenderedState().providers[0].name).toBe("LM Studio");
  });

  it("sorts enabled loaded models above disabled loaded models", () => {
    renderProviderSettingsDialog({
      activeProviderId: "lmstudio",
      providers: [
        createProvider({
          models: ["beta", "alpha"],
          modelConfigs: {
            alpha: { enabled: true, showInMenu: true },
            beta: { enabled: false, showInMenu: false },
            "custom-alpha": { enabled: true, showInMenu: true },
          },
        }),
      ],
    });

    const alphaSwitch = screen.getByRole("switch", { name: "alpha selectable" });
    const betaSwitch = screen.getByRole("switch", { name: "beta selectable" });

    expect(
      alphaSwitch.compareDocumentPosition(betaSwitch) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("enables loaded models for chat when showing them in the menu", async () => {
    const { user } = renderProviderSettingsDialog({
      activeProviderId: "lmstudio",
      providers: [
        createProvider({
          modelConfigs: {
            alpha: { enabled: true, showInMenu: true },
            beta: { enabled: false, showInMenu: false },
            "custom-alpha": { enabled: true, showInMenu: true },
          },
        }),
      ],
    });
    const betaSwitch = screen.getByRole("switch", {
      name: "beta selectable",
    });

    await user.click(betaSwitch);

    expect(readRenderedState().providers[0].modelConfigs?.beta).toMatchObject({
      enabled: false,
      showInMenu: false,
    });

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(readRenderedState().providers[0].modelConfigs?.beta).toMatchObject({
      enabled: true,
      showInMenu: true,
    });
    expect(
      screen.getByRole("switch", { name: "LM Studio beta model" }),
    ).toBeChecked();
  });

  it("does not re-enable existing shown models on unrelated saves", async () => {
    const { user } = renderProviderSettingsDialog({
      activeProviderId: "lmstudio",
      providers: [
        createProvider({
          modelConfigs: {
            alpha: { enabled: true, showInMenu: true },
            beta: { enabled: false, showInMenu: true },
            "custom-alpha": { enabled: true, showInMenu: true },
          },
        }),
      ],
    });

    await user.type(screen.getByLabelText("Provider name"), " Local");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(readRenderedState().providers[0].modelConfigs?.beta).toMatchObject({
      enabled: false,
      showInMenu: true,
    });
  });

  it("hides loaded models without changing chat availability", async () => {
    const { user } = renderProviderSettingsDialog();
    const betaSwitch = screen.getByRole("switch", {
      name: "beta selectable",
    });

    await user.click(betaSwitch);

    expect(readRenderedState().providers[0].modelConfigs?.beta).toMatchObject({
      enabled: true,
      showInMenu: true,
    });

    await user.click(screen.getByRole("button", { name: "Save" }));

    const betaConfig = readRenderedState().providers[0].modelConfigs?.beta;
    expect(betaConfig?.enabled).toBe(true);
    expect(betaConfig?.showInMenu).toBe(false);
    expect(
      screen.queryByRole("switch", { name: "LM Studio beta model" }),
    ).not.toBeInTheDocument();
  });

  it("adds, toggles, and deletes custom models", async () => {
    const { user } = renderProviderSettingsDialog();

    await user.type(
      screen.getByPlaceholderText("openai/gpt-4.1-mini"),
      "manual-model",
    );
    await user.click(screen.getByRole("button", { name: "Add model" }));

    expect(readRenderedState().providers[0].customModels).not.toContain(
      "manual-model",
    );
    expect(
      screen.getByRole("switch", { name: "manual-model selectable" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(readRenderedState().providers[0].customModels).toContain(
      "manual-model",
    );
    expect(
      readRenderedState().providers[0].modelConfigs?.["manual-model"],
    ).toMatchObject({ enabled: true, showInMenu: true });

    const manualModelSwitch = screen.getByRole("switch", {
      name: "manual-model selectable",
    });

    await user.click(manualModelSwitch);

    expect(
      readRenderedState().providers[0].modelConfigs?.["manual-model"],
    ).toMatchObject({ enabled: true, showInMenu: true });

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      readRenderedState().providers[0].modelConfigs?.["manual-model"],
    ).toMatchObject({ enabled: true, showInMenu: false });

    const customRow = manualModelSwitch.closest('[role="button"]');
    expect(customRow).toBeInstanceOf(HTMLElement);
    await user.click(
      within(customRow as HTMLElement).getByTitle("Delete custom model"),
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(readRenderedState().providers[0].customModels).not.toContain(
      "manual-model",
    );
  });
  it("keeps sidebar model switches visible when chat availability is turned off", async () => {
    const { user } = renderProviderSettingsDialog();
    const alphaSwitch = screen.getByRole("switch", {
      name: "LM Studio alpha model",
    });

    await user.click(alphaSwitch);

    expect(
      screen.getByRole("switch", { name: "LM Studio alpha model" }),
    ).toBeInTheDocument();
    expect(readRenderedState().providers[0].modelConfigs?.alpha).toMatchObject({
      enabled: false,
      showInMenu: true,
    });
  });

  it("disables save until the current provider draft changes", async () => {
    const { user, onSave } = renderProviderSettingsDialog();
    const saveButton = screen.getByRole("button", { name: "Save" });

    expect(saveButton).toBeDisabled();

    await user.type(screen.getByLabelText("Provider name"), " Local");

    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    expect(onSave).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("blocks duplicate provider names", async () => {
    const { user, onSave } = renderProviderSettingsDialog();
    const nameInput = screen.getByLabelText("Provider name");

    await user.clear(nameInput);
    await user.type(nameInput, "openrouter");

    expect(
      screen.getByText('A provider named "openrouter" already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not warn when leaving an untouched new provider draft", async () => {
    const { user } = renderProviderSettingsDialog();

    await user.click(screen.getByRole("button", { name: "Add provider" }));
    await user.click(screen.getByText("OpenRouter"));

    expect(screen.queryByText("Discard unsaved changes?")).not.toBeInTheDocument();
    expect(readRenderedState().activeProviderId).toBe("openrouter");
  });

  it("warns before leaving a changed provider draft", async () => {
    const { user } = renderProviderSettingsDialog();

    await user.click(screen.getByRole("button", { name: "Add provider" }));
    await user.type(screen.getByLabelText("Provider name"), " Edited");
    await user.click(screen.getByText("OpenRouter"));

    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(readRenderedState().activeProviderId).toBe("openrouter");
  });

  it("shows the selected model name in a disabled field", async () => {
    const { user } = renderProviderSettingsDialog();
    const alphaModelSwitch = screen.getByRole("switch", {
      name: "LM Studio alpha model",
    });
    const alphaModelRow = alphaModelSwitch.closest('[role="button"]');
    expect(alphaModelRow).toBeInstanceOf(HTMLElement);

    await user.click(alphaModelRow as HTMLElement);

    const modelNameInput = screen.getByLabelText("Model name");
    expect(modelNameInput).toHaveValue("alpha");
    expect(modelNameInput).toBeDisabled();
  });

  it("opens a model from another provider with one sidebar click", async () => {
    const { user } = renderProviderSettingsDialog();
    const openRouterModelSwitch = screen.getByRole("switch", {
      name: "OpenRouter or-model model",
    });
    const openRouterModelRow = openRouterModelSwitch.closest('[role="button"]');
    expect(openRouterModelRow).toBeInstanceOf(HTMLElement);

    await user.click(openRouterModelRow as HTMLElement);

    const modelNameInput = await screen.findByLabelText("Model name");
    expect(modelNameInput).toHaveValue("or-model");
    expect(readRenderedState().activeProviderId).toBe("openrouter");
  });

  it("keeps model numeric settings within their accepted formats while allowing empty values", async () => {
    const { user } = renderProviderSettingsDialog();
    const alphaModelSwitch = screen.getByRole("switch", {
      name: "LM Studio alpha model",
    });
    const alphaModelRow = alphaModelSwitch.closest('[role="button"]');
    expect(alphaModelRow).toBeInstanceOf(HTMLElement);

    await user.click(alphaModelRow as HTMLElement);

    const topPInput = screen.getByLabelText("Top P");
    await user.clear(topPInput);
    await user.type(topPInput, "9");
    expect(topPInput).toHaveValue("");
    await user.type(topPInput, "0.7");
    expect(topPInput).toHaveValue("0.7");

    const maxTokensInput = screen.getByLabelText("Max output tokens");
    await user.clear(maxTokensInput);
    await user.type(maxTokensInput, "0");
    expect(maxTokensInput).toHaveValue("");
    await user.type(maxTokensInput, "abc");
    expect(maxTokensInput).toHaveValue("");
    await user.type(maxTokensInput, "123.45");
    expect(maxTokensInput).toHaveValue("12345");
    expect(maxTokensInput).not.toHaveValue("123.45");

    await user.clear(maxTokensInput);
    expect(maxTokensInput).toHaveValue("");
  });

});
