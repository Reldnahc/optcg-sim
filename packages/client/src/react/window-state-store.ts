import type { MatchId } from "@optcg/types";

import type { ClientStorage } from "../session.js";
import type { WindowRect } from "./FloatingWindow.js";

export interface RevealWindowStateStore {
  loadDismissedRevealIds: () => Set<string>;
  saveDismissedRevealIds: (revealIds: ReadonlySet<string>) => void;
  loadMinimizedRevealIds: () => Set<string>;
  saveMinimizedRevealIds: (revealIds: ReadonlySet<string>) => void;
  loadWindowRects: () => Record<string, WindowRect>;
  saveWindowRects: (rects: Readonly<Record<string, WindowRect>>) => void;
  loadOpenWindowIds: () => Set<string>;
  saveOpenWindowIds: (windowIds: ReadonlySet<string>) => void;
}

const keyPrefix = "optcg:client:reveal-window-state";
const windowRectsKeyPrefix = "optcg:client:floating-window-rects";
const openWindowsKeyPrefix = "optcg:client:open-floating-windows";

const setKey = (matchId: MatchId, name: "dismissed" | "minimized"): string =>
  `${keyPrefix}:${String(matchId)}:${name}`;

const windowRectsKey = (matchId: MatchId): string =>
  `${windowRectsKeyPrefix}:${String(matchId)}`;

const openWindowsKey = (matchId: MatchId): string =>
  `${openWindowsKeyPrefix}:${String(matchId)}`;

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

const isWindowRect = (value: unknown): value is WindowRect => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<Record<keyof WindowRect, unknown>>;
  return (
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  );
};

const parseWindowRects = (value: string | null): Record<string, WindowRect> => {
  if (value === null) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, WindowRect] =>
        isWindowRect(entry[1]),
      ),
    );
  } catch {
    return {};
  }
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
  loadWindowRects() {
    return parseWindowRects(storage.getItem(windowRectsKey(matchId)));
  },
  saveWindowRects(rects) {
    storage.setItem(windowRectsKey(matchId), JSON.stringify(rects));
  },
  loadOpenWindowIds() {
    return loadSet(storage, openWindowsKey(matchId));
  },
  saveOpenWindowIds(windowIds) {
    saveSet(storage, openWindowsKey(matchId), windowIds);
  },
});
