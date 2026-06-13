export interface MatchVisualSettingsValues {
  readonly backgroundImageUrl: string;
  readonly confirmAttachDon: boolean;
  readonly confirmEndTurn: boolean;
  readonly quickPayActivateMainCosts: boolean;
  readonly reducedMotion: boolean;
  readonly soundVolume: number;
  readonly zoneBackgroundVisibility: number;
  readonly zoneGuideVisibility: number;
}

export type MatchVisualSettingId = keyof MatchVisualSettingsValues;

export type MatchVisualSettingGroupId =
  | "appearance"
  | "gameplay"
  | "sound"
  | "video";

export interface MatchVisualSettings extends MatchVisualSettingsValues {
  readonly setBackgroundImageUrl: (url: string) => void;
  readonly setConfirmAttachDon: (enabled: boolean) => void;
  readonly setConfirmEndTurn: (enabled: boolean) => void;
  readonly setQuickPayActivateMainCosts: (enabled: boolean) => void;
  readonly setReducedMotion: (enabled: boolean) => void;
  readonly setSoundVolume: (value: number) => void;
  readonly setZoneBackgroundVisibility: (value: number) => void;
  readonly setZoneGuideVisibility: (value: number) => void;
}

export const defaultMatchVisualSettingsValues: MatchVisualSettingsValues = {
  backgroundImageUrl: "",
  confirmAttachDon: true,
  confirmEndTurn: false,
  quickPayActivateMainCosts: false,
  reducedMotion: false,
  soundVolume: 70,
  zoneBackgroundVisibility: 18,
  zoneGuideVisibility: 60,
};

export const noopMatchVisualSettings: MatchVisualSettings = {
  ...defaultMatchVisualSettingsValues,
  setBackgroundImageUrl: () => undefined,
  setConfirmAttachDon: () => undefined,
  setConfirmEndTurn: () => undefined,
  setQuickPayActivateMainCosts: () => undefined,
  setReducedMotion: () => undefined,
  setSoundVolume: () => undefined,
  setZoneBackgroundVisibility: () => undefined,
  setZoneGuideVisibility: () => undefined,
};
