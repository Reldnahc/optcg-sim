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
  deckValidationContractDeferrals,
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
export {
  getRepresentativeFixtureSupportMetadata,
  hasCheckedInRepresentativePoneglyphFixture,
  isRepresentativeFixtureStatusSupported,
  listRepresentativeFixtureIds,
  loadCheckedInRepresentativePoneglyphFixture,
} from "./representative-fixtures.js";
export type {
  RepresentativeFixtureId,
  RepresentativeFixtureSupportMetadata,
} from "./representative-fixtures.js";
export {
  REDIS_CARD_DATA_CACHE_DEFERRED,
  createFileCardDataCache,
  createInMemoryCardDataCache,
} from "./cache.js";
export type {
  CardDataCache,
  CardDataCacheLookupOptions,
  CardDataCacheWriteOptions,
  FileCardDataCacheOptions,
  InMemoryCardDataCacheOptions,
} from "./cache.js";
