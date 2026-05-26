import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DecisionResponse,
  InstanceId,
  MatchId,
  PlayerId,
} from "@optcg/types";

import {
  buildDecisionResponse,
  createBoardViewModel,
  createClientSessionStore,
  createDecisionDraft,
  createDecisionModalModel,
  createDevHttpMatchTransport,
  createDevWebSocketLobbyTransport,
  createDevWebSocketMatchTransport,
  createMatchClientController,
  moveOrderedCardNear,
  setDecisionActionOption,
  setDecisionQuantity,
  setDecisionOption,
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
} from "../index.js";
import { createBrowserSessionStorage } from "./browser-storage.js";

export interface MatchClientUiState {
  clientState?: MatchClientSessionState;
  board?: BoardViewModel;
  selectedCardInstanceId?: string;
  decisionDraft?: DecisionDraft;
  decisionModal?: DecisionModalModel;
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

const modalSuppressedDecisionTypes: ReadonlySet<string> = new Set([]);

const shouldRenderDecisionModal = (decisionType: string | undefined): boolean =>
  decisionType !== undefined && !modalSuppressedDecisionTypes.has(decisionType);

export const useMatchClient = (): MatchClientUi => {
  const controller = useMemo(() => createController(), []);
  const [clientState, setClientState] = useState<
    MatchClientSessionState | undefined
  >();
  const [selectedCardInstanceId, setSelectedCardInstanceId] = useState<
    string | undefined
  >();
  const [decisionDraft, setDecisionDraft] = useState<
    DecisionDraft | undefined
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
          }));
  const activeDecisionDraft =
    pendingDecision === undefined
      ? undefined
      : decisionDraft?.decisionId === pendingDecision.id
        ? decisionDraft
        : createDecisionDraft(pendingDecision, pendingDecisionResponseActions);
  const decisionModal =
    pendingDecision === undefined ||
    activeDecisionDraft === undefined ||
    !shouldRenderDecisionModal(pendingDecision.type)
      ? undefined
      : createDecisionModalModel(
          pendingDecision,
          activeDecisionDraft,
          pendingDecisionResponseActions,
        );

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
    setDecisionDraft(undefined);
    setClientState(created);
    setErrors([]);
  }, [controller]);

  const submitAction = useCallback(
    async (actionIndex: number): Promise<void> => {
      setActionInFlight(true);
      try {
        const result = await controller.submitVisibleAction({ actionIndex });
        setClientState(result);
        setSelectedCardInstanceId(undefined);
        setDecisionDraft(undefined);
        setErrors([]);
      } catch (error) {
        setErrors([error instanceof Error ? error.message : String(error)]);
      } finally {
        setActionInFlight(false);
      }
    },
    [controller],
  );

  const confirmDecision = useCallback(async (): Promise<void> => {
    if (pendingDecision === undefined || activeDecisionDraft === undefined) {
      return;
    }
    if (activeDecisionDraft.kind === "actionOptions") {
      await submitAction(activeDecisionDraft.actionIndex);
      return;
    }
    let response: DecisionResponse;
    try {
      response = buildDecisionResponse(pendingDecision, activeDecisionDraft);
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
      setDecisionDraft(undefined);
      setErrors([]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setActionInFlight(false);
    }
  }, [activeDecisionDraft, controller, pendingDecision, submitAction]);

  const cardActions = useCallback(
    (instanceId: string): ClientActionModel[] =>
      board?.actionsByCardInstanceId[instanceId] ?? [],
    [board],
  );

  const globalActions = useCallback((): ClientActionModel[] => {
    if (playerSnapshot === undefined) {
      return [];
    }
    return playerSnapshot.actions
      .filter((action) => action.placement === undefined)
      .map((action) => ({
        index: action.index,
        label: action.label,
        type: action.type,
      }));
  }, [playerSnapshot]);

  const toggleDecisionCard = useCallback(
    (instanceId: InstanceId): void => {
      if (pendingDecision?.type !== "selectCards") {
        return;
      }
      setDecisionDraft((draft) =>
        toggleDecisionSelectedCard(
          pendingDecision,
          draft?.decisionId === pendingDecision.id
            ? draft
            : createDecisionDraft(
                pendingDecision,
                pendingDecisionResponseActions,
              ),
          instanceId,
        ),
      );
    },
    [pendingDecision, pendingDecisionResponseActions],
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
            : createDecisionDraft(
                pendingDecision,
                pendingDecisionResponseActions,
              ),
          draggedId,
          targetId,
          placement,
        ),
      );
    },
    [pendingDecision, pendingDecisionResponseActions],
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
          draft ??
            createDecisionDraft(
              pendingDecision,
              pendingDecisionResponseActions,
            ),
          option,
        ),
      );
    },
    [pendingDecision, pendingDecisionResponseActions],
  );

  const setDecisionActionOptionValue = useCallback(
    (actionIndex: number): void => {
      if (pendingDecision === undefined) {
        return;
      }
      setDecisionDraft((draft) =>
        setDecisionActionOption(
          draft ??
            createDecisionDraft(
              pendingDecision,
              pendingDecisionResponseActions,
            ),
          actionIndex,
        ),
      );
    },
    [pendingDecision, pendingDecisionResponseActions],
  );

  return {
    state: {
      ...(clientState === undefined ? {} : { clientState }),
      ...(board === undefined ? {} : { board }),
      ...(selectedCardInstanceId === undefined
        ? {}
        : { selectedCardInstanceId }),
      ...(activeDecisionDraft === undefined
        ? {}
        : { decisionDraft: activeDecisionDraft }),
      ...(decisionModal === undefined ? {} : { decisionModal }),
      actionInFlight,
      errors: visibleErrors(errors),
    },
    currentPlayerId,
    cardActions,
    globalActions,
    selectCard: setSelectedCardInstanceId,
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
