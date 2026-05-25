import type { ClientCardModel, ClientPlayerZonesModel } from "../view-model.js";
import { Zone } from "./Zone.js";

export interface PlayerMatProps {
  position: "top" | "bottom";
  zones: ClientPlayerZonesModel;
  handCards?: readonly ClientCardModel[] | undefined;
  opponentHandCount?: number | undefined;
  selectedCardInstanceId?: string | undefined;
  onCardClick?: ((instanceId: string) => void) | undefined;
}

const countCards = (count: number): ClientCardModel[] =>
  Array.from({ length: Math.min(count, 10) }, (_, index) => ({
    instanceId: `hidden-hand-${String(index)}` as ClientCardModel["instanceId"],
    cardId: "hidden" as ClientCardModel["cardId"],
    name: "Hidden card",
    category: "hidden",
    attachedDonCount: 0,
  }));

export const PlayerMat = ({
  position,
  zones,
  handCards,
  opponentHandCount,
  selectedCardInstanceId,
  onCardClick,
}: PlayerMatProps): React.JSX.Element => {
  const hand =
    handCards ??
    (opponentHandCount === undefined ? [] : countCards(opponentHandCount));
  return (
    <section className={`player-mat player-mat-${position}`}>
      <div className="hand-panel">
        <Zone
          label="Hand"
          cards={hand}
          size="hand"
          selectedCardInstanceId={selectedCardInstanceId}
          onCardClick={handCards === undefined ? undefined : onCardClick}
        />
      </div>
      <div className="life-panel">
        <div className="stack-label">Life {zones.lifeCount}</div>
      </div>
      <div className="deck-panel">
        <div className="stack-label">Deck {zones.deckCount}</div>
      </div>
      <div className="character-panel">
        <Zone
          label="Character Area"
          cards={zones.characters}
          selectedCardInstanceId={selectedCardInstanceId}
          onCardClick={onCardClick}
        />
      </div>
      <div className="leader-panel">
        <Zone
          label="Leader"
          cards={[zones.leader]}
          size="small"
          selectedCardInstanceId={selectedCardInstanceId}
          onCardClick={onCardClick}
        />
      </div>
      <div className="stage-panel">
        <Zone
          label="Stage"
          cards={zones.stage === undefined ? [] : [zones.stage]}
          size="small"
          selectedCardInstanceId={selectedCardInstanceId}
          onCardClick={onCardClick}
        />
      </div>
      <div className="trash-panel">
        <Zone label="Trash" cards={zones.trash} size="mini" />
      </div>
      <div className="cost-panel">
        <Zone label="Cost Area" cards={zones.costArea} size="mini" />
      </div>
    </section>
  );
};
