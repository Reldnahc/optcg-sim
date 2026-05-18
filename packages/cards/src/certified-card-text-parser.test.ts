import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition, EffectId } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import { isCompleteGeneratedSupportParseResult } from "./generated-support-types.js";

const cardId = "CARD-008B-001" as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

const parse = (sourceText: string) =>
  parseCertifiedCardText({
    cardId,
    effectDefinitionsVersion: "generated-support-parser-test",
    rulesVersion: "rules-test",
    sourceText,
    sourceTextHash: "sha256:source",
  });

describe("certified card text parser", () => {
  it("parses the exact On Play draw template to generated DSL", () => {
    const result = parse("[On Play] Draw 1 card.");

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual(["exact:on-play:draw-n:self"]);
    expect(result.effectDefinition).toMatchObject({
      cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          category: "auto",
          effect: { count: 1, player: "self", type: "draw" },
          id: toEffectId("CARD-008B-001:auto-on-play-draw-1"),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "onPlay" },
        },
      ],
      metadata: {
        effectDefinitionsVersion: "generated-support-parser-test",
        generatedBy: "rule-parser",
        reviewer: "certified-parser-rule:CARD-009B",
        rulesVersion: "rules-test",
        sourceTextHash: "sha256:source",
        tested: true,
      },
    } satisfies Partial<EffectDefinition>);
  });

  it("parses On Play draw with count 3 to generated DSL", () => {
    const result = parse("[On Play] Draw 3 cards.");

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual(["exact:on-play:draw-n:self"]);
    expect(result.effectDefinition.effects).toEqual([
      {
        category: "auto",
        effect: { count: 3, player: "self", type: "draw" },
        id: toEffectId("CARD-008B-001:auto-on-play-draw-3"),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      },
    ]);
  });

  it("parses the exact On Play optional draw effect template to generated DSL", () => {
    const result = parse("[On Play] You may draw 1 card.");

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual([
      "exact:on-play:optional-effect:draw-1:self",
    ]);
    expect(result.effectDefinition.effects).toEqual([
      {
        category: "auto",
        effect: { count: 1, player: "self", type: "draw" },
        id: toEffectId("CARD-008B-001:auto-on-play-optional-draw-1"),
        optional: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      },
    ]);
    expect(result.effectDefinition.effects[0]?.effect).not.toHaveProperty(
      "optional",
    );
  });

  it.each([
    {
      expectedEffectId: "CARD-008B-001:auto-on-play-your-turn-draw-1",
      expectedParserRuleId: "exact:condition:your-turn",
      expectedCondition: { type: "yourTurn" },
      sourceText: "[On Play] During your turn, draw 1 card.",
    },
    {
      expectedEffectId:
        "CARD-008B-001:auto-on-play-self-attached-don-count-gte-1-draw-1",
      expectedParserRuleId: "exact:condition:self-attached-don-count",
      expectedCondition: {
        op: "gte",
        target: { type: "self" },
        type: "attachedDonCount",
        value: 1,
      },
      sourceText:
        "[On Play] If this Character has 1 or more DON!! cards attached, draw 1 card.",
    },
  ])(
    "parses exact conditioned On Play draw template to block-level condition ($sourceText)",
    ({
      expectedCondition,
      expectedEffectId,
      expectedParserRuleId,
      sourceText,
    }) => {
      const result = parse(sourceText);

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete parse.");
      }

      expect(result.parserRuleIds).toEqual([expectedParserRuleId]);
      expect(result.effectDefinition.effects).toEqual([
        {
          category: "auto",
          condition: expectedCondition,
          effect: { count: 1, player: "self", type: "draw" },
          id: toEffectId(expectedEffectId),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "onPlay" },
        },
      ]);
      expect(result.effectDefinition.effects[0]).not.toHaveProperty(
        "conditionTiming",
      );
      expect(result.effectDefinition.effects[0]?.effect).not.toHaveProperty(
        "type",
        "conditional",
      );
    },
  );

  it.each([
    {
      expectedParserRuleId: "exact:on-play:optional-effect:draw-1:self",
      prefix: "[On Play] You may draw 1 card. ",
    },
    {
      expectedParserRuleId: "exact:condition:your-turn",
      prefix: "[On Play] During your turn, draw 1 card. ",
    },
    {
      expectedParserRuleId: "exact:condition:self-attached-don-count",
      prefix:
        "[On Play] If this Character has 1 or more DON!! cards attached, draw 1 card. ",
    },
  ])(
    "records residue after exact CARD-014F template $expectedParserRuleId",
    ({ expectedParserRuleId, prefix }) => {
      const trailingText = "Then rest 1 DON!!.";
      const sourceText = `${prefix}${trailingText}`;
      const result = parse(sourceText);

      expect(result.status).toBe("partial");
      if (result.status !== "partial") {
        throw new Error("Expected CARD-014F residue to produce partial parse.");
      }
      if (isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected CARD-014F residue to fail closed.");
      }

      expect(result.parsedRuleIds).toEqual([expectedParserRuleId]);
      expect(result.unparsedSpans).toEqual([
        {
          end: sourceText.length,
          start: prefix.length,
          text: trailingText,
        },
      ]);
      expect(result.blockers).toEqual([
        {
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
          span: {
            end: sourceText.length,
            start: prefix.length,
            text: trailingText,
          },
        },
      ]);
    },
  );

  it("prefers the longest CARD-014G exact prefix before recording unsupported residue", () => {
    const text =
      "[On Play] Select 1 of your opponent's Characters. Then, K.O. that Character. Then rest 1 DON!!.";
    const result = parse(text);

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
          span: {
            end: text.length,
            start: 77,
            text: "Then rest 1 DON!!.",
          },
        },
      ],
      parsedRuleIds: [
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
      ],
      unparsedSpans: [
        {
          end: text.length,
          start: 77,
          text: "Then rest 1 DON!!.",
        },
      ],
    });
  });

  it.each([
    { count: 1, sourceText: "[On Play] Draw up to 1 card." },
    { count: 3, sourceText: "[On Play] Draw up to 3 cards." },
  ])(
    "parses the exact On Play draw-up-to template to generated DSL ($sourceText)",
    ({ count, sourceText }) => {
      const result = parse(sourceText);

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete parse.");
      }

      expect(result.parserRuleIds).toEqual(["exact:on-play:draw-up-to-n:self"]);
      expect(result.effectDefinition.effects).toEqual([
        {
          category: "auto",
          effect: { count, player: "self", type: "drawUpTo" },
          id: toEffectId(
            `CARD-008B-001:auto-on-play-draw-up-to-${String(count)}`,
          ),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "onPlay" },
        },
      ]);
    },
  );

  it("parses standalone When Attacking draw with count 2 to generated DSL", () => {
    const result = parse("[When Attacking] Draw 2 cards.");

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual(["exact:when-attacking:draw-n:self"]);
    expect(result.effectDefinition.effects).toEqual([
      {
        category: "auto",
        effect: { count: 2, player: "self", type: "draw" },
        id: toEffectId("CARD-008B-001:auto-when-attacking-draw-2"),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "whenAttacking" },
      },
    ]);
  });

  it.each([
    {
      expectedEffectId: "CARD-008B-001:auto-on-play-draw-2-then-trash-1",
      expectedParserRuleIds: ["exact:on-play:draw-n:trash-m:hand:self"],
      hasOncePerTurn: false,
      sourceText: "[On Play] Draw 2 cards and trash 1 card from your hand.",
      trigger: { type: "onPlay" },
    },
    {
      expectedEffectId: "CARD-008B-001:auto-when-attacking-draw-2-then-trash-1",
      expectedParserRuleIds: ["exact:when-attacking:draw-n:trash-m:hand:self"],
      hasOncePerTurn: false,
      sourceText:
        "[When Attacking] Draw 2 cards and trash 1 card from your hand.",
      trigger: { type: "whenAttacking" },
    },
    {
      expectedEffectId:
        "CARD-008B-001:auto-when-attacking-once-per-turn-draw-2-then-trash-1",
      expectedParserRuleIds: [
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ],
      hasOncePerTurn: true,
      sourceText:
        "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
      trigger: { type: "whenAttacking" },
    },
  ])(
    "parses exact draw-then-trash templates to generated DSL ($sourceText)",
    ({
      expectedEffectId,
      expectedParserRuleIds,
      hasOncePerTurn,
      sourceText,
      trigger,
    }) => {
      const result = parse(sourceText);

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete parse.");
      }

      expect(result.parserRuleIds).toEqual(expectedParserRuleIds);
      expect(result.effectDefinition.effects).toHaveLength(1);
      expect(result.effectDefinition.effects[0]).toMatchObject({
        category: "auto",
        effect: {
          effects: [
            {
              connector: "always",
              effect: { count: 2, player: "self", type: "draw" },
            },
            {
              connector: "then",
              effect: {
                chooser: "self",
                count: 1,
                player: "self",
                type: "trashFromHand",
              },
            },
          ],
          type: "sequence",
        },
        id: toEffectId(expectedEffectId),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger,
      });
      const effectBlock = result.effectDefinition.effects[0];
      if (hasOncePerTurn) {
        expect(effectBlock).toMatchObject({ oncePerTurn: true });
      } else {
        expect(effectBlock).not.toHaveProperty("oncePerTurn");
      }
    },
  );

  it("parses the exact On Play trash-then-draw template to generated DSL", () => {
    const result = parse(
      "[On Play] Trash 2 cards from your hand. Draw 1 card.",
    );

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual([
      "exact:on-play:trash-2-from-hand:draw-1:self",
    ]);
    expect(result.effectDefinition.effects).toEqual([
      {
        category: "auto",
        effect: {
          effects: [
            {
              connector: "always",
              effect: {
                chooser: "self",
                count: 2,
                player: "self",
                type: "trashFromHand",
              },
            },
            {
              connector: "then",
              effect: { count: 1, player: "self", type: "draw" },
            },
          ],
          type: "sequence",
        },
        id: toEffectId("CARD-008B-001:auto-on-play-trash-2-then-draw-1"),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      },
    ]);
  });

  it("parses the exact On Play return-DON hand-selection play-from-hand template to generated DSL", () => {
    const result = parse(
      "[On Play] DON!! -1: Select up to 1 Character card from your hand and play it.",
    );

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual([
      "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
    ]);
    expect(result.effectDefinition.effects).toEqual([
      {
        category: "auto",
        effect: {
          effects: [
            {
              connector: "always",
              effect: {
                cost: { count: 1, optional: true, type: "returnDon" },
                type: "payCost",
              },
              saveResultAs: "paidReturnDonCost",
            },
            {
              connector: "ifYouDo",
              effect: {
                chooser: "self",
                filter: { categories: ["character"] },
                max: 1,
                min: 0,
                player: "self",
                saveAs: "handSelection:playableCharacter",
                type: "selectCards",
                visibility: "chooserOnly",
                zone: "hand",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                enterRested: true,
                ignoreCost: true,
                selection: "handSelection:playableCharacter",
                type: "playSelected",
              },
            },
          ],
          type: "sequence",
        },
        id: toEffectId(
          "CARD-008B-001:auto-on-play-return-don-1-play-selected-character-from-hand",
        ),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      },
    ]);
  });

  it("fails closed on near-miss wording", () => {
    const result = parse("[On Play] Draw one card.");

    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Card text is not covered by certified parser rules.",
          span: {
            end: 24,
            start: 0,
            text: "[On Play] Draw one card.",
          },
        },
      ],
      status: "partial",
      unparsedSpans: [
        {
          end: 24,
          start: 0,
          text: "[On Play] Draw one card.",
        },
      ],
    });
  });

  it.each([
    "[On Play] Draw 1 cards.",
    "[On Play] Draw 2 card.",
    "[When Attacking] Draw 1 cards.",
    "[When Attacking] Draw 2 card.",
  ])("fails closed on singular/plural mismatch (%s)", (text) => {
    const result = parse(text);

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Card text is not covered by certified parser rules.",
          span: {
            end: text.length,
            start: 0,
            text,
          },
        },
      ],
      unparsedSpans: [
        {
          end: text.length,
          start: 0,
          text,
        },
      ],
    });
  });

  it("records unparsed residue when an exact supported clause has unsupported leftover text", () => {
    const result = parse("[On Play] Draw 1 card. Then rest 1 DON!!.");

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
          span: {
            end: 41,
            start: 23,
            text: "Then rest 1 DON!!.",
          },
        },
      ],
      parsedRuleIds: ["exact:on-play:draw-n:self"],
      unparsedSpans: [
        {
          end: 41,
          start: 23,
          text: "Then rest 1 DON!!.",
        },
      ],
    });
  });

  it("composes the exact line-separated On Play and When Attacking templates into two EffectBlocks", () => {
    const result = parse(
      "[On Play] Draw 1 card.\n[When Attacking] Draw 2 cards.",
    );

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual([
      "exact:on-play:draw-n:self",
      "exact:when-attacking:draw-n:self",
      "line-separated-effect-blocks:v1",
    ]);
    expect(result.effectDefinition.effects).toEqual([
      {
        category: "auto",
        effect: { count: 1, player: "self", type: "draw" },
        id: toEffectId("CARD-008B-001:auto-on-play-draw-1"),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      },
      {
        category: "auto",
        effect: { count: 2, player: "self", type: "draw" },
        id: toEffectId("CARD-008B-001:auto-when-attacking-draw-2"),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "whenAttacking" },
      },
    ]);
  });

  it.each([
    "[On Play] Draw 0 cards.",
    "[On Play] Draw -1 cards.",
    "[On Play] Draw 1.5 cards.",
    "[On Play] Draw 01 card.",
    "[On Play] Draw one card.",
    "[On Play] Draw 9007199254740992 cards.",
    "[When Attacking] Draw 0 cards.",
    "[When Attacking] Draw -1 cards.",
    "[When Attacking] Draw 1.5 cards.",
    "[When Attacking] Draw 0002 cards.",
    "[When Attacking] Draw two cards.",
    "[When Attacking] Draw 9007199254740992 cards.",
    "[On Play] Draw cards.",
    "[When Attacking] Draw 2cards.",
    "[On Play] Draw 1 card and trash 0 cards from your hand.",
    "[On Play] Draw 01 card and trash 1 card from your hand.",
    "[On Play] Draw 1 card and trash one card from your hand.",
    "[When Attacking] Draw 2 cards and trash 00 cards from your hand.",
    "[When Attacking] Draw two cards and trash 1 card from your hand.",
    "[When Attacking] Draw 9007199254740992 cards and trash 1 card from your hand.",
    "[On Play] Draw 1 card and trash 9007199254740992 cards from your hand.",
    "[On Play] Trash 0 cards from your hand. Draw 1 card.",
    "[On Play] Trash 02 cards from your hand. Draw 1 card.",
    "[On Play] Trash two cards from your hand. Draw 1 card.",
    "[On Play] Trash 2 cards from your hand. Draw 01 card.",
    "[On Play] Trash 2 cards from your hand. Draw one card.",
    "[On Play] Trash 9007199254740992 cards from your hand. Draw 1 card.",
    "[On Play] Draw up to 0 cards.",
    "[On Play] Draw up to -1 cards.",
    "[On Play] Draw up to 1.5 cards.",
    "[On Play] Draw up to 01 card.",
    "[On Play] Draw up to one card.",
    "[On Play] Draw up to 9007199254740992 cards.",
    "[On Play] Draw up to cards.",
    "[On Play] DON!! -0: Select up to 1 Character card from your hand and play it.",
    "[On Play] DON!! -01: Select up to 1 Character card from your hand and play it.",
    "[On Play] DON!! -1.5: Select up to 1 Character card from your hand and play it.",
    "[On Play] DON!! -one: Select up to 1 Character card from your hand and play it.",
  ])("fails closed on invalid draw count wording (%s)", (text) => {
    const result = parse(text);

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          span: {
            end: text.length,
            start: 0,
            text,
          },
        },
      ],
      unparsedSpans: [
        {
          end: text.length,
          start: 0,
          text,
        },
      ],
    });
  });

  it.each([
    "[On Play] You may draw 2 cards.",
    "[On Play] You may draw 1 card and trash 1 card from your hand.",
    "[On Play] If you do, draw 1 card.",
    "[On Play] Draw 1 card. If you do, trash 1 card from your hand.",
    "[On Play] DON!! -1: You may draw 1 card.",
    "[On Play] DON!! -1 You may draw 1 card.",
    "[On Play] You may instead draw 1 card.",
    "[On Play] During your opponent's turn, draw 1 card.",
    "[On Play] If you have 1 or more cards in your hand, draw 1 card.",
    "[On Play] If you have 1 or more Life cards, draw 1 card.",
    "[On Play] If you have 1 or more Characters, draw 1 card.",
    "[On Play] If this Character is rested, draw 1 card.",
    "[On Play] If this Character has 2 or more DON!! cards attached, draw 1 card.",
    "[On Play] If your Leader has 1 or more DON!! cards attached, draw 1 card.",
  ])(
    "fails closed on unsupported CARD-014F optionality and conditions (%s)",
    (text) => {
      const result = parse(text);

      expect(result.status).toBe("partial");
      if (isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected unsupported text to fail closed.");
      }
      expect(result.blockers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "unparsed-span" }),
        ]),
      );
    },
  );

  it.each([
    "[On Play] You may draw up to 2 cards.",
    "[On Play] Draw up to 2 cards from the top of your deck.",
    "[On Play] Look at up to 2 cards from the top of your deck and add 1 card to your hand.",
    "[When Attacking] Draw up to 2 cards.",
    "[On Play] [Once Per Turn] Draw up to 2 cards.",
  ])("fails closed on unsupported draw-up-to wording (%s)", (text) => {
    const result = parse(text);

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          span: {
            end: text.length,
            start: 0,
            text,
          },
        },
      ],
      unparsedSpans: [
        {
          end: text.length,
          start: 0,
          text,
        },
      ],
    });
  });

  it("records unparsed residue after the exact On Play draw-up-to template", () => {
    const result = parse("[On Play] Draw up to 2 cards. Then rest 1 DON!!.");

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
          span: {
            end: 48,
            start: 30,
            text: "Then rest 1 DON!!.",
          },
        },
      ],
      parsedRuleIds: ["exact:on-play:draw-up-to-n:self"],
      unparsedSpans: [
        {
          end: 48,
          start: 30,
          text: "Then rest 1 DON!!.",
        },
      ],
    });
  });

  it.each([
    "[On Play] Trash 1 card from your hand and draw 2 cards.",
    "[On Play] You may trash 2 cards from your hand. Draw 1 card.",
    "[On Play] DON!! -1 Trash 2 cards from your hand. Draw 1 card.",
    "[On Play]: Trash 2 cards from your hand. Draw 1 card.",
    "[On Play] Trash 1 card from your hand. Draw 1 card.",
    "[On Play] Trash 2 cards from your hand. Draw 2 cards.",
    "[When Attacking] [Once Per Turn] Trash 1 card from your hand and draw 2 cards.",
    "[On K.O.] Draw 2 cards and trash 1 card from your hand.",
    "[When Attacking] You may draw 2 cards and trash 1 card from your hand.",
  ])(
    "fails closed on unsupported draw-then-trash wrappers/order/residue (%s)",
    (text) => {
      const result = parse(text);

      expect(result.status).toBe("partial");
      expect(result).toMatchObject({
        blockers: [
          {
            code: "unparsed-span",
            span: {
              end: text.length,
              start: 0,
              text,
            },
          },
        ],
        unparsedSpans: [
          {
            end: text.length,
            start: 0,
            text,
          },
        ],
      });
    },
  );

  it.each([
    "[On Play] DON!! -1: Select up to 1 Stage card from your hand and play it.",
    "[On Play] DON!! -1: Select up to 1 Event card from your hand and play it.",
    "[On Play] DON!! -1: Select up to 2 Character cards from your hand and play them.",
    "[On Play] DON!! -1: Select 1 Character card from your hand and play it.",
    "[On Play] DON!! -1: Select up to 1 Character card from your trash and play it.",
    "[On Play] Return 1 DON!!: Select up to 1 Character card from your hand and play it.",
    "[On Play] DON!! -1 Select up to 1 Character card from your hand and play it.",
    "[On Play] DON!! -1: You may select up to 1 Character card from your hand and play it.",
  ])(
    "fails closed on unsupported return-DON play-from-hand wording (%s)",
    (text) => {
      const result = parse(text);

      expect(result.status).toBe("partial");
      expect(result).toMatchObject({
        blockers: [
          {
            code: "unparsed-span",
            span: {
              end: text.length,
              start: 0,
              text,
            },
          },
        ],
        unparsedSpans: [
          {
            end: text.length,
            start: 0,
            text,
          },
        ],
      });
    },
  );

  it("captures residue after the exact return-DON hand-selection play-from-hand template", () => {
    const supportedPrefix =
      "[On Play] DON!! -1: Select up to 1 Character card from your hand and play it. ";
    const text = `${supportedPrefix}Draw 1 card.`;
    const result = parse(text);

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
          span: {
            end: text.length,
            start: supportedPrefix.length,
            text: "Draw 1 card.",
          },
        },
      ],
      parsedRuleIds: [
        "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
      ],
      unparsedSpans: [
        {
          end: text.length,
          start: supportedPrefix.length,
          text: "Draw 1 card.",
        },
      ],
    });
  });

  it("captures residue for supported draw-then-trash clause followed by unsupported text", () => {
    const text =
      "[When Attacking] Draw 2 cards and trash 1 card from your hand. Then draw 1 card.";
    const result = parse(text);

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          span: {
            end: text.length,
            start: 63,
            text: "Then draw 1 card.",
          },
        },
      ],
      parsedRuleIds: ["exact:when-attacking:draw-n:trash-m:hand:self"],
      unparsedSpans: [
        {
          end: text.length,
          start: 63,
          text: "Then draw 1 card.",
        },
      ],
    });
  });

  it.each([
    {
      name: "reversed",
      text: "[When Attacking] Draw 1 card.\n[On Play] Draw 1 card.",
    },
    {
      name: "duplicate",
      text: "[On Play] Draw 1 card.\n[On Play] Draw 1 card.",
    },
    {
      name: "extra line",
      text: "[On Play] Draw 1 card.\n[When Attacking] Draw 1 card.\n[On Play] Draw 1 card.",
    },
  ])("fails closed on non-certified $name composition", ({ text }) => {
    const result = parse(text);

    expect(result.status).toBe("partial");
    expect(isCompleteGeneratedSupportParseResult(result)).toBe(false);
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Card text is not covered by certified parser rules.",
          span: {
            end: text.length,
            start: 0,
            text,
          },
        },
      ],
      parsedRuleIds: [],
      unparsedSpans: [
        {
          end: text.length,
          start: 0,
          text,
        },
      ],
    });
  });

  it("parses standalone [Blocker] as a certified complete parse", () => {
    const result = parse("[Blocker]");

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual(["exact:keyword:blocker:standalone"]);
    expect(result.effectDefinition.implementationStatus).toBe(
      "vanilla-confirmed",
    );
    expect(result.effectDefinition.effects).toEqual([]);
  });

  it("parses [Blocker] with reminder text as a certified complete parse", () => {
    const result = parse(
      "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
    );

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }

    expect(result.parserRuleIds).toEqual(["exact:keyword:blocker:standalone"]);
    expect(result.effectDefinition.implementationStatus).toBe(
      "vanilla-confirmed",
    );
    expect(result.effectDefinition.effects).toEqual([]);
  });

  it("parses [Blocker] plus unsupported text as partial with only unsupported residue", () => {
    const text =
      "[Blocker] [Opponent's Turn] This Character gains +1000 power.";
    const result = parse(text);

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          span: {
            end: text.length,
            start: 10,
            text: "[Opponent's Turn] This Character gains +1000 power.",
          },
        },
      ],
      parsedRuleIds: ["exact:keyword:blocker:standalone"],
      unparsedSpans: [
        {
          end: text.length,
          start: 10,
          text: "[Opponent's Turn] This Character gains +1000 power.",
        },
      ],
    });
  });

  it.each([
    {
      expectedParserRuleId: "exact:keyword:rush:standalone",
      sourceText: "[Rush]",
    },
    {
      expectedParserRuleId: "exact:keyword:rush:standalone",
      sourceText:
        "[Rush] (This card can attack on the turn in which it is played.)",
    },
    {
      expectedParserRuleId: "exact:keyword:rush-character:standalone",
      sourceText: "[Rush: Character]",
    },
    {
      expectedParserRuleId: "exact:keyword:rush-character:standalone",
      sourceText:
        "[Rush: Character] (This card can attack Characters on the turn in which it is played.)",
    },
    {
      expectedParserRuleId: "exact:keyword:double-attack:standalone",
      sourceText: "[Double Attack]",
    },
    {
      expectedParserRuleId: "exact:keyword:double-attack:standalone",
      sourceText: "[Double Attack] (This card deals 2 damage.)",
    },
    {
      expectedParserRuleId: "exact:keyword:banish:standalone",
      sourceText: "[Banish]",
    },
    {
      expectedParserRuleId: "exact:keyword:banish:standalone",
      sourceText:
        "[Banish] (When this card deals damage, the target card is trashed without activating its Trigger.)",
    },
  ])(
    "parses $sourceText as a certified keyword complete parse",
    ({ expectedParserRuleId, sourceText }) => {
      const result = parse(sourceText);

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete parse.");
      }

      expect(result.parserRuleIds).toEqual([expectedParserRuleId]);
      expect(result.effectDefinition.implementationStatus).toBe(
        "vanilla-confirmed",
      );
      expect(result.effectDefinition.effects).toEqual([]);
    },
  );

  it("parses mixed Rush: Character fixture text as partial with only unsupported residue", () => {
    const text =
      "[Rush: Character] (This card can attack Characters on the turn in which it is played.)\n[On Play] Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand.";
    const result = parse(text);

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
          span: {
            end: text.length,
            start: 87,
            text: "[On Play] Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand.",
          },
        },
      ],
      parsedRuleIds: ["exact:keyword:rush-character:standalone"],
      unparsedSpans: [
        {
          end: text.length,
          start: 87,
          text: "[On Play] Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand.",
        },
      ],
    });
  });
});
