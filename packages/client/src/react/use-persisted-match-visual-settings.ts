import { useState } from "react";

import { createBrowserPersistentStorage } from "./browser-storage.js";
import type { MatchVisualSettingsValues } from "./match-visual-settings.js";
import type { MatchVisualSettings } from "./match-visual-settings.js";
import {
  loadMatchVisualSettings,
  saveMatchVisualSetting,
} from "./match-visual-settings-store.js";

const browserPersistentStorage = () =>
  typeof window === "undefined" ? undefined : createBrowserPersistentStorage();

export const usePersistedMatchVisualSettings = (): MatchVisualSettings => {
  const [settings, setSettings] = useState<MatchVisualSettingsValues>(() =>
    loadMatchVisualSettings(browserPersistentStorage()),
  );

  return {
    ...settings,
    setBackgroundImageUrl: (url) => {
      const backgroundImageUrl = saveMatchVisualSetting(
        browserPersistentStorage(),
        "backgroundImageUrl",
        url,
      );
      setSettings((current) => ({ ...current, backgroundImageUrl }));
    },
    setConfirmAttachDon: (enabled) => {
      const confirmAttachDon = saveMatchVisualSetting(
        browserPersistentStorage(),
        "confirmAttachDon",
        enabled,
      );
      setSettings((current) => ({ ...current, confirmAttachDon }));
    },
    setConfirmEndTurn: (enabled) => {
      const confirmEndTurn = saveMatchVisualSetting(
        browserPersistentStorage(),
        "confirmEndTurn",
        enabled,
      );
      setSettings((current) => ({ ...current, confirmEndTurn }));
    },
    setQuickPayActivateMainCosts: (enabled) => {
      const quickPayActivateMainCosts = saveMatchVisualSetting(
        browserPersistentStorage(),
        "quickPayActivateMainCosts",
        enabled,
      );
      setSettings((current) => ({ ...current, quickPayActivateMainCosts }));
    },
    setReducedMotion: (enabled) => {
      const reducedMotion = saveMatchVisualSetting(
        browserPersistentStorage(),
        "reducedMotion",
        enabled,
      );
      setSettings((current) => ({ ...current, reducedMotion }));
    },
    setSoundVolume: (value) => {
      const soundVolume = saveMatchVisualSetting(
        browserPersistentStorage(),
        "soundVolume",
        value,
      );
      setSettings((current) => ({ ...current, soundVolume }));
    },
    setWindowColor: (value) => {
      const windowColor = saveMatchVisualSetting(
        browserPersistentStorage(),
        "windowColor",
        value,
      );
      setSettings((current) => ({ ...current, windowColor }));
    },
    setWindowOpacity: (value) => {
      const windowOpacity = saveMatchVisualSetting(
        browserPersistentStorage(),
        "windowOpacity",
        value,
      );
      setSettings((current) => ({ ...current, windowOpacity }));
    },
    setPlaymatColor: (value) => {
      const playmatColor = saveMatchVisualSetting(
        browserPersistentStorage(),
        "playmatColor",
        value,
      );
      setSettings((current) => ({ ...current, playmatColor }));
    },
    setPlaymatOpacity: (value) => {
      const playmatOpacity = saveMatchVisualSetting(
        browserPersistentStorage(),
        "playmatOpacity",
        value,
      );
      setSettings((current) => ({ ...current, playmatOpacity }));
    },
    setZoneBackgroundVisibility: (value) => {
      const zoneBackgroundVisibility = saveMatchVisualSetting(
        browserPersistentStorage(),
        "zoneBackgroundVisibility",
        value,
      );
      setSettings((current) => ({ ...current, zoneBackgroundVisibility }));
    },
    setZoneGuideVisibility: (value) => {
      const zoneGuideVisibility = saveMatchVisualSetting(
        browserPersistentStorage(),
        "zoneGuideVisibility",
        value,
      );
      setSettings((current) => ({ ...current, zoneGuideVisibility }));
    },
  };
};
