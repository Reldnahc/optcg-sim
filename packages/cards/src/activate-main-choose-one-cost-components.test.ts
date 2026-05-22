import { describe, expect, it } from "vitest";
import type { CardId } from "@optcg/types";

import {
  buildActivateMainChooseOneTrashCostDrawSequenceEffect,
  parseActivateMainBodyDrawClause,
  parseActivateMainChooseOneTrashCostClause,
  parseActivateMainChooseOneTrashCostResidueClause,
  parseActivateMainChooseOneTrashFieldCostAlternative,
  parseActivateMainChooseOneTrashFromHandCostAlternative,
  parseActivateMainCostBodySeparator,
  parseActivateMainCostChoiceConnector,
  parseActivateMainCostOptionalMarker,
  parseActivateMainWrapper,
} from "./activate-main-choose-one-cost-components.js";
import { parseCertifiedCardText } from "./certified-card-text-parser.js";

describe("activate main choose-one optional cost components", () => {
  it("parses wrapper, once-per-turn marker, optional marker, connector, separator, and draw body as separate primitives", () => {
    const wrapper = parseActivateMainWrapper(
      "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards.",
    );
    expect(wrapper).toEqual({
      bodyText:
        "[Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards.",
      prefix: "[Activate: Main] ",
      trigger: { type: "activateMain" },
    });

    const optional = parseActivateMainCostOptionalMarker(
      "You may trash 2 of your {Navy} type Characters or 1 card from your hand",
    );
    expect(optional).toEqual({
      bodyText:
        "trash 2 of your {Navy} type Characters or 1 card from your hand",
      prefix: "You may ",
    });
    expect(
      parseActivateMainCostChoiceConnector(
        "trash 2 of your {Navy} type Characters or 1 card from your hand",
      ),
    ).toEqual({
      left: "trash 2 of your {Navy} type Characters",
      right: "1 card from your hand",
    });
    expect(
      parseActivateMainCostBodySeparator(
        "You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards.",
      ),
    ).toEqual({
      bodyText: "Draw 3 cards.",
      costText:
        "You may trash 2 of your {Navy} type Characters or 1 card from your hand",
    });
    expect(parseActivateMainBodyDrawClause("Draw 3 cards.")).toEqual({
      count: 3,
    });
  });

  it("parses choose-one cost alternatives with typed field trash and unfiltered hand trash", () => {
    expect(
      parseActivateMainChooseOneTrashFieldCostAlternative(
        "trash 4 of your {Fish-Man} type Characters",
      ),
    ).toEqual({
      count: 4,
      typeName: "Fish-Man",
    });
    expect(
      parseActivateMainChooseOneTrashFromHandCostAlternative(
        "2 cards from your hand",
      ),
    ).toEqual({
      count: 2,
    });
  });

  it("builds reusable activate-main sequence with optional choose-one payCost and ifYouDo draw", () => {
    expect(
      buildActivateMainChooseOneTrashCostDrawSequenceEffect({
        drawCount: 2,
        fieldTrashCount: 1,
        handTrashCount: 3,
        typeName: "Revolutionary Army",
      }),
    ).toMatchObject({
      effects: [
        {
          connector: "always",
          effect: {
            cost: {
              optional: true,
              options: [
                {
                  chooser: "self",
                  count: 1,
                  filter: {
                    categories: ["character"],
                    typesAny: ["Revolutionary Army"],
                  },
                  optional: true,
                  type: "trashFromField",
                },
                {
                  chooser: "self",
                  count: 3,
                  optional: true,
                  type: "trashFromHand",
                },
              ],
              type: "chooseOne",
            },
            type: "payCost",
          },
          id: "optionalChooseOneTrashCost",
          saveResultAs: "paidOptionalChooseOneTrashCost",
        },
        {
          connector: "ifYouDo",
          effect: { count: 2, player: "self", type: "draw" },
          id: "drawAfterOptionalChooseOneTrashCost",
        },
      ],
      type: "sequence",
    });
  });

  it("builds stable effect ids that include type and count variants", () => {
    const cardId = "SUP-003F-COMPONENTS" as CardId;
    const left = parseActivateMainChooseOneTrashCostClause(
      cardId,
      "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards.",
    );
    const right = parseActivateMainChooseOneTrashCostClause(
      cardId,
      "[Activate: Main] [Once Per Turn] You may trash 1 of your {Fish-Man} type Characters or 2 cards from your hand: Draw 3 cards.",
    );

    expect(left?.effectBlock?.id).toBe(
      "SUP-003F-COMPONENTS:activate-main-once-per-turn-optional-choose-one-trash-self-field-2-navy-or-hand-1-then-draw-3",
    );
    expect(right?.effectBlock?.id).toBe(
      "SUP-003F-COMPONENTS:activate-main-once-per-turn-optional-choose-one-trash-self-field-1-fish-man-or-hand-2-then-draw-3",
    );
  });

  it("parses supported activate-main prefix and preserves unsupported residue", () => {
    const sourceText =
      "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards. Then rest 1 DON!!.";
    const residue = parseActivateMainChooseOneTrashCostResidueClause(
      "SUP-003F-COMPONENTS" as CardId,
      sourceText,
    );

    expect(residue?.prefix).toBe(
      "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards. ",
    );
    expect(residue?.clause.parserRuleId).toBe(
      "exact:activate-main:once-per-turn:optional-choose-one-trash-self-field-type-or-hand:draw-n:self",
    );
  });

  it("records activate-main residue through the production certified parser", () => {
    const prefix =
      "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards. ";
    const trailingText = "Then rest 1 DON!!.";
    const sourceText = `${prefix}${trailingText}`;

    const result = parseCertifiedCardText({
      cardId: "SUP-003F-COMPONENTS" as CardId,
      effectDefinitionsVersion: "generated-support-parser-test",
      rulesVersion: "rules-test",
      sourceText,
      sourceTextHash: "sha256:source",
    });

    expect(result).toMatchObject({
      parsedRuleIds: [
        "exact:activate-main:once-per-turn:optional-choose-one-trash-self-field-type-or-hand:draw-n:self",
      ],
      status: "partial",
      unparsedSpans: [
        { end: sourceText.length, start: prefix.length, text: trailingText },
      ],
    });
  });

  it.each([
    "[Activate: Main] You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards.",
    "[Activate: Main] [Once Per Turn] trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards.",
    "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters and 1 card from your hand: Draw 3 cards.",
    "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand Draw 3 cards.",
    "[Activate: Main] [Once Per Turn] You may trash 2 of your opponent's Characters or 1 card from your hand: Draw 3 cards.",
    "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand: K.O. 1 of your opponent's Characters.",
  ])("fails closed for unsupported variant %s", (sourceText) => {
    expect(
      parseActivateMainChooseOneTrashCostClause(
        "SUP-003F-COMPONENTS" as CardId,
        sourceText,
      ),
    ).toBeUndefined();
  });
});
