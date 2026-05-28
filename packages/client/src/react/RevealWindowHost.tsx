import type { ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";
import { FloatingWindow } from "./FloatingWindow.js";

export interface RevealWindowModel {
  title: string;
  cards: readonly ClientCardModel[];
}

export interface RevealWindowHostProps {
  model?: RevealWindowModel | undefined;
  onClose?: (() => void) | undefined;
  onPreviewCard?: ((card: ClientCardModel) => void) | undefined;
}

export const RevealWindowHost = ({
  model,
  onClose,
  onPreviewCard,
}: RevealWindowHostProps): React.JSX.Element | null => {
  if (model === undefined) {
    return null;
  }

  return (
    <FloatingWindow
      title={model.title}
      className="floating-window-reveal reveal-window"
      initialRect={{ x: 380, y: 100, width: 420, height: 600 }}
      minWidth={300}
      minHeight={420}
      onClose={onClose}
    >
      <div className="reveal-window-card-spot">
        {model.cards.map((card) => (
          <CardTile
            key={String(card.instanceId)}
            card={card}
            onHover={onPreviewCard}
          />
        ))}
      </div>
    </FloatingWindow>
  );
};
