import type { ContinuousEffectRecord, Protection } from "@optcg/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const supportedFieldRemovalClassifications = new Set([
  "moveFromFieldToTrash",
  "moveFromFieldToHand",
  "moveFromFieldToDeck",
  "moveFromFieldToLife",
  "moveFromFieldToOtherZone",
]);

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
    typeof metadata["classification"] === "string" &&
    supportedFieldRemovalClassifications.has(metadata["classification"]) &&
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
