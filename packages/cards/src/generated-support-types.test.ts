import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition, EffectId } from "@optcg/types";

import {
  generatedSupportParserResultStatuses,
  isCompleteGeneratedSupportParseResult,
  type GeneratedSupportBlocker,
  type GeneratedSupportParserResult,
  type GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";

const cardId = "CARD-008A-001" as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

const effectDefinition: EffectDefinition = {
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      category: "auto",
      effect: { count: 1, player: "self", type: "draw" },
      id: toEffectId("CARD-008A-001:auto-on-play-draw-1"),
      trigger: { type: "onPlay" },
    },
  ],
  metadata: {
    effectDefinitionsVersion: "generated-support-test",
    generatedBy: "rule-parser",
    rulesVersion: "rules-test",
    sourceTextHash: "sha256:source",
    tested: true,
  },
};

describe("generated support parser result contracts", () => {
  it("enumerates every fail-closed parser outcome required by the spec", () => {
    expect(generatedSupportParserResultStatuses).toEqual([
      "complete",
      "partial",
      "unsupportedPrimitive",
      "ambiguousWording",
      "staleHash",
      "customHandlerRequired",
    ]);
  });

  it("distinguishes complete parse output from every unsupported result", () => {
    const complete = {
      cardId,
      effectDefinition,
      parserRuleIds: ["exact:on-play:draw-1:self"],
      sourceText: "[On Play] Draw 1 card.",
      sourceTextHash: "sha256:source",
      status: "complete",
    } satisfies GeneratedSupportParserResult;

    const blocker = {
      code: "unparsed-span",
      message: "Unsupported remaining card text.",
      span: { end: 42, start: 27, text: "Then do a thing." },
    } satisfies GeneratedSupportBlocker;

    const partial = {
      blockers: [blocker],
      cardId,
      parsedRuleIds: ["exact:on-play:draw-1:self"],
      sourceText: "[On Play] Draw 1 card. Then do a thing.",
      sourceTextHash: "sha256:source",
      status: "partial",
      unparsedSpans: [blocker.span],
    } satisfies GeneratedSupportParserResult;

    expect(isCompleteGeneratedSupportParseResult(complete)).toBe(true);
    expect(isCompleteGeneratedSupportParseResult(partial)).toBe(false);
  });

  it("records blocker evidence for unsupported primitive, ambiguity, stale hash, and custom handler outcomes", () => {
    const unparsedSpan = {
      end: 25,
      start: 0,
      text: "[Activate: Main] Rest 2 DON!!",
    } satisfies GeneratedSupportUnparsedSpan;

    const results = [
      {
        blockers: [
          {
            code: "unsupported-primitive",
            component: "cost:restDon",
            message: "Generated support cannot certify this cost yet.",
          },
        ],
        cardId,
        sourceText: unparsedSpan.text,
        sourceTextHash: "sha256:source",
        status: "unsupportedPrimitive",
      },
      {
        blockers: [
          {
            code: "ambiguous-wording",
            message: "The target scope is ambiguous.",
            parserRuleId: "candidate:ambiguous-target",
          },
        ],
        cardId,
        sourceText: "K.O. up to 1 of your opponent's Characters.",
        sourceTextHash: "sha256:source",
        status: "ambiguousWording",
      },
      {
        blockers: [
          {
            code: "stale-hash",
            expectedHash: "sha256:old",
            message: "Poneglyph text hash changed.",
            receivedHash: "sha256:new",
          },
        ],
        cardId,
        sourceText: "[On Play] Draw 1 card.",
        sourceTextHash: "sha256:new",
        status: "staleHash",
      },
      {
        blockers: [
          {
            code: "custom-handler-required",
            component: "bespoke-ruling",
            message: "The effect requires reviewed custom handler support.",
          },
        ],
        cardId,
        sourceText: "This card has bespoke behavior.",
        sourceTextHash: "sha256:source",
        status: "customHandlerRequired",
      },
    ] satisfies readonly GeneratedSupportParserResult[];

    expect(results.map((result) => result.status)).toEqual([
      "unsupportedPrimitive",
      "ambiguousWording",
      "staleHash",
      "customHandlerRequired",
    ]);
    expect(results.every((result) => result.blockers.length > 0)).toBe(true);
  });
});
