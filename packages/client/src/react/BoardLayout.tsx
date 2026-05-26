import type {
  BoardViewModel,
  ClientActionModel,
  ClientCardModel,
} from "../view-model.js";
import { HandRow } from "./HandRow.js";
import { Zone } from "./Zone.js";

export interface BoardLayoutProps {
  board: BoardViewModel;
  selectedCardInstanceId?: string | undefined;
  cardActions: (instanceId: string) => readonly ClientActionModel[];
  actionDisabled?: boolean | undefined;
  onCardClick: (instanceId: string) => void;
  onCardAction: (actionIndex: number) => void;
  onViewCollection: (title: string, cards: readonly ClientCardModel[]) => void;
  onBackgroundClick: () => void;
}

const hiddenCards = (count: number): ClientCardModel[] =>
  Array.from({ length: Math.min(count, 10) }, (_, index) => ({
    instanceId: `hidden-hand-${String(index)}` as ClientCardModel["instanceId"],
    cardId: "hidden" as ClientCardModel["cardId"],
    name: "Hidden card",
    category: "hidden",
    attachedDonCount: 0,
  }));

const stack = (label: string, count: number): React.JSX.Element => (
  <div className="stack-label">
    {label} {count}
  </div>
);

export const BoardLayout = ({
  board,
  selectedCardInstanceId,
  cardActions,
  actionDisabled = false,
  onCardClick,
  onCardAction,
  onViewCollection,
  onBackgroundClick,
}: BoardLayoutProps): React.JSX.Element => (
  <section
    className="board-shell"
    onClick={() => {
      onBackgroundClick();
    }}
  >
    <div className="hand-rail">
      <HandRow
        label="Opponent hand"
        cards={hiddenCards(board.opponent.handCount)}
        overflowDirection="right"
      />
      <HandRow
        label="Player hand"
        cards={board.self.hand}
        overflowDirection="left"
        selectedCardInstanceId={selectedCardInstanceId}
        cardActions={cardActions}
        actionDisabled={actionDisabled}
        onCardClick={onCardClick}
        onCardAction={onCardAction}
      />
    </div>
    <div className="tabletop-board">
      <div className="playmat-zone opponent-cost">
        <Zone
          label="Cost Area"
          cards={board.opponent.costArea}
          size="mini"
          displayMode="overlap"
        />
      </div>
      <div className="playmat-zone opponent-life">
        {stack("Life", board.opponent.lifeCount)}
      </div>
      <div className="playmat-zone opponent-deck">
        {stack("Deck", board.opponent.deckCount)}
      </div>
      <div className="playmat-zone opponent-don-deck">
        {stack("DON!! Deck", board.opponent.donDeckCount)}
      </div>
      <div className="playmat-zone opponent-trash">
        <Zone
          label="Trash"
          cards={board.opponent.trash}
          size="small"
          displayMode="stack"
          onViewCollection={() => {
            onViewCollection("Opponent trash", board.opponent.trash);
          }}
        />
      </div>
      <div className="playmat-zone opponent-leader">
        <Zone
          label="Leader"
          cards={[board.opponent.leader]}
          size="small"
          selectedCardInstanceId={selectedCardInstanceId}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
        />
      </div>
      <div className="playmat-zone opponent-stage">
        <Zone
          label="Stage"
          cards={
            board.opponent.stage === undefined ? [] : [board.opponent.stage]
          }
          size="small"
          selectedCardInstanceId={selectedCardInstanceId}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
        />
      </div>
      <div className="playmat-zone opponent-characters">
        <Zone
          label="Character Area"
          cards={board.opponent.characters}
          selectedCardInstanceId={selectedCardInstanceId}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
        />
      </div>
      <div className="playmat-zone center-spacer" />
      <div className="playmat-zone player-characters">
        <Zone
          label="Character Area"
          cards={board.self.characters}
          selectedCardInstanceId={selectedCardInstanceId}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
        />
      </div>
      <div className="playmat-zone player-life">
        {stack("Life", board.self.lifeCount)}
      </div>
      <div className="playmat-zone player-leader">
        <Zone
          label="Leader"
          cards={[board.self.leader]}
          size="small"
          selectedCardInstanceId={selectedCardInstanceId}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
        />
      </div>
      <div className="playmat-zone player-stage">
        <Zone
          label="Stage"
          cards={board.self.stage === undefined ? [] : [board.self.stage]}
          size="small"
          selectedCardInstanceId={selectedCardInstanceId}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
        />
      </div>
      <div className="playmat-zone player-deck">
        {stack("Deck", board.self.deckCount)}
      </div>
      <div className="playmat-zone player-don-deck">
        {stack("DON!! Deck", board.self.donDeckCount)}
      </div>
      <div className="playmat-zone player-trash">
        <Zone
          label="Trash"
          cards={board.self.trash}
          size="small"
          displayMode="stack"
          onViewCollection={() => {
            onViewCollection("Player trash", board.self.trash);
          }}
        />
      </div>
      <div className="playmat-zone player-cost">
        <Zone
          label="Cost Area"
          cards={board.self.costArea}
          size="mini"
          displayMode="overlap"
        />
      </div>
    </div>
  </section>
);
