import { describe, expect, it } from "vitest";

import { parseReturnToOwnerHandInstruction } from "./return-to-owner-hand.js";

describe("return to owner hand instruction parser", () => {
  it("parses returning this Character as a self bounce primitive", () => {
    expect(
      parseReturnToOwnerHandInstruction({
        text: "Return this Character to the owner's hand.",
      }),
    ).toEqual({
      effect: {
        type: "bounce",
        target: { type: "self" },
        destination: "hand",
      },
      evidence: [
        "instruction:returnToOwnerHand",
        "target:thisCharacter",
        "destination:ownerHand",
      ],
      rest: "",
    });
  });
});
