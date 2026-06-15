import type { ContinuousEffectRecord, Protection } from "@optcg/types";

import {
  isSupportedFieldRemovalProtection,
  isSupportedProtectionSourceCardFilter,
  isSupportedRestProtection,
  malformedFieldRemovalProtectionMessage,
} from "./field-removal-protection-shape.js";

type ProtectionOperation = Extract<
  ContinuousEffectRecord["modifier"]["operation"],
  { type: "protection" }
>;

export type ProtectionModifierEffect = ContinuousEffectRecord & {
  modifier: ContinuousEffectRecord["modifier"] & {
    layer: "protection";
    operation: ProtectionOperation;
  };
};

export type UnsupportedProtectionReason =
  | "malformed-field-removal-protection"
  | "unsupported-protection-shape";

export const isProtectionModifier = (
  effect: ContinuousEffectRecord,
): effect is ProtectionModifierEffect =>
  effect.modifier.layer === "protection" &&
  effect.modifier.operation.type === "protection";

export const isFieldRemovalProtectionModifier = (
  effect: ContinuousEffectRecord,
): effect is ProtectionModifierEffect =>
  isProtectionModifier(effect) &&
  effect.modifier.operation.protection.process === "fieldRemoval";

export const isSupportedKoProtection = (
  protection: Protection,
): protection is Extract<Protection, { process: "ko" }> =>
  protection.process === "ko" &&
  (protection.sourceKind === "cardEffect" ||
    protection.sourceKind === "battle") &&
  (protection.sourceControllerRelation === undefined ||
    protection.sourceControllerRelation === "opponentControlled" ||
    protection.sourceControllerRelation === "selfControlled" ||
    protection.sourceControllerRelation === "eitherController") &&
  (protection.sourceCardFilter === undefined ||
    isSupportedProtectionSourceCardFilter(protection.sourceCardFilter));

export const getUnsupportedProtectionReason = (
  protection: Protection,
): UnsupportedProtectionReason | undefined => {
  if (protection.process === "fieldRemoval") {
    return isSupportedFieldRemovalProtection(protection)
      ? undefined
      : "malformed-field-removal-protection";
  }
  if (
    isSupportedRestProtection(protection) ||
    isSupportedKoProtection(protection)
  ) {
    return undefined;
  }
  return "unsupported-protection-shape";
};

export const isSupportedProtection = (protection: Protection): boolean =>
  getUnsupportedProtectionReason(protection) === undefined;

export const unsupportedProtectionMessage = (
  reason: UnsupportedProtectionReason,
  options: {
    readonly fallbackMessage: string;
    readonly effectId?: ContinuousEffectRecord["id"];
  },
): string => {
  if (reason === "malformed-field-removal-protection") {
    return malformedFieldRemovalProtectionMessage({
      id: options.effectId ?? "implemented-dsl:malformed-protection",
    } as ContinuousEffectRecord);
  }
  return options.fallbackMessage;
};

export {
  isSupportedFieldRemovalProtection,
  isSupportedProtectionSourceCardFilter,
  malformedFieldRemovalProtectionMessage,
} from "./field-removal-protection-shape.js";
