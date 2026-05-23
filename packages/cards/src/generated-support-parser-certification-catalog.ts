import type {
  GeneratedSupportComponentEvidenceCategory,
  GeneratedSupportComponentEvidenceInventoryEntry,
} from "./generated-support-types.js";

type ParserCertificationEntryLike = {
  parserCertificationIds?: readonly string[];
};

export const onPlayDrawParserCertificationIds = [
  "trigger-wrapper:on-play",
  "body-action:draw-n",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayDrawThenTrashParserCertificationIds = [
  "trigger-wrapper:on-play",
  "body-action:draw-n",
  "cost-wrapper:trash-from-hand",
  "source-presence-policy:must-remain-in-same-zone",
  "composition:on-play-draw-then-trash",
] as const;

export const onPlayTrashFromHandParserCertificationIds = [
  "trigger-wrapper:on-play",
  "body-action:trash-from-hand",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const whenAttackingDrawParserCertificationIds = [
  "trigger-wrapper:when-attacking",
  "body-action:draw-n",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const whenAttackingDrawThenTrashParserCertificationIds = [
  "trigger-wrapper:when-attacking",
  "body-action:draw-n",
  "cost-wrapper:trash-from-hand",
  "source-presence-policy:must-remain-in-same-zone",
  "composition:when-attacking-draw-then-trash",
] as const;

export const whenAttackingOncePerTurnDrawThenTrashParserCertificationIds = [
  "trigger-wrapper:when-attacking",
  "marker:once-per-turn",
  "body-action:draw-n",
  "cost-wrapper:trash-from-hand",
  "source-presence-policy:must-remain-in-same-zone",
  "composition:when-attacking-once-per-turn-draw-then-trash",
] as const;

export const triggerDrawParserCertificationIds = [
  "trigger-wrapper:trigger",
  "body-action:draw-n",
  "source-presence-policy:no-source-required",
] as const;

export const onKoDrawParserCertificationIds = [
  "trigger-wrapper:on-ko",
  "body-action:draw-n",
  "source-presence-policy:resolve-from-destination-zone",
] as const;

export const onPlayDrawUpToParserCertificationIds = [
  "trigger-wrapper:on-play",
  "body-action:draw-up-to-n",
  "cardinality:up-to-n",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayOptionalDrawParserCertificationIds = [
  "trigger-wrapper:on-play",
  "optional-marker:you-may",
  "body-action:draw-n",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const triggerDrawUpToParserCertificationIds = [
  "trigger-wrapper:trigger",
  "body-action:draw-up-to-n",
  "cardinality:up-to-n",
  "source-presence-policy:no-source-required",
] as const;

export const onKoDrawUpToParserCertificationIds = [
  "trigger-wrapper:on-ko",
  "body-action:draw-up-to-n",
  "cardinality:up-to-n",
  "source-presence-policy:resolve-from-destination-zone",
] as const;

export const onPlayConditionDrawParserCertificationIds = [
  "trigger-wrapper:on-play",
  "condition:block-level",
  "body-action:draw-n",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayReturnDonPlaySelectedParserCertificationIds = [
  "trigger-wrapper:on-play",
  "cost-wrapper:return-don",
  "target:select-cards-from-hand",
  "body-action:play-selected",
  "source-presence-policy:must-remain-in-same-zone",
  "composition:return-don-then-play-selected",
] as const;

export const onPlaySelectTargetParserCertificationIds = [
  "trigger-wrapper:on-play",
  "target:select-opponent-character",
  "source-presence-policy:must-remain-in-same-zone",
  "composition:select-target",
] as const;

export const onPlaySelectThenKoParserCertificationIds = [
  "trigger-wrapper:on-play",
  "target:select-opponent-character",
  "body-action:ko",
  "source-presence-policy:must-remain-in-same-zone",
  "composition:select-then-ko",
] as const;

export const onPlayModifyPowerSelfThisTurnParserCertificationIds = [
  "trigger-wrapper:on-play",
  "body-action:modify-power",
  "target:self",
  "duration:this-turn",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayModifyPowerSelfThisBattleParserCertificationIds = [
  "trigger-wrapper:on-play",
  "body-action:modify-power",
  "target:self",
  "duration:this-battle",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayModifyPowerChooseThisTurnParserCertificationIds = [
  "trigger-wrapper:on-play",
  "body-action:modify-power",
  "target:select-opponent-character",
  "chooser:self",
  "cardinality:up-to-n",
  "duration:this-turn",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayModifyPowerAllThisTurnParserCertificationIds = [
  "trigger-wrapper:on-play",
  "body-action:modify-power",
  "target:all-opponent-characters",
  "duration:this-turn",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayCannotAttackSelfThisTurnParserCertificationIds = [
  "trigger-wrapper:on-play",
  "restriction:cannot-attack",
  "target:self",
  "duration:this-turn",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayCannotAttackChooseThisTurnParserCertificationIds = [
  "trigger-wrapper:on-play",
  "restriction:cannot-attack",
  "target:select-opponent-character",
  "chooser:self",
  "cardinality:up-to-n",
  "duration:this-turn",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayCannotAttackAllThisTurnParserCertificationIds = [
  "trigger-wrapper:on-play",
  "restriction:cannot-attack",
  "target:all-opponent-characters",
  "duration:this-turn",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayCannotBlockSelfThisTurnParserCertificationIds = [
  "trigger-wrapper:on-play",
  "restriction:cannot-block",
  "target:self",
  "duration:this-turn",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayCannotBlockChooseThisTurnParserCertificationIds = [
  "trigger-wrapper:on-play",
  "restriction:cannot-block",
  "target:select-opponent-character",
  "chooser:self",
  "cardinality:up-to-n",
  "duration:this-turn",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export const onPlayCannotBlockAllThisTurnParserCertificationIds = [
  "trigger-wrapper:on-play",
  "restriction:cannot-block",
  "target:all-opponent-characters",
  "duration:this-turn",
  "source-presence-policy:must-remain-in-same-zone",
] as const;

export function listAllGeneratedSupportParserCertificationIdsFromEntries(
  entries: readonly ParserCertificationEntryLike[],
): readonly string[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    const parserCertificationIds = entry.parserCertificationIds;
    if (parserCertificationIds === undefined) {
      continue;
    }
    for (const certificationId of parserCertificationIds) {
      ids.add(certificationId);
    }
  }
  return Array.from(ids);
}

export function buildOnPlayModifierAndRestrictionEntries({
  parserRuleBaseComponents,
  parserRuleBaseGates,
}: {
  parserRuleBaseComponents: readonly GeneratedSupportComponentEvidenceCategory[];
  parserRuleBaseGates: GeneratedSupportComponentEvidenceInventoryEntry["gates"];
}): readonly GeneratedSupportComponentEvidenceInventoryEntry[] {
  return [
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
      parserCertificationIds:
        onPlayModifyPowerSelfThisTurnParserCertificationIds,
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
      parserCertificationIds:
        onPlayModifyPowerSelfThisBattleParserCertificationIds,
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
      parserCertificationIds:
        onPlayModifyPowerChooseThisTurnParserCertificationIds,
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
      parserCertificationIds:
        onPlayModifyPowerAllThisTurnParserCertificationIds,
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
      parserCertificationIds:
        onPlayCannotAttackSelfThisTurnParserCertificationIds,
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
      parserCertificationIds:
        onPlayCannotAttackChooseThisTurnParserCertificationIds,
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
      parserCertificationIds:
        onPlayCannotAttackAllThisTurnParserCertificationIds,
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
      parserCertificationIds:
        onPlayCannotBlockSelfThisTurnParserCertificationIds,
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
      parserCertificationIds:
        onPlayCannotBlockChooseThisTurnParserCertificationIds,
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
        "restriction",
        "duration",
        "target",
        "source-presence-policy",
        ...parserRuleBaseComponents,
      ],
      gates: parserRuleBaseGates,
      parserCertificationIds:
        onPlayCannotBlockAllThisTurnParserCertificationIds,
      parserRuleId: "exact:on-play:cannot-block:all:this-turn",
      runtimeCapabilityIds: [
        "category:auto",
        "cannotBlock:all:thisTurn",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
      shapeId: "on-play-cannot-block-all-this-turn",
    },
  ];
}
