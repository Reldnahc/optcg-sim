import { useCallback, useMemo } from "react";

import type { PlayerId } from "@optcg/types";

import { createActionLogEntries } from "../action-log.js";
import type { MatchClientState } from "../index.js";
import type { ClientCardModel } from "../view-model.js";
import { cardDisplayFromCatalog, cardModelFromCatalog } from "./card-model.js";
import { rollbackStatusForPlayer } from "./rollback-status.js";
import { useFirstPlayerChoiceModal } from "./use-first-player-choice-modal.js";
import { useOrderedHandBoard } from "./use-ordered-hand-board.js";
import type { MatchClientUi } from "./useMatchClient-support.js";
import {
  isFirstPlayerSetupClientState,
  isLobbyClientState,
  isMatchClientState,
} from "./useMatchClient-support.js";

export interface MatchAppSessionModel {
  actionLogEntries: ReturnType<typeof createActionLogEntries>;
  cardDisplay: (
    card: Parameters<typeof cardDisplayFromCatalog>[1],
  ) => ReturnType<typeof cardDisplayFromCatalog>;
  cardModel: (
    card: Parameters<typeof cardModelFromCatalog>[1],
  ) => ClientCardModel;
  concedeAction: ReturnType<MatchClientUi["globalActions"]>[number] | undefined;
  currentPlayerId: MatchClientUi["currentPlayerId"];
  displayBoard: ReturnType<typeof useOrderedHandBoard>["displayBoard"];
  firstPlayerSetupState:
    | Extract<
        NonNullable<MatchClientUi["state"]["clientState"]>,
        { firstPlayerChoice: unknown }
      >
    | undefined;
  globalActions: ReturnType<MatchClientUi["globalActions"]>;
  lobbyState:
    | Extract<
        NonNullable<MatchClientUi["state"]["clientState"]>,
        { lobbyId: string }
      >
    | undefined;
  matchScope: string | undefined;
  matchState:
    | Extract<
        NonNullable<MatchClientUi["state"]["clientState"]>,
        { snapshot: unknown }
      >
    | undefined;
  moveHandCard: ReturnType<typeof useOrderedHandBoard>["moveHandCard"];
  playerSnapshot: MatchClientState["snapshot"]["players"][PlayerId] | undefined;
  rollbackStatus: ReturnType<typeof rollbackStatusForPlayer>;
  setVisibleDecisionOption: (option: string) => void;
  submitVisibleDecisionActionOption: (actionIndex: number) => void;
  submitVisibleDecisionOption: (option: string) => void;
  submitVisibleDecisionQuantity: (quantity: number) => void;
  confirmVisibleDecision: () => void;
  visibleDecisionModal: MatchClientUi["state"]["decisionModal"];
  visibleGlobalActions: ReturnType<MatchClientUi["globalActions"]>;
}

const emptyGlobalActions: ReturnType<MatchClientUi["globalActions"]> = [];

export const useMatchAppSession = (
  client: MatchClientUi,
): MatchAppSessionModel => {
  const { board, clientState, decisionModal } = client.state;
  const {
    chooseFirstPlayer,
    confirmDecision,
    globalActions: getGlobalActions,
    setDecisionOptionValue,
    submitDecisionActionOptionValue,
    submitDecisionOptionValue,
    submitDecisionQuantityValue,
  } = client;
  const matchState = isMatchClientState(clientState) ? clientState : undefined;
  const firstPlayerSetupState = isFirstPlayerSetupClientState(clientState)
    ? clientState
    : undefined;
  const lobbyState = isLobbyClientState(clientState) ? clientState : undefined;
  const firstPlayerChoiceModal = useFirstPlayerChoiceModal(
    firstPlayerSetupState,
    chooseFirstPlayer,
  );
  const visibleDecisionModal = firstPlayerChoiceModal.model ?? decisionModal;
  const setVisibleDecisionOption =
    firstPlayerChoiceModal.onOption ?? setDecisionOptionValue;
  const submitVisibleDecisionOptionFallback = useCallback(
    (option: string): void => {
      void submitDecisionOptionValue(option);
    },
    [submitDecisionOptionValue],
  );
  const submitVisibleDecisionOption =
    firstPlayerChoiceModal.onSubmitOption ??
    submitVisibleDecisionOptionFallback;
  const submitVisibleDecisionActionOption = useCallback(
    (actionIndex: number): void => {
      void submitDecisionActionOptionValue(actionIndex);
    },
    [submitDecisionActionOptionValue],
  );
  const submitVisibleDecisionQuantity = useCallback(
    (quantity: number): void => {
      void submitDecisionQuantityValue(quantity);
    },
    [submitDecisionQuantityValue],
  );
  const confirmVisibleDecisionFallback = useCallback((): void => {
    void confirmDecision();
  }, [confirmDecision]);
  const confirmVisibleDecision =
    firstPlayerChoiceModal.onConfirm ?? confirmVisibleDecisionFallback;
  const scopedMatchState = matchState ?? firstPlayerSetupState;
  const matchScope =
    scopedMatchState === undefined && lobbyState === undefined
      ? undefined
      : String(scopedMatchState?.matchId ?? lobbyState?.lobbyId);
  const currentPlayerId = client.currentPlayerId;
  const { displayBoard, moveHandCard } = useOrderedHandBoard({
    board,
    matchScope,
    currentPlayerId,
  });
  const playerSnapshot =
    currentPlayerId === undefined || matchState === undefined
      ? undefined
      : matchState.snapshot.players[currentPlayerId];
  const globalActions = useMemo(
    () =>
      decisionModal === undefined ? getGlobalActions() : emptyGlobalActions,
    [decisionModal, getGlobalActions],
  );
  const concedeAction = useMemo(
    () => getGlobalActions().find((action) => action.type === "concede"),
    [getGlobalActions],
  );
  const visibleGlobalActions = useMemo(
    () => globalActions.filter((action) => action.type !== "concede"),
    [globalActions],
  );
  const rollbackStatus = useMemo(
    () => rollbackStatusForPlayer(matchState?.snapshot, currentPlayerId),
    [currentPlayerId, matchState?.snapshot],
  );
  const cardCatalog = matchState?.cards;
  const cardDisplay = useCallback(
    (card: Parameters<typeof cardDisplayFromCatalog>[1]) =>
      cardDisplayFromCatalog(cardCatalog, card),
    [cardCatalog],
  );
  const cardModel = useCallback(
    (card: Parameters<typeof cardModelFromCatalog>[1]) =>
      cardModelFromCatalog(cardCatalog, card),
    [cardCatalog],
  );
  const actionLogEntries = useMemo(
    () =>
      playerSnapshot === undefined || matchState === undefined
        ? []
        : createActionLogEntries({
            events: playerSnapshot.view.events,
            catalog: matchState.cards,
            rollbackPoints:
              matchState.snapshot.rollback?.canRequest === true
                ? matchState.snapshot.rollback.points
                : [],
          }),
    [matchState, playerSnapshot],
  );

  return {
    actionLogEntries,
    cardDisplay,
    cardModel,
    concedeAction,
    currentPlayerId,
    displayBoard,
    firstPlayerSetupState,
    globalActions,
    lobbyState,
    matchScope,
    matchState,
    moveHandCard,
    playerSnapshot,
    rollbackStatus,
    setVisibleDecisionOption,
    submitVisibleDecisionActionOption,
    submitVisibleDecisionOption,
    submitVisibleDecisionQuantity,
    confirmVisibleDecision,
    visibleDecisionModal,
    visibleGlobalActions,
  };
};
