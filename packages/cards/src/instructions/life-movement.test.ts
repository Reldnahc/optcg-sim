import { describe, expect, it } from "vitest";

import {
  lifeMovementPrimitive,
  parseLifeMovementInstruction,
} from "./life-movement.js";

describe("life movement instruction parser", () => {
  it("groups Life movement shapes under the reusable moveCards primitive", () => {
    expect(lifeMovementPrimitive.primitiveId).toBe("instruction:moveCards");
    expect(lifeMovementPrimitive.matches.map((match) => match.id)).toContain(
      "add-up-to-n-cards-from-deck-top-to-life-top",
    );
  });

  it("parses hand to Life top placement as select-then-move primitives", () => {
    expect(
      parseLifeMovementInstruction({
        text: "Add up to 1 card from your hand to the top of your Life cards.",
      }),
    ).toEqual({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              saveAs: "handSelection:self-hand-to-life-placement",
              visibility: "chooserOnly",
            },
            saveResultAs: "handSelection:self-hand-to-life-placement",
          },
          {
            connector: "ifPossible",
            effect: {
              type: "moveSelected",
              selection: "handSelection:self-hand-to-life-placement",
              from: "hand",
              to: "life",
              position: "top",
            },
          },
        ],
      },
      evidence: [
        "instruction:selectCards",
        "instruction:moveSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "player:self",
        "zone:hand",
        "destination:life",
        "position:top",
        "chooser:self:upTo",
        "composition:selectThenMove",
      ],
      rest: "",
    });
  });
});
