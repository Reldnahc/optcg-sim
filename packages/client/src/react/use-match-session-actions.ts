import { useCallback, type Dispatch, type SetStateAction } from "react";

import type {
  AttackTargetChoice,
  CounterTargetChoice,
  DecisionDraft,
} from "../index.js";
import type {
  MatchClientController,
  MatchClientSessionState,
} from "../controller.js";
import {
  isFirstPlayerSetupClientState,
  isLobbyClientState,
  isMatchClientState,
  setLobbyLocation,
  setMatchLocation,
} from "./useMatchClient-support.js";

interface UseMatchSessionActionsInput {
  controller: MatchClientController;
  autoSubmittedPayCostDecisionId: { current: string | undefined };
  setActionInFlight: Dispatch<SetStateAction<boolean>>;
  setActiveAttackTargetChoice: Dispatch<
    SetStateAction<AttackTargetChoice | undefined>
  >;
  setActiveCardCostChoice: Dispatch<
    SetStateAction<{ decisionId: string; actionIndex: number } | undefined>
  >;
  setActiveCardCostSelectedInstanceIds: Dispatch<SetStateAction<string[]>>;
  setActiveCounterTargetChoice: Dispatch<
    SetStateAction<CounterTargetChoice | undefined>
  >;
  setClientState: Dispatch<SetStateAction<MatchClientSessionState | undefined>>;
  setDecisionDraft: Dispatch<SetStateAction<DecisionDraft | undefined>>;
  setErrors: Dispatch<SetStateAction<string[]>>;
  setSelectedCardInstanceId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedDonInstanceIds: Dispatch<SetStateAction<string[]>>;
}

export const useMatchSessionActions = ({
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
}: UseMatchSessionActionsInput): {
  createNewMatch: () => Promise<void>;
  chooseFirstPlayer: (choice: "goFirst" | "goSecond") => Promise<void>;
  requestRematch: () => Promise<void>;
} => {
  const resetLocalInteractionState = useCallback((): void => {
    setSelectedCardInstanceId(undefined);
    setSelectedDonInstanceIds([]);
    setDecisionDraft(undefined);
    setActiveCardCostChoice(undefined);
    setActiveCardCostSelectedInstanceIds([]);
    setActiveAttackTargetChoice(undefined);
    setActiveCounterTargetChoice(undefined);
    autoSubmittedPayCostDecisionId.current = undefined;
  }, [
    autoSubmittedPayCostDecisionId,
    setActiveAttackTargetChoice,
    setActiveCardCostChoice,
    setActiveCardCostSelectedInstanceIds,
    setActiveCounterTargetChoice,
    setDecisionDraft,
    setSelectedCardInstanceId,
    setSelectedDonInstanceIds,
  ]);

  const createNewMatch = useCallback(async (): Promise<void> => {
    const created = await controller.startNewLocalLobby();
    if (isMatchClientState(created) || isFirstPlayerSetupClientState(created)) {
      setMatchLocation(created.matchId);
    } else if (isLobbyClientState(created)) {
      setLobbyLocation(created.lobbyId);
    }
    resetLocalInteractionState();
    setClientState(created);
    setErrors([]);
  }, [controller, resetLocalInteractionState, setClientState, setErrors]);

  const chooseFirstPlayer = useCallback(
    async (choice: "goFirst" | "goSecond"): Promise<void> => {
      setActionInFlight(true);
      try {
        const result = await controller.chooseFirstPlayer({ choice });
        setMatchLocation(result.matchId);
        setClientState(result);
        setErrors([]);
      } catch (error) {
        setErrors([error instanceof Error ? error.message : String(error)]);
      } finally {
        setActionInFlight(false);
      }
    },
    [controller, setActionInFlight, setClientState, setErrors],
  );

  const requestRematch = useCallback(async (): Promise<void> => {
    setActionInFlight(true);
    try {
      const result = await controller.requestRematch();
      if (isMatchClientState(result) || isFirstPlayerSetupClientState(result)) {
        setMatchLocation(result.matchId);
      } else if (isLobbyClientState(result)) {
        setLobbyLocation(result.lobbyId);
      }
      resetLocalInteractionState();
      setClientState(result);
      setErrors([]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setActionInFlight(false);
    }
  }, [
    controller,
    resetLocalInteractionState,
    setActionInFlight,
    setClientState,
    setErrors,
  ]);

  return { createNewMatch, chooseFirstPlayer, requestRematch };
};
