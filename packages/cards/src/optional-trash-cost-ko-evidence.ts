import type { GeneratedSupportComponentEvidenceInventoryEntry } from "./generated-support-types.js";

export const optionalTrashCostKoParserRuleId =
  "exact:on-play:optional-trash-n-from-hand:ko-up-to-1-opponent-character-base-cost-n-or-less";

export const optionalTrashCostKoComponentEvidenceId =
  "on-play-optional-trash-from-hand-ko-base-cost";

export const optionalTrashCostKoRuntimeCapabilityIds = [
  "category:auto",
  "payCost:trashFromHand:self:count-exact:optional",
  "selectTargets:field:public:character:max1:cost-max",
  "savedSelectedTargets:producer",
  "savedFieldObject:consumer:generic",
  "effect:ko:saved-field-object:characterArea:public",
  "sequence:genericFrames",
  "sourcePresencePolicy:mustRemainInSameZone",
  "trigger:onPlay",
] as const;

export const optionalTrashCostKoParserCertificationIds = [
  "optional-cost-wrapper:on-play-trash-from-hand",
  "target-filter:opponent-character-base-cost-max",
  "saved-target-ko-consumer:opponent-character",
  "composition:on-play-optional-trash-ko-sequence",
] as const;

export const optionalTrashCostKoComponentEvidenceInventoryEntry = {
  components: [
    "wrapper",
    "sequence",
    "cost",
    "cardinality",
    "target",
    "chooser",
    "saved-reference",
    "source-presence-policy",
    "schema-gate",
    "runtime-capability-gate",
    "source-integrity-gate",
    "generated-support-metadata-gate",
  ],
  gates: {
    generatedSupportMetadata: ["generated-support-metadata-required"],
    runtimeCapability: ["runtime-capability-matrix-v1"],
    schema: ["effect-definition-schema-v1", "sequenced-effect-schema-v1"],
    sourceIntegrity: ["source-text-hash-current", "behavior-hash-current"],
  },
  parserRuleId: optionalTrashCostKoParserRuleId,
  parserCertificationIds: optionalTrashCostKoParserCertificationIds,
  runtimeCapabilityIds: optionalTrashCostKoRuntimeCapabilityIds,
  shapeId: optionalTrashCostKoComponentEvidenceId,
} as const satisfies GeneratedSupportComponentEvidenceInventoryEntry;

export const optionalTrashCostKoRuntimeCapabilityRecords = [
  {
    description:
      "SUP-002A-authored optional trash-from-hand costs can be paid by the source controller through SUP-002B sequence runtime frames.",
    id: "payCost:trashFromHand:self:count-exact:optional",
    kind: "cost",
    sinceStory: "SUP-002B",
    supported: true,
    supportedParserRuleIds: [optionalTrashCostKoParserRuleId],
  },
  {
    description:
      "SUP-002B can select up to one public field Character with a SUP-002A-authored base-cost maximum filter.",
    id: "selectTargets:field:public:character:max1:cost-max",
    kind: "decision",
    sinceStory: "SUP-002B",
    supported: true,
    supportedParserRuleIds: [optionalTrashCostKoParserRuleId],
  },
] as const;
