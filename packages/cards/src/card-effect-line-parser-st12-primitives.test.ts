import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses activate-main return this Character as a self bounce primitive", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] Return this Character to the owner's hand.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "bounce",
        target: { type: "self" },
        destination: "hand",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "instruction:returnToOwnerHand",
      "target:thisCharacter",
      "destination:ownerHand",
    ]),
  );
});
