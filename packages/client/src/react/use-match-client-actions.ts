import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import type { DecisionResponse } from "@optcg/types";

import {
  ATTACH_SELECTED_DON_ACTION_INDEX,
  ATTACK_TARGET_CHOICE_ACTION_INDEX,
  buildDecisionResponse,
  COUNTER_TARGET_CHOICE_ACTION_INDEX,
  createAttackTargetChoice,
  createCounterTargetChoice,
  createDecisionDraft,
  findAttachDonActionIndex,
  optionalCardCostGroupForActionIndex,
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
        for (const donInstanceId of selectedDonInstanceIds) {
          const current = controller.currentState();
          const actions =
            current?.snapshot.players[current.seat.playerId]?.actions ?? [];
          const actionIndex = findAttachDonActionIndex(
            actions,
            donInstanceId,
            targetInstanceId,
          );
          if (actionIndex === undefined) {
            throw new Error(
              `No legal attach action for ${donInstanceId} to ${targetInstanceId}.`,
            );
          }
          const result = await controller.submitVisibleAction({ actionIndex });
          setClientState(result);
        }
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
      optionalCardCostChoice,
      pendingDecision,
      resetInteractionState,
      setActionInFlight,
      setActiveCardCostChoice,
      setActiveCardCostSelectedInstanceIds,
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
      modalResponseActions,
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

  return { confirmDecision, submitAction, submitDecisionDraft };
};
