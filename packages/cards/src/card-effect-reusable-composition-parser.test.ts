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
