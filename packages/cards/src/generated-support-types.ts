import type { CardId, EffectDefinition } from "@optcg/types";
import { donMinusDrawComponentEvidenceInventoryEntry } from "./don-minus-draw-evidence.js";
import { fieldCountDonConditionComponentEvidenceInventoryEntry } from "./field-count-don-condition-evidence.js";
import { sup001fConditionalModifyPowerComponentEvidenceInventoryEntry } from "./sup-001f-conditional-modify-power-evidence.js";
import type {
  GeneratedSupportDiagnosticDecomposition,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-diagnostic-types.js";
import {
  returnDonCostWrapperComponentEvidenceId,
  returnDonCostWrapperParserRuleId,
  returnDonCostWrapperRuntimeCapabilityIds,
} from "./return-don-cost-wrapper-components.js";

export type {
  GeneratedSupportDiagnosticDecomposition,
  GeneratedSupportDiagnosticTraceComponent,
  GeneratedSupportDiagnosticTraceComponentKind,
  GeneratedSupportDiagnosticTraceComponentStatus,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-diagnostic-types.js";

export const generatedSupportParserResultStatuses = [
  "complete",
  "partial",
  "unsupportedPrimitive",
  "ambiguousWording",
  "staleHash",
  "customHandlerRequired",
] as const;

export type GeneratedSupportParserResultStatus =
  (typeof generatedSupportParserResultStatuses)[number];

export type GeneratedSupportBlockerCode =
  | "missing-runtime-capability"
  | "unparsed-span"
  | "unsupported-primitive"
  | "ambiguous-wording"
  | "stale-hash"
  | "custom-handler-required"
  | "invalid-dsl-schema";

export const generatedSupportDiagnosticLayers = [
  "parser",
  "schema",
  "runtime-capability",
  "source-integrity",
  "metadata",
  "review",
  "test-status",
  "stale-hash",
  "unsupported-primitive",
  "unsupported-trigger",
  "unsupported-cost",
  "unsupported-optionality",
  "unsupported-condition",
  "unsupported-cardinality",
  "unsupported-target",
  "unsupported-destination",
  "unsupported-duration",
  "unsupported-modifier",
  "unsupported-restriction",
  "unsupported-saved-reference",
  "unsupported-sequence-action-composition",
  "unsupported-layer",
] as const;

export type GeneratedSupportDiagnosticLayer =
  (typeof generatedSupportDiagnosticLayers)[number];

export type GeneratedSupportDeepestSuccessfulLayer =
  | "source-integrity"
  | "metadata"
  | "parser"
  | "schema"
  | "runtime-capability"
  | "support-status";

export interface GeneratedSupportBlocker {
  code: GeneratedSupportBlockerCode;
  message: string;
  capabilityId?: string;
  component?: string;
  decomposition?: GeneratedSupportDiagnosticDecomposition;
  diagnosticLayer?: GeneratedSupportDiagnosticLayer;
  schemaValidated?: boolean;
  expectedHash?: string;
  parserRuleId?: string;
  receivedHash?: string;
  span?: GeneratedSupportUnparsedSpan;
}

interface GeneratedSupportParserResultBase {
  cardId: CardId;
  sourceText: string;
  sourceTextHash: string;
}

export interface CompleteGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "complete";
  effectDefinition: EffectDefinition;
  componentEvidenceIds: readonly string[];
  parserRuleIds: readonly string[];
}

export interface PartialGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "partial";
  blockers: readonly GeneratedSupportBlocker[];
  parsedComponentEvidenceIds: readonly string[];
  parsedRuleIds: readonly string[];
  unparsedSpans: readonly GeneratedSupportUnparsedSpan[];
}

export interface UnsupportedPrimitiveGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "unsupportedPrimitive";
  blockers: readonly GeneratedSupportBlocker[];
}

export interface AmbiguousWordingGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "ambiguousWording";
  blockers: readonly GeneratedSupportBlocker[];
}

export interface StaleHashGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "staleHash";
  blockers: readonly GeneratedSupportBlocker[];
}

export interface CustomHandlerRequiredGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "customHandlerRequired";
  blockers: readonly GeneratedSupportBlocker[];
}

export type GeneratedSupportParserResult =
  | CompleteGeneratedSupportParseResult
  | PartialGeneratedSupportParseResult
  | UnsupportedPrimitiveGeneratedSupportParseResult
  | AmbiguousWordingGeneratedSupportParseResult
  | StaleHashGeneratedSupportParseResult
  | CustomHandlerRequiredGeneratedSupportParseResult;

export function isCompleteGeneratedSupportParseResult(
  result: GeneratedSupportParserResult,
): result is CompleteGeneratedSupportParseResult {
  return result.status === "complete";
}

export const generatedSupportComponentEvidenceCategories = [
  "wrapper",
  "body-action",
  "sequence",
  "cost",
  "condition",
  "cardinality",
  "target",
  "chooser",
  "duration",
  "modifier",
  "restriction",
  "saved-reference",
  "source-presence-policy",
  "keyword",
  "schema-gate",
  "runtime-capability-gate",
  "source-integrity-gate",
  "generated-support-metadata-gate",
] as const;

export type GeneratedSupportComponentEvidenceCategory =
  (typeof generatedSupportComponentEvidenceCategories)[number];

export const generatedSupportSchemaGateIds = [
  "effect-definition-schema-v1",
  "sequenced-effect-schema-v1",
] as const;

export const generatedSupportRuntimeCapabilityGateIds = [
  "runtime-capability-matrix-v1",
] as const;

export const generatedSupportSourceIntegrityGateIds = [
  "source-text-hash-current",
  "behavior-hash-current",
] as const;

export const generatedSupportMetadataGateIds = [
  "generated-support-metadata-required",
] as const;

type GeneratedSupportSchemaGateId =
  (typeof generatedSupportSchemaGateIds)[number];
type GeneratedSupportRuntimeCapabilityGateId =
  (typeof generatedSupportRuntimeCapabilityGateIds)[number];
type GeneratedSupportSourceIntegrityGateId =
  (typeof generatedSupportSourceIntegrityGateIds)[number];
type GeneratedSupportMetadataGateId =
  (typeof generatedSupportMetadataGateIds)[number];

export interface GeneratedSupportComponentEvidenceInventoryEntry {
  parserRuleId: string;
  shapeId: string;
  components: readonly GeneratedSupportComponentEvidenceCategory[];
  runtimeCapabilityIds: readonly string[];
  missingRuntimeCapabilityIds?: readonly string[];
  gates: {
    schema: readonly GeneratedSupportSchemaGateId[];
    runtimeCapability: readonly GeneratedSupportRuntimeCapabilityGateId[];
    sourceIntegrity: readonly GeneratedSupportSourceIntegrityGateId[];
    generatedSupportMetadata: readonly GeneratedSupportMetadataGateId[];
  };
}

const parserRuleBaseComponents = [
  "schema-gate",
  "runtime-capability-gate",
  "source-integrity-gate",
  "generated-support-metadata-gate",
] as const satisfies readonly GeneratedSupportComponentEvidenceCategory[];

const parserRuleBaseGates = {
  generatedSupportMetadata: ["generated-support-metadata-required"],
  runtimeCapability: ["runtime-capability-matrix-v1"],
  schema: ["effect-definition-schema-v1"],
  sourceIntegrity: ["source-text-hash-current", "behavior-hash-current"],
} as const;

export const generatedSupportComponentEvidenceInventory = [
  {
    components: [
      "wrapper",
      "body-action",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:draw-n:self",
    runtimeCapabilityIds: [
      "category:auto",
      "effect:draw:self:count:positive-safe-integer",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-draw",
  },
  {
    components: [
      "wrapper",
      "body-action",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:when-attacking:draw-n:self",
    runtimeCapabilityIds: [
      "category:auto",
      "effect:draw:self:count:positive-safe-integer",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:whenAttacking",
    ],
    shapeId: "when-attacking-draw",
  },
  {
    components: [
      "wrapper",
      "sequence",
      "body-action",
      "chooser",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:draw-n:trash-m:hand:self",
    runtimeCapabilityIds: [
      "category:auto",
      "effect:sequence:ordered",
      "effect:draw:self:count:positive-safe-integer",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-draw-then-trash-from-hand",
  },
  {
    components: [
      "wrapper",
      "sequence",
      "body-action",
      "chooser",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:when-attacking:draw-n:trash-m:hand:self",
    runtimeCapabilityIds: [
      "category:auto",
      "effect:sequence:ordered",
      "effect:draw:self:count:positive-safe-integer",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:whenAttacking",
    ],
    shapeId: "when-attacking-draw-then-trash-from-hand",
  },
  {
    components: [
      "wrapper",
      "sequence",
      "body-action",
      "chooser",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
    runtimeCapabilityIds: [
      "category:auto",
      "effect:sequence:ordered",
      "effect:draw:self:count:positive-safe-integer",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:whenAttacking:oncePerTurn",
    ],
    shapeId: "when-attacking-once-per-turn-draw-then-trash-from-hand",
  },
  {
    components: [
      "wrapper",
      "sequence",
      "body-action",
      "chooser",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: {
      ...parserRuleBaseGates,
      schema: ["effect-definition-schema-v1", "sequenced-effect-schema-v1"],
    },
    parserRuleId: "exact:on-play:trash-2-from-hand:draw-1:self",
    runtimeCapabilityIds: [
      "category:auto",
      "sequence:trashFromHand:draw",
      "effect:sequence:ordered",
      "trashFromHand:segment0:self:self:count-exact",
      "effect:draw:self:count:positive-safe-integer",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sequence:genericFrames",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-trash-from-hand-then-draw",
  },
  {
    components: [
      "wrapper",
      "body-action",
      "cardinality",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:draw-up-to-n:self",
    runtimeCapabilityIds: [
      "category:auto",
      "drawUpTo:self:chooseQuantity",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-draw-up-to",
  },
  {
    components: [
      "wrapper",
      "body-action",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:optional-effect:draw-1:self",
    runtimeCapabilityIds: [
      "category:auto",
      "optionalEffectBlock:onPlay:draw-1:self",
      "effect:draw:self:count:positive-safe-integer",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-optional-draw",
  },
  {
    components: [
      "wrapper",
      "condition",
      "body-action",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:condition:your-turn",
    runtimeCapabilityIds: [
      "category:auto",
      "condition:yourTurn",
      "effect:draw:self:count:positive-safe-integer",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-condition-your-turn-draw",
  },
  {
    components: [
      "wrapper",
      "condition",
      "body-action",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:condition:self-attached-don-count",
    runtimeCapabilityIds: [
      "category:auto",
      "condition:selfAttachedDonCount",
      "effect:draw:self:count:positive-safe-integer",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-condition-self-attached-don-count-draw",
  },
  fieldCountDonConditionComponentEvidenceInventoryEntry,
  {
    components: [
      "wrapper",
      "sequence",
      "cost",
      "cardinality",
      "target",
      "chooser",
      "saved-reference",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: {
      ...parserRuleBaseGates,
      schema: ["effect-definition-schema-v1", "sequenced-effect-schema-v1"],
    },
    parserRuleId:
      "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
    runtimeCapabilityIds: [
      "category:auto",
      "returnDon:cost:self:count-exact",
      "payCost:returnDon:self:count-exact",
      "selectCards:hand:self:character:max1",
      "playSelected:hand:character:max1",
      "playSelected:hand:character:max1:ignoreCost",
      "sequence:genericFrames",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-return-don-then-play-selected-character",
  },
  donMinusDrawComponentEvidenceInventoryEntry,
  {
    components: ["cost", ...parserRuleBaseComponents],
    gates: parserRuleBaseGates,
    parserRuleId: returnDonCostWrapperParserRuleId,
    runtimeCapabilityIds: returnDonCostWrapperRuntimeCapabilityIds,
    shapeId: returnDonCostWrapperComponentEvidenceId,
  },
  {
    components: [
      "wrapper",
      "cardinality",
      "target",
      "chooser",
      "saved-reference",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:select-1-opponent-character-target",
    runtimeCapabilityIds: [
      "category:auto",
      "selectTargets:field:public:character:max1",
      "savedSelectedTargets:producer",
      "sequence:genericFrames",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-select-opponent-character-target",
  },
  {
    components: [
      "wrapper",
      "sequence",
      "cardinality",
      "target",
      "chooser",
      "saved-reference",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId:
      "exact:on-play:select-1-opponent-character-then-ko-that-character",
    runtimeCapabilityIds: [
      "category:auto",
      "selectTargets:field:public:character:max1",
      "savedSelectedTargets:producer",
      "savedFieldObject:consumer:generic",
      "effect:ko:saved-field-object:characterArea:public",
      "sequence:genericFrames",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-select-opponent-character-then-ko",
  },
  {
    components: [
      "wrapper",
      "modifier",
      "duration",
      "target",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:modify-power:self:this-turn",
    runtimeCapabilityIds: [
      "category:auto",
      "modifyPower:self:thisTurn",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-modify-power-self-this-turn",
  },
  {
    components: [
      "wrapper",
      "modifier",
      "duration",
      "target",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:modify-power:self:this-battle",
    runtimeCapabilityIds: [
      "category:auto",
      "modifyPower:self:thisBattle",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-modify-power-self-this-battle",
  },
  {
    components: [
      "wrapper",
      "modifier",
      "duration",
      "target",
      "chooser",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:modify-power:choose:this-turn",
    runtimeCapabilityIds: [
      "category:auto",
      "modifyPower:choose:thisTurn",
      "modifyPower:choose:thisTurn:zeroChoiceBranch",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-modify-power-choose-this-turn",
  },
  sup001fConditionalModifyPowerComponentEvidenceInventoryEntry,
  {
    components: [
      "wrapper",
      "modifier",
      "duration",
      "target",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:modify-power:all:this-turn",
    runtimeCapabilityIds: [
      "category:auto",
      "modifyPower:all:thisTurn",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-modify-power-all-this-turn",
  },
  {
    components: [
      "wrapper",
      "restriction",
      "duration",
      "target",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:cannot-attack:self:this-turn",
    runtimeCapabilityIds: [
      "category:auto",
      "cannotAttack:self:thisTurn",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-cannot-attack-self-this-turn",
  },
  {
    components: [
      "wrapper",
      "restriction",
      "duration",
      "target",
      "chooser",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:cannot-attack:choose:this-turn",
    runtimeCapabilityIds: [
      "category:auto",
      "cannotAttack:choose:thisTurn",
      "cannotAttack:choose:thisTurn:zeroChoiceBranch",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-cannot-attack-choose-this-turn",
  },
  {
    components: [
      "wrapper",
      "restriction",
      "duration",
      "target",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:cannot-attack:all:this-turn",
    runtimeCapabilityIds: [
      "category:auto",
      "cannotAttack:all:thisTurn",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-cannot-attack-all-this-turn",
  },
  {
    components: [
      "wrapper",
      "restriction",
      "duration",
      "target",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:cannot-block:self:this-turn",
    runtimeCapabilityIds: [
      "category:auto",
      "cannotBlock:self:thisTurn",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-cannot-block-self-this-turn",
  },
  {
    components: [
      "wrapper",
      "restriction",
      "duration",
      "target",
      "chooser",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:cannot-block:choose:this-turn",
    runtimeCapabilityIds: [
      "category:auto",
      "cannotBlock:choose:thisTurn",
      "cannotBlock:choose:thisTurn:zeroChoiceBranch",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-cannot-block-choose-this-turn",
  },
  {
    components: [
      "wrapper",
      "body-action",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:trigger:draw-n:self",
    runtimeCapabilityIds: [
      "category:auto",
      "effect:draw:self:count:positive-safe-integer",
      "sourcePresencePolicy:noSourceRequired",
      "trigger:trigger",
    ],
    shapeId: "trigger-draw",
  },
  {
    components: [
      "wrapper",
      "body-action",
      "cardinality",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:trigger:draw-up-to-n:self",
    runtimeCapabilityIds: [
      "category:auto",
      "drawUpTo:self:chooseQuantity",
      "sourcePresencePolicy:noSourceRequired",
      "trigger:trigger",
    ],
    shapeId: "trigger-draw-up-to",
  },
  {
    components: [
      "wrapper",
      "body-action",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-ko:draw-n:self",
    runtimeCapabilityIds: [
      "category:auto",
      "effect:draw:self:count:positive-safe-integer",
      "sourcePresencePolicy:resolveFromDestinationZone",
      "trigger:onKO",
    ],
    shapeId: "on-ko-draw",
  },
  {
    components: [
      "wrapper",
      "body-action",
      "cardinality",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-ko:draw-up-to-n:self",
    runtimeCapabilityIds: [
      "category:auto",
      "drawUpTo:self:chooseQuantity",
      "sourcePresencePolicy:resolveFromDestinationZone",
      "trigger:onKO",
    ],
    shapeId: "on-ko-draw-up-to",
  },
  {
    components: [
      "wrapper",
      "restriction",
      "duration",
      "target",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:on-play:cannot-block:all:this-turn",
    runtimeCapabilityIds: [
      "category:auto",
      "cannotBlock:all:thisTurn",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-cannot-block-all-this-turn",
  },
  {
    components: [
      "keyword",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:keyword:blocker:standalone",
    runtimeCapabilityIds: [
      "keyword:blocker:printed",
      "sourcePresencePolicy:none-for-keyword",
    ],
    shapeId: "keyword-blocker",
  },
  {
    components: [
      "keyword",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:keyword:rush:standalone",
    runtimeCapabilityIds: [
      "keyword:rush:printed",
      "sourcePresencePolicy:none-for-keyword",
    ],
    shapeId: "keyword-rush",
  },
  {
    components: [
      "keyword",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:keyword:rush-character:standalone",
    runtimeCapabilityIds: [
      "keyword:rushCharacter:printed",
      "sourcePresencePolicy:none-for-keyword",
    ],
    shapeId: "keyword-rush-character",
  },
  {
    components: [
      "keyword",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:keyword:double-attack:standalone",
    runtimeCapabilityIds: [
      "keyword:doubleAttack:printed",
      "sourcePresencePolicy:none-for-keyword",
    ],
    shapeId: "keyword-double-attack",
  },
  {
    components: [
      "keyword",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:keyword:banish:standalone",
    runtimeCapabilityIds: [
      "keyword:banish:printed",
      "sourcePresencePolicy:none-for-keyword",
    ],
    shapeId: "keyword-banish",
  },
  {
    components: [
      "condition",
      "sequence",
      "keyword",
      "restriction",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: {
      ...parserRuleBaseGates,
      schema: ["effect-definition-schema-v1", "sequenced-effect-schema-v1"],
    },
    parserRuleId:
      "exact:conditional-continuous:trash-count:keyword-grant-and-protection:self-character",
    runtimeCapabilityIds: [
      "category:permanent",
      "trigger:permanent",
      "effect:sequence:ordered",
      "effect:giveKeyword:self:permanent:allowlisted",
      "effect:giveProtection:fieldRemoval:thisCard:permanent",
      "sourcePresencePolicy:mustRemainInSameZone",
    ],
    shapeId: "conditional-continuous-trash-count-keyword-grant-and-protection",
  },
  {
    components: ["sequence", ...parserRuleBaseComponents],
    gates: {
      ...parserRuleBaseGates,
      schema: ["effect-definition-schema-v1", "sequenced-effect-schema-v1"],
    },
    parserRuleId: "line-separated-effect-blocks:v1",
    runtimeCapabilityIds: ["composition:line-separated-effect-blocks:v1"],
    shapeId: "line-separated-effect-blocks-composition",
  },
] as const satisfies readonly GeneratedSupportComponentEvidenceInventoryEntry[];

export interface GeneratedSupportComponentEvidenceSnapshot {
  parserRuleId: string;
  shapeId: string;
  components: readonly GeneratedSupportComponentEvidenceCategory[];
  runtimeCapabilityIds: readonly string[];
  missingRuntimeCapabilityIds: readonly string[];
  missingRequirements: readonly GeneratedSupportComponentEvidenceCategory[];
  isSupportReady: boolean;
}

export function findGeneratedSupportComponentEvidenceByParserRuleId(
  parserRuleId: string,
): GeneratedSupportComponentEvidenceInventoryEntry | undefined {
  return generatedSupportComponentEvidenceInventory.find(
    (entry) => entry.parserRuleId === parserRuleId,
  );
}

export function findGeneratedSupportComponentEvidenceByShapeId(
  shapeId: string,
): GeneratedSupportComponentEvidenceInventoryEntry | undefined {
  return generatedSupportComponentEvidenceInventory.find(
    (entry) => entry.shapeId === shapeId,
  );
}

export function listRequiredRuntimeCapabilityIdsForParserRuleId(
  parserRuleId: string,
): readonly string[] {
  return (
    findGeneratedSupportComponentEvidenceByParserRuleId(parserRuleId)
      ?.runtimeCapabilityIds ?? []
  );
}

export function listPlannedMissingRuntimeCapabilityIdsForParserRuleId(
  parserRuleId: string,
): readonly string[] {
  return (
    findGeneratedSupportComponentEvidenceByParserRuleId(parserRuleId)
      ?.missingRuntimeCapabilityIds ?? []
  );
}

export function listRequiredRuntimeCapabilityIdsForComponentEvidenceId(
  componentEvidenceId: string,
): readonly string[] {
  return (
    findGeneratedSupportComponentEvidenceByShapeId(componentEvidenceId)
      ?.runtimeCapabilityIds ?? []
  );
}

export function listPlannedMissingRuntimeCapabilityIdsForComponentEvidenceId(
  componentEvidenceId: string,
): readonly string[] {
  return (
    findGeneratedSupportComponentEvidenceByShapeId(componentEvidenceId)
      ?.missingRuntimeCapabilityIds ?? []
  );
}

export function listComponentEvidenceIdsForParserRuleIds(
  parserRuleIds: readonly string[],
): readonly string[] {
  return [
    ...new Set(
      parserRuleIds.flatMap((parserRuleId) => {
        const entry =
          findGeneratedSupportComponentEvidenceByParserRuleId(parserRuleId);
        return entry === undefined ? [] : [entry.shapeId];
      }),
    ),
  ].sort();
}

type GeneratedSupportComponentEvidenceInventoryEntryOverride = Omit<
  Partial<GeneratedSupportComponentEvidenceInventoryEntry>,
  "gates"
> & {
  gates?: Partial<GeneratedSupportComponentEvidenceInventoryEntry["gates"]>;
};

export function buildGeneratedSupportComponentEvidenceSnapshot({
  parserRuleId,
  override,
}: {
  parserRuleId: string;
  override?: GeneratedSupportComponentEvidenceInventoryEntryOverride;
}): GeneratedSupportComponentEvidenceSnapshot {
  const base = generatedSupportComponentEvidenceInventory.find(
    (entry) => entry.parserRuleId === parserRuleId,
  );
  if (base === undefined) {
    throw new Error(
      `No generated-support evidence inventory for ${parserRuleId}`,
    );
  }

  const merged: GeneratedSupportComponentEvidenceInventoryEntry = {
    ...base,
    ...override,
    gates: { ...base.gates, ...override?.gates },
  };

  const missingRequirements: GeneratedSupportComponentEvidenceCategory[] = [];
  const missingRuntimeCapabilityIds = merged.missingRuntimeCapabilityIds ?? [];
  const baseRequiredComponents = new Set(base.components);
  for (const requiredComponent of baseRequiredComponents) {
    if (!merged.components.includes(requiredComponent)) {
      missingRequirements.push(requiredComponent);
    }
  }
  if (merged.runtimeCapabilityIds.length === 0) {
    missingRequirements.push("runtime-capability-gate");
  }
  if (missingRuntimeCapabilityIds.length > 0) {
    missingRequirements.push("runtime-capability-gate");
  }
  if (merged.gates.schema.length === 0) {
    missingRequirements.push("schema-gate");
  }
  if (merged.gates.runtimeCapability.length === 0) {
    missingRequirements.push("runtime-capability-gate");
  }
  if (merged.gates.sourceIntegrity.length === 0) {
    missingRequirements.push("source-integrity-gate");
  }
  if (merged.gates.generatedSupportMetadata.length === 0) {
    missingRequirements.push("generated-support-metadata-gate");
  }
  const dedupedMissingRequirements = [...new Set(missingRequirements)];

  return {
    components: merged.components,
    isSupportReady: dedupedMissingRequirements.length === 0,
    missingRuntimeCapabilityIds,
    missingRequirements: dedupedMissingRequirements,
    parserRuleId: merged.parserRuleId,
    runtimeCapabilityIds: merged.runtimeCapabilityIds,
    shapeId: merged.shapeId,
  };
}
