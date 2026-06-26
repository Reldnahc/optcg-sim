import { useCallback, useState } from "react";

import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import type {
  InfoWindowConfig,
  WindowLayoutStore,
} from "./window-state-store.js";

const defaultInfoWindowConfig: InfoWindowConfig = {
  activeTabId: "preview",
  groupedTabIds: [],
};

export interface InfoWindowConfigControls {
  activeTabId: InfoWindowTabId;
  groupedTabIds: readonly InfoWindowTabId[];
  load: () => void;
  reset: () => void;
  setActiveTab: (activeTabId: InfoWindowTabId) => void;
  setGroupedTabIds: (groupedTabIds: readonly InfoWindowTabId[]) => void;
}

export const useInfoWindowConfig = (
  store: WindowLayoutStore | undefined,
): InfoWindowConfigControls => {
  const [config, setConfig] = useState<InfoWindowConfig>(
    () => defaultInfoWindowConfig,
  );

  const updateConfig = useCallback(
    (update: (current: InfoWindowConfig) => InfoWindowConfig): void => {
      setConfig((current) => {
        const next = update(current);
        store?.saveInfoWindowConfig(next);
        return next;
      });
    },
    [store],
  );

  const load = useCallback((): void => {
    setConfig(store?.loadInfoWindowConfig() ?? defaultInfoWindowConfig);
  }, [store]);
  const reset = useCallback((): void => {
    setConfig(defaultInfoWindowConfig);
  }, []);
  const setActiveTab = useCallback(
    (activeTabId: InfoWindowTabId): void => {
      updateConfig((current) => ({ ...current, activeTabId }));
    },
    [updateConfig],
  );
  const setGroupedTabIds = useCallback(
    (groupedTabIds: readonly InfoWindowTabId[]): void => {
      updateConfig((current) => ({ ...current, groupedTabIds }));
    },
    [updateConfig],
  );

  return {
    activeTabId: config.activeTabId,
    groupedTabIds: config.groupedTabIds,
    load,
    reset,
    setActiveTab,
    setGroupedTabIds,
  };
};
