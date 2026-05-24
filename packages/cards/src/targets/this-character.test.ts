import { describe, expect, it } from "vitest";

import {
  parseThisCharacterTarget,
  thisCharacterTargetPrimitive,
} from "./this-character.js";

describe("this Character target parser", () => {
  it("defines this Character as a target primitive parent", () => {
    expect(thisCharacterTargetPrimitive).toMatchObject({
      primitiveId: "target:thisCharacter",
      matches: [
        {
          id: "this-character",
        },
      ],
    });
  });

  it("parses this Character target text and leaves the remaining protection text", () => {
    expect(
      parseThisCharacterTarget({
        text: "this Character cannot be removed from the field",
      }),
    ).toEqual({
      target: { type: "self" },
      evidence: ["target:thisCharacter"],
      rest: "cannot be removed from the field",
    });
  });

  it("can supply the same target for connector-omitted subject text", () => {
    expect(
      parseThisCharacterTarget({
        text: "cannot be removed from the field",
        allowImplicit: true,
      }),
    ).toEqual({
      target: { type: "self" },
      evidence: ["target:thisCharacter"],
      rest: "cannot be removed from the field",
    });
  });
});
