import { NextResponse } from "next/server";
import type { ModelsRequestBody } from "@/lib/types";

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ModelsRequestBody;
    const { provider } = body;

    if (!provider?.baseUrl) {
      return NextResponse.json({ error: "Provider base URL is required." }, { status: 400 });
    }

    const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${provider.apiKey || "not-needed"}`,
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: responseText || `Provider returned ${response.status}`,
        },
        { status: response.status },
      );
    }

    const data = JSON.parse(responseText);
    const models = Array.isArray(data?.data)
      ? data.data
          .map((model: { id?: unknown }) => model.id)
          .filter((id: unknown): id is string => typeof id === "string")
      : [];

    return NextResponse.json({ models, raw: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 },
    );
  }
}
