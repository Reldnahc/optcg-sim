import { useState } from "react";

import { createBrowserPersistentStorage } from "./browser-storage.js";
import type { MatchVisualSettings } from "./SettingsWindow.js";

const matchBackgroundImageStorageKey = "optcg:client:background-image-url";
const confirmAttachDonStorageKey = "optcg:client:confirm-attach-don";
const confirmEndTurnStorageKey = "optcg:client:confirm-end-turn";
const quickPayActivateMainCostsStorageKey =
  "optcg:client:quick-pay-activate-main-costs";
const zoneBackgroundVisibilityStorageKey =
  "optcg:client:zone-background-visibility";
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

const clampVisibility = (value: number, fallback: number): number =>
  Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : fallback;

const loadZoneGuideVisibility = (): number => {
  const stored = browserPersistentStorage()?.getItem(
    zoneGuideVisibilityStorageKey,
  );
  return stored === undefined || stored === null
    ? 60
    : clampVisibility(Number.parseInt(stored, 10), 60);
};

const loadZoneBackgroundVisibility = (): number => {
  const stored = browserPersistentStorage()?.getItem(
    zoneBackgroundVisibilityStorageKey,
  );
  return stored === undefined || stored === null
    ? 18
    : clampVisibility(Number.parseInt(stored, 10), 18);
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
  const [zoneBackgroundVisibility, setZoneBackgroundVisibilityState] = useState(
    loadZoneBackgroundVisibility,
  );
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
    const clampedValue = clampVisibility(value, 60);
    setZoneGuideVisibilityState(clampedValue);
    const storage = browserPersistentStorage();
    if (storage === undefined) {
      return;
    }
    storage.setItem(zoneGuideVisibilityStorageKey, String(clampedValue));
  };

  const setZoneBackgroundVisibility = (value: number): void => {
    const clampedValue = clampVisibility(value, 18);
    setZoneBackgroundVisibilityState(clampedValue);
    const storage = browserPersistentStorage();
    if (storage === undefined) {
      return;
    }
    storage.setItem(zoneBackgroundVisibilityStorageKey, String(clampedValue));
  };

  return {
    backgroundImageUrl,
    confirmAttachDon,
    confirmEndTurn,
    quickPayActivateMainCosts,
    zoneBackgroundVisibility,
    zoneGuideVisibility,
    setBackgroundImageUrl,
    setConfirmAttachDon,
    setConfirmEndTurn,
    setQuickPayActivateMainCosts,
    setZoneBackgroundVisibility,
    setZoneGuideVisibility,
  };
};
