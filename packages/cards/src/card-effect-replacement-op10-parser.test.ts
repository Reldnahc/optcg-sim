import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses battle K.O. replacement into reusable Life-to-hand instead primitive", () => {
  const result = parseCardEffectLine(
    "[Once Per Turn] If this Character would be K.O.'d in battle, you may add 1 card from the top of your Life cards to your hand instead.",
  );

  expect(result).toMatchObject({
    block: {
      category: "replacement",
      oncePerTurn: true,
      trigger: {
        type: "replacement",
        replacement: {
          type: "wouldBeKOd",
          sourceKind: "battle",
          target: { type: "self" },
        },
      },
      effect: {
        type: "replacement",
        when: {
          type: "wouldBeKOd",
          sourceKind: "battle",
          target: { type: "self" },
        },
        instead: {
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "life", position: "top" },
          to: { player: "self", zone: "hand" },
          order: "original",
        },
      },
    },
  });
});

it("parses filtered own Character rest as a reusable replacement instead primitive", () => {
  const result = parseCardEffectLine(
    "[Once Per Turn] If this Character would be removed from the field by your opponent's effect, you may rest 1 of your {ODYSSEY} type Characters instead.",
  );

  expect(result).toMatchObject({
    block: {
      category: "replacement",
      oncePerTurn: true,
      effect: {
        type: "replacement",
        instead: {
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["characterArea"],
              min: 1,
              max: 1,
              filter: {
                categories: ["character"],
                typesAny: ["ODYSSEY"],
              },
            },
          },
        },
      },
    },
  });
});

it("parses active DON rest as a reusable replacement instead primitive", () => {
  const result = parseCardEffectLine(
    "[Once Per Turn] If this Character would be K.O.'d by your opponent's effect, you may rest 2 of your active DON!! cards instead.",
  );

  expect(result).toMatchObject({
    block: {
      category: "replacement",
      oncePerTurn: true,
      effect: {
        type: "replacement",
        instead: {
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["costArea"],
              min: 2,
              max: 2,
              filter: {
                categories: ["don"],
                state: "active",
              },
            },
          },
        },
      },
    },
  });
});

it("parses return-this-Character-to-owner-hand replacement instead primitive", () => {
  const result = parseCardEffectLine(
    "If your Character with a base cost of 7 or less other than [Sabo] would be removed from the field by your opponent's effect, you may return this Character to the owner's hand instead.",
  );

  expect(result).toMatchObject({
    block: {
      category: "replacement",
      trigger: {
        type: "replacement",
        replacement: {
          type: "wouldMoveZone",
          sourceKind: "cardEffect",
        },
      },
      effect: {
        type: "replacement",
        instead: {
          type: "bounce",
          destination: "hand",
          target: { type: "self" },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "replacement:wouldMoveZone",
      "replacementSource:opponent",
      "replacementSource:cardEffect",
      "instruction:bounce",
      "destination:hand",
      "target:thisCharacter",
    ]),
  );
});
