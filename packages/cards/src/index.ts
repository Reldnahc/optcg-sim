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
  buildRealCardDslMatchCardManifest,
  listRealCardFixtureIds,
  loadCheckedInEb01023OnPlayDraw1EffectDefinition,
  loadCheckedInRealPoneglyphFixture,
  loadRealCardDslMatchCardManifestFixture,
  realCardDslEffectDefinitionFixturePath,
  realCardDslMatchCardManifestFixturePath,
} from "./real-card-fixtures.js";
export type { RealCardFixtureId } from "./real-card-fixtures.js";
export {
  buildRepresentativeMatchCardManifest,
  getRepresentativeFixtureSupportMetadata,
  hasCheckedInRepresentativePoneglyphFixture,
  isRepresentativeFixtureStatusSupported,
  listRepresentativeFixtureIds,
  loadCheckedInRepresentativePoneglyphFixture,
  loadRepresentativeMatchCardManifestFixture,
  representativeMatchCardManifestFixturePath,
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
export {
  capturePoneglyphCardFixtures,
  runCapturePoneglyphFixtureCli,
  stringifyDeterministicJson,
  toPoneglyphCardFixtureFileName,
} from "./fixture-capture.js";
export type {
  CapturedPoneglyphCardFixture,
  CapturePoneglyphCardFixturesOptions,
  CapturePoneglyphCardFixturesResult,
} from "./fixture-capture.js";
export {
  certifiedParserRuleReviewer,
  lineSeparatedEffectBlocksCompositionId,
  onPlayDrawNParserRuleId,
  parseCertifiedCardText,
  whenAttackingDrawNParserRuleId,
} from "./certified-card-text-parser.js";
export type { CertifiedCardTextParserInput } from "./certified-card-text-parser.js";
export {
  buildGeneratedSupportIndex,
  toGeneratedSupportManifestEvidence,
} from "./generated-support-index.js";
export type {
  EffectDefinitionValidationResult,
  GeneratedSupportCardTextInput,
  GeneratedSupportIndex,
  GeneratedSupportIndexEntry,
  GeneratedSupportIndexInput,
  GeneratedSupportManifestEvidence,
} from "./generated-support-index.js";
export { buildGeneratedSupportReport } from "./generated-support-report.js";
export type {
  GeneratedSupportReport,
  GeneratedSupportReportBlocker,
  GeneratedSupportReportCardStatus,
  GeneratedSupportReportUnparsedSpan,
} from "./generated-support-report.js";
export {
  generatedSupportParserResultStatuses,
  isCompleteGeneratedSupportParseResult,
} from "./generated-support-types.js";
export type {
  AmbiguousWordingGeneratedSupportParseResult,
  CompleteGeneratedSupportParseResult,
  CustomHandlerRequiredGeneratedSupportParseResult,
  GeneratedSupportBlocker,
  GeneratedSupportBlockerCode,
  GeneratedSupportParserResult,
  GeneratedSupportParserResultStatus,
  GeneratedSupportUnparsedSpan,
  PartialGeneratedSupportParseResult,
  StaleHashGeneratedSupportParseResult,
  UnsupportedPrimitiveGeneratedSupportParseResult,
} from "./generated-support-types.js";
export {
  generatedSupportRuntimeCapabilityMatrix,
  hasRuntimeCapability,
  listSupportedRuntimeCapabilityIds,
  requiredGeneratedSupportCapabilityIds,
} from "./runtime-capability-matrix.js";
export type {
  RuntimeCapabilityKind,
  RuntimeCapabilityMatrix,
  RuntimeCapabilityRecord,
} from "./runtime-capability-matrix.js";
