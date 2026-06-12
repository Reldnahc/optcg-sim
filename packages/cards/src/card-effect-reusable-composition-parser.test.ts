import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect reusable parser compositions", () => {
  it("parses referenced entry activation for non-Main referenced entries", () => {
    const result = parseCardEffectLine(
      "[Trigger] Activate this card's [On Play] effect.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "trigger" },
        effect: {
          type: "activateReferencedEffect",
          source: { type: "triggerCard" },
          trigger: { type: "onPlay" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:activateReferencedEffect",
        "target:triggerCard",
        "reference:effectEntryPoint",
      ]),
    );
    expect(result?.evidence).not.toContain("reference:eventMain");
  });

  it("parses turn-windowed triggered effects as composed entry conditions", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] [On K.O.] You may deal 1 damage to your opponent.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onKO" },
        condition: { type: "opponentTurn" },
        effect: {
          type: "damage",
          target: "leader",
          player: "opponent",
          count: 1,
        },
      },
    });
  });

  it("parses implicit damage-or-KO reactions as composed trigger predicates", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [Once Per Turn] When you take damage or your Character with 6000 base power or more is K.O.'d, draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "anyOf",
          triggers: [
            { type: "damageDealt", players: ["self"] },
            {
              type: "fieldRemoved",
              player: "self",
              filter: {
                categories: ["character"],
                power: { min: 6000 },
              },
              sourceKind: "ko",
            },
          ],
        },
        oncePerTurn: true,
        condition: {
          type: "attachedDonCount",
          target: { type: "self" },
          op: "gte",
          value: 1,
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "draw", player: "self", count: 1 },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "marker:oncePerTurn",
        "trigger:damageDealt",
        "trigger:fieldRemoved",
        "composition:triggerAnyOf",
        "filter:power",
        "instruction:draw",
      ]),
    );
  });

  it("parses implicit played-from-trash reactions with that-character keyword grants", () => {
    const result = parseCardEffectLine(
      "When a {Land of Wano} type Character card is played from your trash, that Character gains [Rush] during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "cardPlayed",
          player: "self",
          sourceZone: "trash",
          filter: {
            categories: ["character"],
            typesAny: ["Land of Wano"],
          },
        },
        effect: {
          type: "giveKeyword",
          target: {
            type: "savedFieldObject",
            binding: {
              family: "producedObjects",
              saveResultAs: "trigger:cardPlayed",
            },
            zone: "characterArea",
            player: "self",
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
          keyword: "rush",
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:cardPlayed",
        "zone:trash",
        "filter:type",
        "filter:category:character",
        "reference:thatCharacter",
        "target:thatCharacter",
        "instruction:giveKeyword",
        "keyword:anySupported",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses generic self character-played reactions independently from turn windows", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] When you play a Character, draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "opponentTurn" },
        trigger: {
          type: "cardPlayed",
          player: "self",
          filter: { categories: ["character"] },
        },
        effect: { type: "draw", player: "self", count: 1 },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:cardPlayed",
        "player:self",
        "filter:category:character",
        "instruction:draw",
      ]),
    );

    const opponentResult = parseCardEffectLine(
      "When your opponent plays a Character, draw 1 card.",
    );
    expect(opponentResult).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "cardPlayed",
          player: "opponent",
          filter: { categories: ["character"] },
        },
        effect: { type: "draw", player: "self", count: 1 },
      },
    });
  });

  it("parses activated life-removed wording as an optional event reaction", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] This effect can be activated when a card is removed from your or your opponent's Life cards. If you have 7 or less cards in your hand, draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
        oncePerTurn: true,
        condition: { type: "yourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "conditional",
                if: { type: "handCount", player: "self", op: "lte", value: 7 },
                then: { type: "draw", player: "self", count: 1 },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("activation:reaction");
  });

  it("parses marker-led opponent attack activated reactions", () => {
    const result = parseCardEffectLine(
      "[Once Per Turn] This effect can be activated when your opponent attacks. Give up to 1 of your opponent's Leader or Character cards -1000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "onOpponentAttack" },
        oncePerTurn: true,
        effect: { type: "sequence" },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:activatedReaction",
        "activation:reaction",
        "entry:onOpponentAttack",
      ]),
    );
  });

  it("parses opponent Character attack predicates as attack filters", () => {
    const result = parseCardEffectLine(
      "[Once Per Turn] This effect can be activated when your opponent's Character attacks. If that Character has the <Slash> attribute, this Character gains +5000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: {
          type: "onOpponentAttack",
          attackerFilter: { categories: ["character"] },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "activation:reaction",
        "filter:category:character",
      ]),
    );
  });

  it("parses activated field-removal reactions independently from the body", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] This effect can be activated when a Character is removed from the field by your effect. If you have 5 or less cards in your hand, draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: {
          type: "fieldRemoved",
          player: "self",
          filter: { categories: ["character"] },
          sourceController: "self",
          sourceKind: "effect",
        },
        condition: { type: "yourTurn" },
      },
    });
    expect(result?.evidence).toContain("trigger:fieldRemoved");
  });

  it("parses opponent-caused field-removal activated reactions as reusable predicates", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] [Once Per Turn] This effect can be activated when your {Example} type Character is removed from the field by your opponent's effect or K.O.'d. If you have 5 or less cards in your hand, draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: {
          type: "fieldRemoved",
          player: "self",
          filter: { categories: ["character"], typesAny: ["Example"] },
          sourceController: "opponent",
          sourceKind: "any",
        },
        condition: { type: "opponentTurn" },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "player:self",
        "filter:type",
      ]),
    );
  });

  it("parses activated card-play reactions with reusable played-card filters", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] This effect can be activated when you play a Character with a [Trigger]. Give up to 2 rested DON!! cards to 1 of your Leader or Character cards.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: {
          type: "cardPlayed",
          player: "self",
          filter: {
            categories: ["character"],
            effectEntryPoint: {
              mode: "with",
              trigger: { type: "trigger" },
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining(["trigger:cardPlayed", "filter:effectEntryPoint"]),
    );
  });

  it("parses activated opponent played-card reactions with alternative reusable predicates", () => {
    const result = parseCardEffectLine(
      "[Once Per Turn] This effect can be activated when your opponent plays a Character with a base cost of 8 or more, or when your opponent plays a Character using a Character's effect. Your opponent adds 1 card from the top of their Life cards to their hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: {
          type: "cardPlayed",
          player: "opponent",
          anyOf: [
            {
              filter: {
                categories: ["character"],
                baseCost: { op: "gte", value: 8 },
              },
            },
            {
              filter: { categories: ["character"] },
              sourceFilter: { categories: ["character"] },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining(["trigger:cardPlayed", "filter:cost"]),
    );
  });

  it("parses activated opponent Event or Trigger reactions", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] This effect can be activated when your opponent activates an Event or [Trigger]. If your opponent has 2 or more Life cards, trash 1 card from the top of each of your and your opponent's Life cards.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: {
          type: "opponentActivated",
          activations: ["event", "trigger"],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining(["activation:event", "activation:trigger"]),
    );
  });

  it("parses activation conditions under explicit opponent attack windows", () => {
    const result = parseCardEffectLine(
      '[On Your Opponent\'s Attack] [Once Per Turn] This effect can be activated when you only have Characters with a type including "GERMA". Up to 1 of your Leader or Character cards gains +1000 power during this battle. Then, trash 2 cards from the top of your deck.',
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "onOpponentAttack" },
        condition: {
          type: "onlyMatchingFieldCards",
          zone: "characterArea",
          player: "self",
          filter: {
            categories: ["character"],
            typesIncludeAny: ["GERMA"],
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onOpponentAttack",
        "condition:onlyMatchingFieldCards",
      ]),
    );
  });

  it("parses named-card keyword grants under activated opponent-attack reactions", () => {
    const result = parseCardEffectLine(
      "[Once Per Turn] This effect can be activated when your opponent attacks. Up to 1 of your [Example Name] cards gains [Blocker] during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "onOpponentAttack" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "giveKeyword",
                target: {
                  type: "chooseFromZones",
                  request: {
                    player: "self",
                    zones: ["leaderArea", "characterArea"],
                    filter: { names: ["Example Name"] },
                  },
                },
                keyword: "blocker",
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining(["target:yourNamedCards", "keyword:anySupported"]),
    );
  });

  it("parses rested-by-opponent activated reactions with reusable optional cost composition", () => {
    const result = parseCardEffectLine(
      "This effect can be activated when this Character is rested by your opponent's effect. You may trash this Character and draw 2 cards.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: {
          type: "cardRested",
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
              effect: {
                type: "payCost",
                cost: { type: "trashSelf", optional: true },
              },
            },
            {
              connector: "ifYouDo",
              effect: { type: "draw", player: "self", count: 2 },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:cardRested",
        "composition:optionalCostedEffect",
        "cost:trashSelf",
      ]),
    );
  });

  it("parses trigger-presence as a composable card filter predicate", () => {
    const result = parseCardEffectLine(
      "[On K.O.] Play up to 1 Character card with a cost of 4 or less and a [Trigger] other than [Example Name] from your trash.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onKO" },
        effect: { type: "sequence" },
      },
    });
    expect(
      containsEffect(result, {
        type: "selectCards",
        zone: "trash",
        filter: {
          categories: ["character"],
          cost: { max: 4 },
          effectEntryPoint: {
            mode: "with",
            trigger: { type: "trigger" },
          },
          nameNot: ["Example Name"],
        },
      }),
    ).toBe(true);
  });

  it("parses selected trash card branch choice without duplicating selection", () => {
    const result = parseCardEffectLine(
      "[On Play] Select up to 1 {Example} type Character with a cost of 4 or less from your trash and play it or add it to the top of your Life cards face-up.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              saveResultAs: "trashSelection:choose-destination",
              effect: {
                type: "selectCards",
                zone: "trash",
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
      },
    });
  });

  it("parses direct selected trash card move to top of Life face-up", () => {
    const result = parseCardEffectLine(
      "[On Play] You may trash 1 card from your hand: Add up to 1 {Blackbeard Pirates} type card with a cost of 6 or less from your trash to the top of your Life cards face-up.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: {
                  type: "trashFromHand",
                  count: 1,
                  chooser: "self",
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    saveResultAs: "trashSelection:addToLife",
                    effect: {
                      type: "selectCards",
                      zone: "trash",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: {
                        typesAny: ["Blackbeard Pirates"],
                        cost: { max: 6 },
                      },
                      saveAs: "trashSelection:addToLife",
                      visibility: "bothPlayers",
                    },
                  },
                  {
                    effect: {
                      type: "moveSelected",
                      selection: "trashSelection:addToLife",
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
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:optionalCostedEffect",
        "cost:trashFromHand",
        "instruction:selectCards",
        "instruction:moveSelected",
        "filter:type",
        "filter:cost",
        "destination:life",
        "position:top",
        "destination:faceUp",
      ]),
    );
  });

  it("parses direct selected trash card move to bottom of Life face-down", () => {
    const result = parseCardEffectLine(
      "[On Play] Add up to 1 Character card with a cost of 4 or less from your trash to the bottom of your Life cards.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              saveResultAs: "trashSelection:addToLife",
              effect: {
                type: "selectCards",
                zone: "trash",
                filter: {
                  categories: ["character"],
                  cost: { max: 4 },
                },
              },
            },
            {
              effect: {
                type: "moveSelected",
                selection: "trashSelection:addToLife",
                from: "trash",
                to: "life",
                position: "bottom",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:selectCards",
        "instruction:moveSelected",
        "filter:category:character",
        "filter:cost",
        "destination:life",
        "position:bottom",
      ]),
    );
  });

  it("parses rested DON distribution as repeated reusable attach flows", () => {
    const result = parseCardEffectLine(
      "[On Play] Draw 2 cards and trash 1 card from your hand. Then, give your Leader and 1 Character up to 2 rested DON!! cards each.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
      },
    });
    expect(
      containsEffect(result, {
        type: "selectCards",
        zone: "costArea",
        filter: { categories: ["don"], state: "rested" },
      }),
    ).toBe(true);
    expect(
      containsEffect(result, {
        type: "attachSelectedDon",
      }),
    ).toBe(true);
  });
});

function containsEffect(received: unknown, expected: unknown): boolean {
  if (thisEquals(received, expected)) {
    return true;
  }
  if (typeof received !== "object" || received === null) {
    return false;
  }
  if (Array.isArray(received)) {
    return received.some((item) => containsEffect(item, expected));
  }
  return Object.values(received).some((value) =>
    containsEffect(value, expected),
  );
}

function thisEquals(received: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(received) &&
      expected.every((expectedValue, index) =>
        thisEquals(received[index], expectedValue),
      )
    );
  }
  if (!isRecord(expected)) {
    return Object.is(received, expected);
  }
  if (!isRecord(received)) {
    return false;
  }
  return Object.entries(expected).every(([key, expectedValue]) =>
    thisEquals(received[key], expectedValue),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
