import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { InstanceId, PlayerId } from "@optcg/types";

import {
  attackTargetActionForInstance,
  createDecisionDraft,
  counterTargetActionForInstance,
  directReturnDonCostClick,
  isSelectableCostAreaDon,
  optionalCardCostActionForInstance,
  optionalCardCostInstanceIds,
  toggleDecisionSelectedCard,
  toggleSelectedDonInstanceId,
} from "../index.js";
import type {
  AttackTargetChoice,
  BoardViewModel,
  ClientActionModel,
  CounterTargetChoice,
  DecisionDraft,
  MatchClientState,
  OptionalCardCostGroup,
  PendingDecisionInteractionMode,
} from "../index.js";
import {
  decisionHasCandidate,
  isSelfAttachmentTarget,
  toggleCardCostSelectedInstanceId,
} from "./useMatchClient-support.js";

type PendingDecision =
  | MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
  | undefined;

export interface UseMatchClientCardSelectionInput {
  activeAttackTargetChoice: AttackTargetChoice | undefined;
  activeCounterTargetChoice: CounterTargetChoice | undefined;
  activeCardCostGroup: OptionalCardCostGroup | undefined;
  activeCardCostSelectedInstanceIds: readonly string[];
  activeDecisionDraft: DecisionDraft | undefined;
  board: BoardViewModel | undefined;
  modalResponseActions: readonly ClientActionModel[];
  pendingDecision: PendingDecision;
  pendingDecisionInteractionMode: PendingDecisionInteractionMode | undefined;
  playerActions: MatchClientState["snapshot"]["players"][PlayerId]["actions"];
  selectedDonInstanceIds: readonly string[];
  setActiveAttackTargetChoice: (value: AttackTargetChoice | undefined) => void;
  setActiveCardCostSelectedInstanceIds: Dispatch<SetStateAction<string[]>>;
  setActiveCounterTargetChoice: (
    value: CounterTargetChoice | undefined,
  ) => void;
  setDecisionDraft: (value: DecisionDraft | undefined) => void;
  setSelectedCardInstanceId: (value: string | undefined) => void;
  setSelectedDonInstanceIds: Dispatch<SetStateAction<string[]>>;
  submitAction: (actionIndex: number) => Promise<void>;
  submitDecisionDraft: (draft: DecisionDraft) => Promise<void>;
}

export const useMatchClientCardSelection = ({
  activeAttackTargetChoice,
  activeCounterTargetChoice,
  activeCardCostGroup,
  activeCardCostSelectedInstanceIds,
  activeDecisionDraft,
  board,
  modalResponseActions,
  pendingDecision,
  pendingDecisionInteractionMode,
  playerActions,
  selectedDonInstanceIds,
  setActiveAttackTargetChoice,
  setActiveCardCostSelectedInstanceIds,
  setActiveCounterTargetChoice,
  setDecisionDraft,
  setSelectedCardInstanceId,
  setSelectedDonInstanceIds,
  submitAction,
  submitDecisionDraft,
}: UseMatchClientCardSelectionInput): ((
  instanceId: string | undefined,
) => void) =>
  useCallback(
    (instanceId: string | undefined): void => {
      if (instanceId === undefined) {
        setSelectedCardInstanceId(undefined);
        setSelectedDonInstanceIds([]);
        setActiveAttackTargetChoice(undefined);
        setActiveCounterTargetChoice(undefined);
        return;
      }
      if (activeAttackTargetChoice !== undefined) {
        const actionIndex = attackTargetActionForInstance(
          activeAttackTargetChoice,
          instanceId,
        );
        if (actionIndex !== undefined) {
          void submitAction(actionIndex);
          return;
        }
      }
      if (activeCounterTargetChoice !== undefined) {
        const actionIndex = counterTargetActionForInstance(
          activeCounterTargetChoice,
          instanceId,
        );
        if (actionIndex !== undefined) {
          void submitAction(actionIndex);
          return;
        }
      }
      if (activeCardCostGroup !== undefined) {
        if (
          !optionalCardCostInstanceIds(activeCardCostGroup).includes(instanceId)
        ) {
          return;
        }
        const directReturnDonClick = directReturnDonCostClick(
          activeCardCostGroup,
          activeCardCostSelectedInstanceIds,
          instanceId,
        );
        if (directReturnDonClick !== undefined) {
          setSelectedCardInstanceId(undefined);
          setSelectedDonInstanceIds([]);
          setActiveCardCostSelectedInstanceIds(
            directReturnDonClick.selectedInstanceIds,
          );
          if (directReturnDonClick.actionIndex !== undefined) {
            void submitAction(directReturnDonClick.actionIndex);
          }
          return;
        }
        if (activeCardCostGroup.requiredCount === 1) {
          const actionIndex = optionalCardCostActionForInstance(
            activeCardCostGroup,
            instanceId,
          );
          if (actionIndex !== undefined) {
            void submitAction(actionIndex);
          }
          return;
        }
        setActiveCardCostSelectedInstanceIds((selected) =>
          toggleCardCostSelectedInstanceId(
            selected,
            instanceId,
            activeCardCostGroup.requiredCount,
          ),
        );
        setSelectedCardInstanceId(undefined);
        setSelectedDonInstanceIds([]);
        return;
      }
      if (
        pendingDecisionInteractionMode === "zoneClick" &&
        pendingDecision !== undefined &&
        (pendingDecision.type === "selectCards" ||
          pendingDecision.type === "selectTargets") &&
        decisionHasCandidate(pendingDecision, instanceId)
      ) {
        const nextDraft = toggleDecisionSelectedCard(
          pendingDecision,
          activeDecisionDraft?.decisionId === pendingDecision.id
            ? activeDecisionDraft
            : createDecisionDraft(pendingDecision, modalResponseActions),
          instanceId as InstanceId,
        );
        setSelectedCardInstanceId(undefined);
        setSelectedDonInstanceIds([]);
        setDecisionDraft(nextDraft);
        setActiveAttackTargetChoice(undefined);
        setActiveCounterTargetChoice(undefined);
        if (pendingDecision.max === 1) {
          void submitDecisionDraft(nextDraft);
        }
        return;
      }
      if (isSelectableCostAreaDon(board, instanceId, playerActions)) {
        setSelectedCardInstanceId(undefined);
        setActiveAttackTargetChoice(undefined);
        setActiveCounterTargetChoice(undefined);
        setSelectedDonInstanceIds((selected) =>
          toggleSelectedDonInstanceId(selected, instanceId),
        );
        return;
      }
      if (
        selectedDonInstanceIds.length > 0 &&
        isSelfAttachmentTarget(board, instanceId)
      ) {
        setSelectedCardInstanceId(instanceId);
        return;
      }
      setSelectedDonInstanceIds([]);
      setActiveAttackTargetChoice(undefined);
      setActiveCounterTargetChoice(undefined);
      setSelectedCardInstanceId(instanceId);
    },
    [
      activeDecisionDraft,
      activeAttackTargetChoice,
      activeCounterTargetChoice,
      activeCardCostGroup,
      activeCardCostSelectedInstanceIds,
      board,
      modalResponseActions,
      pendingDecision,
      pendingDecisionInteractionMode,
      playerActions,
      selectedDonInstanceIds.length,
      setActiveAttackTargetChoice,
      setActiveCardCostSelectedInstanceIds,
      setActiveCounterTargetChoice,
      setDecisionDraft,
      setSelectedCardInstanceId,
      setSelectedDonInstanceIds,
      submitAction,
      submitDecisionDraft,
    ],
  );
