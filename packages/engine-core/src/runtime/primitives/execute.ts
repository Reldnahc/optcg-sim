export type { DrawExecutionFailureReason } from "./draw.js";
export {
  executeDrawPrimitiveForResolvedQuantity,
  executeNoChoiceEffectPrimitive,
  isSupportedDrawBody,
  isSupportedQueuedDrawEffectBlock,
  resolvePlayerId,
} from "./draw.js";
export type {
  DetectFieldRemovalReplacementCandidateResult,
  DetectSelectedTargetKoReplacementCandidateResult,
  FieldRemovalReplacementCandidate,
  SelectedTargetKoReplacementCandidate,
  SelectedTargetKoReplacementDetectionFailureReason,
} from "../../replacement/field-removal-process.js";
export {
  buildFieldRemovalKoReplacementProcess,
  buildKoReplacementProcess,
  buildSelectedTargetFieldRemovalKoReplacementProcess,
  buildSelectedTargetFieldRemovalMoveToHandReplacementProcess,
  buildSelectedTargetKoReplacementProcess,
  buildSelectedTargetMoveZoneReplacementProcess,
  detectSupportedFieldRemovalReplacementCandidate,
  detectSupportedSelectedTargetKoReplacementCandidate,
  executeAcceptedFieldRemovalReplacementProcess,
  executeAcceptedSelectedTargetKoReplacementProcess,
  normalizeFieldRemovalProcess,
  pauseFieldRemovalReplacementProcess,
  pauseSelectedTargetKoReplacementProcess,
} from "../../replacement/field-removal-process.js";
export type { SelectedTargetKoExecutionFailureReason } from "./target-ko.js";
export type { SelectedTargetFieldRemovalExecutionFailureReason } from "./field-removal.js";
export {
  executeSelectedTargetFieldRemovalReplacementProcess,
  executeUnreplacedSelectedTargetFieldRemovalProcess,
  executeUnreplacedSelectedTargetKoProcess,
} from "./field-removal.js";
export {
  executeSelectedTargetEffectPrimitive,
  resolveSavedFieldObjectKoSelection,
  isSupportedMainEventTargetKoEffect,
  isSupportedMainEventTargetKoEffectAllowingOncePerTurn,
} from "./target-ko.js";
export {
  executeSelectedTargetRestReplacementProcess,
  executeUnreplacedSelectedTargetRestProcess,
} from "./rest.js";
export {
  executeNoChoiceWinGamePrimitive,
  executeWinGamePrimitive,
  isSupportedQueuedWinGameEffect,
  isSupportedQueuedWinGameEffectForEntry,
  isSupportedWinGameBody,
} from "./win-game.js";
export { executeDamagePrimitive, isSupportedDamageEffect } from "./damage.js";
