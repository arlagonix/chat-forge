import { NextResponse } from "next/server";
import type { ApiChatMessage, ChatRequestBody } from "@/lib/types";

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const { provider, systemPrompt, messages, userMessage } = body;

    if (!provider?.baseUrl) {
      return NextResponse.json({ error: "Provider base URL is required." }, { status: 400 });
    }

    if (!provider?.model) {
      return NextResponse.json({ error: "Model name is required." }, { status: 400 });
    }

    if (!userMessage.trim()) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const apiMessages: ApiChatMessage[] = [
      ...(systemPrompt.trim()
        ? [{ role: "system" as const, content: systemPrompt.trim() }]
        : []),
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: "user",
        content: userMessage,
      },
    ];

    const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey || "not-needed"}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: apiMessages,
        stream: false,
      }),
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
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      return NextResponse.json(
        {
          error: "Provider response did not include choices[0].message.content.",
          raw: data,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 },
    );
  }
}
