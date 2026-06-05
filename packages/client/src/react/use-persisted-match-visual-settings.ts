import { useState } from "react";

import { createBrowserPersistentStorage } from "./browser-storage.js";
import type { MatchVisualSettings } from "./SettingsWindow.js";

const matchBackgroundImageStorageKey = "optcg:client:background-image-url";
const confirmEndTurnStorageKey = "optcg:client:confirm-end-turn";
const quickPayActivateMainCostsStorageKey =
  "optcg:client:quick-pay-activate-main-costs";

const browserPersistentStorage = () =>
  typeof window === "undefined" ? undefined : createBrowserPersistentStorage();

const loadBackgroundImageUrl = (): string =>
  browserPersistentStorage()?.getItem(matchBackgroundImageStorageKey) ?? "";

const loadQuickPayActivateMainCosts = (): boolean =>
  browserPersistentStorage()?.getItem(quickPayActivateMainCostsStorageKey) ===
  "true";

const loadConfirmEndTurn = (): boolean =>
  browserPersistentStorage()?.getItem(confirmEndTurnStorageKey) === "true";

export const usePersistedMatchVisualSettings = (): MatchVisualSettings => {
  const [backgroundImageUrl, setBackgroundImageUrlState] = useState(
    loadBackgroundImageUrl,
  );
  const [confirmEndTurn, setConfirmEndTurnState] = useState(loadConfirmEndTurn);
  const [quickPayActivateMainCosts, setQuickPayActivateMainCostsState] =
    useState(loadQuickPayActivateMainCosts);

  const setBackgroundImageUrl = (url: string): void => {
    const trimmedUrl = url.trim();
    setBackgroundImageUrlState(trimmedUrl);
    const storage = browserPersistentStorage();
    if (storage === undefined) {
      return;
    }
    if (trimmedUrl.length === 0) {
      storage.removeItem(matchBackgroundImageStorageKey);
      return;
    }
    storage.setItem(matchBackgroundImageStorageKey, trimmedUrl);
  };

  const setConfirmEndTurn = (enabled: boolean): void => {
    setConfirmEndTurnState(enabled);
    const storage = browserPersistentStorage();
    if (storage === undefined) {
      return;
    }
    storage.setItem(confirmEndTurnStorageKey, enabled ? "true" : "false");
  };

  const setQuickPayActivateMainCosts = (enabled: boolean): void => {
    setQuickPayActivateMainCostsState(enabled);
    const storage = browserPersistentStorage();
    if (storage === undefined) {
      return;
    }
    storage.setItem(
      quickPayActivateMainCostsStorageKey,
      enabled ? "true" : "false",
    );
  };

  return {
    backgroundImageUrl,
    confirmEndTurn,
    quickPayActivateMainCosts,
    setBackgroundImageUrl,
    setConfirmEndTurn,
    setQuickPayActivateMainCosts,
  };
};
