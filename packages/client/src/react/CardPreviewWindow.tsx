import { useRef, useState, type CSSProperties } from "react";

import type { ClientCardModel } from "../view-model.js";
import { EffectRulesText } from "./EffectRulesText.js";
import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";

export interface CardPreviewWindowProps {
  card?: ClientCardModel | undefined;
  className?: string | undefined;
  docked?: boolean | undefined;
  minimized: boolean;
  initialRect?: WindowRect | undefined;
  zIndex?: number | undefined;
  onToggleMinimized: () => void;
  onClose: () => void;
  onActivate?: (() => void) | undefined;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => WindowRect | undefined) | undefined;
}

export interface CardPreviewContentProps {
  card?: ClientCardModel | undefined;
}

export const defaultCardPreviewWindowRect: WindowRect = {
  x: 20,
  y: 20,
  width: 400,
  height: 620,
};

const minPreviewZoom = 0.65;
const maxPreviewZoom = 1.8;
const previewZoomStep = 0.1;
const defaultPreviewTextPanelHeight = 42;
const minPreviewTextPanelHeight = 22;
const maxPreviewTextPanelHeight = 72;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

interface TextPanelDragState {
  readonly pointerId: number;
  readonly startY: number;
  readonly startHeight: number;
}

export const CardPreviewContent = ({
  card,
}: CardPreviewContentProps): React.JSX.Element => {
  const [zoom, setZoom] = useState(1);
  const [textVisible, setTextVisible] = useState(true);
  const [textPanelHeight, setTextPanelHeight] = useState(
    defaultPreviewTextPanelHeight,
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const textPanelDrag = useRef<TextPanelDragState | undefined>(undefined);
  const previewStyle = {
    "--card-preview-zoom": String(zoom),
    "--card-preview-rules-height": `${String(textPanelHeight)}%`,
  } as CSSProperties;

  const zoomBy = (delta: number): void => {
    setZoom((current) =>
      Number(clamp(current + delta, minPreviewZoom, maxPreviewZoom).toFixed(2)),
    );
  };

  const moveTextPanelResize = (
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    const drag = textPanelDrag.current;
    const stageHeight = stageRef.current?.getBoundingClientRect().height;
    if (
      drag === undefined ||
      drag.pointerId !== event.pointerId ||
      stageHeight === undefined ||
      stageHeight <= 0
    ) {
      return;
    }
    const deltaPercent = ((drag.startY - event.clientY) / stageHeight) * 100;
    setTextPanelHeight(
      clamp(
        drag.startHeight + deltaPercent,
        minPreviewTextPanelHeight,
        maxPreviewTextPanelHeight,
      ),
    );
  };

  return (
    <article className="card-preview-content" style={previewStyle}>
      {card === undefined ? (
        <div className="card-preview-empty">Hover a card to preview it</div>
      ) : (
        <>
          <div className="card-preview-stage" ref={stageRef}>
            <div className="card-preview-image-frame">
              {card.imageUrl === undefined ? (
                <div className="card-preview-placeholder">{card.name}</div>
              ) : (
                <img
                  className="card-preview-card-image"
                  src={card.imageUrl}
                  alt={card.name}
                />
              )}
            </div>
            {textVisible ? (
              <section className="card-preview-rules-panel">
                <button
                  className="card-preview-rules-resize-handle"
                  type="button"
                  aria-label="Resize card text"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    textPanelDrag.current = {
                      pointerId: event.pointerId,
                      startY: event.clientY,
                      startHeight: textPanelHeight,
                    };
                  }}
                  onPointerMove={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    moveTextPanelResize(event);
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    if (textPanelDrag.current?.pointerId === event.pointerId) {
                      textPanelDrag.current = undefined;
                    }
                  }}
                  onPointerCancel={(event) => {
                    event.stopPropagation();
                    if (textPanelDrag.current?.pointerId === event.pointerId) {
                      textPanelDrag.current = undefined;
                    }
                  }}
                />
                <div className="card-preview-text">
                  <header className="card-preview-text-header">
                    <h2>{card.name}</h2>
                    <p>{card.category}</p>
                  </header>
                  {card.effectText === undefined ? null : (
                    <section>
                      <h3>Effect</h3>
                      <EffectRulesText
                        text={card.effectText}
                        sourceMap={card.effectTextSourceMap}
                      />
                    </section>
                  )}
                  {card.triggerText === undefined ? null : (
                    <section>
                      <h3>Trigger</h3>
                      <EffectRulesText
                        text={card.triggerText}
                        sourceMap={card.triggerTextSourceMap}
                      />
                    </section>
                  )}
                </div>
              </section>
            ) : null}
          </div>
          <div className="card-preview-control-bar">
            <button
              type="button"
              aria-label="Zoom card out"
              onClick={() => {
                zoomBy(-previewZoomStep);
              }}
            >
              -
            </button>
            <button
              type="button"
              aria-label="Reset card zoom"
              onClick={() => {
                setZoom(1);
              }}
            >
              {`${String(Math.round(zoom * 100))}%`}
            </button>
            <button
              type="button"
              aria-label="Zoom card in"
              onClick={() => {
                zoomBy(previewZoomStep);
              }}
            >
              +
            </button>
            <button
              type="button"
              aria-label={textVisible ? "Hide card text" : "Show card text"}
              aria-pressed={textVisible}
              onClick={() => {
                setTextVisible((current) => !current);
              }}
            >
              Text
            </button>
          </div>
        </>
      )}
    </article>
  );
};

export const CardPreviewWindow = ({
  card,
  className,
  docked = false,
  minimized,
  initialRect = defaultCardPreviewWindowRect,
  zIndex,
  onToggleMinimized,
  onClose,
  onActivate,
  onRectChange,
  onDragMove,
  onDragEnd,
}: CardPreviewWindowProps): React.JSX.Element | null => {
  return (
    <FloatingWindow
      title="Preview"
      className={["card-preview-window", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      initialRect={initialRect}
      minWidth={220}
      minHeight={180}
      docked={docked}
      minimized={minimized}
      zIndex={zIndex}
      onToggleMinimized={onToggleMinimized}
      onClose={onClose}
      onActivate={onActivate}
      onRectChange={onRectChange}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      <CardPreviewContent card={card} />
    </FloatingWindow>
  );
};
