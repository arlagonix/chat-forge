import {
  assertValidBaseUrl,
  buildAnthropicHeaders,
  buildOpenAIHeaders,
  fetchWithTimeout,
  isAnthropicApi,
  normalizeModelList,
  readUpstreamError,
} from "../_shared";

export const runtime = "nodejs";

type ModelsRequest = {
  baseUrl?: string;
  apiKey?: string;
  customHeaders?: string;
  timeoutMs?: number;
};

function normalizeTimeout(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 30000;
  return Math.min(Math.max(Math.round(value), 1000), 300000);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ModelsRequest;
    const baseUrl = assertValidBaseUrl(body.baseUrl ?? "");
    const timeoutMs = normalizeTimeout(body.timeoutMs);

    if (isAnthropicApi(baseUrl)) {
      const response = await fetchWithTimeout(
        `${baseUrl}/models`,
        {
          headers: buildAnthropicHeaders({
            apiKey: body.apiKey,
            customHeaders: body.customHeaders,
          }),
          signal: request.signal,
        },
        timeoutMs,
      );

      if (!response.ok) {
        return Response.json({ models: [], error: await readUpstreamError(response) }, { status: 200 });
      }

      const data = await response.json();
      return Response.json({ models: normalizeModelList(data, baseUrl) });
    }

    const response = await fetchWithTimeout(
      `${baseUrl}/models`,
      {
        headers: buildOpenAIHeaders({
          apiKey: body.apiKey,
          customHeaders: body.customHeaders,
        }),
        signal: request.signal,
      },
      timeoutMs,
    );

    if (response.url === "https://generativelanguage.googleapis.com/v1beta/openai/models") {
      const googleResponse = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(body.apiKey ?? "")}`,
        { signal: request.signal },
        timeoutMs,
      );

      if (!googleResponse.ok) {
        return Response.json({ models: [], error: await readUpstreamError(googleResponse) }, { status: 200 });
      }

      const googleData = await googleResponse.json();
      return Response.json({ models: normalizeModelList(googleData, baseUrl) });
    }

    if (!response.ok) {
      return Response.json({ models: [], error: await readUpstreamError(response) }, { status: 200 });
    }

    const data = await response.json();
    return Response.json({ models: normalizeModelList(data, baseUrl) });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "Model lookup timed out or was cancelled."
        : error instanceof Error
          ? error.message
          : "Failed to fetch models.";
    return Response.json({ models: [], error: message }, { status: 500 });
  }
}
