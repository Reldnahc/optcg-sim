import type { ClientCardModel } from "../view-model.js";
import { FloatingWindow } from "./FloatingWindow.js";

export interface CardPreviewWindowProps {
  card?: ClientCardModel | undefined;
  minimized: boolean;
  onToggleMinimized: () => void;
}

export interface CardPreviewMinimizedButtonProps {
  disabled: boolean;
  onToggleMinimized: () => void;
}

export const CardPreviewMinimizedButton = ({
  disabled,
  onToggleMinimized,
}: CardPreviewMinimizedButtonProps): React.JSX.Element => (
  <button
    className="card-preview-minimized-button"
    type="button"
    disabled={disabled}
    aria-label="Show card preview"
    title="Show card preview"
    onClick={onToggleMinimized}
  >
    <svg
      className="card-preview-magnifier-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </svg>
  </button>
);

export const CardPreviewWindow = ({
  card,
  minimized,
  onToggleMinimized,
}: CardPreviewWindowProps): React.JSX.Element | null => {
  if (card === undefined || minimized) {
    return null;
  }

  return (
    <FloatingWindow
      title="Card Preview"
      className="card-preview-window"
      initialRect={{ x: 20, y: 20, width: 330, height: 520 }}
      minWidth={240}
      minHeight={220}
      onToggleMinimized={onToggleMinimized}
    >
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
    </FloatingWindow>
  );
};
