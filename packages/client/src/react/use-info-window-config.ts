import { useCallback, useState } from "react";

import type { InfoWindowTabId } from "./InfoTabbedWindow.js";
import type {
  InfoWindowConfig,
  RevealWindowStateStore,
} from "./window-state-store.js";

const defaultInfoWindowConfig: InfoWindowConfig = {
  activeTabId: "preview",
  grouped: false,
};

export interface InfoWindowConfigControls {
  activeTabId: InfoWindowTabId;
  grouped: boolean;
  load: () => void;
  reset: () => void;
  setActiveTab: (activeTabId: InfoWindowTabId) => void;
  setGrouped: (grouped: boolean) => void;
}

export const useInfoWindowConfig = (
  store: RevealWindowStateStore | undefined,
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
  const setGrouped = useCallback(
    (grouped: boolean): void => {
      updateConfig((current) => ({ ...current, grouped }));
    },
    [updateConfig],
  );

  return {
    activeTabId: config.activeTabId,
    grouped: config.grouped,
    load,
    reset,
    setActiveTab,
    setGrouped,
  };
};
