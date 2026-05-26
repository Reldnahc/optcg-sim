import type { ClientActionModel, ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";

export interface ZoneProps {
  label: string;
  cards: readonly ClientCardModel[];
  size?: "normal" | "small" | "mini" | "hand";
  selectedCardInstanceId?: string | undefined;
  cardActions?: ((instanceId: string) => readonly ClientActionModel[]) | undefined;
  actionDisabled?: boolean | undefined;
  onCardClick?: ((instanceId: string) => void) | undefined;
  onCardAction?: ((actionIndex: number) => void) | undefined;
}

export const Zone = ({
  label,
  cards,
  size = "normal",
  selectedCardInstanceId,
  cardActions,
  actionDisabled = false,
  onCardClick,
  onCardAction,
}: ZoneProps): React.JSX.Element => (
  <section className={`zone zone-${size}`}>
    <div className="zone-label">{label}</div>
    <div className="zone-cards">
      {cards.length === 0 ? (
        <span className="empty-zone">empty</span>
      ) : (
        cards.map((card) => {
          const instanceId = String(card.instanceId);
          return (
            <CardTile
              key={instanceId}
              card={card}
              selected={selectedCardInstanceId === instanceId}
              actions={cardActions?.(instanceId) ?? []}
              disabled={actionDisabled}
              onAction={onCardAction}
              onClick={
                onCardClick === undefined
                  ? undefined
                  : () => {
                      onCardClick(instanceId);
                    }
              }
            />
          );
        })
      )}
    </div>
  </section>
);
