import { useCallback } from "react";

import type { MatchClientController } from "../controller.js";
import type { MatchClientSessionState } from "../index.js";

type ResetInteractionState = () => void;

export const useMatchRollbackActions = ({
  controller,
  resetInteractionState,
  setActionInFlight,
  setClientState,
  setErrors,
}: {
  controller: MatchClientController;
  resetInteractionState: ResetInteractionState;
  setActionInFlight: (inFlight: boolean) => void;
  setClientState: (state: MatchClientSessionState) => void;
  setErrors: (errors: string[]) => void;
}): {
  requestRollback: (rollbackPointId: string) => Promise<void>;
  cancelRollback: () => Promise<void>;
} => {
  const requestRollback = useCallback(
    async (rollbackPointId: string): Promise<void> => {
      setActionInFlight(true);
      try {
        const result = await controller.requestRollback({ rollbackPointId });
        setClientState(result);
        resetInteractionState();
        setErrors([]);
      } catch (error) {
        setErrors([error instanceof Error ? error.message : String(error)]);
      } finally {
        setActionInFlight(false);
      }
    },
    [
      controller,
      resetInteractionState,
      setActionInFlight,
      setClientState,
      setErrors,
    ],
  );

  const cancelRollback = useCallback(async (): Promise<void> => {
    setActionInFlight(true);
    try {
      const result = await controller.cancelRollback();
      setClientState(result);
      setErrors([]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setActionInFlight(false);
    }
  }, [controller, setActionInFlight, setClientState, setErrors]);

  return { requestRollback, cancelRollback };
};
