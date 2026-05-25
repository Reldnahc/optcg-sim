import type { ClientPlayerZonesModel } from "../view-model.js";
import { Zone } from "./Zone.js";

export interface PlayerMatProps {
  position: "top" | "bottom";
  zones: ClientPlayerZonesModel;
  selectedCardInstanceId?: string | undefined;
  onCardClick?: ((instanceId: string) => void) | undefined;
}

export const PlayerMat = ({
  position,
  zones,
  selectedCardInstanceId,
  onCardClick,
}: PlayerMatProps): React.JSX.Element => (
  <section className={`player-mat player-mat-${position}`}>
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
