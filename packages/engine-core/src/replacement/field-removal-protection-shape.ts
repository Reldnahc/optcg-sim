import type {
  CardFilter,
  ContinuousEffectRecord,
  Protection,
} from "@optcg/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const supportedFieldRemovalClassifications = new Set([
  "moveFromFieldToTrash",
  "moveFromFieldToHand",
  "moveFromFieldToDeck",
  "moveFromFieldToLife",
  "moveFromFieldToOtherZone",
]);

const supportedRestSourceCategories = new Set([
  "leader",
  "character",
  "event",
  "stage",
]);

const supportedSourceControllerRelations = new Set([
  "opponentControlled",
  "selfControlled",
  "eitherController",
]);

const supportedTargetScopes = new Set(["thisCard", "anyFieldCard"]);

const isSupportedSourceCardFilter = (
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) return true;
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.length > 0 &&
    keys.every(
      (key) =>
        key === "attributesAny" ||
        key === "attributesNotAny" ||
        key === "categories" ||
        key === "power",
    )
  );
};

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
    typeof metadata["sourceControllerRelation"] === "string" &&
    supportedSourceControllerRelations.has(
      metadata["sourceControllerRelation"],
    ) &&
    typeof metadata["targetScope"] === "string" &&
    supportedTargetScopes.has(metadata["targetScope"]) &&
    exclusions["battleKO"] === "excluded" &&
    exclusions["ruleProcessTrash"] === "excluded" &&
    exclusions["controllerCost"] === "excluded" &&
    exclusions["controllerOwnedEffect"] === "excluded" &&
    exclusions["ambiguousCustomRemoval"] === "failClosed" &&
    isSupportedSourceCardFilter(protection.sourceCardFilter)
  );
};

export const isSupportedRestProtection = (
  protection: Protection,
): protection is Extract<Protection, { process: "rest" }> => {
  if (protection.process !== "rest") return false;
  const categories = protection.sourceCardCategories;
  return (
    protection.sourceKind === "cardEffect" &&
    (protection.sourceControllerRelation === "opponentControlled" ||
      protection.sourceControllerRelation === "selfControlled" ||
      protection.sourceControllerRelation === "eitherController") &&
    (categories === undefined ||
      (Array.isArray(categories) &&
        categories.length > 0 &&
        categories.every((category) =>
          supportedRestSourceCategories.has(category),
        ))) &&
    isSupportedSourceCardFilter(protection.sourceCardFilter)
  );
};

export const hasOnlyBattleIrrelevantProtections = (
  protections: readonly Protection[],
): boolean =>
  protections.every(
    (protection) =>
      protection.process === "fieldRemoval" ||
      protection.process === "rest" ||
      (protection.process === "ko" && protection.sourceKind === "cardEffect"),
  );

export const malformedFieldRemovalProtectionMessage = (
  effect: ContinuousEffectRecord,
): string =>
  `Unsupported continuous effect ${effect.id}: malformed field-removal protection metadata.`;
