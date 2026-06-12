import { describe, expect, it } from "vitest";
import type { Trigger } from "@optcg/types";

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

  it.each([
    {
      text: "a Character is K.O.'d",
      trigger: {
        type: "anyOf",
        triggers: [
          {
            type: "fieldRemoved",
            player: "self",
            filter: { categories: ["character"] },
            sourceKind: "ko",
          },
          {
            type: "fieldRemoved",
            player: "opponent",
            filter: { categories: ["character"] },
            sourceKind: "ko",
          },
        ],
      },
      evidence: [
        "trigger:fieldRemoved",
        "player:self",
        "player:opponent",
        "composition:triggerAnyOf",
        "filter:category:character",
      ],
    },
    {
      text: "a Character is removed from the field by your effect",
      trigger: {
        type: "anyOf",
        triggers: [
          {
            type: "fieldRemoved",
            player: "self",
            filter: { categories: ["character"] },
            sourceController: "self",
            sourceKind: "effect",
          },
          {
            type: "fieldRemoved",
            player: "opponent",
            filter: { categories: ["character"] },
            sourceController: "self",
            sourceKind: "effect",
          },
        ],
      },
      evidence: [
        "trigger:fieldRemoved",
        "player:self",
        "player:opponent",
        "composition:triggerAnyOf",
        "filter:category:character",
      ],
    },
    {
      text: "your {Example} type Character is K.O.'d",
      trigger: {
        type: "fieldRemoved",
        player: "self",
        filter: { categories: ["character"], typesAny: ["Example"] },
        sourceKind: "ko",
      },
      evidence: ["trigger:fieldRemoved", "player:self", "filter:type"],
    },
    {
      text: "your {Example} type Character is removed from the field",
      trigger: {
        type: "fieldRemoved",
        player: "self",
        filter: { categories: ["character"], typesAny: ["Example"] },
        sourceKind: "any",
      },
      evidence: ["trigger:fieldRemoved", "player:self", "filter:type"],
    },
    {
      text: "your {Example} type Character is removed from the field by your opponent's effect or K.O.'d",
      trigger: {
        type: "fieldRemoved",
        player: "self",
        filter: { categories: ["character"], typesAny: ["Example"] },
        sourceController: "opponent",
        sourceKind: "any",
      },
      evidence: ["trigger:fieldRemoved", "player:self", "filter:type"],
    },
    {
      text: "this Character is K.O.'d by your opponent's effect",
      trigger: {
        type: "fieldRemoved",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
        sourceController: "opponent",
        sourceKind: "effect",
      },
      evidence: [
        "trigger:fieldRemoved",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
      ],
    },
  ] satisfies Array<{
    readonly text: string;
    readonly trigger: Trigger;
    readonly evidence: readonly string[];
  }>)(
    "parses shared field-removal predicate $text through semantic predicate groups",
    ({ text, trigger, evidence }) => {
      assertPredicateParsesThroughBothGroups(text, trigger, evidence);
    },
  );
});

function assertPredicateParsesThroughBothGroups(
  text: string,
  trigger: Trigger,
  evidence: readonly string[],
): void {
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
}
