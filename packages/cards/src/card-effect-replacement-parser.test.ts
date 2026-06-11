import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

const replacementInstead = (
  result: NonNullable<ReturnType<typeof parseCardEffectLine>>,
) => {
  if (!("block" in result) || result.block.effect.type !== "replacement") {
    assert.fail("expected replacement effect block");
  }
  return result.block.effect.instead;
};

describe("replacement effect parser", () => {
  it("parses opponent field-removal replacement into reusable trigger, target, filter, and instead primitives", () => {
    const target = {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        categories: ["character"],
        typesAny: ["Sky Island"],
        power: { min: 6000 },
      },
    } as const;
    const when = {
      type: "wouldMoveZone",
      from: "characterArea",
      sourceControllerRelation: "opponentControlled",
      target,
    } as const;

    const result = parseCardEffectLine(
      "If your {Sky Island} type Character with 6000 base power or more would be removed from the field by your opponent, you may add 1 card from the top of your Life cards to your hand instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(result.block, {
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead: {
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "life", position: "top" },
          to: { player: "self", zone: "hand" },
          order: "original",
        },
      },
    });
    for (const evidence of [
      "entry:replacement",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "sourcePresence:resolveFromLastKnownInformation",
      "target:yourCharacters",
      "filter:type",
      "filter:category:character",
      "filter:power",
      "condition:comparator:gte",
      "instruction:moveCards",
      "zone:life",
      "position:top",
      "destination:hand",
      "composition:replacementInstead",
      "composition:entryExpression",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses opponent effect field-removal replacement into reusable rest-card instead primitives", () => {
    const target = {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        categories: ["character"],
        power: { max: 7000 },
      },
    } as const;
    const when = {
      type: "wouldMoveZone",
      from: "characterArea",
      sourceKind: "cardEffect",
      sourceControllerRelation: "opponentControlled",
      target,
    } as const;

    const result = parseCardEffectLine(
      "If your Character with 7000 base power or less would be removed from the field by your opponent's effect, you may rest 2 of your cards instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(result.block, {
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead: {
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
              min: 2,
              max: 2,
              allowFewerIfUnavailable: false,
              visibility: "public",
            },
          },
        },
      },
    });
    for (const evidence of [
      "entry:replacement",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      "sourcePresence:resolveFromLastKnownInformation",
      "target:yourCharacters",
      "filter:category:character",
      "filter:power",
      "condition:comparator:lte",
      "instruction:rest",
      "target:yourCards",
      "zone:leaderArea",
      "zone:characterArea",
      "zone:stageArea",
      "zone:costArea",
      "cardinality:exact",
      "count:positiveInteger",
      "composition:replacementInstead",
      "composition:entryExpression",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses opponent effect field-removal replacement into reusable rest-self instead primitives", () => {
    const target = {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        categories: ["character"],
        colorsAny: ["green"],
        nameNot: ["Tashigi"],
      },
    } as const;
    const when = {
      type: "wouldMoveZone",
      from: "characterArea",
      sourceKind: "cardEffect",
      sourceControllerRelation: "opponentControlled",
      target,
    } as const;

    const result = parseCardEffectLine(
      "If you have a green Character other than [Tashigi] that would be removed from the field by your opponent's effect, you may rest this Character instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(result.block, {
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead: {
          type: "rest",
          target: { type: "self" },
        },
      },
    });
    for (const evidence of [
      "entry:replacement",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      "target:yourCharacters",
      "filter:category:character",
      "filter:color",
      "filter:nameNot",
      "instruction:rest",
      "target:thisCharacter",
      "composition:replacementInstead",
      "composition:entryExpression",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses opponent effect K.O.-only replacement separately from broad field removal", () => {
    const target = {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        attributesAny: ["slash"],
        categories: ["character"],
        cost: { max: 5 },
        excludeSelf: true,
      },
    } as const;
    const when = {
      type: "wouldBeKOd",
      sourceKind: "cardEffect",
      target,
    } as const;

    const result = parseCardEffectLine(
      "If your <Slash> attribute Character with a cost of 5 or less other than this Character would be K.O.'d by your opponent's effect, you may rest this Character instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(result.block, {
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead: {
          type: "rest",
          target: { type: "self" },
        },
      },
    });
    for (const evidence of [
      "entry:replacement",
      "replacement:wouldBeKOd",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      "target:yourCharacters",
      "filter:attribute",
      "filter:category:character",
      "filter:cost",
      "condition:comparator:lte",
      "filter:excludeSelf",
      "instruction:rest",
      "target:thisCharacter",
      "composition:replacementInstead",
      "composition:entryExpression",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
    assert.equal(result.evidence.includes("replacement:wouldMoveZone"), false);
    assert.equal(result.evidence.includes("replacement:fieldRemoval"), false);
  });

  it("parses once-per-turn K.O. replacement into reusable cost filter and hand-trash instead primitives", () => {
    const target = {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        categories: ["character"],
        baseCost: { min: 4 },
      },
    } as const;
    const when = {
      type: "wouldBeKOd",
      sourceControllerRelation: "any",
      target,
    } as const;

    const result = parseCardEffectLine(
      "[Once Per Turn] If your Character with a base cost of 4 or more would be K.O.'d, you may trash 1 card from your hand instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(result.block, {
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      oncePerTurn: true,
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead: {
          type: "trashFromHand",
          player: "self",
          chooser: "self",
          count: 1,
        },
      },
    });
    for (const evidence of [
      "marker:oncePerTurn",
      "entry:replacement",
      "replacement:wouldBeKOd",
      "target:yourCharacters",
      "filter:category:character",
      "filter:cost",
      "condition:comparator:gte",
      "instruction:trashFromHand",
      "player:self",
      "chooser:self",
      "count:positiveInteger",
      "composition:replacementInstead",
      "composition:entryExpression",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses opponent effect field-removal replacement into reusable return-DON instead primitives", () => {
    const result = parseCardEffectLine(
      "If your Character with 7000 base power or less would be removed from the field by your opponent's effect, you may return 1 DON!! card from your field to your DON!! deck instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(result.block.effect, {
      type: "replacement",
      when: {
        type: "wouldMoveZone",
        from: "characterArea",
        sourceKind: "cardEffect",
        sourceControllerRelation: "opponentControlled",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: {
            categories: ["character"],
            power: { max: 7000 },
          },
        },
      },
      instead: {
        type: "returnDon",
        count: 1,
        player: "self",
      },
    });
    for (const evidence of [
      "replacement:wouldMoveZone",
      "replacementSource:cardEffect",
      "filter:power",
      "instruction:returnDon",
      "zone:donDeck",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses opponent effect field-removal replacement into reusable owner deck-bottom instead primitives", () => {
    const result = parseCardEffectLine(
      "If your Character with 7000 base power or less would be removed from the field by your opponent's effect, you may place 1 of your Characters at the bottom of the owner's deck instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(result.block.effect, {
      type: "replacement",
      when: {
        type: "wouldMoveZone",
        from: "characterArea",
        sourceKind: "cardEffect",
        sourceControllerRelation: "opponentControlled",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: {
            categories: ["character"],
            power: { max: 7000 },
          },
        },
      },
      instead: {
        type: "sequence",
        effects: [
          {
            id: "select:owner-deck-bottom",
            connector: "always",
            saveResultAs: "selected:owner-deck-bottom",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "self",
                zone: "characterArea",
                min: 1,
                max: 1,
                allowFewerIfUnavailable: false,
                visibility: "public",
                filter: { categories: ["character"] },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "bounce",
              destination: "deckBottom",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:owner-deck-bottom",
                },
                zone: "characterArea",
                player: "self",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
      },
    });
    for (const evidence of [
      "replacement:wouldMoveZone",
      "replacementSource:cardEffect",
      "filter:power",
      "instruction:moveSelected",
      "target:yourCharacters",
      "destination:deck",
      "position:bottom",
      "composition:selectThenApply",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses opponent effect field-removal replacement into reusable unfiltered hand-trash instead primitives", () => {
    const result = parseCardEffectLine(
      "If your Character with 7000 base power or less would be removed from the field by your opponent's effect, you may trash 1 card from your hand instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(replacementInstead(result), {
      type: "trashFromHand",
      player: "self",
      chooser: "self",
      count: 1,
    });
    assert.equal(result.evidence.includes("instruction:trashFromHand"), true);
  });

  it("parses opponent effect field-removal replacement into reusable trash-self instead primitives", () => {
    const result = parseCardEffectLine(
      "If your {Straw Hat Crew} type Character other than this Character would be removed from the field by your opponent's effect, you may trash this Character instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(replacementInstead(result), {
      type: "trash",
      target: { type: "self" },
    });
    for (const evidence of [
      "filter:type",
      "filter:excludeSelf",
      "instruction:trash",
      "target:thisCharacter",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses opponent effect field-removal replacement into reusable K.O.-self instead primitives", () => {
    const result = parseCardEffectLine(
      "If one of your Characters would be removed from the field by your opponent's effect, you may K.O. this Character instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(result.block.effect, {
      type: "replacement",
      when: {
        type: "wouldMoveZone",
        from: "characterArea",
        sourceKind: "cardEffect",
        sourceControllerRelation: "opponentControlled",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: { categories: ["character"] },
        },
      },
      instead: {
        type: "ko",
        target: { type: "self" },
      },
    });
    for (const evidence of [
      "replacement:wouldMoveZone",
      "replacementSource:cardEffect",
      "target:yourCharacters",
      "filter:category:character",
      "instruction:ko",
      "target:thisCharacter",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses opponent effect field-removal replacement into reusable leader power modifier instead primitives", () => {
    const result = parseCardEffectLine(
      "If your Character with 7000 base power or less would be removed from the field by your opponent's effect, you may give your Leader −2000 power during this turn instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    assert.deepEqual(replacementInstead(result), {
      type: "modifyPower",
      target: { type: "myLeader" },
      value: -2000,
      duration: { type: "thisTurn" },
    });
    for (const evidence of [
      "instruction:modifyPower",
      "target:yourLeader",
      "modifier:negativePower",
      "duration:thisTurn",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses once-per-turn self field-removal replacement into reusable self power modifier instead primitives", () => {
    const result = parseCardEffectLine(
      "[Once Per Turn] If this Character would be removed from the field by your opponent's effect, you may give this Character -2000 power during this turn instead.",
    );
    if (result === undefined || !("block" in result)) {
      assert.fail("expected parsed replacement effect block");
    }

    const when = {
      type: "wouldMoveZone",
      from: "characterArea",
      sourceKind: "cardEffect",
      sourceControllerRelation: "opponentControlled",
      target: { type: "self" },
    } as const;
    assert.deepEqual(result.block, {
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      oncePerTurn: true,
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead: {
          type: "modifyPower",
          target: { type: "self" },
          value: -2000,
          duration: { type: "thisTurn" },
        },
      },
    });
    for (const evidence of [
      "marker:oncePerTurn",
      "entry:replacement",
      "replacement:wouldMoveZone",
      "replacement:fieldRemoval",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      "target:thisCharacter",
      "instruction:modifyPower",
      "modifier:negativePower",
      "duration:thisTurn",
      "composition:replacementInstead",
      "composition:entryExpression",
    ] as const) {
      assert.equal(result.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses self K.O. replacement into filtered hand-trash instead primitives", () => {
    const characterResult = parseCardEffectLine(
      "If this Character would be K.O.'d, you may trash 1 Character card with a power of 6000 or less from your hand instead.",
    );
    if (characterResult === undefined || !("block" in characterResult)) {
      assert.fail("expected parsed Character hand-trash replacement");
    }
    assert.deepEqual(replacementInstead(characterResult), {
      type: "trashFromHand",
      player: "self",
      chooser: "self",
      count: 1,
      filter: {
        categories: ["character"],
        power: { max: 6000 },
      },
    });

    const eventResult = parseCardEffectLine(
      "If this Character would be K.O.'d, you may trash 1 Event from your hand instead.",
    );
    if (eventResult === undefined || !("block" in eventResult)) {
      assert.fail("expected parsed Event hand-trash replacement");
    }
    assert.deepEqual(replacementInstead(eventResult), {
      type: "trashFromHand",
      player: "self",
      chooser: "self",
      count: 1,
      filter: { categories: ["event"] },
    });
    for (const evidence of [
      "replacement:wouldBeKOd",
      "instruction:trashFromHand",
      "filter:category:character",
      "filter:power",
    ] as const) {
      assert.equal(characterResult.evidence.includes(evidence), true, evidence);
    }
  });
});
