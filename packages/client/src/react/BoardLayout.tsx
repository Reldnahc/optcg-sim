import type {
  BoardViewModel,
  ClientActionModel,
  ClientCardModel,
} from "../view-model.js";
import { BattleArrowOverlay } from "./BattleArrowOverlay.js";
import { HandRow } from "./HandRow.js";
import { Zone } from "./Zone.js";

export interface BoardLayoutProps {
  board: BoardViewModel;
  selectedCardInstanceId?: string | undefined;
  pendingChoiceInstanceIds?: readonly string[] | undefined;
  decisionSelectedInstanceIds?: readonly string[] | undefined;
  selectedDonInstanceIds?: readonly string[] | undefined;
  cardActions: (instanceId: string) => readonly ClientActionModel[];
  actionDisabled?: boolean | undefined;
  onCardClick: (instanceId: string) => void;
  onCardAction: (actionIndex: number) => void;
  onPreviewCard?: ((card: ClientCardModel) => void) | undefined;
  onViewCollection: (title: string, cards: readonly ClientCardModel[]) => void;
  onBackgroundClick: () => void;
}

const hiddenCards = (count: number, prefix: string): ClientCardModel[] =>
  Array.from({ length: Math.min(count, 10) }, (_, index) => ({
    instanceId: `${prefix}-${String(index)}` as ClientCardModel["instanceId"],
    cardId: "hidden" as ClientCardModel["cardId"],
    name: "Hidden card",
    category: "hidden",
    attachedDonCount: 0,
    attachedDonCards: [],
  }));

const handCount = (
  owner: "Opponent" | "Player",
  count: number,
): React.JSX.Element => (
  <div
    className={`count-badge is-hover-revealed hand-count ${owner.toLowerCase()}-hand-count`}
    aria-label={`${owner} hand count: ${String(count)}`}
  >
    {count}
  </div>
);

export const BoardLayout = ({
  board,
  selectedCardInstanceId,
  pendingChoiceInstanceIds = [],
  decisionSelectedInstanceIds = [],
  selectedDonInstanceIds = [],
  cardActions,
  actionDisabled = false,
  onCardClick,
  onCardAction,
  onPreviewCard,
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
        cards={hiddenCards(board.opponent.handCount, "hidden-hand-opponent")}
        overflowDirection="right"
      />
      {handCount("Opponent", board.opponent.handCount)}
      {handCount("Player", board.self.hand.length)}
      <HandRow
        label="Player hand"
        cards={board.self.hand}
        overflowDirection="left"
        selectedCardInstanceId={selectedCardInstanceId}
        pendingChoiceInstanceIds={pendingChoiceInstanceIds}
        decisionSelectedInstanceIds={decisionSelectedInstanceIds}
        selectedDonInstanceIds={selectedDonInstanceIds}
        cardActions={cardActions}
        actionDisabled={actionDisabled}
        onCardPreview={onPreviewCard}
        onCardClick={onCardClick}
        onCardAction={onCardAction}
      />
    </div>
    <div className="tabletop-board">
      <BattleArrowOverlay battleArrow={board.battleArrow} />
      <div className="playmat-zone opponent-cost">
        <Zone
          label="Cost Area"
          cards={board.opponent.costArea}
          size="mini"
          displayMode="overlap"
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone opponent-life">
        <Zone
          label="Life"
          cards={hiddenCards(board.opponent.lifeCount, "hidden-life-opponent")}
          size="small"
          displayMode="life"
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone opponent-deck">
        <Zone
          label="Deck"
          cards={hiddenCards(board.opponent.deckCount, "hidden-deck-opponent")}
          size="small"
          displayMode="stack"
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone opponent-don-deck">
        <Zone
          label="DON!! Deck"
          cards={hiddenCards(
            board.opponent.donDeckCount,
            "hidden-don-deck-opponent",
          )}
          size="small"
          displayMode="stack"
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone opponent-trash">
        <Zone
          label="Trash"
          cards={board.opponent.trash}
          size="small"
          displayMode="stack"
          onCardPreview={onPreviewCard}
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
          pendingChoiceInstanceIds={pendingChoiceInstanceIds}
          decisionSelectedInstanceIds={decisionSelectedInstanceIds}
          selectedDonInstanceIds={selectedDonInstanceIds}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
          onCardPreview={onPreviewCard}
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
          pendingChoiceInstanceIds={pendingChoiceInstanceIds}
          decisionSelectedInstanceIds={decisionSelectedInstanceIds}
          selectedDonInstanceIds={selectedDonInstanceIds}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone opponent-characters">
        <Zone
          label="Character Area"
          cards={board.opponent.characters}
          displayMode="slots"
          slotCount={5}
          selectedCardInstanceId={selectedCardInstanceId}
          pendingChoiceInstanceIds={pendingChoiceInstanceIds}
          decisionSelectedInstanceIds={decisionSelectedInstanceIds}
          selectedDonInstanceIds={selectedDonInstanceIds}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone center-spacer">
        <div className="opponent-center-spacer" />
        <div className="player-center-spacer" />
      </div>
      <div className="playmat-zone player-characters">
        <Zone
          label="Character Area"
          cards={board.self.characters}
          displayMode="slots"
          slotCount={5}
          selectedCardInstanceId={selectedCardInstanceId}
          pendingChoiceInstanceIds={pendingChoiceInstanceIds}
          decisionSelectedInstanceIds={decisionSelectedInstanceIds}
          selectedDonInstanceIds={selectedDonInstanceIds}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone player-life">
        <Zone
          label="Life"
          cards={hiddenCards(board.self.lifeCount, "hidden-life-self")}
          size="small"
          displayMode="life"
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone player-leader">
        <Zone
          label="Leader"
          cards={[board.self.leader]}
          size="small"
          selectedCardInstanceId={selectedCardInstanceId}
          pendingChoiceInstanceIds={pendingChoiceInstanceIds}
          decisionSelectedInstanceIds={decisionSelectedInstanceIds}
          selectedDonInstanceIds={selectedDonInstanceIds}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone player-stage">
        <Zone
          label="Stage"
          cards={board.self.stage === undefined ? [] : [board.self.stage]}
          size="small"
          selectedCardInstanceId={selectedCardInstanceId}
          pendingChoiceInstanceIds={pendingChoiceInstanceIds}
          decisionSelectedInstanceIds={decisionSelectedInstanceIds}
          selectedDonInstanceIds={selectedDonInstanceIds}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone player-deck">
        <Zone
          label="Deck"
          cards={hiddenCards(board.self.deckCount, "hidden-deck-self")}
          size="small"
          displayMode="stack"
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone player-don-deck">
        <Zone
          label="DON!! Deck"
          cards={hiddenCards(board.self.donDeckCount, "hidden-don-deck-self")}
          size="small"
          displayMode="stack"
          onCardPreview={onPreviewCard}
        />
      </div>
      <div className="playmat-zone player-trash">
        <Zone
          label="Trash"
          cards={board.self.trash}
          size="small"
          displayMode="stack"
          onCardPreview={onPreviewCard}
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
          pendingChoiceInstanceIds={pendingChoiceInstanceIds}
          decisionSelectedInstanceIds={decisionSelectedInstanceIds}
          selectedDonInstanceIds={selectedDonInstanceIds}
          onCardPreview={onPreviewCard}
          onCardClick={onCardClick}
        />
      </div>
    </div>
  </section>
);
