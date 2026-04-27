type ModelLike = {
  id?: unknown;
  name?: unknown;
  display_name?: unknown;
  type?: unknown;
};

export const runtime = "nodejs";

const BLOCKED_UPSTREAM_HEADERS = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "cookie",
  "host",
  "origin",
  "referer",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "transfer-encoding",
  "upgrade",
]);

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function isAnthropicApi(baseUrl: string) {
  return normalizeBaseUrl(baseUrl) === "https://api.anthropic.com/v1";
}

export function assertValidBaseUrl(baseUrl: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    throw new Error("Provider base URL is required.");
  }

  const url = new URL(normalizedBaseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Provider base URL must start with http:// or https://.");
  }

  return normalizedBaseUrl;
}

export function parseCustomHeaders(rawHeaders?: string) {
  const headers = new Headers();
  const lines = rawHeaders?.split(/\r?\n/) ?? [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;

    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    const normalizedName = name.toLowerCase();

    if (!name || !value || BLOCKED_UPSTREAM_HEADERS.has(normalizedName)) continue;
    headers.set(name, value);
  }

  return headers;
}

export function buildOpenAIHeaders({
  apiKey,
  customHeaders,
  extraHeaders,
}: {
  apiKey?: string;
  customHeaders?: string;
  extraHeaders?: HeadersInit;
}) {
  const headers = parseCustomHeaders(customHeaders);
  const additionalHeaders = new Headers(extraHeaders);

  additionalHeaders.forEach((value, key) => {
    headers.set(key, value);
  });

  const trimmedApiKey = apiKey?.trim();
  if (trimmedApiKey) {
    headers.set("Authorization", `Bearer ${trimmedApiKey}`);
  }

  return headers;
}

export function buildAnthropicHeaders({
  apiKey,
  customHeaders,
  extraHeaders,
}: {
  apiKey?: string;
  customHeaders?: string;
  extraHeaders?: HeadersInit;
}) {
  const headers = parseCustomHeaders(customHeaders);
  const additionalHeaders = new Headers(extraHeaders);

  additionalHeaders.forEach((value, key) => {
    headers.set(key, value);
  });

  const trimmedApiKey = apiKey?.trim();
  if (trimmedApiKey) {
    headers.set("x-api-key", trimmedApiKey);
  }

  if (!headers.has("anthropic-dangerous-direct-browser-access")) {
    headers.set("anthropic-dangerous-direct-browser-access", "true");
  }
  if (!headers.has("anthropic-version")) {
    headers.set("anthropic-version", "2023-06-01");
  }

  return headers;
}

function mergeSignals(left?: AbortSignal | null, right?: AbortSignal | null) {
  if (!left) return right ?? undefined;
  if (!right) return left;

  const controller = new AbortController();
  const abort = () => controller.abort();

  if (left.aborted || right.aborted) {
    controller.abort();
    return controller.signal;
  }

  left.addEventListener("abort", abort, { once: true });
  right.addEventListener("abort", abort, { once: true });

  return controller.signal;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 10000,
) {
  if (timeoutMs <= 0) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: mergeSignals(init.signal, controller.signal),
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getModelId(model: ModelLike) {
  if (typeof model.id === "string" && model.id.trim()) return model.id;
  if (typeof model.name === "string" && model.name.trim()) return model.name.replace(/^models\//, "");
  if (typeof model.display_name === "string" && model.display_name.trim()) return model.display_name;
  return undefined;
}

export function normalizeModelList(data: unknown, baseUrl: string) {
  const source = (() => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && "data" in data && Array.isArray(data.data)) return data.data;
    if (data && typeof data === "object" && "models" in data && Array.isArray(data.models)) return data.models;
    return [];
  })();

  const normalized = source
    .map((model: unknown) => {
      if (typeof model === "string") return model;
      if (!model || typeof model !== "object") return undefined;

      const typedModel = model as ModelLike;

      if (normalizeBaseUrl(baseUrl) === "https://api.together.xyz/v1") {
        return typeof typedModel.id === "string" ? typedModel.id : undefined;
      }

      return getModelId(typedModel);
    })
    .filter((model: unknown): model is string => typeof model === "string" && model.trim().length > 0);

  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

export async function readUpstreamError(response: Response) {
  const text = await response.text();
  return text || `Provider returned ${response.status}`;
}
