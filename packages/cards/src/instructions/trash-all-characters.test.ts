import { describe, expect, it } from "vitest";

import { parseTrashAllYourCharactersInstruction } from "./trash-all-characters.js";

describe("trash all Characters instruction parser", () => {
  it("parses trash all your Characters as a reusable target/action primitive", () => {
    expect(
      parseTrashAllYourCharactersInstruction({
        text: "Trash all of your Characters",
      }),
    ).toEqual({
      effect: {
        type: "trash",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: { categories: ["character"] },
        },
      },
      evidence: [
        "instruction:trash",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("parses trash all typed Characters through the same all-field target primitive", () => {
    expect(
      parseTrashAllYourCharactersInstruction({
        text: "Trash all of your {Sky Island} type Characters.",
      }),
    ).toMatchObject({
      effect: {
        type: "trash",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: {
            categories: ["character"],
            typesAny: ["Sky Island"],
          },
        },
      },
      evidence: [
        "instruction:trash",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:type",
        "filter:category:character",
      ],
    });
  });
});
