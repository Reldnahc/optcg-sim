import type { CardId, EffectDefinition } from "@optcg/types";
import { donMinusDrawComponentEvidenceInventoryEntry } from "./don-minus-draw-evidence.js";
import type { ExternalDeckConstructionRuleEvidence } from "./external-deck-construction-rule.js";
import { fieldCountDonConditionComponentEvidenceInventoryEntry } from "./field-count-don-condition-evidence.js";
import { optionalTrashCostKoComponentEvidenceInventoryEntry } from "./optional-trash-cost-ko-evidence.js";
import { activateMainChooseOneCostComponentEvidenceInventoryEntry } from "./activate-main-choose-one-cost-evidence.js";
import { sup001fConditionalModifyPowerComponentEvidenceInventoryEntry } from "./sup-001f-conditional-modify-power-evidence.js";
import { topNSearchComponentEvidenceInventoryEntries } from "./top-n-search-evidence.js";
import { startOfGameStagePlayComponentEvidenceInventoryEntry } from "./start-of-game-stage-play-evidence.js";
import {
  conditionalContinuousNonBaseConditionParserCertificationIds,
  listConditionalContinuousCompositionEvidenceFragments,
} from "./conditional-continuous-composition-evidence.js";
import type {
  GeneratedSupportDiagnosticDecomposition,
  GeneratedSupportUnparsedSpan,
} from "./generated-support-diagnostic-types.js";
import {
  returnDonCostWrapperComponentEvidenceId,
  returnDonCostWrapperParserRuleId,
  returnDonCostWrapperRuntimeCapabilityIds,
} from "./return-don-cost-wrapper-components.js";
import { listPrimitiveBoundaryLabels } from "./primitive-boundary-evidence.js";
import {
  buildOnPlayModifierAndRestrictionEntries,
  listAllGeneratedSupportParserCertificationIdsFromEntries,
  onKoDrawParserCertificationIds,
  onKoDrawUpToParserCertificationIds,
  onPlayConditionDrawParserCertificationIds,
  onPlayDrawParserCertificationIds,
  onPlayDrawThenTrashParserCertificationIds,
  onPlayDrawUpToParserCertificationIds,
  onPlayOptionalDrawParserCertificationIds,
  onPlayReturnDonPlaySelectedParserCertificationIds,
  onPlaySelectTargetParserCertificationIds,
  onPlaySelectThenKoParserCertificationIds,
  onPlayTrashFromHandParserCertificationIds,
  triggerDrawParserCertificationIds,
  triggerDrawUpToParserCertificationIds,
  whenAttackingDrawParserCertificationIds,
  whenAttackingDrawThenTrashParserCertificationIds,
  whenAttackingOncePerTurnDrawThenTrashParserCertificationIds,
} from "./generated-support-parser-certification-catalog.js";
export type { ExternalDeckConstructionRuleEvidence } from "./external-deck-construction-rule.js";
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
type GeneratedSupportParserResultBase = {
  cardId: CardId;
  sourceText: string;
  sourceTextHash: string;
};
export type CompleteGeneratedSupportParseResult =
  GeneratedSupportParserResultBase & {
    nonRuntimeEvidence?: readonly ExternalDeckConstructionRuleEvidence[];
    status: "complete";
    effectDefinition: EffectDefinition;
    componentEvidenceIds: readonly string[];
    parserRuleIds: readonly string[];
  };
export type PartialGeneratedSupportParseResult =
  GeneratedSupportParserResultBase & {
    status: "partial";
    blockers: readonly GeneratedSupportBlocker[];
    parsedComponentEvidenceIds: readonly string[];
    parsedRuleIds: readonly string[];
    unparsedSpans: readonly GeneratedSupportUnparsedSpan[];
  };
type BlockedGeneratedSupportParseResult<
  TStatus extends
    | "unsupportedPrimitive"
    | "ambiguousWording"
    | "staleHash"
    | "customHandlerRequired",
> = GeneratedSupportParserResultBase & {
  status: TStatus;
  blockers: readonly GeneratedSupportBlocker[];
};
export type UnsupportedPrimitiveGeneratedSupportParseResult =
  BlockedGeneratedSupportParseResult<"unsupportedPrimitive">;
export type AmbiguousWordingGeneratedSupportParseResult =
  BlockedGeneratedSupportParseResult<"ambiguousWording">;
export type StaleHashGeneratedSupportParseResult =
  BlockedGeneratedSupportParseResult<"staleHash">;
export type CustomHandlerRequiredGeneratedSupportParseResult =
  BlockedGeneratedSupportParseResult<"customHandlerRequired">;
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
const generatedSupportGateIds = {
  metadata: ["generated-support-metadata-required"],
  runtimeCapability: ["runtime-capability-matrix-v1"],
  schema: ["effect-definition-schema-v1", "sequenced-effect-schema-v1"],
  sourceIntegrity: ["source-text-hash-current", "behavior-hash-current"],
} as const;
export const {
  schema: generatedSupportSchemaGateIds,
  runtimeCapability: generatedSupportRuntimeCapabilityGateIds,
  sourceIntegrity: generatedSupportSourceIntegrityGateIds,
  metadata: generatedSupportMetadataGateIds,
} = generatedSupportGateIds;
export interface GeneratedSupportComponentEvidenceInventoryEntry {
  parserRuleId: string;
  shapeId: string;
  components: readonly GeneratedSupportComponentEvidenceCategory[];
  parserCertificationIds?: readonly string[];
  runtimeCapabilityIds: readonly string[];
  missingRuntimeCapabilityIds?: readonly string[];
  gates: {
    schema: readonly (typeof generatedSupportSchemaGateIds)[number][];
    runtimeCapability: readonly (typeof generatedSupportRuntimeCapabilityGateIds)[number][];
    sourceIntegrity: readonly (typeof generatedSupportSourceIntegrityGateIds)[number][];
    generatedSupportMetadata: readonly (typeof generatedSupportMetadataGateIds)[number][];
  };
}
export type GeneratedSupportParserCertificationEvidence = Readonly<{
  currentCertificationIds: readonly string[];
  staleCertificationIds?: readonly string[];
}>;
export function evaluateParserCertificationBlockers(
  componentEvidenceIds: readonly string[],
  evidence: GeneratedSupportParserCertificationEvidence | undefined,
): readonly GeneratedSupportBlocker[] {
  const current = new Set(evidence?.currentCertificationIds ?? []),
    stale = new Set(evidence?.staleCertificationIds ?? []);
  const requireLineSeparatedCompositionCertification =
    shouldRequireLineSeparatedCompositionCertification(componentEvidenceIds);
  return componentEvidenceIds.flatMap((component) => {
    const componentEvidenceEntry =
      findGeneratedSupportComponentEvidenceByShapeId(component);
    const parserCertificationIds =
      componentEvidenceEntry?.parserCertificationIds ?? [];
    const primitiveBoundaries = listPrimitiveBoundaryLabels({
      components: componentEvidenceEntry?.components ?? [],
      parserCertificationIds,
    });
    return parserCertificationIds.flatMap((id) => {
      if (
        id === "composition:line-separated-effect-blocks:v1" &&
        component === "line-separated-effect-blocks-composition" &&
        !requireLineSeparatedCompositionCertification
      ) {
        return [];
      }
      const isStale = stale.has(id);
      return isStale || !current.has(id)
        ? [
            {
              code: "unsupported-primitive",
              component,
              diagnosticLayer: "review",
              message: `${isStale ? "Stale" : "Missing"} parser certification ${id} for component ${component}${primitiveBoundaries.length === 0 ? "" : ` (primitive boundaries: ${primitiveBoundaries.join(", ")})`}.`,
            },
          ]
        : [];
    });
  });
}

function shouldRequireLineSeparatedCompositionCertification(
  componentEvidenceIds: readonly string[],
): boolean {
  if (
    !componentEvidenceIds.includes("line-separated-effect-blocks-composition")
  ) {
    return false;
  }

  const runtimeTriggerCapabilityIds = new Set<string>();
  componentEvidenceIds
    .filter(
      (componentEvidenceId) =>
        componentEvidenceId !== "line-separated-effect-blocks-composition",
    )
    .forEach((componentEvidenceId) => {
      const runtimeEffectBlockComponentEvidence =
        findRuntimeEffectBlockComponentEvidence(componentEvidenceId);
      if (runtimeEffectBlockComponentEvidence === undefined) {
        return;
      }

      for (const capabilityId of runtimeEffectBlockComponentEvidence.runtimeCapabilityIds) {
        if (capabilityId.startsWith("trigger:")) {
          runtimeTriggerCapabilityIds.add(capabilityId);
        }
      }
    });

  return runtimeTriggerCapabilityIds.size >= 2;
}

const knownNonRuntimeComponentEvidenceIds = new Set([
  "external-deck-rule-category-cost-gte-in-your-deck",
]);

function findRuntimeEffectBlockComponentEvidence(
  componentEvidenceId: string,
): GeneratedSupportComponentEvidenceInventoryEntry | undefined {
  if (knownNonRuntimeComponentEvidenceIds.has(componentEvidenceId)) {
    return undefined;
  }

  const entry =
    findGeneratedSupportComponentEvidenceByShapeId(componentEvidenceId);
  if (entry === undefined) {
    return undefined;
  }

  return entry.runtimeCapabilityIds.length > 0 &&
    entry.components.includes("wrapper")
    ? entry
    : undefined;
}

const parserRuleBaseComponents = [
  "schema-gate",
  "runtime-capability-gate",
  "source-integrity-gate",
  "generated-support-metadata-gate",
] as const satisfies readonly GeneratedSupportComponentEvidenceCategory[];

const drawSelfComponents = [
  "wrapper",
  "body-action",
  "source-presence-policy",
  ...parserRuleBaseComponents,
] as const satisfies readonly GeneratedSupportComponentEvidenceCategory[];
const drawThenTrashFromHandComponents = [
  "wrapper",
  "sequence",
  "body-action",
  "chooser",
  "source-presence-policy",
  ...parserRuleBaseComponents,
] as const satisfies readonly GeneratedSupportComponentEvidenceCategory[];
const parserRuleBaseGates = {
  generatedSupportMetadata: ["generated-support-metadata-required"],
  runtimeCapability: ["runtime-capability-matrix-v1"],
  schema: ["effect-definition-schema-v1"],
  sourceIntegrity: ["source-text-hash-current", "behavior-hash-current"],
} as const;
const standaloneKeywordParserCertificationIdsByParserRuleId = {
  "exact:keyword:banish:standalone": [
    "keyword:banish:printed",
    "source-presence-policy:none-for-keyword",
  ],
  "exact:keyword:blocker:standalone": [
    "keyword:blocker:printed",
    "source-presence-policy:none-for-keyword",
  ],
  "exact:keyword:double-attack:standalone": [
    "keyword:double-attack:printed",
    "source-presence-policy:none-for-keyword",
  ],
  "exact:keyword:rush-character:standalone": [
    "keyword:rush-character:printed",
    "source-presence-policy:none-for-keyword",
  ],
  "exact:keyword:rush:standalone": [
    "keyword:rush:printed",
    "source-presence-policy:none-for-keyword",
  ],
} as const;

function buildParserRuleGates(
  requiresSequencedEffectSchema: boolean,
): GeneratedSupportComponentEvidenceInventoryEntry["gates"] {
  return requiresSequencedEffectSchema
    ? {
        ...parserRuleBaseGates,
        schema: ["effect-definition-schema-v1", "sequenced-effect-schema-v1"],
      }
    : parserRuleBaseGates;
}

export const generatedSupportComponentEvidenceInventory = [
  {
    components: drawSelfComponents,
    gates: parserRuleBaseGates,
    parserCertificationIds: onPlayDrawParserCertificationIds,
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
    parserCertificationIds: onPlayTrashFromHandParserCertificationIds,
    parserRuleId: "exact:on-play:trash-n-from-hand:self",
    runtimeCapabilityIds: [
      "category:auto",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ],
    shapeId: "on-play-trash-from-hand",
  },
  {
    components: drawSelfComponents,
    gates: parserRuleBaseGates,
    parserCertificationIds: whenAttackingDrawParserCertificationIds,
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
    components: drawThenTrashFromHandComponents,
    gates: parserRuleBaseGates,
    parserCertificationIds: onPlayDrawThenTrashParserCertificationIds,
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
    components: drawThenTrashFromHandComponents,
    gates: parserRuleBaseGates,
    parserCertificationIds: whenAttackingDrawThenTrashParserCertificationIds,
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
    components: drawThenTrashFromHandComponents,
    gates: parserRuleBaseGates,
    parserCertificationIds:
      whenAttackingOncePerTurnDrawThenTrashParserCertificationIds,
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
    components: drawThenTrashFromHandComponents,
    gates: {
      ...parserRuleBaseGates,
      schema: ["effect-definition-schema-v1", "sequenced-effect-schema-v1"],
    },
    parserCertificationIds: onPlayDrawThenTrashParserCertificationIds,
    parserRuleId: "exact:on-play:trash-n-from-hand:draw-m:self",
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
    parserCertificationIds: onPlayDrawUpToParserCertificationIds,
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
    components: drawSelfComponents,
    gates: parserRuleBaseGates,
    parserCertificationIds: onPlayOptionalDrawParserCertificationIds,
    parserRuleId: "exact:on-play:optional-effect:draw-n:self",
    runtimeCapabilityIds: [
      "category:auto",
      "optionalEffectBlock:onPlay:draw-n:self",
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
    parserCertificationIds: onPlayConditionDrawParserCertificationIds,
    parserRuleId: "exact:condition:your-turn:draw-n",
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
    parserCertificationIds: onPlayConditionDrawParserCertificationIds,
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
    parserCertificationIds: onPlayReturnDonPlaySelectedParserCertificationIds,
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
    parserCertificationIds: onPlaySelectTargetParserCertificationIds,
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
    parserCertificationIds: onPlaySelectThenKoParserCertificationIds,
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
  optionalTrashCostKoComponentEvidenceInventoryEntry,
  activateMainChooseOneCostComponentEvidenceInventoryEntry,
  ...topNSearchComponentEvidenceInventoryEntries,
  startOfGameStagePlayComponentEvidenceInventoryEntry,
  ...buildOnPlayModifierAndRestrictionEntries({
    parserRuleBaseComponents,
    parserRuleBaseGates,
  }),
  {
    ...sup001fConditionalModifyPowerComponentEvidenceInventoryEntry,
    parserCertificationIds: [
      "trigger-wrapper:when-attacking",
      "condition:predicate",
      "condition:comparator-threshold",
      "body-action:modify-power",
      "target-owner:opponent",
      "target-object-kind:character",
      "target-zone:character-area",
      "chooser:self",
      "cardinality:up-to-n",
      "duration:this-turn",
      "source-presence-policy:must-remain-in-same-zone",
      "composition:conditional-when-attacking-modify-power",
    ],
  },
  {
    components: [
      "wrapper",
      "body-action",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserCertificationIds: triggerDrawParserCertificationIds,
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
    parserCertificationIds: triggerDrawUpToParserCertificationIds,
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
    parserCertificationIds: onKoDrawParserCertificationIds,
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
    parserCertificationIds: onKoDrawUpToParserCertificationIds,
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
      "keyword",
      "source-presence-policy",
      ...parserRuleBaseComponents,
    ],
    gates: parserRuleBaseGates,
    parserRuleId: "exact:keyword:blocker:standalone",
    parserCertificationIds:
      standaloneKeywordParserCertificationIdsByParserRuleId[
        "exact:keyword:blocker:standalone"
      ],
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
    parserCertificationIds:
      standaloneKeywordParserCertificationIdsByParserRuleId[
        "exact:keyword:rush:standalone"
      ],
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
    parserCertificationIds:
      standaloneKeywordParserCertificationIdsByParserRuleId[
        "exact:keyword:rush-character:standalone"
      ],
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
    parserCertificationIds:
      standaloneKeywordParserCertificationIdsByParserRuleId[
        "exact:keyword:double-attack:standalone"
      ],
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
    parserCertificationIds:
      standaloneKeywordParserCertificationIdsByParserRuleId[
        "exact:keyword:banish:standalone"
      ],
    runtimeCapabilityIds: [
      "keyword:banish:printed",
      "sourcePresencePolicy:none-for-keyword",
    ],
    shapeId: "keyword-banish",
  },
  ...listConditionalContinuousCompositionEvidenceFragments().map(
    (fragment): GeneratedSupportComponentEvidenceInventoryEntry => ({
      components: [
        ...fragment.components,
        ...parserRuleBaseComponents,
      ] as readonly GeneratedSupportComponentEvidenceCategory[],
      gates: buildParserRuleGates(fragment.requiresSequencedEffectSchema),
      parserRuleId: fragment.parserRuleId,
      ...(fragment.parserCertificationIds === undefined
        ? {}
        : { parserCertificationIds: fragment.parserCertificationIds }),
      runtimeCapabilityIds: fragment.runtimeCapabilityIds,
      shapeId: fragment.shapeId,
    }),
  ),
  {
    components: ["sequence", ...parserRuleBaseComponents],
    gates: buildParserRuleGates(true),
    parserCertificationIds: ["composition:line-separated-effect-blocks:v1"],
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

export function listAllGeneratedSupportParserCertificationIds(): readonly string[] {
  const entries: readonly GeneratedSupportComponentEvidenceInventoryEntry[] =
    generatedSupportComponentEvidenceInventory;
  return [
    ...new Set([
      ...listAllGeneratedSupportParserCertificationIdsFromEntries(entries),
      ...conditionalContinuousNonBaseConditionParserCertificationIds,
    ]),
  ];
}
