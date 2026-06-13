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

const colorSwatches = [
  "#0d0d0e",
  "#222224",
  "#17150d",
  "#1f2933",
  "#2d1b1b",
  "#10251b",
] as const;

const ColorSelector = ({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): React.JSX.Element => (
  <div className="settings-color-field">
    <span>{label}</span>
    <div className="settings-color-selector">
      <div className="settings-color-swatches" aria-label={`${label} presets`}>
        {colorSwatches.map((color) => (
          <button
            key={color}
            type="button"
            className={[
              "settings-color-swatch",
              value.toLowerCase() === color ? "is-selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ backgroundColor: color }}
            aria-label={`${label} ${color}`}
            aria-pressed={value.toLowerCase() === color}
            onClick={() => {
              onChange(color);
            }}
          />
        ))}
      </div>
      <input
        type="text"
        inputMode="text"
        pattern="#[0-9a-fA-F]{6}"
        value={value}
        aria-label={label}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
    </div>
  </div>
);

export const SettingsContent = (): React.JSX.Element => {
  const {
    backgroundImageUrl,
    confirmAttachDon,
    confirmEndTurn,
    quickPayActivateMainCosts,
    reducedMotion,
    soundVolume,
    windowColor,
    windowOpacity,
    playmatColor,
    playmatOpacity,
    zoneBackgroundVisibility,
    zoneGuideVisibility,
    setBackgroundImageUrl,
    setConfirmAttachDon,
    setConfirmEndTurn,
    setQuickPayActivateMainCosts,
    setReducedMotion,
    setSoundVolume,
    setWindowColor,
    setWindowOpacity,
    setPlaymatColor,
    setPlaymatOpacity,
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
      <section className="settings-surface-group" aria-label="Windows">
        <h3>Windows</h3>
        <label className="settings-field">
          <span>Window opacity</span>
          <input
            type="range"
            min="50"
            max="100"
            step="1"
            value={windowOpacity}
            onChange={(event) => {
              setWindowOpacity(event.currentTarget.valueAsNumber);
            }}
          />
        </label>
        <ColorSelector
          label="Window color"
          value={windowColor}
          onChange={setWindowColor}
        />
      </section>
      <section className="settings-surface-group" aria-label="Playmat">
        <h3>Playmat</h3>
        <label className="settings-field">
          <span>Playmat opacity</span>
          <input
            type="range"
            min="50"
            max="100"
            step="1"
            value={playmatOpacity}
            onChange={(event) => {
              setPlaymatOpacity(event.currentTarget.valueAsNumber);
            }}
          />
        </label>
        <ColorSelector
          label="Playmat color"
          value={playmatColor}
          onChange={setPlaymatColor}
        />
      </section>
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
