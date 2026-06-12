import { describe, expect, it } from "vitest";

import {
  activatedReactionPredicateParsers,
  implicitReactionPredicateParsers,
  parseReactionPredicateFromSet,
} from "./event-reaction.js";

describe("event reaction predicate routing", () => {
  it.each([
    {
      text: "a card is removed from your Life cards",
      trigger: { type: "lifeRemoved", players: ["self"] },
      evidence: ["trigger:lifeRemoved", "player:self"],
    },
    {
      text: "a card is removed from your opponent's Life cards",
      trigger: { type: "lifeRemoved", players: ["opponent"] },
      evidence: ["trigger:lifeRemoved", "player:opponent"],
    },
    {
      text: "a card is removed from your or your opponent's Life cards",
      trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
      evidence: ["trigger:lifeRemoved", "player:self", "player:opponent"],
    },
    {
      text: "a card is added to your hand from your Life",
      trigger: { type: "lifeRemoved", players: ["self"], destination: "hand" },
      evidence: ["trigger:lifeRemoved", "player:self", "destination:hand"],
    },
  ])(
    "parses shared life-removed predicate $text through semantic predicate groups",
    ({ text, trigger, evidence }) => {
      expect(
        parseReactionPredicateFromSet(
          { text },
          implicitReactionPredicateParsers,
        ),
      ).toMatchObject({
        trigger,
        evidence,
      });

      expect(
        parseReactionPredicateFromSet(
          { text },
          activatedReactionPredicateParsers,
        ),
      ).toMatchObject({
        trigger,
        evidence,
      });
    },
  );
});
