import { describe, expect, it } from "vitest";

import { parseImplicitPermanentEntryPoint } from "./implicit-permanent.js";

describe("implicit permanent entry point parser", () => {
  it("recognizes leading conditional continuous text without parsing the body", () => {
    expect(
      parseImplicitPermanentEntryPoint({
        text: "If you have 7 or more cards in your trash, this Character gains [Blocker].",
      }),
    ).toEqual({
      node: {
        type: "entryPoint",
        trigger: { type: "permanent" },
        category: "permanent",
      },
      evidence: ["entry:implicitPermanent", "sourcePresence:mustRemain"],
      rest: "If you have 7 or more cards in your trash, this Character gains [Blocker].",
    });
  });

  it("does not consume bracketed entry points", () => {
    expect(
      parseImplicitPermanentEntryPoint({ text: "[On Play] Draw 1 card." }),
    ).toBeUndefined();
  });

  it("recognizes self Leader continuous text without parsing the body", () => {
    expect(
      parseImplicitPermanentEntryPoint({
        text: "This Leader cannot attack.",
      }),
    ).toMatchObject({
      node: {
        type: "entryPoint",
        trigger: { type: "permanent" },
        category: "permanent",
      },
      evidence: ["entry:implicitPermanent", "sourcePresence:mustRemain"],
      rest: "This Leader cannot attack.",
    });
  });

  it("recognizes your-card continuous text without parsing the body", () => {
    expect(
      parseImplicitPermanentEntryPoint({
        text: "Your {SWORD} type Characters can attack Characters on the turn in which they are played.",
      }),
    ).toMatchObject({
      node: {
        type: "entryPoint",
        trigger: { type: "permanent" },
        category: "permanent",
      },
      evidence: ["entry:implicitPermanent", "sourcePresence:mustRemain"],
    });
  });

  it("recognizes filtered hand modifier continuous text without parsing the body", () => {
    expect(
      parseImplicitPermanentEntryPoint({
        text: "Give blue Events in your hand -1 cost.",
      }),
    ).toMatchObject({
      node: {
        type: "entryPoint",
        trigger: { type: "permanent" },
        category: "permanent",
      },
      evidence: ["entry:implicitPermanent", "sourcePresence:mustRemain"],
      rest: "Give blue Events in your hand -1 cost.",
    });
  });

  it("recognizes bare once-per-turn continuous text without consuming the marker", () => {
    expect(
      parseImplicitPermanentEntryPoint({
        text: "Once per turn, this Character cannot be K.O.'d by your opponent's effects.",
      }),
    ).toMatchObject({
      node: {
        type: "entryPoint",
        trigger: { type: "permanent" },
        category: "permanent",
      },
      evidence: ["entry:implicitPermanent", "sourcePresence:mustRemain"],
      rest: "Once per turn, this Character cannot be K.O.'d by your opponent's effects.",
    });
  });
});
