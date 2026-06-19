import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("closeout hidden-info parser variants", () => {
  it.each([
    "[On K.O.] Your opponent chooses 1 card from your hand; trash that card.",
    "[Trigger] Your opponent chooses 1 card from your hand; trash that card.",
  ])(
    "parses opponent-chosen trash from your hand under reusable entry points",
    (line) => {
      const result = parseCardEffectLine(line);

      expect(result).toMatchObject({
        block: {
          effect: {
            type: "trashFromHand",
            count: 1,
            player: "self",
            chooser: "opponent",
          },
        },
      });
      expect(result?.evidence).toEqual(
        expect.arrayContaining([
          "instruction:trashFromHand",
          "count:positiveInteger",
          "player:self",
          "chooser:opponent",
        ]),
      );
    },
  );

  it("parses opponent hand selection, reveal, and revealed-card conditional follow-up", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [Activate: Main] You may rest this Character: Choose 1 card from your opponent's hand; your opponent reveals that card. If the revealed card is an Event, place up to 1 card from your opponent's Life area at the bottom of the owner's deck.",
    );

    expect(result).toMatchObject({
      block: {
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "restSelf", optional: true },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: "handSelection:opponent-hand-reveal",
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      player: "opponent",
                      chooser: "self",
                      min: 1,
                      max: 1,
                      saveAs: "handSelection:opponent-hand-reveal",
                      visibility: "chooserOnly",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "revealSelected",
                      selection: "handSelection:opponent-hand-reveal",
                      visibility: "bothPlayers",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "conditional",
                      if: {
                        type: "cardMatches",
                        target: {
                          type: "savedSelectedCard",
                          selection: "handSelection:opponent-hand-reveal",
                          onFailure: "failClosed",
                        },
                        filter: { categories: ["event"] },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:selectCards",
        "instruction:revealSelected",
        "condition:cardMatches",
        "filter:category:event",
        "instruction:moveSelected",
        "zone:life",
        "zone:deck",
        "expression:sequence",
      ]),
    );
  });

  it("parses opponent hand selection and reveal without a follow-up body", () => {
    const result = parseCardEffectLine(
      "[On Play] Choose 2 cards from your opponent's hand; your opponent reveals those cards.",
    );

    expect(result).toMatchObject({
      block: {
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "handSelection:opponent-hand-reveal",
              effect: {
                type: "selectCards",
                zone: "hand",
                player: "opponent",
                chooser: "self",
                min: 2,
                max: 2,
                saveAs: "handSelection:opponent-hand-reveal",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "revealSelected",
                selection: "handSelection:opponent-hand-reveal",
                visibility: "bothPlayers",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:selectCards",
        "instruction:revealSelected",
        "zone:hand",
        "player:opponent",
        "chooser:self",
        "expression:sequence",
      ]),
    );
  });
});
