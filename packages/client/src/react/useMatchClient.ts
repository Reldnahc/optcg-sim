import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DecisionResponse, InstanceId, PlayerId } from "@optcg/types";

import {
  attackTargetActionForInstance,
  attackTargetInstanceIds,
  ATTACK_TARGET_CHOICE_ACTION_INDEX,
  buildDecisionResponse,
  createBoardViewModel,
  createDecisionDraft,
  createDecisionModalModel,
  getPendingDecisionInteractionMode,
  isDecisionModalSuppressed,
  ATTACH_SELECTED_DON_ACTION_INDEX,
  autoOptionalCardCostGroup,
  autoPayCostActionIndex,
  findAttachDonActionIndex,
  createCanonicalDonPaymentActions,
  createOptionalCardCostChoice,
  createOptionalCardCostModalActions,
  isSelectableCostAreaDon,
  optionalCardCostActionForInstance,
  optionalCardCostActionForSelection,
  optionalCardCostGroupForActionIndex,
  optionalCardCostInstanceIds,
  createAttackTargetChoice,
  createCollapsedAttackActions,
  counterTargetActionForInstance,
  counterTargetInstanceIds,
  COUNTER_TARGET_CHOICE_ACTION_INDEX,
  createCollapsedCounterActions,
  createCounterTargetChoice,
  chooseDecisionTrigger,
  selectedDonAttachmentMenuAction,
  moveOrderedCardNear,
  setDecisionActionOption,
  setDecisionQuantity,
  setDecisionOption,
  toggleSelectedDonInstanceId,
  toggleDecisionSelectedCard,
} from "../index.js";
import type {
  ClientActionModel,
  DecisionDraft,
  MatchClientSessionState,
  AttackTargetChoice,
  CounterTargetChoice,
} from "../index.js";
import { createController } from "../match-client-controller-factory.js";
import {
  chooseNoDecisionLabel,
  CHOOSE_NO_DECISION_CARDS_ACTION_INDEX,
  CLEAR_DECISION_SELECTION_ACTION_INDEX,
  CONFIRM_DECISION_SELECTION_ACTION_INDEX,
  decisionCandidateInstanceIds,
  decisionHasCandidate,
  isMatchClientState,
  isSelfAttachmentTarget,
  lobbyIdFromUrl,
  matchIdFromUrl,
  seatIdFromUrl,
  setLobbyLocation,
  setMatchLocation,
  toggleCardCostSelectedInstanceId,
  useCostReset,
  visibleErrors,
  zoneClickVisibleInstanceIds,
  type MatchClientUi,
} from "./useMatchClient-support.js";

export const useMatchClient = (): MatchClientUi => {
  const controller = useMemo(() => createController(), []);
  const [clientState, setClientState] = useState<
    MatchClientSessionState | undefined
  >();
  const [selectedCardInstanceId, setSelectedCardInstanceId] =
    useState<string>();
  const [selectedDonInstanceIds, setSelectedDonInstanceIds] = useState<
    string[]
  >([]);
  const [decisionDraft, setDecisionDraft] = useState<
    DecisionDraft | undefined
  >();
  const [activeCardCostChoice, setActiveCardCostChoice] = useState<
    { decisionId: string; actionIndex: number } | undefined
  >();
  const [
    activeCardCostSelectedInstanceIds,
    setActiveCardCostSelectedInstanceIds,
  ] = useState<string[]>([]);
  const [activeAttackTargetChoice, setActiveAttackTargetChoice] = useState<
    AttackTargetChoice | undefined
  >();
  const [activeCounterTargetChoice, setActiveCounterTargetChoice] = useState<
    CounterTargetChoice | undefined
  >();
  const autoSubmittedPayCostDecisionId = useRef<string | undefined>(undefined);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const currentPlayerId = clientState?.seat.playerId;
  const board = !isMatchClientState(clientState)
    ? undefined
    : createBoardViewModel({
        snapshot: clientState.snapshot,
        catalog: clientState.cards,
        playerId: clientState.seat.playerId,
      });
  const playerSnapshot =
    currentPlayerId === undefined || !isMatchClientState(clientState)
      ? undefined
      : clientState.snapshot.players[currentPlayerId];
  const liveConnectionKey = !isMatchClientState(clientState)
    ? undefined
    : `${String(clientState.matchId)}:${String(clientState.seat.playerId)}`;
  const lobbyConnectionKey =
    clientState === undefined || isMatchClientState(clientState)
      ? undefined
      : `${clientState.lobbyId}:${String(clientState.seat.playerId)}`;
  const pendingDecision = playerSnapshot?.view.pendingDecision;
  const zoneClickVisibleIds = zoneClickVisibleInstanceIds(board);
  const pendingDecisionInteractionMode =
    pendingDecision === undefined
      ? undefined
      : getPendingDecisionInteractionMode(pendingDecision, {
          visibleZoneClickInstanceIds: zoneClickVisibleIds,
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
          selectedInstanceIds: activeCardCostSelectedInstanceIds,
          canConfirm: selectedCardCostActionIndex !== undefined,
          confirmLabel: "Pay cost",
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

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const urlMatchId = matchIdFromUrl();
        const urlLobbyId = lobbyIdFromUrl();
        const seatId = seatIdFromUrl();
        const loaded =
          urlMatchId !== undefined
            ? await controller.joinLocalMatch({
                matchId: urlMatchId,
                playerId: seatId,
              })
            : urlLobbyId !== undefined
              ? await controller.joinLocalLobby({
                  lobbyId: urlLobbyId,
                  playerId: seatId,
                })
              : await controller.startNewLocalLobby("p1" as PlayerId);
        if (cancelled) {
          return;
        }
        if (isMatchClientState(loaded)) {
          setMatchLocation(loaded.matchId, loaded.seat.playerId);
        } else {
          setLobbyLocation(loaded.lobbyId, loaded.seat.playerId);
        }
        setClientState(loaded);
        setErrors([]);
      } catch (error) {
        if (!cancelled) {
          setErrors([error instanceof Error ? error.message : String(error)]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [controller]);

  useCostReset(
    optionalCardCostChoice?.decisionId,
    activeCardCostGroup,
    setActiveCardCostSelectedInstanceIds,
  );

  useEffect(() => {
    if (
      liveConnectionKey === undefined ||
      controller.currentState() === undefined
    ) {
      controller.disconnectLive();
      return;
    }
    controller.connectLive({
      onState(nextState) {
        setClientState(nextState);
        setErrors([]);
      },
      onError(message) {
        setErrors([message]);
      },
    });
    return () => {
      controller.disconnectLive();
    };
  }, [liveConnectionKey, controller]);

  useEffect(() => {
    if (lobbyConnectionKey === undefined) {
      controller.disconnectLobbyLive();
      return;
    }
    controller.connectLobbyLive({
      onState(nextState) {
        if (isMatchClientState(nextState)) {
          setMatchLocation(nextState.matchId, nextState.seat.playerId);
        } else {
          setLobbyLocation(nextState.lobbyId, nextState.seat.playerId);
        }
        setClientState(nextState);
        setErrors([]);
      },
      onError(message) {
        setErrors([message]);
      },
    });
    return () => {
      controller.disconnectLobbyLive();
    };
  }, [lobbyConnectionKey, controller]);

  const createNewMatch = useCallback(async (): Promise<void> => {
    const created = await controller.startNewLocalLobby("p1" as PlayerId);
    if (isMatchClientState(created)) {
      setMatchLocation(created.matchId, created.seat.playerId);
    } else {
      setLobbyLocation(created.lobbyId, created.seat.playerId);
    }
    setSelectedCardInstanceId(undefined);
    setSelectedDonInstanceIds([]);
    setDecisionDraft(undefined);
    setActiveCardCostChoice(undefined);
    setActiveCardCostSelectedInstanceIds([]);
    setActiveAttackTargetChoice(undefined);
    setActiveCounterTargetChoice(undefined);
    autoSubmittedPayCostDecisionId.current = undefined;
    setClientState(created);
    setErrors([]);
  }, [controller]);

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
        setSelectedDonInstanceIds([]);
        setSelectedCardInstanceId(undefined);
        setDecisionDraft(undefined);
        setActiveCardCostChoice(undefined);
        setActiveCardCostSelectedInstanceIds([]);
        setActiveAttackTargetChoice(undefined);
        setActiveCounterTargetChoice(undefined);
        setErrors([]);
      } catch (error) {
        setErrors([error instanceof Error ? error.message : String(error)]);
      } finally {
        setActionInFlight(false);
      }
    },
    [controller, selectedDonInstanceIds],
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
          setSelectedCardInstanceId(undefined);
          setSelectedDonInstanceIds([]);
          setDecisionDraft(undefined);
          setActiveCardCostChoice(undefined);
          setActiveCardCostSelectedInstanceIds([]);
          setActiveAttackTargetChoice(undefined);
          setActiveCounterTargetChoice(undefined);
          setErrors([]);
        } catch (error) {
          setErrors([error instanceof Error ? error.message : String(error)]);
        } finally {
          setActionInFlight(false);
        }
        return;
      }
      let response: DecisionResponse;
      try {
        response = buildDecisionResponse(pendingDecision, draft);
      } catch (error) {
        setErrors([error instanceof Error ? error.message : String(error)]);
        return;
      }
      setActionInFlight(true);
      try {
        const result = await controller.respondToDecision({
          decisionId: pendingDecision.id,
          response,
        });
        setClientState(result);
        setSelectedCardInstanceId(undefined);
        setSelectedDonInstanceIds([]);
        setDecisionDraft(undefined);
        setActiveCardCostChoice(undefined);
        setActiveCardCostSelectedInstanceIds([]);
        setActiveAttackTargetChoice(undefined);
        setActiveCounterTargetChoice(undefined);
        setErrors([]);
      } catch (error) {
        setErrors([error instanceof Error ? error.message : String(error)]);
      } finally {
        setActionInFlight(false);
      }
    },
    [controller, optionalCardCostChoice, pendingDecision],
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
        setSelectedCardInstanceId(undefined);
        setSelectedDonInstanceIds([]);
        setDecisionDraft(undefined);
        setActiveCardCostChoice(undefined);
        setActiveCardCostSelectedInstanceIds([]);
        setActiveAttackTargetChoice(undefined);
        setActiveCounterTargetChoice(undefined);
        setErrors([]);
      } catch (error) {
        setErrors([error instanceof Error ? error.message : String(error)]);
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
      selectedCardInstanceId,
      submitDecisionDraft,
    ],
  );
  useEffect(() => {
    if (
      pendingDecision === undefined ||
      automaticPayCostActionIndex === undefined ||
      actionInFlight ||
      autoSubmittedPayCostDecisionId.current === String(pendingDecision.id)
    ) {
      return;
    }
    autoSubmittedPayCostDecisionId.current = String(pendingDecision.id);
    void submitAction(automaticPayCostActionIndex);
  }, [
    actionInFlight,
    automaticPayCostActionIndex,
    pendingDecision,
    submitAction,
  ]);
  const selectCard = useCallback(
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
      if (isSelectableCostAreaDon(board, instanceId)) {
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
      board,
      pendingDecision,
      pendingDecisionInteractionMode,
      modalResponseActions,
      selectedDonInstanceIds.length,
      submitAction,
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

  const cardActions = useCallback(
    (instanceId: string): ClientActionModel[] => {
      const base = board?.actionsByCardInstanceId[instanceId] ?? [];
      const collapsedActions = createCollapsedCounterActions(
        createCollapsedAttackActions(base),
      );
      if (
        selectedCardInstanceId === instanceId &&
        isSelfAttachmentTarget(board, instanceId)
      ) {
        const attachAction = selectedDonAttachmentMenuAction(
          selectedDonInstanceIds,
        );
        return attachAction === undefined
          ? collapsedActions
          : [...collapsedActions, attachAction];
      }
      return collapsedActions;
    },
    [board, selectedCardInstanceId, selectedDonInstanceIds],
  );

  const globalActions = useCallback((): ClientActionModel[] => {
    if (playerSnapshot === undefined) {
      return [];
    }
    if (activeAttackTargetChoice !== undefined) {
      return [
        {
          index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
          label: "Cancel attack",
          type: "clearDecisionSelection",
        },
      ];
    }
    if (activeCounterTargetChoice !== undefined) {
      return [
        {
          index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
          label: "Cancel counter",
          type: "clearDecisionSelection",
        },
      ];
    }
    if (
      activeCardCostGroup !== undefined &&
      optionalCardCostChoice !== undefined
    ) {
      const actions: ClientActionModel[] = [
        {
          index: optionalCardCostChoice.declineActionIndex,
          label: "Decline cost",
          type: "respondToDecision",
        },
      ];
      if (explicitCardCostChoiceActive) {
        actions.push({
          index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
          label: "Cancel card choice",
          type: "clearDecisionSelection",
        });
      }
      return actions;
    }
    if (
      pendingDecisionInteractionMode === "zoneClick" &&
      pendingDecision !== undefined &&
      (pendingDecision.type === "selectCards" ||
        pendingDecision.type === "selectTargets")
    ) {
      const actions: ClientActionModel[] = [];
      if (pendingDecision.min === 0) {
        actions.push({
          index: CHOOSE_NO_DECISION_CARDS_ACTION_INDEX,
          label: chooseNoDecisionLabel(pendingDecision),
          type: "chooseNoDecisionCards",
        });
      }
      if (
        pendingDecision.max > 1 &&
        activeDecisionDraft?.kind === "selectCards" &&
        activeDecisionDraft.selectedInstanceIds.length >= pendingDecision.min
      ) {
        actions.push({
          index: CONFIRM_DECISION_SELECTION_ACTION_INDEX,
          label: "Confirm selection",
          type: "confirmDecisionSelection",
        });
        if (activeDecisionDraft.selectedInstanceIds.length > 0) {
          actions.push({
            index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
            label: "Clear selection",
            type: "clearDecisionSelection",
          });
        }
      }
      return actions;
    }
    const globalActions = playerSnapshot.actions
      .filter((action) => action.placement === undefined)
      .map((action) => ({
        index: action.index,
        label: action.label,
        type: action.type,
      }));
    return pendingDecision?.type === "payCost"
      ? (createCanonicalDonPaymentActions(globalActions) ?? globalActions)
      : globalActions;
  }, [
    activeDecisionDraft,
    activeAttackTargetChoice,
    activeCounterTargetChoice,
    activeCardCostGroup,
    explicitCardCostChoiceActive,
    optionalCardCostChoice,
    pendingDecision,
    pendingDecisionInteractionMode,
    playerSnapshot,
  ]);

  const toggleDecisionCard = useCallback(
    (instanceId: InstanceId): void => {
      if (
        activeCardCostGroup !== undefined &&
        activeCardCostGroup.requiredCount > 1
      ) {
        if (
          !optionalCardCostInstanceIds(activeCardCostGroup).includes(
            String(instanceId),
          )
        ) {
          return;
        }
        setActiveCardCostSelectedInstanceIds((selected) =>
          toggleCardCostSelectedInstanceId(
            selected,
            String(instanceId),
            activeCardCostGroup.requiredCount,
          ),
        );
        return;
      }
      if (
        pendingDecision?.type !== "selectCards" &&
        pendingDecision?.type !== "selectTargets"
      ) {
        return;
      }
      setDecisionDraft((draft) =>
        toggleDecisionSelectedCard(
          pendingDecision,
          draft?.decisionId === pendingDecision.id
            ? draft
            : createDecisionDraft(pendingDecision, modalResponseActions),
          instanceId,
        ),
      );
    },
    [activeCardCostGroup, modalResponseActions, pendingDecision],
  );

  const moveDecisionCard = useCallback(
    (
      draggedId: InstanceId,
      targetId: InstanceId,
      placement: "before" | "after",
    ): void => {
      if (pendingDecision?.type !== "orderCards") {
        return;
      }
      setDecisionDraft((draft) =>
        moveOrderedCardNear(
          pendingDecision,
          draft?.decisionId === pendingDecision.id
            ? draft
            : createDecisionDraft(pendingDecision, modalResponseActions),
          draggedId,
          targetId,
          placement,
        ),
      );
    },
    [modalResponseActions, pendingDecision],
  );

  const setDecisionQuantityValue = useCallback(
    (quantity: number): void => {
      if (pendingDecision === undefined) {
        return;
      }
      setDecisionDraft((draft) =>
        setDecisionQuantity(
          draft ?? createDecisionDraft(pendingDecision),
          quantity,
        ),
      );
    },
    [pendingDecision],
  );

  const setDecisionOptionValue = useCallback(
    (option: string): void => {
      if (pendingDecision === undefined) {
        return;
      }
      setDecisionDraft((draft) =>
        setDecisionOption(
          pendingDecision,
          draft ?? createDecisionDraft(pendingDecision, modalResponseActions),
          option,
        ),
      );
    },
    [modalResponseActions, pendingDecision],
  );

  const setDecisionActionOptionValue = useCallback(
    (actionIndex: number): void => {
      if (pendingDecision === undefined) {
        return;
      }
      setDecisionDraft((draft) =>
        setDecisionActionOption(
          draft ?? createDecisionDraft(pendingDecision, modalResponseActions),
          actionIndex,
        ),
      );
    },
    [modalResponseActions, pendingDecision],
  );

  const chooseDecisionTriggerValue = useCallback(
    (triggerId: string): void => {
      if (pendingDecision?.type !== "chooseTriggerOrder") {
        return;
      }
      setDecisionDraft((draft) =>
        chooseDecisionTrigger(
          pendingDecision,
          draft?.decisionId === pendingDecision.id
            ? draft
            : createDecisionDraft(pendingDecision, modalResponseActions),
          triggerId,
        ),
      );
    },
    [modalResponseActions, pendingDecision],
  );

  return {
    state: {
      ...(clientState === undefined ? {} : { clientState }),
      ...(board === undefined ? {} : { board }),
      ...(selectedCardInstanceId === undefined
        ? {}
        : { selectedCardInstanceId }),
      selectedDonInstanceIds,
      ...(activeDecisionDraft === undefined
        ? {}
        : { decisionDraft: activeDecisionDraft }),
      ...(decisionModal === undefined ? {} : { decisionModal }),
      ...(activeCardCostSelection === undefined
        ? {}
        : { cardCostSelection: activeCardCostSelection }),
      pendingChoiceInstanceIds,
      decisionSelectedInstanceIds,
      actionInFlight,
      errors: visibleErrors(errors),
    },
    currentPlayerId,
    cardActions,
    globalActions,
    selectCard,
    submitAction,
    toggleDecisionCard,
    moveDecisionCard,
    setDecisionQuantityValue,
    setDecisionOptionValue,
    setDecisionActionOptionValue,
    chooseDecisionTriggerValue,
    confirmDecision,
    createNewMatch,
  };
};
