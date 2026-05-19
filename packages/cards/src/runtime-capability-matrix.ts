import { generatedSupportComponentEvidenceInventory } from "./generated-support-types.js";

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
  supportedComponentIds?: readonly string[];
  supportedParserRuleIds: readonly string[];
  sinceStory: string;
}

export interface RuntimeCapabilityMatrix {
  id: string;
  generatedAtStory: string;
  capabilities: readonly RuntimeCapabilityRecord[];
}

export type RuntimeCapabilityParserRuleCoverage =
  | "explicit-blocker"
  | "reusable-parser-component"
  | "runtime-capability-only"
  | "unclassified";

export interface RuntimeCapabilityParserRuleInventoryEntry {
  parserRuleId: string;
  parserRuleKind: string;
  coverage: RuntimeCapabilityParserRuleCoverage;
}

const generatedSupportRuntimeCapabilityMatrixBase = {
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
        "exact:on-play:cannot-attack:all:this-turn",
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
        "exact:on-play:cannot-attack:choose:this-turn",
      ],
    },
    {
      description:
        "Up-to-one public field Character attack restriction may legally resolve with zero chosen targets.",
      id: "cannotAttack:choose:thisTurn:zeroChoiceBranch",
      kind: "restriction",
      sinceStory: "ENG-057A",
      supported: true,
      supportedParserRuleIds: ["exact:on-play:cannot-attack:choose:this-turn"],
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
        "exact:on-play:cannot-attack:self:this-turn",
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
        "exact:on-play:cannot-block:all:this-turn",
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
        "exact:on-play:cannot-block:choose:this-turn",
      ],
    },
    {
      description:
        "Up-to-one public field Character block restriction may legally resolve with zero chosen targets.",
      id: "cannotBlock:choose:thisTurn:zeroChoiceBranch",
      kind: "restriction",
      sinceStory: "ENG-057A",
      supported: true,
      supportedParserRuleIds: ["exact:on-play:cannot-block:choose:this-turn"],
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
        "exact:on-play:cannot-block:self:this-turn",
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
        "exact:on-ko:draw-n:self",
        "exact:on-ko:draw-up-to-n:self",
        "exact:trigger:draw-n:self",
        "exact:trigger:draw-up-to-n:self",
        "exact:on-play:optional-effect:draw-1:self",
        "exact:condition:self-attached-don-count",
        "exact:condition:your-turn",
        "card014a:on-play:return-don-play-selected-character",
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
        "card014a:on-play:select-target-modify-power",
        "exact:on-play:select-1-opponent-character-target",
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
        "exact:on-play:modify-power:self:this-turn",
        "exact:on-play:modify-power:self:this-battle",
        "exact:on-play:modify-power:choose:this-turn",
        "exact:on-play:modify-power:all:this-turn",
        "exact:on-play:cannot-attack:self:this-turn",
        "exact:on-play:cannot-attack:choose:this-turn",
        "exact:on-play:cannot-attack:all:this-turn",
        "exact:on-play:cannot-block:self:this-turn",
        "exact:on-play:cannot-block:choose:this-turn",
        "exact:on-play:cannot-block:all:this-turn",
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
      description:
        "Leader color-count conditions are executable by current runtime.",
      id: "condition:leaderColorCount",
      kind: "condition",
      sinceStory: "ENG-058A",
      supported: true,
      supportedParserRuleIds: [],
    },
    {
      description:
        "Leader zone-presence filter conditions are executable by current runtime.",
      id: "condition:hasCardInZone",
      kind: "condition",
      sinceStory: "ENG-058A",
      supported: true,
      supportedParserRuleIds: [],
    },
    {
      description: "Hand-count conditions are executable by current runtime.",
      id: "condition:handCount",
      kind: "condition",
      sinceStory: "ENG-058A",
      supported: true,
      supportedParserRuleIds: [],
    },
    {
      description: "Life-count conditions are executable by current runtime.",
      id: "condition:lifeCount",
      kind: "condition",
      sinceStory: "ENG-058A",
      supported: true,
      supportedParserRuleIds: [],
    },
    {
      description:
        "Boolean AND condition connectors are executable by runtime.",
      id: "condition-connector:and",
      kind: "condition",
      sinceStory: "ENG-058A",
      supported: true,
      supportedParserRuleIds: [],
    },
    {
      description: "Boolean OR condition connectors are executable by runtime.",
      id: "condition-connector:or",
      kind: "condition",
      sinceStory: "ENG-058A",
      supported: true,
      supportedParserRuleIds: [],
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
        "Draw up to a chosen quantity of cards for the source controller using a chooseQuantity decision.",
      id: "drawUpTo:self:chooseQuantity",
      kind: "effect",
      sinceStory: "ENG-055H",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-up-to-n:self",
        "exact:on-ko:draw-up-to-n:self",
        "exact:trigger:draw-up-to-n:self",
      ],
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
        "exact:on-ko:draw-n:self",
        "exact:trigger:draw-n:self",
        "exact:condition:self-attached-don-count",
        "exact:condition:your-turn",
        "card014a:sequence:draw-trashFromHand",
        "card014a:sequence:trashFromHand-draw",
      ],
    },
    {
      description:
        "Saved public field-object Character references can be consumed by KO effects.",
      id: "effect:ko:saved-field-object:characterArea:public",
      kind: "effect",
      sinceStory: "ENG-055I",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
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
      supportedParserRuleIds: [
        "card014a:modifier:power-all-this-turn",
        "exact:on-play:modify-power:all:this-turn",
      ],
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
        "exact:on-play:modify-power:choose:this-turn",
      ],
    },
    {
      description:
        "Up-to-one public field Character power modifiers may legally resolve with zero chosen targets.",
      id: "modifyPower:choose:thisTurn:zeroChoiceBranch",
      kind: "modifier",
      sinceStory: "ENG-057A",
      supported: true,
      supportedParserRuleIds: ["exact:on-play:modify-power:choose:this-turn"],
    },
    {
      description:
        "Power modifiers can apply to the source Character for this battle.",
      id: "modifyPower:self:thisBattle",
      kind: "modifier",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:modifier:power-self-this-battle",
        "exact:on-play:modify-power:self:this-battle",
      ],
    },
    {
      description:
        "Power modifiers can apply to the source Character until turn end.",
      id: "modifyPower:self:thisTurn",
      kind: "modifier",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:modifier:power-self-this-turn",
        "exact:on-play:modify-power:self:this-turn",
      ],
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
      sinceStory: "ENG-055F",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:return-don-play-selected-character",
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
      ],
    },
    {
      description:
        "A selected Character from self hand can be played by a composed effect.",
      id: "playSelected:hand:character:max1",
      kind: "effect",
      sinceStory: "ENG-055G",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:return-don-play-selected-character",
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
      ],
    },
    {
      description:
        "A selected Character from self hand can be played while ignoring play cost.",
      id: "playSelected:hand:character:max1:ignoreCost",
      kind: "effect",
      sinceStory: "ENG-055G",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:return-don-play-selected-character",
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
      ],
    },
    {
      description:
        "Returning an exact DON!! count from the source controller can be represented as a cost.",
      id: "returnDon:cost:self:count-exact",
      kind: "cost",
      sinceStory: "ENG-055F",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:return-don-play-selected-character",
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
      ],
    },
    {
      description:
        "Saved public field-object references can be consumed by supported generic field-object effects.",
      id: "savedFieldObject:consumer:generic",
      kind: "target",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:select-target-modify-power",
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
      ],
    },
    {
      description:
        "Selected-target segment results can produce saved public field-object references.",
      id: "savedSelectedTargets:producer",
      kind: "target",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:select-target-modify-power",
        "exact:on-play:select-1-opponent-character-target",
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
      ],
    },
    {
      description:
        "A maximum of one Character can be selected from self hand for composed play effects.",
      id: "selectCards:hand:self:character:max1",
      kind: "decision",
      sinceStory: "ENG-055F",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:return-don-play-selected-character",
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
      ],
    },
    {
      description:
        "A maximum of one public field Character can be selected as a target.",
      id: "selectTargets:field:public:character:max1",
      kind: "decision",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:on-play:select-target-modify-power",
        "exact:on-play:select-1-opponent-character-target",
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
      ],
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
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
        "card014a:on-play:select-target-modify-power",
        "exact:on-play:select-1-opponent-character-target",
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
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
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
        "card014a:on-play:select-target-modify-power",
        "exact:on-play:select-1-opponent-character-target",
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
        "exact:on-play:modify-power:self:this-turn",
        "exact:on-play:modify-power:self:this-battle",
        "exact:on-play:modify-power:choose:this-turn",
        "exact:on-play:modify-power:all:this-turn",
        "exact:on-play:cannot-attack:self:this-turn",
        "exact:on-play:cannot-attack:choose:this-turn",
        "exact:on-play:cannot-attack:all:this-turn",
        "exact:on-play:cannot-block:self:this-turn",
        "exact:on-play:cannot-block:choose:this-turn",
        "exact:on-play:cannot-block:all:this-turn",
      ],
    },
    {
      description:
        "Supported generated effects may resolve without a source when runtime evidence authorizes the trigger family.",
      id: "sourcePresencePolicy:noSourceRequired",
      kind: "sourcePresencePolicy",
      sinceStory: "CARD-014A",
      supported: true,
      supportedParserRuleIds: [
        "card014a:static:no-source-required",
        "exact:trigger:draw-n:self",
        "exact:trigger:draw-up-to-n:self",
      ],
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
        "exact:on-ko:draw-n:self",
        "exact:on-ko:draw-up-to-n:self",
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
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
        "card014a:on-play:select-target-modify-power",
        "exact:on-play:select-1-opponent-character-target",
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
        "exact:on-play:modify-power:self:this-turn",
        "exact:on-play:modify-power:self:this-battle",
        "exact:on-play:modify-power:choose:this-turn",
        "exact:on-play:modify-power:all:this-turn",
        "exact:on-play:cannot-attack:self:this-turn",
        "exact:on-play:cannot-attack:choose:this-turn",
        "exact:on-play:cannot-attack:all:this-turn",
        "exact:on-play:cannot-block:self:this-turn",
        "exact:on-play:cannot-block:choose:this-turn",
        "exact:on-play:cannot-block:all:this-turn",
      ],
    },
    {
      description: "On K.O. trigger timing is executable by current runtime.",
      id: "trigger:onKO",
      kind: "trigger",
      sinceStory: "ENG-056B",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-ko:draw-n:self",
        "exact:on-ko:draw-up-to-n:self",
      ],
    },
    {
      description:
        "Life Trigger timing is executable by current runtime for supported generated shapes.",
      id: "trigger:trigger",
      kind: "trigger",
      sinceStory: "ENG-056A",
      supported: true,
      supportedParserRuleIds: [
        "exact:trigger:draw-n:self",
        "exact:trigger:draw-up-to-n:self",
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
  generatedAtStory: "CARD-014G",
  id: "generated-support-runtime-capabilities:v1",
} as const satisfies RuntimeCapabilityMatrix;

const runtimeCapabilityComponentIdsByCapabilityId = new Map<string, string[]>();
for (const entry of generatedSupportComponentEvidenceInventory) {
  for (const capabilityId of entry.runtimeCapabilityIds) {
    const existing =
      runtimeCapabilityComponentIdsByCapabilityId.get(capabilityId) ?? [];
    if (!existing.includes(entry.shapeId)) {
      existing.push(entry.shapeId);
      existing.sort();
      runtimeCapabilityComponentIdsByCapabilityId.set(capabilityId, existing);
    }
  }
}

export const generatedSupportRuntimeCapabilityMatrix = {
  ...generatedSupportRuntimeCapabilityMatrixBase,
  capabilities: generatedSupportRuntimeCapabilityMatrixBase.capabilities
    .map((capability) => ({
      ...capability,
      supportedComponentIds:
        runtimeCapabilityComponentIdsByCapabilityId.get(capability.id) ?? [],
    }))
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
} as const satisfies RuntimeCapabilityMatrix;

export const requiredGeneratedSupportCapabilityIds = [
  "cannotAttack:all:thisTurn",
  "cannotAttack:choose:thisTurn",
  "cannotAttack:choose:thisTurn:zeroChoiceBranch",
  "cannotAttack:self:thisTurn",
  "cannotBlock:all:thisTurn",
  "cannotBlock:choose:thisTurn",
  "cannotBlock:choose:thisTurn:zeroChoiceBranch",
  "cannotBlock:self:thisTurn",
  "category:auto",
  "composition:line-separated-effect-blocks:v1",
  "condition:selfAttachedDonCount",
  "condition:leaderColorCount",
  "condition:hasCardInZone",
  "condition:handCount",
  "condition:lifeCount",
  "condition-connector:and",
  "condition-connector:or",
  "condition:yourTurn",
  "drawUpTo:self:chooseQuantity",
  "effect:draw:self:count:positive-safe-integer",
  "effect:ko:saved-field-object:characterArea:public",
  "effect:sequence:ordered",
  "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
  "keyword:banish:printed",
  "keyword:blocker:printed",
  "keyword:doubleAttack:printed",
  "keyword:rush:printed",
  "keyword:rushCharacter:printed",
  "modifyPower:all:thisTurn",
  "modifyPower:choose:thisTurn",
  "modifyPower:choose:thisTurn:zeroChoiceBranch",
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
  "trigger:onKO",
  "trigger:onPlay",
  "trigger:trigger",
  "trigger:whenAttacking",
  "trigger:whenAttacking:oncePerTurn",
].sort() as readonly string[];

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

export function listRuntimeCapabilityParserRuleInventory(
  matrix: RuntimeCapabilityMatrix = generatedSupportRuntimeCapabilityMatrix,
): readonly RuntimeCapabilityParserRuleInventoryEntry[] {
  return [
    ...new Set(
      matrix.capabilities
        .filter((capability) => capability.supported)
        .flatMap((capability) => capability.supportedParserRuleIds),
    ),
  ]
    .sort()
    .map(toParserRuleInventoryEntry);
}

function toParserRuleInventoryEntry(
  parserRuleId: string,
): RuntimeCapabilityParserRuleInventoryEntry {
  const parserRuleKind = classifyParserRuleKind(parserRuleId);
  return {
    coverage: classifyParserRuleCoverage(parserRuleId, parserRuleKind),
    parserRuleId,
    parserRuleKind,
  };
}

function classifyParserRuleCoverage(
  parserRuleId: string,
  parserRuleKind: string,
): RuntimeCapabilityParserRuleCoverage {
  if (parserRuleId.includes(":unsupported:")) {
    return "explicit-blocker";
  }

  if (parserRuleKind === "source-presence-policy") {
    return "runtime-capability-only";
  }

  return parserRuleKind === "unclassified"
    ? "unclassified"
    : "reusable-parser-component";
}

function classifyParserRuleKind(parserRuleId: string): string {
  if (parserRuleId === "line-separated-effect-blocks:v1") {
    return "line-separated-composition";
  }
  if (parserRuleId.startsWith("exact:keyword:")) {
    return "keyword";
  }
  if (
    parserRuleId === "exact:on-play:draw-n:self" ||
    parserRuleId === "exact:when-attacking:draw-n:self" ||
    parserRuleId === "exact:on-ko:draw-n:self" ||
    parserRuleId === "exact:trigger:draw-n:self"
  ) {
    return "triggered-draw";
  }
  if (
    parserRuleId === "exact:on-play:draw-up-to-n:self" ||
    parserRuleId === "exact:on-ko:draw-up-to-n:self" ||
    parserRuleId === "exact:trigger:draw-up-to-n:self"
  ) {
    return "draw-up-to";
  }
  if (
    parserRuleId.includes(":draw-n:trash-m:hand:self") ||
    parserRuleId === "exact:on-play:trash-2-from-hand:draw-1:self" ||
    parserRuleId.startsWith("card014a:sequence:")
  ) {
    return "sequence";
  }
  if (parserRuleId.startsWith("exact:condition:")) {
    return "condition";
  }
  if (parserRuleId === "exact:on-play:optional-effect:draw-1:self") {
    return "optional-effect";
  }
  if (
    parserRuleId.includes("return-don") ||
    parserRuleId === "card014a:on-play:return-don-play-selected-character"
  ) {
    return "cost-hand-selection-play-selected";
  }
  if (
    parserRuleId.includes("select-1-opponent-character") ||
    parserRuleId === "card014a:on-play:select-target-modify-power"
  ) {
    return "field-target-saved-reference";
  }
  if (
    parserRuleId.includes(":modify-power:") ||
    parserRuleId.startsWith("card014a:modifier:")
  ) {
    return "continuous-modifier";
  }
  if (
    parserRuleId.includes(":cannot-attack:") ||
    parserRuleId.includes(":cannot-block:") ||
    parserRuleId.startsWith("card014a:restriction:")
  ) {
    return "continuous-restriction";
  }
  if (
    parserRuleId.startsWith("card014a:static:") ||
    parserRuleId.startsWith("card014a:trigger:")
  ) {
    return "source-presence-policy";
  }

  return "unclassified";
}
