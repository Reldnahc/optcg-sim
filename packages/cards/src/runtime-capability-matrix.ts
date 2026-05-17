export type RuntimeCapabilityKind =
  | "category"
  | "composition"
  | "condition"
  | "cost"
  | "decision"
  | "effect"
  | "keyword"
  | "modifier"
  | "restriction"
  | "sourcePresencePolicy"
  | "target"
  | "trigger";

export interface RuntimeCapabilityRecord {
  id: string;
  kind: RuntimeCapabilityKind;
  description: string;
  supported: boolean;
  supportedParserRuleIds: readonly string[];
  sinceStory: string;
}

export interface RuntimeCapabilityMatrix {
  id: string;
  generatedAtStory: string;
  capabilities: readonly RuntimeCapabilityRecord[];
}

export const generatedSupportRuntimeCapabilityMatrix = {
  capabilities: [
    {
      description:
        "All chosen public field Characters can be prevented from attacking until turn end.",
      id: "cannotAttack:all:thisTurn",
      kind: "restriction",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:restriction:cannot-attack-all-this-turn",
      ],
    },
    {
      description:
        "One chosen public field Character can be prevented from attacking until turn end.",
      id: "cannotAttack:choose:thisTurn",
      kind: "restriction",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:restriction:cannot-attack-choose-this-turn",
      ],
    },
    {
      description:
        "The source Character can be prevented from attacking until turn end.",
      id: "cannotAttack:self:thisTurn",
      kind: "restriction",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:restriction:cannot-attack-self-this-turn",
      ],
    },
    {
      description:
        "All chosen public field Characters can be prevented from blocking until turn end.",
      id: "cannotBlock:all:thisTurn",
      kind: "restriction",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:restriction:cannot-block-all-this-turn",
      ],
    },
    {
      description:
        "One chosen public field Character can be prevented from blocking until turn end.",
      id: "cannotBlock:choose:thisTurn",
      kind: "restriction",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:restriction:cannot-block-choose-this-turn",
      ],
    },
    {
      description:
        "The source Character can be prevented from blocking until turn end.",
      id: "cannotBlock:self:thisTurn",
      kind: "restriction",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:restriction:cannot-block-self-this-turn",
      ],
    },
    {
      description: "Automatic effect blocks are executable by current runtime.",
      id: "category:auto",
      kind: "category",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:self",
        "exact:when-attacking:draw-n:self",
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:on-play:trash-2-from-hand:draw-1:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        "exact:on-play:draw-up-to-n:self",
        "exact:on-play:optional-effect:draw-1:self",
        "exact:condition:self-attached-don-count",
        "exact:condition:your-turn",
        "card014a:on-play:return-don-play-selected-character",
        "card014a:on-play:select-target-modify-power",
      ],
    },
    {
      description:
        "Certified parser output may compose separate line-separated clauses as independent EffectBlocks.",
      id: "composition:line-separated-effect-blocks:v1",
      kind: "composition",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:self",
        "exact:when-attacking:draw-n:self",
        "line-separated-effect-blocks:v1",
      ],
    },
    {
      description:
        "Self attached DON!! count conditions are executable by current runtime.",
      id: "condition:selfAttachedDonCount",
      kind: "condition",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["exact:condition:self-attached-don-count"],
    },
    {
      description: "Your Turn conditions are executable by current runtime.",
      id: "condition:yourTurn",
      kind: "condition",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["exact:condition:your-turn"],
    },
    {
      description:
        "Draw up to a chosen quantity of cards for the source controller.",
      id: "drawUpTo:self:chooseQuantity",
      kind: "effect",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["exact:on-play:draw-up-to-n:self"],
    },
    {
      description:
        "Draw a positive safe-integer number of cards for the source controller.",
      id: "effect:draw:self:count:positive-safe-integer",
      kind: "effect",
      sinceStory: "CARD-009A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:self",
        "exact:when-attacking:draw-n:self",
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:on-play:trash-2-from-hand:draw-1:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        "exact:on-play:optional-effect:draw-1:self",
        "exact:condition:self-attached-don-count",
        "exact:condition:your-turn",
        "card014a:sequence:draw-trashFromHand",
        "card014a:sequence:trashFromHand-draw",
      ],
    },
    {
      description:
        "Ordered sequence effects are executable by current runtime.",
      id: "effect:sequence:ordered",
      kind: "effect",
      sinceStory: "CARD-009B",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:on-play:trash-2-from-hand:draw-1:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        "card014a:sequence:draw-trashFromHand",
        "card014a:sequence:trashFromHand-draw",
      ],
    },
    {
      description:
        "Trash a positive safe-integer number of cards from self hand using owner choice.",
      id: "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      kind: "effect",
      sinceStory: "CARD-009B",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:on-play:trash-2-from-hand:draw-1:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        "card014a:sequence:draw-trashFromHand",
        "card014a:sequence:trashFromHand-draw",
      ],
    },
    {
      description:
        "Printed Banish keyword behavior is executable by current runtime.",
      id: "keyword:banish:printed",
      kind: "keyword",
      sinceStory: "ENG-013",
      supported: true,
      supportedParserRuleIds: ["exact:keyword:banish:standalone"],
    },
    {
      description:
        "Printed Blocker keyword behavior is executable by current runtime.",
      id: "keyword:blocker:printed",
      kind: "keyword",
      sinceStory: "ENG-014",
      supported: true,
      supportedParserRuleIds: ["exact:keyword:blocker:standalone"],
    },
    {
      description:
        "Printed Double Attack keyword behavior is executable by current runtime.",
      id: "keyword:doubleAttack:printed",
      kind: "keyword",
      sinceStory: "ENG-046",
      supported: true,
      supportedParserRuleIds: ["exact:keyword:double-attack:standalone"],
    },
    {
      description:
        "Printed Rush keyword behavior is executable by current runtime.",
      id: "keyword:rush:printed",
      kind: "keyword",
      sinceStory: "ENG-011",
      supported: true,
      supportedParserRuleIds: ["exact:keyword:rush:standalone"],
    },
    {
      description:
        "Printed Rush: Character keyword behavior is executable by current runtime.",
      id: "keyword:rushCharacter:printed",
      kind: "keyword",
      sinceStory: "ENG-011",
      supported: true,
      supportedParserRuleIds: ["exact:keyword:rush-character:standalone"],
    },
    {
      description:
        "Power modifiers can apply to all matching public field Characters until turn end.",
      id: "modifyPower:all:thisTurn",
      kind: "modifier",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["card014a:modifier:power-all-this-turn"],
    },
    {
      description:
        "Power modifiers can apply to one chosen public field Character until turn end.",
      id: "modifyPower:choose:thisTurn",
      kind: "modifier",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:modifier:power-choose-this-turn",
        "card014a:on-play:select-target-modify-power",
      ],
    },
    {
      description:
        "Power modifiers can apply to the source Character for this battle.",
      id: "modifyPower:self:thisBattle",
      kind: "modifier",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["card014a:modifier:power-self-this-battle"],
    },
    {
      description:
        "Power modifiers can apply to the source Character until turn end.",
      id: "modifyPower:self:thisTurn",
      kind: "modifier",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["card014a:modifier:power-self-this-turn"],
    },
    {
      description:
        "Optional On Play effect blocks that draw one card for self are executable.",
      id: "optionalEffectBlock:onPlay:draw-1:self",
      kind: "composition",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["exact:on-play:optional-effect:draw-1:self"],
    },
    {
      description:
        "Return-DON!! costs can be paid atomically by the source controller.",
      id: "payCost:returnDon:self:count-exact",
      kind: "cost",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:return-don-play-selected-character",
      ],
    },
    {
      description:
        "A selected Character from self hand can be played by a composed effect.",
      id: "playSelected:hand:character:max1",
      kind: "effect",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:return-don-play-selected-character",
      ],
    },
    {
      description:
        "A selected Character from self hand can be played while ignoring play cost.",
      id: "playSelected:hand:character:max1:ignoreCost",
      kind: "effect",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:return-don-play-selected-character",
      ],
    },
    {
      description:
        "Returning an exact DON!! count from the source controller can be represented as a cost.",
      id: "returnDon:cost:self:count-exact",
      kind: "cost",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:return-don-play-selected-character",
      ],
    },
    {
      description:
        "Saved public field-object references can be consumed by supported generic field-object effects.",
      id: "savedFieldObject:consumer:generic",
      kind: "target",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["card014a:on-play:select-target-modify-power"],
    },
    {
      description:
        "Selected-target segment results can produce saved public field-object references.",
      id: "savedSelectedTargets:producer",
      kind: "target",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["card014a:on-play:select-target-modify-power"],
    },
    {
      description:
        "A maximum of one Character can be selected from self hand for composed play effects.",
      id: "selectCards:hand:self:character:max1",
      kind: "decision",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:return-don-play-selected-character",
      ],
    },
    {
      description:
        "A maximum of one public field Character can be selected as a target.",
      id: "selectTargets:field:public:character:max1",
      kind: "decision",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["card014a:on-play:select-target-modify-power"],
    },
    {
      description:
        "Composed runtime frames support draw followed by trash-from-hand.",
      id: "sequence:draw:trashFromHand",
      kind: "composition",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["card014a:sequence:draw-trashFromHand"],
    },
    {
      description:
        "Generic composed runtime frames can resume supported segment sequences.",
      id: "sequence:genericFrames",
      kind: "composition",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:sequence:draw-trashFromHand",
        "card014a:sequence:trashFromHand-draw",
        "exact:on-play:trash-2-from-hand:draw-1:self",
        "card014a:on-play:return-don-play-selected-character",
        "card014a:on-play:select-target-modify-power",
      ],
    },
    {
      description:
        "Composed runtime frames support trash-from-hand followed by draw.",
      id: "sequence:trashFromHand:draw",
      kind: "composition",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:sequence:trashFromHand-draw",
        "exact:on-play:trash-2-from-hand:draw-1:self",
      ],
    },
    {
      description:
        "Source must remain in the same zone for generated simple character effects.",
      id: "sourcePresencePolicy:mustRemainInSameZone",
      kind: "sourcePresencePolicy",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:self",
        "exact:when-attacking:draw-n:self",
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:on-play:trash-2-from-hand:draw-1:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        "exact:on-play:draw-up-to-n:self",
        "exact:on-play:optional-effect:draw-1:self",
        "exact:condition:self-attached-don-count",
        "exact:condition:your-turn",
        "card014a:on-play:return-don-play-selected-character",
        "card014a:on-play:select-target-modify-power",
      ],
    },
    {
      description:
        "Supported generated effects may resolve without a source when runtime evidence authorizes the trigger family.",
      id: "sourcePresencePolicy:noSourceRequired",
      kind: "sourcePresencePolicy",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: ["card014a:static:no-source-required"],
    },
    {
      description:
        "Printed keyword-only generated support does not need source-presence effect resolution.",
      id: "sourcePresencePolicy:none-for-keyword",
      kind: "sourcePresencePolicy",
      sinceStory: "CARD-012",
      supported: true,
      supportedParserRuleIds: [
        "exact:keyword:banish:standalone",
        "exact:keyword:blocker:standalone",
        "exact:keyword:double-attack:standalone",
        "exact:keyword:rush-character:standalone",
        "exact:keyword:rush:standalone",
      ],
    },
    {
      description:
        "Supported trigger effects may resolve from the destination zone when runtime evidence authorizes that trigger family.",
      id: "sourcePresencePolicy:resolveFromDestinationZone",
      kind: "sourcePresencePolicy",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:trigger:resolve-from-destination-zone",
      ],
    },
    {
      description:
        "Supported trigger effects may resolve from last-known source information when runtime evidence authorizes that trigger family.",
      id: "sourcePresencePolicy:resolveFromLastKnownInformation",
      kind: "sourcePresencePolicy",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:trigger:resolve-from-last-known-information",
      ],
    },
    {
      description:
        "An exact first sequence segment can trash cards from self hand using self choice.",
      id: "trashFromHand:segment0:self:self:count-exact",
      kind: "effect",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:sequence:trashFromHand-draw",
        "exact:on-play:trash-2-from-hand:draw-1:self",
      ],
    },
    {
      description: "On Play trigger timing is executable by current runtime.",
      id: "trigger:onPlay",
      kind: "trigger",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:self",
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:on-play:trash-2-from-hand:draw-1:self",
        "exact:on-play:draw-up-to-n:self",
        "exact:on-play:optional-effect:draw-1:self",
        "exact:condition:self-attached-don-count",
        "exact:condition:your-turn",
        "card014a:on-play:return-don-play-selected-character",
        "card014a:on-play:select-target-modify-power",
      ],
    },
    {
      description:
        "When Attacking trigger timing is executable by current runtime.",
      id: "trigger:whenAttacking",
      kind: "trigger",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:when-attacking:draw-n:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
      ],
    },
    {
      description:
        "When Attacking once-per-turn trigger timing is executable by current runtime.",
      id: "trigger:whenAttacking:oncePerTurn",
      kind: "trigger",
      sinceStory: "CARD-009B",
      supported: true,
      supportedParserRuleIds: [
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ],
    },
  ],
  generatedAtStory: "CARD-014A",
  id: "generated-support-runtime-capabilities:v1",
} as const satisfies RuntimeCapabilityMatrix;

export const requiredGeneratedSupportCapabilityIds = [
  "cannotAttack:all:thisTurn",
  "cannotAttack:choose:thisTurn",
  "cannotAttack:self:thisTurn",
  "cannotBlock:all:thisTurn",
  "cannotBlock:choose:thisTurn",
  "cannotBlock:self:thisTurn",
  "category:auto",
  "composition:line-separated-effect-blocks:v1",
  "condition:selfAttachedDonCount",
  "condition:yourTurn",
  "drawUpTo:self:chooseQuantity",
  "effect:draw:self:count:positive-safe-integer",
  "effect:sequence:ordered",
  "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
  "keyword:banish:printed",
  "keyword:blocker:printed",
  "keyword:doubleAttack:printed",
  "keyword:rush:printed",
  "keyword:rushCharacter:printed",
  "modifyPower:all:thisTurn",
  "modifyPower:choose:thisTurn",
  "modifyPower:self:thisBattle",
  "modifyPower:self:thisTurn",
  "optionalEffectBlock:onPlay:draw-1:self",
  "payCost:returnDon:self:count-exact",
  "playSelected:hand:character:max1",
  "playSelected:hand:character:max1:ignoreCost",
  "returnDon:cost:self:count-exact",
  "savedFieldObject:consumer:generic",
  "savedSelectedTargets:producer",
  "selectCards:hand:self:character:max1",
  "selectTargets:field:public:character:max1",
  "sequence:draw:trashFromHand",
  "sequence:genericFrames",
  "sequence:trashFromHand:draw",
  "sourcePresencePolicy:mustRemainInSameZone",
  "sourcePresencePolicy:noSourceRequired",
  "sourcePresencePolicy:none-for-keyword",
  "sourcePresencePolicy:resolveFromDestinationZone",
  "sourcePresencePolicy:resolveFromLastKnownInformation",
  "trashFromHand:segment0:self:self:count-exact",
  "trigger:onPlay",
  "trigger:whenAttacking",
  "trigger:whenAttacking:oncePerTurn",
] as const;

export function listSupportedRuntimeCapabilityIds(
  matrix: RuntimeCapabilityMatrix = generatedSupportRuntimeCapabilityMatrix,
): readonly string[] {
  return matrix.capabilities
    .filter((capability) => capability.supported)
    .map((capability) => capability.id)
    .sort();
}

export function hasRuntimeCapability(
  capabilityId: string,
  matrix: RuntimeCapabilityMatrix = generatedSupportRuntimeCapabilityMatrix,
): boolean {
  return matrix.capabilities.some(
    (capability) => capability.id === capabilityId && capability.supported,
  );
}
