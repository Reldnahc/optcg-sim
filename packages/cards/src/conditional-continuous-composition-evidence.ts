import type { Effect } from "@optcg/types";

export type ConditionalContinuousCompositionVariant = {
  readonly includesBasePower: boolean;
  readonly includesKeyword: boolean;
  readonly includesProtection: boolean;
  readonly isSequence: boolean;
  readonly parserRuleId: string;
  readonly shapeId: string;
};

export type ConditionalContinuousCompositionEvidenceFragment = {
  readonly parserRuleId: ConditionalContinuousParserRuleId;
  readonly shapeId: ConditionalContinuousShapeId;
  readonly components: readonly string[];
  readonly runtimeCapabilityIds: readonly string[];
  readonly requiresSequencedEffectSchema: boolean;
};

export const conditionalContinuousCompositionVariants = [
  {
    includesBasePower: false,
    includesKeyword: true,
    includesProtection: false,
    isSequence: false,
    parserRuleId:
      "exact:conditional-continuous:condition:body-part-composition:self-character:direct:keyword",
    shapeId:
      "conditional-continuous-condition-body-part-composition-direct-keyword",
  },
  {
    includesBasePower: false,
    includesKeyword: false,
    includesProtection: true,
    isSequence: false,
    parserRuleId:
      "exact:conditional-continuous:condition:body-part-composition:self-character:direct:protection",
    shapeId:
      "conditional-continuous-condition-body-part-composition-direct-protection",
  },
  {
    includesBasePower: false,
    includesKeyword: true,
    includesProtection: false,
    isSequence: true,
    parserRuleId:
      "exact:conditional-continuous:condition:body-part-composition:self-character:sequence:keyword-only",
    shapeId: "conditional-continuous-condition-body-part-composition-sequence",
  },
  {
    includesBasePower: false,
    includesKeyword: false,
    includesProtection: true,
    isSequence: true,
    parserRuleId:
      "exact:conditional-continuous:condition:body-part-composition:self-character:sequence:protection-only",
    shapeId:
      "conditional-continuous-condition-body-part-composition-sequence-protection-only",
  },
  {
    includesBasePower: false,
    includesKeyword: true,
    includesProtection: true,
    isSequence: true,
    parserRuleId:
      "exact:conditional-continuous:condition:body-part-composition:self-character:sequence:mixed",
    shapeId:
      "conditional-continuous-condition-body-part-composition-sequence-mixed",
  },
  {
    includesBasePower: true,
    includesKeyword: false,
    includesProtection: false,
    isSequence: false,
    parserRuleId:
      "exact:conditional-continuous:condition:base-power:self-character-type:direct",
    shapeId: "conditional-continuous-condition-base-power-self-character-type",
  },
] as const satisfies readonly ConditionalContinuousCompositionVariant[];

export type ConditionalContinuousParserRuleId =
  (typeof conditionalContinuousCompositionVariants)[number]["parserRuleId"];
export type ConditionalContinuousShapeId =
  (typeof conditionalContinuousCompositionVariants)[number]["shapeId"];

export const conditionalContinuousCompositionDirectKeywordParserRuleId =
  conditionalContinuousCompositionVariants[0].parserRuleId;
export const conditionalContinuousCompositionDirectProtectionParserRuleId =
  conditionalContinuousCompositionVariants[1].parserRuleId;
export const conditionalContinuousCompositionSequenceKeywordOnlyParserRuleId =
  conditionalContinuousCompositionVariants[2].parserRuleId;
export const conditionalContinuousCompositionSequenceProtectionOnlyParserRuleId =
  conditionalContinuousCompositionVariants[3].parserRuleId;
export const conditionalContinuousCompositionSequenceMixedParserRuleId =
  conditionalContinuousCompositionVariants[4].parserRuleId;
export const conditionalContinuousCompositionBasePowerParserRuleId =
  conditionalContinuousCompositionVariants[5].parserRuleId;

export const allConditionalContinuousCompositionParserRuleIds =
  conditionalContinuousCompositionVariants.map(
    (variant) => variant.parserRuleId,
  );

const conditionalContinuousParserRuleIdSet = new Set<string>(
  allConditionalContinuousCompositionParserRuleIds,
);

export function isConditionalContinuousCompositionParserRuleId(
  parserRuleId: string,
): parserRuleId is ConditionalContinuousParserRuleId {
  return conditionalContinuousParserRuleIdSet.has(parserRuleId);
}

export type ConditionalContinuousRuntimeCapabilityId =
  | "category:permanent"
  | "condition:trashCount:self:gte"
  | "continuous:source-liveness:must-remain-in-same-zone"
  | "effect:giveKeyword:self:permanent:allowlisted"
  | "effect:giveProtection:fieldRemoval:thisCard:permanent"
  | "effect:sequence:ordered"
  | "effect:setBasePower:self:typed-characters:permanent"
  | "target:all:self:characterArea:character:typesAny"
  | "trigger:permanent";

export function listRuntimeCapabilityIdsForConditionalContinuousVariant(
  variant: ConditionalContinuousCompositionVariant,
): readonly ConditionalContinuousRuntimeCapabilityId[] {
  return [
    "category:permanent",
    ...(variant.isSequence ? (["effect:sequence:ordered"] as const) : []),
    ...(variant.includesKeyword
      ? (["effect:giveKeyword:self:permanent:allowlisted"] as const)
      : []),
    ...(variant.includesProtection
      ? (["effect:giveProtection:fieldRemoval:thisCard:permanent"] as const)
      : []),
    ...(variant.includesBasePower
      ? ([
          "condition:trashCount:self:gte",
          "continuous:source-liveness:must-remain-in-same-zone",
          "effect:setBasePower:self:typed-characters:permanent",
          "target:all:self:characterArea:character:typesAny",
        ] as const)
      : []),
    "trigger:permanent",
  ];
}

export function listParserRuleIdsForConditionalContinuousRuntimeCapabilityId(
  capabilityId: ConditionalContinuousRuntimeCapabilityId,
): readonly string[] {
  return conditionalContinuousCompositionVariants
    .filter((variant) =>
      listRuntimeCapabilityIdsForConditionalContinuousVariant(variant).includes(
        capabilityId,
      ),
    )
    .map((variant) => variant.parserRuleId);
}

export function resolveConditionalContinuousCompositionParserRuleId(
  effects: readonly [Effect, ...Effect[]],
): ConditionalContinuousParserRuleId {
  const hasKeyword = effects.some((effect) => effect.type === "giveKeyword");
  const hasProtection = effects.some(
    (effect) => effect.type === "giveProtection",
  );
  const hasBasePower = effects.some((effect) => effect.type === "setBasePower");
  const isSequence = effects.length > 1;
  const match = conditionalContinuousCompositionVariants.find(
    (variant) =>
      variant.includesBasePower === hasBasePower &&
      variant.includesKeyword === hasKeyword &&
      variant.includesProtection === hasProtection &&
      variant.isSequence === isSequence,
  );
  if (match === undefined) {
    throw new Error("Conditional continuous composition variant not found.");
  }
  return match.parserRuleId;
}

export function listConditionalContinuousCompositionEvidenceFragments(): readonly ConditionalContinuousCompositionEvidenceFragment[] {
  return conditionalContinuousCompositionVariants.map((variant) => ({
    components: [
      "condition",
      ...(variant.isSequence ? (["sequence"] as const) : []),
      ...(variant.includesKeyword ? (["keyword"] as const) : []),
      ...(variant.includesProtection ? (["restriction"] as const) : []),
      ...(variant.includesBasePower
        ? (["modifier", "duration", "target"] as const)
        : []),
      "source-presence-policy",
    ],
    parserRuleId: variant.parserRuleId,
    requiresSequencedEffectSchema: variant.isSequence,
    runtimeCapabilityIds: [
      "category:permanent",
      ...(variant.isSequence ? (["effect:sequence:ordered"] as const) : []),
      ...(variant.includesKeyword
        ? (["effect:giveKeyword:self:permanent:allowlisted"] as const)
        : []),
      ...(variant.includesProtection
        ? (["effect:giveProtection:fieldRemoval:thisCard:permanent"] as const)
        : []),
      ...(variant.includesBasePower
        ? ([
            "condition:trashCount:self:gte",
            "continuous:source-liveness:must-remain-in-same-zone",
            "effect:setBasePower:self:typed-characters:permanent",
            "target:all:self:characterArea:character:typesAny",
          ] as const)
        : []),
      "trigger:permanent",
      "sourcePresencePolicy:mustRemainInSameZone",
    ],
    shapeId: variant.shapeId,
  }));
}
