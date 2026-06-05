import { useEffect, useState } from "react";

import type { ClientActionModel } from "../view-model.js";

export const endTurnConfirmationTimeoutMs = 3000;

export const isEndTurnAction = (
  action: ClientActionModel | undefined,
): boolean => action?.type === "endMainPhase";

export const endTurnConfirmationActions = (
  actions: readonly ClientActionModel[],
  confirming: boolean,
): ClientActionModel[] =>
  confirming
    ? actions.map((action) =>
        isEndTurnAction(action)
          ? { ...action, label: "Confirm end turn" }
          : action,
      )
    : [...actions];

export interface UseEndTurnConfirmationInput {
  readonly enabled: boolean;
  readonly actionAvailable: boolean;
  readonly actionInFlight: boolean;
}

export interface EndTurnConfirmation {
  readonly endTurnConfirming: boolean;
  readonly requestEndTurnConfirmation: () => boolean;
  readonly resetEndTurnConfirmation: () => void;
}

export const useEndTurnConfirmation = ({
  enabled,
  actionAvailable,
  actionInFlight,
}: UseEndTurnConfirmationInput): EndTurnConfirmation => {
  const [endTurnConfirming, setEndTurnConfirming] = useState(false);
  const disabled = !enabled || !actionAvailable || actionInFlight;

  useEffect(() => {
    if (disabled) {
      setEndTurnConfirming(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!endTurnConfirming) {
      return;
    }
    const timeoutId = globalThis.setTimeout(() => {
      setEndTurnConfirming(false);
    }, endTurnConfirmationTimeoutMs);
    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [endTurnConfirming]);

  return {
    endTurnConfirming,
    requestEndTurnConfirmation: () => {
      if (disabled) {
        return true;
      }
      if (!endTurnConfirming) {
        setEndTurnConfirming(true);
        return false;
      }
      setEndTurnConfirming(false);
      return true;
    },
    resetEndTurnConfirmation: () => {
      setEndTurnConfirming(false);
    },
  };
};
