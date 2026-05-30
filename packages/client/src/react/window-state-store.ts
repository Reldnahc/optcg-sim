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
  loadDockedWindowIds: () => Set<string>;
  saveDockedWindowIds: (windowIds: ReadonlySet<string>) => void;
  loadInfoWindowConfig: () => InfoWindowConfig;
  saveInfoWindowConfig: (config: InfoWindowConfig) => void;
}

export interface InfoWindowConfig {
  activeTabId: "preview" | "log" | "settings";
  groupedTabIds: readonly ("preview" | "log" | "settings")[];
}

const keyPrefix = "optcg:client:reveal-window-state";
const windowRectsKeyPrefix = "optcg:client:floating-window-rects";
const openWindowsKeyPrefix = "optcg:client:open-floating-windows";
const dockedWindowsKeyPrefix = "optcg:client:docked-floating-windows";
const infoWindowConfigKeyPrefix = "optcg:client:info-window-config";

const defaultInfoWindowConfig: InfoWindowConfig = {
  activeTabId: "preview",
  groupedTabIds: [],
};

const allInfoWindowTabIds = ["preview", "log", "settings"] as const;

const isInfoWindowTabId = (
  value: unknown,
): value is (typeof allInfoWindowTabIds)[number] =>
  value === "preview" || value === "log" || value === "settings";

const setKey = (matchId: MatchId, name: "dismissed" | "minimized"): string =>
  `${keyPrefix}:${String(matchId)}:${name}`;

const windowRectsKey = (matchId: MatchId): string =>
  `${windowRectsKeyPrefix}:${String(matchId)}`;

const openWindowsKey = (matchId: MatchId): string =>
  `${openWindowsKeyPrefix}:${String(matchId)}`;

const dockedWindowsKey = (matchId: MatchId): string =>
  `${dockedWindowsKeyPrefix}:${String(matchId)}`;

const infoWindowConfigKey = (matchId: MatchId): string =>
  `${infoWindowConfigKeyPrefix}:${String(matchId)}`;

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

const isInfoWindowConfig = (value: unknown): value is InfoWindowConfig => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<Record<keyof InfoWindowConfig, unknown>>;
  return (
    isInfoWindowTabId(candidate.activeTabId) &&
    Array.isArray(candidate.groupedTabIds) &&
    candidate.groupedTabIds.every(isInfoWindowTabId)
  );
};

const parseInfoWindowConfig = (value: string | null): InfoWindowConfig => {
  if (value === null) {
    return defaultInfoWindowConfig;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isInfoWindowConfig(parsed)) {
      return {
        activeTabId: parsed.activeTabId,
        groupedTabIds: [
          ...new Set(
            parsed.groupedTabIds.filter((tabId) =>
              allInfoWindowTabIds.includes(tabId),
            ),
          ),
        ],
      };
    }
    if (typeof parsed === "object" && parsed !== null) {
      const candidate = parsed as {
        activeTabId?: unknown;
        grouped?: unknown;
      };
      if (
        isInfoWindowTabId(candidate.activeTabId) &&
        typeof candidate.grouped === "boolean"
      ) {
        return {
          activeTabId: candidate.activeTabId,
          groupedTabIds: candidate.grouped ? [...allInfoWindowTabIds] : [],
        };
      }
    }
    return defaultInfoWindowConfig;
  } catch {
    return defaultInfoWindowConfig;
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
  loadDockedWindowIds() {
    return loadSet(storage, dockedWindowsKey(matchId));
  },
  saveDockedWindowIds(windowIds) {
    saveSet(storage, dockedWindowsKey(matchId), windowIds);
  },
  loadInfoWindowConfig() {
    return parseInfoWindowConfig(storage.getItem(infoWindowConfigKey(matchId)));
  },
  saveInfoWindowConfig(config) {
    storage.setItem(infoWindowConfigKey(matchId), JSON.stringify(config));
  },
});
