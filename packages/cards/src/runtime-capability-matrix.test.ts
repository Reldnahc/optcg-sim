import { describe, expect, it } from "vitest";

import {
  generatedSupportRuntimeCapabilityMatrix,
  hasRuntimeCapability,
  listRuntimeCapabilityParserRuleInventory,
  listSupportedRuntimeCapabilityIds,
  requiredGeneratedSupportCapabilityIds,
} from "./runtime-capability-matrix.js";
import { startOfGameStagePlayRuntimeCapabilityIds } from "./start-of-game-stage-play-evidence.js";

describe("generated support runtime capability matrix", () => {
  const card014APositiveCapabilityIds = [
    "category:auto",
    "condition:selfAttachedDonCount",
    "condition:trashCount",
    "condition:yourTurn",
    "drawUpTo:self:chooseQuantity",
    "effect:draw:self:count:positive-safe-integer",
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
    "sourcePresencePolicy:resolveFromDestinationZone",
    "sourcePresencePolicy:resolveFromLastKnownInformation",
    "trashFromHand:segment0:self:self:count-exact",
    "trigger:onPlay",
    "cannotAttack:all:thisTurn",
    "cannotAttack:choose:thisTurn",
    "cannotAttack:self:thisTurn",
    "cannotBlock:all:thisTurn",
    "cannotBlock:choose:thisTurn",
    "cannotBlock:self:thisTurn",
  ].sort();

  it("is deterministic and sorted by capability id", () => {
    const capabilityIds =
      generatedSupportRuntimeCapabilityMatrix.capabilities.map(
        (capability) => capability.id,
      );

    expect(capabilityIds).toEqual([...capabilityIds].sort());
    expect(JSON.stringify(generatedSupportRuntimeCapabilityMatrix)).toBe(
      JSON.stringify(generatedSupportRuntimeCapabilityMatrix),
    );
    expect(
      generatedSupportRuntimeCapabilityMatrix.capabilities.every((capability) =>
        capability.supportedComponentIds.every(
          (componentId) => componentId.length > 0,
        ),
      ),
    ).toBe(true);
  });

  it("exposes CARD-017A shape evidence on runtime capabilities used by generated support", () => {
    const drawCapability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) =>
          capability.id === "effect:draw:self:count:positive-safe-integer",
      );
    const drawUpToCapability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) => capability.id === "drawUpTo:self:chooseQuantity",
      );

    expect(drawCapability?.supportedComponentIds).toEqual(
      expect.arrayContaining([
        "on-play-draw",
        "when-attacking-draw",
        "on-play-optional-draw",
      ]),
    );
    expect(drawUpToCapability?.supportedComponentIds).toEqual([
      "on-ko-draw-up-to",
      "on-play-draw-up-to",
      "trigger-draw-up-to",
    ]);
  });

  it("exposes the narrow capabilities needed by exact draw parser rules", () => {
    expect(generatedSupportRuntimeCapabilityMatrix.generatedAtStory).toBe(
      "SUP-001E",
    );
    expect(requiredGeneratedSupportCapabilityIds).toEqual(
      [...requiredGeneratedSupportCapabilityIds].sort(),
    );
    expect(requiredGeneratedSupportCapabilityIds).toEqual(
      expect.arrayContaining([
        "category:auto",
        "composition:line-separated-effect-blocks:v1",
        "condition:fieldCount:don:public",
        "effect:draw:self:count:positive-safe-integer",
        "effect:sequence:ordered",
        "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
        "category:activate",
        "trigger:activateMain",
        "activateMain:source:leader-character-stage",
        "activateMain:oncePerTurn:legal-commitment",
        "payCost:chooseOne:optional:trashFromField-or-trashFromHand:self",
        "payCost:trashFromField:self:characterArea:character:typesAny:count-exact:optional",
        "payCost:trashFromHand:self:count-exact:optional",
        "keyword:banish:printed",
        "keyword:blocker:printed",
        "keyword:doubleAttack:printed",
        "keyword:rush:printed",
        "keyword:rushCharacter:printed",
        "sourcePresencePolicy:mustRemainInSameZone",
        "sourcePresencePolicy:none-for-keyword",
        "trigger:onPlay",
        "trigger:whenAttacking",
        "trigger:whenAttacking:oncePerTurn",
      ]),
    );

    for (const capabilityId of requiredGeneratedSupportCapabilityIds) {
      expect(hasRuntimeCapability(capabilityId)).toBe(true);
    }
  });

  it("certifies the reviewed line-separated composition parser rule", () => {
    const compositionCapability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) =>
          capability.id === "composition:line-separated-effect-blocks:v1",
      );

    expect(compositionCapability?.supportedParserRuleIds).toContain(
      "line-separated-effect-blocks:v1",
    );
  });

  it("inventories every supported parser rule id with a parser coverage category", () => {
    const inventory = listRuntimeCapabilityParserRuleInventory();
    const inventoryRuleIds = inventory.map((entry) => entry.parserRuleId);
    const matrixRuleIds = [
      ...new Set(
        generatedSupportRuntimeCapabilityMatrix.capabilities.flatMap(
          (capability) => capability.supportedParserRuleIds,
        ),
      ),
    ].sort();

    expect(inventoryRuleIds).toEqual(matrixRuleIds);
    expect(inventory).not.toContainEqual(
      expect.objectContaining({ coverage: "unclassified" }),
    );
    expect(inventory).toEqual(
      expect.arrayContaining([
        {
          coverage: "reusable-parser-component",
          parserRuleId: "exact:on-play:draw-n:self",
          parserRuleKind: "triggered-draw",
        },
        {
          coverage: "reusable-parser-component",
          parserRuleId:
            "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
          parserRuleKind: "cost-hand-selection-play-selected",
        },
        {
          coverage: "runtime-capability-only",
          parserRuleId: "card014a:static:no-source-required",
          parserRuleKind: "source-presence-policy",
        },
      ]),
    );
  });

  it("certifies draw-then-trash parser rules with corresponding capabilities", () => {
    const sequenceCapability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) => capability.id === "effect:sequence:ordered",
      );
    const trashCapability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) =>
          capability.id ===
          "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      );
    const oncePerTurnCapability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) => capability.id === "trigger:whenAttacking:oncePerTurn",
      );

    expect(sequenceCapability?.supportedParserRuleIds).toEqual(
      expect.arrayContaining([
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ]),
    );
    expect(trashCapability?.supportedParserRuleIds).toEqual(
      expect.arrayContaining([
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ]),
    );
    expect(oncePerTurnCapability?.supportedParserRuleIds).toEqual(
      expect.arrayContaining([
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ]),
    );
  });

  it("certifies SUP-003G start-of-game typed Stage play runtime capability evidence", () => {
    const parserRuleId =
      "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck";

    expect(requiredGeneratedSupportCapabilityIds).toEqual(
      expect.arrayContaining([...startOfGameStagePlayRuntimeCapabilityIds]),
    );

    for (const capabilityId of startOfGameStagePlayRuntimeCapabilityIds) {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );
      expect(capability?.supportedParserRuleIds).toContain(parserRuleId);
    }

    for (const capabilityId of [
      "trigger:startOfGame",
      "startOfGame:setup-before-opening-draw",
      "selectCards:deck:self:stage:typesAny:max1",
      "playSelected:deck:stage:max1:ignoreCost",
      "setupHiddenInfo:deck-candidates:chooserOnly",
      "setupStagePlay:stageArea:replace-existing",
    ]) {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );
      expect(capability?.supportedComponentIds).toContain(
        "start-of-game-play-up-to-one-typed-stage-from-deck",
      );
    }
    expect(listRuntimeCapabilityParserRuleInventory()).toContainEqual(
      expect.objectContaining({
        coverage: "reusable-parser-component",
        parserRuleId,
        parserRuleKind: "sequence",
      }),
    );
  });

  it("certifies the exact CARD-014C reverse sequence parser rule with CARD-014A capability evidence", () => {
    const reverseParserRuleId = "exact:on-play:trash-2-from-hand:draw-1:self";
    const capabilityIds = [
      "category:auto",
      "effect:draw:self:count:positive-safe-integer",
      "effect:sequence:ordered",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sequence:genericFrames",
      "sequence:trashFromHand:draw",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trashFromHand:segment0:self:self:count-exact",
      "trigger:onPlay",
    ];

    for (const capabilityId of capabilityIds) {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );

      expect(capability?.sinceStory).toMatch(/CARD-00|CARD-014A/);
      expect(capability?.supportedParserRuleIds).toContain(reverseParserRuleId);
    }
  });

  it("certifies the exact draw-up-to parser rule with chooseQuantity-backed ENG capability evidence", () => {
    const parserRuleId = "exact:on-play:draw-up-to-n:self";
    const drawUpToCapability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) => capability.id === "drawUpTo:self:chooseQuantity",
      );
    const requiredCapabilityIds = [
      "category:auto",
      "drawUpTo:self:chooseQuantity",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ];

    expect(drawUpToCapability).toMatchObject({
      description:
        "Draw up to a chosen quantity of cards for the source controller using a chooseQuantity decision.",
      kind: "effect",
      sinceStory: "ENG-055H",
      supported: true,
    });
    expect(drawUpToCapability?.supportedParserRuleIds).toEqual(
      expect.arrayContaining([
        parserRuleId,
        "exact:on-ko:draw-up-to-n:self",
        "exact:trigger:draw-up-to-n:self",
      ]),
    );
    for (const capabilityId of requiredCapabilityIds) {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );

      expect(capability?.supportedParserRuleIds).toContain(parserRuleId);
    }
  });

  it.each([
    {
      parserRuleId: "exact:on-play:optional-effect:draw-1:self",
      requiredCapabilities: [
        "category:auto",
        "effect:draw:self:count:positive-safe-integer",
        "optionalEffectBlock:onPlay:draw-1:self",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
    },
    {
      parserRuleId: "exact:condition:your-turn",
      requiredCapabilities: [
        "category:auto",
        "condition:yourTurn",
        "effect:draw:self:count:positive-safe-integer",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
    },
    {
      parserRuleId: "exact:condition:self-attached-don-count",
      requiredCapabilities: [
        "category:auto",
        "condition:selfAttachedDonCount",
        "effect:draw:self:count:positive-safe-integer",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
    },
  ])(
    "certifies CARD-014F parser rule $parserRuleId with exact capability evidence",
    ({ parserRuleId, requiredCapabilities }) => {
      for (const capabilityId of requiredCapabilities) {
        const capability =
          generatedSupportRuntimeCapabilityMatrix.capabilities.find(
            (candidate) => candidate.id === capabilityId,
          );

        expect(capability?.supported).toBe(true);
        expect(capability?.supportedParserRuleIds).toContain(parserRuleId);
      }
    },
  );

  it("certifies the exact return-DON play-from-hand parser rule with ENG capability evidence", () => {
    const parserRuleId =
      "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected";
    const requiredCapabilities = [
      { capabilityId: "category:auto", sinceStory: "CARD-008A" },
      {
        capabilityId: "payCost:returnDon:self:count-exact",
        sinceStory: "ENG-055F",
      },
      {
        capabilityId: "playSelected:hand:character:max1",
        sinceStory: "ENG-055G",
      },
      {
        capabilityId: "playSelected:hand:character:max1:ignoreCost",
        sinceStory: "ENG-055G",
      },
      {
        capabilityId: "returnDon:cost:self:count-exact",
        sinceStory: "ENG-055F",
      },
      {
        capabilityId: "selectCards:hand:self:character:max1",
        sinceStory: "ENG-055F",
      },
      { capabilityId: "sequence:genericFrames", sinceStory: "CARD-014A" },
      {
        capabilityId: "sourcePresencePolicy:mustRemainInSameZone",
        sinceStory: "CARD-008A",
      },
      { capabilityId: "trigger:onPlay", sinceStory: "CARD-008A" },
    ];

    for (const { capabilityId, sinceStory } of requiredCapabilities) {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );

      expect(capability?.sinceStory).toBe(sinceStory);
      expect(capability?.supportedParserRuleIds).toContain(parserRuleId);
    }
  });

  it.each([
    {
      parserRuleId: "exact:on-play:select-1-opponent-character-target",
      requiredCapabilities: [
        "category:auto",
        "savedSelectedTargets:producer",
        "selectTargets:field:public:character:max1",
        "sequence:genericFrames",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
    },
    {
      parserRuleId:
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
      requiredCapabilities: [
        "category:auto",
        "effect:ko:saved-field-object:characterArea:public",
        "savedFieldObject:consumer:generic",
        "savedSelectedTargets:producer",
        "selectTargets:field:public:character:max1",
        "sequence:genericFrames",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
      ],
    },
  ])(
    "certifies CARD-014G selected field-object parser rule $parserRuleId with capability evidence",
    ({ parserRuleId, requiredCapabilities }) => {
      for (const capabilityId of requiredCapabilities) {
        const capability =
          generatedSupportRuntimeCapabilityMatrix.capabilities.find(
            (candidate) => candidate.id === capabilityId,
          );

        expect(capability?.supported).toBe(true);
        expect(capability?.supportedParserRuleIds).toContain(parserRuleId);
      }
    },
  );

  it.each([
    {
      parserRuleId: "exact:on-play:modify-power:self:this-turn",
      requiredCapabilities: ["modifyPower:self:thisTurn"],
    },
    {
      parserRuleId: "exact:on-play:modify-power:self:this-battle",
      requiredCapabilities: ["modifyPower:self:thisBattle"],
    },
    {
      parserRuleId: "exact:on-play:modify-power:all:this-turn",
      requiredCapabilities: ["modifyPower:all:thisTurn"],
    },
    {
      parserRuleId: "exact:on-play:cannot-attack:self:this-turn",
      requiredCapabilities: ["cannotAttack:self:thisTurn"],
    },
    {
      parserRuleId: "exact:on-play:cannot-attack:all:this-turn",
      requiredCapabilities: ["cannotAttack:all:thisTurn"],
    },
    {
      parserRuleId: "exact:on-play:cannot-block:self:this-turn",
      requiredCapabilities: ["cannotBlock:self:thisTurn"],
    },
    {
      parserRuleId: "exact:on-play:cannot-block:all:this-turn",
      requiredCapabilities: ["cannotBlock:all:thisTurn"],
    },
  ])(
    "certifies CARD-014G modifier/restriction parser rule $parserRuleId with capability evidence",
    ({ parserRuleId, requiredCapabilities }) => {
      for (const capabilityId of [
        "category:auto",
        "sourcePresencePolicy:mustRemainInSameZone",
        "trigger:onPlay",
        ...requiredCapabilities,
      ]) {
        const capability =
          generatedSupportRuntimeCapabilityMatrix.capabilities.find(
            (candidate) => candidate.id === capabilityId,
          );

        expect(capability?.supported).toBe(true);
        expect(capability?.supportedParserRuleIds).toContain(parserRuleId);
      }
    },
  );

  it.each([
    {
      capabilityId: "modifyPower:choose:thisTurn:zeroChoiceBranch",
      parserRuleId: "exact:on-play:modify-power:choose:this-turn",
    },
    {
      capabilityId: "cannotAttack:choose:thisTurn:zeroChoiceBranch",
      parserRuleId: "exact:on-play:cannot-attack:choose:this-turn",
    },
    {
      capabilityId: "cannotBlock:choose:thisTurn:zeroChoiceBranch",
      parserRuleId: "exact:on-play:cannot-block:choose:this-turn",
    },
  ])(
    "keeps CARD-014G zero-choice parser rule $parserRuleId linked to $capabilityId",
    ({ capabilityId, parserRuleId }) => {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );

      expect(capability?.supportedParserRuleIds).toContain(parserRuleId);
    },
  );

  it.each([
    {
      capabilityId: "keyword:blocker:printed",
      parserRuleId: "exact:keyword:blocker:standalone",
    },
    {
      capabilityId: "keyword:rush:printed",
      parserRuleId: "exact:keyword:rush:standalone",
    },
    {
      capabilityId: "keyword:rushCharacter:printed",
      parserRuleId: "exact:keyword:rush-character:standalone",
    },
    {
      capabilityId: "keyword:doubleAttack:printed",
      parserRuleId: "exact:keyword:double-attack:standalone",
    },
    {
      capabilityId: "keyword:banish:printed",
      parserRuleId: "exact:keyword:banish:standalone",
    },
  ])(
    "certifies $capabilityId for $parserRuleId",
    ({ capabilityId, parserRuleId }) => {
      const keywordCapability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (capability) => capability.id === capabilityId,
        );
      const sourcePolicyCapability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (capability) =>
            capability.id === "sourcePresencePolicy:none-for-keyword",
        );

      expect(keywordCapability?.supportedParserRuleIds).toContain(parserRuleId);
      expect(sourcePolicyCapability?.supportedParserRuleIds).toContain(
        parserRuleId,
      );
    },
  );

  it("lists only supported capability ids and keeps unsupported probes absent", () => {
    expect(listSupportedRuntimeCapabilityIds()).toEqual(
      requiredGeneratedSupportCapabilityIds,
    );
    expect(hasRuntimeCapability("effect:ko:targeted")).toBe(false);
    expect(hasRuntimeCapability("trigger:activateMain")).toBe(true);
  });

  it("exposes public trash-count condition capability from ENG-059A", () => {
    const capability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (candidate) => candidate.id === "condition:trashCount",
      );

    expect(capability).toMatchObject({
      id: "condition:trashCount",
      kind: "condition",
      sinceStory: "ENG-059A",
      supported: true,
    });
    expect(hasRuntimeCapability("condition:trashCount")).toBe(true);
  });

  it("exposes every exact CARD-014A positive capability id without dropping existing records", () => {
    for (const capabilityId of card014APositiveCapabilityIds) {
      expect(hasRuntimeCapability(capabilityId)).toBe(true);
    }

    expect(listSupportedRuntimeCapabilityIds()).toEqual(
      expect.arrayContaining(card014APositiveCapabilityIds),
    );
  });

  it("keeps unsupported CARD-014A families absent from the positive capability matrix", () => {
    expect(
      hasRuntimeCapability("savedFieldObject:consumer:modifierTarget"),
    ).toBe(false);
    expect(
      hasRuntimeCapability("savedFieldObject:consumer:restrictionTarget"),
    ).toBe(false);
    expect(
      hasRuntimeCapability("selectCards:hand:savedReference:character:max1"),
    ).toBe(false);
    expect(
      hasRuntimeCapability("playSelected:savedReference:character:max1"),
    ).toBe(false);
    expect(hasRuntimeCapability("sequence:position:segment2")).toBe(false);
    expect(hasRuntimeCapability("sequence:repeat")).toBe(false);
    expect(
      hasRuntimeCapability("selectTargets:field:public:opponentLeader:max1"),
    ).toBe(false);
    expect(hasRuntimeCapability("modifyPower:self:permanent")).toBe(false);
    expect(hasRuntimeCapability("modifyPower:self:untilStartOfNextTurn")).toBe(
      false,
    );
    expect(hasRuntimeCapability("modifyPower:choose:thisAction")).toBe(false);
    expect(hasRuntimeCapability("modifyPower:choose:whileConditionTrue")).toBe(
      false,
    );
    expect(
      hasRuntimeCapability(
        "sourcePresencePolicy:resolveFromDestinationZone:trigger:activateMain",
      ),
    ).toBe(false);
    expect(hasRuntimeCapability("trigger:stage")).toBe(false);
    expect(hasRuntimeCapability("trigger:event")).toBe(false);
    expect(hasRuntimeCapability("replacement:damage")).toBe(false);
    expect(hasRuntimeCapability("refreshLock:don")).toBe(false);
  });

  it("tracks generalized conditional continuous parser-rule coverage", () => {
    const requiredCapabilities = [
      "category:permanent",
      "effect:giveKeyword:self:permanent:allowlisted",
      "effect:giveProtection:fieldRemoval:thisCard:permanent",
      "trigger:permanent",
    ];
    const parserRuleId =
      "exact:conditional-continuous:condition:body-part-composition:self-character:sequence:mixed";

    for (const capabilityId of requiredCapabilities) {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );

      expect(capability?.supportedParserRuleIds).toContain(parserRuleId);
    }
  });

  it("links conditional continuous parser-rule variants to source-presence and sequence capabilities accurately", () => {
    const sourcePresenceCapability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (candidate) =>
          candidate.id === "sourcePresencePolicy:mustRemainInSameZone",
      );
    const sequenceCapability =
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (candidate) => candidate.id === "effect:sequence:ordered",
      );

    expect(sourcePresenceCapability?.supportedParserRuleIds).toEqual(
      expect.arrayContaining([
        "exact:conditional-continuous:condition:body-part-composition:self-character:direct:keyword",
        "exact:conditional-continuous:condition:body-part-composition:self-character:direct:protection",
        "exact:conditional-continuous:condition:body-part-composition:self-character:sequence:keyword-only",
        "exact:conditional-continuous:condition:body-part-composition:self-character:sequence:protection-only",
        "exact:conditional-continuous:condition:body-part-composition:self-character:sequence:mixed",
      ]),
    );

    expect(sequenceCapability?.supportedParserRuleIds).toEqual(
      expect.arrayContaining([
        "exact:conditional-continuous:condition:body-part-composition:self-character:sequence:keyword-only",
        "exact:conditional-continuous:condition:body-part-composition:self-character:sequence:protection-only",
        "exact:conditional-continuous:condition:body-part-composition:self-character:sequence:mixed",
      ]),
    );
    expect(sequenceCapability?.supportedParserRuleIds).not.toContain(
      "exact:conditional-continuous:condition:body-part-composition:self-character:direct:keyword",
    );
    expect(sequenceCapability?.supportedParserRuleIds).not.toContain(
      "exact:conditional-continuous:condition:body-part-composition:self-character:direct:protection",
    );
  });

  it("tracks SUP-002C conditional base-power setter runtime capability evidence", () => {
    const parserRuleId =
      "exact:conditional-continuous:condition:base-power:self-character-type:direct";
    const requiredCapabilities = [
      {
        capabilityId: "category:permanent",
        sinceStory: "ENG-059F",
      },
      {
        capabilityId: "condition:trashCount:self:gte",
        sinceStory: "SUP-002C",
      },
      {
        capabilityId: "continuous:source-liveness:must-remain-in-same-zone",
        sinceStory: "SUP-002C",
      },
      {
        capabilityId: "effect:setBasePower:self:typed-characters:permanent",
        sinceStory: "SUP-002C",
      },
      {
        capabilityId: "sourcePresencePolicy:mustRemainInSameZone",
        sinceStory: "CARD-008A",
      },
      {
        capabilityId: "target:all:self:characterArea:character:typesAny",
        sinceStory: "SUP-002C",
      },
      {
        capabilityId: "trigger:permanent",
        sinceStory: "ENG-059F",
      },
    ];

    for (const { capabilityId, sinceStory } of requiredCapabilities) {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );

      expect(capability).toMatchObject({
        sinceStory,
        supported: true,
      });
      expect(capability?.supportedParserRuleIds).toContain(parserRuleId);
      expect(capability?.supportedComponentIds).toContain(
        "conditional-continuous-condition-base-power-self-character-type",
      );
    }
  });

  it("does not add runtime capabilities for external deck-construction parser evidence", () => {
    const parserRuleId =
      "exact:external-deck-rule:category-cost-gte-in-your-deck";
    const capabilities =
      generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.supportedParserRuleIds.includes(parserRuleId),
      );

    expect(capabilities).toEqual([]);
  });

  it("tracks SUP-003F activate-main optional choose-one trash cost draw capability evidence", () => {
    const parserRuleId =
      "exact:activate-main:once-per-turn:optional-choose-one-trash-self-field-type-or-hand:draw-n:self";
    const requiredCapabilities = [
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
    ];

    for (const capabilityId of requiredCapabilities) {
      const capability =
        generatedSupportRuntimeCapabilityMatrix.capabilities.find(
          (candidate) => candidate.id === capabilityId,
        );

      expect(capability?.supported).toBe(true);
      expect(capability?.supportedComponentIds).toContain(
        "activate-main-once-per-turn-optional-choose-one-trash-self-field-type-or-hand-then-draw",
      );
      expect(capability?.supportedParserRuleIds).toContain(parserRuleId);
    }

    expect(
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (candidate) => candidate.id === "category:activate",
      )?.supportedParserRuleIds,
    ).toContain(parserRuleId);
  });
});
