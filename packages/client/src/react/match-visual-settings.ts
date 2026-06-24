export type MatchBackgroundMode = "color" | "image";

export type MatchBackgroundImageFit = "crop" | "stretch" | "fit" | "tile";

export interface MatchVisualSettingsValues {
  readonly backgroundColor: string;
  readonly backgroundImageUrl: string;
  readonly backgroundImageFit: MatchBackgroundImageFit;
  readonly backgroundImageCropZoom: number;
  readonly backgroundImagePositionX: number;
  readonly backgroundImagePositionY: number;
  readonly backgroundMode: MatchBackgroundMode;
  readonly confirmAttachDon: boolean;
  readonly confirmEndTurn: boolean;
  readonly quickPayActivateMainCosts: boolean;
  readonly reduceDeckStackRendering: boolean;
  readonly reducedMotion: boolean;
  readonly soundVolume: number;
  readonly windowColor: string;
  readonly windowOpacity: number;
  readonly playmatColor: string;
  readonly playmatOpacity: number;
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
  readonly setBackgroundColor: (value: string) => void;
  readonly setBackgroundImageUrl: (url: string) => void;
  readonly setBackgroundImageFit: (value: MatchBackgroundImageFit) => void;
  readonly setBackgroundImageCropZoom: (value: number) => void;
  readonly setBackgroundImagePositionX: (value: number) => void;
  readonly setBackgroundImagePositionY: (value: number) => void;
  readonly setBackgroundMode: (value: MatchBackgroundMode) => void;
  readonly setConfirmAttachDon: (enabled: boolean) => void;
  readonly setConfirmEndTurn: (enabled: boolean) => void;
  readonly setQuickPayActivateMainCosts: (enabled: boolean) => void;
  readonly setReduceDeckStackRendering: (enabled: boolean) => void;
  readonly setReducedMotion: (enabled: boolean) => void;
  readonly setSoundVolume: (value: number) => void;
  readonly setWindowColor: (value: string) => void;
  readonly setWindowOpacity: (value: number) => void;
  readonly setPlaymatColor: (value: string) => void;
  readonly setPlaymatOpacity: (value: number) => void;
  readonly setZoneBackgroundVisibility: (value: number) => void;
  readonly setZoneGuideVisibility: (value: number) => void;
}

export const defaultMatchVisualSettingsValues: MatchVisualSettingsValues = {
  backgroundColor: "#101010",
  backgroundImageUrl: "",
  backgroundImageFit: "crop",
  backgroundImageCropZoom: 100,
  backgroundImagePositionX: 50,
  backgroundImagePositionY: 50,
  backgroundMode: "image",
  confirmAttachDon: true,
  confirmEndTurn: false,
  quickPayActivateMainCosts: true,
  reduceDeckStackRendering: false,
  reducedMotion: false,
  soundVolume: 70,
  windowColor: "#0d0d0e",
  windowOpacity: 86,
  playmatColor: "#222224",
  playmatOpacity: 92,
  zoneBackgroundVisibility: 18,
  zoneGuideVisibility: 60,
};

export const noopMatchVisualSettings: MatchVisualSettings = {
  ...defaultMatchVisualSettingsValues,
  setBackgroundColor: () => undefined,
  setBackgroundImageUrl: () => undefined,
  setBackgroundImageFit: () => undefined,
  setBackgroundImageCropZoom: () => undefined,
  setBackgroundImagePositionX: () => undefined,
  setBackgroundImagePositionY: () => undefined,
  setBackgroundMode: () => undefined,
  setConfirmAttachDon: () => undefined,
  setConfirmEndTurn: () => undefined,
  setQuickPayActivateMainCosts: () => undefined,
  setReduceDeckStackRendering: () => undefined,
  setReducedMotion: () => undefined,
  setSoundVolume: () => undefined,
  setWindowColor: () => undefined,
  setWindowOpacity: () => undefined,
  setPlaymatColor: () => undefined,
  setPlaymatOpacity: () => undefined,
  setZoneBackgroundVisibility: () => undefined,
  setZoneGuideVisibility: () => undefined,
};
