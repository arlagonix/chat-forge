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
import { EditorState } from "@codemirror/state";
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
  readOnly?: boolean;
  className?: string;
  ariaLabel?: string;
};

const codeEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "inherit",
    backgroundColor: "transparent",
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
  },
  ".cm-line": {
    padding: "0 0.75rem",
  },
  ".cm-gutters": {
    backgroundColor: "color-mix(in oklab, var(--muted) 38%, transparent)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklab, var(--accent) 60%, transparent)",
    color: "var(--foreground)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklab, var(--accent) 22%, transparent)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)",
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
        "min-h-0 rounded-sm border bg-background p-3 font-mono text-sm leading-6 text-foreground",
        className,
      )}
    />
  );
}

function CodeMirrorEditor({
  value,
  onChange,
  placeholder,
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
      highlightActiveLineGutter(),
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
      highlightActiveLine(),
      highlightSelectionMatches(),
      markdown(),
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
        onChangeRef.current?.(nextValue);
      }),
    ],
    [placeholder, readOnly],
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
    });
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "min-h-0 overflow-hidden rounded-sm border bg-background text-foreground",
        className,
      )}
    />
  );
}
