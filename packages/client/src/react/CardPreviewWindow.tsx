import type { ClientCardModel } from "../view-model.js";
import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";

export interface CardPreviewWindowProps {
  card?: ClientCardModel | undefined;
  className?: string | undefined;
  minimized: boolean;
  initialRect?: WindowRect | undefined;
  onToggleMinimized: () => void;
  onClose: () => void;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => WindowRect | undefined) | undefined;
}

export interface CardPreviewContentProps {
  card: ClientCardModel;
}

export const defaultCardPreviewWindowRect: WindowRect = {
  x: 20,
  y: 20,
  width: 330,
  height: 520,
};

export const CardPreviewContent = ({
  card,
}: CardPreviewContentProps): React.JSX.Element => (
  <article className="card-preview-content">
    <div className="card-preview-image-frame">
      {card.imageUrl === undefined ? (
        <div className="card-preview-placeholder">{card.name}</div>
      ) : (
        <img src={card.imageUrl} alt={card.name} />
      )}
    </div>
    <div className="card-preview-text">
      <h2>{card.name}</h2>
      <p>{card.category}</p>
      {card.effectText === undefined ? null : (
        <section>
          <h3>Effect</h3>
          <p>{card.effectText}</p>
        </section>
      )}
      {card.triggerText === undefined ? null : (
        <section>
          <h3>Trigger</h3>
          <p>{card.triggerText}</p>
        </section>
      )}
    </div>
  </article>
);

export const CardPreviewWindow = ({
  card,
  className,
  minimized,
  initialRect = defaultCardPreviewWindowRect,
  onToggleMinimized,
  onClose,
  onRectChange,
  onDragMove,
  onDragEnd,
}: CardPreviewWindowProps): React.JSX.Element | null => {
  if (card === undefined) {
    return null;
  }

  return (
    <FloatingWindow
      title="Preview"
      className={["card-preview-window", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      initialRect={initialRect}
      minWidth={220}
      minHeight={180}
      minimized={minimized}
      onToggleMinimized={onToggleMinimized}
      onClose={onClose}
      onRectChange={onRectChange}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      <CardPreviewContent card={card} />
    </FloatingWindow>
  );
};
