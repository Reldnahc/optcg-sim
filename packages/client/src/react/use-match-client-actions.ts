import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import type { DecisionResponse, InstanceId } from "@optcg/types";

import {
  ATTACH_SELECTED_DON_ACTION_INDEX,
  ATTACK_TARGET_CHOICE_ACTION_INDEX,
  buildDecisionResponse,
  COUNTER_TARGET_CHOICE_ACTION_INDEX,
  createAttackTargetChoice,
  createCounterTargetChoice,
  createDecisionDraft,
  findSelectedDonAttachActionIndex,
  optionalCardCostGroupForActionIndex,
  shouldPreserveSelectedDonAfterDecisionSubmit,
} from "../index.js";
import type {
  AttackTargetChoice,
  BoardViewModel,
  CounterTargetChoice,
  DecisionDraft,
  MatchClientController,
  MatchClientSessionState,
  OptionalCardCostChoice,
  OptionalCardCostGroup,
  ClientActionModel,
} from "../index.js";
import {
  CHOOSE_NO_DECISION_CARDS_ACTION_INDEX,
  CLEAR_DECISION_SELECTION_ACTION_INDEX,
  CONFIRM_DECISION_SELECTION_ACTION_INDEX,
} from "./useMatchClient-support.js";
import type { ActiveCardCostChoice } from "./use-match-client-decision-model.js";

export interface UseMatchClientActionsInput {
  activeCardCostGroup: OptionalCardCostGroup | undefined;
  activeDecisionDraft: DecisionDraft | undefined;
  board: BoardViewModel | undefined;
  controller: MatchClientController;
  modalResponseActions: Parameters<typeof createDecisionDraft>[1];
  optionalCardCostChoice: OptionalCardCostChoice | undefined;
  pendingDecision: Parameters<typeof createDecisionDraft>[0] | undefined;
  selectedCardCostActionIndex: number | undefined;
  selectedCardInstanceId: string | undefined;
  selectedDonInstanceIds: readonly string[];
  autoSubmittedPayCostDecisionId: RefObject<string | undefined>;
  legalActions: readonly ClientActionModel[];
  onVisibleActionSubmitted: (actionType: ClientActionModel["type"]) => void;
  resetInteractionState: () => void;
  setActionInFlight: (value: boolean) => void;
  setActiveAttackTargetChoice: (value: AttackTargetChoice | undefined) => void;
  setActiveCardCostChoice: (value: ActiveCardCostChoice | undefined) => void;
  setActiveCardCostSelectedInstanceIds: Dispatch<SetStateAction<string[]>>;
  setActiveCounterTargetChoice: (
    value: CounterTargetChoice | undefined,
  ) => void;
  setClientState: (value: MatchClientSessionState) => void;
  setDecisionDraft: (value: DecisionDraft | undefined) => void;
  setErrors: (value: string[]) => void;
  setSelectedCardInstanceId: (value: string | undefined) => void;
  setSelectedDonInstanceIds: (value: string[]) => void;
}

export interface MatchClientActions {
  attachSelectedDonToTarget: (targetInstanceId: string) => Promise<void>;
  confirmDecision: () => Promise<void>;
  submitAction: (actionIndex: number) => Promise<void>;
  submitDecisionDraft: (draft: DecisionDraft) => Promise<void>;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const useMatchClientActions = ({
  activeCardCostGroup,
  activeDecisionDraft,
  board,
  controller,
  modalResponseActions,
  optionalCardCostChoice,
  pendingDecision,
  selectedCardCostActionIndex,
  selectedCardInstanceId,
  selectedDonInstanceIds,
  legalActions,
  onVisibleActionSubmitted,
  resetInteractionState,
  setActionInFlight,
  setActiveAttackTargetChoice,
  setActiveCardCostChoice,
  setActiveCardCostSelectedInstanceIds,
  setActiveCounterTargetChoice,
  setClientState,
  setDecisionDraft,
  setErrors,
  setSelectedCardInstanceId,
  setSelectedDonInstanceIds,
}: UseMatchClientActionsInput): MatchClientActions => {
  const attachSelectedDonToTarget = useCallback(
    async (targetInstanceId: string): Promise<void> => {
      if (selectedDonInstanceIds.length === 0) {
        return;
      }
      setActionInFlight(true);
      try {
        const current = controller.currentState();
        const actions =
          current?.snapshot.players[current.seat.playerId]?.actions ?? [];
        const actionIndex = findSelectedDonAttachActionIndex(
          actions,
          selectedDonInstanceIds,
          targetInstanceId,
        );
        if (actionIndex === undefined) {
          throw new Error(
            `No legal attach action for selected DON!! to ${targetInstanceId}.`,
          );
        }
        const result = await controller.submitVisibleAction({
          actionIndex,
          selectedDonInstanceIds: selectedDonInstanceIds.map(
            (id) => id as InstanceId,
          ),
        });
        setClientState(result);
        resetInteractionState();
        setErrors([]);
      } catch (error) {
        setErrors([errorMessage(error)]);
      } finally {
        setActionInFlight(false);
      }
    },
    [
      controller,
      resetInteractionState,
      selectedDonInstanceIds,
      setActionInFlight,
      setClientState,
      setErrors,
    ],
  );

  const submitDecisionDraft = useCallback(
    async (draft: DecisionDraft): Promise<void> => {
      if (pendingDecision === undefined) {
        return;
      }
      if (draft.kind === "actionOptions") {
        const cardCostGroup = optionalCardCostGroupForActionIndex(
          optionalCardCostChoice,
          draft.actionIndex,
        );
        if (
          cardCostGroup !== undefined &&
          optionalCardCostChoice !== undefined
        ) {
          setActiveCardCostChoice({
            decisionId: String(optionalCardCostChoice.decisionId),
            actionIndex: cardCostGroup.chooseActionIndex,
          });
          setSelectedCardInstanceId(undefined);
          setSelectedDonInstanceIds([]);
          setActiveCardCostSelectedInstanceIds([]);
          setDecisionDraft(undefined);
          return;
        }
        setActionInFlight(true);
        try {
          const result = await controller.submitVisibleAction({
            actionIndex: draft.actionIndex,
          });
          setClientState(result);
          resetInteractionState();
          setErrors([]);
        } catch (error) {
          setErrors([errorMessage(error)]);
        } finally {
          setActionInFlight(false);
        }
        return;
      }
      let response: DecisionResponse;
      try {
        response = buildDecisionResponse(pendingDecision, draft);
      } catch (error) {
        setErrors([errorMessage(error)]);
        return;
      }
      setActionInFlight(true);
      try {
        const result = await controller.respondToDecision({
          decisionId: pendingDecision.id,
          response,
        });
        setClientState(result);
        if (
          pendingDecision.type === "selectTargets" &&
          shouldPreserveSelectedDonAfterDecisionSubmit({
            board,
            decision: pendingDecision,
            draft,
          })
        ) {
          setSelectedCardInstanceId(undefined);
          setDecisionDraft(undefined);
          setActiveCardCostChoice(undefined);
          setActiveCardCostSelectedInstanceIds([]);
          setActiveAttackTargetChoice(undefined);
          setActiveCounterTargetChoice(undefined);
        } else {
          resetInteractionState();
        }
        setErrors([]);
      } catch (error) {
        setErrors([errorMessage(error)]);
      } finally {
        setActionInFlight(false);
      }
    },
    [
      controller,
      board,
      optionalCardCostChoice,
      pendingDecision,
      resetInteractionState,
      setActiveAttackTargetChoice,
      setActionInFlight,
      setActiveCardCostChoice,
      setActiveCardCostSelectedInstanceIds,
      setActiveCounterTargetChoice,
      setClientState,
      setDecisionDraft,
      setErrors,
      setSelectedCardInstanceId,
      setSelectedDonInstanceIds,
    ],
  );

  const submitAction = useCallback(
    async (actionIndex: number): Promise<void> => {
      if (
        actionIndex === ATTACH_SELECTED_DON_ACTION_INDEX &&
        selectedCardInstanceId !== undefined
      ) {
        await attachSelectedDonToTarget(selectedCardInstanceId);
        return;
      }
      if (
        actionIndex === ATTACK_TARGET_CHOICE_ACTION_INDEX &&
        selectedCardInstanceId !== undefined
      ) {
        const choice = createAttackTargetChoice(
          selectedCardInstanceId,
          board?.actionsByCardInstanceId[selectedCardInstanceId] ?? [],
        );
        if (choice !== undefined) {
          setActiveAttackTargetChoice(choice);
          setActiveCounterTargetChoice(undefined);
          setDecisionDraft(undefined);
          setSelectedDonInstanceIds([]);
          setActiveCardCostSelectedInstanceIds([]);
        }
        return;
      }
      if (
        actionIndex === COUNTER_TARGET_CHOICE_ACTION_INDEX &&
        selectedCardInstanceId !== undefined
      ) {
        const choice = createCounterTargetChoice(
          selectedCardInstanceId,
          board?.actionsByCardInstanceId[selectedCardInstanceId] ?? [],
        );
        if (choice !== undefined) {
          setActiveCounterTargetChoice(choice);
          setActiveAttackTargetChoice(undefined);
          setDecisionDraft(undefined);
          setSelectedDonInstanceIds([]);
          setActiveCardCostSelectedInstanceIds([]);
        }
        return;
      }
      if (actionIndex === CLEAR_DECISION_SELECTION_ACTION_INDEX) {
        setDecisionDraft(undefined);
        setActiveCardCostChoice(undefined);
        setActiveCardCostSelectedInstanceIds([]);
        setActiveAttackTargetChoice(undefined);
        setActiveCounterTargetChoice(undefined);
        return;
      }
      if (actionIndex === CHOOSE_NO_DECISION_CARDS_ACTION_INDEX) {
        if (pendingDecision !== undefined) {
          await submitDecisionDraft(
            createDecisionDraft(pendingDecision, modalResponseActions),
          );
        }
        return;
      }
      if (actionIndex === CONFIRM_DECISION_SELECTION_ACTION_INDEX) {
        if (activeDecisionDraft !== undefined) {
          await submitDecisionDraft(activeDecisionDraft);
        }
        return;
      }
      setActionInFlight(true);
      try {
        const visibleAction = legalActions.find(
          (action) => action.index === actionIndex,
        );
        if (visibleAction !== undefined) {
          onVisibleActionSubmitted(visibleAction.type);
        }
        const result = await controller.submitVisibleAction({ actionIndex });
        setClientState(result);
        resetInteractionState();
        setErrors([]);
      } catch (error) {
        setErrors([errorMessage(error)]);
      } finally {
        setActionInFlight(false);
      }
    },
    [
      activeDecisionDraft,
      attachSelectedDonToTarget,
      board,
      controller,
      legalActions,
      modalResponseActions,
      onVisibleActionSubmitted,
      pendingDecision,
      resetInteractionState,
      selectedCardInstanceId,
      setActionInFlight,
      setActiveAttackTargetChoice,
      setActiveCardCostChoice,
      setActiveCardCostSelectedInstanceIds,
      setActiveCounterTargetChoice,
      setClientState,
      setDecisionDraft,
      setErrors,
      setSelectedDonInstanceIds,
      submitDecisionDraft,
    ],
  );

  const confirmDecision = useCallback(async (): Promise<void> => {
    if (
      activeCardCostGroup !== undefined &&
      activeCardCostGroup.requiredCount > 1
    ) {
      if (selectedCardCostActionIndex !== undefined) {
        await submitAction(selectedCardCostActionIndex);
      }
      return;
    }
    if (pendingDecision === undefined || activeDecisionDraft === undefined) {
      return;
    }
    await submitDecisionDraft(activeDecisionDraft);
  }, [
    activeCardCostGroup,
    activeDecisionDraft,
    pendingDecision,
    selectedCardCostActionIndex,
    submitAction,
    submitDecisionDraft,
  ]);

  return {
    attachSelectedDonToTarget,
    confirmDecision,
    submitAction,
    submitDecisionDraft,
  };
};
