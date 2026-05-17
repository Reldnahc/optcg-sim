import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition, EffectId } from "@optcg/types";

import {
  buildCompleteParseResult,
  buildPartialParseResult,
  buildResidueSpan,
  buildSequenceEffect,
  buildUnsupportedWholeTextParseResult,
  createDeterministicParserRuleId,
  parseExactPositiveSafeInteger,
  parseOncePerTurnWrapper,
  parseSupportedTriggerWrapper,
} from "./composed-parser-builder.js";
import { isCompleteGeneratedSupportParseResult } from "./generated-support-types.js";

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

  it.each([
    "[On K.O.] Draw 1 card.",
    "[Activate: Main] Draw 1 card.",
    "Draw 1 card.",
  ])("rejects unsupported trigger wrapper %s", (sourceText) => {
    expect(parseSupportedTriggerWrapper(sourceText)).toBeUndefined();
  });

  it("parses the exact once-per-turn wrapper after a supported trigger", () => {
    expect(parseOncePerTurnWrapper("[Once Per Turn] Draw 2 cards.")).toEqual({
      bodyText: "Draw 2 cards.",
      prefix: "[Once Per Turn] ",
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
});
