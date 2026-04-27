import {
  buildUpstreamHeaders,
  makeJsonError,
  normalizeBaseUrl,
  readProxyRequest,
} from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isStreamingPayload(payload: unknown) {
  return Boolean(payload && typeof payload === "object" && "stream" in payload && payload.stream === true);
}

export async function POST(request: Request) {
  const parsed = await readProxyRequest(request);
  if ("error" in parsed) return parsed.error;

  const { baseUrl, apiKey, customHeaders, payload } = parsed.value;

  if (!payload || typeof payload !== "object") {
    return makeJsonError("payload is required.");
  }

  const stream = isStreamingPayload(payload);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
      method: "POST",
      headers: buildUpstreamHeaders({
        apiKey,
        customHeaders,
        contentType: "application/json",
        accept: stream ? "text/event-stream" : "application/json",
      }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach provider.";
    return makeJsonError(message, 502);
  }

  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text().catch(() => "");

    return new Response(text || `Provider returned ${upstreamResponse.status}`, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": upstreamResponse.headers.get("Content-Type") || "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (!stream) {
    const text = await upstreamResponse.text();

    return new Response(text, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": upstreamResponse.headers.get("Content-Type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (!upstreamResponse.body) {
    return makeJsonError("Provider response did not include a readable stream.", 502);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": upstreamResponse.headers.get("Content-Type") || "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
