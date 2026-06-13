import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("scalable event reaction parser primitives", () => {
  it("parses DON returned variants without binding the trigger to one body", () => {
    const byYourEffect = parseCardEffectLine(
      "[Opponent's Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck by your effect, add up to 1 DON!! card from your DON!! deck and set it as active.",
    );

    expect(byYourEffect).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "opponentTurn" },
        oncePerTurn: true,
        trigger: { type: "donReturned", player: "self" },
      },
    });
    expect(byYourEffect?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:donReturned",
        "player:self",
        "instruction:moveCards",
        "destination:costArea",
        "state:active",
      ]),
    );

    const fieldReturned = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When a DON!! card on the field is returned to your DON!! deck, this Leader gains +1000 power during this turn.",
    );

    expect(fieldReturned).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: { type: "donReturned", player: "self" },
        effect: {
          type: "modifyPower",
          duration: { type: "thisTurn" },
        },
      },
    });
  });

  it("parses bare Character K.O. reactions as field-removal primitives for either player", () => {
    const result = parseCardEffectLine(
      "[Once Per Turn] When a Character is K.O.'d, draw 1 card and trash 1 card from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        oncePerTurn: true,
        trigger: {
          type: "anyOf",
          triggers: [
            {
              type: "fieldRemoved",
              player: "self",
              filter: { categories: ["character"] },
              sourceKind: "ko",
            },
            {
              type: "fieldRemoved",
              player: "opponent",
              filter: { categories: ["character"] },
              sourceKind: "ko",
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "composition:triggerAnyOf",
        "instruction:draw",
        "instruction:trashFromHand",
      ]),
    );
  });

  it("parses trigger-activated reactions as reusable canonical event hooks", () => {
    const drawTrash = parseCardEffectLine(
      "[Once Per Turn] When a [Trigger] activates, draw 2 cards and trash 2 cards from your hand.",
    );

    expect(drawTrash).toMatchObject({
      block: {
        category: "auto",
        oncePerTurn: true,
        trigger: {
          type: "anyOf",
          triggers: [
            { type: "triggerActivated", player: "self" },
            { type: "triggerActivated", player: "opponent" },
          ],
        },
      },
    });
    expect(drawTrash?.evidence).toEqual(
      expect.arrayContaining([
        "activation:trigger",
        "composition:triggerAnyOf",
        "instruction:draw",
        "instruction:trashFromHand",
      ]),
    );

    const blocker = parseCardEffectLine(
      "[Opponent's Turn] When a [Trigger] activates, this Character gains [Blocker] during this turn.",
    );

    expect(blocker).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "opponentTurn" },
        trigger: {
          type: "anyOf",
          triggers: [
            { type: "triggerActivated", player: "self" },
            { type: "triggerActivated", player: "opponent" },
          ],
        },
        effect: {
          type: "giveKeyword",
          keyword: "blocker",
          duration: { type: "thisTurn" },
        },
      },
    });
  });

  it("parses Life-to-hand reactions as destination-filtered life-removal hooks", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When a card is added to your hand from your Life, this Character gains +2000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: {
          type: "lifeRemoved",
          players: ["self"],
          destination: "hand",
        },
        effect: {
          type: "modifyPower",
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:lifeRemoved",
        "player:self",
        "instruction:modifyPower",
      ]),
    );
  });

  it("parses player-scoped Life-removal reactions independently from DON markers", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [Your Turn] [Once Per Turn] When a card is removed from your opponent's Life cards, draw 2 cards and trash 1 card from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "and" },
        oncePerTurn: true,
        trigger: { type: "lifeRemoved", players: ["opponent"] },
        effect: { type: "sequence" },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "trigger:lifeRemoved",
        "player:opponent",
        "instruction:draw",
        "instruction:trashFromHand",
      ]),
    );
  });

  it("parses field-removal reactions with conditional hand-bottom placement and self-rest follow-up", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When a Character is removed from the field by your effect, if your opponent has 5 or more cards in their hand, your opponent places 1 card from their hand at the bottom of their deck. Then, rest this Character.",
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
              type: "fieldRemoved",
              player: "self",
              sourceController: "self",
              sourceKind: "effect",
            },
            {
              type: "fieldRemoved",
              player: "opponent",
              sourceController: "self",
              sourceKind: "effect",
            },
          ],
        },
        effect: { type: "sequence" },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "expression:conditional",
        "condition:handCount",
        "instruction:moveSelected",
        "zone:hand",
        "position:bottom",
        "instruction:rest",
        "target:thisCharacter",
      ]),
    );
  });

  it("parses bare Character K.O. reactions with rested DON attachment to this Leader", () => {
    const result = parseCardEffectLine(
      "[Your Turn] When a Character is K.O.'d, give up to 1 rested DON!! card to this Leader.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        trigger: { type: "anyOf" },
        effect: { type: "sequence" },
      },
    });
    expect(
      containsEffect(result, {
        type: "selectCards",
        zone: "costArea",
        filter: { categories: ["don"], state: "rested" },
      }),
    ).toBe(true);
    expect(containsEffect(result, { type: "attachSelectedDon" })).toBe(true);
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "instruction:attachDon",
        "filter:state:rested",
        "zone:leaderArea",
      ]),
    );
  });

  it("parses field stat modifiers until the start of your next turn through shared duration support", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck, this Character gains +2000 power until the start of your next turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: { type: "donReturned", player: "self" },
        effect: {
          type: "modifyPower",
          duration: { type: "untilStartOfNextTurn", player: "self" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:donReturned",
        "instruction:modifyPower",
        "duration:selfNextTurnStart",
      ]),
    );
  });

  it("parses opponent-effect field-removal reactions with type-including Character filters", () => {
    const result = parseCardEffectLine(
      '[Once Per Turn] When your Character with a type including "Roger Pirates" is removed from the field by your opponent\'s effect, add up to 1 DON!! card from your DON!! deck and rest it.',
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        oncePerTurn: true,
        trigger: {
          type: "fieldRemoved",
          player: "self",
          sourceController: "opponent",
          sourceKind: "effect",
          filter: {
            categories: ["character"],
            typesIncludeAny: ["Roger Pirates"],
          },
        },
        effect: {
          type: "moveCards",
          min: 0,
          count: 1,
          from: { player: "self", zone: "donDeck", position: "top" },
          to: { player: "self", zone: "costArea" },
          destinationState: "rested",
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "player:self",
        "filter:category:character",
        "filter:type",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
        "instruction:moveCards",
        "destination:costArea",
        "state:rested",
      ]),
    );
  });

  it("parses another opponent-effect field-removal reaction with the same reusable pieces", () => {
    const result = parseCardEffectLine(
      '[Once Per Turn] When your Character with a type including "Navy" is removed from the field by your opponent\'s effect, add up to 2 DON!! cards from your DON!! deck and rest them.',
    );

    expect(result).toMatchObject({
      block: {
        trigger: {
          type: "fieldRemoved",
          sourceController: "opponent",
          sourceKind: "effect",
          filter: {
            categories: ["character"],
            typesIncludeAny: ["Navy"],
          },
        },
        effect: {
          type: "moveCards",
          count: 2,
          destinationState: "rested",
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "filter:type",
        "replacementSource:opponent",
        "instruction:moveCards",
      ]),
    );
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
