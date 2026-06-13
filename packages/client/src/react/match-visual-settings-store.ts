import type { ClientStorage } from "../session.js";
import type {
  MatchVisualSettingGroupId,
  MatchVisualSettingId,
  MatchVisualSettingsValues,
} from "./match-visual-settings.js";
import { defaultMatchVisualSettingsValues } from "./match-visual-settings.js";

interface MatchVisualSettingDefinition<K extends MatchVisualSettingId> {
  readonly id: K;
  readonly groupId: MatchVisualSettingGroupId;
  readonly storageKey: string;
  readonly defaultValue: MatchVisualSettingsValues[K];
  readonly parse: (stored: string | null) => MatchVisualSettingsValues[K];
  readonly normalize: (
    value: MatchVisualSettingsValues[K],
  ) => MatchVisualSettingsValues[K];
  readonly serialize: (
    value: MatchVisualSettingsValues[K],
  ) => string | undefined;
}

const trimString = (value: string): string => value.trim();

const booleanSetting = <K extends MatchVisualSettingId>({
  id,
  groupId,
  storageKey,
  defaultValue,
}: {
  readonly id: K;
  readonly groupId: MatchVisualSettingGroupId;
  readonly storageKey: string;
  readonly defaultValue: Extract<MatchVisualSettingsValues[K], boolean>;
}): MatchVisualSettingDefinition<K> => ({
  id,
  groupId,
  storageKey,
  defaultValue,
  parse: (stored) =>
    (stored === null
      ? defaultValue
      : stored === "true") as MatchVisualSettingsValues[K],
  normalize: (value) => value,
  serialize: (value) => (value ? "true" : "false"),
});

const confirmAttachDonSetting =
  (): MatchVisualSettingDefinition<"confirmAttachDon"> => ({
    id: "confirmAttachDon",
    groupId: "gameplay",
    storageKey: "optcg:client:confirm-attach-don",
    defaultValue: defaultMatchVisualSettingsValues.confirmAttachDon,
    parse: (stored) => stored !== "false",
    normalize: (value) => value,
    serialize: (value) => (value ? "true" : "false"),
  });

const clampVisibility = (value: number, fallback: number): number =>
  Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : fallback;

const visibilitySetting = <K extends MatchVisualSettingId>({
  id,
  groupId,
  storageKey,
  defaultValue,
}: {
  readonly id: K;
  readonly groupId: MatchVisualSettingGroupId;
  readonly storageKey: string;
  readonly defaultValue: Extract<MatchVisualSettingsValues[K], number>;
}): MatchVisualSettingDefinition<K> => ({
  id,
  groupId,
  storageKey,
  defaultValue,
  parse: (stored) =>
    (stored === null
      ? defaultValue
      : clampVisibility(
          Number.parseInt(stored, 10),
          defaultValue,
        )) as MatchVisualSettingsValues[K],
  normalize: (value) =>
    clampVisibility(
      value as number,
      defaultValue,
    ) as MatchVisualSettingsValues[K],
  serialize: (value) => String(value),
});

export const matchVisualSettingDefinitions = {
  backgroundImageUrl: {
    id: "backgroundImageUrl",
    groupId: "appearance",
    storageKey: "optcg:client:background-image-url",
    defaultValue: defaultMatchVisualSettingsValues.backgroundImageUrl,
    parse: (stored) =>
      stored ?? defaultMatchVisualSettingsValues.backgroundImageUrl,
    normalize: trimString,
    serialize: (value) => (value.length === 0 ? undefined : value),
  },
  confirmAttachDon: confirmAttachDonSetting(),
  confirmEndTurn: booleanSetting({
    id: "confirmEndTurn",
    groupId: "gameplay",
    storageKey: "optcg:client:confirm-end-turn",
    defaultValue: defaultMatchVisualSettingsValues.confirmEndTurn,
  }),
  quickPayActivateMainCosts: booleanSetting({
    id: "quickPayActivateMainCosts",
    groupId: "gameplay",
    storageKey: "optcg:client:quick-pay-activate-main-costs",
    defaultValue: defaultMatchVisualSettingsValues.quickPayActivateMainCosts,
  }),
  reducedMotion: booleanSetting({
    id: "reducedMotion",
    groupId: "video",
    storageKey: "optcg:client:reduced-motion",
    defaultValue: defaultMatchVisualSettingsValues.reducedMotion,
  }),
  soundVolume: visibilitySetting({
    id: "soundVolume",
    groupId: "sound",
    storageKey: "optcg:client:sound-volume",
    defaultValue: defaultMatchVisualSettingsValues.soundVolume,
  }),
  zoneBackgroundVisibility: visibilitySetting({
    id: "zoneBackgroundVisibility",
    groupId: "appearance",
    storageKey: "optcg:client:zone-background-visibility",
    defaultValue: defaultMatchVisualSettingsValues.zoneBackgroundVisibility,
  }),
  zoneGuideVisibility: visibilitySetting({
    id: "zoneGuideVisibility",
    groupId: "appearance",
    storageKey: "optcg:client:zone-guide-visibility",
    defaultValue: defaultMatchVisualSettingsValues.zoneGuideVisibility,
  }),
} satisfies {
  readonly [K in MatchVisualSettingId]: MatchVisualSettingDefinition<K>;
};

export const matchVisualSettingIds = [
  "backgroundImageUrl",
  "confirmAttachDon",
  "confirmEndTurn",
  "quickPayActivateMainCosts",
  "reducedMotion",
  "soundVolume",
  "zoneBackgroundVisibility",
  "zoneGuideVisibility",
] as const satisfies readonly MatchVisualSettingId[];

export const matchVisualSettingGroupIds = [
  "appearance",
  "gameplay",
  "sound",
  "video",
] as const satisfies readonly MatchVisualSettingGroupId[];

export { defaultMatchVisualSettingsValues };

const loadWithDefinition = <K extends MatchVisualSettingId>(
  storage: ClientStorage | undefined,
  definition: MatchVisualSettingDefinition<K>,
): MatchVisualSettingsValues[K] => {
  return storage === undefined
    ? definition.defaultValue
    : definition.parse(storage.getItem(definition.storageKey));
};

export function loadMatchVisualSetting(
  storage: ClientStorage | undefined,
  settingId: "backgroundImageUrl",
): string;
export function loadMatchVisualSetting(
  storage: ClientStorage | undefined,
  settingId:
    | "confirmAttachDon"
    | "confirmEndTurn"
    | "quickPayActivateMainCosts"
    | "reducedMotion",
): boolean;
export function loadMatchVisualSetting(
  storage: ClientStorage | undefined,
  settingId: "soundVolume" | "zoneBackgroundVisibility" | "zoneGuideVisibility",
): number;
export function loadMatchVisualSetting(
  storage: ClientStorage | undefined,
  settingId: MatchVisualSettingId,
): string | boolean | number {
  switch (settingId) {
    case "backgroundImageUrl":
      return loadWithDefinition(
        storage,
        matchVisualSettingDefinitions.backgroundImageUrl,
      );
    case "confirmAttachDon":
      return loadWithDefinition(
        storage,
        matchVisualSettingDefinitions.confirmAttachDon,
      );
    case "confirmEndTurn":
      return loadWithDefinition(
        storage,
        matchVisualSettingDefinitions.confirmEndTurn,
      );
    case "quickPayActivateMainCosts":
      return loadWithDefinition(
        storage,
        matchVisualSettingDefinitions.quickPayActivateMainCosts,
      );
    case "reducedMotion":
      return loadWithDefinition(
        storage,
        matchVisualSettingDefinitions.reducedMotion,
      );
    case "soundVolume":
      return loadWithDefinition(
        storage,
        matchVisualSettingDefinitions.soundVolume,
      );
    case "zoneBackgroundVisibility":
      return loadWithDefinition(
        storage,
        matchVisualSettingDefinitions.zoneBackgroundVisibility,
      );
    case "zoneGuideVisibility":
      return loadWithDefinition(
        storage,
        matchVisualSettingDefinitions.zoneGuideVisibility,
      );
  }
}

export const loadMatchVisualSettings = (
  storage: ClientStorage | undefined,
): MatchVisualSettingsValues => ({
  backgroundImageUrl: loadMatchVisualSetting(storage, "backgroundImageUrl"),
  confirmAttachDon: loadMatchVisualSetting(storage, "confirmAttachDon"),
  confirmEndTurn: loadMatchVisualSetting(storage, "confirmEndTurn"),
  quickPayActivateMainCosts: loadMatchVisualSetting(
    storage,
    "quickPayActivateMainCosts",
  ),
  reducedMotion: loadMatchVisualSetting(storage, "reducedMotion"),
  soundVolume: loadMatchVisualSetting(storage, "soundVolume"),
  zoneBackgroundVisibility: loadMatchVisualSetting(
    storage,
    "zoneBackgroundVisibility",
  ),
  zoneGuideVisibility: loadMatchVisualSetting(storage, "zoneGuideVisibility"),
});

const saveWithDefinition = <K extends MatchVisualSettingId>(
  storage: ClientStorage | undefined,
  definition: MatchVisualSettingDefinition<K>,
  value: MatchVisualSettingsValues[K],
): MatchVisualSettingsValues[K] => {
  const normalizedValue = definition.normalize(value);
  const serializedValue = definition.serialize(normalizedValue);
  if (storage === undefined) {
    return normalizedValue;
  }
  if (serializedValue === undefined) {
    storage.removeItem(definition.storageKey);
    return normalizedValue;
  }
  storage.setItem(definition.storageKey, serializedValue);
  return normalizedValue;
};

export function saveMatchVisualSetting(
  storage: ClientStorage | undefined,
  settingId: "backgroundImageUrl",
  value: string,
): string;
export function saveMatchVisualSetting(
  storage: ClientStorage | undefined,
  settingId:
    | "confirmAttachDon"
    | "confirmEndTurn"
    | "quickPayActivateMainCosts"
    | "reducedMotion",
  value: boolean,
): boolean;
export function saveMatchVisualSetting(
  storage: ClientStorage | undefined,
  settingId: "soundVolume" | "zoneBackgroundVisibility" | "zoneGuideVisibility",
  value: number,
): number;
export function saveMatchVisualSetting(
  storage: ClientStorage | undefined,
  settingId: MatchVisualSettingId,
  value: string | boolean | number,
): string | boolean | number {
  switch (settingId) {
    case "backgroundImageUrl":
      return saveWithDefinition(
        storage,
        matchVisualSettingDefinitions.backgroundImageUrl,
        String(value),
      );
    case "confirmAttachDon":
      return saveWithDefinition(
        storage,
        matchVisualSettingDefinitions.confirmAttachDon,
        value === true,
      );
    case "confirmEndTurn":
      return saveWithDefinition(
        storage,
        matchVisualSettingDefinitions.confirmEndTurn,
        value === true,
      );
    case "quickPayActivateMainCosts":
      return saveWithDefinition(
        storage,
        matchVisualSettingDefinitions.quickPayActivateMainCosts,
        value === true,
      );
    case "reducedMotion":
      return saveWithDefinition(
        storage,
        matchVisualSettingDefinitions.reducedMotion,
        value === true,
      );
    case "soundVolume":
      return saveWithDefinition(
        storage,
        matchVisualSettingDefinitions.soundVolume,
        typeof value === "number" ? value : Number.NaN,
      );
    case "zoneBackgroundVisibility":
      return saveWithDefinition(
        storage,
        matchVisualSettingDefinitions.zoneBackgroundVisibility,
        typeof value === "number" ? value : Number.NaN,
      );
    case "zoneGuideVisibility":
      return saveWithDefinition(
        storage,
        matchVisualSettingDefinitions.zoneGuideVisibility,
        typeof value === "number" ? value : Number.NaN,
      );
  }
}
