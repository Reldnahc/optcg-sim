import { describe, expect, it } from "vitest";

import {
  parseThatCharacterReference,
  thatCharacterReferencePrimitive,
} from "./that-character.js";

describe("that Character reference parser", () => {
  it("defines that Character as a reference primitive parent", () => {
    expect(thatCharacterReferencePrimitive).toEqual({
      primitiveId: "reference:thatCharacter",
      matches: [{ id: "that-character" }],
    });
  });

  it("parses the reference and leaves action text", () => {
    expect(
      parseThatCharacterReference({
        text: "that Character will not become active in your opponent's next Refresh Phase.",
      }),
    ).toEqual({
      evidence: ["reference:thatCharacter", "target:thatCharacter"],
      rest: "will not become active in your opponent's next Refresh Phase.",
    });
  });
});
