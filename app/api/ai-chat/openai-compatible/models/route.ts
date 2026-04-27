import {
  buildUpstreamHeaders,
  makeJsonError,
  normalizeBaseUrl,
  readProxyRequest,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const parsed = await readProxyRequest(request);
  if ("error" in parsed) return parsed.error;

  const { baseUrl, apiKey, customHeaders } = parsed.value;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
      method: "GET",
      headers: buildUpstreamHeaders({
        apiKey,
        customHeaders,
        accept: "application/json",
      }),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach provider.";
    return makeJsonError(message, 502);
  }

  const text = await upstreamResponse.text();

  return new Response(text, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": upstreamResponse.headers.get("Content-Type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
