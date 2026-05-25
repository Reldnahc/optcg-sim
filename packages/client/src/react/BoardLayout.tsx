import type { BoardViewModel, ClientPlayerZonesModel } from "../view-model.js";
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

export const BoardLayout = ({
  board,
  selectedCardInstanceId,
  onCardClick,
}: BoardLayoutProps): React.JSX.Element => (
  <section className="tabletop-board">
    <PlayerMat
      position="top"
      zones={opponentZonesForMat(board.opponent)}
      opponentHandCount={board.opponent.handCount}
    />
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
      handCards={board.self.hand}
      selectedCardInstanceId={selectedCardInstanceId}
      onCardClick={onCardClick}
    />
  </section>
);
