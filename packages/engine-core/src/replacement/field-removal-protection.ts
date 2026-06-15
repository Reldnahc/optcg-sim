import type {
  CardInstance,
  CardCategory,
  CardId,
  ContinuousEffectRecord,
  EffectQueueEntry,
  GameState,
  PlayerId,
  Protection,
  ProtectionFieldRemovalClassification,
  ReplacementProcess,
} from "@optcg/types";

import { cardMatchesSearchFilter } from "../actions/state.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "../effect-runtime-conditions.js";
import { deriveImplementedDslPermanentContinuousEffects } from "../runtime/continuous/continuous.js";
import {
  isFieldRemovalProtectionModifier,
  isProtectionModifier,
  isSupportedProtectionSourceCardFilter,
  isSupportedProtection,
} from "./protection-capabilities.js";
export {
  isSupportedFieldRemovalProtection,
  malformedFieldRemovalProtectionMessage,
} from "./protection-capabilities.js";

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
  classification: ProtectionFieldRemovalClassification;
  sourceKind: "cardEffect" | "cost";
  sourceControllerId: PlayerId;
  sourceCardId?: CardId;
};

export type RestProtectionAttempt = {
  sourceKind: "cardEffect" | "ruleProcess" | "battle" | "cost" | "custom";
  sourceControllerId: PlayerId;
  sourceCardId?: CardId;
  sourceCardCategory?: CardCategory;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const supportedFieldRemovalClassifications = new Set([
  "moveFromFieldToTrash",
  "moveFromFieldToHand",
  "moveFromFieldToDeck",
  "moveFromFieldToLife",
  "moveFromFieldToOtherZone",
]);

const isSupportedFieldRemovalClassification = (
  value: unknown,
): value is ProtectionFieldRemovalClassification =>
  typeof value === "string" && supportedFieldRemovalClassifications.has(value);

const isSupportedDuration = (
  duration: ContinuousEffectRecord["duration"],
): boolean =>
  duration.type === "thisBattle" ||
  duration.type === "thisTurn" ||
  duration.type === "untilEndOfTurn" ||
  duration.type === "untilStartOfNextTurn" ||
  duration.type === "whileSourceOnField" ||
  duration.type === "permanent" ||
  (duration.type === "whileConditionTrue" &&
    isSupportedQueuedEffectConditionShape(duration.condition));

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
  if (effect.duration.type === "whileConditionTrue") {
    const result = evaluateQueuedEffectCondition(
      state,
      toConditionQueueEntry(effect),
      effect.duration.condition,
    );
    return result.supported && result.passed;
  }
  return true;
};

export const isSupportedFieldRemovalProtectionModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  isFieldRemovalProtectionModifier(effect) &&
  isSupportedDuration(effect.duration) &&
  effect.modifier.target.type === "self" &&
  isSupportedProtection(effect.modifier.operation.protection);

export const isSupportedProtectionModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  isProtectionModifier(effect) &&
  isSupportedDuration(effect.duration) &&
  effect.modifier.target.type === "self" &&
  isSupportedProtection(effect.modifier.operation.protection);

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
  const effects = [
    ...state.continuousEffects,
    ...deriveImplementedDslPermanentContinuousEffects(state),
  ];
  for (const effect of effects) {
    if (!isProtectionModifier(effect)) continue;
    if (!cardMatchesSelfProtection(card, effect)) continue;
    if (!isSupportedProtectionModifier(effect)) {
      return { ok: false, reason: "malformed-field-removal-protection" };
    }
    if (!durationIsActive(state, effect)) continue;
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
  if (!isSupportedFieldRemovalClassification(attempt["classification"])) {
    return { ok: false, reason: "unsupported-field-removal-destination" };
  }
  if (
    process.type !== "moveZone" &&
    attempt["classification"] !== "moveFromFieldToTrash"
  ) {
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
      classification: attempt["classification"],
      sourceKind: attempt["sourceKind"],
      sourceControllerId: attempt["sourceControllerId"] as PlayerId,
      ...(typeof attempt["sourceCardId"] === "string"
        ? { sourceCardId: attempt["sourceCardId"] as CardId }
        : {}),
    },
  };
};

const protectionCoversAttempt = (
  state: GameState,
  protection: Protection,
  attempt: FieldRemovalAttempt,
): boolean => {
  if (protection.process !== "fieldRemoval") {
    return false;
  }
  const classification = protection.fieldRemoval.classification;
  return (
    (classification === "moveFromFieldToOtherZone" ||
      classification === attempt.classification) &&
    sourceCardFilterMatchesProtection(state, protection, attempt)
  );
};

const koProtectionCoversAttempt = (
  state: GameState,
  protection: Protection,
  attempt: FieldRemovalAttempt,
): boolean => {
  if (protection.process !== "ko") {
    return false;
  }
  if (
    protection.sourceKind !== undefined &&
    protection.sourceKind !== attempt.sourceKind
  ) {
    return false;
  }
  if (protection.sourceControllerRelation === "opponentControlled") {
    return (
      attempt.sourceControllerId !== "" &&
      sourceCardFilterMatchesProtection(state, protection, attempt)
    );
  }
  return sourceCardFilterMatchesProtection(state, protection, attempt);
};

const sourceCardFilterMatchesProtection = (
  state: GameState,
  protection: Protection,
  attempt: FieldRemovalAttempt | RestProtectionAttempt,
): boolean => {
  const filter = protection.sourceCardFilter;
  if (filter === undefined) {
    return true;
  }
  if (!isSupportedProtectionSourceCardFilter(filter)) {
    return false;
  }
  if (attempt.sourceCardId === undefined) {
    return false;
  }
  return cardMatchesSearchFilter(
    state.cardManifest.cards[attempt.sourceCardId],
    filter,
  );
};

const protectionRequiresOpponentController = (
  protection: Protection,
): boolean => {
  if (protection.process === "fieldRemoval") {
    return (
      protection.fieldRemoval.sourceControllerRelation === "opponentControlled"
    );
  }
  return protection.sourceControllerRelation === "opponentControlled";
};

const sourceControllerMatchesProtection = (
  protection: Protection,
  sourceControllerId: PlayerId,
  targetControllerId: PlayerId,
): boolean => {
  if (protection.process === "fieldRemoval") {
    const relation = protection.fieldRemoval.sourceControllerRelation;
    if (relation === "opponentControlled") {
      return sourceControllerId !== targetControllerId;
    }
    if (relation === "selfControlled") {
      return sourceControllerId === targetControllerId;
    }
    return relation === "eitherController";
  }
  if (protection.sourceControllerRelation === "opponentControlled") {
    return sourceControllerId !== targetControllerId;
  }
  if (protection.sourceControllerRelation === "selfControlled") {
    return sourceControllerId === targetControllerId;
  }
  return (
    protection.sourceControllerRelation === undefined ||
    protection.sourceControllerRelation === "eitherController"
  );
};

const restProtectionCoversAttempt = (
  state: GameState,
  protection: Protection,
  attempt: RestProtectionAttempt,
  target: CardInstance,
): boolean => {
  if (protection.process !== "rest") {
    return false;
  }
  if (protection.sourceKind !== attempt.sourceKind) {
    return false;
  }
  if (
    !sourceControllerMatchesProtection(
      protection,
      attempt.sourceControllerId,
      target.controller,
    )
  ) {
    return false;
  }
  if (!sourceCardFilterMatchesProtection(state, protection, attempt)) {
    return false;
  }
  if (protection.sourceCardCategories === undefined) {
    return true;
  }
  return (
    attempt.sourceCardCategory !== undefined &&
    protection.sourceCardCategories.includes(attempt.sourceCardCategory)
  );
};

export const applyRestProtection = (
  state: GameState,
  target: CardInstance,
  attempt: RestProtectionAttempt,
):
  | { ok: true; prevented: boolean }
  | { ok: false; reason: FieldRemovalProtectionFailureReason } => {
  const protections = fieldRemovalProtectionsForCard(state, target);
  if (!protections.ok) return protections;
  if (protections.protections.length === 0) {
    return { ok: true, prevented: false };
  }
  return {
    ok: true,
    prevented: protections.protections.some((protection) =>
      restProtectionCoversAttempt(state, protection, attempt, target),
    ),
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
    prevented: protections.protections.some((protection) => {
      if (
        protectionRequiresOpponentController(protection) &&
        attempt.attempt.sourceControllerId === target.controller
      ) {
        return false;
      }
      return (
        (attempt.attempt.sourceKind === "cardEffect" &&
          protectionCoversAttempt(state, protection, attempt.attempt)) ||
        (process.type === "ko" &&
          koProtectionCoversAttempt(state, protection, attempt.attempt))
      );
    }),
  };
};
