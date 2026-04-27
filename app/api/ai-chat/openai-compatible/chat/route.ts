import {
  assertValidBaseUrl,
  buildOpenAIHeaders,
  fetchWithTimeout,
  readUpstreamError,
} from "../_shared";

export const runtime = "nodejs";

type ChatRequest = {
  baseUrl?: string;
  apiKey?: string;
  customHeaders?: string;
  timeoutMs?: number;
  payload?: unknown;
};

function normalizeTimeout(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 30000;
  return Math.min(Math.max(Math.round(value), 1000), 300000);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const baseUrl = assertValidBaseUrl(body.baseUrl ?? "");

    if (!body.payload || typeof body.payload !== "object") {
      return new Response("Chat payload is required.", { status: 400 });
    }

    const upstreamResponse = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: buildOpenAIHeaders({
          apiKey: body.apiKey,
          customHeaders: body.customHeaders,
          extraHeaders: {
            "Content-Type": "application/json",
            Accept: "text/event-stream, application/json",
          },
        }),
        body: JSON.stringify(body.payload),
        signal: request.signal,
      },
      normalizeTimeout(body.timeoutMs),
    );

    if (!upstreamResponse.ok) {
      return new Response(await readUpstreamError(upstreamResponse), {
        status: upstreamResponse.status,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const contentType = upstreamResponse.headers.get("Content-Type") ?? "";
    const requestedStream =
      "stream" in body.payload && (body.payload as { stream?: unknown }).stream === true;
    const isStream = requestedStream || contentType.includes("text/event-stream");

    if (!isStream) {
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: {
          "Content-Type": contentType || "application/json; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "Provider request timed out or was cancelled."
        : error instanceof Error
          ? error.message
          : "Provider request failed.";
    return new Response(message, {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
