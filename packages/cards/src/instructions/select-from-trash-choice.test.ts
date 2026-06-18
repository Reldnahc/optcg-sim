import { describe, expect, it } from "vitest";

import { parseSelectFromTrashChoiceInstruction } from "./select-from-trash-choice.js";

describe("select source card destination choice instruction parser", () => {
  it("parses selected trash card play-or-Life choice as public source selection", () => {
    const result = parseSelectFromTrashChoiceInstruction({
      text: "Select up to 1 {Example} type Character with a cost of 4 or less from your trash and play it or add it to the top of your Life cards face-up.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "trashSelection:choose-destination",
            effect: {
              type: "selectCards",
              zone: "trash",
              visibility: "bothPlayers",
              filter: {
                categories: ["character"],
                typesAny: ["Example"],
                cost: { max: 4 },
              },
            },
          },
          {
            effect: {
              type: "choice",
              options: [
                { effect: { type: "playSelected" } },
                {
                  effect: {
                    type: "moveSelected",
                    from: "trash",
                    to: "life",
                    position: "top",
                    destinationFaceUp: true,
                  },
                },
              ],
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:selectCards",
        "instruction:playSelected",
        "instruction:moveSelected",
        "zone:trash",
        "destination:life",
        "destination:faceUp",
        "position:top",
        "composition:selectThenMove",
        "composition:chooseOne",
      ]),
    );
  });

  it("reuses selected card play-or-Life choice from hand as private source selection", () => {
    const result = parseSelectFromTrashChoiceInstruction({
      text: "Select up to 1 {Example} type card with a cost of 5 or less from your hand and play it or add it to the top of your Life cards face-up.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "handSelection:choose-destination",
            effect: {
              type: "selectCards",
              zone: "hand",
              visibility: "chooserOnly",
              filter: {
                typesAny: ["Example"],
                cost: { max: 5 },
              },
            },
          },
          {
            effect: {
              type: "choice",
              options: [
                { effect: { type: "playSelected" } },
                {
                  effect: {
                    type: "moveSelected",
                    from: "hand",
                    to: "life",
                    position: "top",
                    destinationFaceUp: true,
                  },
                },
              ],
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:selectCards",
        "instruction:playSelected",
        "instruction:moveSelected",
        "zone:hand",
        "destination:life",
        "destination:faceUp",
        "position:top",
        "composition:selectThenMove",
        "composition:chooseOne",
      ]),
    );
  });
});
