import { useCallback, useEffect, useState } from "react";

import {
  emptyRevealWindowState,
  type RevealWindowState,
} from "./window-state-model.js";
import type { RevealWindowStateStore } from "./window-state-store.js";

export interface RevealWindowStateController {
  revealWindowState: RevealWindowState;
  activeRevealWindowState: RevealWindowState;
  updateRevealWindowState: (
    update: (state: RevealWindowState) => RevealWindowState,
  ) => void;
}

export const useRevealWindowState = ({
  matchScope,
  revealWindowStateStore,
}: {
  matchScope: string | undefined;
  revealWindowStateStore: RevealWindowStateStore | undefined;
}): RevealWindowStateController => {
  const [revealWindowState, setRevealWindowState] = useState<RevealWindowState>(
    () => emptyRevealWindowState,
  );

  useEffect(() => {
    if (matchScope === undefined || revealWindowStateStore === undefined) {
      setRevealWindowState(emptyRevealWindowState);
      return;
    }
    setRevealWindowState({
      scope: matchScope,
      dismissed: revealWindowStateStore.loadDismissedRevealIds(),
      minimized: revealWindowStateStore.loadMinimizedRevealIds(),
    });
  }, [matchScope, revealWindowStateStore]);

  const updateRevealWindowState = useCallback(
    (update: (state: RevealWindowState) => RevealWindowState): void => {
      if (matchScope === undefined) {
        return;
      }
      setRevealWindowState((current) => {
        const base =
          current.scope === matchScope ? current : emptyRevealWindowState;
        const next = update({
          scope: matchScope,
          dismissed: new Set(base.dismissed),
          minimized: new Set(base.minimized),
        });
        revealWindowStateStore?.saveDismissedRevealIds(next.dismissed);
        revealWindowStateStore?.saveMinimizedRevealIds(next.minimized);
        return next;
      });
    },
    [matchScope, revealWindowStateStore],
  );

  return {
    revealWindowState,
    activeRevealWindowState:
      matchScope !== undefined && revealWindowState.scope === matchScope
        ? revealWindowState
        : emptyRevealWindowState,
    updateRevealWindowState,
  };
};
