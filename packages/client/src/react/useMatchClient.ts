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
  createMatchClientController,
  moveOrderedCardNear,
  setDecisionQuantity,
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
  confirmDecision: () => Promise<void>;
  createNewMatch: () => Promise<void>;
  refresh: () => Promise<void>;
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
    sessionStore: createClientSessionStore({
      storage: createBrowserSessionStorage(),
    }),
  });

const visibleErrors = (errors: readonly string[]): string[] => [...errors];

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
  const pendingDecision = playerSnapshot?.view.pendingDecision;
  const activeDecisionDraft =
    pendingDecision === undefined
      ? undefined
      : decisionDraft?.decisionId === pendingDecision.id
        ? decisionDraft
        : createDecisionDraft(pendingDecision);
  const decisionModal =
    pendingDecision === undefined || activeDecisionDraft === undefined
      ? undefined
      : createDecisionModalModel(pendingDecision, activeDecisionDraft);

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

  const refresh = useCallback(async (): Promise<void> => {
    const refreshed = await controller.refresh();
    if (isMatchClientState(refreshed)) {
      setMatchLocation(refreshed.matchId, refreshed.seat.playerId);
    }
    setClientState(refreshed);
  }, [controller]);

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
  }, [activeDecisionDraft, controller, pendingDecision]);

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
            : createDecisionDraft(pendingDecision),
          instanceId,
        ),
      );
    },
    [pendingDecision],
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
            : createDecisionDraft(pendingDecision),
          draggedId,
          targetId,
          placement,
        ),
      );
    },
    [pendingDecision],
  );

  const setDecisionQuantityValue = useCallback((quantity: number): void => {
    setDecisionDraft((draft) =>
      draft === undefined ? undefined : setDecisionQuantity(draft, quantity),
    );
  }, []);

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
    confirmDecision,
    createNewMatch,
    refresh,
  };
};
