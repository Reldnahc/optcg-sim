import { useState } from "react";

import { createBrowserPersistentStorage } from "./browser-storage.js";
import type { MatchVisualSettings } from "./SettingsWindow.js";

const matchBackgroundImageStorageKey = "optcg:client:background-image-url";
const confirmAttachDonStorageKey = "optcg:client:confirm-attach-don";
const confirmEndTurnStorageKey = "optcg:client:confirm-end-turn";
const quickPayActivateMainCostsStorageKey =
  "optcg:client:quick-pay-activate-main-costs";
const zoneGuideVisibilityStorageKey = "optcg:client:zone-guide-visibility";

const browserPersistentStorage = () =>
  typeof window === "undefined" ? undefined : createBrowserPersistentStorage();

const loadBackgroundImageUrl = (): string =>
  browserPersistentStorage()?.getItem(matchBackgroundImageStorageKey) ?? "";

const loadQuickPayActivateMainCosts = (): boolean =>
  browserPersistentStorage()?.getItem(quickPayActivateMainCostsStorageKey) ===
  "true";

const loadConfirmAttachDon = (): boolean =>
  browserPersistentStorage()?.getItem(confirmAttachDonStorageKey) !== "false";

const loadConfirmEndTurn = (): boolean =>
  browserPersistentStorage()?.getItem(confirmEndTurnStorageKey) === "true";

const clampZoneGuideVisibility = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 60;

const loadZoneGuideVisibility = (): number => {
  const stored = browserPersistentStorage()?.getItem(
    zoneGuideVisibilityStorageKey,
  );
  return stored === undefined || stored === null
    ? 60
    : clampZoneGuideVisibility(Number.parseInt(stored, 10));
};

export const usePersistedMatchVisualSettings = (): MatchVisualSettings => {
  const [backgroundImageUrl, setBackgroundImageUrlState] = useState(
    loadBackgroundImageUrl,
  );
  const [confirmAttachDon, setConfirmAttachDonState] =
    useState(loadConfirmAttachDon);
  const [confirmEndTurn, setConfirmEndTurnState] = useState(loadConfirmEndTurn);
  const [quickPayActivateMainCosts, setQuickPayActivateMainCostsState] =
    useState(loadQuickPayActivateMainCosts);
  const [zoneGuideVisibility, setZoneGuideVisibilityState] = useState(
    loadZoneGuideVisibility,
  );

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

  const setConfirmAttachDon = (enabled: boolean): void => {
    setConfirmAttachDonState(enabled);
    const storage = browserPersistentStorage();
    if (storage === undefined) {
      return;
    }
    storage.setItem(confirmAttachDonStorageKey, enabled ? "true" : "false");
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

  const setZoneGuideVisibility = (value: number): void => {
    const clampedValue = clampZoneGuideVisibility(value);
    setZoneGuideVisibilityState(clampedValue);
    const storage = browserPersistentStorage();
    if (storage === undefined) {
      return;
    }
    storage.setItem(zoneGuideVisibilityStorageKey, String(clampedValue));
  };

  return {
    backgroundImageUrl,
    confirmAttachDon,
    confirmEndTurn,
    quickPayActivateMainCosts,
    zoneGuideVisibility,
    setBackgroundImageUrl,
    setConfirmAttachDon,
    setConfirmEndTurn,
    setQuickPayActivateMainCosts,
    setZoneGuideVisibility,
  };
};
