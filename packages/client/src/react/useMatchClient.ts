import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { InstanceId } from "@optcg/types";

import {
  createDecisionDraft,
  optionalCardCostInstanceIds,
  chooseDecisionTrigger,
  moveOrderedCardNear,
  quickPayActivateMainCostActionIndex,
  setOrderedCardsPlacementDestination,
  setDecisionActionOption,
  setDecisionQuantity,
  setDecisionOption,
  toggleDecisionSelectedCard,
} from "../index.js";
import { createPoneglyphAccountClient } from "../account-client.js";
import type {
  AccountLoadout,
  AccountSimHandoffBatchResult,
} from "../account-client.js";
import { allowsLocalRawDeckSubmissions } from "../sim-environment.js";
import type { ValidatedLobbyLoadout } from "../transport.js";
import type {
  ClientActionModel,
  DecisionDraft,
  MatchClientSessionState,
  AttackTargetChoice,
  CounterTargetChoice,
} from "../index.js";
import { createController } from "../match-client-controller-factory.js";
import {
  buildGlobalActions,
  cardActionsForInstance,
  isFirstPlayerSetupClientState,
  isHydratingMatchClientState,
  isLobbyClientState,
  isMatchClientState,
  quickPayActivateMainArmSurvivesDecision,
  setLobbyLocation,
  setMatchLocation,
  toggleCardCostSelectedInstanceId,
  useCostReset,
  visibleErrors,
  type MatchClientUi,
} from "./useMatchClient-support.js";
import { useInitialMatchClientState } from "./use-initial-match-client-state.js";
import { useMatchLiveConnections } from "./use-match-live-connections.js";
import { useMatchClientActions } from "./use-match-client-actions.js";
import { useMatchClientCardSelection } from "./use-match-client-card-selection.js";
import { createMatchClientDecisionModel } from "./use-match-client-decision-model.js";
import { useMatchRollbackActions } from "./use-match-rollback-actions.js";
import { useMatchSessionActions } from "./use-match-session-actions.js";

export interface UseMatchClientOptions {
  readonly accountSessionToken: string;
  readonly quickPayActivateMainCosts?: boolean | undefined;
}

const attachLoadoutValidation = (
  loadouts: readonly AccountLoadout[],
  handoffs: readonly AccountSimHandoffBatchResult[],
  validated: readonly ValidatedLobbyLoadout[],
): readonly AccountLoadout[] => {
  const authRejectedByLoadoutId = new Map(
    handoffs
      .filter((handoff) => handoff.status === "rejected")
      .map((handoff) => [handoff.loadoutId, handoff.error]),
  );
  const validationByLoadoutId = new Map(
    validated
      .filter((loadout) => loadout.loadoutId !== null)
      .map((loadout) => [loadout.loadoutId, loadout]),
  );
  return loadouts.map((loadout) => {
    const authError = authRejectedByLoadoutId.get(loadout.id);
    if (authError !== undefined) {
      return {
        ...loadout,
        validation: { status: "unverified", errors: [authError] },
      };
    }
    const validation = validationByLoadoutId.get(loadout.id);
    if (validation !== undefined) {
      return {
        ...loadout,
        validation: {
          status: validation.status,
          errors: validation.errors,
        },
      };
    }
    return {
      ...loadout,
      validation: {
        status: "unverified",
        errors: ["Deck validation did not return a result."],
      },
    };
  });
};

const uncheckedLocalLoadouts = (
  loadouts: readonly AccountLoadout[],
): readonly AccountLoadout[] =>
  loadouts.map((loadout) => ({
    ...loadout,
    validation: { status: "unchecked", errors: [] },
  }));

export const useMatchClient = ({
  accountSessionToken,
  quickPayActivateMainCosts = false,
}: UseMatchClientOptions): MatchClientUi => {
  const localRawDeckSubmissionsAllowed = useMemo(
    () =>
      typeof window !== "undefined" &&
      allowsLocalRawDeckSubmissions(window.location),
    [],
  );
  const controller = useMemo(
    () => createController({ accountSessionToken }),
    [accountSessionToken],
  );
  const accountClient = useMemo(() => createPoneglyphAccountClient(), []);
  const [clientState, setClientState] = useState<MatchClientSessionState>();
  const [accountLoadouts, setAccountLoadouts] = useState<
    readonly AccountLoadout[]
  >([]);
  const [accountLoadoutsStatus, setAccountLoadoutsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [accountLoadoutsError, setAccountLoadoutsError] = useState<string>();
  const [
    accountLoadoutValidationRequired,
    setAccountLoadoutValidationRequired,
  ] = useState(!localRawDeckSubmissionsAllowed);
  const accountLoadoutsRequestId = useRef(0);
  const [selectedCardInstanceId, setSelectedCardInstanceId] =
    useState<string>();
  const [selectedDonInstanceIds, setSelectedDonInstanceIds] = useState<
    string[]
  >([]);
  const [decisionDraft, setDecisionDraft] = useState<DecisionDraft>();
  const [activeCardCostChoice, setActiveCardCostChoice] = useState<{
    decisionId: string;
    actionIndex: number;
  }>();
  const [
    activeCardCostSelectedInstanceIds,
    setActiveCardCostSelectedInstanceIds,
  ] = useState<string[]>([]);
  const [activeAttackTargetChoice, setActiveAttackTargetChoice] =
    useState<AttackTargetChoice>();
  const [activeCounterTargetChoice, setActiveCounterTargetChoice] =
    useState<CounterTargetChoice>();
  const autoSubmittedPayCostDecisionId = useRef<string | undefined>(undefined);
  const quickPayActivateMainArmed = useRef(false);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const currentPlayerId = clientState?.seat.playerId;
  const playerSnapshot =
    currentPlayerId === undefined || !isMatchClientState(clientState)
      ? undefined
      : clientState.snapshot.players[currentPlayerId];
  const pendingDecision = playerSnapshot?.view.pendingDecision;
  const liveConnectionKey =
    isMatchClientState(clientState) ||
    isHydratingMatchClientState(clientState) ||
    isFirstPlayerSetupClientState(clientState)
      ? `${String(clientState.matchId)}:${String(clientState.seat.playerId)}`
      : undefined;
  const lobbyConnectionKey =
    clientState === undefined || !isLobbyClientState(clientState)
      ? undefined
      : `${clientState.lobbyId}:${String(clientState.seat.playerId)}`;
  const decisionModel = createMatchClientDecisionModel({
    clientState,
    playerSnapshot,
    pendingDecision,
    activeAttackTargetChoice,
    activeCounterTargetChoice,
    activeCardCostChoice,
    activeCardCostSelectedInstanceIds,
    decisionDraft,
  });
  const {
    activeCardCostGroup,
    activeCardCostSelection,
    activeDecisionDraft,
    automaticPayCostActionIndex,
    board,
    decisionModal,
    decisionPrompt,
    decisionSelectedInstanceIds,
    explicitCardCostChoiceActive,
    modalResponseActions,
    optionalCardCostChoice,
    pendingDecisionResponseActions,
    pendingChoiceInstanceIds,
    pendingDecisionInteractionMode,
    selectedCardCostActionIndex,
  } = decisionModel;

  useInitialMatchClientState({ controller, setClientState, setErrors });

  useCostReset(
    optionalCardCostChoice?.decisionId,
    activeCardCostGroup,
    setActiveCardCostSelectedInstanceIds,
  );

  useMatchLiveConnections({
    controller,
    liveConnectionKey,
    lobbyConnectionKey,
    setClientState,
    setErrors,
  });

  const { createNewMatch, chooseFirstPlayer, requestRematch } =
    useMatchSessionActions({
      controller,
      autoSubmittedPayCostDecisionId,
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
    });

  const refreshAccountLoadouts = useCallback((): void => {
    if (!isLobbyClientState(clientState)) {
      setAccountLoadouts([]);
      setAccountLoadoutsStatus("idle");
      setAccountLoadoutsError(undefined);
      setAccountLoadoutValidationRequired(!localRawDeckSubmissionsAllowed);
      return;
    }
    const requestId = accountLoadoutsRequestId.current + 1;
    const lobbyId = clientState.lobbyId;
    accountLoadoutsRequestId.current = requestId;
    setAccountLoadoutsStatus("loading");
    setAccountLoadoutsError(undefined);
    void accountClient
      .listLoadouts()
      .then(async (loadouts) => {
        if (accountLoadoutsRequestId.current !== requestId) {
          return;
        }
        const validationRequired = !localRawDeckSubmissionsAllowed;
        setAccountLoadoutValidationRequired(validationRequired);
        if (!validationRequired) {
          setAccountLoadouts(uncheckedLocalLoadouts(loadouts));
          setAccountLoadoutsStatus("ready");
          return;
        }
        const handoffs = await accountClient.createSimHandoffs({
          loadoutIds: loadouts.map((loadout) => loadout.id),
          lobbyId,
        });
        const createdTokens = handoffs.flatMap((handoff) =>
          handoff.status === "created" ? [handoff.token] : [],
        );
        const validated =
          createdTokens.length === 0
            ? []
            : (
                await controller.validateLobbyLoadouts({
                  handoffTokens: createdTokens,
                })
              ).data.loadouts;
        if (accountLoadoutsRequestId.current !== requestId) {
          return;
        }
        setAccountLoadouts(
          attachLoadoutValidation(loadouts, handoffs, validated),
        );
        setAccountLoadoutsStatus("ready");
      })
      .catch((error: unknown) => {
        if (accountLoadoutsRequestId.current !== requestId) {
          return;
        }
        setAccountLoadouts([]);
        setAccountLoadoutsStatus("error");
        setAccountLoadoutsError(
          error instanceof Error ? error.message : String(error),
        );
      });
  }, [accountClient, clientState, controller, localRawDeckSubmissionsAllowed]);

  useEffect(() => {
    if (!isLobbyClientState(clientState)) {
      accountLoadoutsRequestId.current += 1;
      setAccountLoadouts([]);
      setAccountLoadoutsStatus("idle");
      setAccountLoadoutsError(undefined);
      return;
    }
    refreshAccountLoadouts();
    return () => {
      accountLoadoutsRequestId.current += 1;
    };
  }, [clientState, lobbyConnectionKey, refreshAccountLoadouts]);

  const submitLobbyLoadout = useCallback(
    async (loadoutId: string): Promise<void> => {
      if (!isLobbyClientState(clientState)) {
        setErrors(["Cannot submit a loadout before joining a lobby."]);
        return;
      }
      setActionInFlight(true);
      try {
        const selectedLoadout = accountLoadouts.find(
          (loadout) => loadout.id === loadoutId,
        );
        if (
          !accountLoadoutValidationRequired &&
          selectedLoadout === undefined
        ) {
          setErrors(["Cannot submit a deck before choosing a loadout."]);
          return;
        }
        const result = accountLoadoutValidationRequired
          ? await accountClient
              .createSimHandoff({
                loadoutId,
                lobbyId: clientState.lobbyId,
              })
              .then((handoffToken) =>
                controller.submitLobbyLoadoutHandoff({
                  handoffToken,
                }),
              )
          : await controller.submitLobbyDeck({
              deckHash: selectedLoadout?.deckHash ?? "",
              donDeckCount: 10,
            });
        if (
          isMatchClientState(result) ||
          isFirstPlayerSetupClientState(result)
        ) {
          setMatchLocation(result.matchId);
        } else if (isLobbyClientState(result)) {
          setLobbyLocation(result.lobbyId);
        }
        setClientState(result);
        setErrors([]);
      } catch (error) {
        setErrors([error instanceof Error ? error.message : String(error)]);
      } finally {
        setActionInFlight(false);
      }
    },
    [
      accountClient,
      accountLoadoutValidationRequired,
      accountLoadouts,
      clientState,
      controller,
    ],
  );

  const resetInteractionState = useCallback((): void => {
    setSelectedCardInstanceId(undefined);
    setSelectedDonInstanceIds([]);
    setDecisionDraft(undefined);
    setActiveCardCostChoice(undefined);
    setActiveCardCostSelectedInstanceIds([]);
    setActiveAttackTargetChoice(undefined);
    setActiveCounterTargetChoice(undefined);
  }, []);

  const { requestRollback, cancelRollback } = useMatchRollbackActions({
    controller,
    resetInteractionState,
    setActionInFlight,
    setClientState,
    setErrors,
  });

  const { confirmDecision, submitAction, submitDecisionDraft } =
    useMatchClientActions({
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
      autoSubmittedPayCostDecisionId,
      legalActions: playerSnapshot?.actions ?? [],
      onVisibleActionSubmitted: (actionType) => {
        if (actionType === "activateEffect") {
          quickPayActivateMainArmed.current = true;
        }
      },
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
    });
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
  useEffect(() => {
    if (
      pendingDecision === undefined ||
      !quickPayActivateMainArmSurvivesDecision(pendingDecision)
    ) {
      quickPayActivateMainArmed.current = false;
      return;
    }
    if (pendingDecision.type === "chooseOptionalActivation") {
      return;
    }
    if (
      !quickPayActivateMainCosts ||
      actionInFlight ||
      !quickPayActivateMainArmed.current ||
      autoSubmittedPayCostDecisionId.current === String(pendingDecision.id)
    ) {
      return;
    }
    const actionIndex = quickPayActivateMainCostActionIndex(
      pendingDecision,
      pendingDecisionResponseActions,
    );
    if (actionIndex === undefined) {
      return;
    }
    autoSubmittedPayCostDecisionId.current = String(pendingDecision.id);
    void submitAction(actionIndex);
  }, [
    actionInFlight,
    pendingDecision,
    pendingDecisionResponseActions,
    quickPayActivateMainCosts,
    submitAction,
  ]);
  const selectCard = useMatchClientCardSelection({
    activeAttackTargetChoice,
    activeCounterTargetChoice,
    activeCardCostGroup,
    activeCardCostSelectedInstanceIds,
    activeDecisionDraft,
    board,
    modalResponseActions,
    pendingDecision,
    pendingDecisionInteractionMode,
    playerActions: playerSnapshot?.actions ?? [],
    selectedDonInstanceIds,
    setActiveAttackTargetChoice,
    setActiveCardCostSelectedInstanceIds,
    setActiveCounterTargetChoice,
    setDecisionDraft,
    setSelectedCardInstanceId,
    setSelectedDonInstanceIds,
    submitAction,
    submitDecisionDraft,
  });

  const cardActions = useCallback(
    (instanceId: string): ClientActionModel[] =>
      cardActionsForInstance({
        board,
        instanceId,
        selectedCardInstanceId,
        selectedDonInstanceIds,
        legalActions: playerSnapshot?.actions ?? [],
      }),
    [
      board,
      playerSnapshot?.actions,
      selectedCardInstanceId,
      selectedDonInstanceIds,
    ],
  );

  const globalActions = useCallback((): ClientActionModel[] => {
    return buildGlobalActions({
      playerSnapshot,
      attackTargetChoiceActive: activeAttackTargetChoice !== undefined,
      counterTargetChoiceActive: activeCounterTargetChoice !== undefined,
      activeCardCostGroup,
      optionalCardCostChoice,
      explicitCardCostChoiceActive,
      selectedCardCostInstanceCount: activeCardCostSelectedInstanceIds.length,
      selectedCardCostActionIndex,
      pendingDecisionInteractionMode,
      pendingDecision,
      activeDecisionDraft,
    });
  }, [
    activeDecisionDraft,
    activeAttackTargetChoice,
    activeCounterTargetChoice,
    activeCardCostGroup,
    activeCardCostSelectedInstanceIds.length,
    explicitCardCostChoiceActive,
    optionalCardCostChoice,
    pendingDecision,
    pendingDecisionInteractionMode,
    playerSnapshot,
    selectedCardCostActionIndex,
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

  const setDecisionPlacementDestination = useCallback(
    (destination: "top" | "bottom"): void => {
      if (pendingDecision?.type !== "orderCards") {
        return;
      }
      setDecisionDraft((draft) =>
        setOrderedCardsPlacementDestination(
          pendingDecision,
          draft?.decisionId === pendingDecision.id
            ? draft
            : createDecisionDraft(pendingDecision, modalResponseActions),
          destination,
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

  const submitDecisionQuantityValue = useCallback(
    async (quantity: number): Promise<void> => {
      if (pendingDecision?.type !== "chooseQuantity") {
        return;
      }
      await submitDecisionDraft(
        setDecisionQuantity(createDecisionDraft(pendingDecision), quantity),
      );
    },
    [pendingDecision, submitDecisionDraft],
  );

  const submitDecisionOptionValue = useCallback(
    async (option: string): Promise<void> => {
      if (pendingDecision === undefined) {
        return;
      }
      const draft = createDecisionDraft(pendingDecision, modalResponseActions);
      if (draft.kind !== "chooseOption") {
        return;
      }
      await submitDecisionDraft(
        setDecisionOption(pendingDecision, draft, option),
      );
    },
    [modalResponseActions, pendingDecision, submitDecisionDraft],
  );

  const submitDecisionActionOptionValue = useCallback(
    async (actionIndex: number): Promise<void> => {
      if (pendingDecision === undefined) {
        return;
      }
      const draft = createDecisionDraft(pendingDecision, modalResponseActions);
      if (draft.kind !== "actionOptions") {
        return;
      }
      await submitDecisionDraft(setDecisionActionOption(draft, actionIndex));
    },
    [modalResponseActions, pendingDecision, submitDecisionDraft],
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
      ...(decisionPrompt === undefined ? {} : { decisionPrompt }),
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
      accountLoadouts,
      accountLoadoutsStatus,
      ...(accountLoadoutsError === undefined ? {} : { accountLoadoutsError }),
      accountLoadoutValidationRequired,
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
    setDecisionPlacementDestination,
    setDecisionQuantityValue,
    setDecisionOptionValue,
    setDecisionActionOptionValue,
    submitDecisionQuantityValue,
    submitDecisionOptionValue,
    submitDecisionActionOptionValue,
    chooseDecisionTriggerValue,
    confirmDecision,
    chooseFirstPlayer,
    requestRematch,
    requestRollback,
    cancelRollback,
    createNewMatch,
    refreshAccountLoadouts,
    submitLobbyLoadout,
  };
};
