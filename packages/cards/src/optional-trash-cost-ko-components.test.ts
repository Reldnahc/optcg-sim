import { describe, expect, it } from "vitest";

import {
  buildOptionalTrashCostKoSequenceEffect,
  buildOptionalTrashCostKoSavedTargetConsumer,
  parseOptionalTrashKoBaseCostMaximumPredicate,
  parseOptionalTrashKoTargetPrefix,
  parseOptionalTrashKoVerbPrefix,
  parseOptionalTrashFromHandCostKoBody,
  parseOptionalTrashFromHandCostWrapper,
} from "./optional-trash-cost-ko-components.js";

describe("optional trash cost K.O. components", () => {
  it("parses reusable optional hand-trash cost and base-cost K.O. components", () => {
    expect(
      parseOptionalTrashFromHandCostWrapper(
        "You may trash 3 cards from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 7 or less.",
      ),
    ).toEqual({
      bodyText:
        "K.O. up to 1 of your opponent's Characters with a base cost of 7 or less.",
      count: 3,
      prefix: "You may trash 3 cards from your hand: ",
    });
    expect(
      parseOptionalTrashFromHandCostKoBody(
        "K.O. up to 1 of your opponent's Characters with a base cost of 7 or less.",
      ),
    ).toEqual({
      baseCostMax: 7,
      cardinality: { max: 1, min: 0 },
      savedReferenceConsumer: "koSelectedCharacter",
      target: "opponentCharactersChoose",
    });
  });

  it("parses K.O. body through reusable target, predicate, and saved-target primitives", () => {
    const verb = parseOptionalTrashKoVerbPrefix(
      "K.O. up to 1 of your opponent's Characters with a base cost of 7 or less.",
    );
    expect(verb).toEqual({
      bodyText:
        "up to 1 of your opponent's Characters with a base cost of 7 or less.",
      prefix: "K.O. ",
    });

    const target = parseOptionalTrashKoTargetPrefix(
      "up to 1 of your opponent's Characters with a base cost of 7 or less.",
    );
    expect(target).toEqual({
      cardinality: { max: 1, min: 0 },
      predicateText: "with a base cost of 7 or less.",
      target: "opponentCharactersChoose",
    });

    expect(
      parseOptionalTrashKoBaseCostMaximumPredicate(
        "with a base cost of 7 or less.",
      ),
    ).toEqual({ baseCostMax: 7 });
    expect(buildOptionalTrashCostKoSavedTargetConsumer()).toEqual({
      savedReferenceConsumer: "koSelectedCharacter",
    });
  });

  it("builds K.O. sequence connectors from already parsed primitive values", () => {
    const sequence = buildOptionalTrashCostKoSequenceEffect({
      baseCostMax: 9,
      trashCount: 2,
    });

    expect(sequence.effects).toMatchObject([
      {
        connector: "always",
        effect: {
          cost: {
            chooser: "self",
            count: 2,
            optional: true,
            type: "trashFromHand",
          },
          type: "payCost",
        },
        id: "optionalTrashFromHandCost",
        saveResultAs: "paidOptionalTrashFromHandCost",
      },
      {
        connector: "ifYouDo",
        effect: {
          request: {
            filter: { categories: ["character"], cost: { max: 9 } },
            max: 1,
            min: 0,
            player: "opponent",
            zone: "characterArea",
          },
          type: "selectTargets",
        },
        id: "selectOpponentCharacterByBaseCost",
        saveResultAs: "selectedTarget",
      },
      {
        connector: "ifPreviousSucceeded",
        effect: {
          target: {
            binding: {
              objectIndex: 0,
              saveResultAs: "selectedTarget",
              sourceSegmentId: "selectOpponentCharacterByBaseCost",
            },
            type: "savedFieldObject",
          },
          type: "ko",
        },
        id: "koSelectedTarget",
      },
    ]);
  });

  it.each([
    "You may trash 0 cards from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
    "You may trash 01 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
    "You may trash one card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
    "You may trash 1 cards from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
    "You may discard 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
    "You may trash 1 card from your hand. K.O. up to 1 of your opponent's Characters with a base cost of 4 or less.",
  ])(
    "rejects unsupported optional hand-trash cost wrapper %s",
    (sourceText) => {
      expect(parseOptionalTrashFromHandCostWrapper(sourceText)).toBeUndefined();
    },
  );

  it.each([
    "K.O. up to 2 of your opponent's Characters with a base cost of 4 or less.",
    "K.O. 1 of your opponent's Characters with a base cost of 4 or less.",
    "K.O. up to 1 of your opponent's Characters with a cost of 4 or less.",
    "K.O. up to 1 of your opponent's Leaders with a base cost of 4 or less.",
    "K.O. up to 1 of your opponent's Characters with a base cost of 0 or less.",
    "K.O. up to 1 of your opponent's Characters with a base cost of 04 or less.",
    "Rest up to 1 of your opponent's Characters with a base cost of 4 or less.",
  ])("rejects unsupported optional hand-trash K.O. body %s", (sourceText) => {
    expect(parseOptionalTrashFromHandCostKoBody(sourceText)).toBeUndefined();
  });
});
