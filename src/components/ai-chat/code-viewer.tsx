import {
  HighlightStyle,
  LanguageDescription,
  syntaxHighlighting,
  type LanguageSupport,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import React from "react";

import { cn } from "@/lib/utils";

export const LARGE_TECHNICAL_TEXT_THRESHOLD = 50_000;

type ReadOnlyCodeViewerProps = {
  code: string;
  language?: string;
  wrapped: boolean;
  syntaxHighlight?: boolean;
  className?: string;
  ariaLabel?: string;
};

const LANGUAGE_ALIASES: Record<string, string> = {
  csharp: "c#",
  cs: "c#",
  js: "javascript",
  jsx: "jsx",
  kt: "kotlin",
  md: "markdown",
  mmd: "mermaid",
  ps1: "powershell",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shell",
  ts: "typescript",
  txt: "text",
  yml: "yaml",
};

const codeHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: "var(--code-comment)",
  },
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.operatorKeyword,
      tags.modifier,
      tags.definitionKeyword,
      tags.moduleKeyword,
    ],
    color: "var(--code-keyword)",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp, tags.escape],
    color: "var(--code-string)",
  },
  {
    tag: [tags.number, tags.bool, tags.null],
    color: "var(--code-number)",
  },
  {
    tag: [
      tags.heading,
      tags.labelName,
      tags.className,
      tags.typeName,
      tags.namespace,
      tags.macroName,
    ],
    color: "var(--code-title)",
  },
  {
    tag: [
      tags.propertyName,
      tags.attributeName,
      tags.variableName,
      tags.definition(tags.variableName),
    ],
    color: "var(--code-attr)",
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.standard(tags.variableName),
      tags.standard(tags.typeName),
      tags.atom,
    ],
    color: "var(--code-built-in)",
  },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
]);

const codeViewerTheme = EditorView.theme({
  "&": {
    width: "100%",
    maxWidth: "100%",
    backgroundColor: "transparent",
    color: "var(--code-fg)",
    fontSize: "0.875rem",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.25rem",
    overflow: "auto",
  },
  ".cm-content": {
    minWidth: "100%",
    padding: "0.75rem 0",
    caretColor: "transparent",
  },
  ".cm-line": {
    padding: "0 0.75rem",
  },
  ".cm-content ::selection": {
    backgroundColor: "var(--code-editor-selection-background)",
    color: "var(--code-fg)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--code-editor-selection-background)",
  },
});

const languageCache = new Map<string, Promise<LanguageSupport | null>>();

function normalizeLanguageName(language?: string) {
  const normalized = language?.trim().toLowerCase();
  if (
    !normalized ||
    normalized === "text" ||
    normalized === "plain" ||
    normalized === "plaintext"
  ) {
    return undefined;
  }

  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

function loadLanguage(language?: string) {
  const normalized = normalizeLanguageName(language);
  if (!normalized || normalized === "mermaid") {
    return Promise.resolve<LanguageSupport | null>(null);
  }

  const cached = languageCache.get(normalized);
  if (cached) return cached;

  const description = LanguageDescription.matchLanguageName(
    languages,
    normalized,
    true,
  );
  const promise = description
    ? description.load().catch((error: unknown) => {
        console.warn(`Failed to load CodeMirror language \"${normalized}\":`, error);
        return null;
      })
    : Promise.resolve<LanguageSupport | null>(null);

  languageCache.set(normalized, promise);
  return promise;
}

function calculateDocumentChange(currentValue: string, nextValue: string) {
  if (nextValue.startsWith(currentValue)) {
    return {
      from: currentValue.length,
      to: currentValue.length,
      insert: nextValue.slice(currentValue.length),
    };
  }

  if (currentValue.startsWith(nextValue)) {
    return {
      from: nextValue.length,
      to: currentValue.length,
      insert: "",
    };
  }

  let prefixLength = 0;
  const maxPrefixLength = Math.min(currentValue.length, nextValue.length);

  while (
    prefixLength < maxPrefixLength &&
    currentValue.charCodeAt(prefixLength) === nextValue.charCodeAt(prefixLength)
  ) {
    prefixLength += 1;
  }

  let currentSuffixStart = currentValue.length;
  let nextSuffixStart = nextValue.length;

  while (
    currentSuffixStart > prefixLength &&
    nextSuffixStart > prefixLength &&
    currentValue.charCodeAt(currentSuffixStart - 1) ===
      nextValue.charCodeAt(nextSuffixStart - 1)
  ) {
    currentSuffixStart -= 1;
    nextSuffixStart -= 1;
  }

  return {
    from: prefixLength,
    to: currentSuffixStart,
    insert: nextValue.slice(prefixLength, nextSuffixStart),
  };
}

export function ReadOnlyCodeViewer({
  code,
  language,
  wrapped,
  syntaxHighlight = true,
  className,
  ariaLabel = "Code block",
}: ReadOnlyCodeViewerProps) {
  if (import.meta.env.MODE === "test") {
    return (
      <pre
        className={cn(
          "chat-code-viewer chat-code-viewer-test-fallback",
          wrapped
            ? "whitespace-pre-wrap break-words"
            : "overflow-auto whitespace-pre",
          className,
        )}
        data-language={language || undefined}
        aria-label={ariaLabel}
      >
        {code}
      </pre>
    );
  }

  return (
    <CodeMirrorCodeViewer
      code={code}
      language={language}
      wrapped={wrapped}
      syntaxHighlight={syntaxHighlight}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}

export function TechnicalTextViewer({
  text,
  className,
  ariaLabel = "Technical output",
}: {
  text: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("chat-technical-text-block", className)}>
      <ReadOnlyCodeViewer
        code={text}
        language="text"
        wrapped
        syntaxHighlight={false}
        className="chat-technical-text-code-viewer"
        ariaLabel={ariaLabel}
      />
    </div>
  );
}

function CodeMirrorCodeViewer({
  code,
  language,
  wrapped,
  syntaxHighlight = true,
  className,
  ariaLabel = "Code block",
}: ReadOnlyCodeViewerProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const codeRef = React.useRef(code);
  const appliedCodeRef = React.useRef(code);
  const languageCompartmentRef = React.useRef(new Compartment());
  const wrappingCompartmentRef = React.useRef(new Compartment());

  codeRef.current = code;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const languageCompartment = languageCompartmentRef.current;
    const wrappingCompartment = wrappingCompartmentRef.current;
    const extensions: Extension[] = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.contentAttributes.of({
        "aria-label": ariaLabel,
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
      }),
      codeViewerTheme,
      syntaxHighlighting(codeHighlightStyle, { fallback: true }),
      languageCompartment.of([]),
      wrappingCompartment.of(wrapped ? EditorView.lineWrapping : []),
    ];

    const initialCode = codeRef.current;
    const view = new EditorView({
      state: EditorState.create({
        doc: initialCode,
        extensions,
      }),
      parent: container,
    });
    viewRef.current = view;
    appliedCodeRef.current = initialCode;

    return () => {
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [ariaLabel]);

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: wrappingCompartmentRef.current.reconfigure(
        wrapped ? EditorView.lineWrapping : [],
      ),
    });
  }, [wrapped]);

  React.useEffect(() => {
    let cancelled = false;
    const view = viewRef.current;
    if (!view) return;

    if (!syntaxHighlight) {
      view.dispatch({
        effects: languageCompartmentRef.current.reconfigure([]),
      });
      return;
    }

    void loadLanguage(language).then((support) => {
      if (cancelled || viewRef.current !== view) return;

      view.dispatch({
        effects: languageCompartmentRef.current.reconfigure(support ?? []),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [ariaLabel, language, syntaxHighlight]);

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = appliedCodeRef.current;
    if (currentValue === code) return;

    view.dispatch({
      changes: calculateDocumentChange(currentValue, code),
    });
    appliedCodeRef.current = code;
  }, [code]);

  return (
    <div
      ref={containerRef}
      className={cn("chat-code-viewer min-h-0 min-w-0 max-w-full", className)}
      data-language={language || undefined}
    />
  );
}
