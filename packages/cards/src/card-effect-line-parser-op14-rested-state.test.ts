import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP14 rested-state and rested-trigger parsing", () => {
  it("composes turn windows with rested-state continuous self power grants", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] If this Character is rested, this Character gains +2000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: 2000,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "and",
              conditions: [
                { type: "opponentTurn" },
                {
                  type: "cardState",
                  target: { type: "self" },
                  state: "rested",
                },
              ],
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:opponentTurn",
        "condition:cardState",
        "instruction:modifyPower",
      ]),
    );
  });

  it("composes turn windows with direct self-rested reactions", () => {
    const result = parseCardEffectLine(
      "[Your Turn] When this Character becomes rested, rest up to 1 of your opponent's Characters with a cost of 4 or less.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "cardRested",
          target: "self",
          player: "self",
          filter: { categories: ["character"] },
        },
        condition: { type: "yourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectTargets",
                request: {
                  player: "opponent",
                  zone: "characterArea",
                  filter: {
                    categories: ["character"],
                    cost: { max: 4 },
                  },
                },
              },
            },
            { effect: { type: "rest" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:yourTurn",
        "trigger:cardRested",
        "instruction:rest",
      ]),
    );
  });

  it("parses if-worded reactions for Characters rested by your effect", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] If a Character is rested by your effect, set up to 1 of your DON!! cards as active.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: {
          type: "anyOf",
          triggers: [
            {
              type: "cardRested",
              target: "any",
              player: "self",
              filter: { categories: ["character"] },
              sourceController: "self",
              sourceKind: "effect",
            },
            {
              type: "cardRested",
              target: "any",
              player: "opponent",
              filter: { categories: ["character"] },
              sourceController: "self",
              sourceKind: "effect",
            },
          ],
        },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectTargets",
                request: {
                  player: "self",
                  zone: "costArea",
                  filter: { categories: ["don"], state: "rested" },
                },
              },
            },
            { effect: { type: "activate" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:yourTurn",
        "marker:oncePerTurn",
        "trigger:cardRested",
        "replacementSource:self",
        "replacementSource:cardEffect",
        "instruction:activate",
        "filter:category:don",
      ]),
    );
  });

  it("parses source-filtered rested reactions with optional return-DON action resume", () => {
    const result = parseCardEffectLine(
      "When this Character becomes rested by your opponent's Character's effect, you may return 1 DON!! card from your field to your DON!! deck. If you do, set this Character as active.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "cardRested",
          target: "self",
          player: "self",
          filter: { categories: ["character"] },
          sourceController: "opponent",
          sourceKind: "effect",
          sourceFilter: { categories: ["character"] },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              optional: true,
              effect: { type: "returnDon", count: 1, player: "self" },
            },
            {
              connector: "ifYouDo",
              effect: { type: "activate", target: { type: "self" } },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:cardRested",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
        "instruction:returnDon",
        "instruction:activate",
        "composition:optionalActionEffect",
      ]),
    );
  });

  it("parses self-rested reactions with optional Life payment into Character or Stage refresh lock", () => {
    const result = parseCardEffectLine(
      "[Your Turn] When this Character becomes rested, you may add 1 card from the top of your Life cards to your hand. If you do, up to 1 of your opponent's rested Characters or Stages will not become active in your opponent's next Refresh Phase.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "cardRested",
          target: "self",
          player: "self",
          filter: { categories: ["character"] },
        },
        condition: { type: "yourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: {
                  type: "moveCards",
                  count: 1,
                  chooser: "self",
                  optional: true,
                  from: { player: "self", zone: "life", position: "top" },
                  to: { player: "self", zone: "hand" },
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "cannotBecomeActive",
                target: {
                  type: "chooseFromZones",
                  request: {
                    player: "opponent",
                    zones: ["characterArea", "stageArea"],
                    filter: {
                      categories: ["character", "stage"],
                      state: "rested",
                    },
                    min: 0,
                    max: 1,
                  },
                },
                duration: {
                  type: "untilStartOfNextTurn",
                  player: "opponent",
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:yourTurn",
        "trigger:cardRested",
        "composition:optionalCostedEffect",
        "cost:moveCards",
        "zone:life",
        "destination:hand",
        "instruction:preventActivation",
        "zone:characterArea",
        "zone:stageArea",
        "filter:category:character",
        "filter:category:stage",
        "filter:state:rested",
        "duration:opponentNextRefreshPhase",
      ]),
    );
  });
});
