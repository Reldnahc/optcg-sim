import type { MatchId } from "@optcg/types";

import type { ClientStorage } from "../session.js";

export interface RevealWindowStateStore {
  loadDismissedRevealIds: () => Set<string>;
  saveDismissedRevealIds: (revealIds: ReadonlySet<string>) => void;
  loadMinimizedRevealIds: () => Set<string>;
  saveMinimizedRevealIds: (revealIds: ReadonlySet<string>) => void;
}

const keyPrefix = "optcg:client:reveal-window-state";

const setKey = (matchId: MatchId, name: "dismissed" | "minimized"): string =>
  `${keyPrefix}:${String(matchId)}:${name}`;

const parseStringArray = (value: string | null): string[] => {
  if (value === null) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) &&
      parsed.every((entry) => typeof entry === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
};

const loadSet = (storage: ClientStorage, key: string): Set<string> =>
  new Set(parseStringArray(storage.getItem(key)));

const saveSet = (
  storage: ClientStorage,
  key: string,
  values: ReadonlySet<string>,
): void => {
  storage.setItem(key, JSON.stringify([...values]));
};

export const createRevealWindowStateStore = ({
  storage,
  matchId,
}: {
  storage: ClientStorage;
  matchId: MatchId;
}): RevealWindowStateStore => ({
  loadDismissedRevealIds() {
    return loadSet(storage, setKey(matchId, "dismissed"));
  },
  saveDismissedRevealIds(revealIds) {
    saveSet(storage, setKey(matchId, "dismissed"), revealIds);
  },
  loadMinimizedRevealIds() {
    return loadSet(storage, setKey(matchId, "minimized"));
  },
  saveMinimizedRevealIds(revealIds) {
    saveSet(storage, setKey(matchId, "minimized"), revealIds);
  },
});
