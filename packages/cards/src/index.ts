export const packageName = "@optcg/cards";

export {
  computeBehaviorHash,
  computeSourceTextHash,
  normalizePoneglyphCardDetail,
  variantKey,
} from "./normalization.js";
export type { NormalizedPoneglyphCard } from "./normalization.js";
export type {
  PoneglyphClient,
  PoneglyphClientOptions,
  PoneglyphFetch,
} from "./poneglyph-client.js";
export { createPoneglyphClient } from "./poneglyph-client.js";
export { validatePoneglyphCardDetail } from "./poneglyph-schema.js";
