import { Minus, Plus, RotateCcw } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MermaidPreviewProps = {
  source: string;
  className?: string;
  interactive?: boolean;
  onRenderedSvg?: (svg: string | undefined) => void;
};

type MermaidTransform = {
  scale: number;
  x: number;
  y: number;
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const FIT_PADDING = 24;
const INITIAL_TRANSFORM: MermaidTransform = {
  scale: 1,
  x: 0,
  y: 0,
};

function errorMessageFromUnknown(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to render Mermaid diagram.";
}

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function MermaidPreview({
  source,
  className,
  interactive = false,
  onRenderedSvg,
}: MermaidPreviewProps) {
  const reactId = React.useId();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const renderedContentRef = React.useRef<HTMLDivElement | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const fitScaleRef = React.useRef(1);
  const transformRef = React.useRef<MermaidTransform>(INITIAL_TRANSFORM);
  const userZoomRef = React.useRef(1);
  const dragRef = React.useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [svg, setSvg] = React.useState<string>();
  const [error, setError] = React.useState<string>();
  const [transform, setTransform] =
    React.useState<MermaidTransform>(INITIAL_TRANSFORM);
  const [userZoom, setUserZoom] = React.useState(1);
  const [isDragging, setIsDragging] = React.useState(false);
  const [hasFitTransform, setHasFitTransform] = React.useState(false);

  const applyTransform = React.useCallback((nextTransform: MermaidTransform) => {
    const content = contentRef.current;
    if (!content) return;

    content.style.transform = `translate(${nextTransform.x}px, ${nextTransform.y}px) scale(${nextTransform.scale})`;
  }, []);

  const commitTransform = React.useCallback(
    (nextTransform: MermaidTransform, syncState = true) => {
      transformRef.current = nextTransform;
      applyTransform(nextTransform);

      if (syncState) {
        setTransform(nextTransform);
      }
    },
    [applyTransform],
  );

  const scheduleTransformPaint = React.useCallback(() => {
    if (animationFrameRef.current !== null) return;

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      applyTransform(transformRef.current);
    });
  }, [applyTransform]);

  const finishDrag = React.useCallback(
    (pointerId: number) => {
      if (dragRef.current?.pointerId !== pointerId) return;

      dragRef.current = null;
      setIsDragging(false);

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      applyTransform(transformRef.current);
      setTransform(transformRef.current);
    },
    [applyTransform],
  );

  const fitToScreen = React.useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const renderedContent = renderedContentRef.current;
    if (!viewport || !content || !renderedContent) return;

    const viewportRect = viewport.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return;

    const availableWidth = Math.max(viewportRect.width - FIT_PADDING * 2, 1);
    const availableHeight = Math.max(viewportRect.height - FIT_PADDING * 2, 1);
    renderedContent.style.width = `${availableWidth}px`;

    const previousTransform = content.style.transform;
    content.style.transform = "translate(0px, 0px) scale(1)";

    const renderedContentRect = renderedContent.getBoundingClientRect();
    const svgRect = renderedContent.querySelector("svg")?.getBoundingClientRect();
    const renderedWidth = Math.max(
      svgRect?.width ?? renderedContent.offsetWidth,
      1,
    );
    const renderedHeight = Math.max(
      svgRect?.height ?? renderedContent.offsetHeight,
      1,
    );
    const renderedX = svgRect ? svgRect.left - renderedContentRect.left : 0;
    const renderedY = svgRect ? svgRect.top - renderedContentRect.top : 0;

    content.style.transform = previousTransform;

    const fitScale = Math.max(
      Math.min(availableWidth / renderedWidth, availableHeight / renderedHeight),
      Number.EPSILON,
    );
    fitScaleRef.current = fitScale;
    userZoomRef.current = 1;
    setUserZoom(1);

    commitTransform({
      scale: fitScale,
      x:
        (viewportRect.width - renderedWidth * fitScale) / 2 -
        renderedX * fitScale,
      y:
        (viewportRect.height - renderedHeight * fitScale) / 2 -
        renderedY * fitScale,
    });
    setHasFitTransform(true);
  }, [commitTransform]);

  const zoomAt = React.useCallback(
    (factor: number, center?: { x: number; y: number }) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const viewportRect = viewport.getBoundingClientRect();
      const focalPoint = center ?? {
        x: viewportRect.width / 2,
        y: viewportRect.height / 2,
      };

      const current = transformRef.current;
      const nextUserZoom = clampScale(userZoomRef.current * factor);
      const nextScale = fitScaleRef.current * nextUserZoom;
      const scaleRatio = nextScale / current.scale;
      userZoomRef.current = nextUserZoom;
      setUserZoom(nextUserZoom);

      commitTransform({
        scale: nextScale,
        x: focalPoint.x - (focalPoint.x - current.x) * scaleRatio,
        y: focalPoint.y - (focalPoint.y - current.y) * scaleRatio,
      });
    },
    [commitTransform],
  );

  React.useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      const trimmedSource = source.trim();

      setError(undefined);
      setHasFitTransform(false);
      setSvg(undefined);
      onRenderedSvg?.(undefined);
      fitScaleRef.current = 1;
      userZoomRef.current = 1;
      setUserZoom(1);
      commitTransform(INITIAL_TRANSFORM);

      if (!trimmedSource) return;

      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;
        const id = `chat-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-${Math.random().toString(36).slice(2)}`;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "default",
        });

        const renderContainer = document.createElement("div");
        renderContainer.setAttribute("aria-hidden", "true");
        renderContainer.style.position = "fixed";
        renderContainer.style.left = "0";
        renderContainer.style.top = "0";
        renderContainer.style.width = "0";
        renderContainer.style.height = "0";
        renderContainer.style.overflow = "hidden";
        renderContainer.style.pointerEvents = "none";
        renderContainer.style.visibility = "hidden";
        document.body.appendChild(renderContainer);

        try {
          const result = await mermaid.render(id, trimmedSource, renderContainer);

          if (!cancelled) {
            setSvg(result.svg);
            onRenderedSvg?.(result.svg);
          }
        } finally {
          renderContainer.remove();
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(errorMessageFromUnknown(caughtError));
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [commitTransform, interactive, onRenderedSvg, reactId, source]);

  React.useLayoutEffect(() => {
    if (!interactive || !svg) return;

    fitToScreen();
    const animationFrame = window.requestAnimationFrame(() => fitToScreen());

    return () => window.cancelAnimationFrame(animationFrame);
  }, [fitToScreen, interactive, svg]);

  React.useEffect(() => {
    if (!interactive) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(() => fitToScreen());
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [fitToScreen, interactive]);

  if (error) {
    return <div className={cn("chat-code-preview-error", className)}>{error}</div>;
  }

  if (!svg) {
    return (
      <div className={cn("chat-code-preview-loading", className)}>
        Rendering Mermaid diagram...
      </div>
    );
  }

  if (!interactive) {
    return (
      <div
        className={cn("chat-code-mermaid-preview", className)}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <div
      className={cn(
        "chat-code-mermaid-preview chat-code-mermaid-interactive",
        className,
      )}
    >
      <div className="chat-code-mermaid-controls" aria-label="Diagram controls">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="chat-code-action"
          onClick={() => zoomAt(1.2)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="chat-code-action"
          onClick={() => zoomAt(1 / 1.2)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="chat-code-action"
          onClick={fitToScreen}
          title="Fit diagram"
          aria-label="Fit diagram"
        >
          <RotateCcw className="size-3.5" />
        </Button>
        <span className="chat-code-mermaid-zoom-label" title="Current zoom">
          {Math.round(userZoom * 100)}%
        </span>
      </div>

      <div
        ref={viewportRef}
        className={cn(
          "chat-code-mermaid-viewport",
          isDragging && "chat-code-mermaid-viewport-dragging",
        )}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;

          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsDragging(true);
          dragRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startX: transformRef.current.x,
            startY: transformRef.current.y,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;

          transformRef.current = {
            ...transformRef.current,
            x: drag.startX + event.clientX - drag.startClientX,
            y: drag.startY + event.clientY - drag.startClientY,
          };
          scheduleTransformPaint();
        }}
        onPointerUp={(event) => {
          finishDrag(event.pointerId);
        }}
        onPointerCancel={(event) => {
          finishDrag(event.pointerId);
        }}
      >
        <div
          ref={contentRef}
          className={cn(
            "chat-code-mermaid-transform",
            !hasFitTransform && "chat-code-mermaid-transform-pending",
          )}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          <div
            ref={renderedContentRef}
            className="chat-code-mermaid-rendered"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>
    </div>
  );
}
