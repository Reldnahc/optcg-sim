import { useEffect, useRef, useState } from "react";
import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import {
  defaultMatchVisualSettingsValues,
  type MatchBackgroundImageFit,
  type MatchVisualSettings,
} from "./match-visual-settings.js";
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
  "#101010",
  "#0d0d0e",
  "#222224",
  "#17150d",
  "#1f2933",
  "#2d1b1b",
  "#10251b",
] as const;

const backgroundImageFitOptions = [
  ["crop", "Crop"],
  ["stretch", "Stretch"],
  ["fit", "Fit"],
  ["tile", "Tile"],
] as const satisfies readonly (readonly [MatchBackgroundImageFit, string])[];

const fullHexColorPattern = /^#?[0-9a-fA-F]{6}$/u;

export const completeHexColorFromDraft = (
  draft: string,
): string | undefined => {
  const trimmed = draft.trim();
  if (!fullHexColorPattern.test(trimmed)) {
    return undefined;
  }
  return (trimmed.startsWith("#") ? trimmed : `#${trimmed}`).toLowerCase();
};

export const resetMatchVisualSettings = (
  settings: MatchVisualSettings,
): void => {
  settings.setBackgroundColor(defaultMatchVisualSettingsValues.backgroundColor);
  settings.setBackgroundImageUrl(
    defaultMatchVisualSettingsValues.backgroundImageUrl,
  );
  settings.setBackgroundImageFit(
    defaultMatchVisualSettingsValues.backgroundImageFit,
  );
  settings.setBackgroundImageCropZoom(
    defaultMatchVisualSettingsValues.backgroundImageCropZoom,
  );
  settings.setBackgroundImagePositionX(
    defaultMatchVisualSettingsValues.backgroundImagePositionX,
  );
  settings.setBackgroundImagePositionY(
    defaultMatchVisualSettingsValues.backgroundImagePositionY,
  );
  settings.setBackgroundMode(defaultMatchVisualSettingsValues.backgroundMode);
  settings.setConfirmAttachDon(
    defaultMatchVisualSettingsValues.confirmAttachDon,
  );
  settings.setConfirmEndTurn(defaultMatchVisualSettingsValues.confirmEndTurn);
  settings.setQuickPayActivateMainCosts(
    defaultMatchVisualSettingsValues.quickPayActivateMainCosts,
  );
  settings.setReduceDeckStackRendering(
    defaultMatchVisualSettingsValues.reduceDeckStackRendering,
  );
  settings.setReducedMotion(defaultMatchVisualSettingsValues.reducedMotion);
  settings.setSoundVolume(defaultMatchVisualSettingsValues.soundVolume);
  settings.setWindowColor(defaultMatchVisualSettingsValues.windowColor);
  settings.setWindowOpacity(defaultMatchVisualSettingsValues.windowOpacity);
  settings.setPlaymatColor(defaultMatchVisualSettingsValues.playmatColor);
  settings.setPlaymatOpacity(defaultMatchVisualSettingsValues.playmatOpacity);
  settings.setZoneBackgroundVisibility(
    defaultMatchVisualSettingsValues.zoneBackgroundVisibility,
  );
  settings.setZoneGuideVisibility(
    defaultMatchVisualSettingsValues.zoneGuideVisibility,
  );
};

const SegmentedControl = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly (readonly [T, string])[];
  readonly onChange: (value: T) => void;
}): React.JSX.Element => (
  <div className="settings-segmented-field">
    <span>{label}</span>
    <div className="settings-segmented-control" role="group" aria-label={label}>
      {options.map(([optionValue, optionLabel]) => (
        <button
          key={optionValue}
          type="button"
          className={value === optionValue ? "is-selected" : ""}
          aria-pressed={value === optionValue}
          onClick={() => {
            onChange(optionValue);
          }}
        >
          {optionLabel}
        </button>
      ))}
    </div>
  </div>
);

const ColorSelector = ({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): React.JSX.Element => {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  return (
    <div className="settings-color-field">
      <span>{label}</span>
      <div className="settings-color-selector">
        <div
          className="settings-color-swatches"
          aria-label={`${label} presets`}
        >
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
                setDraftValue(color);
                onChange(color);
              }}
            />
          ))}
        </div>
        <input
          type="text"
          inputMode="text"
          pattern="#?[0-9a-fA-F]{6}"
          maxLength={7}
          spellCheck={false}
          autoCapitalize="off"
          value={draftValue}
          aria-label={label}
          onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            setDraftValue(nextDraft);
            const completeColor = completeHexColorFromDraft(nextDraft);
            if (completeColor !== undefined) {
              onChange(completeColor);
            }
          }}
          onBlur={() => {
            setDraftValue(value);
          }}
        />
      </div>
    </div>
  );
};

const SettingsSection = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element => (
  <section className="settings-section" aria-label={title}>
    <h3>{title}</h3>
    {children}
  </section>
);

const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 50;

const cropFrameSize = (zoom: number): number => {
  const normalizedZoom = Number.isFinite(zoom)
    ? Math.min(250, Math.max(100, zoom))
    : 100;
  return Math.round(54 * (100 / normalizedZoom));
};

export const SettingsContent = (): React.JSX.Element => {
  const visualSettings = useMatchVisualSettings();
  const {
    backgroundColor,
    backgroundImageUrl,
    backgroundImageFit,
    backgroundImageCropZoom,
    backgroundImagePositionX,
    backgroundImagePositionY,
    confirmAttachDon,
    confirmEndTurn,
    quickPayActivateMainCosts,
    reduceDeckStackRendering,
    reducedMotion,
    soundVolume,
    windowColor,
    windowOpacity,
    playmatColor,
    playmatOpacity,
    zoneBackgroundVisibility,
    zoneGuideVisibility,
    setBackgroundColor,
    setBackgroundImageUrl,
    setBackgroundImageFit,
    setBackgroundImageCropZoom,
    setBackgroundImagePositionX,
    setBackgroundImagePositionY,
    setConfirmAttachDon,
    setConfirmEndTurn,
    setQuickPayActivateMainCosts,
    setReduceDeckStackRendering,
    setReducedMotion,
    setSoundVolume,
    setWindowColor,
    setWindowOpacity,
    setPlaymatColor,
    setPlaymatOpacity,
    setZoneBackgroundVisibility,
    setZoneGuideVisibility,
  } = visualSettings;
  const cropDragPointerIdRef = useRef<number | undefined>(undefined);
  const hasBackgroundImage = backgroundImageUrl.length > 0;

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
  const updateCropFocusFromPointer = (
    event: React.PointerEvent<HTMLDivElement>,
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    setBackgroundImagePositionX(
      clampPercent(((event.clientX - rect.left) / rect.width) * 100),
    );
    setBackgroundImagePositionY(
      clampPercent(((event.clientY - rect.top) / rect.height) * 100),
    );
  };
  const cropPreviewStyle = {
    backgroundColor,
    ...(backgroundImageUrl.length === 0
      ? {}
      : { backgroundImage: `url(${JSON.stringify(backgroundImageUrl)})` }),
  };
  const cropFrameStyle = {
    "--settings-crop-x": `${String(backgroundImagePositionX)}%`,
    "--settings-crop-y": `${String(backgroundImagePositionY)}%`,
    "--settings-crop-size": `${String(cropFrameSize(backgroundImageCropZoom))}%`,
  } as React.CSSProperties &
    Record<
      "--settings-crop-x" | "--settings-crop-y" | "--settings-crop-size",
      string
    >;

  return (
    <div className="settings-window-content">
      <div className="settings-window-actions">
        <button
          className="settings-secondary-button settings-reset-button"
          type="button"
          onClick={() => {
            resetMatchVisualSettings(visualSettings);
          }}
        >
          Revert to defaults
        </button>
      </div>
      <SettingsSection title="Gameplay">
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
      </SettingsSection>
      <SettingsSection title="Personalization">
        <section className="settings-surface-group" aria-label="Background">
          <h4>Background</h4>
          {hasBackgroundImage ? null : (
            <ColorSelector
              label="Background color"
              value={backgroundColor}
              onChange={setBackgroundColor}
            />
          )}
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
          {hasBackgroundImage ? (
            <>
              <SegmentedControl
                label="Image fit"
                value={backgroundImageFit}
                options={backgroundImageFitOptions}
                onChange={setBackgroundImageFit}
              />
              {backgroundImageFit === "crop" ? (
                <div className="settings-crop-helper">
                  <label className="settings-field">
                    <span>Crop zoom</span>
                    <input
                      type="range"
                      min="100"
                      max="250"
                      step="1"
                      value={backgroundImageCropZoom}
                      onChange={(event) => {
                        setBackgroundImageCropZoom(
                          event.currentTarget.valueAsNumber,
                        );
                      }}
                    />
                  </label>
                  <div
                    className="settings-crop-preview"
                    style={cropPreviewStyle}
                    role="img"
                    aria-label="Crop image focus"
                    onPointerDown={(event) => {
                      cropDragPointerIdRef.current = event.pointerId;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      updateCropFocusFromPointer(event);
                    }}
                    onPointerMove={(event) => {
                      if (cropDragPointerIdRef.current !== event.pointerId) {
                        return;
                      }
                      updateCropFocusFromPointer(event);
                    }}
                    onPointerUp={(event) => {
                      if (cropDragPointerIdRef.current === event.pointerId) {
                        cropDragPointerIdRef.current = undefined;
                      }
                    }}
                    onPointerCancel={(event) => {
                      if (cropDragPointerIdRef.current === event.pointerId) {
                        cropDragPointerIdRef.current = undefined;
                      }
                    }}
                  >
                    <div
                      className="settings-crop-frame"
                      style={cropFrameStyle}
                    />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
        <section className="settings-surface-group" aria-label="Windows">
          <h4>Windows</h4>
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
          <h4>Playmat</h4>
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
      </SettingsSection>
      <SettingsSection title="Sound">
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
      </SettingsSection>
      <SettingsSection title="Video">
        <label className="settings-checkbox-field">
          <input
            type="checkbox"
            checked={reduceDeckStackRendering}
            onChange={(event) => {
              setReduceDeckStackRendering(event.currentTarget.checked);
            }}
          />
          <span>Reduce deck stack rendering</span>
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
      </SettingsSection>
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
