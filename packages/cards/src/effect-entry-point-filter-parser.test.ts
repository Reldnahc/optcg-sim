import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";
import { supportedEntryPoints } from "./entry-point-definitions.js";
import { parseCardFilterPredicates } from "./filters/index.js";

it("parses generic card filters with effect-entry-point predicates", () => {
  expect(
    parseCardFilterPredicates({ text: "card with a [Trigger]" }),
  ).toMatchObject({
    filter: {
      effectEntryPoint: {
        mode: "with",
        trigger: { type: "trigger" },
      },
    },
    evidence: ["filter:effectEntryPoint", "filter:effectEntryPoint:with"],
    rest: "",
  });
});

it("parses with/without effect-entry-point filters for every supported bracket entry point", () => {
  for (const entryPoint of supportedEntryPoints) {
    for (const mode of ["with", "without"] as const) {
      const parsed = parseCardEffectLine(
        `[Activate: Main] up to 1 of your Characters ${mode} a ${entryPoint.text} effect gains [Rush] during this turn.`,
      );

      expect(parsed, `${mode} ${entryPoint.text}`).toMatchObject({
        block: {
          category: "activate",
          trigger: { type: "activateMain" },
          effect: {
            type: "giveKeyword",
            target: {
              type: "choose",
              request: {
                player: "self",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  effectEntryPoint: {
                    mode,
                    trigger: entryPoint.trigger,
                    ...(entryPoint.condition === undefined
                      ? {}
                      : { condition: entryPoint.condition }),
                  },
                },
              },
            },
            keyword: "rush",
            duration: { type: "thisTurn" },
          },
        },
      });
      expect(parsed?.evidence).toEqual(
        expect.arrayContaining([
          "filter:effectEntryPoint",
          mode === "with"
            ? "filter:effectEntryPoint:with"
            : "filter:effectEntryPoint:without",
          "instruction:giveKeyword",
          "keyword:anySupported",
          "duration:thisTurn",
        ]),
      );
    }
  }
});

it("parses rest-self cost, power debuff, and filtered temporary keyword grant as reusable sequence parts", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] You may rest this Leader: Give up to 1 of your opponent's Characters -2000 power during this turn. Then, up to 1 of your Characters without a [When Attacking] effect gains [Rush] during this turn.",
    ),
  ).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: { type: "payCost", cost: { type: "restSelf" } },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "modifyPower",
                    value: -2000,
                    duration: { type: "thisTurn" },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "giveKeyword",
                    keyword: "rush",
                    duration: { type: "thisTurn" },
                    target: {
                      type: "choose",
                      request: {
                        player: "self",
                        zone: "characterArea",
                        min: 0,
                        max: 1,
                        filter: {
                          categories: ["character"],
                          effectEntryPoint: {
                            mode: "without",
                            trigger: { type: "whenAttacking" },
                          },
                        },
                      },
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
});

it("parses branch-specific character filters for temporary keyword grants", () => {
  const parsed = parseCardEffectLine(
    '[Activate: Main] [Once Per Turn] Up to 1 of your [Monkey.D.Luffy] Characters or up to 1 of your Characters with a type including "Whitebeard Pirates", with 8000 power or more, gains [Rush] during this turn.',
  );

  expect(parsed).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "giveKeyword",
        keyword: "rush",
        duration: { type: "thisTurn" },
        target: {
          type: "choose",
          request: {
            player: "self",
            zone: "characterArea",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
              anyOf: [
                { names: ["Monkey.D.Luffy"] },
                {
                  typesIncludeAny: ["Whitebeard Pirates"],
                  currentPower: { min: 8000 },
                },
              ],
            },
          },
        },
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "marker:oncePerTurn",
      "cardinality:upTo",
      "target:yourCharacters",
      "filter:anyOf",
      "filter:name",
      "filter:type",
      "filter:currentPower",
      "instruction:giveKeyword",
      "keyword:anySupported",
      "duration:thisTurn",
    ]),
  );
});

it("parses On Play absence filters with adjacent cost predicates", () => {
  const parsed = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] Up to 1 of your Characters without an [On Play] effect and with a cost of 8 or less gains [Rush] during this turn.",
  );

  expect(parsed).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "giveKeyword",
        keyword: "rush",
        duration: { type: "thisTurn" },
        target: {
          type: "choose",
          request: {
            player: "self",
            zone: "characterArea",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
              cost: { max: 8 },
              effectEntryPoint: {
                mode: "without",
                trigger: { type: "onPlay" },
              },
            },
          },
        },
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "filter:effectEntryPoint",
      "filter:effectEntryPoint:without",
      "filter:cost",
      "instruction:giveKeyword",
    ]),
  );
});

it("parses no-base-effect as a reusable without On Play filter for play bodies", () => {
  const parsed = parseCardEffectLine(
    "[On Play] If your Leader is [Uta], draw 2 cards. Then, play up to 1 Character card with 6000 power or less and no base effect from your hand.",
  );

  expect(parsed).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], names: ["Uta"] },
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "draw", count: 2 },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  id: "select:hand-play",
                  connector: "always",
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: {
                      categories: ["character"],
                      power: { max: 6000 },
                      effectEntryPoint: {
                        mode: "without",
                        trigger: { type: "onPlay" },
                      },
                    },
                  },
                },
                {
                  id: "play:selected-from-hand",
                  connector: "ifPossible",
                  effect: {
                    type: "playSelected",
                    selection: "handSelection:play-from-hand",
                    ignoreCost: true,
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "filter:effectEntryPoint",
      "filter:effectEntryPoint:without",
      "filter:power",
      "instruction:playSelected",
    ]),
  );
});

it("parses no-base-effect as a reusable without On Play filter for field keyword grants", () => {
  const parsed = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] Up to 1 of your Characters with no base effect gains [Rush] during this turn.",
  );

  expect(parsed).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "giveKeyword",
        keyword: "rush",
        duration: { type: "thisTurn" },
        target: {
          type: "choose",
          request: {
            player: "self",
            zone: "characterArea",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
              effectEntryPoint: {
                mode: "without",
                trigger: { type: "onPlay" },
              },
            },
          },
        },
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "filter:effectEntryPoint",
      "filter:effectEntryPoint:without",
      "instruction:giveKeyword",
    ]),
  );
});
