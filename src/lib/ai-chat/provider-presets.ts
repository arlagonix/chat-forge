import type {
  ProviderConfig,
  ProviderGenerationSettings,
  ThinkingLevel,
} from "./types";

export const defaultGenerationSettings: ProviderGenerationSettings = {
  reasoningMode: "auto",
  reasoningEffort: "medium",
  requestTimeoutMs: 30000,
};

export const defaultProvider: ProviderConfig = {
  id: "lmstudio",
  name: "LM Studio",
  baseUrl: "http://localhost:1234/v1",
  apiKey: "not-needed",
  model: "",
  models: [],
  customModels: [],
  enabled: true,
  modelConfigs: {},
  enabledModelIds: [],
  headers: {},
  defaultSettings: defaultGenerationSettings,
  modelSettings: {},
};

/** Deprecated: provider presets are no longer shown in settings. */
export const providerPresets: ProviderConfig[] = [defaultProvider];

export const DEFAULT_THINKING_LEVEL_ID = "model_default";

export type ThinkingLevelPreset = {
  id: string;
  label: string;
  description: string;
  editable?: boolean;
  levels: ThinkingLevel[];
};

export const CUSTOM_THINKING_PRESET_ID = "custom";

export const thinkingLevelPresets: ThinkingLevelPreset[] = [
  {
    id: "default",
    label: "Default",
    description: "Generic OpenAI-compatible local thinking toggle.",
    levels: [
      {
        id: "thinking",
        label: "On",
        requestBody: {
          enable_thinking: true,
          chat_template_kwargs: { enable_thinking: true },
        },
      },
      {
        id: "off",
        label: "Off",
        requestBody: {
          enable_thinking: false,
          chat_template_kwargs: { enable_thinking: false },
        },
      },
    ],
  },
  {
    id: CUSTOM_THINKING_PRESET_ID,
    label: "Custom",
    description: "Editable request JSON levels stored on this model.",
    editable: true,
    levels: [
      {
        id: "thinking",
        label: "On",
        requestBody: {
          enable_thinking: true,
          chat_template_kwargs: { enable_thinking: true },
        },
      },
      {
        id: "off",
        label: "Off",
        requestBody: {
          enable_thinking: false,
          chat_template_kwargs: { enable_thinking: false },
        },
      },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    description:
      "OpenAI-compatible reasoning_effort values. Provider support is model-dependent.",
    levels: ["none", "minimal", "low", "medium", "high", "xhigh"].map(
      (effort) => ({
        id: effort,
        label: effort === "none" ? "Off" : effort,
        requestBody: { reasoning_effort: effort },
      }),
    ),
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Native Anthropic/Bedrock adaptive thinking shape.",
    levels: ["low", "medium", "high", "max"].map((effort) => ({
      id: effort,
      label: effort,
      requestBody: {
        thinking: { type: "adaptive" },
        output_config: { effort },
      },
    })),
  },
  {
    id: "gemini",
    label: "Gemini",
    description: "Native Gemini generation_config thinking level shape.",
    levels: ["none", "low", "medium", "high", "auto"].map((level) => ({
      id: level,
      label: level === "none" ? "Off" : level,
      requestBody: { generation_config: { thinking_level: level } },
    })),
  },
  {
    id: "qwen",
    label: "Qwen",
    description:
      "OpenAI-compatible Qwen local switches used by vLLM and similar stacks.",
    levels: [
      {
        id: "thinking",
        label: "On",
        requestBody: {
          enable_thinking: true,
          chat_template_kwargs: { enable_thinking: true },
        },
      },
      {
        id: "off",
        label: "Off",
        requestBody: {
          enable_thinking: false,
          chat_template_kwargs: { enable_thinking: false },
        },
      },
    ],
  },
  {
    id: "deepseek",
    label: "Deepseek",
    description: "DeepSeek thinking toggle and effort controls.",
    levels: [
      {
        id: "high",
        label: "On",
        requestBody: {
          thinking: { type: "enabled" },
          reasoning_effort: "high",
        },
      },
      {
        id: "max",
        label: "Max",
        requestBody: {
          thinking: { type: "enabled" },
          reasoning_effort: "max",
        },
      },
      {
        id: "off",
        label: "Off",
        requestBody: { thinking: { type: "disabled" } },
      },
    ],
  },
  {
    id: "glm",
    label: "GLM",
    description: "GLM thinking object shape.",
    levels: [
      {
        id: "thinking",
        label: "On",
        requestBody: { thinking: { type: "enabled" } },
      },
      {
        id: "off",
        label: "Off",
        requestBody: { thinking: { type: "disabled" } },
      },
    ],
  },
];
