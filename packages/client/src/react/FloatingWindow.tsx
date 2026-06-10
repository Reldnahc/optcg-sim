import { useCallback, useEffect, useRef, useState } from "react";

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowViewport {
  width: number;
  height: number;
}

export interface OffscreenDropCapabilities {
  canMinimize: boolean;
  canClose: boolean;
}

export type OffscreenDropAction = "minimize" | "close";

interface PointerStart {
  pointerId: number;
  clientX: number;
  clientY: number;
  rect: WindowRect;
}

export interface FloatingWindowProps {
  title: string;
  className?: string | undefined;
  initialRect?: WindowRect | undefined;
  minWidth?: number | undefined;
  minHeight?: number | undefined;
  docked?: boolean | undefined;
  minimized?: boolean | undefined;
  zIndex?: number | undefined;
  onToggleMinimized?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onActivate?: (() => void) | undefined;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => WindowRect | undefined) | undefined;
  headerContent?: React.ReactNode;
  children?: React.ReactNode;
}

const defaultRect: WindowRect = {
  x: 320,
  y: 120,
  width: 560,
  height: 460,
};

const clampRect = (
  rect: WindowRect,
  minWidth: number,
  minHeight: number,
): WindowRect => ({
  x: Math.max(0, rect.x),
  y: Math.max(0, rect.y),
  width: Math.max(minWidth, rect.width),
  height: Math.max(minHeight, rect.height),
});

export const clampRectToViewport = (
  rect: WindowRect,
  minWidth: number,
  minHeight: number,
  viewport?: WindowViewport,
): WindowRect => {
  const sizedRect = clampRect(rect, minWidth, minHeight);
  if (viewport === undefined) {
    return sizedRect;
  }
  const width = Math.min(sizedRect.width, viewport.width);
  const height = Math.min(sizedRect.height, viewport.height);
  return {
    x: Math.min(Math.max(0, sizedRect.x), Math.max(0, viewport.width - width)),
    y: Math.min(
      Math.max(0, sizedRect.y),
      Math.max(0, viewport.height - height),
    ),
    width,
    height,
  };
};

const currentViewport = (): WindowViewport | undefined =>
  typeof window === "undefined"
    ? undefined
    : { width: window.innerWidth, height: window.innerHeight };

const dragRect = (
  start: PointerStart,
  clientX: number,
  clientY: number,
  minWidth: number,
  minHeight: number,
): WindowRect =>
  clampRect(
    {
      ...start.rect,
      x: start.rect.x + clientX - start.clientX,
      y: start.rect.y + clientY - start.clientY,
    },
    minWidth,
    minHeight,
  );

export const resolveOffscreenDropAction = (
  rect: WindowRect,
  viewport: WindowViewport,
  capabilities: OffscreenDropCapabilities,
): OffscreenDropAction | undefined => {
  const offscreen =
    rect.x >= viewport.width ||
    rect.y >= viewport.height ||
    rect.x + rect.width <= 0 ||
    rect.y + rect.height <= 0;
  if (!offscreen) {
    return undefined;
  }
  if (capabilities.canMinimize) {
    return "minimize";
  }
  if (capabilities.canClose) {
    return "close";
  }
  return undefined;
};

export const FloatingWindow = ({
  title,
  className,
  initialRect = defaultRect,
  minWidth = 220,
  minHeight = 140,
  docked = false,
  minimized = false,
  zIndex,
  onToggleMinimized,
  onClose,
  onActivate,
  onRectChange,
  onDragMove,
  onDragEnd,
  headerContent,
  children,
}: FloatingWindowProps): React.JSX.Element => {
  const effectiveMinWidth = docked ? 0 : minWidth;
  const effectiveMinHeight = docked ? 0 : minHeight;
  const [rect, setRect] = useState(() =>
    clampRectToViewport(
      initialRect,
      effectiveMinWidth,
      effectiveMinHeight,
      currentViewport(),
    ),
  );
  const dragStart = useRef<PointerStart | undefined>(undefined);
  const resizeStart = useRef<PointerStart | undefined>(undefined);
  const updateRect = useCallback(
    (nextRect: WindowRect) => {
      setRect(nextRect);
      onRectChange?.(nextRect);
    },
    [onRectChange],
  );
  useEffect(() => {
    setRect(
      clampRectToViewport(
        initialRect,
        effectiveMinWidth,
        effectiveMinHeight,
        currentViewport(),
      ),
    );
  }, [
    effectiveMinHeight,
    effectiveMinWidth,
    initialRect.height,
    initialRect.width,
    initialRect.x,
    initialRect.y,
  ]);

  const handleDragPointerDown = (
    event: React.PointerEvent<HTMLElement>,
  ): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      rect,
    };
  };

  const handleDragPointerMove = (
    event: React.PointerEvent<HTMLElement>,
  ): void => {
    const start = dragStart.current;
    if (start === undefined || start.pointerId !== event.pointerId) {
      return;
    }
    const nextRect = dragRect(
      start,
      event.clientX,
      event.clientY,
      effectiveMinWidth,
      effectiveMinHeight,
    );
    updateRect(nextRect);
    onDragMove?.(nextRect);
  };

  const handleDragPointerUp = (
    event: React.PointerEvent<HTMLElement>,
  ): void => {
    completeDrag(event.pointerId, event.clientX, event.clientY);
  };

  const handleDragPointerCancel = (
    event: React.PointerEvent<HTMLElement>,
  ): void => {
    stopInteraction(event.pointerId);
  };

  const stopInteraction = useCallback((pointerId: number) => {
    if (dragStart.current?.pointerId === pointerId) {
      dragStart.current = undefined;
    }
    if (resizeStart.current?.pointerId === pointerId) {
      resizeStart.current = undefined;
    }
  }, []);

  const completeDrag = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const start = dragStart.current;
      if (start !== undefined && start.pointerId === pointerId) {
        const droppedRect = dragRect(
          start,
          clientX,
          clientY,
          effectiveMinWidth,
          effectiveMinHeight,
        );
        const action =
          typeof window === "undefined"
            ? undefined
            : resolveOffscreenDropAction(
                droppedRect,
                {
                  width: window.innerWidth,
                  height: window.innerHeight,
                },
                {
                  canMinimize: onToggleMinimized !== undefined,
                  canClose: onClose !== undefined,
                },
              );
        if (action === "minimize") {
          onToggleMinimized?.();
        }
        if (action === "close") {
          onClose?.();
        }
        if (action === undefined) {
          const resolvedRect = onDragEnd?.(droppedRect);
          if (resolvedRect !== undefined) {
            updateRect(
              clampRectToViewport(
                resolvedRect,
                effectiveMinWidth,
                effectiveMinHeight,
                currentViewport(),
              ),
            );
          }
        }
      }
      stopInteraction(pointerId);
    },
    [
      effectiveMinHeight,
      effectiveMinWidth,
      onClose,
      onDragEnd,
      onToggleMinimized,
      stopInteraction,
      updateRect,
    ],
  );

  return (
    <section
      className={[
        "floating-window",
        docked ? "is-docked" : "",
        minimized ? "is-minimized" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: `translate(${String(rect.x)}px, ${String(rect.y)}px)`,
        width: `${String(rect.width)}px`,
        ...(zIndex === undefined ? {} : { zIndex }),
        ...(minimized ? {} : { height: `${String(rect.height)}px` }),
      }}
      onPointerDownCapture={() => {
        if (!docked) {
          onActivate?.();
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <div className="floating-window-header">
        {headerContent === undefined ? (
          <button
            className="floating-window-drag-handle"
            type="button"
            aria-label={`Move ${title}`}
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
            onPointerCancel={handleDragPointerCancel}
          >
            <span>{title}</span>
          </button>
        ) : (
          <div
            className="floating-window-drag-handle floating-window-header-content"
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
            onPointerCancel={handleDragPointerCancel}
          >
            {headerContent}
          </div>
        )}
        {onToggleMinimized === undefined ? null : (
          <button
            className="floating-window-minimize"
            type="button"
            aria-label={`${minimized ? "Restore" : "Minimize"} ${title}`}
            onClick={onToggleMinimized}
          >
            -
          </button>
        )}
        {onClose === undefined ? null : (
          <button
            className="floating-window-close"
            type="button"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            x
          </button>
        )}
      </div>
      {minimized ? null : (
        <>
          <div className="floating-window-body">{children}</div>
          {docked ? null : (
            <button
              className="floating-window-resize-handle"
              type="button"
              aria-label={`Resize ${title}`}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                resizeStart.current = {
                  pointerId: event.pointerId,
                  clientX: event.clientX,
                  clientY: event.clientY,
                  rect,
                };
              }}
              onPointerMove={(event) => {
                const start = resizeStart.current;
                if (
                  start === undefined ||
                  start.pointerId !== event.pointerId
                ) {
                  return;
                }
                updateRect(
                  clampRect(
                    {
                      ...start.rect,
                      width: start.rect.width + event.clientX - start.clientX,
                      height: start.rect.height + event.clientY - start.clientY,
                    },
                    effectiveMinWidth,
                    effectiveMinHeight,
                  ),
                );
              }}
              onPointerUp={(event) => {
                stopInteraction(event.pointerId);
              }}
              onPointerCancel={(event) => {
                stopInteraction(event.pointerId);
              }}
            />
          )}
        </>
      )}
    </section>
  );
};
