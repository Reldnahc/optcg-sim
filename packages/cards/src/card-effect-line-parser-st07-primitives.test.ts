import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses On Play top-Life inspect placement with yours-or-opponent wording", () => {
  const result = parseCardEffectLine(
    "[On Play] Look at up to 1 card from the top of yours or your opponent's Life cards, and place it at the top or bottom of the Life cards.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "placeTopLifeCard",
        players: ["self", "opponent"],
        viewer: "self",
        position: "topOrBottom",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:lookAt",
      "zone:life",
      "player:self",
      "player:opponent",
      "visibility:private",
      "position:top",
      "position:bottom",
    ]),
  );
});
