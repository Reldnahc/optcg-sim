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

  it.each([
    {
      text: "a DON!! card on your field is returned to your DON!! deck",
      trigger: { type: "donReturned", player: "self" },
      evidence: ["trigger:donReturned", "player:self"],
    },
    {
      text: "a DON!! card on the field is returned to your DON!! deck",
      trigger: { type: "donReturned", player: "self" },
      evidence: ["trigger:donReturned", "player:self"],
    },
    {
      text: "a DON!! card on your field is returned to your DON!! deck by your effect",
      trigger: {
        type: "donReturned",
        player: "self",
        sourceController: "self",
        sourceKind: "effect",
      },
      evidence: [
        "trigger:donReturned",
        "player:self",
        "replacementSource:cardEffect",
      ],
    },
  ])(
    "parses shared DON-returned predicate $text through semantic predicate groups",
    ({ text, trigger, evidence }) => {
      const implicit = parseReactionPredicateFromSet(
        { text },
        implicitReactionPredicateParsers,
      );
      expect(implicit).toMatchObject({ trigger });
      for (const primitive of evidence) {
        expect(implicit?.evidence).toContain(primitive);
      }

      const activated = parseReactionPredicateFromSet(
        { text },
        activatedReactionPredicateParsers,
      );
      expect(activated).toMatchObject({ trigger });
      for (const primitive of evidence) {
        expect(activated?.evidence).toContain(primitive);
      }
    },
  );
});
