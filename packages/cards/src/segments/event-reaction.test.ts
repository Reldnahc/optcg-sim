import { describe, expect, it } from "vitest";

import {
  activatedReactionPredicateParsers,
  implicitReactionPredicateParsers,
  parseReactionPredicateFromSet,
} from "./event-reaction.js";

describe("event reaction predicate routing", () => {
  it("parses shared reaction predicates through semantic predicate groups", () => {
    const text = "a card is removed from your or your opponent's Life cards";

    expect(
      parseReactionPredicateFromSet({ text }, implicitReactionPredicateParsers),
    ).toMatchObject({
      trigger: {
        type: "lifeRemoved",
        players: ["self", "opponent"],
      },
      evidence: ["trigger:lifeRemoved", "player:self", "player:opponent"],
    });

    expect(
      parseReactionPredicateFromSet(
        { text },
        activatedReactionPredicateParsers,
      ),
    ).toMatchObject({
      trigger: {
        type: "lifeRemoved",
        players: ["self", "opponent"],
      },
      evidence: ["trigger:lifeRemoved", "player:self", "player:opponent"],
    });
  });
});
