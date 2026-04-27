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

export function isValidHttpBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function makeJsonError(message: string, status = 400) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export function parseCustomHeaders(rawHeaders?: unknown) {
  const headers = new Headers();

  if (typeof rawHeaders !== "string") return headers;

  for (const rawLine of rawHeaders.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;

    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    const normalizedName = name.toLowerCase();

    if (!name || !value || BLOCKED_UPSTREAM_HEADERS.has(normalizedName)) continue;

    try {
      headers.set(name, value);
    } catch {
      // Ignore invalid custom headers instead of failing the request.
    }
  }

  return headers;
}

export function buildUpstreamHeaders({
  apiKey,
  customHeaders,
  contentType,
  accept,
}: {
  apiKey?: unknown;
  customHeaders?: unknown;
  contentType?: string;
  accept?: string;
}) {
  const headers = parseCustomHeaders(customHeaders);

  if (contentType) headers.set("Content-Type", contentType);
  if (accept) headers.set("Accept", accept);

  // Ask upstream/proxies to avoid compression for streaming compatibility.
  // This header is intentionally set server-side; browsers cannot control it.
  headers.set("Accept-Encoding", "identity");

  if (typeof apiKey === "string" && apiKey.trim()) {
    headers.set("Authorization", `Bearer ${apiKey.trim()}`);
  }

  return headers;
}

export async function readProxyRequest(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: makeJsonError("Invalid JSON body.") } as const;
  }

  if (!body || typeof body !== "object") {
    return { error: makeJsonError("Request body must be an object.") } as const;
  }

  const record = body as Record<string, unknown>;
  const baseUrl = record.baseUrl;

  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return { error: makeJsonError("baseUrl is required.") } as const;
  }

  if (!isValidHttpBaseUrl(baseUrl)) {
    return { error: makeJsonError("baseUrl must be a valid http(s) URL.") } as const;
  }

  return {
    value: {
      baseUrl,
      apiKey: record.apiKey,
      customHeaders: record.customHeaders,
      payload: record.payload,
    },
  } as const;
}
