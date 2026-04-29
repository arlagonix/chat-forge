"use client";

import { Check, Clipboard } from "lucide-react";
import { Children, isValidElement, ReactNode, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MarkdownMessageProps = {
  content: string;
  className?: string;
};

function normalizeMarkdownContent(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").replace(/^\n+/, "");
  const lines = normalized.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  if (nonEmptyLines.length === 0) return normalized;

  const indents = nonEmptyLines.map((line) => line.match(/^ */)?.[0].length ?? 0);
  const smallestIndent = Math.min(...indents);

  if (smallestIndent < 4) return normalized;

  return lines.map((line) => line.slice(smallestIndent)).join("\n");
}

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromNode).join("");
  }

  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return textFromNode(props.children);
  }

  return "";
}

function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code.replace(/\n$/, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      className="absolute right-2 top-2 z-10 h-7 w-7 rounded-none border bg-background/90 text-muted-foreground shadow-xs hover:text-foreground"
      onClick={copyCode}
      title={copied ? "Copied" : "Copy code"}
      aria-label={copied ? "Copied" : "Copy code"}
    >
      {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
    </Button>
  );
}

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div
      className={cn("chat-markdown min-w-0 max-w-full", className)}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ className, ...props }) => (
            <a
              className={cn("underline underline-offset-4", className)}
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          code: ({ className, children, ...props }) => (
            <code className={cn(className)} {...props}>
              {children}
            </code>
          ),
          pre: ({ className, children }) => {
            const code = Children.toArray(children).map(textFromNode).join("");

            return (
              <div className={cn("chat-code-block", className)}>
                <CodeCopyButton code={code} />
                <pre>
                  {children}
                </pre>
              </div>
            );
          },
        }}
      >
        {normalizeMarkdownContent(content)}
      </ReactMarkdown>
    </div>
  );
}
