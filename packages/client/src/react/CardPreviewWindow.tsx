import type { ClientCardModel } from "../view-model.js";
import { FloatingWindow } from "./FloatingWindow.js";

export interface CardPreviewWindowProps {
  card?: ClientCardModel | undefined;
  minimized: boolean;
  onToggleMinimized: () => void;
}

export const CardPreviewWindow = ({
  card,
  minimized,
  onToggleMinimized,
}: CardPreviewWindowProps): React.JSX.Element | null => {
  if (card === undefined) {
    return null;
  }

  return (
    <FloatingWindow
      title="Card Preview"
      className="card-preview-window"
      initialRect={{ x: 20, y: 20, width: 330, height: 520 }}
      minWidth={240}
      minHeight={220}
      minimized={minimized}
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
