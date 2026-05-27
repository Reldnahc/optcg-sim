import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DecisionResponse,
  InstanceId,
  MatchId,
  PlayerId,
} from "@optcg/types";

import {
  attackTargetActionForInstance,
  attackTargetInstanceIds,
  ATTACK_TARGET_CHOICE_ACTION_INDEX,
  buildDecisionResponse,
  createBoardViewModel,
  createClientSessionStore,
  createDecisionDraft,
  createDecisionModalModel,
  getPendingDecisionInteractionMode,
  isDecisionModalSuppressed,
  createDevHttpMatchTransport,
  createDevWebSocketLobbyTransport,
  createDevWebSocketMatchTransport,
  ATTACH_SELECTED_DON_ACTION_INDEX,
  findAttachDonActionIndex,
  createOptionalCardCostChoice,
  createOptionalCardCostModalActions,
  isSelectableCostAreaDon,
  optionalCardCostActionForInstance,
  optionalCardCostGroupForActionIndex,
  optionalCardCostInstanceIds,
  createMatchClientController,
  createAttackTargetChoice,
  createCollapsedAttackActions,
  counterTargetActionForInstance,
  counterTargetInstanceIds,
  COUNTER_TARGET_CHOICE_ACTION_INDEX,
  createCollapsedCounterActions,
  createCounterTargetChoice,
  selectedDonAttachmentMenuAction,
  moveOrderedCardNear,
  setDecisionActionOption,
  setDecisionQuantity,
  setDecisionOption,
  toggleSelectedDonInstanceId,
  toggleDecisionSelectedCard,
} from "../index.js";
import type {
  BoardViewModel,
  ClientActionModel,
  DecisionDraft,
  DecisionModalModel,
  MatchClientController,
  MatchClientState,
  MatchClientSessionState,
  AttackTargetChoice,
  CounterTargetChoice,
} from "../index.js";
import { createBrowserSessionStorage } from "./browser-storage.js";

export interface MatchClientUiState {
  clientState?: MatchClientSessionState;
  board?: BoardViewModel;
  selectedCardInstanceId?: string;
  selectedDonInstanceIds: string[];
  decisionDraft?: DecisionDraft;
  decisionModal?: DecisionModalModel;
  pendingChoiceInstanceIds: string[];
  decisionSelectedInstanceIds: string[];
  actionInFlight: boolean;
  errors: string[];
}

export interface MatchClientUi {
  state: MatchClientUiState;
  currentPlayerId?: PlayerId | undefined;
  cardActions: (instanceId: string) => ClientActionModel[];
  globalActions: () => ClientActionModel[];
  selectCard: (instanceId: string | undefined) => void;
  submitAction: (actionIndex: number) => Promise<void>;
  toggleDecisionCard: (instanceId: InstanceId) => void;
  moveDecisionCard: (
    draggedId: InstanceId,
    targetId: InstanceId,
    placement: "before" | "after",
  ) => void;
  setDecisionQuantityValue: (quantity: number) => void;
  setDecisionOptionValue: (option: string) => void;
  setDecisionActionOptionValue: (actionIndex: number) => void;
  confirmDecision: () => Promise<void>;
  createNewMatch: () => Promise<void>;
}

const seatIdFromUrl = (): PlayerId => {
  const value = new URL(window.location.href).searchParams.get("seat");
  return (value ?? "p1") as PlayerId;
};

const matchIdFromUrl = (): MatchId | undefined => {
  const value = new URL(window.location.href).searchParams.get("matchId");
  return value === null ? undefined : (value as MatchId);
};

const lobbyIdFromUrl = (): string | undefined => {
  const value = new URL(window.location.href).searchParams.get("lobbyId");
  return value === null ? undefined : value;
};

const setMatchLocation = (matchId: MatchId, playerId: PlayerId): void => {
  const url = new URL(window.location.href);
  url.searchParams.delete("lobbyId");
  url.searchParams.set("matchId", String(matchId));
  url.searchParams.set("seat", String(playerId));
  window.history.replaceState({}, "", url);
};

const setLobbyLocation = (lobbyId: string, playerId: PlayerId): void => {
  const url = new URL(window.location.href);
  url.searchParams.delete("matchId");
  url.searchParams.set("lobbyId", lobbyId);
  url.searchParams.set("seat", String(playerId));
  window.history.replaceState({}, "", url);
};

const isMatchClientState = (
  state: MatchClientSessionState | undefined,
): state is MatchClientState =>
  state !== undefined && "matchId" in state && "snapshot" in state;

const createController = (): MatchClientController =>
  createMatchClientController({
    transport: createDevHttpMatchTransport({ baseUrl: "" }),
    liveTransport: createDevWebSocketMatchTransport({ baseUrl: "" }),
    lobbyLiveTransport: createDevWebSocketLobbyTransport({ baseUrl: "" }),
    sessionStore: createClientSessionStore({
      storage: createBrowserSessionStorage(),
    }),
  });

const visibleErrors = (errors: readonly string[]): string[] => [...errors];

const isSelfAttachmentTarget = (
  board: BoardViewModel | undefined,
  instanceId: string,
): boolean =>
  board !== undefined &&
  (String(board.self.leader.instanceId) === instanceId ||
    board.self.characters.some(
      (card) => String(card.instanceId) === instanceId,
    ));

const zoneClickVisibleInstanceIds = (
  board: BoardViewModel | undefined,
): string[] => {
  if (board === undefined) {
    return [];
  }
  return [
    ...board.self.hand,
    board.self.leader,
    ...board.self.characters,
    ...(board.self.stage === undefined ? [] : [board.self.stage]),
    ...board.self.costArea,
    board.opponent.leader,
    ...board.opponent.characters,
    ...(board.opponent.stage === undefined ? [] : [board.opponent.stage]),
    ...board.opponent.costArea,
  ].map((card) => String(card.instanceId));
};

const decisionCandidateInstanceIds = (
  decision: NonNullable<
    MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
  >,
): string[] =>
  decision.type === "selectCards" || decision.type === "selectTargets"
    ? decision.candidates.map((candidate) => String(candidate.card.instanceId))
    : [];

const decisionHasCandidate = (
  decision: NonNullable<
    MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
  >,
  instanceId: string,
): boolean => decisionCandidateInstanceIds(decision).includes(instanceId);

const chooseNoDecisionLabel = (
  decision: NonNullable<
    MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
  >,
): string =>
  decision.type === "selectTargets" ? "Choose no target" : "Choose no card";

const CONFIRM_DECISION_SELECTION_ACTION_INDEX = -2;
const CLEAR_DECISION_SELECTION_ACTION_INDEX = -3;
const CHOOSE_NO_DECISION_CARDS_ACTION_INDEX = -4;

export const useMatchClient = (): MatchClientUi => {
  const controller = useMemo(() => createController(), []);
  const [clientState, setClientState] = useState<
    MatchClientSessionState | undefined
  >();
  const [selectedCardInstanceId, setSelectedCardInstanceId] = useState<
    string | undefined
  >();
  const [selectedDonInstanceIds, setSelectedDonInstanceIds] = useState<
    string[]
  >([]);
  const [decisionDraft, setDecisionDraft] = useState<
    DecisionDraft | undefined
  >();
  const [activeCardCostChoice, setActiveCardCostChoice] = useState<
    { decisionId: string; actionIndex: number } | undefined
  >();
  const [activeAttackTargetChoice, setActiveAttackTargetChoice] = useState<
    AttackTargetChoice | undefined
  >();
  const [activeCounterTargetChoice, setActiveCounterTargetChoice] = useState<
    CounterTargetChoice | undefined
  >();
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
  const activeCardCostGroup =
    activeCardCostChoice === undefined ||
    optionalCardCostChoice === undefined ||
    activeCardCostChoice.decisionId !==
      String(optionalCardCostChoice.decisionId)
      ? undefined
      : optionalCardCostGroupForActionIndex(
          optionalCardCostChoice,
          activeCardCostChoice.actionIndex,
        );
  const cardCostChoiceActive = activeCardCostGroup !== undefined;
  const modalResponseActions =
    optionalCardCostChoice === undefined || cardCostChoiceActive
      ? pendingDecisionResponseActions
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
    pendingDecisionInteractionMode === "zoneClick" &&
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
    setActiveAttackTargetChoice(undefined);
    setActiveCounterTargetChoice(undefined);
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
        }
        return;
      }
      if (actionIndex === CLEAR_DECISION_SELECTION_ACTION_INDEX) {
        setDecisionDraft(undefined);
        setActiveCardCostChoice(undefined);
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
        const actionIndex = optionalCardCostActionForInstance(
          activeCardCostGroup,
          instanceId,
        );
        if (actionIndex !== undefined) {
          void submitAction(actionIndex);
          return;
        }
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
    if (pendingDecision === undefined || activeDecisionDraft === undefined) {
      return;
    }
    await submitDecisionDraft(activeDecisionDraft);
  }, [activeDecisionDraft, pendingDecision, submitDecisionDraft]);

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
      return [
        {
          index: optionalCardCostChoice.declineActionIndex,
          label: "Decline cost",
          type: "respondToDecision",
        },
        {
          index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
          label: "Cancel card choice",
          type: "clearDecisionSelection",
        },
      ];
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
    return playerSnapshot.actions
      .filter((action) => action.placement === undefined)
      .map((action) => ({
        index: action.index,
        label: action.label,
        type: action.type,
      }));
  }, [
    activeDecisionDraft,
    activeAttackTargetChoice,
    activeCounterTargetChoice,
    activeCardCostGroup,
    optionalCardCostChoice,
    pendingDecision,
    pendingDecisionInteractionMode,
    playerSnapshot,
  ]);

  const toggleDecisionCard = useCallback(
    (instanceId: InstanceId): void => {
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
    [modalResponseActions, pendingDecision],
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
    confirmDecision,
    createNewMatch,
  };
};
