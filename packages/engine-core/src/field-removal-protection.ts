import type {
  CardInstance,
  ContinuousEffectRecord,
  EffectQueueEntry,
  GameState,
  PlayerId,
  Protection,
  ReplacementProcess,
} from "@optcg/types";

import { evaluateQueuedEffectCondition } from "./effect-runtime-conditions.js";

export type FieldRemovalProtectionFailureReason =
  | "missing-source-controller"
  | "unsupported-field-removal-destination"
  | "ambiguous-field-removal-source"
  | "malformed-field-removal-protection";

export interface FieldRemovalProtectionError {
  reason: FieldRemovalProtectionFailureReason;
}

type FieldRemovalAttempt = {
  processFamily: "fieldRemoval";
  classification: "moveFromFieldToTrash";
  sourceKind: "cardEffect" | "cost";
  sourceControllerId: PlayerId;
};

type ProtectionOperation = Extract<
  ContinuousEffectRecord["modifier"]["operation"],
  { type: "protection" }
>;

type FieldRemovalProtectionEffect = ContinuousEffectRecord & {
  modifier: ContinuousEffectRecord["modifier"] & {
    layer: "protection";
    operation: ProtectionOperation;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isSupportedFieldRemovalProtection = (
  protection: Protection,
): protection is Extract<Protection, { process: "fieldRemoval" }> => {
  if (protection.process !== "fieldRemoval") return false;
  const metadata = protection.fieldRemoval as unknown;
  if (!isRecord(metadata)) return false;
  const exclusions = metadata["exclusions"];
  if (!isRecord(exclusions)) return false;
  return (
    metadata["processFamily"] === "fieldRemoval" &&
    metadata["classification"] === "moveFromFieldToTrash" &&
    metadata["sourceKind"] === "cardEffect" &&
    metadata["sourceControllerRelation"] === "opponentControlled" &&
    metadata["targetScope"] === "thisCard" &&
    exclusions["battleKO"] === "excluded" &&
    exclusions["ruleProcessTrash"] === "excluded" &&
    exclusions["controllerCost"] === "excluded" &&
    exclusions["controllerOwnedEffect"] === "excluded" &&
    exclusions["ambiguousCustomRemoval"] === "failClosed"
  );
};

export const hasOnlyFieldRemovalProtections = (
  protections: readonly Protection[],
): boolean =>
  protections.every((protection) => protection.process === "fieldRemoval");

export const malformedFieldRemovalProtectionMessage = (
  effect: ContinuousEffectRecord,
): string =>
  `Unsupported continuous effect ${effect.id}: malformed field-removal protection metadata.`;

export const isFieldRemovalProtectionModifier = (
  effect: ContinuousEffectRecord,
): effect is FieldRemovalProtectionEffect =>
  effect.modifier.layer === "protection" &&
  effect.modifier.operation.type === "protection" &&
  effect.modifier.operation.protection.process === "fieldRemoval";

const isSupportedDuration = (
  duration: ContinuousEffectRecord["duration"],
): boolean =>
  duration.type === "thisBattle" ||
  duration.type === "thisTurn" ||
  duration.type === "untilEndOfTurn" ||
  duration.type === "untilStartOfNextTurn" ||
  duration.type === "whileSourceOnField" ||
  duration.type === "permanent";

const isCardRefLive = (
  state: GameState,
  ref: {
    instanceId: CardInstance["instanceId"];
    cardId: CardInstance["cardId"];
    playerId: PlayerId;
  },
): boolean => {
  const player = state.players[ref.playerId];
  if (player === undefined) return false;
  if (
    player.leader.instanceId === ref.instanceId &&
    player.leader.cardId === ref.cardId
  ) {
    return true;
  }
  return player.characters.some(
    (character) =>
      character.instanceId === ref.instanceId &&
      character.cardId === ref.cardId,
  );
};

const durationIsActive = (
  state: GameState,
  effect: ContinuousEffectRecord,
): boolean => {
  if (effect.duration.type === "whileSourceOnField") {
    return isCardRefLive(state, effect.source);
  }
  return true;
};

export const isSupportedFieldRemovalProtectionModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  isFieldRemovalProtectionModifier(effect) &&
  isSupportedDuration(effect.duration) &&
  effect.modifier.target.type === "self" &&
  isSupportedFieldRemovalProtection(effect.modifier.operation.protection);

const toConditionQueueEntry = (
  effect: ContinuousEffectRecord,
): EffectQueueEntry => ({
  id: `field-removal-protection-condition:${effect.id}` as EffectQueueEntry["id"],
  state: "resolving",
  timingWindowId:
    `field-removal-protection-condition:${effect.id}` as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: effect.controller,
  source: effect.source,
  sourceSnapshot: effect.sourceSnapshot,
  effectBlockId:
    `field-removal-protection-condition:${effect.id}` as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: effect.createdAtStateSeq,
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: effect.createdBy,
});

const conditionIsActive = (
  state: GameState,
  effect: ContinuousEffectRecord,
):
  | { ok: true; active: boolean }
  | { ok: false; reason: FieldRemovalProtectionFailureReason } => {
  const result = evaluateQueuedEffectCondition(
    state,
    toConditionQueueEntry(effect),
    effect.condition,
  );
  if (!result.supported) {
    return { ok: false, reason: "malformed-field-removal-protection" };
  }
  return { ok: true, active: result.passed };
};

const cardMatchesSelfProtection = (
  card: CardInstance,
  effect: ContinuousEffectRecord,
): boolean =>
  effect.modifier.target.type === "self" &&
  card.instanceId === effect.source.instanceId &&
  card.cardId === effect.source.cardId &&
  card.controller === effect.source.playerId;

export const fieldRemovalProtectionsForCard = (
  state: GameState,
  card: CardInstance,
):
  | { ok: true; protections: Protection[] }
  | { ok: false; reason: FieldRemovalProtectionFailureReason } => {
  const protections: Protection[] = [];
  for (const effect of state.continuousEffects) {
    if (!isFieldRemovalProtectionModifier(effect)) continue;
    if (!isSupportedFieldRemovalProtectionModifier(effect)) {
      return { ok: false, reason: "malformed-field-removal-protection" };
    }
    if (!durationIsActive(state, effect)) continue;
    if (!cardMatchesSelfProtection(card, effect)) continue;
    const condition = conditionIsActive(state, effect);
    if (!condition.ok) return condition;
    if (!condition.active) continue;
    protections.push(effect.modifier.operation.protection);
  }
  return { ok: true, protections };
};

const attemptFromProcess = (
  process: ReplacementProcess,
):
  | { ok: true; attempt: FieldRemovalAttempt }
  | { ok: false; reason: FieldRemovalProtectionFailureReason } => {
  const payload = process.payload;
  if (!isRecord(payload)) {
    return { ok: false, reason: "ambiguous-field-removal-source" };
  }
  const attempt = payload["fieldRemovalAttempt"];
  if (!isRecord(attempt)) {
    return { ok: false, reason: "ambiguous-field-removal-source" };
  }
  if (attempt["ambiguous"] === true) {
    return { ok: false, reason: "ambiguous-field-removal-source" };
  }
  if (attempt["processFamily"] !== "fieldRemoval") {
    return { ok: false, reason: "ambiguous-field-removal-source" };
  }
  if (attempt["classification"] !== "moveFromFieldToTrash") {
    return { ok: false, reason: "unsupported-field-removal-destination" };
  }
  if (
    attempt["sourceKind"] !== "cardEffect" &&
    attempt["sourceKind"] !== "cost"
  ) {
    return { ok: false, reason: "ambiguous-field-removal-source" };
  }
  if (typeof attempt["sourceControllerId"] !== "string") {
    return { ok: false, reason: "missing-source-controller" };
  }
  return {
    ok: true,
    attempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: attempt["sourceKind"],
      sourceControllerId: attempt["sourceControllerId"] as PlayerId,
    },
  };
};

export const applyFieldRemovalProtection = (
  state: GameState,
  target: CardInstance,
  process: ReplacementProcess,
):
  | { ok: true; prevented: boolean }
  | { ok: false; reason: FieldRemovalProtectionFailureReason } => {
  const protections = fieldRemovalProtectionsForCard(state, target);
  if (!protections.ok) return protections;
  if (protections.protections.length === 0) {
    return { ok: true, prevented: false };
  }

  const attempt = attemptFromProcess(process);
  if (!attempt.ok) return attempt;

  return {
    ok: true,
    prevented:
      attempt.attempt.sourceKind === "cardEffect" &&
      attempt.attempt.sourceControllerId !== target.controller,
  };
};
