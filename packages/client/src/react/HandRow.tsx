import type { ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";

export interface HandRowProps {
  label: string;
  cards: readonly ClientCardModel[];
  selectedCardInstanceId?: string | undefined;
  onCardClick?: ((instanceId: string) => void) | undefined;
}

export const HandRow = ({
  label,
  cards,
  selectedCardInstanceId,
  onCardClick,
}: HandRowProps): React.JSX.Element => (
  <section className="hand-row" aria-label={label}>
    <div className="hand-cards">
      {cards.map((card) => (
        <CardTile
          key={String(card.instanceId)}
          card={card}
          selected={selectedCardInstanceId === String(card.instanceId)}
          onClick={
            onCardClick === undefined
              ? undefined
              : () => {
                  onCardClick(String(card.instanceId));
                }
          }
        />
      ))}
    </div>
  </section>
);
