import { createContext, useContext } from "react";

import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";

export interface MatchVisualSettings {
  readonly backgroundImageUrl: string;
  readonly quickPayActivateMainCosts: boolean;
  readonly setBackgroundImageUrl: (url: string) => void;
  readonly setQuickPayActivateMainCosts: (enabled: boolean) => void;
}

const noopVisualSettings: MatchVisualSettings = {
  backgroundImageUrl: "",
  quickPayActivateMainCosts: false,
  setBackgroundImageUrl: () => undefined,
  setQuickPayActivateMainCosts: () => undefined,
};

const MatchVisualSettingsContext =
  createContext<MatchVisualSettings>(noopVisualSettings);

export const MatchVisualSettingsProvider = MatchVisualSettingsContext.Provider;

export const useMatchVisualSettings = (): MatchVisualSettings =>
  useContext(MatchVisualSettingsContext);

export interface SettingsWindowProps {
  className?: string | undefined;
  docked?: boolean | undefined;
  initialRect?: WindowRect | undefined;
  onClose: () => void;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => WindowRect | undefined) | undefined;
}

export const defaultSettingsWindowRect: WindowRect = {
  x: 900,
  y: 120,
  width: 300,
  height: 220,
};

export const SettingsContent = (): React.JSX.Element => {
  const {
    backgroundImageUrl,
    quickPayActivateMainCosts,
    setBackgroundImageUrl,
    setQuickPayActivateMainCosts,
  } = useMatchVisualSettings();

  const selectBackgroundFile = (file: File | undefined): void => {
    if (file === undefined) {
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        setBackgroundImageUrl(reader.result);
      }
    });
    reader.readAsDataURL(file);
  };

  return (
    <div className="settings-window-content">
      <label className="settings-field">
        <span>Background image</span>
        <input
          type="file"
          accept="image/*,.gif"
          onChange={(event) => {
            selectBackgroundFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <button
        className="settings-secondary-button"
        type="button"
        disabled={backgroundImageUrl.length === 0}
        onClick={() => {
          setBackgroundImageUrl("");
        }}
      >
        Clear background
      </button>
      <label className="settings-checkbox-field">
        <input
          type="checkbox"
          checked={quickPayActivateMainCosts}
          onChange={(event) => {
            setQuickPayActivateMainCosts(event.currentTarget.checked);
          }}
        />
        <span>Quick pay Activate: Main costs</span>
      </label>
    </div>
  );
};

export const SettingsWindow = ({
  className,
  docked = false,
  initialRect = defaultSettingsWindowRect,
  onClose,
  onRectChange,
  onDragMove,
  onDragEnd,
}: SettingsWindowProps): React.JSX.Element => (
  <FloatingWindow
    title="Settings"
    className={["settings-window", className ?? ""].filter(Boolean).join(" ")}
    initialRect={initialRect}
    minWidth={220}
    minHeight={120}
    docked={docked}
    onClose={onClose}
    onRectChange={onRectChange}
    onDragMove={onDragMove}
    onDragEnd={onDragEnd}
  >
    <SettingsContent />
  </FloatingWindow>
);
