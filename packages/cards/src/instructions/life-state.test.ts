import { describe, expect, it } from "vitest";

import { parseLifeStateInstruction } from "./life-state.js";

describe("Life state instruction parser", () => {
  it.each(["your", "yours"])(
    "parses top Life inspect placement for %s or opponent wording",
    (selfPossessive) => {
      expect(
        parseLifeStateInstruction({
          text: `Look at up to 1 card from the top of ${selfPossessive} or your opponent's Life cards, and place it at the top or bottom of the Life cards.`,
        }),
      ).toEqual({
        effect: {
          type: "placeTopLifeCard",
          players: ["self", "opponent"],
          viewer: "self",
          position: "topOrBottom",
        },
        evidence: [
          "instruction:lookAt",
          "zone:life",
          "cardinality:upTo",
          "count:positiveInteger",
          "player:self",
          "player:opponent",
          "visibility:private",
          "position:top",
          "position:bottom",
        ],
        rest: "",
      });
    },
  );

  it("parses opponent Life inspect and reorder as a private reorder primitive", () => {
    expect(
      parseLifeStateInstruction({
        text: "Look at all of your opponent's Life cards and place them back in their Life area in any order.",
      }),
    ).toEqual({
      effect: { type: "reorderLife", player: "opponent", viewer: "self" },
      evidence: [
        "instruction:reorder",
        "player:opponent",
        "zone:life",
        "visibility:private",
        "order:anyOrder",
      ],
      rest: "",
    });
  });

  it.each([
    "Look at all of your Life cards and place them back in your Life area in any order.",
    "Look at all your Life cards and place them back in your Life area in any order.",
  ])(
    "parses own Life inspect and reorder as the same private reorder primitive: %s",
    (text) => {
      expect(
        parseLifeStateInstruction({
          text,
        }),
      ).toEqual({
        effect: { type: "reorderLife", player: "self", viewer: "self" },
        evidence: [
          "instruction:reorder",
          "player:self",
          "zone:life",
          "visibility:private",
          "order:anyOrder",
        ],
        rest: "",
      });
    },
  );

  it("parses turning all own Life face-down as a reusable Life state primitive", () => {
    expect(
      parseLifeStateInstruction({
        text: "Turn all of your Life cards face-down.",
      }),
    ).toEqual({
      effect: { type: "setLifeFaceUp", player: "self", faceUp: false },
      evidence: [
        "instruction:setState",
        "player:self",
        "zone:life",
        "destination:faceDown",
      ],
      rest: "",
    });
  });
});
