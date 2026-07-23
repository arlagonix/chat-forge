import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Annotation, EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder as editorPlaceholder,
  rectangularSelection,
} from "@codemirror/view";
import { useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

type CodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  language?: "plain" | "markdown";
  readOnly?: boolean;
  className?: string;
  ariaLabel?: string;
};

const externalUpdateAnnotation = Annotation.define<boolean>();

const codeEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "inherit",
    backgroundColor: "var(--code-editor-background)",
    color: "var(--foreground)",
    fontSize: "0.875rem",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.5rem",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "0.75rem 0",
    caretColor: "var(--foreground)",
  },
  ".cm-content ::selection": {
    backgroundColor: "var(--code-editor-selection-background)",
    color: "var(--foreground)",
  },
  ".cm-line": {
    padding: "0 0.75rem",
  },
  ".cm-gutters": {
    backgroundColor: "var(--code-editor-background)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "inherit",
  },
  "&.cm-focused .cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklab, var(--accent) 60%, transparent)",
    color: "var(--foreground)",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  "&.cm-focused .cm-activeLine": {
    backgroundColor: "color-mix(in oklab, var(--accent) 22%, transparent)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--code-editor-cursor)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--code-editor-selection-background)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--code-editor-selection-match-background)",
    outline: "1px solid var(--code-editor-match-outline)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--code-editor-search-match-background)",
    outline: "1px solid var(--code-editor-match-outline)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--code-editor-search-match-active-background)",
  },
  ".cm-placeholder": {
    color: "var(--muted-foreground)",
  },
  ".cm-tooltip": {
    border: "1px solid var(--border)",
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
  },
});

export function CodeEditor({
  value,
  onChange,
  placeholder,
  language = "plain",
  readOnly = false,
  className,
  ariaLabel,
}: CodeEditorProps) {
  if (import.meta.env.MODE === "test") {
    return (
      <CodeEditorTestFallback
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        language={language}
        readOnly={readOnly}
        className={className}
        ariaLabel={ariaLabel}
      />
    );
  }

  return (
    <CodeMirrorEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      language={language}
      readOnly={readOnly}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}

function CodeEditorTestFallback({
  value,
  onChange,
  placeholder,
  language = "plain",
  readOnly = false,
  className,
  ariaLabel,
}: CodeEditorProps) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      aria-label={ariaLabel}
      className={cn(
        "molten-code-editor min-h-0 rounded-sm border p-3 font-mono text-sm leading-6 text-foreground",
        className,
      )}
    />
  );
}

function CodeMirrorEditor({
  value,
  onChange,
  placeholder,
  language = "plain",
  readOnly = false,
  className,
  ariaLabel,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  valueRef.current = value;
  onChangeRef.current = onChange;

  const extensions = useMemo(
    () => [
      lineNumbers(),
      readOnly ? [] : highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      rectangularSelection(),
      crosshairCursor(),
      readOnly ? [] : highlightActiveLine(),
      highlightSelectionMatches(),
      language === "markdown" ? markdown() : [],
      EditorView.lineWrapping,
      EditorView.editable.of(!readOnly),
      EditorState.readOnly.of(readOnly),
      placeholder ? editorPlaceholder(placeholder) : [],
      codeEditorTheme,
      keymap.of([
        indentWithTab,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const nextValue = update.state.doc.toString();
        valueRef.current = nextValue;
        if (update.transactions.some((transaction) =>
          transaction.annotation(externalUpdateAnnotation),
        )) {
          return;
        }
        onChangeRef.current?.(nextValue);
      }),
    ],
    [language, placeholder, readOnly],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const state = EditorState.create({
      doc: valueRef.current,
      extensions,
    });
    const view = new EditorView({
      state,
      parent: container,
    });
    viewRef.current = view;

    if (ariaLabel) {
      view.contentDOM.setAttribute("aria-label", ariaLabel);
    }

    return () => {
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [ariaLabel, extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
      annotations: externalUpdateAnnotation.of(true),
    });
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "molten-code-editor min-h-0 overflow-hidden rounded-sm border text-foreground",
        className,
      )}
    />
  );
}
