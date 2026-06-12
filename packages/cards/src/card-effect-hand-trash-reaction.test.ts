import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("hand-trash reaction parser", () => {
  it("parses hand-trashed-by-effect as a reusable reaction trigger with self invalidation body", () => {
    const result = parseCardEffectLine(
      "When a card is trashed from your hand by an effect, this Character's effect is negated during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "handTrashedByEffect", player: "self" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "invalidateEffects",
          target: { type: "self" },
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitReaction",
        "trigger:handTrashedByEffect",
        "instruction:invalidateEffects",
        "target:thisCharacter",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses source-filtered hand-trash reactions without binding the trigger to the draw body", () => {
    const result = parseCardEffectLine(
      "When a card is trashed from your hand by your {Navy} type card's effect, draw cards equal to the number of cards trashed.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "handTrashedByEffect",
          player: "self",
          sourceFilter: { typesAny: ["Navy"] },
        },
        effect: { type: "draw", player: "self", count: 1 },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:handTrashedByEffect",
        "filter:type",
        "instruction:draw",
      ]),
    );
  });

  it("parses end-of-turn trash-until-hand-count as its own body primitive", () => {
    const result = parseCardEffectLine(
      "[End of Your Turn] Trash cards from your hand until you have 5 cards in your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "endOfYourTurn" },
        effect: {
          type: "trashFromHandUntilCount",
          player: "self",
          chooser: "self",
          handCount: 5,
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:endOfYourTurn",
        "instruction:trashFromHandUntilCount",
        "condition:handCount",
        "condition:threshold:nonNegativeInteger",
      ]),
    );
  });

  it("parses optional hand-trash cost into rested DON attachment without binding the cost to the body", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] You may trash 1 card from your hand: Give up to 2 rested DON!! cards to 1 of your {Fish-Man} or {Merfolk} type Leader or Character cards.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "trashFromHand",
                  count: 1,
                  chooser: "self",
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "selectCards",
                      zone: "costArea",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 2,
                      filter: { categories: ["don"], state: "rested" },
                    },
                  },
                  {
                    connector: "ifYouDo",
                    effect: {
                      type: "selectTargets",
                      request: {
                        chooser: "self",
                        player: "self",
                        zones: ["leaderArea", "characterArea"],
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: { type: "attachSelectedDon" },
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
        "entry:activateMain",
        "composition:optionalCostedEffect",
        "cost:trashFromHand",
        "instruction:attachDon",
        "zone:leaderArea",
        "zone:characterArea",
        "filter:category:leader",
        "filter:category:character",
        "filter:type",
      ]),
    );
  });
});
