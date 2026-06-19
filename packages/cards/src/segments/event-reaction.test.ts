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

  it("parses this-card battles filtered Characters as an attack-declared counterpart predicate", () => {
    expect(
      parseReactionPredicateFromSet(
        { text: "this Character battles ＜Strike＞ attribute Characters" },
        implicitReactionPredicateParsers,
      ),
    ).toMatchObject({
      trigger: {
        type: "attackDeclared",
        role: "attackerOrTarget",
        player: "self",
        filter: { categories: ["character"] },
        counterpartPlayer: "opponent",
        counterpartFilter: {
          categories: ["character"],
          attributesAny: ["strike"],
        },
      },
    });
  });

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
      text: "one of your {Amazon Lily} or {Kuja Pirates} type Characters with 5000 base power or more is K.O.'d",
      trigger: {
        type: "fieldRemoved",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Amazon Lily", "Kuja Pirates"],
          power: { min: 5000 },
        },
        sourceKind: "ko",
      },
      evidence: [
        "trigger:fieldRemoved",
        "player:self",
        "filter:type",
        "filter:power",
        "condition:comparator:gte",
      ],
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
      text: "your {Example} type Character is removed from the field by an effect",
      trigger: {
        type: "fieldRemoved",
        player: "self",
        filter: { categories: ["character"], typesAny: ["Example"] },
        sourceKind: "effect",
      },
      evidence: [
        "trigger:fieldRemoved",
        "player:self",
        "filter:type",
        "replacementSource:cardEffect",
      ],
    },
    {
      text: "your {Example} type Character is removed from the field by your opponent's effect",
      trigger: {
        type: "fieldRemoved",
        player: "self",
        filter: { categories: ["character"], typesAny: ["Example"] },
        sourceController: "opponent",
        sourceKind: "effect",
      },
      evidence: [
        "trigger:fieldRemoved",
        "player:self",
        "filter:type",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
      ],
    },
    {
      text: "your {Example} type Character is removed from the field by your opponent's effect or K.O.'d",
      trigger: {
        type: "anyOf",
        triggers: [
          {
            type: "fieldRemoved",
            player: "self",
            filter: { categories: ["character"], typesAny: ["Example"] },
            sourceController: "opponent",
            sourceKind: "effect",
          },
          {
            type: "fieldRemoved",
            player: "self",
            filter: { categories: ["character"], typesAny: ["Example"] },
            sourceKind: "ko",
          },
        ],
      },
      evidence: [
        "trigger:fieldRemoved",
        "player:self",
        "filter:type",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
        "composition:triggerAnyOf",
      ],
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
    {
      text: "this Character is K.O.'d",
      trigger: {
        type: "fieldRemoved",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
        sourceKind: "ko",
      },
      evidence: [
        "trigger:fieldRemoved",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
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

  it.each([
    {
      text: "you play a Character",
      trigger: {
        type: "cardPlayed",
        player: "self",
        filter: { categories: ["character"] },
      },
      evidence: [
        "trigger:cardPlayed",
        "player:self",
        "filter:category:character",
      ],
    },
    {
      text: "your opponent plays a Character",
      trigger: {
        type: "cardPlayed",
        player: "opponent",
        filter: { categories: ["character"] },
      },
      evidence: [
        "trigger:cardPlayed",
        "player:opponent",
        "filter:category:character",
      ],
    },
    {
      text: "your opponent plays a Character using a Character's effect",
      trigger: {
        type: "cardPlayed",
        player: "opponent",
        filter: { categories: ["character"] },
        sourceFilter: { categories: ["character"] },
      },
      evidence: [
        "trigger:cardPlayed",
        "player:opponent",
        "filter:category:character",
      ],
    },
    {
      text: "you play a Character with a [Trigger]",
      trigger: {
        type: "cardPlayed",
        player: "self",
        filter: {
          categories: ["character"],
          effectEntryPoint: { mode: "with", trigger: { type: "trigger" } },
        },
      },
      evidence: [
        "trigger:cardPlayed",
        "player:self",
        "filter:category:character",
        "filter:effectEntryPoint",
        "filter:effectEntryPoint:with",
      ],
    },
    {
      text: "you play a Character with no base effect from your hand",
      trigger: {
        type: "cardPlayed",
        player: "self",
        sourceZone: "hand",
        filter: {
          categories: ["character"],
          effectEntryPoint: { mode: "without", trigger: { type: "onPlay" } },
        },
      },
      evidence: [
        "trigger:cardPlayed",
        "player:self",
        "zone:hand",
        "filter:category:character",
        "filter:effectEntryPoint",
        "filter:effectEntryPoint:without",
      ],
    },
    {
      text: "a {Land of Wano} type Character card is played from your trash",
      trigger: {
        type: "cardPlayed",
        player: "self",
        sourceZone: "trash",
        filter: { categories: ["character"], typesAny: ["Land of Wano"] },
      },
      evidence: [
        "trigger:cardPlayed",
        "player:self",
        "zone:trash",
        "filter:type",
      ],
    },
    {
      text: "your opponent plays a Character with a base cost of 8 or more, or when your opponent plays a Character using a Character's effect",
      trigger: {
        type: "cardPlayed",
        player: "opponent",
        anyOf: [
          {
            filter: {
              categories: ["character"],
              baseCost: { min: 8 },
            },
          },
          {
            filter: { categories: ["character"] },
            sourceFilter: { categories: ["character"] },
          },
        ],
      },
      evidence: [
        "trigger:cardPlayed",
        "player:opponent",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "composition:triggerAnyOf",
      ],
    },
  ] satisfies Array<{
    readonly text: string;
    readonly trigger: Trigger;
    readonly evidence: readonly string[];
  }>)(
    "parses shared card-played predicate $text through semantic predicate groups",
    ({ text, trigger, evidence }) => {
      assertPredicateParsesThroughBothGroups(text, trigger, evidence);
    },
  );

  it.each([
    "your {Example} type Character with unsupported text is K.O.'d",
    "you play a Character with unsupported text",
    "a {Land of Wano} type Character card with unsupported text is played from your trash",
  ])("fails closed for unsupported Character filter tail $text", (text) => {
    expect(
      parseReactionPredicateFromSet({ text }, implicitReactionPredicateParsers),
    ).toBeUndefined();
    expect(
      parseReactionPredicateFromSet(
        { text },
        activatedReactionPredicateParsers,
      ),
    ).toBeUndefined();
  });

  it.each([
    {
      text: "a [Trigger] activates",
      trigger: {
        type: "anyOf",
        triggers: [
          { type: "triggerActivated", player: "self" },
          { type: "triggerActivated", player: "opponent" },
        ],
      },
      evidence: [
        "activation:trigger",
        "player:self",
        "player:opponent",
        "composition:triggerAnyOf",
      ],
    },
    {
      text: "your opponent activates an Event",
      trigger: {
        type: "opponentActivated",
        activations: ["event"],
      },
      evidence: ["trigger:opponentActivated", "activation:event"],
    },
    {
      text: "you activate an Event",
      trigger: {
        type: "effectQueued",
        player: "self",
        sourceFilter: { categories: ["event"] },
      },
      evidence: [
        "trigger:effectQueued",
        "player:self",
        "filter:category:event",
        "activation:event",
      ],
    },
    {
      text: "your opponent activates an Event or [Blocker]",
      trigger: {
        type: "opponentActivated",
        activations: ["event", "blocker"],
      },
      evidence: [
        "trigger:opponentActivated",
        "activation:event",
        "activation:blocker",
      ],
      allowBodyBlockPatch: true,
    },
    {
      text: "your opponent activates [Blocker]",
      trigger: { type: "opponentActivated", activations: ["blocker"] },
      evidence: ["trigger:opponentActivated", "activation:blocker"],
      allowBodyBlockPatch: true,
    },
    {
      text: "your opponent activates an Event or [Trigger]",
      trigger: {
        type: "opponentActivated",
        activations: ["event", "trigger"],
      },
      evidence: [
        "trigger:opponentActivated",
        "activation:event",
        "activation:trigger",
      ],
    },
  ] satisfies Array<{
    readonly text: string;
    readonly trigger: Trigger;
    readonly evidence: readonly string[];
    readonly allowBodyBlockPatch?: boolean;
  }>)(
    "parses shared activation predicate $text through semantic predicate groups",
    ({ text, trigger, evidence, allowBodyBlockPatch }) => {
      assertPredicateParsesThroughBothGroups(
        text,
        trigger,
        evidence,
        allowBodyBlockPatch === undefined ? {} : { allowBodyBlockPatch },
      );
    },
  );

  it.each([
    {
      text: "this Character becomes rested",
      trigger: {
        type: "cardRested",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
      },
      evidence: [
        "trigger:cardRested",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
      ],
    },
    {
      text: "this Character is rested by your opponent's effect",
      trigger: {
        type: "cardRested",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
        sourceController: "opponent",
        sourceKind: "effect",
      },
      evidence: [
        "trigger:cardRested",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
      ],
    },
    {
      text: "this Character becomes rested by your opponent's Character's effect",
      trigger: {
        type: "cardRested",
        target: "self",
        player: "self",
        filter: { categories: ["character"] },
        sourceController: "opponent",
        sourceKind: "effect",
        sourceFilter: { categories: ["character"] },
      },
      evidence: [
        "trigger:cardRested",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
      ],
    },
    {
      text: "a Character is rested by your effect",
      trigger: {
        type: "anyOf",
        triggers: [
          {
            type: "cardRested",
            target: "any",
            player: "self",
            filter: { categories: ["character"] },
            sourceController: "self",
            sourceKind: "effect",
          },
          {
            type: "cardRested",
            target: "any",
            player: "opponent",
            filter: { categories: ["character"] },
            sourceController: "self",
            sourceKind: "effect",
          },
        ],
      },
      evidence: [
        "trigger:cardRested",
        "player:self",
        "player:opponent",
        "composition:triggerAnyOf",
        "filter:category:character",
        "replacementSource:self",
        "replacementSource:cardEffect",
      ],
    },
  ] satisfies Array<{
    readonly text: string;
    readonly trigger: Trigger;
    readonly evidence: readonly string[];
  }>)(
    "parses shared card-rested predicate $text through semantic predicate groups",
    ({ text, trigger, evidence }) => {
      assertPredicateParsesThroughBothGroups(text, trigger, evidence);
    },
  );

  it.each([
    {
      text: "a card is trashed from your hand by an effect",
      trigger: { type: "handTrashedByEffect", player: "self" },
      evidence: [
        "trigger:handTrashedByEffect",
        "zone:hand",
        "destination:trash",
        "player:self",
      ],
    },
    {
      text: "a card is trashed from your hand by your {Navy} type card's effect",
      trigger: {
        type: "handTrashedByEffect",
        player: "self",
        sourceFilter: { typesAny: ["Navy"] },
      },
      evidence: [
        "trigger:handTrashedByEffect",
        "zone:hand",
        "destination:trash",
        "player:self",
        "filter:type",
      ],
    },
  ] satisfies Array<{
    readonly text: string;
    readonly trigger: Trigger;
    readonly evidence: readonly string[];
  }>)(
    "parses shared hand-trash predicate $text through semantic predicate groups",
    ({ text, trigger, evidence }) => {
      assertPredicateParsesThroughBothGroups(text, trigger, evidence);
    },
  );
  it.each([
    {
      text: "this Leader attacks or is attacked",
      category: "leader",
      evidence: ["target:thisLeader", "filter:category:leader"],
    },
    {
      text: "this Character attacks or is attacked",
      category: "character",
      evidence: ["target:thisCharacter", "filter:category:character"],
    },
  ] as const)(
    "parses this-card attack-or-attacked predicate $text",
    ({ text, category, evidence }) => {
      assertPredicateParsesThroughBothGroups(
        text,
        {
          type: "attackDeclared",
          role: "attackerOrTarget",
          player: "self",
          filter: { categories: [category] },
        },
        ["trigger:attackDeclared", "player:self", ...evidence],
      );
    },
  );
});

function assertPredicateParsesThroughBothGroups(
  text: string,
  trigger: Trigger,
  evidence: readonly string[],
  options: { readonly allowBodyBlockPatch?: boolean } = {},
): void {
  const implicit = parseReactionPredicateFromSet(
    { text },
    implicitReactionPredicateParsers,
  );
  expect(implicit).toMatchObject({ trigger });
  if (options.allowBodyBlockPatch !== undefined) {
    expect(implicit?.allowBodyBlockPatch).toBe(options.allowBodyBlockPatch);
  }
  for (const primitive of evidence) {
    expect(implicit?.evidence).toContain(primitive);
  }

  const activated = parseReactionPredicateFromSet(
    { text },
    activatedReactionPredicateParsers,
  );
  expect(activated).toMatchObject({ trigger });
  if (options.allowBodyBlockPatch !== undefined) {
    expect(activated?.allowBodyBlockPatch).toBe(options.allowBodyBlockPatch);
  }
  for (const primitive of evidence) {
    expect(activated?.evidence).toContain(primitive);
  }
}
