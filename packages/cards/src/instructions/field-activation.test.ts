import { describe, expect, it } from "vitest";

import { parseSetFieldActiveInstruction } from "./field-activation.js";

describe("field activation instruction parser", () => {
  it("parses this Character activation as a self-target activate primitive", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "Set this Character as active.",
      }),
    ).toEqual({
      effect: {
        type: "activate",
        target: { type: "self" },
      },
      evidence: [
        "instruction:activate",
        "target:thisCharacter",
        "state:active",
      ],
      rest: "",
    });
  });

  it("parses mass leader and character activation as reusable activate targets", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "set your Leader and all of your Characters as active.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "activate", target: { type: "myLeader" } },
          },
          {
            connector: "always",
            effect: {
              type: "activate",
              target: {
                type: "all",
                player: "self",
                zone: "characterArea",
                filter: { categories: ["character"] },
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:activate",
        "target:yourLeader",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:category:character",
        "state:active",
        "composition:sequence",
      ],
      rest: "",
    });
  });
});
