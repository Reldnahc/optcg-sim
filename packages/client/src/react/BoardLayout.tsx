import type {
  BoardViewModel,
  ClientActionModel,
  ClientCardModel,
} from "../view-model.js";
import type { EngineEvent } from "@optcg/types";
import { useRef } from "react";
import { BattleArrowOverlay } from "./BattleArrowOverlay.js";
import type { ReorderPlacement } from "./drag-reorder.js";
import { HandRow } from "./HandRow.js";
import { CardMovementOverlay } from "./presentation-effects/CardMovementOverlay.js";
import { PlayerRestrictionBadges } from "./PlayerRestrictionBadges.js";
import { usePresentationEffects } from "./presentation-effects/use-presentation-effects.js";
import { Zone } from "./Zone.js";

export interface BoardLayoutProps {
  board: BoardViewModel;
  decisionPrompt?: string | undefined;
  selectedCardInstanceId?: string | undefined;
  pendingChoiceInstanceIds?: readonly string[] | undefined;
  decisionSelectedInstanceIds?: readonly string[] | undefined;
  selectedDonInstanceIds?: readonly string[] | undefined;
  cardActions: (instanceId: string) => readonly ClientActionModel[];
  actionDisabled?: boolean | undefined;
  onCardClick: (instanceId: string) => void;
  onCardAction: (actionIndex: number) => void;
  onPreviewCard?: ((card: ClientCardModel) => void) | undefined;
  onMoveHandCard?:
    | ((
        draggedInstanceId: string,
        targetInstanceId: string,
        placement: ReorderPlacement,
      ) => void)
    | undefined;
  onViewCollection: (title: string, cards: readonly ClientCardModel[]) => void;
  onBackgroundClick: () => void;
  presentationEvents?: readonly EngineEvent[] | undefined;
  soundEnabled?: boolean | undefined;
}

const hiddenCards = (
  count: number,
  prefix: string,
  maxRendered = count,
): ClientCardModel[] =>
  Array.from({ length: Math.min(count, maxRendered) }, (_, index) => ({
    instanceId: `${prefix}-${String(index)}` as ClientCardModel["instanceId"],
    cardId: "hidden" as ClientCardModel["cardId"],
    name: "Hidden card",
    category: "hidden",
    attachedDonCount: 0,
    attachedDonCards: [],
  }));

const handCount = (
  label: string,
  ownerClass: "opponent" | "player",
  count: number,
): React.JSX.Element => (
  <div
    className={`count-badge is-hover-revealed hand-count ${ownerClass}-hand-count`}
    aria-label={`${label} hand count: ${String(count)}`}
  >
    {count}
  </div>
);

export const BoardLayout = ({
  board,
  decisionPrompt,
  selectedCardInstanceId,
  pendingChoiceInstanceIds = [],
  decisionSelectedInstanceIds = [],
  selectedDonInstanceIds = [],
  cardActions,
  actionDisabled = false,
  onCardClick,
  onCardAction,
  onPreviewCard,
  onMoveHandCard,
  onViewCollection,
  onBackgroundClick,
  presentationEvents = [],
  soundEnabled = true,
}: BoardLayoutProps): React.JSX.Element => {
  const activeCardInstanceIds = board.activeCardInstanceIds ?? [];
  const boardShellRef = useRef<HTMLElement | null>(null);
  const presentationEffects = usePresentationEffects({
    rootRef: boardShellRef,
    board,
    events: presentationEvents,
    soundEnabled,
  });

  return (
    <section
      ref={boardShellRef}
      className="board-shell"
      onClick={() => {
        onBackgroundClick();
      }}
    >
      <CardMovementOverlay movements={presentationEffects.movements} />
      <div className="hand-rail">
        <HandRow
          label="Opponent hand"
          cards={hiddenCards(board.opponent.handCount, "hidden-hand-opponent")}
          overflowDirection="right"
          presentationZoneKey="opponent:hand"
        />
        {handCount(board.opponentLabel, "opponent", board.opponent.handCount)}
        {handCount(board.selfLabel, "player", board.self.hand.length)}
        {decisionPrompt === undefined ? null : (
          <div className="decision-status-prompt" role="status">
            {decisionPrompt}
          </div>
        )}
        <HandRow
          label="Player hand"
          cards={board.self.hand}
          overflowDirection="left"
          presentationZoneKey="self:hand"
          selectedCardInstanceId={selectedCardInstanceId}
          pendingChoiceInstanceIds={pendingChoiceInstanceIds}
          decisionSelectedInstanceIds={decisionSelectedInstanceIds}
          selectedDonInstanceIds={selectedDonInstanceIds}
          activeCardInstanceIds={activeCardInstanceIds}
          cardActions={cardActions}
          actionDisabled={actionDisabled}
          onCardPreview={onPreviewCard}
          onCardClick={onCardClick}
          onCardAction={onCardAction}
          onMoveCard={onMoveHandCard}
        />
      </div>
      <div className="tabletop-board">
        <BattleArrowOverlay battleArrow={board.battleArrow} />
        <div className="playmat-zone opponent-cost">
          <Zone
            label="Cost Area"
            cards={board.opponent.costArea}
            presentationZoneKey="opponent:costArea"
            size="mini"
            displayMode="overlap"
            pendingChoiceInstanceIds={pendingChoiceInstanceIds}
            decisionSelectedInstanceIds={decisionSelectedInstanceIds}
            selectedDonInstanceIds={selectedDonInstanceIds}
            activeCardInstanceIds={activeCardInstanceIds}
            onCardPreview={onPreviewCard}
            onCardClick={onCardClick}
          />
        </div>
        <div className="playmat-zone opponent-life">
          <Zone
            label="Life"
            cards={board.opponent.lifeCards}
            presentationZoneKey="opponent:life"
            size="small"
            displayMode="life"
            pendingChoiceInstanceIds={pendingChoiceInstanceIds}
            decisionSelectedInstanceIds={decisionSelectedInstanceIds}
            actionDisabled={actionDisabled}
            onCardPreview={onPreviewCard}
            onCardClick={onCardClick}
          />
        </div>
        <div className="playmat-zone opponent-deck">
          <Zone
            label="Deck"
            cards={hiddenCards(
              board.opponent.deckCount,
              "hidden-deck-opponent",
              10,
            )}
            presentationZoneKey="opponent:deck"
            size="small"
            displayMode="stack"
            stackCount={board.opponent.deckCount}
            onCardPreview={onPreviewCard}
          />
        </div>
        <div className="playmat-zone opponent-don-deck">
          <Zone
            label="DON!! Deck"
            cards={hiddenCards(
              board.opponent.donDeckCount,
              "hidden-don-deck-opponent",
              10,
            )}
            presentationZoneKey="opponent:donDeck"
            size="small"
            displayMode="stack"
            stackCount={board.opponent.donDeckCount}
            onCardPreview={onPreviewCard}
          />
        </div>
        <div className="playmat-zone opponent-trash">
          <Zone
            label="Trash"
            cards={board.opponent.trash}
            presentationZoneKey="opponent:trash"
            size="small"
            displayMode="stack"
            onCardPreview={onPreviewCard}
            onViewCollection={() => {
              onViewCollection(
                `${board.opponentLabel}'s trash`,
                board.opponent.trash,
              );
            }}
          />
        </div>
        <div className="playmat-zone opponent-leader">
          <Zone
            label="Leader"
            cards={[board.opponent.leader]}
            presentationZoneKey="opponent:leaderArea"
            size="small"
            selectedCardInstanceId={selectedCardInstanceId}
            pendingChoiceInstanceIds={pendingChoiceInstanceIds}
            decisionSelectedInstanceIds={decisionSelectedInstanceIds}
            selectedDonInstanceIds={selectedDonInstanceIds}
            activeCardInstanceIds={activeCardInstanceIds}
            cardActions={cardActions}
            actionDisabled={actionDisabled}
            onCardClick={onCardClick}
            onCardAction={onCardAction}
            onCardPreview={onPreviewCard}
          />
        </div>
        <div className="playmat-zone opponent-restriction-area">
          <PlayerRestrictionBadges
            label={board.opponentLabel}
            restrictions={board.opponentRestrictions}
          />
        </div>
        <div className="playmat-zone opponent-stage">
          <Zone
            label="Stage"
            presentationZoneKey="opponent:stageArea"
            cards={
              board.opponent.stage === undefined ? [] : [board.opponent.stage]
            }
            size="small"
            selectedCardInstanceId={selectedCardInstanceId}
            pendingChoiceInstanceIds={pendingChoiceInstanceIds}
            decisionSelectedInstanceIds={decisionSelectedInstanceIds}
            selectedDonInstanceIds={selectedDonInstanceIds}
            activeCardInstanceIds={activeCardInstanceIds}
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
            presentationZoneKey="opponent:characterArea"
            displayMode="slots"
            slotCount={5}
            selectedCardInstanceId={selectedCardInstanceId}
            pendingChoiceInstanceIds={pendingChoiceInstanceIds}
            decisionSelectedInstanceIds={decisionSelectedInstanceIds}
            selectedDonInstanceIds={selectedDonInstanceIds}
            activeCardInstanceIds={activeCardInstanceIds}
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
            presentationZoneKey="self:characterArea"
            displayMode="slots"
            slotCount={5}
            selectedCardInstanceId={selectedCardInstanceId}
            pendingChoiceInstanceIds={pendingChoiceInstanceIds}
            decisionSelectedInstanceIds={decisionSelectedInstanceIds}
            selectedDonInstanceIds={selectedDonInstanceIds}
            activeCardInstanceIds={activeCardInstanceIds}
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
            cards={board.self.lifeCards}
            presentationZoneKey="self:life"
            size="small"
            displayMode="life"
            pendingChoiceInstanceIds={pendingChoiceInstanceIds}
            decisionSelectedInstanceIds={decisionSelectedInstanceIds}
            actionDisabled={actionDisabled}
            onCardPreview={onPreviewCard}
            onCardClick={onCardClick}
          />
        </div>
        <div className="playmat-zone player-leader">
          <Zone
            label="Leader"
            cards={[board.self.leader]}
            presentationZoneKey="self:leaderArea"
            size="small"
            selectedCardInstanceId={selectedCardInstanceId}
            pendingChoiceInstanceIds={pendingChoiceInstanceIds}
            decisionSelectedInstanceIds={decisionSelectedInstanceIds}
            selectedDonInstanceIds={selectedDonInstanceIds}
            activeCardInstanceIds={activeCardInstanceIds}
            cardActions={cardActions}
            actionDisabled={actionDisabled}
            onCardClick={onCardClick}
            onCardAction={onCardAction}
            onCardPreview={onPreviewCard}
          />
        </div>
        <div className="playmat-zone player-restriction-area">
          <PlayerRestrictionBadges
            label={board.selfLabel}
            restrictions={board.selfRestrictions}
          />
        </div>
        <div className="playmat-zone player-stage">
          <Zone
            label="Stage"
            cards={board.self.stage === undefined ? [] : [board.self.stage]}
            presentationZoneKey="self:stageArea"
            size="small"
            selectedCardInstanceId={selectedCardInstanceId}
            pendingChoiceInstanceIds={pendingChoiceInstanceIds}
            decisionSelectedInstanceIds={decisionSelectedInstanceIds}
            selectedDonInstanceIds={selectedDonInstanceIds}
            activeCardInstanceIds={activeCardInstanceIds}
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
            cards={hiddenCards(board.self.deckCount, "hidden-deck-self", 10)}
            presentationZoneKey="self:deck"
            size="small"
            displayMode="stack"
            stackCount={board.self.deckCount}
            onCardPreview={onPreviewCard}
          />
        </div>
        <div className="playmat-zone player-don-deck">
          <Zone
            label="DON!! Deck"
            cards={hiddenCards(
              board.self.donDeckCount,
              "hidden-don-deck-self",
              10,
            )}
            presentationZoneKey="self:donDeck"
            size="small"
            displayMode="stack"
            stackCount={board.self.donDeckCount}
            onCardPreview={onPreviewCard}
          />
        </div>
        <div className="playmat-zone player-trash">
          <Zone
            label="Trash"
            cards={board.self.trash}
            presentationZoneKey="self:trash"
            size="small"
            displayMode="stack"
            onCardPreview={onPreviewCard}
            onViewCollection={() => {
              onViewCollection(`${board.selfLabel}'s trash`, board.self.trash);
            }}
          />
        </div>
        <div className="playmat-zone player-cost">
          <Zone
            label="Cost Area"
            cards={board.self.costArea}
            presentationZoneKey="self:costArea"
            size="mini"
            displayMode="overlap"
            pendingChoiceInstanceIds={pendingChoiceInstanceIds}
            decisionSelectedInstanceIds={decisionSelectedInstanceIds}
            selectedDonInstanceIds={selectedDonInstanceIds}
            activeCardInstanceIds={activeCardInstanceIds}
            onCardPreview={onPreviewCard}
            onCardClick={onCardClick}
          />
        </div>
      </div>
    </section>
  );
};
