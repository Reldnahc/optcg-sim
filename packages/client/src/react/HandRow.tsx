import type { ClientActionModel, ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";

export interface HandRowProps {
  label: string;
  cards: readonly ClientCardModel[];
  selectedCardInstanceId?: string | undefined;
  cardActions?: ((instanceId: string) => readonly ClientActionModel[]) | undefined;
  actionDisabled?: boolean | undefined;
  onCardClick?: ((instanceId: string) => void) | undefined;
  onCardAction?: ((actionIndex: number) => void) | undefined;
}

export const HandRow = ({
  label,
  cards,
  selectedCardInstanceId,
  cardActions,
  actionDisabled = false,
  onCardClick,
  onCardAction,
}: HandRowProps): React.JSX.Element => (
  <section className="hand-row" aria-label={label}>
    <div className="hand-cards">
      {cards.map((card) => {
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
      })}
    </div>
  </section>
);
