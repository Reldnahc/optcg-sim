import { useState } from "react";

import { createBrowserPersistentStorage } from "./browser-storage.js";
import type { MatchVisualSettings } from "./SettingsWindow.js";

const matchBackgroundImageStorageKey = "optcg:client:background-image-url";

const browserPersistentStorage = () =>
  typeof window === "undefined" ? undefined : createBrowserPersistentStorage();

const loadBackgroundImageUrl = (): string =>
  browserPersistentStorage()?.getItem(matchBackgroundImageStorageKey) ?? "";

export const usePersistedMatchVisualSettings = (): MatchVisualSettings => {
  const [backgroundImageUrl, setBackgroundImageUrlState] = useState(
    loadBackgroundImageUrl,
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

  return { backgroundImageUrl, setBackgroundImageUrl };
};
