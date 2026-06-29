import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createDefaultBotDeckSubmission } from "./bot-deck.js";
import { redShanksCardSpecs } from "./bot-red-shanks-card-spec.js";
import { redShanksProfileData } from "./bot-red-shanks-profile.js";

describe("red Shanks card specs", () => {
  test("cover every card in the default bot deck", () => {
    const deck = createDefaultBotDeckSubmission();
    const deckCardIds = [
      String(deck.decoded.leader.cardId),
      ...deck.decoded.main.map((entry) => String(entry.cardId)),
    ].sort();
    const specCardIds = redShanksCardSpecs.map((spec) => spec.cardId).sort();

    assert.deepEqual(specCardIds, deckCardIds);
  });

  test("profile roles are justified by card specs", () => {
    const specsById = new Map(
      redShanksCardSpecs.map((spec) => [spec.cardId, spec]),
    );

    for (const [cardId, roles] of Object.entries(
      redShanksProfileData.cardRoles,
    )) {
      const spec = specsById.get(cardId);
      assert.notEqual(spec, undefined, cardId);
      for (const role of roles ?? []) {
        assert.equal(
          spec?.roles.includes(role),
          true,
          `${cardId} missing role ${role}`,
        );
      }
    }
  });

  test("OP16-012 cheat policies cover Shanks payoff cards only", () => {
    const cheatTargetIds = redShanksProfileData.cheatTargets
      .map((target) => target.cardId)
      .sort();

    assert.deepEqual(cheatTargetIds, [
      "OP06-007",
      "OP09-004",
      "OP12-008",
      "ST23-002",
    ]);
  });
});
