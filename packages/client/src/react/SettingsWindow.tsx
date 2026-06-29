import { useRef, useState } from "react";
import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import { createBrowserPersistentStorage } from "./browser-storage.js";
import {
  defaultMatchVisualSettingsValues,
  type MatchBackgroundImageFit,
  type MatchVisualSettings,
} from "./match-visual-settings.js";
import { useMatchVisualSettings } from "./match-visual-settings-context.js";
import {
  applyPersonalizationValues,
  loadColorPresets,
  loadPersonalizationLoadouts,
  personalizationValuesFromSettings,
  saveColorPreset,
  savePersonalizationLoadouts,
  type PersonalizationLoadout,
} from "./match-personalization-store.js";
import {
  ColorSelector,
  PersonalizationLoadoutManager,
  RangeField,
  SegmentedControl,
  SettingsSection,
  SettingsSubsection,
} from "./settings-window/settings-controls.js";
export { completeHexColorFromDraft } from "./settings-window/settings-controls.js";

export interface SettingsWindowProps {
  className?: string | undefined;
  docked?: boolean | undefined;
  minimized?: boolean | undefined;
  initialRect?: WindowRect | undefined;
  zIndex?: number | undefined;
  onToggleMinimized?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
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

const backgroundImageFitOptions = [
  ["crop", "Crop"],
  ["stretch", "Stretch"],
  ["fit", "Fit"],
  ["tile", "Tile"],
] as const satisfies readonly (readonly [MatchBackgroundImageFit, string])[];

const browserPersistentStorage = () =>
  typeof window === "undefined" ? undefined : createBrowserPersistentStorage();

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

const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 50;

const nextLoadoutId = (): string =>
  `style-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

const nextLoadoutName = (loadouts: readonly PersonalizationLoadout[]): string =>
  `Style ${String(loadouts.length + 1)}`;

const cropFrameSize = (zoom: number): number => {
  const normalizedZoom = Number.isFinite(zoom)
    ? Math.min(250, Math.max(100, zoom))
    : 100;
  return Math.round(54 * (100 / normalizedZoom));
};

export const SettingsContent = (): React.JSX.Element => {
  const visualSettings = useMatchVisualSettings();
  const [colorPresets, setColorPresets] = useState(() =>
    loadColorPresets(browserPersistentStorage()),
  );
  const [personalizationLoadouts, setPersonalizationLoadouts] = useState(() =>
    loadPersonalizationLoadouts(browserPersistentStorage()),
  );
  const [selectedLoadoutId, setSelectedLoadoutId] = useState("");
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

  const updateColorPreset = (index: number, color: string): void => {
    setColorPresets(saveColorPreset(browserPersistentStorage(), index, color));
  };

  const saveLoadouts = (
    loadouts: readonly PersonalizationLoadout[],
  ): PersonalizationLoadout[] => {
    const saved = savePersonalizationLoadouts(
      browserPersistentStorage(),
      loadouts,
    );
    setPersonalizationLoadouts(saved);
    return saved;
  };

  const currentPersonalizationValues = () =>
    personalizationValuesFromSettings(visualSettings);

  const applyLoadout = (id: string): void => {
    setSelectedLoadoutId(id);
    const loadout = personalizationLoadouts.find(
      (candidate) => candidate.id === id,
    );
    if (loadout === undefined) {
      return;
    }
    applyPersonalizationValues(
      browserPersistentStorage(),
      visualSettings,
      loadout.values,
    );
  };

  const saveCurrentLoadout = (): void => {
    const values = currentPersonalizationValues();
    const existing = personalizationLoadouts.find(
      (loadout) => loadout.id === selectedLoadoutId,
    );
    const nextLoadout =
      existing === undefined
        ? {
            id: nextLoadoutId(),
            name: nextLoadoutName(personalizationLoadouts),
            values,
          }
        : { ...existing, values };
    const saved = saveLoadouts(
      existing === undefined
        ? [...personalizationLoadouts, nextLoadout]
        : personalizationLoadouts.map((loadout) =>
            loadout.id === existing.id ? nextLoadout : loadout,
          ),
    );
    setSelectedLoadoutId(nextLoadout.id);
    setPersonalizationLoadouts(saved);
  };

  const createCurrentLoadout = (): void => {
    const loadout = {
      id: nextLoadoutId(),
      name: nextLoadoutName(personalizationLoadouts),
      values: currentPersonalizationValues(),
    };
    saveLoadouts([...personalizationLoadouts, loadout]);
    setSelectedLoadoutId(loadout.id);
  };

  const deleteCurrentLoadout = (): void => {
    if (selectedLoadoutId.length === 0) {
      return;
    }
    saveLoadouts(
      personalizationLoadouts.filter(
        (loadout) => loadout.id !== selectedLoadoutId,
      ),
    );
    setSelectedLoadoutId("");
  };

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
        <PersonalizationLoadoutManager
          loadouts={personalizationLoadouts}
          selectedLoadoutId={selectedLoadoutId}
          onSelect={applyLoadout}
          onSave={saveCurrentLoadout}
          onCreate={createCurrentLoadout}
          onDelete={deleteCurrentLoadout}
        />
        <SettingsSubsection title="Background">
          {hasBackgroundImage ? null : (
            <ColorSelector
              label="Background color"
              value={backgroundColor}
              presets={colorPresets}
              onChange={setBackgroundColor}
              onPresetChange={updateColorPreset}
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
                  <RangeField
                    label="Crop zoom"
                    min={100}
                    max={250}
                    value={backgroundImageCropZoom}
                    onChange={setBackgroundImageCropZoom}
                  />
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
        </SettingsSubsection>
        <SettingsSubsection title="Windows">
          <RangeField
            label="Window opacity"
            min={50}
            max={100}
            value={windowOpacity}
            onChange={setWindowOpacity}
          />
          <ColorSelector
            label="Window color"
            value={windowColor}
            presets={colorPresets}
            onChange={setWindowColor}
            onPresetChange={updateColorPreset}
          />
        </SettingsSubsection>
        <SettingsSubsection title="Playmat">
          <RangeField
            label="Playmat opacity"
            min={50}
            max={100}
            value={playmatOpacity}
            onChange={setPlaymatOpacity}
          />
          <ColorSelector
            label="Playmat color"
            value={playmatColor}
            presets={colorPresets}
            onChange={setPlaymatColor}
            onPresetChange={updateColorPreset}
          />
        </SettingsSubsection>
        <SettingsSubsection title="Zones">
          <RangeField
            label="Zone guide visibility"
            min={0}
            max={100}
            value={zoneGuideVisibility}
            onChange={setZoneGuideVisibility}
          />
          <RangeField
            label="Zone background visibility"
            min={0}
            max={100}
            value={zoneBackgroundVisibility}
            onChange={setZoneBackgroundVisibility}
          />
        </SettingsSubsection>
      </SettingsSection>
      <SettingsSection title="Sound">
        <RangeField
          label="Sound volume"
          min={0}
          max={100}
          value={soundVolume}
          onChange={setSoundVolume}
        />
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
  minimized = false,
  initialRect = defaultSettingsWindowRect,
  zIndex,
  onToggleMinimized,
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
    minimized={minimized}
    zIndex={zIndex}
    onToggleMinimized={onToggleMinimized}
    onClose={onClose}
    onActivate={onActivate}
    onRectChange={onRectChange}
    onDragMove={onDragMove}
    onDragEnd={onDragEnd}
  >
    <SettingsContent />
  </FloatingWindow>
);
