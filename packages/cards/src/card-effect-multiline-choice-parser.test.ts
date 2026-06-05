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
    if (parsed?.kind === "metadata" || parsed?.block.effect.type !== "choice") {
      assert.fail("expected runtime choice block");
    }

    assert.equal(parsed.block.trigger.type, "onPlay");
    assert.deepEqual(parsed.block.cost, {
      type: "returnDon",
      count: 3,
      optional: false,
    });
    assert.equal(parsed.block.effect.options.length, 3);
    assert.deepEqual(
      parsed.block.effect.options.map((option) => option.id),
      ["choice:1", "choice:2", "choice:3"],
    );
    assert.equal(parsed.evidence.includes("cost:returnDon"), true);
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
    assert.ok(trailing);
    assert.equal(trailing.type, "custom");
    assert.equal(trailing.handler, "unsupported:chooseOneThen");
    assert.equal(parsed.evidence.includes("connector:then"), true);
  });
});
