import { expect, test } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

test("parses Trigger top-Life look and top-or-bottom placement before adding the source card to hand", () => {
  const result = parseCardEffectLine(
    "[Trigger] Look at up to 1 card from the top of your or your opponent's Life cards, and place it at the top or bottom of the Life cards. Then, add this card to your hand.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "trigger" },
      sourcePresencePolicy: "noSourceRequired",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "placeTopLifeCard",
              players: ["self", "opponent"],
              viewer: "self",
              position: "topOrBottom",
            },
          },
          {
            connector: "then",
            effect: {
              type: "moveCards",
              count: 1,
              from: {
                player: "self",
                zone: "trash",
                source: "effectSource",
              },
              to: { player: "self", zone: "hand" },
              order: "original",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:lifeTrigger",
      "instruction:lookAt",
      "zone:life",
      "player:self",
      "player:opponent",
      "visibility:private",
      "position:top",
      "position:bottom",
      "instruction:moveCards",
      "target:thisCard",
      "destination:hand",
      "connector:then",
    ]),
  );
});
