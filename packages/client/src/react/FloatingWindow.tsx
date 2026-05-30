import { useCallback, useRef, useState } from "react";

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
  minimized?: boolean | undefined;
  onToggleMinimized?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
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
  minWidth = 280,
  minHeight = 180,
  minimized = false,
  onToggleMinimized,
  onClose,
  onRectChange,
  children,
}: FloatingWindowProps): React.JSX.Element => {
  const [rect, setRect] = useState(() =>
    clampRectToViewport(initialRect, minWidth, minHeight, currentViewport()),
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
          minWidth,
          minHeight,
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
      }
      stopInteraction(pointerId);
    },
    [minHeight, minWidth, onClose, onToggleMinimized, stopInteraction],
  );

  return (
    <section
      className={[
        "floating-window",
        minimized ? "is-minimized" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: `translate(${String(rect.x)}px, ${String(rect.y)}px)`,
        width: `${String(rect.width)}px`,
        ...(minimized ? {} : { height: `${String(rect.height)}px` }),
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <div className="floating-window-header">
        <button
          className="floating-window-drag-handle"
          type="button"
          aria-label={`Move ${title}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStart.current = {
              pointerId: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              rect,
            };
          }}
          onPointerMove={(event) => {
            const start = dragStart.current;
            if (start === undefined || start.pointerId !== event.pointerId) {
              return;
            }
            updateRect(
              dragRect(
                start,
                event.clientX,
                event.clientY,
                minWidth,
                minHeight,
              ),
            );
          }}
          onPointerUp={(event) => {
            completeDrag(event.pointerId, event.clientX, event.clientY);
          }}
          onPointerCancel={(event) => {
            stopInteraction(event.pointerId);
          }}
        >
          <span>{title}</span>
        </button>
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
              if (start === undefined || start.pointerId !== event.pointerId) {
                return;
              }
              updateRect(
                clampRect(
                  {
                    ...start.rect,
                    width: start.rect.width + event.clientX - start.clientX,
                    height: start.rect.height + event.clientY - start.clientY,
                  },
                  minWidth,
                  minHeight,
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
        </>
      )}
    </section>
  );
};
