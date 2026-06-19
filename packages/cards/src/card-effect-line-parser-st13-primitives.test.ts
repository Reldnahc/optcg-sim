import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses field-to-Life cost into next-turn power gain", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] [Activate: Main] [Once Per Turn] You may add 1 of your Characters with a cost of 3 or more and 7000 power or more to the top of your Life cards face-up: Up to 1 of your Characters gains +2000 power until the start of your next turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 1,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "moveFieldToLife",
                count: 1,
                chooser: "self",
                player: "self",
                filter: {
                  categories: ["character"],
                  cost: { min: 3 },
                  currentPower: { min: 7000 },
                },
                position: "top",
                faceUp: true,
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              duration: { type: "untilStartOfNextTurn" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "marker:attachedDon",
      "marker:oncePerTurn",
      "cost:moveFieldToLife",
      "target:yourCharacters",
      "filter:cost",
      "filter:currentPower",
      "destination:life",
      "position:top",
      "destination:faceUp",
      "instruction:modifyPower",
      "duration:selfNextTurnStart",
      "composition:costedEffect",
    ]),
  );
});

it("parses end-of-turn face-up Life trash as a reusable matching Life movement", () => {
  const result = parseCardEffectLine(
    "[End of Your Turn] Trash all your face-up Life cards.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "endOfYourTurn" },
      effect: {
        type: "moveMatchingLifeCards",
        player: "self",
        matcher: { faceUp: true },
        to: { player: "self", zone: "trash" },
        order: "original",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:endOfYourTurn",
      "instruction:moveCards",
      "cardinality:all",
      "player:self",
      "zone:life",
      "visibility:faceUp",
      "destination:trash",
      "order:original",
    ]),
  );
});

it("parses face-up Life add-to-hand rules replacement as a permanent replacement primitive", () => {
  const result = parseCardEffectLine(
    "Your face-up Life cards are placed at the bottom of your deck instead of being added to your hand, according to the rules.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "grantReplacement",
        duration: { type: "permanent" },
        replacement: {
          type: "replacement",
          when: {
            type: "wouldMoveZone",
            from: "life",
            to: "hand",
            lifeMatcher: { faceUp: true },
            target: { type: "all", zone: "life", player: "self" },
          },
          instead: {
            type: "bounce",
            target: { type: "replacementTarget" },
            destination: "deckBottom",
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "instruction:grantReplacement",
      "replacement:wouldMoveZone",
      "zone:life",
      "visibility:faceUp",
      "destination:hand",
      "destination:deck",
      "position:bottom",
      "target:replacementTarget",
      "duration:permanent",
    ]),
  );
});
