import { useCallback, useRef, useState } from "react";

interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  onClose?: (() => void) | undefined;
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

export const FloatingWindow = ({
  title,
  className,
  initialRect = defaultRect,
  minWidth = 320,
  minHeight = 220,
  onClose,
  children,
}: FloatingWindowProps): React.JSX.Element => {
  const [rect, setRect] = useState(() =>
    clampRect(initialRect, minWidth, minHeight),
  );
  const dragStart = useRef<PointerStart | undefined>(undefined);
  const resizeStart = useRef<PointerStart | undefined>(undefined);

  const stopInteraction = useCallback((pointerId: number) => {
    if (dragStart.current?.pointerId === pointerId) {
      dragStart.current = undefined;
    }
    if (resizeStart.current?.pointerId === pointerId) {
      resizeStart.current = undefined;
    }
  }, []);

  return (
    <section
      className={`floating-window ${className ?? ""}`.trim()}
      style={{
        transform: `translate(${String(rect.x)}px, ${String(rect.y)}px)`,
        width: `${String(rect.width)}px`,
        height: `${String(rect.height)}px`,
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
            setRect(
              clampRect(
                {
                  ...start.rect,
                  x: start.rect.x + event.clientX - start.clientX,
                  y: start.rect.y + event.clientY - start.clientY,
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
        >
          <span>{title}</span>
        </button>
        {onClose === undefined ? null : (
          <button className="floating-window-close" type="button" onClick={onClose}>
            Close
          </button>
        )}
      </div>
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
          setRect(
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
    </section>
  );
};
