import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import { useMatchVisualSettings } from "./match-visual-settings-context.js";

export interface SettingsWindowProps {
  className?: string | undefined;
  docked?: boolean | undefined;
  initialRect?: WindowRect | undefined;
  zIndex?: number | undefined;
  onClose: () => void;
  onActivate?: (() => void) | undefined;
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
    confirmAttachDon,
    confirmEndTurn,
    quickPayActivateMainCosts,
    reducedMotion,
    soundVolume,
    zoneBackgroundVisibility,
    zoneGuideVisibility,
    setBackgroundImageUrl,
    setConfirmAttachDon,
    setConfirmEndTurn,
    setQuickPayActivateMainCosts,
    setReducedMotion,
    setSoundVolume,
    setZoneBackgroundVisibility,
    setZoneGuideVisibility,
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
      <label className="settings-field">
        <span>Sound volume</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={soundVolume}
          onChange={(event) => {
            setSoundVolume(event.currentTarget.valueAsNumber);
          }}
        />
      </label>
      <label className="settings-field">
        <span>Zone guide visibility</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={zoneGuideVisibility}
          onChange={(event) => {
            setZoneGuideVisibility(event.currentTarget.valueAsNumber);
          }}
        />
      </label>
      <label className="settings-field">
        <span>Zone background visibility</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={zoneBackgroundVisibility}
          onChange={(event) => {
            setZoneBackgroundVisibility(event.currentTarget.valueAsNumber);
          }}
        />
      </label>
      <label className="settings-checkbox-field">
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(event) => {
            setReducedMotion(event.currentTarget.checked);
          }}
        />
        <span>Reduced motion</span>
      </label>
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
      <label className="settings-checkbox-field">
        <input
          type="checkbox"
          checked={confirmAttachDon}
          onChange={(event) => {
            setConfirmAttachDon(event.currentTarget.checked);
          }}
        />
        <span>Confirm attach DON</span>
      </label>
      <label className="settings-checkbox-field">
        <input
          type="checkbox"
          checked={confirmEndTurn}
          onChange={(event) => {
            setConfirmEndTurn(event.currentTarget.checked);
          }}
        />
        <span>Confirm end turn</span>
      </label>
    </div>
  );
};

export const SettingsWindow = ({
  className,
  docked = false,
  initialRect = defaultSettingsWindowRect,
  zIndex,
  onClose,
  onActivate,
  onRectChange,
  onDragMove,
  onDragEnd,
}: SettingsWindowProps): React.JSX.Element => (
  <FloatingWindow
    title="Settings"
    className={["settings-window", className ?? ""].filter(Boolean).join(" ")}
    initialRect={initialRect}
    minWidth={190}
    minHeight={110}
    docked={docked}
    zIndex={zIndex}
    onClose={onClose}
    onActivate={onActivate}
    onRectChange={onRectChange}
    onDragMove={onDragMove}
    onDragEnd={onDragEnd}
  >
    <SettingsContent />
  </FloatingWindow>
);
