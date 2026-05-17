import { describe, expect, it } from "vitest";

import {
  generatedSupportRuntimeCapabilityMatrix,
  hasRuntimeCapability,
  listSupportedRuntimeCapabilityIds,
  requiredGeneratedSupportCapabilityIds,
} from "./runtime-capability-matrix.js";

describe("generated support runtime capability matrix", () => {
  const card014APositiveCapabilityIds = [
    "category:auto",
    "condition:selfAttachedDonCount",
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
  });

  it("exposes the narrow capabilities needed by exact draw parser rules", () => {
    expect(generatedSupportRuntimeCapabilityMatrix.generatedAtStory).toBe(
      "CARD-014A",
    );
    expect(requiredGeneratedSupportCapabilityIds).toEqual(
      [...requiredGeneratedSupportCapabilityIds].sort(),
    );
    expect(requiredGeneratedSupportCapabilityIds).toEqual(
      expect.arrayContaining([
        "category:auto",
        "composition:line-separated-effect-blocks:v1",
        "effect:draw:self:count:positive-safe-integer",
        "effect:sequence:ordered",
        "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
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

  it.each([
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
    expect(hasRuntimeCapability("trigger:activateMain")).toBe(false);
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
});
