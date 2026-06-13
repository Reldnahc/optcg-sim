import type { PlayerId } from "@optcg/types";

import {
  attackTargetInstanceIds,
  autoOptionalCardCostGroup,
  autoPayCostActionIndex,
  cardCostPaymentLabel,
  createBoardViewModel,
  createCanonicalDonPaymentActions,
  createDecisionDraft,
  createDecisionModalModel,
  createOptionalCardCostChoice,
  createOptionalCardCostModalActions,
  counterTargetInstanceIds,
  getPendingDecisionInteractionMode,
  isDecisionModalSuppressed,
  optionalCardCostActionForSelection,
  optionalCardCostGroupForActionIndex,
  optionalCardCostInstanceIds,
  quickPayActivateMainCostActionIndex,
} from "../index.js";
import type {
  AttackTargetChoice,
  BoardViewModel,
  ClientActionModel,
  CounterTargetChoice,
  DecisionDraft,
  DecisionModalModel,
  MatchClientState,
  MatchClientSessionState,
  OptionalCardCostChoice,
  OptionalCardCostGroup,
  PendingDecisionInteractionMode,
} from "../index.js";
import {
  activeCardInstanceIdsForUi,
  applyActiveCardCostLifeChoiceCards,
  applyPendingDecisionLifeChoiceCards,
  decisionCandidateInstanceIds,
  isMatchClientState,
  prominentDecisionPrompt,
  zoneClickVisibleInstanceIds,
  type MatchClientUiState,
} from "./useMatchClient-support.js";

type PlayerSnapshot =
  | MatchClientState["snapshot"]["players"][PlayerId]
  | undefined;

type PendingDecision =
  | MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
  | undefined;

export interface ActiveCardCostChoice {
  decisionId: string;
  actionIndex: number;
}

export interface MatchClientDecisionModel {
  activeCardInstanceIds: string[];
  board?: BoardViewModel | undefined;
  pendingDecisionResponseActions: ClientActionModel[];
  optionalCardCostChoice?: OptionalCardCostChoice | undefined;
  canonicalDonPaymentActions?: ClientActionModel[] | undefined;
  automaticPayCostActionIndex?: number | undefined;
  quickPayActivateMainCostActionIndex?: number | undefined;
  activeCardCostGroup?: OptionalCardCostGroup | undefined;
  explicitCardCostChoiceActive: boolean;
  cardCostChoiceActive: boolean;
  pendingDecisionInteractionMode?: PendingDecisionInteractionMode | undefined;
  selectedCardCostActionIndex?: number | undefined;
  activeCardCostSelection?: MatchClientUiState["cardCostSelection"];
  modalResponseActions: ClientActionModel[];
  activeDecisionDraft?: DecisionDraft | undefined;
  decisionModal?: DecisionModalModel | undefined;
  pendingChoiceInstanceIds: string[];
  decisionSelectedInstanceIds: string[];
  decisionPrompt?: string | undefined;
}

export interface CreateMatchClientDecisionModelInput {
  clientState: MatchClientSessionState | undefined;
  playerSnapshot: PlayerSnapshot;
  pendingDecision: PendingDecision;
  activeAttackTargetChoice: AttackTargetChoice | undefined;
  activeCounterTargetChoice: CounterTargetChoice | undefined;
  activeCardCostChoice: ActiveCardCostChoice | undefined;
  activeCardCostSelectedInstanceIds: readonly string[];
  decisionDraft: DecisionDraft | undefined;
  quickPayActivateMainCosts?: boolean | undefined;
  quickPayActivateMainArmed?: boolean | undefined;
}

export const createMatchClientDecisionModel = ({
  clientState,
  playerSnapshot,
  pendingDecision,
  activeAttackTargetChoice,
  activeCounterTargetChoice,
  activeCardCostChoice,
  activeCardCostSelectedInstanceIds,
  decisionDraft,
  quickPayActivateMainCosts = false,
  quickPayActivateMainArmed = false,
}: CreateMatchClientDecisionModelInput): MatchClientDecisionModel => {
  const activeCardInstanceIds = activeCardInstanceIdsForUi({
    attackSourceInstanceId: activeAttackTargetChoice?.attackerInstanceId,
    counterSourceInstanceId: activeCounterTargetChoice?.counterCardInstanceId,
    playerSnapshot,
    pendingDecision,
  });
  const baseBoard = !isMatchClientState(clientState)
    ? undefined
    : createBoardViewModel({
        snapshot: clientState.snapshot,
        catalog: clientState.cards,
        playerId: clientState.seat.playerId,
        activeCardInstanceIds,
      });
  const pendingDecisionResponseActions =
    pendingDecision === undefined || playerSnapshot === undefined
      ? []
      : playerSnapshot.actions
          .filter(
            (action) =>
              action.type === "respondToDecision" &&
              action.placement === undefined,
          )
          .map((action) => ({
            index: action.index,
            label: action.label,
            type: action.type,
            ...(action.responseKey === undefined
              ? {}
              : { responseKey: action.responseKey }),
            ...(action.decisionPayment === undefined
              ? {}
              : { decisionPayment: action.decisionPayment }),
          }));
  const optionalCardCostChoice =
    pendingDecision === undefined
      ? undefined
      : createOptionalCardCostChoice(
          pendingDecision,
          pendingDecisionResponseActions,
        );
  const canonicalDonPaymentActions =
    pendingDecision?.type === "payCost" && optionalCardCostChoice === undefined
      ? createCanonicalDonPaymentActions(pendingDecisionResponseActions)
      : undefined;
  const automaticPayCostActionIndex = autoPayCostActionIndex(
    pendingDecision,
    pendingDecisionResponseActions,
  );
  const quickPayActionIndex =
    quickPayActivateMainCosts && quickPayActivateMainArmed
      ? quickPayActivateMainCostActionIndex(
          pendingDecision,
          pendingDecisionResponseActions,
        )
      : undefined;
  const explicitCardCostGroup =
    activeCardCostChoice === undefined ||
    optionalCardCostChoice === undefined ||
    activeCardCostChoice.decisionId !==
      String(optionalCardCostChoice.decisionId)
      ? undefined
      : optionalCardCostGroupForActionIndex(
          optionalCardCostChoice,
          activeCardCostChoice.actionIndex,
        );
  const autoCardCostGroup =
    explicitCardCostGroup === undefined
      ? autoOptionalCardCostGroup(optionalCardCostChoice)
      : undefined;
  const activeCardCostGroup = explicitCardCostGroup ?? autoCardCostGroup;
  const explicitCardCostChoiceActive = explicitCardCostGroup !== undefined;
  const cardCostChoiceActive = activeCardCostGroup !== undefined;
  const board = applyActiveCardCostLifeChoiceCards(
    applyPendingDecisionLifeChoiceCards(baseBoard, pendingDecision),
    activeCardCostGroup,
  );
  const zoneClickVisibleIds = zoneClickVisibleInstanceIds(board);
  const pendingDecisionInteractionMode =
    pendingDecision === undefined
      ? undefined
      : getPendingDecisionInteractionMode(pendingDecision, {
          visibleZoneClickInstanceIds: zoneClickVisibleIds,
        });
  const selectedCardCostActionIndex = optionalCardCostActionForSelection(
    activeCardCostGroup,
    activeCardCostSelectedInstanceIds,
  );
  const activeCardCostSelection =
    activeCardCostGroup === undefined || activeCardCostGroup.requiredCount <= 1
      ? undefined
      : {
          title: activeCardCostGroup.chooseLabel,
          ...(activeCardCostGroup.source === undefined
            ? {}
            : { source: activeCardCostGroup.source }),
          selectableInstanceIds:
            optionalCardCostInstanceIds(activeCardCostGroup),
          selectedInstanceIds: [...activeCardCostSelectedInstanceIds],
          canConfirm: selectedCardCostActionIndex !== undefined,
          confirmLabel: cardCostPaymentLabel(activeCardCostGroup),
          ...(activeCardCostGroup.operation === "moveCards" &&
          activeCardCostGroup.source?.zone === "trash"
            ? { orderHint: "1 is highest, last is bottom-most." }
            : {}),
        };
  const modalResponseActions =
    optionalCardCostChoice === undefined || cardCostChoiceActive
      ? (canonicalDonPaymentActions ?? pendingDecisionResponseActions)
      : createOptionalCardCostModalActions(optionalCardCostChoice);
  const activeDecisionDraft =
    pendingDecision === undefined
      ? undefined
      : decisionDraft?.decisionId === pendingDecision.id
        ? decisionDraft
        : createDecisionDraft(pendingDecision, modalResponseActions);
  const decisionModal =
    pendingDecision === undefined ||
    activeDecisionDraft === undefined ||
    cardCostChoiceActive ||
    automaticPayCostActionIndex !== undefined ||
    quickPayActionIndex !== undefined ||
    pendingDecisionInteractionMode !== "modal" ||
    isDecisionModalSuppressed(pendingDecision)
      ? undefined
      : createDecisionModalModel(
          pendingDecision,
          activeDecisionDraft,
          modalResponseActions,
        );
  const pendingChoiceInstanceIds =
    activeAttackTargetChoice !== undefined
      ? attackTargetInstanceIds(activeAttackTargetChoice)
      : activeCounterTargetChoice !== undefined
        ? counterTargetInstanceIds(activeCounterTargetChoice)
        : activeCardCostGroup
          ? optionalCardCostInstanceIds(activeCardCostGroup)
          : pendingDecisionInteractionMode === "zoneClick" &&
              pendingDecision !== undefined
            ? decisionCandidateInstanceIds(pendingDecision)
            : [];
  const decisionSelectedInstanceIds =
    activeCardCostSelection !== undefined
      ? activeCardCostSelection.selectedInstanceIds
      : pendingDecisionInteractionMode === "zoneClick" &&
          activeDecisionDraft?.kind === "selectCards"
        ? activeDecisionDraft.selectedInstanceIds.map(String)
        : [];
  const decisionPrompt = prominentDecisionPrompt({
    pendingDecision,
    activeCardCostGroup,
  });

  return {
    activeCardInstanceIds,
    ...(board === undefined ? {} : { board }),
    pendingDecisionResponseActions,
    ...(optionalCardCostChoice === undefined ? {} : { optionalCardCostChoice }),
    ...(canonicalDonPaymentActions === undefined
      ? {}
      : { canonicalDonPaymentActions }),
    ...(automaticPayCostActionIndex === undefined
      ? {}
      : { automaticPayCostActionIndex }),
    ...(quickPayActionIndex === undefined
      ? {}
      : { quickPayActivateMainCostActionIndex: quickPayActionIndex }),
    ...(activeCardCostGroup === undefined ? {} : { activeCardCostGroup }),
    explicitCardCostChoiceActive,
    cardCostChoiceActive,
    ...(pendingDecisionInteractionMode === undefined
      ? {}
      : { pendingDecisionInteractionMode }),
    ...(selectedCardCostActionIndex === undefined
      ? {}
      : { selectedCardCostActionIndex }),
    ...(activeCardCostSelection === undefined
      ? {}
      : { activeCardCostSelection }),
    modalResponseActions,
    ...(activeDecisionDraft === undefined ? {} : { activeDecisionDraft }),
    ...(decisionModal === undefined ? {} : { decisionModal }),
    pendingChoiceInstanceIds,
    decisionSelectedInstanceIds,
    ...(decisionPrompt === undefined ? {} : { decisionPrompt }),
  };
};
