import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP11 Activate Main parser primitives", () => {
  it("parses implicit On K.O. reactions with optional cost sequences before play-from-hand bodies", () => {
    const result = parseCardEffectLine(
      "When this Character is K.O.'d by your opponent's effect, you may trash 1 card from your hand and rest 1 of your DON!! cards. If you do, play up to 1 {Fish-Man} or {Merfolk} type Character card with a cost of 6 or less from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "fieldRemoved",
          target: "self",
          player: "self",
          filter: { categories: ["character"] },
          sourceController: "opponent",
          sourceKind: "effect",
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "sequence",
                  optional: true,
                  costs: [
                    { type: "trashFromHand", count: 1, chooser: "self" },
                    { type: "restDon", count: 1, chooser: "self" },
                  ],
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: { type: "sequence" },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
        "composition:optionalCostedEffect",
        "composition:costSequence",
        "cost:trashFromHand",
        "cost:restDon",
        "instruction:playSelected",
        "composition:selectThenPlay",
      ]),
    );
  });

  it("parses conditional End of Your Turn Character and DON activation as composed primitives", () => {
    const result = parseCardEffectLine(
      "[End of Your Turn] If you have 6 or less cards in your hand, set up to 1 of your {Fish-Man} or {Merfolk} type Characters and up to 1 of your DON!! cards as active.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "endOfYourTurn" },
        condition: {
          type: "handCount",
          player: "self",
          op: "lte",
          value: 6,
        },
        effect: {
          type: "sequence",
          effects: [
            { connector: "always", effect: { type: "sequence" } },
            { connector: "then", effect: { type: "sequence" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:endOfYourTurn",
        "condition:handCount",
        "composition:compoundActivation",
        "filter:type",
        "target:yourDonCards",
        "instruction:activate",
      ]),
    );
  });

  it("parses conditional rest-self plus Life face-down costs before KO bodies", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] If your Leader is [Shirahoshi], you may rest this Character and turn 1 card from the top of your Life cards face-down: K.O. up to 1 of your opponent's Characters with a cost of 3 or less.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        condition: {
          type: "hasCardInZone",
          player: "self",
          zone: "leaderArea",
          filter: { names: ["Shirahoshi"] },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "sequence",
                  optional: true,
                  costs: [
                    { type: "restSelf" },
                    {
                      type: "setLifeFaceUp",
                      count: 1,
                      player: "self",
                      position: "top",
                      faceUp: false,
                    },
                  ],
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: { type: "sequence" },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:activateMain",
        "condition:leaderIdentity",
        "composition:conditionalCostedEffect",
        "composition:optionalCostedEffect",
        "composition:costSequence",
        "cost:restSelf",
        "cost:setLifeFaceUp",
        "instruction:ko",
      ]),
    );
  });

  it("parses conditional Life face-down costs before delayed self-activation bodies", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] If your Leader is [Shirahoshi], you may turn 1 card from the top of your Life cards face-down: Set this Character as active at the end of this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        oncePerTurn: true,
        condition: {
          type: "hasCardInZone",
          player: "self",
          zone: "leaderArea",
          filter: { names: ["Shirahoshi"] },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "setLifeFaceUp",
                  count: 1,
                  player: "self",
                  position: "top",
                  faceUp: false,
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "delayed",
                timing: { type: "endOfTurn", turn: "current" },
                effect: {
                  type: "activate",
                  target: { type: "self" },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:activateMain",
        "marker:oncePerTurn",
        "condition:leaderIdentity",
        "cost:setLifeFaceUp",
        "instruction:activate",
        "duration:endOfTurn",
        "composition:delayed",
      ]),
    );
  });
});
