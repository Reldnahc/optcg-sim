export const packageName = "@optcg/cards";

export {
  computeBehaviorHash,
  computeSourceTextHash,
  normalizePoneglyphCardDetail,
  variantKey,
} from "./normalization.js";
export type { NormalizedPoneglyphCard } from "./normalization.js";
export {
  buildMatchCardManifest,
  computeMatchCardManifestHash,
  createManifestVersions,
  validateDecklist,
  validateLoadout,
} from "./manifest.js";
export type {
  BuildMatchCardManifestInput,
  DeckValidationMode,
  ManifestVersions,
  ValidateDecklistInput,
  ValidateLoadoutInput,
} from "./manifest.js";
export {
  mergeSimulatorOverlay,
  validateSimulatorOverlay,
  validateSimulatorOverlayRegistry,
} from "./overlay.js";
export type {
  MergedSimulatorOverlayCard,
  SimulatorOverlayRegistry,
} from "./overlay.js";
export type {
  PoneglyphClient,
  PoneglyphClientOptions,
  PoneglyphFetch,
} from "./poneglyph-client.js";
export { createPoneglyphClient } from "./poneglyph-client.js";
export { validatePoneglyphCardDetail } from "./poneglyph-schema.js";
