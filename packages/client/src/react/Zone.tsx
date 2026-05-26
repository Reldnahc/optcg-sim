import type { ClientActionModel, ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";

export interface ZoneProps {
  label: string;
  cards: readonly ClientCardModel[];
  size?: "normal" | "small" | "mini" | "hand";
  displayMode?: "spread" | "stack" | undefined;
  selectedCardInstanceId?: string | undefined;
  cardActions?: ((instanceId: string) => readonly ClientActionModel[]) | undefined;
  actionDisabled?: boolean | undefined;
  onCardClick?: ((instanceId: string) => void) | undefined;
  onCardAction?: ((actionIndex: number) => void) | undefined;
  onViewCollection?: (() => void) | undefined;
}

export const Zone = ({
  label,
  cards,
  size = "normal",
  displayMode = "spread",
  selectedCardInstanceId,
  cardActions,
  actionDisabled = false,
  onCardClick,
  onCardAction,
  onViewCollection,
}: ZoneProps): React.JSX.Element => {
  const visibleCards =
    displayMode === "stack" && cards.length > 0
      ? [cards[cards.length - 1] as ClientCardModel]
      : cards;

  return (
    <section className={`zone zone-${size} zone-${displayMode}`}>
      <div className="zone-label">{label}</div>
      <div className="zone-cards">
        {visibleCards.length === 0 ? (
          <span className="empty-zone">empty</span>
        ) : (
          visibleCards.map((card) => {
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
                  displayMode === "stack" && onViewCollection !== undefined
                    ? onViewCollection
                    : onCardClick === undefined
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
};
