import { describe, expect, it } from "vitest";

import {
  generatedSupportRuntimeCapabilityMatrix,
  hasRuntimeCapability,
  listSupportedRuntimeCapabilityIds,
  requiredGeneratedSupportCapabilityIds,
} from "./runtime-capability-matrix.js";

describe("generated support runtime capability matrix", () => {
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
      "CARD-009B",
    );
    expect(requiredGeneratedSupportCapabilityIds).toEqual([
      "category:auto",
      "composition:line-separated-effect-blocks:v1",
      "effect:draw:self:count:positive-safe-integer",
      "effect:sequence:ordered",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
      "trigger:whenAttacking",
      "trigger:whenAttacking:oncePerTurn",
    ]);

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

  it("lists only supported capability ids and keeps unsupported probes absent", () => {
    expect(listSupportedRuntimeCapabilityIds()).toEqual(
      requiredGeneratedSupportCapabilityIds,
    );
    expect(hasRuntimeCapability("effect:ko:targeted")).toBe(false);
    expect(hasRuntimeCapability("trigger:activateMain")).toBe(false);
  });
});
