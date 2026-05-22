import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition, EffectId } from "@optcg/types";

import {
  buildCompleteParseResult,
  buildPartialParseResult,
  buildResidueSpan,
  buildSequenceEffect,
  buildUnsupportedWholeTextParseResult,
  createDeterministicParserRuleId,
  deriveParserDiagnosticDecomposition,
  parseBooleanConnectorCandidate,
  parseConditionedDrawInstructionBody,
  parseContinuousModifierInstructionBody,
  parseContinuousRestrictionInstructionBody,
  parseDrawInstructionBody,
  parseDrawThenTrashInstructionBody,
  parseExactPositiveSafeInteger,
  parseIfWrapper,
  parseOncePerTurnWrapper,
  parseQuantityComparator,
  parseReturnDonPlaySelectedFromHandInstructionBody,
  parseSelectOpponentCharacterThenKoInstructionBody,
  parseSupportedTriggerWrapper,
  parseTrashThenDrawInstructionBody,
  parseUpToCardinality,
} from "./composed-parser-builder.js";
import { isCompleteGeneratedSupportParseResult } from "./generated-support-types.js";
import { parseCertifiedCardText } from "./certified-card-text-parser.js";

const cardId = "CARD-014B-001" as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

describe("composed parser builder scaffold", () => {
  it.each([
    {
      expectedBody: "Draw 1 card.",
      expectedTrigger: { type: "onPlay" },
      sourceText: "[On Play] Draw 1 card.",
    },
    {
      expectedBody: "[Once Per Turn] Draw 2 cards.",
      expectedTrigger: { type: "whenAttacking" },
      sourceText: "[When Attacking] [Once Per Turn] Draw 2 cards.",
    },
    {
      expectedBody: "Draw 1 card.",
      expectedTrigger: { type: "trigger" },
      sourceText: "[Trigger] Draw 1 card.",
    },
    {
      expectedBody: "Draw 1 card.",
      expectedTrigger: { type: "onKO" },
      sourceText: "[On K.O.] Draw 1 card.",
    },
  ])(
    "parses existing supported trigger wrapper without broadening trigger grammar ($sourceText)",
    ({ expectedBody, expectedTrigger, sourceText }) => {
      expect(parseSupportedTriggerWrapper(sourceText)).toEqual({
        bodyText: expectedBody,
        prefix: sourceText.slice(0, sourceText.length - expectedBody.length),
        trigger: expectedTrigger,
      });
    },
  );

  it.each(["[Activate: Main] Draw 1 card.", "Draw 1 card."])(
    "rejects unsupported trigger wrapper %s",
    (sourceText) => {
      expect(parseSupportedTriggerWrapper(sourceText)).toBeUndefined();
    },
  );

  it("parses the exact once-per-turn wrapper after a supported trigger", () => {
    expect(parseOncePerTurnWrapper("[Once Per Turn] Draw 2 cards.")).toEqual({
      bodyText: "Draw 2 cards.",
      prefix: "[Once Per Turn] ",
    });
  });

  it("parses if wrappers without treating the conjunction as supported certification", () => {
    expect(
      parseIfWrapper(
        "If your Leader is multicolored and you have 5 or less cards in your hand, draw 2 cards.",
      ),
    ).toEqual({
      bodyText: "draw 2 cards.",
      conditionText:
        "your Leader is multicolored and you have 5 or less cards in your hand",
      conditions: [
        "your Leader is multicolored",
        "you have 5 or less cards in your hand",
      ],
      connector: "and",
      prefix: "If ",
    });
  });

  it("does not split comparator phrasing into boolean connectors inside if wrappers", () => {
    expect(
      parseIfWrapper("If you have 5 or less cards in your hand, draw 1 card."),
    ).toEqual({
      bodyText: "draw 1 card.",
      conditionText: "you have 5 or less cards in your hand",
      conditions: ["you have 5 or less cards in your hand"],
      prefix: "If ",
    });
  });

  it.each([
    ["up to 1", { max: 1, min: 0, text: "up to 1" }],
    ["up to 10", { max: 10, min: 0, text: "up to 10" }],
  ])("parses cardinality phrase %s", (text, expected) => {
    expect(parseUpToCardinality(text)).toEqual(expected);
  });

  it.each(["up to 0", "up to one", "select 1"])(
    "rejects unsupported cardinality phrase %s",
    (text) => {
      expect(parseUpToCardinality(text)).toBeUndefined();
    },
  );

  it.each([
    [
      "1000 power or less",
      { field: "power", op: "lte", text: "1000 power or less", value: 1000 },
    ],
    [
      "5000 power or more",
      { field: "power", op: "gte", text: "5000 power or more", value: 5000 },
    ],
    [
      "4 cost or less",
      { field: "cost", op: "lte", text: "4 cost or less", value: 4 },
    ],
  ])("parses quantity comparator phrase %s", (text, expected) => {
    expect(parseQuantityComparator(text)).toEqual(expected);
  });

  it.each(["1000 power or", "power or less", "1000 cards or less"])(
    "rejects unsupported quantity comparator phrase %s",
    (text) => {
      expect(parseQuantityComparator(text)).toBeUndefined();
    },
  );

  it("does not classify comparator or as a boolean connector", () => {
    expect(
      parseBooleanConnectorCandidate("1000 power or less"),
    ).toBeUndefined();
    expect(parseBooleanConnectorCandidate("Leader or Character")).toEqual({
      connector: "or",
      left: "Leader",
      right: "Character",
    });
  });

  it("parses reusable draw and draw/trash instruction components", () => {
    expect(parseDrawInstructionBody("Draw 2 cards.")).toEqual({
      count: 2,
      mode: "exact",
    });
    expect(parseDrawInstructionBody("Draw up to 1 card.")).toEqual({
      count: 1,
      mode: "upTo",
    });
    expect(
      parseDrawThenTrashInstructionBody(
        "Draw 2 cards and trash 1 card from your hand.",
      ),
    ).toEqual({ drawCount: 2, trashCount: 1 });
    expect(
      parseTrashThenDrawInstructionBody(
        "Trash 2 cards from your hand. Draw 1 card.",
      ),
    ).toEqual({ drawCount: 1, trashCount: 2 });
  });

  it("exposes structured external deck-rule primitive evidence via certified parser boundary", () => {
    const result = parseCertifiedCardText({
      cardId,
      effectDefinitionsVersion: "generated-support-parser-test",
      rulesVersion: "rules-test",
      sourceText:
        "Under the rules of this game, you cannot include Events with a cost of 3 or more in your deck.",
      sourceTextHash: "sha256:source",
    });

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }
    expect(result.nonRuntimeEvidence).toEqual([
      {
        categoryPlural: "Events",
        comparator: "gte",
        deckScope: "your-deck",
        nonRuntimeClassification: "external-deck-construction-rule",
        normalizedCategory: "event",
        parserRuleId: "exact:external-deck-rule:category-cost-gte-in-your-deck",
        threshold: 3,
      },
    ]);
  });

  it("composes external deck-rule plus start-of-game first sentence with Activate Main second line", () => {
    const text =
      "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.\n[Activate: Main] [Once Per Turn] You may trash 1 of your {Celestial Dragons} type Characters or 1 card from your hand: Draw 1 card.";
    const result = parseCertifiedCardText({
      cardId,
      effectDefinitionsVersion: "generated-support-parser-test",
      rulesVersion: "rules-test",
      sourceText: text,
      sourceTextHash: "sha256:source",
    });

    expect(result.status).toBe("complete");
    if (!isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected complete parse.");
    }
    expect(result.parserRuleIds).toEqual([
      "exact:external-deck-rule:category-cost-gte-in-your-deck",
      "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck",
      "exact:activate-main:once-per-turn:optional-choose-one-trash-self-field-type-or-hand:draw-n:self",
      "line-separated-effect-blocks:v1",
    ]);
  });

  it("fails closed when the start-of-game part in the first-sentence composition is unsupported", () => {
    const text =
      "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, reveal up to 1 {Mary Geoise} type Stage card from your deck.\n[Activate: Main] [Once Per Turn] You may trash 1 of your {Celestial Dragons} type Characters or 1 card from your hand: Draw 1 card.";
    const result = parseCertifiedCardText({
      cardId,
      effectDefinitionsVersion: "generated-support-parser-test",
      rulesVersion: "rules-test",
      sourceText: text,
      sourceTextHash: "sha256:source",
    });

    expect(result.status).toBe("partial");
    if (isCompleteGeneratedSupportParseResult(result)) {
      throw new Error("Expected partial parse.");
    }
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unparsed-span" }),
      ]),
    );
  });

  it("parses reusable condition and hand-selection components", () => {
    expect(
      parseConditionedDrawInstructionBody("During your turn, draw 1 card."),
    ).toEqual({ condition: "yourTurn", count: 1 });
    expect(
      parseConditionedDrawInstructionBody(
        "If this Character has 1 or more DON!! cards attached, draw 1 card.",
      ),
    ).toEqual({
      condition: "selfAttachedDonCount",
      count: 1,
      donCount: 1,
      op: "gte",
    });
    expect(
      parseReturnDonPlaySelectedFromHandInstructionBody(
        "DON!! -1: Select up to 1 Character card from your hand and play it.",
      ),
    ).toEqual({ returnDonCount: 1 });
  });

  it("parses reusable target, modifier, and restriction components", () => {
    expect(
      parseSelectOpponentCharacterThenKoInstructionBody(
        "Select 1 of your opponent's Characters. Then, K.O. that Character.",
      ),
    ).toEqual({
      cardinality: { max: 1, min: 1 },
      savedReferenceConsumer: "koThatCharacter",
      target: "opponentCharactersChoose",
    });
    expect(
      parseSelectOpponentCharacterThenKoInstructionBody(
        "Select 2 of your opponent's Characters. Then, K.O. that Character.",
      ),
    ).toBeUndefined();
    expect(
      parseContinuousModifierInstructionBody(
        "All of your opponent's Characters get -2000 power during this turn.",
      ),
    ).toEqual({
      duration: "thisTurn",
      target: "opponentCharactersAll",
      value: -2000,
    });
    expect(
      parseContinuousRestrictionInstructionBody(
        "Up to 1 of your opponent's Characters cannot block during this turn.",
      ),
    ).toEqual({
      duration: "thisTurn",
      restriction: "cannotBlock",
      target: "opponentCharactersChoose",
    });
  });

  it.each([
    "Once Per Turn Draw 2 cards.",
    "[Once per Turn] Draw 2 cards.",
    "[Once Per Turn]Draw 2 cards.",
  ])("rejects malformed once-per-turn wrapper %s", (sourceText) => {
    expect(parseOncePerTurnWrapper(sourceText)).toBeUndefined();
  });

  it.each([
    ["1", 1],
    ["2", 2],
    ["9007199254740991", 9007199254740991],
  ])("parses exact positive safe-integer count %s", (text, expected) => {
    expect(parseExactPositiveSafeInteger(text)).toBe(expected);
  });

  it.each(["0", "-1", "1.5", "01", "one", "9007199254740992"])(
    "rejects malformed count %s",
    (text) => {
      expect(parseExactPositiveSafeInteger(text)).toBeUndefined();
    },
  );

  it("builds sequence segments in connector order with unchanged generated DSL shape", () => {
    expect(
      buildSequenceEffect([
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
      ]),
    ).toEqual({
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
    });
  });

  it("creates deterministic parser rule IDs from stable parts", () => {
    expect(
      createDeterministicParserRuleId([
        "exact",
        "when-attacking",
        "once-per-turn",
        "draw-n",
        "trash-m",
        "hand",
        "self",
      ]),
    ).toBe("exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self");
  });

  it.each([
    [[], "Parser rule IDs require at least one part."],
    [["exact", "", "draw-n"], "Parser rule ID parts must be non-empty."],
    [
      ["exact", "on-play:draw-n", "self"],
      "Parser rule ID parts must not contain ':'.",
    ],
  ])("rejects ambiguous parser rule ID parts %o", (parts, message) => {
    expect(() => createDeterministicParserRuleId(parts)).toThrow(message);
  });

  it("builds residue spans from absolute offset and parsed prefix", () => {
    expect(
      buildResidueSpan({
        offset: 12,
        prefix: "[On Play] Draw 1 card. ",
        source: "[On Play] Draw 1 card. Then rest 1 DON!!.",
      }),
    ).toEqual({
      end: 53,
      start: 35,
      text: "Then rest 1 DON!!.",
    });
  });

  it("builds complete parser results with deterministic rule evidence", () => {
    const effectDefinition = {
      cardId,
      effects: [
        {
          category: "auto",
          effect: { count: 1, player: "self", type: "draw" },
          id: toEffectId("CARD-014B-001:auto-on-play-draw-1"),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "onPlay" },
        },
      ],
      implementationStatus: "implemented-dsl",
      metadata: {
        effectDefinitionsVersion: "effects-v1",
        generatedBy: "rule-parser",
        reviewer: "certified-parser-rule:CARD-014B",
        rulesVersion: "rules-v1",
        sourceTextHash: "sha256:source",
        tested: true,
      },
    } satisfies EffectDefinition;

    const result = buildCompleteParseResult({
      cardId,
      effectDefinition,
      parserRuleIds: ["exact:on-play:draw-n:self"],
      sourceText: "[On Play] Draw 1 card.",
      sourceTextHash: "sha256:source",
    });

    expect(isCompleteGeneratedSupportParseResult(result)).toBe(true);
    expect(result).toMatchObject({
      effectDefinition,
      parserRuleIds: ["exact:on-play:draw-n:self"],
      status: "complete",
    });
  });

  it("builds fail-closed partial parser results for unsupported whole text", () => {
    const result = buildUnsupportedWholeTextParseResult({
      cardId,
      sourceText: "[On Play] Draw one card.",
      sourceTextHash: "sha256:source",
    });

    expect(result).toEqual({
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
      cardId,
      parsedComponentEvidenceIds: [],
      parsedRuleIds: [],
      sourceText: "[On Play] Draw one card.",
      sourceTextHash: "sha256:source",
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

  it("builds fail-closed partial parser results for parsed text with residue", () => {
    const result = buildPartialParseResult({
      cardId,
      message: "Unsupported card text remains after certified parsing.",
      parsedRuleIds: ["exact:on-play:draw-n:self"],
      sourceText: "[On Play] Draw 1 card. Then rest 1 DON!!.",
      sourceTextHash: "sha256:source",
      unparsedSpans: [
        {
          end: 41,
          start: 23,
          text: "Then rest 1 DON!!.",
        },
      ],
    });

    expect(isCompleteGeneratedSupportParseResult(result)).toBe(false);
    expect(result).toEqual({
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
      cardId,
      parsedComponentEvidenceIds: ["on-play-draw"],
      parsedRuleIds: ["exact:on-play:draw-n:self"],
      sourceText: "[On Play] Draw 1 card. Then rest 1 DON!!.",
      sourceTextHash: "sha256:source",
      status: "partial",
      unparsedSpans: [
        {
          end: 41,
          start: 23,
          text: "Then rest 1 DON!!.",
        },
      ],
    });
  });

  it("derives reusable trace components for EB02-027-style bottom-deck text without certifying support", () => {
    const sourceText =
      "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.";

    expect(deriveParserDiagnosticDecomposition(sourceText, sourceText)).toEqual(
      {
        recognizedActionCandidates: ["place at the bottom of the owner's deck"],
        recognizedSyntaxFragments: [
          "trigger-wrapper:onPlay",
          "cardinality:up-to",
          "target:opponent-characters",
          "predicate:quantity-comparator",
          "destination:owner-deck-bottom",
        ],
        recognizedTriggerCandidates: ["[On Play]"],
        reason:
          "Parser components were recognized, but the complete action/destination shape is not certified with existing schema and runtime capability evidence; generated support remains fail-closed.",
        traceComponents: [
          {
            kind: "trigger",
            status: "recognized",
            text: "[On Play]",
          },
          {
            kind: "cardinality",
            status: "recognized",
            text: "up to 1",
          },
          {
            kind: "target",
            status: "recognized",
            text: "your opponent's Characters",
          },
          {
            kind: "predicate",
            status: "recognized",
            text: "1000 power or less",
          },
          {
            kind: "action",
            status: "recognized",
            text: "place at the bottom of the owner's deck",
          },
          {
            kind: "destination",
            status: "unsupported",
            text: "bottom of the owner's deck",
          },
        ],
        unsupportedConditionFragments: [],
        unsupportedSyntaxFragments: ["action/destination:bottom-of-owner-deck"],
      },
    );
  });

  it("derives conditional decomposition with supported components while remaining fail-closed before CARD-019B", () => {
    const sourceText =
      "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand, draw 2 cards.";

    expect(deriveParserDiagnosticDecomposition(sourceText, sourceText)).toEqual(
      {
        recognizedActionCandidates: ["draw 2 cards"],
        recognizedSyntaxFragments: [
          "if-conditional-wrapper",
          "condition-components:v1",
        ],
        recognizedTriggerCandidates: ["[On Play]"],
        reason:
          "Conditional wrapper and supported condition components were recognized, but conditional generated support remains fail-closed until CARD-019B admits conditional runtime capability evidence.",
        traceComponents: [
          {
            kind: "trigger",
            status: "recognized",
            text: "[On Play]",
          },
          { kind: "wrapper", status: "recognized", text: "If" },
          {
            id: "condition:leaderColorCount:self:gte:2",
            kind: "condition",
            span: {
              end: 27,
              start: 0,
              text: "your Leader is multicolored",
            },
            status: "supported",
            text: "your Leader is multicolored",
          },
          {
            id: "condition-connector:and:28-31",
            kind: "condition-connector",
            span: {
              end: 31,
              start: 28,
              text: "and",
            },
            status: "supported",
            text: "and",
          },
          {
            id: "condition:handCount:self:lte:5",
            kind: "condition",
            span: {
              end: 69,
              start: 32,
              text: "you have 5 or less cards in your hand",
            },
            status: "supported",
            text: "you have 5 or less cards in your hand",
          },
          {
            kind: "action",
            status: "supported",
            text: "draw 2 cards",
          },
        ],
        unsupportedConditionFragments: [],
        unsupportedSyntaxFragments: [
          "conditional-support:blocked-until-CARD-019B",
        ],
      },
    );
  });

  it("derives conditional decomposition for single supported predicate wrappers while staying fail-closed", () => {
    const sourceText =
      "[On Play] If your Leader is multicolored, draw 2 cards.";

    expect(deriveParserDiagnosticDecomposition(sourceText, sourceText)).toEqual(
      {
        recognizedActionCandidates: ["draw 2 cards"],
        recognizedSyntaxFragments: [
          "if-conditional-wrapper",
          "condition-components:v1",
        ],
        recognizedTriggerCandidates: ["[On Play]"],
        reason:
          "Conditional wrapper and supported condition components were recognized, but conditional generated support remains fail-closed until CARD-019B admits conditional runtime capability evidence.",
        traceComponents: [
          {
            kind: "trigger",
            status: "recognized",
            text: "[On Play]",
          },
          { kind: "wrapper", status: "recognized", text: "If" },
          {
            id: "condition:leaderColorCount:self:gte:2",
            kind: "condition",
            span: {
              end: 27,
              start: 0,
              text: "your Leader is multicolored",
            },
            status: "supported",
            text: "your Leader is multicolored",
          },
          {
            kind: "action",
            status: "supported",
            text: "draw 2 cards",
          },
        ],
        unsupportedConditionFragments: [],
        unsupportedSyntaxFragments: [
          "conditional-support:blocked-until-CARD-019B",
        ],
      },
    );
  });

  it("derives conditional keyword-grant decomposition while staying fail-closed for generated support", () => {
    const sourceText =
      "If your Leader is multicolored, this Character gains [Rush].";

    const decomposition = deriveParserDiagnosticDecomposition(
      sourceText,
      sourceText,
    );
    expect(decomposition?.recognizedActionCandidates).toEqual([
      "this Character gains [Rush]",
    ]);
    expect(decomposition?.recognizedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "if-conditional-wrapper",
        "condition-components:v1",
        "conditional-body-parts:ordered",
        "keyword-grant-components:v1",
      ]),
    );
    expect(decomposition?.recognizedTriggerCandidates).toEqual([]);
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "keyword-grant:keyword:rush",
          kind: "keyword",
          status: "supported",
          text: "[Rush]",
        }),
      ]),
    );
    expect(decomposition?.unsupportedConditionFragments).toEqual([]);
    expect(decomposition?.unsupportedSyntaxFragments).toEqual([
      "conditional-continuous-composition:schema-runtime-bridge-missing",
    ]);
  });

  it("derives opponent-effect field-removal protection decomposition while staying fail-closed for generated support", () => {
    const sourceText =
      "this Character cannot be removed from the field by your opponent's effects";

    expect(deriveParserDiagnosticDecomposition(sourceText, sourceText)).toEqual(
      {
        recognizedActionCandidates: [
          "this Character cannot be removed from the field by your opponent's effects",
        ],
        recognizedSyntaxFragments: [
          "protection-components:v1",
          "protection:opponent-effect-field-removal",
        ],
        recognizedTriggerCandidates: [],
        reason:
          "Opponent-effect field-removal protection components were recognized, but generated support remains fail-closed until schema/runtime bridge evidence represents this continuous protection component.",
        traceComponents: [
          {
            id: "protection:protected-object:self-character",
            kind: "target",
            span: { end: 14, start: 0, text: "this Character" },
            status: "supported",
            text: "this Character",
          },
          {
            id: "protection:removal-process:field-removal",
            kind: "action",
            span: { end: 32, start: 15, text: "cannot be removed" },
            status: "supported",
            text: "cannot be removed",
          },
          {
            id: "protection:field-zone:field",
            kind: "destination",
            span: { end: 47, start: 33, text: "from the field" },
            status: "supported",
            text: "from the field",
          },
          {
            id: "protection:source-controller:opponent",
            kind: "predicate",
            span: { end: 64, start: 51, text: "your opponent" },
            status: "supported",
            text: "your opponent",
          },
          {
            id: "protection:source-kind:effects",
            kind: "predicate",
            span: { end: 74, start: 67, text: "effects" },
            status: "supported",
            text: "effects",
          },
        ],
        unsupportedConditionFragments: [],
        unsupportedSyntaxFragments: [
          "protection:schema-runtime-bridge-missing",
        ],
      },
    );
  });

  it("derives one conditional continuous line with trash-count, protection, and keyword-grant component diagnostics", () => {
    const sourceText =
      "If you have 2 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and this Character gains [Rush].";

    const decomposition = deriveParserDiagnosticDecomposition(
      sourceText,
      sourceText,
    );

    expect(decomposition).toMatchObject({
      recognizedActionCandidates: [
        "this Character cannot be removed from the field by your opponent's effects",
        "this Character gains [Rush]",
      ],
      recognizedSyntaxFragments: [
        "if-conditional-wrapper",
        "condition-components:v1",
        "conditional-body-parts:ordered",
        "conditional-body-conjunction:and",
        "protection-components:v1",
        "protection:opponent-effect-field-removal",
        "keyword-grant-components:v1",
      ],
      recognizedTriggerCandidates: [],
      unsupportedConditionFragments: [],
      unsupportedSyntaxFragments: [
        "conditional-continuous-composition:schema-runtime-bridge-missing",
      ],
    });
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "condition:trashCount:self:gte:2",
          kind: "condition",
          span: {
            end: 41,
            start: 3,
            text: "you have 2 or more cards in your trash",
          },
          status: "supported",
          text: "you have 2 or more cards in your trash",
        }),
        expect.objectContaining({
          id: "conditional-body-connector:and:0",
          kind: "condition-connector",
          status: "supported",
          text: "and",
        }),
        expect.objectContaining({
          id: "protection:removal-process:field-removal",
          kind: "action",
          status: "supported",
          text: "cannot be removed",
        }),
        expect.objectContaining({
          id: "keyword-grant:keyword:rush",
          kind: "keyword",
          status: "supported",
          text: "[Rush]",
        }),
      ]),
    );
  });

  it("derives conditional trash-count keyword-grant diagnostics for non-Blocker allowlisted keywords", () => {
    const sourceText =
      "If your opponent has 5 or less cards in their trash, this Character gains [Banish].";
    const decomposition = deriveParserDiagnosticDecomposition(
      sourceText,
      sourceText,
    );

    expect(decomposition?.recognizedActionCandidates).toEqual([
      "this Character gains [Banish]",
    ]);
    expect(decomposition?.recognizedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "if-conditional-wrapper",
        "condition-components:v1",
        "conditional-body-parts:ordered",
        "keyword-grant-components:v1",
      ]),
    );
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "condition:trashCount:opponent:lte:5",
          kind: "condition",
          status: "supported",
        }),
        expect.objectContaining({
          id: "keyword-grant:keyword:banish",
          kind: "keyword",
          status: "supported",
          text: "[Banish]",
        }),
      ]),
    );
    expect(decomposition?.unsupportedSyntaxFragments).toEqual([
      "conditional-continuous-composition:schema-runtime-bridge-missing",
    ]);
  });

  it("derives shared-subject keyword grants after protection conjunctions", () => {
    const sourceText =
      "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].";

    const decomposition = deriveParserDiagnosticDecomposition(
      sourceText,
      sourceText,
    );

    expect(decomposition).toMatchObject({
      recognizedActionCandidates: [
        "this Character cannot be removed from the field by your opponent's effects",
        "gains [Blocker]",
      ],
      recognizedSyntaxFragments: [
        "if-conditional-wrapper",
        "condition-components:v1",
        "conditional-body-parts:ordered",
        "conditional-body-conjunction:and",
        "protection-components:v1",
        "protection:opponent-effect-field-removal",
        "keyword-grant-components:v1",
      ],
      unsupportedSyntaxFragments: [
        "conditional-continuous-composition:schema-runtime-bridge-missing",
      ],
    });
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "condition:trashCount:self:gte:7",
          kind: "condition",
          status: "supported",
          text: "you have 7 or more cards in your trash",
        }),
        expect.objectContaining({
          id: "keyword-grant:verb:gains",
          kind: "action",
          span: { end: 127, start: 122, text: "gains" },
          status: "supported",
          text: "gains",
        }),
        expect.objectContaining({
          id: "keyword-grant:keyword:blocker",
          kind: "keyword",
          span: { end: 137, start: 128, text: "[Blocker]" },
          status: "supported",
          text: "[Blocker]",
        }),
      ]),
    );
  });

  it("keeps shared-subject composition fail-closed for unsupported keyword tokens", () => {
    const sourceText =
      "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Triple Attack].";

    const decomposition = deriveParserDiagnosticDecomposition(
      sourceText,
      sourceText,
    );

    expect(decomposition).toMatchObject({
      recognizedActionCandidates: [
        "this Character cannot be removed from the field by your opponent's effects",
      ],
      recognizedSyntaxFragments: [
        "if-conditional-wrapper",
        "condition-components:v1",
        "conditional-body-parts:ordered",
        "conditional-body-conjunction:and",
        "protection-components:v1",
        "protection:opponent-effect-field-removal",
      ],
    });
    expect(decomposition?.recognizedSyntaxFragments).not.toContain(
      "keyword-grant-components:v1",
    );
    expect(decomposition?.unsupportedSyntaxFragments).toEqual(
      expect.arrayContaining([
        "keyword-grant-fragment:unsupported",
        "conditional-continuous-composition:unsupported-body-fragment",
      ]),
    );
    expect(decomposition?.traceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "conditional-body-part:1",
          kind: "action",
          status: "unsupported",
          text: "gains [Triple Attack]",
        }),
      ]),
    );
  });
});
