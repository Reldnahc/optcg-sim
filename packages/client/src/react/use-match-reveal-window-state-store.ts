import { useMemo } from "react";

import type { MatchId } from "@optcg/types";

import { createBrowserPersistentStorage } from "./browser-storage.js";
import type { RevealWindowStateStore } from "./window-state-store.js";
import { createRevealWindowStateStore } from "./window-state-store.js";

export const useMatchRevealWindowStateStore = ({
  enabled,
  matchId,
}: {
  enabled: boolean;
  matchId: MatchId | undefined;
}): RevealWindowStateStore | undefined =>
  useMemo(
    () =>
      !enabled || matchId === undefined || typeof window === "undefined"
        ? undefined
        : createRevealWindowStateStore({
            storage: createBrowserPersistentStorage(),
            matchId,
          }),
    [enabled, matchId],
  );
