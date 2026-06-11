import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { parseCardEffectLinesDetailed } from "./card-effect-line-parser.js";

describe("multiline choose-one parser", () => {
  it("parses an On Play conditional choose-one block into a reusable choice shell", () => {
    const result =
      parseCardEffectLinesDetailed(`[On Play] If the number of DON!! cards on your field is equal to or less than the number on your opponent's field, choose one:
\u2022 K.O. up to 1 of your opponent's Characters with a cost of 2 or less.
\u2022 Return up to 1 of your opponent's Characters with a cost of 4 or less to the owner's hand.`);

    assert.equal(result.ok, true);
    const parsed = result.value[0];
    if (parsed?.kind === "metadata" || parsed?.block.effect.type !== "choice") {
      assert.fail("expected runtime choice block");
    }

    assert.equal(parsed.block.trigger.type, "onPlay");
    assert.deepEqual(parsed.block.condition, {
      type: "fieldCountDifference",
      minuend: { player: "opponent", filter: { categories: ["don"] } },
      subtrahend: { player: "self", filter: { categories: ["don"] } },
      op: "gte",
      value: 0,
    });
    assert.deepEqual(
      parsed.block.effect.options.map((option) => option.label),
      [
        "K.O. up to 1 of your opponent's Characters with a cost of 2 or less.",
        "Return up to 1 of your opponent's Characters with a cost of 4 or less to the owner's hand.",
      ],
    );
    assert.equal(parsed.block.effect.options.length, 2);
    assert.equal(parsed.block.effect.options[0]?.effect.type, "sequence");
    assert.equal(parsed.block.effect.options[1]?.effect.type, "sequence");
    for (const evidence of [
      "expression:choice",
      "composition:chooseOne",
      "choice:option",
      "condition:fieldCountDifference",
    ] as const) {
      assert.equal(parsed.evidence.includes(evidence), true, evidence);
    }
  });

  it("parses requested Main choose-one bullets through reusable effect parsers", () => {
    const result =
      parseCardEffectLinesDetailed(`[Main] If your Leader is multicolored, choose one:
\u2022 Return up to 1 of your opponent's Characters with a cost of 4 or less to the owner's hand.
\u2022 If you have 6 or less cards in your hand, draw 2 cards.`);

    assert.equal(result.ok, true);
    const parsed = result.value[0];
    if (parsed?.kind === "metadata" || parsed?.block.effect.type !== "choice") {
      assert.fail("expected runtime choice block");
    }

    assert.equal(parsed.block.trigger.type, "main");
    assert.deepEqual(parsed.block.condition, {
      type: "leaderColorCount",
      player: "self",
      op: "gte",
      value: 2,
    });
    const first = parsed.block.effect.options[0]?.effect;
    const second = parsed.block.effect.options[1]?.effect;
    assert.equal(first?.type, "sequence");
    assert.equal(second?.type, "conditional");
    assert.deepEqual(second.if, {
      type: "handCount",
      player: "self",
      op: "lte",
      value: 6,
    });
    assert.equal(second.then.type, "draw");
  });

  it("parses Main choose-one keyword and Lucy sequence bullets through reusable parsers", () => {
    const dressrosa = parseCardEffectLinesDetailed(`[Main] Choose one:
\u2022 Draw 2 cards.
\u2022 Up to 1 of your {Dressrosa} type Characters gains [Blocker] until the end of your opponent's next End Phase.`);
    assert.equal(dressrosa.ok, true);
    const dressrosaParsed = dressrosa.value[0];
    if (
      dressrosaParsed?.kind === "metadata" ||
      dressrosaParsed?.block.effect.type !== "choice"
    ) {
      assert.fail("expected runtime choice block");
    }
    assert.equal(dressrosaParsed.block.effect.options[0]?.effect.type, "draw");
    assert.equal(
      dressrosaParsed.block.effect.options[1]?.effect.type,
      "giveKeyword",
    );

    const lucy =
      parseCardEffectLinesDetailed(`[Main] If your Leader is [Lucy], choose one:
\u2022 Draw 2 cards and trash 1 card from your hand. Then, play up to 1 {Dressrosa} type Character card with a cost of 4 or less from your hand.
\u2022 Return up to 1 Stage to the owner's hand.`);
    assert.equal(lucy.ok, true);
    const lucyParsed = lucy.value[0];
    if (
      lucyParsed?.kind === "metadata" ||
      lucyParsed?.block.effect.type !== "choice"
    ) {
      assert.fail("expected runtime choice block");
    }
    assert.deepEqual(lucyParsed.block.condition, {
      type: "hasCardInZone",
      zone: "leaderArea",
      player: "self",
      filter: { categories: ["leader"], names: ["Lucy"] },
    });
    assert.equal(lucyParsed.block.effect.options[0]?.effect.type, "sequence");
    assert.equal(lucyParsed.block.effect.options[1]?.effect.type, "sequence");
  });

  it("parses costed choose-one blocks with three or more bullet options", () => {
    const result = parseCardEffectLinesDetailed(`[On Play] DON!! -3: Choose one:
\u2022 If your Leader has the {Donquixote Pirates} type, K.O. up to 1 of your opponent's Characters with a cost of 8 or less.
\u2022 Up to 3 of your opponent's Characters with a cost of 7 or less cannot be rested until the end of your opponent's next End Phase.
\u2022 Draw 2 cards.`);

    assert.equal(result.ok, true);
    const parsed = result.value[0];
    if (
      parsed?.kind === "metadata" ||
      parsed?.block.effect.type !== "sequence"
    ) {
      assert.fail("expected costed runtime choice sequence block");
    }

    assert.equal(parsed.block.trigger.type, "onPlay");
    assert.equal(parsed.block.cost, undefined);
    const cost = parsed.block.effect.effects[0]?.effect;
    const choice = parsed.block.effect.effects[1]?.effect;
    assert.ok(cost);
    assert.ok(choice);
    assert.equal(cost.type, "payCost");
    assert.deepEqual(cost.cost, {
      type: "returnDon",
      count: 3,
      optional: true,
    });
    assert.equal(choice.type, "choice");
    assert.equal(choice.options.length, 3);
    assert.deepEqual(
      choice.options.map((option) => option.id),
      ["choice:1", "choice:2", "choice:3"],
    );
    assert.equal(parsed.evidence.includes("cost:returnDon"), true);
    assert.equal(parsed.evidence.includes("composition:costedEffect"), true);
    assert.equal(parsed.evidence.includes("composition:chooseOne"), true);
  });

  it("keeps a trailing Then line attached to the choose-one block", () => {
    const result = parseCardEffectLinesDetailed(`[Main] Choose one:
\u2022 K.O. up to 1 of your opponent's Characters with a cost of 1 or less.
\u2022 Return up to 1 of your opponent's Characters with a cost of 1 or less to the owner's hand.
\u2022 Place up to 1 of your opponent's Characters with a cost of 1 or less at the top or bottom of their Life cards face-up.
Then, if you have a {Celestial Dragons} type Character, draw 1 card.`);

    assert.equal(result.ok, true);
    const parsed = result.value[0];
    if (
      parsed?.kind === "metadata" ||
      parsed?.block.effect.type !== "sequence"
    ) {
      assert.fail("expected runtime sequence block");
    }

    const choice = parsed.block.effect.effects[0]?.effect;
    const trailing = parsed.block.effect.effects[1]?.effect;
    assert.ok(choice);
    assert.equal(choice.type, "choice");
    assert.equal(choice.options.length, 3);
    const fieldToLife = choice.options[2]?.effect;
    assert.ok(fieldToLife);
    assert.equal(fieldToLife.type, "sequence");
    assert.equal(fieldToLife.effects[0]?.effect.type, "selectTargets");
    const placement = fieldToLife.effects[1]?.effect;
    assert.ok(placement);
    assert.equal(placement.type, "choice");
    assert.equal(placement.options[0]?.effect.type, "bounce");
    assert.equal(placement.options[1]?.effect.type, "bounce");
    assert.ok(trailing);
    assert.equal(trailing.type, "conditional");
    assert.deepEqual(trailing.if, {
      type: "fieldCount",
      player: "self",
      filter: {
        categories: ["character"],
        typesAny: ["Celestial Dragons"],
      },
      op: "gte",
      value: 1,
    });
    assert.equal(trailing.then.type, "draw");
    assert.equal(parsed.evidence.includes("connector:then"), true);
  });

  it("parses attached-DON markers before multiline choose-one entry points", () => {
    const result =
      parseCardEffectLinesDetailed(`[DON!! x1] [When Attacking] Choose one:
\u2022 Rest up to 1 of your opponent's Characters with a cost of 2 or less.
\u2022 K.O. up to 1 of your opponent's rested Characters with a cost of 2 or less.`);

    assert.equal(result.ok, true);
    const parsed = result.value[0];
    if (parsed?.kind === "metadata" || parsed?.block.effect.type !== "choice") {
      assert.fail("expected attached-DON choice block");
    }

    assert.equal(parsed.block.trigger.type, "whenAttacking");
    assert.deepEqual(parsed.block.condition, {
      type: "attachedDonCount",
      target: { type: "self" },
      op: "gte",
      value: 1,
    });
    assert.equal(parsed.block.effect.options.length, 2);
    assert.equal(parsed.evidence.includes("marker:attachedDon"), true);
    assert.equal(parsed.evidence.includes("composition:chooseOne"), true);
  });

  it("parses opponent-DON rest as a reusable choose-one option", () => {
    const result = parseCardEffectLinesDetailed(`[On K.O.] Choose one:
\u2022 Rest up to 1 of your opponent's DON!! cards.
\u2022 K.O. up to 1 of your opponent's rested Characters with a cost of 6 or less.`);

    assert.equal(result.ok, true);
    const parsed = result.value[0];
    if (parsed?.kind === "metadata" || parsed?.block.effect.type !== "choice") {
      assert.fail("expected runtime choice block");
    }

    assert.equal(parsed.block.trigger.type, "onKO");
    const restOption = parsed.block.effect.options[0]?.effect;
    assert.ok(restOption);
    assert.equal(restOption.type, "rest");
    assert.equal(restOption.target.type, "chooseFromZones");
    assert.deepEqual(restOption.target.request.zones, ["costArea"]);
    assert.deepEqual(restOption.target.request.filter, { categories: ["don"] });
    assert.equal(parsed.evidence.includes("composition:chooseOne"), true);
  });

  it("parses conditional damage plus life movement as one choose-one option", () => {
    const result = parseCardEffectLinesDetailed(`[Main] Choose one:
\u2022 K.O. up to 1 of your opponent's Characters with a cost of 5 or less.
\u2022 If your opponent has 1 Life card, deal 1 damage to your opponent. Then, add 1 card from the top of your Life cards to your hand.`);

    assert.equal(result.ok, true);
    const parsed = result.value[0];
    if (parsed?.kind === "metadata" || parsed?.block.effect.type !== "choice") {
      assert.fail("expected runtime choice block");
    }

    const sequence = parsed.block.effect.options[1]?.effect;
    assert.ok(sequence);
    assert.equal(sequence.type, "sequence");
    const conditional = sequence.effects[0]?.effect;
    const lifeToHand = sequence.effects[1]?.effect;
    assert.ok(conditional);
    assert.ok(lifeToHand);
    assert.equal(conditional.type, "conditional");
    assert.deepEqual(conditional.if, {
      type: "lifeCount",
      player: "opponent",
      op: "eq",
      value: 1,
    });
    assert.equal(conditional.then.type, "damage");
    assert.equal(lifeToHand.type, "moveCards");
  });

  it("parses field activation and self-rest sequence as choose-one options", () => {
    const result = parseCardEffectLinesDetailed(`[On Play] Choose one:
\u2022 Set up to 1 of your {East Blue} type Leader or Character cards with a cost of 6 or less as active.
\u2022 Rest this Character and up to 1 of your opponent's Characters.`);

    assert.equal(result.ok, true);
    const parsed = result.value[0];
    if (parsed?.kind === "metadata" || parsed?.block.effect.type !== "choice") {
      assert.fail("expected runtime choice block");
    }

    const activate = parsed.block.effect.options[0]?.effect;
    const rest = parsed.block.effect.options[1]?.effect;
    assert.ok(activate);
    assert.ok(rest);
    assert.equal(activate.type, "sequence");
    assert.equal(activate.effects[0]?.effect.type, "selectTargets");
    assert.equal(activate.effects[1]?.effect.type, "activate");
    assert.equal(rest.type, "sequence");
    assert.equal(rest.effects[0]?.effect.type, "rest");
    assert.equal(rest.effects[1]?.effect.type, "sequence");
  });

  it("parses Life reorder and face-down state changes as choose-one options", () => {
    const result = parseCardEffectLinesDetailed(`[On Play] Choose one:
\u2022 Look at all of your opponent's Life cards and place them back in their Life area in any order.
\u2022 Turn all of your Life cards face-down.`);

    assert.equal(result.ok, true);
    const parsed = result.value[0];
    if (parsed?.kind === "metadata" || parsed?.block.effect.type !== "choice") {
      assert.fail("expected runtime choice block");
    }

    const reorder = parsed.block.effect.options[0]?.effect;
    const faceDown = parsed.block.effect.options[1]?.effect;
    assert.ok(reorder);
    assert.ok(faceDown);
    assert.equal(reorder.type, "reorderLife");
    assert.deepEqual(reorder, {
      type: "reorderLife",
      player: "opponent",
      viewer: "self",
    });
    assert.equal(faceDown.type, "setLifeFaceUp");
    assert.deepEqual(faceDown, {
      type: "setLifeFaceUp",
      player: "self",
      faceUp: false,
    });
  });

  it("parses opponent-chooses-one under reusable optional costs", () => {
    const result =
      parseCardEffectLinesDetailed(`[On Play] You may trash 1 card from your hand: Your opponent chooses one:
\u2022 Your opponent trashes 2 cards from their hand.
\u2022 Trash 1 card from the top of your opponent's Life cards.`);

    assert.equal(result.ok, true);
    const parsed = result.value[0];
    if (
      parsed?.kind === "metadata" ||
      parsed?.block.effect.type !== "sequence"
    ) {
      assert.fail("expected optional-cost opponent choice sequence");
    }

    const cost = parsed.block.effect.effects[0]?.effect;
    const choice = parsed.block.effect.effects[1]?.effect;
    assert.ok(cost);
    assert.ok(choice);
    assert.equal(cost.type, "payCost");
    assert.deepEqual(cost.cost, {
      type: "trashFromHand",
      count: 1,
      chooser: "self",
      optional: true,
    });
    assert.equal(choice.type, "choice");
    assert.equal(choice.chooser, "opponent");
    assert.equal(choice.options.length, 2);
    assert.equal(
      parsed.evidence.includes("composition:optionalCostedEffect"),
      true,
    );
    assert.equal(parsed.evidence.includes("composition:chooseOne"), true);
  });
});
