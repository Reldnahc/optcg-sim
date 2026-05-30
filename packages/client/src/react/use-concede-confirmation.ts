import { useEffect, useState } from "react";

const concedeConfirmationTimeoutMs = 3000;

export interface UseConcedeConfirmationInput {
  readonly actionAvailable: boolean;
  readonly actionInFlight: boolean;
  readonly matchActive: boolean;
}

export interface ConcedeConfirmation {
  readonly concedeDisabled: boolean;
  readonly concedeConfirming: boolean;
  readonly resetConcedeConfirmation: () => void;
  readonly requestConcedeConfirmation: () => boolean;
}

export const useConcedeConfirmation = ({
  actionAvailable,
  actionInFlight,
  matchActive,
}: UseConcedeConfirmationInput): ConcedeConfirmation => {
  const [concedeConfirming, setConcedeConfirming] = useState(false);
  const concedeDisabled = actionInFlight || !actionAvailable || !matchActive;

  useEffect(() => {
    if (!actionAvailable || concedeDisabled) {
      setConcedeConfirming(false);
    }
  }, [actionAvailable, concedeDisabled]);

  useEffect(() => {
    if (!concedeConfirming) {
      return;
    }
    const timeoutId = globalThis.setTimeout(() => {
      setConcedeConfirming(false);
    }, concedeConfirmationTimeoutMs);
    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [concedeConfirming]);

  return {
    concedeDisabled,
    concedeConfirming,
    resetConcedeConfirmation: () => {
      setConcedeConfirming(false);
    },
    requestConcedeConfirmation: () => {
      if (concedeDisabled) {
        return false;
      }
      if (!concedeConfirming) {
        setConcedeConfirming(true);
        return false;
      }
      setConcedeConfirming(false);
      return true;
    },
  };
};
