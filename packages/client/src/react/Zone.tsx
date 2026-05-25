import type { ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";

export interface ZoneProps {
  label: string;
  cards: readonly ClientCardModel[];
  size?: "normal" | "small" | "mini" | "hand";
  selectedCardInstanceId?: string | undefined;
  onCardClick?: ((instanceId: string) => void) | undefined;
}

export const Zone = ({
  label,
  cards,
  size = "normal",
  selectedCardInstanceId,
  onCardClick,
}: ZoneProps): React.JSX.Element => (
  <section className={`zone zone-${size}`}>
    <div className="zone-label">{label}</div>
    <div className="zone-cards">
      {cards.length === 0 ? (
        <span className="empty-zone">empty</span>
      ) : (
        cards.map((card) => (
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
        ))
      )}
    </div>
  </section>
);
