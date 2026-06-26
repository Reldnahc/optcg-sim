import type { ClientStorage } from "../session.js";
import type {
  MatchVisualSettings,
  MatchVisualSettingsValues,
} from "./match-visual-settings.js";
import { defaultMatchVisualSettingsValues } from "./match-visual-settings.js";
import { saveMatchVisualSetting } from "./match-visual-settings-store.js";

const colorPresetsKey = "optcg:client:color-presets";
const personalizationLoadoutsKey = "optcg:client:personalization-loadouts";

export const defaultColorPresets = [
  "#101010",
  "#0d0d0e",
  "#222224",
  "#17150d",
  "#1f2933",
  "#2d1b1b",
  "#10251b",
] as const;

export interface PersonalizationValues {
  readonly backgroundColor: string;
  readonly backgroundImageUrl: string;
  readonly backgroundImageFit: MatchVisualSettingsValues["backgroundImageFit"];
  readonly backgroundImageCropZoom: number;
  readonly backgroundImagePositionX: number;
  readonly backgroundImagePositionY: number;
  readonly backgroundMode: MatchVisualSettingsValues["backgroundMode"];
  readonly windowColor: string;
  readonly windowOpacity: number;
  readonly playmatColor: string;
  readonly playmatOpacity: number;
  readonly zoneBackgroundVisibility: number;
  readonly zoneGuideVisibility: number;
}

export interface PersonalizationLoadout {
  readonly id: string;
  readonly name: string;
  readonly values: PersonalizationValues;
}

const normalizeHexColor = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/u.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;

const parseJson = (stored: string | null): unknown => {
  if (stored === null) {
    return undefined;
  }
  try {
    return JSON.parse(stored) as unknown;
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeNumber = ({
  value,
  fallback,
  min,
  max,
}: {
  readonly value: unknown;
  readonly fallback: number;
  readonly min: number;
  readonly max: number;
}): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

const normalizeString = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value.trim() : fallback;

const normalizeBackgroundImageFit = (
  value: unknown,
): MatchVisualSettingsValues["backgroundImageFit"] =>
  value === "crop" || value === "stretch" || value === "fit" || value === "tile"
    ? value
    : defaultMatchVisualSettingsValues.backgroundImageFit;

const normalizeBackgroundMode = (
  value: unknown,
): MatchVisualSettingsValues["backgroundMode"] =>
  value === "color" || value === "image"
    ? value
    : defaultMatchVisualSettingsValues.backgroundMode;

export const loadColorPresets = (
  storage: ClientStorage | undefined,
): string[] => {
  const parsed = parseJson(storage?.getItem(colorPresetsKey) ?? null);
  if (!Array.isArray(parsed)) {
    return [...defaultColorPresets];
  }
  return defaultColorPresets.map((fallback, index) =>
    normalizeHexColor(parsed[index], fallback),
  );
};

export const saveColorPresets = (
  storage: ClientStorage | undefined,
  presets: readonly string[],
): string[] => {
  const normalized = defaultColorPresets.map((fallback, index) =>
    normalizeHexColor(presets[index], fallback),
  );
  storage?.setItem(colorPresetsKey, JSON.stringify(normalized));
  return normalized;
};

export const saveColorPreset = (
  storage: ClientStorage | undefined,
  index: number,
  color: string,
): string[] => {
  const next = loadColorPresets(storage);
  if (Number.isInteger(index) && index >= 0 && index < next.length) {
    next[index] = normalizeHexColor(
      color,
      next[index] ?? defaultColorPresets[index] ?? defaultColorPresets[0],
    );
  }
  return saveColorPresets(storage, next);
};

export const personalizationValuesFromSettings = (
  settings: MatchVisualSettingsValues,
): PersonalizationValues => ({
  backgroundColor: settings.backgroundColor,
  backgroundImageUrl: settings.backgroundImageUrl,
  backgroundImageFit: settings.backgroundImageFit,
  backgroundImageCropZoom: settings.backgroundImageCropZoom,
  backgroundImagePositionX: settings.backgroundImagePositionX,
  backgroundImagePositionY: settings.backgroundImagePositionY,
  backgroundMode: settings.backgroundMode,
  windowColor: settings.windowColor,
  windowOpacity: settings.windowOpacity,
  playmatColor: settings.playmatColor,
  playmatOpacity: settings.playmatOpacity,
  zoneBackgroundVisibility: settings.zoneBackgroundVisibility,
  zoneGuideVisibility: settings.zoneGuideVisibility,
});

const normalizePersonalizationValues = (
  value: unknown,
): PersonalizationValues | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const defaults = defaultMatchVisualSettingsValues;
  return {
    backgroundColor: normalizeHexColor(
      value["backgroundColor"],
      defaults.backgroundColor,
    ),
    backgroundImageUrl: normalizeString(
      value["backgroundImageUrl"],
      defaults.backgroundImageUrl,
    ),
    backgroundImageFit: normalizeBackgroundImageFit(
      value["backgroundImageFit"],
    ),
    backgroundImageCropZoom: normalizeNumber({
      value: value["backgroundImageCropZoom"],
      fallback: defaults.backgroundImageCropZoom,
      min: 100,
      max: 250,
    }),
    backgroundImagePositionX: normalizeNumber({
      value: value["backgroundImagePositionX"],
      fallback: defaults.backgroundImagePositionX,
      min: 0,
      max: 100,
    }),
    backgroundImagePositionY: normalizeNumber({
      value: value["backgroundImagePositionY"],
      fallback: defaults.backgroundImagePositionY,
      min: 0,
      max: 100,
    }),
    backgroundMode: normalizeBackgroundMode(value["backgroundMode"]),
    windowColor: normalizeHexColor(value["windowColor"], defaults.windowColor),
    windowOpacity: normalizeNumber({
      value: value["windowOpacity"],
      fallback: defaults.windowOpacity,
      min: 50,
      max: 100,
    }),
    playmatColor: normalizeHexColor(
      value["playmatColor"],
      defaults.playmatColor,
    ),
    playmatOpacity: normalizeNumber({
      value: value["playmatOpacity"],
      fallback: defaults.playmatOpacity,
      min: 50,
      max: 100,
    }),
    zoneBackgroundVisibility: normalizeNumber({
      value: value["zoneBackgroundVisibility"],
      fallback: defaults.zoneBackgroundVisibility,
      min: 0,
      max: 100,
    }),
    zoneGuideVisibility: normalizeNumber({
      value: value["zoneGuideVisibility"],
      fallback: defaults.zoneGuideVisibility,
      min: 0,
      max: 100,
    }),
  };
};

const normalizeLoadout = (
  value: unknown,
): PersonalizationLoadout | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = typeof value["id"] === "string" ? value["id"].trim() : "";
  const name = typeof value["name"] === "string" ? value["name"].trim() : "";
  const values = normalizePersonalizationValues(value["values"]);
  if (id.length === 0 || name.length === 0 || values === undefined) {
    return undefined;
  }
  return { id, name, values };
};

export const loadPersonalizationLoadouts = (
  storage: ClientStorage | undefined,
): PersonalizationLoadout[] => {
  const parsed = parseJson(
    storage?.getItem(personalizationLoadoutsKey) ?? null,
  );
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.flatMap((entry) => {
    const normalized = normalizeLoadout(entry);
    return normalized === undefined ? [] : [normalized];
  });
};

export const savePersonalizationLoadouts = (
  storage: ClientStorage | undefined,
  loadouts: readonly PersonalizationLoadout[],
): PersonalizationLoadout[] => {
  const normalized = loadouts.flatMap((loadout) => {
    const next = normalizeLoadout(loadout);
    return next === undefined ? [] : [next];
  });
  storage?.setItem(personalizationLoadoutsKey, JSON.stringify(normalized));
  return normalized;
};

export const applyPersonalizationValues = (
  storage: ClientStorage | undefined,
  settings: MatchVisualSettings,
  values: PersonalizationValues,
): void => {
  settings.setBackgroundColor(
    saveMatchVisualSetting(storage, "backgroundColor", values.backgroundColor),
  );
  settings.setBackgroundImageUrl(
    saveMatchVisualSetting(
      storage,
      "backgroundImageUrl",
      values.backgroundImageUrl,
    ),
  );
  settings.setBackgroundImageFit(
    saveMatchVisualSetting(
      storage,
      "backgroundImageFit",
      values.backgroundImageFit,
    ),
  );
  settings.setBackgroundImageCropZoom(
    saveMatchVisualSetting(
      storage,
      "backgroundImageCropZoom",
      values.backgroundImageCropZoom,
    ),
  );
  settings.setBackgroundImagePositionX(
    saveMatchVisualSetting(
      storage,
      "backgroundImagePositionX",
      values.backgroundImagePositionX,
    ),
  );
  settings.setBackgroundImagePositionY(
    saveMatchVisualSetting(
      storage,
      "backgroundImagePositionY",
      values.backgroundImagePositionY,
    ),
  );
  settings.setBackgroundMode(
    saveMatchVisualSetting(storage, "backgroundMode", values.backgroundMode),
  );
  settings.setWindowColor(
    saveMatchVisualSetting(storage, "windowColor", values.windowColor),
  );
  settings.setWindowOpacity(
    saveMatchVisualSetting(storage, "windowOpacity", values.windowOpacity),
  );
  settings.setPlaymatColor(
    saveMatchVisualSetting(storage, "playmatColor", values.playmatColor),
  );
  settings.setPlaymatOpacity(
    saveMatchVisualSetting(storage, "playmatOpacity", values.playmatOpacity),
  );
  settings.setZoneBackgroundVisibility(
    saveMatchVisualSetting(
      storage,
      "zoneBackgroundVisibility",
      values.zoneBackgroundVisibility,
    ),
  );
  settings.setZoneGuideVisibility(
    saveMatchVisualSetting(
      storage,
      "zoneGuideVisibility",
      values.zoneGuideVisibility,
    ),
  );
};
