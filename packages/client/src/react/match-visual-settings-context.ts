import { createContext, useContext } from "react";

import type { MatchVisualSettings } from "./match-visual-settings.js";
import { noopMatchVisualSettings } from "./match-visual-settings.js";

const MatchVisualSettingsContext = createContext<MatchVisualSettings>(
  noopMatchVisualSettings,
);

export const MatchVisualSettingsProvider = MatchVisualSettingsContext.Provider;

export const useMatchVisualSettings = (): MatchVisualSettings =>
  useContext(MatchVisualSettingsContext);
