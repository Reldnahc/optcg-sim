import type { GeneratedSupportComponentEvidenceInventoryEntry } from "./generated-support-types.js";

export const activateMainChooseOneCostParserRuleId =
  "exact:activate-main:once-per-turn:optional-choose-one-trash-self-field-type-or-hand:draw-n:self";

export const activateMainChooseOneCostComponentEvidenceId =
  "activate-main-once-per-turn-optional-choose-one-trash-self-field-type-or-hand-then-draw";

export const activateMainChooseOneCostRuntimeCapabilityIds = [
  "category:activate",
  "trigger:activateMain",
  "activateMain:source:leader-character-stage",
  "activateMain:oncePerTurn:legal-commitment",
  "payCost:chooseOne:optional:trashFromField-or-trashFromHand:self",
  "payCost:trashFromField:self:characterArea:character:typesAny:count-exact:optional",
  "payCost:trashFromHand:self:count-exact:optional",
  "sequence:genericFrames",
  "sourcePresencePolicy:mustRemainInSameZone",
  "effect:draw:self:count:positive-safe-integer",
] as const;

export const activateMainChooseOneCostParserCertificationIds = [
  "trigger-wrapper:activate-main",
  "activate-main-wrapper:once-per-turn",
  "optional-cost-marker:you-may",
  "cost-connector:choose-one-or",
  "cost-alternative:trash-from-field-self-character-type",
  "cost-alternative:trash-from-hand-unfiltered",
  "cost-body-separator:colon",
  "body-action:draw-n",
  "composition:activate-main-optional-choose-one-trash-cost-draw",
] as const;

export const activateMainChooseOneCostComponentEvidenceInventoryEntry = {
  components: [
    "wrapper",
    "sequence",
    "cost",
    "cardinality",
    "target",
    "chooser",
    "source-presence-policy",
    "body-action",
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
  parserRuleId: activateMainChooseOneCostParserRuleId,
  parserCertificationIds: activateMainChooseOneCostParserCertificationIds,
  runtimeCapabilityIds: activateMainChooseOneCostRuntimeCapabilityIds,
  shapeId: activateMainChooseOneCostComponentEvidenceId,
} as const satisfies GeneratedSupportComponentEvidenceInventoryEntry;

export const activateMainChooseOneCostRuntimeCapabilityRecords = [
  {
    description:
      "SUP-003B supports Activate Main category blocks with activate-main trigger timing and legal once-per-turn commitment handling.",
    id: "category:activate",
    kind: "category",
    sinceStory: "SUP-003B",
    supported: true,
    supportedParserRuleIds: [activateMainChooseOneCostParserRuleId],
  },
  {
    description:
      "SUP-003B supports Activate Main trigger timing and source scope for activate effects.",
    id: "trigger:activateMain",
    kind: "trigger",
    sinceStory: "SUP-003B",
    supported: true,
    supportedParserRuleIds: [activateMainChooseOneCostParserRuleId],
  },
  {
    description:
      "SUP-003B supports Activate Main source scopes from Leader, Character, and Stage origins.",
    id: "activateMain:source:leader-character-stage",
    kind: "trigger",
    sinceStory: "SUP-003B",
    supported: true,
    supportedParserRuleIds: [activateMainChooseOneCostParserRuleId],
  },
  {
    description:
      "SUP-003C supports Activate Main once-per-turn legal commitment semantics.",
    id: "activateMain:oncePerTurn:legal-commitment",
    kind: "composition",
    sinceStory: "SUP-003C",
    supported: true,
    supportedParserRuleIds: [activateMainChooseOneCostParserRuleId],
  },
  {
    description:
      "SUP-003C supports optional choose-one payCost between self field typed Character trash and self hand trash.",
    id: "payCost:chooseOne:optional:trashFromField-or-trashFromHand:self",
    kind: "cost",
    sinceStory: "SUP-003C",
    supported: true,
    supportedParserRuleIds: [activateMainChooseOneCostParserRuleId],
  },
  {
    description:
      "SUP-003C supports optional self field Character-area trash costs with category/type filters and exact count.",
    id: "payCost:trashFromField:self:characterArea:character:typesAny:count-exact:optional",
    kind: "cost",
    sinceStory: "SUP-003C",
    supported: true,
    supportedParserRuleIds: [activateMainChooseOneCostParserRuleId],
  },
] as const;

type CapabilityParserRuleInput = {
  readonly id: string;
  readonly supportedParserRuleIds: readonly string[];
};

export function withActivateMainChooseOneCostParserRuleId(
  capability: CapabilityParserRuleInput,
): readonly string[] {
  if (
    !activateMainChooseOneCostRuntimeCapabilityIds.some(
      (capabilityId) => capabilityId === capability.id,
    )
  ) {
    return capability.supportedParserRuleIds;
  }
  return [
    ...new Set([
      ...capability.supportedParserRuleIds,
      activateMainChooseOneCostParserRuleId,
    ]),
  ].sort();
}
