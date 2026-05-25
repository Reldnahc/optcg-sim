import type {
  BoardViewModel,
  ClientCardModel,
  ClientPlayerZonesModel,
} from "../view-model.js";
import { HandRow } from "./HandRow.js";
import { PlayerMat } from "./PlayerMat.js";

type OpponentZones = Omit<ClientPlayerZonesModel, "hand"> & {
  handCount: number;
};

export interface BoardLayoutProps {
  board: BoardViewModel;
  selectedCardInstanceId?: string | undefined;
  onCardClick: (instanceId: string) => void;
}

const opponentZonesForMat = (zones: OpponentZones): ClientPlayerZonesModel => ({
  leader: zones.leader,
  hand: [],
  characters: zones.characters,
  ...(zones.stage === undefined ? {} : { stage: zones.stage }),
  costArea: zones.costArea,
  trash: zones.trash,
  deckCount: zones.deckCount,
  donDeckCount: zones.donDeckCount,
  lifeCount: zones.lifeCount,
});

const hiddenCards = (count: number): ClientCardModel[] =>
  Array.from({ length: Math.min(count, 10) }, (_, index) => ({
    instanceId: `hidden-hand-${String(index)}` as ClientCardModel["instanceId"],
    cardId: "hidden" as ClientCardModel["cardId"],
    name: "Hidden card",
    category: "hidden",
    attachedDonCount: 0,
  }));

export const BoardLayout = ({
  board,
  selectedCardInstanceId,
  onCardClick,
}: BoardLayoutProps): React.JSX.Element => (
  <section className="board-shell">
    <div className="hand-rail">
      <HandRow
        label="Opponent hand"
        cards={hiddenCards(board.opponent.handCount)}
      />
      <HandRow
        label="Player hand"
        cards={board.self.hand}
        selectedCardInstanceId={selectedCardInstanceId}
        onCardClick={onCardClick}
      />
    </div>
    <div className="tabletop-board">
      <PlayerMat position="top" zones={opponentZonesForMat(board.opponent)} />
      <div className="phase-ladder" aria-hidden="true">
        <span>Refresh</span>
        <span>Draw</span>
        <span>DON!!</span>
        <span>Main</span>
        <span>End</span>
      </div>
      <PlayerMat
        position="bottom"
        zones={board.self}
        selectedCardInstanceId={selectedCardInstanceId}
        onCardClick={onCardClick}
      />
    </div>
  </section>
);
