import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses attached-DON filters under rest and K.O. bodies", () => {
  const rest = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] Rest up to 1 of your opponent's Characters that has 2 or more DON!! cards given.",
  );
  const ko = parseCardEffectLine(
    "[When Attacking] K.O. up to 1 of your opponent's Characters with 3000 power or less with a DON!! card given.",
  );

  expect(rest).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
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
                  attachedDon: { min: 2 },
                },
              },
            },
          },
          {
            effect: {
              type: "rest",
              target: { type: "savedFieldObject" },
            },
          },
        ],
      },
    },
  });
  expect(ko).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
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
                  currentPower: { max: 3000 },
                  attachedDon: { min: 1 },
                },
              },
            },
          },
          {
            effect: {
              type: "ko",
              target: { type: "savedFieldObject" },
            },
          },
        ],
      },
    },
  });
  expect(rest?.evidence).toEqual(
    expect.arrayContaining(["filter:attachedDon", "instruction:rest"]),
  );
  expect(ko?.evidence).toEqual(
    expect.arrayContaining(["filter:attachedDon", "instruction:ko"]),
  );
});

it("parses attached-DON condition and dynamic attached-DON power scaling", () => {
  const conditional = parseCardEffectLine(
    "[When Attacking] If your opponent has any DON!! cards given, this Character gains +2000 power during this turn.",
  );
  const dynamic = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] If this Character was played on this turn, give all of your opponent's Characters -1000 power during this turn for every DON!! card given to that Character.",
  );

  expect(conditional).toMatchObject({
    block: {
      condition: {
        type: "fieldCount",
        player: "opponent",
        filter: { categories: ["don"], state: "attached" },
      },
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 2000,
      },
    },
  });
  expect(dynamic).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      effect: {
        type: "modifyPower",
        target: {
          type: "all",
          player: "opponent",
          zone: "characterArea",
        },
        value: {
          type: "countAttachedDon",
          target: { type: "self" },
          per: 1,
          multiplier: -1000,
        },
        duration: { type: "thisTurn" },
      },
    },
  });
  expect(conditional?.evidence).toEqual(
    expect.arrayContaining(["condition:donFieldCount", "player:opponent"]),
  );
  expect(dynamic?.evidence).toEqual(
    expect.arrayContaining([
      "value:dynamic:attachedDonCount",
      "target:thisCharacter",
    ]),
  );
});

it("parses attached-DON filters under power reduction and refresh-lock bodies", () => {
  const power = parseCardEffectLine(
    "[On Play] Give up to 2 DON!! cards from your opponent's cost area to 1 of your opponent's Characters. Then, give -1000 power during this turn to up to 1 of your opponent's Characters with a DON!! card given.",
  );
  const refreshLock = parseCardEffectLine(
    "[Main] Up to 1 of your opponent's rested Characters with a cost of 8 or less that has 2 or more DON!! cards given will not become active in your opponent's next Refresh Phase.",
  );
  const delayedRefreshLock = parseCardEffectLine(
    "[On Play] Give up to 2 DON!! cards from your opponent's cost area to 1 of your opponent's Characters. Then, at the end of this turn, up to 1 rested Character with 3 or more DON!! cards given will not become active in your opponent's next Refresh Phase.",
  );

  expect(power).toMatchObject({
    block: {
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "sequence" } },
          {
            effect: {
              type: "modifyPower",
              target: {
                type: "choose",
                request: {
                  player: "opponent",
                  zone: "characterArea",
                  filter: {
                    categories: ["character"],
                    attachedDon: { min: 1 },
                  },
                },
              },
            },
          },
        ],
      },
    },
  });
  expect(refreshLock).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "cannotBecomeActive",
        target: {
          type: "choose",
          request: {
            player: "opponent",
            zone: "characterArea",
            filter: {
              categories: ["character"],
              state: "rested",
              cost: { max: 8 },
              attachedDon: { min: 2 },
            },
          },
        },
      },
    },
  });
  expect(delayedRefreshLock).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "sequence" } },
          {
            effect: {
              type: "delayed",
              timing: { type: "endOfTurn", turn: "current" },
              effect: {
                type: "cannotBecomeActive",
                target: {
                  type: "choose",
                  request: {
                    player: "anyPlayer",
                    zone: "characterArea",
                    filter: {
                      categories: ["character"],
                      state: "rested",
                      attachedDon: { min: 3 },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  });
  expect(delayedRefreshLock?.evidence).toEqual(
    expect.arrayContaining(["composition:delayed", "target:anyCharacters"]),
  );
});
